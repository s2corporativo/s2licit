import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { calculateSalePrice } from "../services/pricingSafety";
import { invokeLLM, parseLlmJson } from "../_core/llm";
import { classificarCompatibilidade, ClassificacaoCompatibilidade } from "../services/matchClassification";
import { matchEditalItem, MATCH_THRESHOLD_VISIBLE, parseEditalItemText } from "../matching/productMatcher";
import { editalExtractionSystemPrompt, editalExtractionUserPrompt } from "../prompts";
import { addProposalItem, createProposal, getDb, getProductById, getProposalTemplate, loadFeedbackMap, loadSynonymMap, normalizeEditalTerm, recordFeedback, upsertRequestingOrg } from "../db";

export type TipoMarca = "livre" | "referencia" | "restrita" | "naoSei";

interface EditalExtraction {
  processo: { numero: string; modalidade: string; orgao: string; objeto: string };
  itens: Array<{
    numero: number;
    descricao: string;
    unidade: string;
    quantidade: number;
    precoUnitario: number | null;
    precoTotal: number | null;
    /** Campos complementares (opcional — compatibilidade retroativa): lote do item no edital. */
    lote?: string;
    /** Descrição exatamente como aparece no edital (texto original). */
    descricaoOriginal?: string;
    /** Código CATMAT/CATSER quando informado no edital. */
    catmatCode?: string | null;
    /** Regime de marca: livre (aceita qualquer fabricante), referencia
     *  (equivalente aceito com marca de referência citada), restrita (só a marca citada). */
    tipoMarca?: TipoMarca;
    /** Marca/fabricante de referência citado no edital, quando houver. */
    referenciaBrand?: string | null;
  }>;
}

export const EDITAL_CHUNK_SIZE = 120000;
export const EDITAL_CHUNK_OVERLAP = 3000;
export const EDITAL_MAX_CHUNKS = 5;

/**
 * Divide o texto do edital em chunks de até EDITAL_CHUNK_SIZE chars, com
 * sobreposição para reduzir o risco de cortar um item bem na fronteira.
 * Limitado a EDITAL_MAX_CHUNKS (cobre ~600.000 chars — a esmagadora maioria
 * dos editais reais); além disso, `truncated` avisa honestamente que parte
 * do documento não foi processada, em vez de simplesmente cortar em
 * silêncio como antes.
 */
export function splitEditalIntoChunks(rawText: string): { chunks: string[]; truncated: boolean } {
  const chunks: string[] = [];
  const step = EDITAL_CHUNK_SIZE - EDITAL_CHUNK_OVERLAP;
  for (let start = 0; start < rawText.length && chunks.length < EDITAL_MAX_CHUNKS; start += step) {
    chunks.push(rawText.slice(start, start + EDITAL_CHUNK_SIZE));
  }
  if (chunks.length === 0) chunks.push("");
  const coveredChars = Math.min(rawText.length, (chunks.length - 1) * step + EDITAL_CHUNK_SIZE);
  return { chunks, truncated: coveredChars < rawText.length };
}

/**
 * Mescla os resultados de N chunks extraídos independentemente: metadados
 * do processo vêm do primeiro chunk que os retornar preenchidos; itens são
 * concatenados e deduplicados por número (chunks vizinhos se sobrepõem e
 * podem extrair o mesmo item duas vezes).
 */
export function mergeEditalExtractions(extractions: EditalExtraction[]): EditalExtraction {
  const processo = extractions.find((e) => e.processo?.numero?.trim())?.processo
    ?? extractions[0]?.processo
    ?? { numero: "", modalidade: "", orgao: "", objeto: "" };

  const itensPorNumero = new Map<number, EditalExtraction["itens"][number]>();
  for (const extraction of extractions) {
    for (const item of extraction.itens ?? []) {
      if (!itensPorNumero.has(item.numero)) itensPorNumero.set(item.numero, item);
    }
  }
  const itens = [...itensPorNumero.values()].sort((a, b) => a.numero - b.numero);

  return { processo, itens };
}

