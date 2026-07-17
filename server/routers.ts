import { COOKIE_NAME } from "@shared/const";
import { metadataRouter } from "./routers/metadata";
import { categoriesRouter } from "./routers/categories";
import { equivalencesRouter } from "./routers/equivalences";
import { dashboardRouter } from "./routers/dashboard";
import { financialRouter } from "./routers/financial";
import { proposalsRouter } from "./routers/proposals";
import { suppliersRouter } from "./routers/suppliers";
import { companyRouter } from "./routers/company";
import { orgsRouter } from "./routers/orgs";
import { synonymsRouter } from "./routers/synonyms";
import { proposalTemplatesRouter } from "./routers/proposalTemplates";
import { duplicatesRouter } from "./routers/duplicates";
import { drogavetRouter } from "./routers/drogavet";
import { imagesRouter } from "./routers/images";
import { recognitionRouter } from "./routers/recognition";
import { reclassificationRouter } from "./routers/reclassification";
import { importConsolidatedRouter } from "./routers/importConsolidated";
import { productMatchingRouter } from "./routers/productMatching";
import { importMatchingRouter } from "./routers/importMatching";
import { quotationsRouter } from "./routers/quotations";
import { importSmartRouter } from "./importSmartRouter";
import { editalAnalyzerRouter } from "./routers/editalAnalyzer";
import { nfeImportRouter } from "./routers/nfeImport";
import { priceSyncRouter } from "./routers/priceSync";
import { priceImportRouter } from "./routers/priceImport";
import { scraperMultiRouter } from "./routers/scraperMulti";
import { scraperSyncRouter } from "./routers/scraperSync";
import { priceAnalysisRouter } from "./routers/priceAnalysis";
import { supplierCredentialsRouter } from "./routers/supplierCredentials";
import { pricingRouter } from "./routers/pricing";
import { categoryPricingRouter } from "./routers/categoryPricing";
import { bulkPricingRouter } from "./routers/bulkPricing";
import { agenteRouter } from "./routers/agente";
import { scraperAgentRouter } from "./routers/scraperAgent";
import { propostaAgentRouter } from "./routers/propostaAgentRouter";
import { supplierImportRouter } from "./routers/supplierImport";
import { priceAlertsRouter } from "./routers/priceAlerts";
import { captureReviewRouter } from "./routers/captureReview";
import { captureSchedulerRouter } from "./routers/captureScheduler";
import { scraperIntegrationRouter } from "./routers/scraperIntegration";
import { captureAnalyticsRouter } from "./routers/captureAnalytics";
import { nfeEnrichmentPipelineRouter } from "./routers/nfeEnrichmentPipeline";
import { notificationWebhooksRouter } from "./routers/notificationWebhooks";
import { enrichmentHistoryRouter } from "./routers/enrichmentHistoryRouter";
import { supplierAuthRouter } from "./routers/supplierAuthRouter";
import { documentGovernanceRouter } from "./routers/documentGovernanceRouter";
import { workflowRouter } from "./routers/workflowRouter";
import { operationsRouter } from "./routers/operationsRouter";
import { auditRouter } from "./routers/auditRouter";
import { mfaRouter } from "./routers/mfaRouter";
import { usersRouter } from "./routers/usersRouter";
import { connectorsRouter } from "./routers/connectors";
import { alertConfigRouter } from "./routers/alertConfigRouter";
import { marginOptimizationRouter } from "./routers/marginOptimizationRouter";
import { reportRouter } from "./routers/reportRouter";
import { duplicateDetectionRouter } from "./routers/duplicateDetectionRouter";
import { executiveDecisionRouter } from "./routers/executiveDecisionRouter";
import { postAwardContractsRouter } from "./routers/postAwardContractsRouter";
import { intelligentCaptureRouter } from "./routers/intelligentCaptureRouter";
import { pncpRadarRouter } from "./routers/pncpRadar";
import { emailQuotationsRouter } from "./routers/emailQuotations";
import { certidoesRouter } from "./routers/certidoes";
import { aiRouter } from "./routers/ai";
import { precificacaoRouter } from "./routers/precificacao";
import { portalCredentialsRouter } from "./routers/portalCredentials";
import { agendaRouter } from "./routers/agenda";
import { desempenhoRouter } from "./routers/desempenho";
import { funilRouter } from "./routers/funil";
import { taxRulesRouter } from "./routers/taxRules";
import { fretesRouter } from "./routers/fretes";
import { posVendaRouter } from "./routers/posVenda";
import { buscaGlobalRouter } from "./routers/buscaGlobal";
import { diagnosticoRouter } from "./routers/diagnostico";
import { productsRouter } from "./routers/productsGroup";
import { importsRouter } from "./routers/importsGroup";
import { enrichmentRouter as enrichmentInlineRouter } from "./routers/enrichmentGroup";
import { invokeLLM } from "./_core/llm";
import { calculateSalePrice } from "./services/pricingSafety";


