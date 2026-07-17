import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { calculateSalePrice } from "../services/pricingSafety";
import { invokeLLM } from "../_core/llm";
import { addProposalItem, createProposal, getDb, getProductById, getProposalTemplate, loadFeedbackMap, loadSynonymMap, normalizeEditalTerm, recordFeedback, upsertRequestingOrg } from "../db";

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
        // 1. Extrair texto do arquivo
        let rawText = "";
        const buffer = Buffer.from(input.fileBase64, "base64");

        if (input.mimeType === "application/pdf" || input.fileName.toLowerCase().endsWith(".pdf")) {
          try {
            const { PDFParse } = await import("pdf-parse");
            // PDFParse v2 API: construtor recebe options com data
            const parser = new (PDFParse as any)({ data: buffer });
            const result = await parser.getText();
            // PDFParse v2 retorna objeto { text, pages, total }
            if (typeof result === "string") {
              rawText = result;
            } else if (result && typeof result === "object") {
              rawText = result.text ?? result.pages?.map((p: any) => p.text).join("\n") ?? "";
            }
          } catch (e) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao ler PDF: " + String(e) });
          }
        } else if (
          input.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
          input.fileName.toLowerCase().endsWith(".docx")
        ) {
          try {
            const mammoth = (await import("mammoth"));
            const result = await mammoth.extractRawText({ buffer });
            rawText = result.value;
          } catch (e) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao ler DOCX: " + String(e) });
          }
        } else {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Formato não suportado. Use PDF ou DOCX." });
        }

        if (!rawText || rawText.trim().length < 50) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Não foi possível extrair texto do arquivo. Verifique se o PDF não é uma imagem escaneada." });
        }

        // Limite aumentado para 120.000 chars (~100 itens de edital)
        // Para documentos maiores, processa em chunks e mescla os resultados
        const CHUNK_SIZE = 120000;
        const needsChunking = rawText.length > CHUNK_SIZE;
        const truncatedText = rawText.slice(0, CHUNK_SIZE);

        // 2. Usar IA para extrair metadados do edital e lista de itens
        const llmResult = await invokeLLM({
          messages: [
            {
              role: "system",
              content:
                "Você é um especialista em licitações públicas brasileiras. Analise o texto de um edital e extraia: " +
                "(1) metadados do processo (número do processo, modalidade, órgão, objeto); " +
                "(2) lista completa de itens/produtos solicitados com: número do item, descrição completa, unidade de medida, quantidade, " +
                "preço unitário de referência (se informado no edital — pode aparecer como 'valor unitário', 'preço máximo', 'preço referência', 'valor estimado unitário') e " +
                "preço total estimado do item (quantidade × preço unitário). " +
                "Se o edital não informar preços, retorne null nesses campos. " +
                "Responda APENAS com JSON válido conforme o schema solicitado.",
            },
            {
              role: "user",
              content: `Analise o seguinte texto de edital e extraia os dados solicitados:\n\n${truncatedText}`,
            },
          ],
          response_format: {
            type: "json_schema",
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
          },
        });

        const rawContent = llmResult.choices?.[0]?.message?.content;
        const content = typeof rawContent === "string" ? rawContent : null;
        if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "IA não retornou resposta" });

        let parsed: { processo: { numero: string; modalidade: string; orgao: string; objeto: string }; itens: Array<{ numero: number; descricao: string; unidade: string; quantidade: number; precoUnitario: number | null; precoTotal: number | null }> };
        try {
          parsed = JSON.parse(content);
        } catch {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Resposta da IA inválida" });
        }

        return {
          processo: parsed.processo,
          itens: parsed.itens,
          totalChars: rawText.length,
          truncated: needsChunking && rawText.length > CHUNK_SIZE * 2,
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
          confidence: "high" | "medium" | "low" | "none";
          usedFeedback: boolean;
        }> = [];

        // Helper: normaliza texto para comparação
        const normText = (s: string) =>
          s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").trim();
        // Helper: normaliza para chave de sinônimo (sem espaços)
        const normKey = (s: string) =>
          s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "").trim();
        // Helper: extrai concentração de uma string (ex: "500mg", "10%", "1g/ml")
        const extractConcentration = (s: string): string | null => {
          const m = normText(s).match(/(\d+[,.]?\d*)\s*(mg|mcg|ug|g|ml|l|ui|iu|%|ppm|ppb|kg|mg\/ml|g\/ml|mg\/g|ui\/ml|iu\/ml|mg\/kg)/);
          return m ? `${m[1]}${m[2]}` : null;
        };
        // Helper: calcula score de similaridade técnica entre descrição do edital e produto do catálogo
        // Prioridade: princípio ativo > concentração > forma farmacêutica > nome
        const calcSimilarity = (
          descricao: string,
          prodName: string,
          expandedTerms?: Set<string>,
          activeIngredient?: string | null,
          concentration?: string | null,
          presentation?: string | null,
        ): number => {
          const descNorm = normText(descricao);
          const descTokens = new Set(descNorm.split(/\s+/).filter((t) => t.length > 2));
          const nameNorm = normText(prodName);
          const nameTokens = new Set(nameNorm.split(/\s+/).filter((t) => t.length > 2));
          if (descTokens.size === 0 || nameTokens.size === 0) return 0;

          // --- Score base: sobreposição de tokens nome ↔ descrição ---
          let common = 0;
          descTokens.forEach((t) => { if (nameTokens.has(t)) common++; });
          let score = common / Math.max(descTokens.size, nameTokens.size);

          // --- Bônus por princípio ativo (peso alto: +0.40) ---
          if (activeIngredient) {
            const aiNorm = normText(activeIngredient);
            const aiTokens = aiNorm.split(/\s+/).filter((t) => t.length > 2);
            let aiMatch = false;
            for (const tok of aiTokens) {
              if (descTokens.has(tok) || (expandedTerms && expandedTerms.has(tok))) {
                aiMatch = true; break;
              }
            }
            if (aiMatch) score = Math.min(1, score + 0.40);
          }

          // --- Bônus por sinônimos expandidos (peso médio: +0.20) ---
          if (expandedTerms) {
            for (const tok of Array.from(expandedTerms)) {
              if (nameTokens.has(tok)) { score = Math.min(1, score + 0.20); break; }
            }
          }

          // --- Bônus por concentração coincidente (peso médio: +0.25) ---
          const descConc = extractConcentration(descricao);
          const prodConc = concentration ? extractConcentration(concentration) : extractConcentration(prodName);
          if (descConc && prodConc && descConc === prodConc) {
            score = Math.min(1, score + 0.25);
          } else if (descConc && prodConc && descConc !== prodConc) {
            // Penalizar levemente se concentrações são diferentes (evita match errado)
            score = Math.max(0, score - 0.10);
          }

          // --- Bônus por forma farmacêutica coincidente (peso baixo: +0.10) ---
          if (presentation) {
            const presNorm = normText(presentation);
            const presTokens = presNorm.split(/\s+/).filter((t) => t.length > 2);
            for (const tok of presTokens) {
              if (descTokens.has(tok)) { score = Math.min(1, score + 0.10); break; }
            }
          }

          return score;
        };
        // Carrega mapa de sinônimos e de feedback aprendido uma vez para todos os itens
        const synonymMap = await loadSynonymMap();
        const feedbackMap = await loadFeedbackMap();
        for (const item of input.itens) {
          // Extrai termos significativos da descrição do edital (>= 4 chars)
          const descNorm = normText(item.descricao);
          const terms = descNorm.split(/\s+/).filter((t) => t.length >= 4).slice(0, 6);
          // Expande termos via sinônimos: para cada token, adiciona o canônico se existir
          const expandedSet = new Set<string>(terms);
          for (const tok of terms) {
            const key = normKey(tok);
            const canonicals = synonymMap.get(key);
            if (canonicals) {
              for (const c of canonicals) {
                // Adiciona o canônico como termo de busca
                expandedSet.add(c);
              }
            }
          }
          // Também tenta tokens individuais de 3+ chars para abreviações
          const shortTokens = normText(item.descricao).split(/\s+/).filter((t) => t.length >= 3);
          for (const tok of shortTokens) {
            const key = normKey(tok);
            const canonicals = synonymMap.get(key);
            if (canonicals) {
              for (const c of canonicals) expandedSet.add(c);
            }
          }
          const allTerms = Array.from(expandedSet);
          if (allTerms.length === 0) {
            matches.push({
              itemNumero: item.numero, itemDescricao: item.descricao,
              itemUnidade: item.unidade, itemQuantidade: item.quantidade,
              itemPrecoUnitario: item.precoUnitario ?? null,
              itemPrecoTotal: item.precoTotal ?? null,
              productId: null, productName: null, productPrice: null, productSupplier: null,
              productUnit: null, productConcentration: null, productPresentation: null,
              productActiveIngredient: null, productImageUrl: null, productUrl: null,
              confidence: "none",
              usedFeedback: false,
            });
            continue;
          }
          // Busca candidatos usando os termos expandidos (top 5 mais longos)
          const topTerms = allTerms.sort((a, b) => b.length - a.length).slice(0, 5);
          let candidates: any[] = [];
          for (const term of topTerms) {
            const termLike = `%${term}%`;
            const [rows] = await (db as any).execute(sql`
              SELECT p.id, p.name, p.price, p.unit, p.concentration, p.presentation,
                     p.activeIngredient, p.imageUrl, p.productUrl, s.name as supplierName
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
          // Remove duplicatas por id
          const seen = new Set<number>();
          candidates = candidates.filter((c) => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
          // Verifica se há feedback aprendido para este termo do edital
          const normalizedItemTerm = normalizeEditalTerm(item.descricao);
          const learnedFeedback = feedbackMap.get(normalizedItemTerm);
          // Pontua cada candidato priorizando características técnicas (PA > concentração > forma farm. > nome)
          const scored = candidates.map((c) => {
            let score = calcSimilarity(
              item.descricao,
              c.name,
              expandedSet,
              c.activeIngredient,
              c.concentration,
              c.presentation,
            );
            // Boost de aprendizado: +0.60 para pares já confirmados anteriormente
            if (learnedFeedback && learnedFeedback.productId === c.id) {
              score = Math.min(1, score + 0.60);
            }
            return { ...c, score };
          }).sort((a, b) => b.score - a.score);
          // Threshold mínimo: pelo menos 30% de termos coincidentes (reduzido para beneficiar sinônimos)
          const best = scored.length > 0 && scored[0].score >= 0.30 ? scored[0] : null;
          if (best) {
            const confidence: "high" | "medium" | "low" =
              best.score >= 0.7 ? "high" : best.score >= 0.45 ? "medium" : "low";
            matches.push({
              itemNumero: item.numero, itemDescricao: item.descricao,
              itemUnidade: item.unidade, itemQuantidade: item.quantidade,
              itemPrecoUnitario: item.precoUnitario ?? null,
              itemPrecoTotal: item.precoTotal ?? null,
              productId: best.id, productName: best.name, productPrice: best.price,
              productSupplier: best.supplierName, productUnit: best.unit,
              productConcentration: best.concentration, productPresentation: best.presentation,
              productActiveIngredient: best.activeIngredient ?? null,
              productImageUrl: best.imageUrl ?? null, productUrl: best.productUrl ?? null,
              confidence,
              usedFeedback: !!(learnedFeedback && learnedFeedback.productId === best.id),
            });
          } else {
            matches.push({
              itemNumero: item.numero, itemDescricao: item.descricao,
              itemUnidade: item.unidade, itemQuantidade: item.quantidade,
              itemPrecoUnitario: item.precoUnitario ?? null,
              itemPrecoTotal: item.precoTotal ?? null,
              productId: null, productName: null, productPrice: null, productSupplier: null,
              productUnit: null, productConcentration: null, productPresentation: null,
              productActiveIngredient: null, productImageUrl: null, productUrl: null,
              confidence: "none",
              usedFeedback: false,
            });
          }
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
          const salePrice = calculateSalePrice({
            cost: costPrice,
            marginPercent: input.marginPercent,
          });
          // Preço de referência do edital (extraído pela IA ou null)
          const editalRefPrice = item.itemPrecoUnitario ?? null;
          // Preço sugerido inicial = margem sobre a receita (editável depois)
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