const EDITAL_EXTRACTION_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "edital_extraction",
    strict: true,
    schema: {
      type: "object",
      properties: {
        processo: {
          type: "object",
          properties: {
            numero: { type: "string", description: "Número do processo ou pregão, ex: 001/2025" },
            modalidade: { type: "string", description: "Modalidade: Pregão Eletrônico, Dispensa, Concorrência, etc." },
            orgao: { type: "string", description: "Nome do órgão ou entidade requisitante" },
            objeto: { type: "string", description: "Objeto resumido da licitação" },
          },
          required: ["numero", "modalidade", "orgao", "objeto"],
          additionalProperties: false,
        },
        itens: {
          type: "array",
          items: {
            type: "object",
            properties: {
              numero: { type: "number", description: "Número sequencial do item" },
              descricao: { type: "string", description: "Descrição completa do item" },
              unidade: { type: "string", description: "Unidade de medida: UN, CX, KG, L, etc." },
              quantidade: { type: "number", description: "Quantidade solicitada" },
              precoUnitario: { type: ["number", "null"], description: "Preço unitário de referência em reais (null se não informado)" },
              precoTotal: { type: ["number", "null"], description: "Preço total estimado do item em reais (null se não informado)" },
              lote: { type: ["string", "null"], description: "Lote do item no edital, se identificado (null se não informado)" },
              descricaoOriginal: { type: ["string", "null"], description: "Descrição exatamente como escrita no edital (texto original), se diferente da descrição estruturada" },
              catmatCode: { type: ["string", "null"], description: "Código CATMAT/CATSER quando informado no edital (null se não informado)" },
              tipoMarca: { type: ["string", "null"], enum: ["livre", "referencia", "restrita", "naoSei"], description: "Regime de marca: livre (aceita qualquer fabricante), referencia (equivalente aceito com marca de referência citada), restrita (só a marca citada), naoSei (indeterminável pelo texto)" },
              referenciaBrand: { type: ["string", "null"], description: "Marca/fabricante de referência citado no edital, quando houver (null se não informado)" },
            },
            required: ["numero", "descricao", "unidade", "quantidade", "precoUnitario", "precoTotal"],
            additionalProperties: false,
          },
        },
      },
      required: ["processo", "itens"],
      additionalProperties: false,
    },
  },
};

/** Extrai processo+itens de UM trecho de texto de edital (até CHUNK_SIZE chars). */
async function extractEditalChunk(chunkText: string, isFirstChunk: boolean): Promise<EditalExtraction> {
  const llmResult = await invokeLLM({
    messages: [
      {
        role: "system",
        content: editalExtractionSystemPrompt({ isFirstChunk }),
      },
      {
        role: "user",
        content: editalExtractionUserPrompt(chunkText),
      },
    ],
    response_format: EDITAL_EXTRACTION_SCHEMA,
  });

  const rawContent = llmResult.choices?.[0]?.message?.content;
  const content = typeof rawContent === "string" ? rawContent : null;
  if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "IA não retornou resposta" });

  try {
    return parseLlmJson(content);
  } catch {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Resposta da IA inválida" });
  }
}

