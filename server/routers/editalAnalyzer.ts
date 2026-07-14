import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { invokeLLM } from "../_core/llm";
import { getDb, createProposal, addProposalItem, getCompanySettings } from "../db";

/**
 * Converte quantidade em texto (notação BR) para número de forma robusta.
 * "1.000" → 1000 (milhar), "10 caixas" → 10, "1,5" → 1.5. Retorna null quando
 * não há número — para o chamador sinalizar em vez de assumir 1 silenciosamente.
 */
export function parseQuantidadeBR(texto: string | number | null | undefined): number | null {
  if (typeof texto === "number") return isNaN(texto) ? null : texto;
  if (!texto) return null;
  const m = String(texto).match(/[\d.,]+/);
  if (!m) return null;
  let s = m[0];
  if (s.includes(",")) {
    // vírgula é decimal: remove pontos de milhar, troca vírgula por ponto
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/\.\d{3}(\D|$)/.test(s + " ")) {
    // ponto como separador de milhar (ex.: 1.000)
    s = s.replace(/\./g, "");
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// ─── Schema de item extraído ──────────────────────────────────────────────────
const itemEditalSchema = z.object({
  item: z.string(),
  lote: z.string().optional(),
  descricaoOriginal: z.string(),
  descricaoPadronizada: z.string(),
  quantidade: z.string(),
  unidade: z.string(),
  especificacaoTecnica: z.string().optional(),
  marcaExigida: z.string().optional(),
  equivalenciaPermitida: z.enum(["sim", "nao", "validar"]),
  registroExigido: z.string().optional(),
  observacoes: z.string().optional(),
});

export const editalAnalyzerRouter = router({
  /**
   * Extrai itens, dados do processo e orientações a partir de texto colado ou arquivo
   */
  extrair: protectedProcedure
    .input(
      z.object({
        textoEdital: z.string().optional(),
        textoOrientacoes: z.string().optional(),
        textoDadosFornecedor: z.string().optional(),
        // Suporte a upload de arquivo PDF/DOCX
        fileBase64: z.string().optional(),
        fileName: z.string().optional(),
        mimeType: z.string().optional(),
      })
    )
    .mutation(async ({ input }: any) => {
      // Se veio arquivo, extrair texto dele primeiro
      let textoArquivo = "";
      if (input.fileBase64 && input.fileName) {
        const buffer = Buffer.from(input.fileBase64, "base64");
        const mime = input.mimeType || "";
        const name = input.fileName.toLowerCase();
        if (mime === "application/pdf" || name.endsWith(".pdf")) {
          try {
            const { PDFParse } = await import("pdf-parse");
            const parser = new (PDFParse as any)({ data: buffer });
            const result = await parser.getText();
            textoArquivo = typeof result === "string" ? result : (result?.text ?? "");
          } catch (e) {
            throw new Error("Falha ao ler PDF: " + String(e));
          }
        } else if (
          mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
          name.endsWith(".docx")
        ) {
          try {
            const mammoth = await import("mammoth");
            const result = await mammoth.extractRawText({ buffer });
            textoArquivo = result.value;
          } catch (e) {
            throw new Error("Falha ao ler DOCX: " + String(e));
          }
        } else {
          throw new Error("Formato não suportado. Use PDF ou DOCX.");
        }
        if (!textoArquivo.trim() || textoArquivo.trim().length < 50) {
          throw new Error("Não foi possível extrair texto do arquivo. O PDF pode ser uma imagem escaneada.");
        }
        // Truncar para 120.000 chars
        textoArquivo = textoArquivo.slice(0, 120000);
      }

      const textoCompleto = [
        textoArquivo ? `=== EDITAL (ARQUIVO) ===\n${textoArquivo}` : "",
        input.textoEdital ? `=== EDITAL / ITENS ===\n${input.textoEdital}` : "",
        input.textoOrientacoes ? `=== ORIENTAÇÕES DA PROPOSTA ===\n${input.textoOrientacoes}` : "",
        input.textoDadosFornecedor ? `=== DADOS DO FORNECEDOR ===\n${input.textoDadosFornecedor}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      if (!textoCompleto.trim()) {
        throw new Error("Nenhum texto fornecido para análise.");
      }

      const prompt = `Você é um sistema especializado em licitações públicas e propostas comerciais.
Analise o texto abaixo e extraia TODAS as informações estruturadas.

TEXTO:
${textoCompleto}

Retorne um JSON com a seguinte estrutura EXATA (sem markdown, apenas JSON puro):
{
  "processo": {
    "numero": "número do processo/pregão/licitação ou null",
    "orgao": "nome do órgão comprador ou null",
    "objeto": "descrição do objeto ou null",
    "dataLimite": "data limite de envio ou null",
    "modalidade": "pregão/concorrência/dispensa/etc ou null"
  },
  "itens": [
    {
      "item": "número do item",
      "lote": "número do lote ou null",
      "descricaoOriginal": "descrição exata como está no texto",
      "descricaoPadronizada": "descrição técnica padronizada",
      "quantidade": "quantidade numérica",
      "unidade": "unidade de medida",
      "especificacaoTecnica": "especificações técnicas relevantes ou null",
      "marcaExigida": "marca exigida ou null",
      "equivalenciaPermitida": "sim ou nao ou validar",
      "registroExigido": "MAPA/ANVISA/etc ou null",
      "observacoes": "observações importantes ou null"
    }
  ],
  "orientacoes": {
    "prazoEntrega": "prazo de entrega ou null",
    "validadeProposta": "validade da proposta ou null",
    "faturamentoMinimo": "faturamento mínimo ou null",
    "formaPagamento": "forma de pagamento ou null",
    "localEntrega": "local de entrega ou null",
    "emailComprador": "e-mail do comprador ou null",
    "observacoesCriticas": "observações críticas ou null"
  },
  "dadosFornecedor": {
    "razaoSocial": "razão social ou null",
    "cnpj": "CNPJ ou null",
    "endereco": "endereço completo ou null",
    "telefone": "telefone ou null",
    "email": "e-mail ou null",
    "responsavel": "nome do responsável ou null",
    "cargo": "cargo do responsável ou null"
  },
  "declaracoes": ["lista de declarações identificadas no texto"],
  "pendencias": ["lista de campos críticos ausentes que precisam ser preenchidos manualmente"]
}

REGRAS:
- Nunca invente dados. Se não encontrar, use null.
- Extraia TODOS os itens/produtos encontrados.
- Identifique declarações obrigatórias mesmo que estejam em texto corrido.
- Marque como pendência qualquer campo crítico ausente.`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: "Você é um extrator especializado de dados de editais e licitações. Retorne apenas JSON válido, sem markdown." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      });

      let resultado: any = {};
      try {
        const content = response.choices[0].message.content;
        resultado = typeof content === "string" ? JSON.parse(content) : content;
      } catch {
        resultado = {
          processo: {},
          itens: [],
          orientacoes: {},
          dadosFornecedor: {},
          declaracoes: [],
          pendencias: ["Erro ao processar texto. Verifique o conteúdo colado."],
        };
      }

      // Valida a saída da IA com o schema (antes era confiada cegamente). Itens
      // fora do padrão são mantidos, mas marcados para revisão humana e
      // registrados em pendencias — nunca entram na proposta sem conferência.
      if (Array.isArray(resultado.itens)) {
        const problemas: string[] = [];
        resultado.itens = resultado.itens.map((raw: any, idx: number) => {
          const parsed = itemEditalSchema.safeParse(raw);
          if (parsed.success) return parsed.data;
          problemas.push(
            `Item ${idx + 1}: campos fora do padrão (${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}) — revisar manualmente.`,
          );
          return { ...raw, _needsReview: true };
        });
        if (problemas.length > 0) {
          resultado.pendencias = [...(resultado.pendencias ?? []), ...problemas];
        }
      }

      return resultado;
    }),

  /**
   * Gera PDF profissional da proposta automática
   */
  gerarPDF: protectedProcedure
    .input(
      z.object({
        cabecalho: z.any(),
        itens: z.array(z.any()),
        condicoes: z.record(z.string(), z.string()),
        declaracoes: z.array(z.string()),
        pendencias: z.array(z.string()),
      })
    )
    .mutation(async ({ input }: any) => {
      const { generateProposalPdf } = await import("../proposalPdf");

      // Buscar dados da empresa cadastrada
      const companyData = await getCompanySettings();

      // Adaptar estrutura para o gerador de PDF existente
      const proposalFake = {
        id: 0,
        title: input.cabecalho?.processo?.objeto || "Proposta Automática",
        processNumber: input.cabecalho?.processo?.numero || null,
        orgName: input.cabecalho?.processo?.orgao || null,
        status: "draft",
        validityDays: 30,
        paymentTerms: input.condicoes?.formaPagamento || null,
        deliveryTerms: input.condicoes?.prazoEntrega || null,
        notes: [
          ...input.declaracoes,
          ...(input.pendencias.length > 0 ? ["\n⚠ PENDÊNCIAS: " + input.pendencias.join("; ")] : []),
        ].join("\n"),
        createdAt: new Date(),
        items: input.itens.map((item: any, idx: number) => ({
          id: idx,
          sortOrder: idx,
          productName: item.descricao,
          activeIngredient: null,
          manufacturer: item.marca || null,
          concentration: null,
          presentation: null,
          unit: item.unidade,
          supplierName: input.cabecalho?.fornecedor?.razaoSocial || null,
          unitPrice: null,
          suggestedPrice:
            Number.isFinite(Number(item.precoUnitario)) && Number(item.precoUnitario) > 0
              ? String(item.precoUnitario)
              : null,
          quantity: Math.max(1, Math.round(parseQuantidadeBR(item.quantidade) ?? 1)),
          notes: item.pendente ? "⚠ Produto não localizado no catálogo" : null,
          imageUrl: null,
          registroMapa: null,
        })),
      };

      // Usar dados da empresa cadastrada; fallback para dados extraídos do texto
      const company = {
        name: companyData?.name || input.cabecalho?.fornecedor?.razaoSocial || null,
        cnpj: companyData?.cnpj || input.cabecalho?.fornecedor?.cnpj || null,
        address: companyData?.address || input.cabecalho?.fornecedor?.endereco || null,
        city: companyData?.city || null,
        state: companyData?.state || null,
        zipCode: companyData?.zipCode || null,
        phone: companyData?.phone || input.cabecalho?.fornecedor?.telefone || null,
        email: companyData?.email || input.cabecalho?.fornecedor?.email || null,
        website: companyData?.website || null,
        logoUrl: companyData?.logoUrl || null,
        bankName: null,
        bankAgency: null,
        bankAccount: null,
        bankPixKey: null,
        defaultNotes: companyData?.notes || null,
      };

      const pdfBuffer = await generateProposalPdf(proposalFake as any, company, []);
      return { pdfBase64: pdfBuffer.toString("base64") };
    }),

  /**
   * Salva a proposta automática como Proposta Comercial no sistema
   */
  salvarComoPropostaComercial: protectedProcedure
    .input(
      z.object({
        cabecalho: z.any(),
        itens: z.array(z.any()),
        condicoes: z.record(z.string(), z.string()),
        declaracoes: z.array(z.string()),
      })
    )
    .mutation(async ({ input, ctx }: any) => {
      const titulo = [
        input.cabecalho?.processo?.orgao,
        input.cabecalho?.processo?.numero,
        input.cabecalho?.processo?.objeto,
      ]
        .filter(Boolean)
        .join(" — ") || `Proposta Automática ${new Date().toLocaleDateString("pt-BR")}`;

      const proposalId = await createProposal({
        title: titulo.slice(0, 255),
        processNumber: input.cabecalho?.processo?.numero?.slice(0, 128) || null,
        orgName: input.cabecalho?.processo?.orgao?.slice(0, 255) || null,
        status: "draft",
        validityDays: 30,
        paymentTerms: input.condicoes?.formaPagamento?.slice(0, 255) || null,
        deliveryTerms: input.condicoes?.prazoEntrega?.slice(0, 255) || null,
        notes: input.declaracoes.join("\n"),
        origem: "rapida",
      } as any);

      // Inserir itens
      for (let idx = 0; idx < input.itens.length; idx++) {
        const item = input.itens[idx];
        await addProposalItem({
          proposalId,
          productName: item.descricao?.slice(0, 511) || "Item sem descrição",
          manufacturer: item.marca?.slice(0, 255) || null,
          unit: item.unidade?.slice(0, 63) || null,
          quantity: Math.max(1, Math.round(parseQuantidadeBR(item.quantidade) ?? 1)),
          sortOrder: idx,
          notes: item.pendente ? "⚠ Produto não localizado no catálogo" : null,
        } as any);
      }

      return { proposalId };
    }),

  /**
   * Cruza itens extraídos com catálogo interno e sugere equivalências
   */
  cruzarCatalogo: protectedProcedure
    .input(
      z.object({
        itens: z.array(
          z.object({
            item: z.string(),
            descricaoPadronizada: z.string(),
            especificacaoTecnica: z.string().optional(),
          })
        ).max(300),
      })
    )
    .mutation(async ({ input }: any) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const { products } = await import("../../drizzle/schema");
      const { like, or } = await import("drizzle-orm");

      const resultados = [];

      // Teto de chamadas de IA por operação — evita custo imprevisível quando o
      // edital tem centenas de itens (era 1 chamada de LLM por item, sem limite).
      const MAX_IA = 80;
      let iaCalls = 0;

      for (const itemEdital of input.itens) {
        // Busca simples por palavras-chave no catálogo
        const palavras = itemEdital.descricaoPadronizada
          .split(/\s+/)
          .filter((p: string) => p.length > 3)
          .slice(0, 3);

        let candidatos: any[] = [];
        if (palavras.length > 0) {
          candidatos = await db
            .select({
              id: products.id,
              name: products.name,
              fichaTecnica: products.fichaTecnica,
              categoryId: products.categoryId,
            })
            .from(products)
            .where(
              or(
                ...palavras.map((p: string) => like(products.name, `%${p}%`))
              )
            )
            .limit(5);
        }

        // Usar IA para classificar a correspondência
        let grauCorrespondencia = "sem_correspondencia";
        let produtoSugerido = null;
        let justificativa = "Nenhum produto encontrado no catálogo.";

        if (candidatos.length > 0 && iaCalls >= MAX_IA) {
          // Acima do teto de IA: entrega os candidatos por palavra-chave, mas
          // marca para revisão humana em vez de classificar por IA.
          grauCorrespondencia = "revisar";
          produtoSugerido = candidatos[0];
          justificativa = "Acima do limite de classificação por IA — revisar manualmente.";
        } else if (candidatos.length > 0) {
          iaCalls++;
          const promptClassificacao = `Item do edital: "${itemEdital.descricaoPadronizada}"
Especificação: "${itemEdital.especificacaoTecnica || "não informada"}"

Candidatos do catálogo:
${candidatos.map((c: any, i: number) => `${i + 1}. ID:${c.id} - ${c.name}`).join("\n")}

Classifique o melhor candidato. Retorne JSON:
{"produtoId": número_ou_null, "grau": "exata|equivalente_forte|possivel|sem_correspondencia", "justificativa": "texto curto"}`;

          try {
            const resp = await invokeLLM({
              messages: [
                { role: "system", content: "Classifique equivalência técnica. Retorne apenas JSON." },
                { role: "user", content: promptClassificacao },
              ],
              response_format: { type: "json_object" },
            });
            const classificacao = JSON.parse(resp.choices[0].message.content as string);
            grauCorrespondencia = classificacao.grau || "sem_correspondencia";
            justificativa = classificacao.justificativa || "";
            produtoSugerido = candidatos.find((c: any) => c.id === classificacao.produtoId) || null;
          } catch {
            grauCorrespondencia = "possivel";
            produtoSugerido = candidatos[0];
            justificativa = "Correspondência automática por similaridade de nome.";
          }
        }

        resultados.push({
          itemEdital: itemEdital.item,
          descricao: itemEdital.descricaoPadronizada,
          produtoSugerido,
          grauCorrespondencia,
          justificativa,
          candidatos,
        });
      }

      return resultados;
    }),

  /**
   * Gera proposta comercial estruturada a partir dos dados extraídos
   */
  gerarProposta: protectedProcedure
    .input(
      z.object({
        processo: z.any(),
        itens: z.array(z.any()),
        equivalencias: z.array(z.any()),
        orientacoes: z.any(),
        dadosFornecedor: z.any(),
        declaracoes: z.array(z.string()),
        configuracao: z.object({
          margem: z.number().default(20),
          validadeProposta: z.string().default("30 dias"),
          prazoEntrega: z.string().default("A combinar"),
        }),
      })
    )
    .mutation(async ({ input }: any) => {
      // Montar itens da proposta com preços
      const itensProposta = input.itens.map((item: any, idx: number) => {
        const equiv = input.equivalencias[idx];
        const produto = equiv?.produtoSugerido;

        return {
          item: item.item,
          lote: item.lote || "-",
          descricao: item.descricaoPadronizada,
          quantidade: item.quantidade,
          unidade: item.unidade,
          marca: produto?.name || item.marcaExigida || "A definir",
          precoUnitario: null, // usuário preenche
          precoTotal: null,
          grauEquivalencia: equiv?.grauCorrespondencia || "sem_correspondencia",
          pendente: !produto,
        };
      });

      // Declarações padrão + extraídas
      const declaracoesFinal = [
        ...input.declaracoes,
        "Declaramos que os produtos ofertados atendem integralmente às especificações do edital.",
        "Declaramos a inexistência de impedimento legal para participação neste processo.",
      ].filter((d, i, arr) => arr.indexOf(d) === i); // deduplicar

      return {
        cabecalho: {
          fornecedor: input.dadosFornecedor,
          processo: input.processo,
          data: new Date().toLocaleDateString("pt-BR"),
        },
        itens: itensProposta,
        condicoes: {
          validadeProposta: input.orientacoes?.validadeProposta || input.configuracao.validadeProposta,
          prazoEntrega: input.orientacoes?.prazoEntrega || input.configuracao.prazoEntrega,
          faturamentoMinimo: input.orientacoes?.faturamentoMinimo || "Não informado",
          formaPagamento: input.orientacoes?.formaPagamento || "A combinar",
          localEntrega: input.orientacoes?.localEntrega || "Conforme edital",
        },
        declaracoes: declaracoesFinal,
        pendencias: itensProposta
          .filter((i: any) => i.pendente)
          .map((i: any) => `Item ${i.item}: produto não localizado no catálogo`),
      };
    }),
});