import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  addProposalItem,
  createProposal,
  getProductById,
  upsertRequestingOrg,
  // Master products (base mestre)
  listMasterProducts,
  searchMasterProducts,
  previewImportRows,
  getProductPricesByMasterName,
  // Fuzzy matching
  previewImportRowsFuzzy,
  getCheaperAlternatives,
  getSimilarProductsByIngredient,
  // Landed Cost e histórico de preços
  recordPriceHistory,
  getProductPriceHistory,
  getProductsWithPriceAlert,
  listProductsWithLandedCost,
  getDb,
  checkDuplicatesInRows,
  loadSynonymMap,
  getProposalTemplate,
  loadFeedbackMap,
  recordFeedback,
  normalizeEditalTerm,
} from "./db";
import {
  products, categories,
  declarationTemplates, proposalDeclarations,
} from "../drizzle/schema";
import { isNull, or, like, sql, eq, asc, and } from "drizzle-orm";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";

// ─── Imports ─────────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  importSmart: importSmartRouter,
  editalAnalyzer: editalAnalyzerRouter,
  nfeImport: nfeImportRouter,
  priceSync: priceSyncRouter,
  priceImport: priceImportRouter,
  scraperMulti: scraperMultiRouter,
  scraperSync: scraperSyncRouter,
  priceAnalysis: priceAnalysisRouter,
  supplierCredentials: supplierCredentialsRouter,
  supplierImport: supplierImportRouter,
  pricing: pricingRouter,
  categoryPricing: categoryPricingRouter,
  bulkPricing: bulkPricingRouter,
  agente: agenteRouter,
  scraperAgent: scraperAgentRouter,
  propostaAgent: propostaAgentRouter,
  priceAlerts: priceAlertsRouter,
  audit: auditRouter,
  mfa: mfaRouter,
  users: usersRouter,
  connectors: connectorsRouter,
  alertConfig: alertConfigRouter,
  marginOptimization: marginOptimizationRouter,
  reports: reportRouter,
  captureReview: captureReviewRouter,
  captureScheduler: captureSchedulerRouter,
  scraperIntegration: scraperIntegrationRouter,
  captureAnalytics: captureAnalyticsRouter,
  nfeEnrichmentPipeline: nfeEnrichmentPipelineRouter,
  notificationWebhooks: notificationWebhooksRouter,
  enrichmentHistory: enrichmentHistoryRouter,
  supplierAuth: supplierAuthRouter,
  documents: documentGovernanceRouter,
  workflow: workflowRouter,
  operations: operationsRouter,
  pncpRadar: pncpRadarRouter,
  emailQuotations: emailQuotationsRouter,
  certidoes: certidoesRouter,
  ai: aiRouter,
  precificacao: precificacaoRouter,
  portalCredentials: portalCredentialsRouter,
  agenda: agendaRouter,
  desempenho: desempenhoRouter,
  funil: funilRouter,
  taxRules: taxRulesRouter,
  fretes: fretesRouter,
  posVenda: posVendaRouter,
  buscaGlobal: buscaGlobalRouter,
  diagnostico: diagnosticoRouter,

  auth: router({
    me: publicProcedure.query((opts) => {
      const u = opts.ctx.user;
      if (!u) return null;
      // Nunca serializar o hash de senha nem o segredo MFA para o cliente.
      const { passwordHash, mfaSecret, ...safe } = u as typeof u & {
        passwordHash?: unknown;
        mfaSecret?: unknown;
      };
      return safe;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Categories ───────────────────────────────────────────────────────────
  categories: categoriesRouter,


  // ─── Suppliers ────────────────────────────────────────────────────────────
  suppliers: suppliersRouter,


  // ─── Products ─────────────────────────────────────────────────────────────
  products: productsRouter,

  // ─── Equivalences ─────────────────────────────────────────────────────────
  equivalences: equivalencesRouter,


  // ─── Import Logs ──────────────────────────────────────────────────────────
  imports: importsRouter,
   // ─── Dashboard ────────────────────────────────────────────────────────────
  dashboard: dashboardRouter,

  // ─── Quotations ───────────────────────────────────────────────────────────

  // ─── Company Settings ────────────────────────────────────────────────────────
  company: companyRouter,


  // ─── Requesting Orgs ─────────────────────────────────────────────────────────
  orgs: orgsRouter,


  // ─── Proposals ───────────────────────────────────────────────────────────────
  proposals: proposalsRouter,


  // ─── Financial Entries ────────────────────────────────────────────────
  financial: financialRouter,

  masterProducts: router({
    list: protectedProcedure
      .input(z.object({ search: z.string().optional(), limit: z.number().optional() }).optional())
      .query(({ input }) => listMasterProducts(input?.search, input?.limit ?? 50)),

    search: protectedProcedure
      .input(z.object({ query: z.string(), limit: z.number().optional() }))
      .query(({ input }) => searchMasterProducts(input.query, input.limit ?? 20)),

    previewImport: protectedProcedure
      .input(z.object({
        rows: z.array(z.record(z.string(), z.string())),
      }))
      .mutation(({ input }) => previewImportRows(input.rows)),

     previewImportFuzzy: protectedProcedure
      .input(z.object({
        rows: z.array(z.record(z.string(), z.string())),
        supplierId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          if (!input.rows || input.rows.length === 0) {
            throw new Error("Array 'rows' não pode estar vazio");
          }
          return await previewImportRowsFuzzy(input.rows, input.supplierId);
        } catch (error: any) {
          console.error("[previewImportFuzzy]", error?.message || error);
          throw new Error(`Erro ao processar preview de importação: ${error?.message || "Erro desconhecido"}`);
        }
      }),
    previewWithDuplicates: protectedProcedure
      .input(z.object({
        rows: z.array(z.object({
          name: z.string().optional(),
          fichaTecnica: z.string().optional(),
          presentation: z.string().optional(),
          ean: z.string().optional(),
        })).max(3000),
        supplierId: z.number(),
      }))
      .mutation(async ({ input }) => {
        try {
          if (!input.rows || input.rows.length === 0) {
            throw new Error("Array 'rows' não pode estar vazio");
          }
          if (!input.supplierId || input.supplierId <= 0) {
            throw new Error("ID do fornecedor inválido");
          }
          return await checkDuplicatesInRows(input.rows, input.supplierId);
        } catch (error: any) {
          console.error("[checkDuplicatesInRows]", error?.message || error);
          throw new Error(`Erro ao verificar duplicatas: ${error?.message || "Erro desconhecido"}`);
        }
      }),
    pricesByName: protectedProcedure
      .input(z.object({ name: z.string() }))
      .query(async ({ input }) => {
        try {
          if (!input.name || input.name.trim().length === 0) {
            throw new Error("Nome do produto não pode estar vazio");
          }
          return await getProductPricesByMasterName(input.name);
        } catch (error: any) {
          console.error("[pricesByName]", error?.message || error);
          throw new Error(`Erro ao buscar preços: ${error?.message || "Erro desconhecido"}`);
        }
      }),
  }),

  priceIntelligence: router({
    // Similares por princípio ativo
    similarByIngredient: protectedProcedure
      .input(z.object({
        productId: z.number(),
        referencePrice: z.number().nullable().optional(),
      }))
      .query(({ input }) => getSimilarProductsByIngredient(input.productId, input.referencePrice ?? null)),

    cheaperAlternatives: protectedProcedure
      .input(z.object({
        productId: z.number(),
        referencePrice: z.number().nullable().optional(),
      }))
      .query(({ input }) => getCheaperAlternatives(input.productId, input.referencePrice ?? null)),

    // Histórico de preços
    priceHistory: protectedProcedure
      .input(z.object({ productId: z.number() }))
      .query(({ input }) => getProductPriceHistory(input.productId)),

    // Alertas de inflação
    priceAlerts: protectedProcedure
      .query(() => getProductsWithPriceAlert()),

    // Listagem com Landed Cost
    listWithLandedCost: protectedProcedure
      .input(z.object({
        categoryId: z.number().optional(),
        supplierId: z.number().optional(),
        search: z.string().optional(),
        limit: z.number().optional(),
      }).optional())
      .query(({ input }) => listProductsWithLandedCost(input)),

    // Registrar preço manualmente (com frete e impostos)
    recordPrice: protectedProcedure
      .input(z.object({
        productId: z.number(),
        supplierId: z.number(),
        price: z.string().nullable().optional(),
        freightValue: z.string().nullable().optional(),
        taxValue: z.string().nullable().optional(),
        importBatchId: z.number().nullable().optional(),
      }))
      .mutation(({ input }) => recordPriceHistory({
        ...input,
        price: input.price ?? null,
        freightValue: input.freightValue ?? null,
        taxValue: input.taxValue ?? null,
        importBatchId: input.importBatchId ?? null,
      })),
  }),
  // ─── Catalog Enrichment ────────────────────────────────────────────────────
  enrichment: enrichmentInlineRouter,
  // ─── Reclassificação em Lote via IA ──────────────────────────────────────────────────────
  reclassification: reclassificationRouter,
  // ─── Importação com Consolidação Automática ──────────────────────────────────────────────────
  importConsolidated: importConsolidatedRouter,
  // ─── Reconhecimento Inteligente de Produtos ──────────────────────────────────────────────────
  productMatching: productMatchingRouter,
  // ─── Importação com Matching Automático ──────────────────────────────────────────────────────
  importMatching: importMatchingRouter,
  // ─── Orçamentos e Propostas Comerciais ────────────────────────────────────────────────────────
  quotations: quotationsRouter,
  // ─── Importação de Edital (PDF/DOCX)) ─────────────────────────────────────────────────────
  edital: router({
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
  }),
  // ─── (A) Upload seguro de logo ──────────────────────────────────────────────
  uploadLogo: protectedProcedure
    .input(z.object({
      base64: z.string().max(8_000_000), // ~6MB base64
      mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      fileName: z.string().max(256),
    }))
    .mutation(async ({ input }) => {
      const { storagePut } = await import("./storage");
      // Decode base64
      const buffer = Buffer.from(input.base64, "base64");
      // Validate size: max 5MB
      if (buffer.length > 5 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "Imagem muito grande (máx 5MB)" });
      // Validate magic bytes
      const magic = buffer.slice(0, 4);
      const isJpeg = magic[0] === 0xFF && magic[1] === 0xD8;
      const isPng = magic[0] === 0x89 && magic[1] === 0x50 && magic[2] === 0x4E && magic[3] === 0x47;
      const isWebp = magic[0] === 0x52 && magic[1] === 0x49 && magic[2] === 0x46 && magic[3] === 0x46;
      if (!isJpeg && !isPng && !isWebp) throw new TRPCError({ code: "BAD_REQUEST", message: "Formato inválido. Use JPEG, PNG ou WebP." });
      const ext = isJpeg ? "jpg" : isPng ? "png" : "webp";
      const key = `empresa/logo-${Date.now()}.${ext}`;
      const { url } = await storagePut(key, buffer, input.mimeType);
      return { url };
    }),

  // ─── (E) Declarações fixas (templates) ───────────────────────────────────────
  declarations: router({
    listTemplates: protectedProcedure.query(async () => {
      const db = await getDb();
      return (db as any).select().from(declarationTemplates).orderBy(asc(declarationTemplates.sortOrder));
    }),
    upsertTemplate: protectedProcedure
      .input(z.object({
        id: z.number().optional(),
        title: z.string().min(1).max(256),
        content: z.string(),
        sortOrder: z.number().optional(),
        isActive: z.enum(["yes", "no"]).optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (input.id) {
          await (db as any).update(declarationTemplates).set({
            title: input.title,
            content: input.content,
            sortOrder: input.sortOrder ?? 0,
            isActive: input.isActive ?? "yes",
          }).where(eq(declarationTemplates.id, input.id));
          return { id: input.id };
        }
        const [res] = await (db as any).insert(declarationTemplates).values({
          title: input.title,
          content: input.content,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? "yes",
        });
        return { id: (res as any).insertId };
      }),
    deleteTemplate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        await (db as any).delete(declarationTemplates).where(eq(declarationTemplates.id, input.id));
        return { ok: true };
      }),
    // Snapshot: gravar declarações na proposta
    saveSnapshot: protectedProcedure
      .input(z.object({
        proposalId: z.number(),
        declarations: z.array(z.object({
          templateId: z.number().optional().nullable(),
          title: z.string(),
          content: z.string(),
          sortOrder: z.number().optional(),
        })),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        // Remove existing and re-insert
        await (db as any).delete(proposalDeclarations).where(eq(proposalDeclarations.proposalId, input.proposalId));
        if (input.declarations.length > 0) {
          await (db as any).insert(proposalDeclarations).values(
            input.declarations.map((d, i) => ({
              proposalId: input.proposalId,
              templateId: d.templateId ?? null,
              title: d.title,
              content: d.content,
              sortOrder: d.sortOrder ?? i,
            }))
          );
        }
        return { ok: true };
      }),
    getForProposal: protectedProcedure
      .input(z.object({ proposalId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        return (db as any).select().from(proposalDeclarations)
          .where(eq(proposalDeclarations.proposalId, input.proposalId))
          .orderBy(asc(proposalDeclarations.sortOrder));
      }),
  }),

  // REMOVIDO: Histórico de Licitações — módulo excluído em 26/03/2026

  // ─── 7. Ranking de Competitividade ───────────────────────────────────────────

  // ─── 8. Alerta de Risco Financeiro ───────────────────────────────────────────

  // ─── 9. Estoque ──────────────────────────────────────────────────────────────
   // ─── 10. Regras Tributárias ───────────────────────────────────────────────────

  // ─── 11. Reajuste Contratual ──────────────────────────────────────────────────

  // ─── 12. Painel Economia Potencial ───────────────────────────────────────────

  // ─── Reclassificação em Lote via IA ───────────────────────────────────────
  reclassificacao: router({
    // Conta quantos produtos serão afetados pelos filtros
    preview: protectedProcedure
      .input(z.object({
        categoryId: z.number().nullable().optional(),
        supplierId: z.number().nullable().optional(),
        semCampo: z.enum(["activeIngredient", "pharmaceuticalForm", "category", "none"]).default("none"),
        busca: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { total: 0, samples: [] };

        const conditions: any[] = [eq(products.isActive, "yes")];
        if (input.categoryId) conditions.push(eq(products.categoryId, input.categoryId));
        if (input.supplierId) conditions.push(eq(products.supplierId, input.supplierId));
        if (input.semCampo === "activeIngredient") conditions.push(or(isNull(products.activeIngredient), eq(products.activeIngredient, ""), eq(products.activeIngredient, "-")));
        if (input.semCampo === "pharmaceuticalForm") conditions.push(or(isNull(products.pharmaceuticalForm), eq(products.pharmaceuticalForm, "")));
        if (input.semCampo === "category") conditions.push(isNull(products.categoryId));
        if (input.busca && input.busca.trim()) conditions.push(like(products.name, `%${input.busca.trim()}%`));
        const [countRow] = await (db as any).execute(sql`
          SELECT COUNT(*) as total FROM products
          WHERE ${and(...conditions)}
        `);
        const total = Number((countRow as any[])[0]?.total ?? 0);

        const sampleRows = await db
          .select({ id: products.id, name: products.name, activeIngredient: products.activeIngredient, pharmaceuticalForm: products.pharmaceuticalForm })
          .from(products)
          .where(and(...conditions))
          .limit(10);

        return { total, samples: sampleRows };
      }),

    // Processa um lote de produtos via IA e atualiza o campo solicitado
    runBatch: protectedProcedure
      .input(z.object({
        categoryId: z.number().nullable().optional(),
        supplierId: z.number().nullable().optional(),
        semCampo: z.enum(["activeIngredient", "pharmaceuticalForm", "category", "none"]).default("none"),
        busca: z.string().optional(),
        campoAlvo: z.enum(["categoryId", "activeIngredient", "pharmaceuticalForm"]),
        offset: z.number().default(0),
        batchSize: z.number().min(10).max(200).default(150),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) return { updated: 0, errors: 0, nextOffset: input.offset };

        const conditions: any[] = [eq(products.isActive, "yes")];
        if (input.categoryId) conditions.push(eq(products.categoryId, input.categoryId));
        if (input.supplierId) conditions.push(eq(products.supplierId, input.supplierId));
         if (input.semCampo === "activeIngredient") conditions.push(or(isNull(products.activeIngredient), eq(products.activeIngredient, ""), eq(products.activeIngredient, "-")));
        if (input.semCampo === "pharmaceuticalForm") conditions.push(or(isNull(products.pharmaceuticalForm), eq(products.pharmaceuticalForm, "")));
        if (input.semCampo === "category") conditions.push(isNull(products.categoryId));
        if (input.busca && input.busca.trim()) conditions.push(like(products.name, `%${input.busca.trim()}%`));
        const batch = await db
          .select({ id: products.id, name: products.name, activeIngredient: products.activeIngredient, pharmaceuticalForm: products.pharmaceuticalForm, categoryId: products.categoryId })
          .from(products)
          .where(and(...conditions))
          .limit(input.batchSize)
          .offset(input.offset);

        if (batch.length === 0) return { updated: 0, errors: 0, nextOffset: input.offset, done: true };

        // Buscar categorias disponíveis para o prompt
        const allCats = await db.select({ id: categories.id, name: categories.name, parentId: categories.parentId }).from(categories);
        const catList = allCats.map(c => `${c.id}: ${c.name}`).join(", ");

        // Montar prompt conforme campo-alvo
        let systemPrompt = "";
        let userPrompt = "";
        let schemaProps: any = {};
        let schemaRequired: string[] = [];

        if (input.campoAlvo === "categoryId") {
          systemPrompt = `Você é um especialista em classificação de produtos veterinários e agrícolas. Para cada produto, escolha o categoryId mais adequado da lista: ${catList}. Responda APENAS com JSON válido.`;
          userPrompt = `Classifique cada produto abaixo com o categoryId correto:\n${batch.map(p => `ID ${p.id}: ${p.name}${p.activeIngredient ? " | " + p.activeIngredient : ""}`).join("\n")}`;
          schemaProps = { classificacoes: { type: "array", items: { type: "object", properties: { id: { type: "number" }, categoryId: { type: "number" } }, required: ["id", "categoryId"], additionalProperties: false } } };
          schemaRequired = ["classificacoes"];
        } else if (input.campoAlvo === "activeIngredient") {
          systemPrompt = "Você é um farmacologista especializado em produtos veterinários. Para cada produto, identifique o princípio ativo (substancia ativa) principal. Se não souber, use \"Não identificado\". Responda APENAS com JSON válido.";
          userPrompt = `Identifique o princípio ativo de cada produto:\n${batch.map(p => `ID ${p.id}: ${p.name}`).join("\n")}`;
          schemaProps = { classificacoes: { type: "array", items: { type: "object", properties: { id: { type: "number" }, activeIngredient: { type: "string" } }, required: ["id", "activeIngredient"], additionalProperties: false } } };
          schemaRequired = ["classificacoes"];
        } else if (input.campoAlvo === "pharmaceuticalForm") {
          systemPrompt = "Você é um farmacêutico especializado. Para cada produto, identifique a forma farmacêutica (ex: Comprimido, Frasco, Injetável, Pó, Gel, Pomada, Spray, Solução, Suspensão, etc). Se não souber, use \"Não identificado\". Responda APENAS com JSON válido.";
          userPrompt = `Identifique a forma farmacêutica de cada produto:\n${batch.map(p => `ID ${p.id}: ${p.name}${p.activeIngredient ? " | " + p.activeIngredient : ""}`).join("\n")}`;
          schemaProps = { classificacoes: { type: "array", items: { type: "object", properties: { id: { type: "number" }, pharmaceuticalForm: { type: "string" } }, required: ["id", "pharmaceuticalForm"], additionalProperties: false } } };
          schemaRequired = ["classificacoes"];
        }

        let updated = 0;
        let errors = 0;

        try {
          const llmResult = await invokeLLM({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "batch_classification",
                strict: true,
                schema: {
                  type: "object",
                  properties: schemaProps,
                  required: schemaRequired,
                  additionalProperties: false,
                },
              },
            },
          });

          const rawContent = llmResult.choices?.[0]?.message?.content;
          const content = typeof rawContent === "string" ? rawContent : null;
          if (!content) throw new Error("IA sem resposta");

          const parsed = JSON.parse(content) as { classificacoes: Array<{ id: number; categoryId?: number; activeIngredient?: string; pharmaceuticalForm?: string }> };
          const classificacoes = Array.isArray(parsed.classificacoes) ? parsed.classificacoes : [];

          for (const c of classificacoes) {
            try {
              const updateData: any = {};
              if (input.campoAlvo === "categoryId" && c.categoryId) updateData.categoryId = c.categoryId;
              if (input.campoAlvo === "activeIngredient" && c.activeIngredient) updateData.activeIngredient = c.activeIngredient;
              if (input.campoAlvo === "pharmaceuticalForm" && c.pharmaceuticalForm) updateData.pharmaceuticalForm = c.pharmaceuticalForm;
              if (Object.keys(updateData).length > 0) {
                await db.update(products).set(updateData).where(eq(products.id, c.id));
                updated++;
              }
            } catch {
              errors++;
            }
          }
        } catch {
          errors += batch.length;
        }

        return {
          updated,
          errors,
          processed: batch.length,
          nextOffset: input.offset + batch.length,
          done: batch.length < input.batchSize,
        };
      }),

    // ─── Migração V2: preencher fichaTecnica, subcategoria e codigoFornecedor via IA ───
    migrateV2Fields: protectedProcedure
      .input(z.object({
        batchSize: z.number().min(5).max(50).default(20),
        offset: z.number().min(0).default(0),
        campos: z.array(z.enum(["subcategoria", "fichaTecnica", "codigoFornecedor"])).default(["subcategoria"]),
      }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import("./_core/llm");
        const db = await getDb();
        if (!db) return { updated: 0, errors: 0, processed: 0, nextOffset: input.offset, done: true };
        const { batchSize, offset, campos } = input;

        // Buscar categorias para contexto
        const cats = await db
          .select({ id: categories.id, name: categories.name, parentId: categories.parentId })
          .from(categories)
          .orderBy(categories.parentId, categories.sortOrder);
        const catList = cats.map((c) => {
          const parent = cats.find((p) => p.id === c.parentId);
          return parent ? `${c.id}: ${parent.name} > ${c.name}` : `${c.id}: ${c.name}`;
        }).join("\n");

        // Buscar produtos sem subcategoria (ou outros campos conforme solicitado)
        const conditions: any[] = [eq(products.isActive, "yes")];
        if (campos.includes("subcategoria")) {
          conditions.push(or(isNull(products.subcategoria), eq(products.subcategoria, "")));
        }

        const batch = await db
          .select({
            id: products.id,
            name: products.name,
            activeIngredient: products.activeIngredient,
            manufacturer: products.manufacturer,
            presentation: products.presentation,
            concentration: products.concentration,
            categoryId: products.categoryId,
            subcategoria: products.subcategoria,
            fichaTecnica: products.fichaTecnica,
            codigoFornecedor: products.codigoFornecedor,
          })
          .from(products)
          .where(and(...conditions))
          .limit(batchSize)
          .offset(offset);

        if (batch.length === 0) return { updated: 0, errors: 0, processed: 0, nextOffset: offset, done: true };

        const prodList = batch.map((p) => {
          const cat = cats.find((c) => c.id === p.categoryId);
          const catName = cat ? (cats.find((c) => c.id === cat.parentId)?.name ?? cat.name) : "";
          const parts = [
            p.activeIngredient && `PA: ${p.activeIngredient}`,
            p.manufacturer && `Fab: ${p.manufacturer}`,
            p.presentation && `Apres: ${p.presentation}`,
            p.concentration && `Conc: ${p.concentration}`,
            catName && `Cat: ${catName}`,
          ].filter(Boolean).join(", ");
          return `${p.id}: ${p.name}${parts ? ` (${parts})` : ""}`;
        }).join("\n");

        const camposInstructions = [];
        if (campos.includes("subcategoria")) camposInstructions.push(`"subcategoria": string (ex: Antiparasitários, Antibióticos, Vacinas, Anestésicos, Anti-inflamatórios, Suplementos, Rações, Inseticidas, Fungicidas, Herbicidas, Fertilizantes, etc.)`);
        if (campos.includes("fichaTecnica")) camposInstructions.push(`"fichaTecnica": string (resumo técnico: indicação, mecanismo de ação, espécies-alvo — máx 200 chars)`);
        if (campos.includes("codigoFornecedor")) camposInstructions.push(`"codigoFornecedor": null (deixe null — não é possível inferir sem dados do fornecedor)`);

        let updated = 0;
        let errors = 0;

        try {
          const llmResult = await invokeLLM({
            messages: [
              { role: "system" as const, content: "Você é especialista em produtos veterinários, agropecuários e farmacêuticos. Analise cada produto e preencha os campos solicitados com precisão técnica. Responda APENAS com JSON válido." },
              { role: "user" as const, content: `CATEGORIAS DO SISTEMA:\n${catList}\n\nPRODUTOS:\n${prodList}\n\nPara cada produto, retorne um objeto com:\n- id: number\n${camposInstructions.join("\n")}\n\nRetorne { "resultados": [...] }` },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "migrate_v2_fields",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    resultados: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "number" },
                          subcategoria: { type: ["string", "null"] },
                          fichaTecnica: { type: ["string", "null"] },
                          codigoFornecedor: { type: ["string", "null"] },
                        },
                        required: ["id", "subcategoria", "fichaTecnica", "codigoFornecedor"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["resultados"],
                  additionalProperties: false,
                },
              },
            },
          });

          const rawContent = llmResult.choices?.[0]?.message?.content;
          const content = typeof rawContent === "string" ? rawContent : null;
          if (!content) throw new Error("IA sem resposta");
          const parsed = JSON.parse(content) as { resultados: Array<{ id: number; subcategoria?: string | null; fichaTecnica?: string | null; codigoFornecedor?: string | null }> };
          const resultados = Array.isArray(parsed.resultados) ? parsed.resultados : [];

          for (const r of resultados) {
            try {
              const updateData: any = { updatedAt: new Date() };
              if (campos.includes("subcategoria") && r.subcategoria) updateData.subcategoria = r.subcategoria;
              if (campos.includes("fichaTecnica") && r.fichaTecnica) updateData.fichaTecnica = r.fichaTecnica;
              if (Object.keys(updateData).length > 1) {
                await db.update(products).set(updateData).where(eq(products.id, r.id));
                updated++;
              }
            } catch {
              errors++;
            }
          }
        } catch {
          errors += batch.length;
        }

        return {
          updated,
          errors,
          processed: batch.length,
          nextOffset: offset + batch.length,
          done: batch.length < batchSize,
        };
      }),
  }),
  // ─── Sinônimos para Matchingg ───────────────────────────────────────────────
  synonyms: synonymsRouter,


  // ─── Templates de Proposta ──────────────────────────────────────────────────
  proposalTemplates: proposalTemplatesRouter,

  // ─── Metadados e apoio operacional ───────────────────────────────────────────
  metadata: metadataRouter,

  // ─── Motor Universal de Equivalência e duplicidades ──────────────────────────
  duplicates: duplicatesRouter,
  duplicateDetection: duplicateDetectionRouter,
  executiveDecision: executiveDecisionRouter,
  postAwardContracts: postAwardContractsRouter,
  intelligentCapture: intelligentCaptureRouter,

  // ─── Módulos complementares ───────────────────────────────────────────────────
  drogavet: drogavetRouter,
  images: imagesRouter,
  recognition: recognitionRouter,
});
export type AppRouter = typeof appRouter;