export const editalRouter = router({
    // Extrai texto de PDF ou DOCX (base64) e usa IA para identificar itens do edital
    extract: protectedProcedure
      .input(
        z.object({
          fileBase64: z.string().min(10),
          fileName: z.string(),
          mimeType: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        // 0. Verificar se a IA está configurada ANTES de extrair o texto — sem
        // provedor a chamada falharia depois com mensagem genérica, voltando a
        // tela ao estado inicial sem orientação clara ao usuário.
        // Verificação de custo zero: quando nenhum provedor de IA estiver
        // configurado, a chamada falharia depois com mensagem genérica e a
        // tela voltaria ao estado inicial sem orientação clara ao usuário.
        const { listConfiguredProviders } = await import("../_core/llm");
        const configured = listConfiguredProviders();
        if (configured.length === 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "A IA de análise de editais não está configurada. Acesse Administração → Central de IA e configure ao menos uma chave de provedor (Groq ou Anthropic) antes de extrair editais.",
          });
        }

        // 1. Extrair texto do arquivo (serviço compartilhado com a análise jurídica)
        const { extractDocumentText } = await import("../services/documentTextService");
        const { text: rawText } = await extractDocumentText(input);

        // 2. Editais maiores que 1 chamada são processados em chunks reais
        // (ver splitEditalIntoChunks) e os resultados mesclados.
        const { chunks, truncated } = splitEditalIntoChunks(rawText);
        const extractions = await Promise.all(chunks.map((chunk, idx) => extractEditalChunk(chunk, idx === 0)));
        const { processo, itens } = mergeEditalExtractions(extractions);

        return {
          processo,
          itens,
          totalChars: rawText.length,
          truncated,
        };
      }),

    // Para cada item do edital, busca o melhor produto do catálogo
    matchCatalog: protectedProcedure
      .input(
        z.object({
          itens: z.array(
            z.object({
              numero: z.number(),
              descricao: z.string(),
              unidade: z.string(),
              quantidade: z.number(),
              precoUnitario: z.number().nullable().optional(),
              precoTotal: z.number().nullable().optional(),
              lote: z.string().optional(),
              descricaoOriginal: z.string().optional(),
              catmatCode: z.string().nullable().optional(),
              tipoMarca: z.enum(["livre", "referencia", "restrita", "naoSei"]).optional(),
              referenciaBrand: z.string().nullable().optional(),
            })
          ).min(1).max(500),
        })
      )
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) return { matches: [] };

          const matches: Array<{
          itemNumero: number;
          itemDescricao: string;
          itemUnidade: string;
          itemQuantidade: number;
          itemPrecoUnitario: number | null;
          itemPrecoTotal: number | null;
          productId: number | null;
          productName: string | null;
          productPrice: string | null;
          productSupplier: string | null;
          productUnit: string | null;
          productConcentration: string | null;
          productPresentation: string | null;
          productActiveIngredient: string | null;
          productImageUrl: string | null;
          productUrl: string | null;
          /** Score numérico do match no engine canônico (0–1). */
          score: number | null;
          /** Faixa de uso do match segundo a §6 (Fonte Única: matchClassification). */
          classCompatibility: Extract<ClassificacaoCompatibilidade["classe"], "exata" | "equivalente" | "provavel" | "parcial" | "incompativel">;
          confidence: "high" | "medium" | "low" | "none";
          usedFeedback: boolean;
        }> = [];

        /** Monta o registro "sem match" (nenhum candidato atingiu o piso de visibilidade). */
        const noMatch = (
          item: (typeof input.itens)[number],
          score: number | null,
          usedFeedback: boolean,
        ) => ({
          itemNumero: item.numero,
          itemDescricao: item.descricao,
          itemUnidade: item.unidade,
          itemQuantidade: item.quantidade,
          itemPrecoUnitario: item.precoUnitario ?? null,
          itemPrecoTotal: item.precoTotal ?? null,
          productId: null,
          productName: null,
          productPrice: null,
          productSupplier: null,
          productUnit: null,
          productConcentration: null,
          productPresentation: null,
          productActiveIngredient: null,
          productImageUrl: null,
          productUrl: null,
          score,
          classCompatibility: "incompativel" as const,
          confidence: "none" as const,
          usedFeedback,
        });

        /** Traduz a classificação canônica (§6) para a legenda de confiança da tela. */
        const classifyConfidence = (c: ClassificacaoCompatibilidade): "high" | "medium" | "low" | "none" => {
          if (c.classe === "exata" || c.classe === "equivalente") return "high";
          if (c.classe === "provavel") return "medium";
          if (c.classe === "parcial") return "low";
          return "none";
        };

        /** Carrega candidatos por LIKE nos termos de busca (base do pré-filtro). */
        async function loadCandidates(terms: string[]): Promise<any[]> {
          const candidates: any[] = [];
          for (const term of terms) {
            const termLike = `%${term}%`;
            const [rows] = await (db as any).execute(sql`
              SELECT p.id, p.name, p.price, p.unit, p.concentration, p.presentation,
                     p.activeIngredient, p.manufacturer, p.imageUrl, p.productUrl, s.name as supplierName
              FROM products p
              LEFT JOIN suppliers s ON p.supplierId = s.id
              WHERE p.isActive = 'yes' AND p.price IS NOT NULL
              AND (p.name LIKE ${termLike} OR p.activeIngredient LIKE ${termLike})
              ORDER BY CAST(p.price AS DECIMAL(12,2)) ASC
              LIMIT 10
            `);
            const rowsArr = Array.isArray(rows) ? rows : [];
            candidates.push(...rowsArr);
          }
          const seen = new Set<number>();
          return candidates.filter((c) => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
        }

        // Carrega mapa de sinônimos e de feedback aprendido uma vez para todos os itens
        const synonymMap = await loadSynonymMap();
        const feedbackMap = await loadFeedbackMap();

        for (const item of input.itens) {
          // ── 1. Estrutura o item do edital no modelo canônico ──────────────
          const editalItem = parseEditalItemText(item.descricao);
          editalItem.unidade = item.unidade;

          // ── 2. Expande termos via sinônimos aprovados ─────────────────────
          const terms = editalItem.nome
            .split(/\s+/)
            .map((t) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, ""))
            .filter((t) => t.length >= 3);
          const expandedSet = new Set<string>(terms);
          if (terms.length === 0) {
            matches.push(noMatch(item, null, false));
            continue;
          }
          for (const tok of terms) {
            const canonicals = synonymMap.get(tok);
            if (canonicals) for (const c of canonicals) expandedSet.add(c);
          }
          const topTerms = Array.from(expandedSet).sort((a, b) => b.length - a.length).slice(0, 5);
          if (topTerms.length === 0) {
            matches.push(noMatch(item, null, false));
            continue;
          }

          // ── 3. Candidatos → engine canônico ───────────────────────────────
          const candidates = await loadCandidates(topTerms);
          const engineCandidates = candidates.map((c: any) => ({
            ...c,
            price: c.price ?? null,
            supplierName: c.supplierName ?? null,
            imageUrl: c.imageUrl ?? null,
            productUrl: c.productUrl ?? null,
          }));
          const engineResults = matchEditalItem(editalItem, engineCandidates, 5);
          const learnedItemId = feedbackMap.get(normalizeEditalTerm(item.descricao))?.productId;
          // Boost de aprendizado: +0.60 para pares já confirmados anteriormente (fonte: feedbackMap),
          // aplicado sobre o score canônico e limitado a 1.
          const withBoost = engineResults.map((r) => ({
            ...r,
            boostedScore: Math.min(1, r.score + (learnedItemId === r.product.id ? 0.6 : 0)),
          })).sort((a, b) => b.boostedScore - a.boostedScore);

          // ── 4. Decisão e classificação canônicas (§6) ─────────────────────
          const best = withBoost.length > 0 && withBoost[0].boostedScore >= MATCH_THRESHOLD_VISIBLE ? withBoost[0] : null;
          if (!best) {
            matches.push(noMatch(item, null, false));
            continue;
          }
          const classification = classificarCompatibilidade(best.boostedScore);
          const classe: "exata" | "equivalente" | "provavel" | "parcial" | "incompativel" =
            classification.classe === "nao_encontrado" || classification.classe === "indisponivel"
              ? "incompativel"
              : classification.classe;
          const confidence = classifyConfidence(classification);

          matches.push({
            itemNumero: item.numero, itemDescricao: item.descricao,
            itemUnidade: item.unidade, itemQuantidade: item.quantidade,
            itemPrecoUnitario: item.precoUnitario ?? null,
            itemPrecoTotal: item.precoTotal ?? null,
            productId: best.product.id, productName: best.product.name, productPrice: best.product.price ?? null,
            productSupplier: best.product.supplierName ?? null, productUnit: best.product.unit ?? null,
            productConcentration: best.product.concentration ?? null, productPresentation: best.product.presentation ?? null,
            productActiveIngredient: best.product.activeIngredient ?? null,
            productImageUrl: best.product.imageUrl ?? null, productUrl: best.product.productUrl ?? null,
            score: best.boostedScore,
            classCompatibility: classe,
            confidence,
            usedFeedback: learnedItemId === best.product.id,
          });
        }
        return { matches };
      }),

    // Valida integridade dos itens antes de criar a proposta
    // Verifica se os productIds ainda existem no banco e retorna divergências
    validateItems: protectedProcedure
      .input(
        z.object({
          itens: z.array(
            z.object({
              itemNumero: z.number(),
              itemDescricao: z.string(),
              productId: z.number().nullable(),
              productName: z.string().nullable(),
              productPrice: z.string().nullable(),
            })
          ).min(1),
        })
      )
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
        const divergencias: Array<{
          itemNumero: number;
          tipo: "produto_nao_encontrado" | "preco_alterado" | "produto_inativo";
          descricao: string;
          valorAnterior?: string;
          valorAtual?: string;
        }> = [];
        for (const item of input.itens) {
          if (!item.productId) continue;
          const dbProduct = await getProductById(item.productId);
          if (!dbProduct) {
            divergencias.push({
              itemNumero: item.itemNumero,
              tipo: "produto_nao_encontrado",
              descricao: `Produto "${item.productName}" (ID ${item.productId}) não encontrado no catálogo`,
            });
            continue;
          }
          if (dbProduct.isActive !== "yes") {
            divergencias.push({
              itemNumero: item.itemNumero,
              tipo: "produto_inativo",
              descricao: `Produto "${dbProduct.name}" está inativo no catálogo`,
            });
          }
          if (item.productPrice && dbProduct.price) {
            const matchPrice = parseFloat(item.productPrice);
            const dbPrice = parseFloat(String(dbProduct.price));
            const diffPct = Math.abs(dbPrice - matchPrice) / matchPrice * 100;
            if (diffPct > 0.01) { // mais de 0.01% de diferença
              divergencias.push({
                itemNumero: item.itemNumero,
                tipo: "preco_alterado",
                descricao: `Preço do produto "${dbProduct.name}" foi atualizado no catálogo`,
                valorAnterior: `R$ ${matchPrice.toFixed(2)}`,
                valorAtual: `R$ ${dbPrice.toFixed(2)}`,
              });
            }
          }
        }
        return { ok: divergencias.length === 0, divergencias };
      }),

    // Cria proposta comercial a partir dos itens do edital com matches do catálogo
    createProposal: protectedProcedure
      .input(
        z.object({
          processo: z.object({
            numero: z.string(),
            modalidade: z.string(),
            orgao: z.string(),
            objeto: z.string(),
          }),
          marginPercent: z.number().min(0).max(99.99).default(30),
          reviewConfirmed: z.literal(true),
          templateId: z.number().optional(),
          itens: z.array(
            z.object({
              itemNumero: z.number(),
              itemDescricao: z.string(),
              itemUnidade: z.string(),
              itemQuantidade: z.number(),
              productId: z.number().nullable(),
              productName: z.string().nullable(),
              productPrice: z.string().nullable(),
              productSupplier: z.string().nullable(),
              productConcentration: z.string().nullable(),
              productPresentation: z.string().nullable(),
              itemPrecoUnitario: z.number().nullable().optional(),
              itemPrecoTotal: z.number().nullable().optional(),
              itemSalePriceManual: z.string().nullable().optional(),
            })
          ).min(1),
        })
      )
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });

        // Pré-validação autoritativa antes de criar o cabeçalho. Assim uma
        // falha de match/preço não deixa proposta órfã ou parcial.
        const preflightErrors: string[] = [];
        for (const item of input.itens) {
          if (!item.productId) {
            preflightErrors.push(`item ${item.itemNumero}: produto não confirmado`);
            continue;
          }
          const dbProduct = await getProductById(item.productId);
          const dbPrice = Number(dbProduct?.price);
          if (!dbProduct) {
            preflightErrors.push(`item ${item.itemNumero}: produto não encontrado`);
          } else if (dbProduct.isActive !== "yes") {
            preflightErrors.push(`item ${item.itemNumero}: produto inativo`);
          } else if (!Number.isFinite(dbPrice) || dbPrice <= 0) {
            preflightErrors.push(`item ${item.itemNumero}: custo não informado ou inválido`);
          }
          if (!Number.isFinite(item.itemQuantidade) || item.itemQuantidade <= 0) {
            preflightErrors.push(`item ${item.itemNumero}: quantidade inválida`);
          }
        }
        if (preflightErrors.length > 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Proposta bloqueada. ${preflightErrors.slice(0, 5).join("; ")}${preflightErrors.length > 5 ? ` (+${preflightErrors.length - 5})` : ""}`,
          });
        }

        // Upsert órgão requisitante
        const orgId = await upsertRequestingOrg({ name: input.processo.orgao });

        // Aplicar template se fornecido
        let templateData: Awaited<ReturnType<typeof getProposalTemplate>> | null = null;
        if (input.templateId) {
          templateData = await getProposalTemplate(input.templateId);
        }
        // Criar proposta
        const proposalId = await createProposal({
          processNumber: input.processo.numero,
          orgId: orgId as number,
          orgName: input.processo.orgao,
          title: `${input.processo.modalidade} — ${input.processo.numero}`,
          notes: `${input.processo.objeto}`,
          ...(templateData && {
            validityDays: templateData.validityDays ?? 30,
            paymentTerms: templateData.paymentTerms ?? undefined,
            deliveryTerms: templateData.deliveryDays ? `${templateData.deliveryDays} dias` : undefined,
          }),
        });

        // Adicionar itens — sempre busca dados canônicos do banco quando productId existe
        let addedCount = 0;
        for (const item of input.itens) {
          // Determinar preço de custo: preferir dado do banco (fonte de verdade)
          let costPrice: number | null = null;
          let canonicalName = item.productName ?? item.itemDescricao;
          let canonicalActiveIngredient: string | null = null;
          let canonicalManufacturer: string | null = item.productSupplier ?? null;
          let canonicalConcentration: string | null = item.productConcentration ?? null;
          let canonicalPresentation: string | null = item.productPresentation ?? null;
          let canonicalUnit: string | null = item.itemUnidade;
          let canonicalSupplier: string | null = item.productSupplier ?? null;
          let canonicalImageUrl: string | null = null;
          let canonicalProductUrl: string | null = null;
          let canonicalMapa: string | null = null;

          if (item.productId) {
            // FONTE DE VERDADE: buscar dados completos e atualizados do banco
            const dbProduct = await getProductById(item.productId);
            if (dbProduct) {
              // Usar preço do banco — nunca o preço do matching (pode estar desatualizado)
              const dbPrice = dbProduct.price ? parseFloat(String(dbProduct.price)) : null;
              costPrice = dbPrice;
              canonicalName = dbProduct.name;
              canonicalActiveIngredient = dbProduct.activeIngredient ?? null;
              canonicalManufacturer = dbProduct.manufacturer ?? null;
              canonicalConcentration = dbProduct.concentration ?? null;
              canonicalPresentation = dbProduct.presentation ?? null;
              canonicalUnit = dbProduct.unit ?? item.itemUnidade;
              canonicalSupplier = dbProduct.supplierName ?? null;
              canonicalImageUrl = dbProduct.imageUrl ?? null;
              canonicalProductUrl = dbProduct.productUrl ?? null;
              canonicalMapa = dbProduct.mapa ?? null;
            } else {
              // Produto deletado do catálogo após matching — usar dados do frontend como fallback
              costPrice = item.productPrice ? parseFloat(item.productPrice) : null;
            }
          } else {
            // Item sem match no catálogo — usar dados do frontend
            costPrice = item.productPrice ? parseFloat(item.productPrice) : null;
          }

           if (costPrice === null || !Number.isFinite(costPrice) || costPrice <= 0) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: `Item ${item.itemNumero} ficou sem custo durante a criação.`,
            });
          }
          // Valor de venda manual do item (definido pelo usuário na revisão).
          // Quando informado e válido, substitui o cálculo automático de margem.
          const rawManual = (item.itemSalePriceManual ?? "").trim();
          const manualPrice = rawManual ? parseFloat(rawManual.replace(",", ".")) : null;
          if (manualPrice !== null && (!Number.isFinite(manualPrice) || manualPrice <= 0)) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: `Item ${item.itemNumero}: valor de venda manual inválido.`,
            });
          }
          const salePrice = manualPrice !== null
            ? manualPrice
            : calculateSalePrice({
                cost: costPrice,
                marginPercent: input.marginPercent,
              });
          // Preço de referência do edital (extraído pela IA ou null)
          const editalRefPrice = item.itemPrecoUnitario ?? null;
          // Preço sugerido inicial = valor manual do usuário ou margem sobre a receita (editável depois)
          const suggestedPrice = salePrice;
          await addProposalItem({
            proposalId,
            productId: item.productId ?? undefined,
            productName: canonicalName,
            activeIngredient: canonicalActiveIngredient,
            manufacturer: canonicalManufacturer,
            concentration: canonicalConcentration,
            presentation: canonicalPresentation,
            unit: canonicalUnit ?? item.itemUnidade,
            supplierName: canonicalSupplier,
            quantity: item.itemQuantidade,
            unitPrice: String(costPrice.toFixed(2)) as any,
            costPrice: String(costPrice.toFixed(2)) as any,
            editalRefPrice: editalRefPrice !== null ? String(editalRefPrice.toFixed(2)) as any : null,
            suggestedPrice: String(suggestedPrice.toFixed(2)) as any,
            notes: `Item ${item.itemNumero}: ${item.itemDescricao}`,
            registroMapa: canonicalMapa,
            imageUrl: canonicalImageUrl as any,
            productUrl: canonicalProductUrl as any,
          });
          addedCount++;
          // Registrar feedback de aprendizado para itens com produto confirmado
          if (item.productId && canonicalName) {
            // Fire-and-forget: não bloqueia a resposta
            recordFeedback(item.itemDescricao, item.productId, canonicalName).catch(() => {});
          }
        }
        return { proposalId, addedCount };
      }),
  });
