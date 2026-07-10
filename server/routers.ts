import { COOKIE_NAME } from "@shared/const";
import { metadataRouter } from "./routers/metadata";
import { duplicatesRouter } from "./routers/duplicates";
import { drogavetRouter } from "./routers/drogavet";
import { imagesRouter } from "./routers/images";
import { recognitionRouter } from "./routers/recognition";
import { enrichmentRouter } from "./routers/enrichment";
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
import { scraperRouter } from "./routers/scraper";
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
import { aiEnrichmentRouter } from "./routers/aiEnrichment";
import { captureAnalyticsRouter } from "./routers/captureAnalytics";
import { nfeEnrichmentPipelineRouter } from "./routers/nfeEnrichmentPipeline";
import { notificationWebhooksRouter } from "./routers/notificationWebhooks";
import { enrichmentHistoryRouter } from "./routers/enrichmentHistoryRouter";
import { supplierAuthRouter } from "./routers/supplierAuthRouter";
import { documentGovernanceRouter } from "./routers/documentGovernanceRouter";
import { workflowRouter } from "./routers/workflowRouter";
import { operationsRouter } from "./routers/operationsRouter";
import { auditRouter } from "./routers/auditRouter";
import { alertConfigRouter } from "./routers/alertConfigRouter";
import { marginOptimizationRouter } from "./routers/marginOptimizationRouter";
import { reportRouter } from "./routers/reportRouter";
import { duplicateDetectionRouter } from "./routers/duplicateDetectionRouter";
import { executiveDecisionRouter } from "./routers/executiveDecisionRouter";
import { postAwardContractsRouter } from "./routers/postAwardContractsRouter";
import { intelligentCaptureRouter } from "./routers/intelligentCaptureRouter";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import { validateEquivalenceForMultipleItems } from "./services/equivalenceValidationService";


import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  addEquivalenceMember,
  addProposalItem,
  addQuotationItem,
  bulkInsertProducts,
  bulkUpdateProducts,
  compareByActiveIngredient,
  createCategory,
  createProduct,
  createEquivalenceGroup,
  createImportLog,
  createProposal,
  createQuotation,
  createSupplier,
  deactivateProductsByBatch,
  deleteCategory,
  deleteEquivalenceGroup,
  deleteProduct,
  deleteProposal,
  deleteQuotation,
  deleteRequestingOrg,
  deleteSupplier,
  getDashboardStats,
  getCompanySettings,
  getEquivalenceGroupWithMembers,
  getProductById,
  getProductsPerCategory,
  getProposalWithItems,
  getQuotationWithItems,
  getRequestingOrgById,
  getSupplierById,
  listCategories,
  listCategoriesHierarchy,
  listEquivalenceGroups,
  listImportLogs,
  listProducts,
  listProposals,
  listQuotations,
  listRequestingOrgs,
  listSuppliers,
  removeEquivalenceMember,
  removeProposalItem,
  removeQuotationItem,
  autocompleteSearch,
  searchProductsByName,
  applyImageByName,
  smartSearch,
  updateCategory,
  updateImportLog,
  updateProduct,
  updateProposal,
  updateProposalItem,
  updateQuotation,
  updateQuotationItem,
  updateRequestingOrg,
  updateSupplier,
  upsertCompanySettings,
  upsertRequestingOrg,
  // Proposal administration
  listProposalsAdmin,
  advanceProposalStatus,
  updateProposalFreight,
  getProposalStatusHistory,
  duplicateProposal,
  // Financial entries
  listFinancialEntries,
  createFinancialEntry,
  updateFinancialEntry,
  deleteFinancialEntry,
  getFinancialSummary,
  getProposalFinancialStats,
  getMarginByCategory,
  // Freight report & expiring proposals
  getFreightReport,
  getExpiringProposals,
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
  autoLinkImageUrls,
  bulkApplyImageUrls,
  previewEquivalenceGroups,
  applyEquivalenceGroups,
  getEquivalenceStats,
  suggestProductsFromList,
  getDb,
  checkDuplicatesInRows,
  mergeProductFromRow,
  // Synonyms
  listSynonyms,
  createSynonym,
  updateSynonym,
  deleteSynonym,
  bulkCreateSynonyms,
  bulkToggleSynonyms,
  bulkDeleteSynonyms,
  loadSynonymMap,
  listProposalTemplates,
  getProposalTemplate,
  createProposalTemplate,
  updateProposalTemplate,
  deleteProposalTemplate,
  getDefaultProposalTemplate,
  loadFeedbackMap,
  recordFeedback,
  listFeedbacks,
  deleteFeedback,
  bulkDeleteFeedback,
  normalizeEditalTerm,
  findDuplicateGroups,
  mergeProductGroup,
} from "./db";
import {
  products, categories, suppliers, proposals,
  declarationTemplates, proposalDeclarations,
  productSupplierPrices,
  importLogs,
} from "../drizzle/schema";
import { inArray, isNull, or, like, sql, eq, ne, asc, and, desc, lt, gt, gte } from "drizzle-orm";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

// ─── Imports ─────────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  importSmart: importSmartRouter,
  editalAnalyzer: editalAnalyzerRouter,
  nfeImport: nfeImportRouter,
  priceSync: priceSyncRouter,
  priceImport: priceImportRouter,
  scraper: scraperRouter,
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
  alertConfig: alertConfigRouter,
  marginOptimization: marginOptimizationRouter,
  reports: reportRouter,
  captureReview: captureReviewRouter,
  captureScheduler: captureSchedulerRouter,
  scraperIntegration: scraperIntegrationRouter,
  aiEnrichment: aiEnrichmentRouter,
  captureAnalytics: captureAnalyticsRouter,
  nfeEnrichmentPipeline: nfeEnrichmentPipelineRouter,
  notificationWebhooks: notificationWebhooksRouter,
  enrichmentHistory: enrichmentHistoryRouter,
  supplierAuth: supplierAuthRouter,
  documents: documentGovernanceRouter,
  workflow: workflowRouter,
  operations: operationsRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Categories ───────────────────────────────────────────────────────────
  categories: router({
    list: publicProcedure.query(() => listCategories()),
    listHierarchy: publicProcedure.query(() => listCategoriesHierarchy()),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(128),
          slug: z.string().min(1).max(128),
          description: z.string().optional(),
          color: z.string().optional(),
          sortOrder: z.number().optional(),
          parentId: z.number().optional(),
        })
      )
      .mutation(({ input }) => createCategory(input)),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).max(128).optional(),
          description: z.string().optional(),
          color: z.string().optional(),
          sortOrder: z.number().optional(),
          parentId: z.number().nullable().optional(),
        })
      )
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return updateCategory(id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteCategory(input.id)),
    // ── Sugestão automática de categoria via LLM ──────────────────────────
    suggest: protectedProcedure
      .input(
        z.object({
          productNames: z.array(z.string()).min(1).max(100),
        })
      )
      .mutation(async ({ input }) => {
        const allCats = await listCategoriesHierarchy();
        // Montar lista plana de categorias para o LLM
        const catList = allCats.flatMap((p) => [
          { id: p.id, name: p.name, parent: null },
          ...(p.children ?? []).map((c) => ({ id: c.id, name: c.name, parent: p.name })),
        ]);
        const catSummary = catList
          .map((c) => `${c.id}: ${c.parent ? c.parent + " > " : ""}${c.name}`)
          .join("\n");
        try {
          const llmResp = await invokeLLM({
            messages: [
              {
                role: "system" as const,
                content:
                  "Você é um especialista em classificação de produtos agropecuários, veterinários e de construção. " +
                  "Para cada produto listado, escolha a categoria mais adequada da lista fornecida. " +
                  "Prefira subcategorias (com pai) quando disponíveis. Responda APENAS com JSON válido.",
              },
              {
                role: "user" as const,
                content:
                  `Categorias disponíveis:\n${catSummary}\n\n` +
                  `Produtos para classificar:\n${JSON.stringify(
                    input.productNames.map((name, idx) => ({ idx, name }))
                  )}`,
              },
            ],
            response_format: {
              type: "json_schema" as const,
              json_schema: {
                name: "category_suggestions",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    results: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          idx: { type: "integer" },
                          categoryId: { type: "integer" },
                          categoryName: { type: "string" },
                          confidence: { type: "number" },
                        },
                        required: ["idx", "categoryId", "categoryName", "confidence"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["results"],
                  additionalProperties: false,
                },
              },
            },
          });
          const parsed = JSON.parse(llmResp.choices[0].message.content as string) as {
            results: { idx: number; categoryId: number; categoryName: string; confidence: number }[];
          };
          return { results: parsed.results };
        } catch {
          return { results: [] };
        }
      }),
  }),

  // ─── Suppliers ────────────────────────────────────────────────────────────
  suppliers: router({
    list: publicProcedure
      .input(z.object({ activeOnly: z.boolean().optional() }).optional())
      .query(({ input }) => listSuppliers(input?.activeOnly)),

    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getSupplierById(input.id)),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(256),
          code: z.string().optional(),
          contact: z.string().optional(),
          email: z.string().email().optional().or(z.literal("")),
          phone: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(({ input }) => createSupplier(input)),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).max(256).optional(),
          code: z.string().optional(),
          contact: z.string().optional(),
          email: z.string().optional(),
          phone: z.string().optional(),
          notes: z.string().optional(),
          isActive: z.enum(["yes", "no"]).optional(),
        })
      )
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return updateSupplier(id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteSupplier(input.id)),
  }),

  // ─── Products ─────────────────────────────────────────────────────────────
  products: router({
    list: publicProcedure
      .input(
        z.object({
          categoryId: z.number().optional(),
          categoryIds: z.array(z.number()).optional(),
          supplierId: z.number().optional(),
          search: z.string().optional(),
          searchField: z.enum(["all", "name", "code", "activeIngredient", "manufacturer", "barcode", "concentration", "presentation"]).optional(),
          manufacturer: z.string().optional(),
          isActive: z.enum(["yes", "no", "all"]).optional(),
          priceMin: z.number().optional(),
          priceMax: z.number().optional(),
          hasImage: z.boolean().optional(),
          hasProductUrl: z.boolean().optional(),
          withoutFichaTecnica: z.boolean().optional(),
          limit: z.number().min(1).max(500).optional(),
          offset: z.number().min(0).optional(),
          sortBy: z.enum(["name", "price", "mapa", "supplier", "category", "manufacturer", "createdAt"]).optional(),
          sortDir: z.enum(["asc", "desc"]).optional(),
        })
      )
      .query(({ input }) => listProducts(input as any)),

    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getProductById(input.id)),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(512),
          supplierId: z.number(),
          categoryId: z.number(),
          code: z.string().optional().nullable(),
          description: z.string().optional().nullable(),
          activeIngredient: z.string().optional().nullable(),
          manufacturer: z.string().optional().nullable(),
          unit: z.string().optional().nullable(),
          concentration: z.string().optional().nullable(),
          presentation: z.string().optional().nullable(),
          price: z.string().optional().nullable(),
          priceUnit: z.string().optional().nullable(),
          stock: z.string().optional().nullable(),
          barcode: z.string().optional().nullable(),
          mapa: z.string().optional().nullable().refine(
            (v) => { if (!v) return true; const n = parseFloat(v.replace(',','.')); return isNaN(n) || n > 0; },
            { message: "Registro MAPA deve ser positivo" }
          ),
          imageUrl: z.string().optional().nullable(),
          productUrl: z.string().optional().nullable(),
          isActive: z.enum(["yes", "no"]).optional(),
        })
      )
      .mutation(({ input }) => createProduct(input as any)),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          code: z.string().optional().nullable(),
          name: z.string().min(1).max(512).optional(),
          description: z.string().optional().nullable(),
          activeIngredient: z.string().optional().nullable(),
          manufacturer: z.string().optional().nullable(),
          unit: z.string().optional().nullable(),
          concentration: z.string().optional().nullable(),
          presentation: z.string().optional().nullable(),
          pharmaceuticalForm: z.string().optional().nullable(),
          price: z.string().optional().nullable(),
          priceUnit: z.string().optional().nullable(),
          stock: z.string().optional().nullable(),
          barcode: z.string().optional().nullable(),
          gtin: z.string().optional().nullable(),
          ean: z.string().optional().nullable(),
          registroRegulatorio: z.enum(["MAPA", "ANVISA", "FORN"]).optional().nullable(),
          codigoFornecedor: z.string().optional().nullable(),
          informacaoTecnica: z.string().optional().nullable(),
          fichaTecnica: z.string().optional().nullable(),
          subcategoria: z.string().optional().nullable(),
          mapa: z.string().optional().nullable().refine(
            (v) => { if (!v) return true; const n = parseFloat(v.replace(',','.')); return isNaN(n) || n > 0; },
            { message: "Registro MAPA deve ser positivo" }
          ),
          imageUrl: z.string().optional().nullable(),
          productUrl: z.string().optional().nullable(),
          isActive: z.enum(["yes", "no"]).optional(),
          supplierId: z.number().optional(),
          categoryId: z.number().optional(),
          freightValue: z.string().optional().nullable(),
          taxValue: z.string().optional().nullable(),
        })
      )
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return updateProduct(id, data as any);
      }),

    bulkUpdate: protectedProcedure
      .input(
        z.object({
          ids: z.array(z.number()).min(1),
          supplierId: z.number().optional(),
          categoryId: z.number().optional(),
          name: z.string().optional(),
          code: z.string().optional(),
          activeIngredient: z.string().optional(),
          manufacturer: z.string().optional(),
          concentration: z.string().optional(),
          presentation: z.string().optional(),
          pharmaceuticalForm: z.string().optional(),
          unit: z.string().optional(),
          price: z.string().optional(),
          priceUnit: z.string().optional(),
          mapa: z.string().optional(),
          barcode: z.string().optional(),
          description: z.string().optional(),
          imageUrl: z.string().optional(),
          productUrl: z.string().optional(),
          stock: z.string().optional(),
          isActive: z.enum(["yes", "no"]).optional(),
          priceAdjustPercent: z.number().optional(),
          // Campos V2
          fichaTecnica: z.string().optional().nullable(),
          codigoFornecedor: z.string().optional().nullable(),
          ean: z.string().optional().nullable(),
          gtin: z.string().optional().nullable(),
          subcategoria: z.string().optional().nullable(),
          registroRegulatorio: z.enum(["MAPA", "ANVISA", "FORN"]).optional().nullable(),
          laboratorio: z.string().optional().nullable(),
          nomeProduto: z.string().optional().nullable(),
        })
      )
      .mutation(({ input }) => {
        const { ids, ...data } = input;
        return bulkUpdateProducts(ids, data as any);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteProduct(input.id)),

    bulkDelete: protectedProcedure
      .input(z.object({ ids: z.array(z.number()).min(1) }))
      .mutation(async ({ input }) => {
        for (const id of input.ids) {
          await deleteProduct(id);
        }
        return { deleted: input.ids.length };
      }),

    smartSearch: publicProcedure
      .input(
        z.object({
          query: z.string().min(1),
          categoryId: z.number().optional(),
        })
      )
      .query(({ input }) => smartSearch(input.query, input.categoryId)),

    compareByActiveIngredient: publicProcedure
      .input(
        z.object({
          activeIngredient: z.string().min(1),
          categoryId: z.number().optional(),
        })
      )
      .query(({ input }) =>
        compareByActiveIngredient(input.activeIngredient, input.categoryId)
      ),

    autocomplete: publicProcedure
      .input(
        z.object({
          query: z.string().min(1),
          limit: z.number().min(1).max(20).optional(),
        })
      )
      .query(({ input }) => autocompleteSearch(input.query, input.limit ?? 12)),

    // ─── Image Management ───────────────────────────────────────────────
    searchByName: publicProcedure
      .input(
        z.object({
          nameTerm: z.string().min(2),
          limit: z.number().min(1).max(200).optional(),
        })
      )
      .query(({ input }) => searchProductsByName(input.nameTerm, input.limit ?? 100)),
    quickSearch: publicProcedure
      .input(z.object({ query: z.string().min(1), limit: z.number().optional() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const rows = await db
          .select({
            id: products.id,
            name: products.name,
            manufacturer: products.manufacturer,
            price: products.price,
            priceUnit: products.priceUnit,
            unit: products.unit,
            concentration: products.concentration,
            presentation: products.presentation,
            activeIngredient: products.activeIngredient,
            imageUrl: products.imageUrl,
            productUrl: products.productUrl,
            supplierId: products.supplierId,
            supplierName: suppliers.name,
          })
          .from(products)
          .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
          .where(and(eq(products.isActive, "yes"), like(products.name, `%${input.query}%`)))
          .orderBy(asc(products.name))
          .limit(input.limit ?? 20);
        return rows;
      }),

    applyImageByName: protectedProcedure
      .input(
        z.object({
          nameTerm: z.string().min(2),
          imageUrl: z.string().url(),
        })
      )
      .mutation(({ input }) => applyImageByName(input.nameTerm, input.imageUrl)),

    // Auto-link: dado array de URLs, tenta vincular cada uma a um produto pelo nome extraído da URL
    autoLinkImageUrls: protectedProcedure
      .input(z.object({ imageUrls: z.array(z.string()) }))
      .mutation(({ input }) => autoLinkImageUrls(input.imageUrls)),

    // Aplica em lote as URLs de imagem nos produtos correspondentes
    bulkApplyImageUrls: protectedProcedure
      .input(
        z.object({
          items: z.array(
            z.object({
              productId: z.number(),
              imageUrl: z.string(),
            })
          ),
        })
      )
      .mutation(({ input }) => bulkApplyImageUrls(input.items)),

    // ─── Detecção de duplicatas por fuzzy matching ─────────────────────────
    findDuplicates: protectedProcedure
      .input(z.object({
        threshold: z.number().min(0.5).max(1).optional(),
        supplierId: z.number().optional(),
        categoryId: z.number().optional(),
        limit: z.number().min(1).max(500).optional(),
      }).optional())
      .query(({ input }) => findDuplicateGroups(input ?? {})),
    // ─── Preços por Fornecedor ───────────────────────────────────────────────────
    getSupplierPrices: publicProcedure
      .input(z.object({ productId: z.number() }))
      .query(async ({ input }) => {
        const { getProductSupplierPrices } = await import("./db");
        return getProductSupplierPrices(input.productId);
      }),
    upsertSupplierPrice: protectedProcedure
      .input(z.object({
        productId: z.number(),
        supplierId: z.number(),
        price: z.string().nullable(),
        codigoFornecedor: z.string().optional(),
        linkProduto: z.string().optional(),
        origem: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { upsertProductSupplierPrice } = await import("./db");
        await upsertProductSupplierPrice(input.productId, input.supplierId, input.price, {
          codigoFornecedor: input.codigoFornecedor,
          linkProduto: input.linkProduto,
          origem: input.origem ?? 'manual',
        });
        return { ok: true };
      }),
    priceHistoryByProduct: publicProcedure
      .input(z.object({ productId: z.number(), supplierId: z.number().optional(), limit: z.number().default(20) }))
      .query(async ({ input }) => {
        const { getPriceHistory } = await import("./db");
        return getPriceHistory(input.productId, input.supplierId, input.limit);
      }),
    findByEan: publicProcedure
      .input(z.object({ ean: z.string() }))
      .query(async ({ input }) => {
        const { findProductByEan } = await import("./db");
        return findProductByEan(input.ean);
      }),
    deleteSupplierPrice: protectedProcedure
      .input(z.object({
        productId: z.number(),
        supplierId: z.number(),
      }))
      .mutation(async ({ input }) => {
        const { deleteProductSupplierPrice } = await import("./db");
        await deleteProductSupplierPrice(input.productId, input.supplierId);
        return { ok: true };
      }),
    // ─── Sugestão de Equivalentes por Ficha Técnica ────────────────────────────
    /**
     * Dado um productId, extrai a ficha técnica estruturada do produto e busca
     * candidatos equivalentes no catálogo, ranqueando por score de compatibilidade
     * técnica (princípio ativo, concentração, forma farmacêutica, classe terapêutica)
     * e ordenando os aprovados pelo menor preço.
     */
    suggestEquivalentsByFichaTecnica: publicProcedure
      .input(z.object({
        productId: z.number(),
        limit: z.number().int().min(1).max(50).default(20),
        onlyWithPrice: z.boolean().default(false),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { product: null, equivalents: [], totalFound: 0 };

        // 1. Buscar o produto de referência com ficha técnica
        const [ref] = await db
          .select({
            id: products.id,
            name: products.name,
            activeIngredient: products.activeIngredient,
            concentration: products.concentration,
            presentation: products.presentation,
            fichaTecnica: products.fichaTecnica,
            manufacturer: products.manufacturer,
            price: products.price,
            priceUnit: products.priceUnit,
            unit: products.unit,
            supplierId: products.supplierId,
            imageUrl: products.imageUrl,
            productUrl: products.productUrl,
            categoryId: products.categoryId,
          })
          .from(products)
          .where(eq(products.id, input.productId))
          .limit(1);

        if (!ref) return { product: null, equivalents: [], totalFound: 0 };

        // 2. Parsear ficha técnica estruturada (JSON ou texto livre)
        type FichaParsed = {
          principioAtivo?: string;
          concentracao?: string;
          formaFarmaceutica?: string;
          classeTerapeutica?: string;
          especieAlvo?: string;
          indicacoes?: string;
        };
        let fichaRef: FichaParsed = {};
        if (ref.fichaTecnica) {
          try {
            const parsed = JSON.parse(ref.fichaTecnica);
            fichaRef = {
              principioAtivo: parsed.principioAtivo ?? parsed.principio_ativo ?? parsed.activeIngredient ?? ref.activeIngredient ?? undefined,
              concentracao: parsed.concentracao ?? parsed.concentration ?? ref.concentration ?? undefined,
              formaFarmaceutica: parsed.formaFarmaceutica ?? parsed.forma_farmaceutica ?? parsed.formFarmaceutica ?? ref.presentation ?? undefined,
              classeTerapeutica: parsed.classeTerapeutica ?? parsed.classe_terapeutica ?? undefined,
              especieAlvo: parsed.especieAlvo ?? parsed.especie_alvo ?? undefined,
              indicacoes: parsed.indicacoes ?? undefined,
            };
          } catch {
            // Texto livre — usar campos diretos do produto
            fichaRef = {
              principioAtivo: ref.activeIngredient ?? undefined,
              concentracao: ref.concentration ?? undefined,
              formaFarmaceutica: ref.presentation ?? undefined,
            };
          }
        } else {
          fichaRef = {
            principioAtivo: ref.activeIngredient ?? undefined,
            concentracao: ref.concentration ?? undefined,
            formaFarmaceutica: ref.presentation ?? undefined,
          };
        }

        // 3. Buscar candidatos por princípio ativo (campo direto + ficha técnica)
        const paSearch = fichaRef.principioAtivo ?? ref.activeIngredient;
        if (!paSearch || paSearch.trim().length < 2) {
          return { product: ref, equivalents: [], totalFound: 0, fichaRef };
        }

        const paTerm = `%${paSearch.trim()}%`;
        const candidates = await db
          .select({
            id: products.id,
            name: products.name,
            activeIngredient: products.activeIngredient,
            concentration: products.concentration,
            presentation: products.presentation,
            fichaTecnica: products.fichaTecnica,
            manufacturer: products.manufacturer,
            price: products.price,
            priceUnit: products.priceUnit,
            unit: products.unit,
            supplierId: products.supplierId,
            supplierName: suppliers.name,
            categoryId: products.categoryId,
            categoryName: categories.name,
            imageUrl: products.imageUrl,
            productUrl: products.productUrl,
            mapa: products.mapa,
          })
          .from(products)
          .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
          .leftJoin(categories, eq(products.categoryId, categories.id))
          .where(
            and(
              eq(products.isActive, "yes"),
              sql`${products.id} != ${input.productId}`,
              or(
                like(products.activeIngredient, paTerm),
                like(products.fichaTecnica, paTerm),
              )
            )
          )
          .orderBy(asc(products.price))
          .limit(200);

        // 4. Calcular score de equivalência técnica para cada candidato
        type EquivalentResult = {
          id: number;
          name: string;
          activeIngredient: string | null;
          concentration: string | null;
          presentation: string | null;
          fichaTecnica: string | null;
          fichaParsed: FichaParsed;
          manufacturer: string | null;
          price: string | null;
          priceUnit: string | null;
          unit: string | null;
          supplierId: number | null;
          supplierName: string | null;
          categoryId: number | null;
          categoryName: string | null;
          imageUrl: string | null;
          productUrl: string | null;
          mapa: string | null;
          score: number;
          matchDetails: { field: string; refValue: string; candValue: string; match: boolean }[];
          status: "APROVADO" | "REVISAO" | "DIVERGENTE";
          economia: number | null;
        };

        const normalize = (s?: string | null) =>
          (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

        const scored: EquivalentResult[] = [];

        for (const cand of candidates) {
          if (input.onlyWithPrice && (!cand.price || parseFloat(String(cand.price)) <= 0)) continue;

          // Parsear ficha técnica do candidato
          let fichaCand: FichaParsed = {};
          if (cand.fichaTecnica) {
            try {
              const parsed = JSON.parse(cand.fichaTecnica);
              fichaCand = {
                principioAtivo: parsed.principioAtivo ?? parsed.principio_ativo ?? parsed.activeIngredient ?? cand.activeIngredient ?? undefined,
                concentracao: parsed.concentracao ?? parsed.concentration ?? cand.concentration ?? undefined,
                formaFarmaceutica: parsed.formaFarmaceutica ?? parsed.forma_farmaceutica ?? cand.presentation ?? undefined,
                classeTerapeutica: parsed.classeTerapeutica ?? parsed.classe_terapeutica ?? undefined,
                especieAlvo: parsed.especieAlvo ?? parsed.especie_alvo ?? undefined,
                indicacoes: parsed.indicacoes ?? undefined,
              };
            } catch {
              fichaCand = {
                principioAtivo: cand.activeIngredient ?? undefined,
                concentracao: cand.concentration ?? undefined,
                formaFarmaceutica: cand.presentation ?? undefined,
              };
            }
          } else {
            fichaCand = {
              principioAtivo: cand.activeIngredient ?? undefined,
              concentracao: cand.concentration ?? undefined,
              formaFarmaceutica: cand.presentation ?? undefined,
            };
          }

          // Calcular score por campo
          const matchDetails: EquivalentResult["matchDetails"] = [];
          let totalPoints = 0;
          let earnedPoints = 0;
          let hasCriticalDivergence = false;

          // Princípio ativo (crítico — peso 40)
          const paRef = normalize(fichaRef.principioAtivo);
          const paCand = normalize(fichaCand.principioAtivo);
          if (paRef && paCand) {
            totalPoints += 40;
            const match = paRef === paCand || paCand.includes(paRef) || paRef.includes(paCand);
            if (match) earnedPoints += 40;
            else hasCriticalDivergence = true;
            matchDetails.push({ field: "Princípio Ativo", refValue: fichaRef.principioAtivo!, candValue: fichaCand.principioAtivo!, match });
          }

          // Concentração (crítico — peso 30)
          const concRef = normalize(fichaRef.concentracao);
          const concCand = normalize(fichaCand.concentracao);
          if (concRef && concCand) {
            totalPoints += 30;
            const match = concRef === concCand || concCand.includes(concRef) || concRef.includes(concCand);
            if (match) earnedPoints += 30;
            else hasCriticalDivergence = true;
            matchDetails.push({ field: "Concentração", refValue: fichaRef.concentracao!, candValue: fichaCand.concentracao!, match });
          }

          // Forma farmacêutica (importante — peso 20)
          const ffRef = normalize(fichaRef.formaFarmaceutica);
          const ffCand = normalize(fichaCand.formaFarmaceutica);
          if (ffRef && ffCand) {
            totalPoints += 20;
            const match = ffRef === ffCand || ffCand.includes(ffRef) || ffRef.includes(ffCand);
            if (match) earnedPoints += 20;
            matchDetails.push({ field: "Forma Farmacêutica", refValue: fichaRef.formaFarmaceutica!, candValue: fichaCand.formaFarmaceutica!, match });
          }

          // Classe terapêutica (informativo — peso 10)
          const ctRef = normalize(fichaRef.classeTerapeutica);
          const ctCand = normalize(fichaCand.classeTerapeutica);
          if (ctRef && ctCand) {
            totalPoints += 10;
            const match = ctRef === ctCand || ctCand.includes(ctRef) || ctRef.includes(ctCand);
            if (match) earnedPoints += 10;
            matchDetails.push({ field: "Classe Terapêutica", refValue: fichaRef.classeTerapeutica!, candValue: fichaCand.classeTerapeutica!, match });
          }

          const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 50;
          const status: EquivalentResult["status"] = hasCriticalDivergence ? "DIVERGENTE" : score >= 70 ? "APROVADO" : "REVISAO";

          // Calcular economia
          const refPrice = ref.price ? parseFloat(String(ref.price)) : null;
          const candPrice = cand.price ? parseFloat(String(cand.price)) : null;
          const economia = refPrice && candPrice && candPrice < refPrice
            ? Math.round(((refPrice - candPrice) / refPrice) * 100)
            : null;

          scored.push({
            id: cand.id,
            name: cand.name,
            activeIngredient: cand.activeIngredient,
            concentration: cand.concentration,
            presentation: cand.presentation,
            fichaTecnica: cand.fichaTecnica,
            fichaParsed: fichaCand,
            manufacturer: cand.manufacturer,
            price: cand.price,
            priceUnit: cand.priceUnit,
            unit: cand.unit,
            supplierId: cand.supplierId,
            supplierName: cand.supplierName,
            categoryId: cand.categoryId,
            categoryName: cand.categoryName,
            imageUrl: cand.imageUrl,
            productUrl: cand.productUrl,
            mapa: cand.mapa,
            score,
            matchDetails,
            status,
            economia,
          });
        }

        // 5. Ordenar: APROVADO primeiro (por preço asc), depois REVISAO, depois DIVERGENTE
        scored.sort((a, b) => {
          const statusOrder = { APROVADO: 0, REVISAO: 1, DIVERGENTE: 2 };
          const sA = statusOrder[a.status];
          const sB = statusOrder[b.status];
          if (sA !== sB) return sA - sB;
          // Dentro do mesmo status: menor preço primeiro
          const pA = a.price ? parseFloat(String(a.price)) : Infinity;
          const pB = b.price ? parseFloat(String(b.price)) : Infinity;
          return pA - pB;
        });

        return {
          product: {
            ...ref,
            fichaParsed: fichaRef,
          },
          equivalents: scored.slice(0, input.limit),
          totalFound: scored.length,
          fichaRef,
        };
      }),

    // ─── Fusão de duplicatas ───────────────────────────────────────────────────
    mergeDuplicates: protectedProcedure
      .input(z.object({
        masterId: z.number(),
        duplicateIds: z.array(z.number()).min(1),
      }))
      .mutation(({ input }) => mergeProductGroup(input.masterId, input.duplicateIds)),

    // ─── Enriquecimento em Lote de Fichas Técnicas ──────────────────────────────
    enrichFichaTecnicaBatch: protectedProcedure
      .query(async () => {
        const { runEnrichFichaTecnicaBatch } = await import("./jobs/enrichFichaTecnicaJob");
        return runEnrichFichaTecnicaBatch();
      }),

    getEnrichmentProgress: publicProcedure
      .query(async () => {
        const { getEnrichmentProgress } = await import("./jobs/enrichFichaTecnicaJob");
        return getEnrichmentProgress();
      }),

    // ─── Exportação em Excel ───────────────────────────────────────────────────
    exportToExcel: protectedProcedure
      .input(
        z.object({
          supplierId: z.number().optional(),
          categoryId: z.number().optional(),
          isActive: z.enum(["yes", "no", "all"]).optional(),
          withoutFichaTecnica: z.boolean().optional(),
          withoutCategory: z.boolean().optional(),
          search: z.string().optional(),
          limit: z.number().min(1).max(5000).default(2000), // limite obrigatório por segurança
        })
      )
      .query(async ({ input }) => {
        const { exportProductsToExcel } = await import("./exportExcel");
        const buffer = await exportProductsToExcel(input as any);
        return {
          data: buffer.toString("base64"),
          filename: `catalogo-produtos-${new Date().toISOString().split("T")[0]}.xlsx`,
        };
      }),
  }),

  // ─── Equivalences ─────────────────────────────────────────────────────────
  equivalences: router({
    list: publicProcedure
      .input(z.object({ categoryId: z.number().optional() }).optional())
      .query(({ input }) => listEquivalenceGroups(input?.categoryId)),

    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getEquivalenceGroupWithMembers(input.id)),

    create: protectedProcedure
      .input(
        z.object({
          activeIngredient: z.string().min(1),
          categoryId: z.number().optional(),
          notes: z.string().optional(),
          productIds: z.array(z.number()).min(1),
        })
      )
      .mutation(({ input }) => createEquivalenceGroup(input)),

    addMember: protectedProcedure
      .input(z.object({ groupId: z.number(), productId: z.number() }))
      .mutation(({ input }) => addEquivalenceMember(input.groupId, input.productId)),

    removeMember: protectedProcedure
      .input(z.object({ groupId: z.number(), productId: z.number() }))
      .mutation(({ input }) => removeEquivalenceMember(input.groupId, input.productId)),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteEquivalenceGroup(input.id)),

    // Auto-geração de grupos por princípio ativo
    preview: protectedProcedure
      .input(
        z.object({
          batchId: z.number().optional(),
          categoryIdsA: z.array(z.number()).optional(),
          categoryIdsB: z.array(z.number()).optional(),
        }).optional()
      )
      .mutation(({ input }) =>
        previewEquivalenceGroups({
          batchId: input?.batchId,
          categoryIdsA: input?.categoryIdsA,
          categoryIdsB: input?.categoryIdsB,
        })
      ),

    applyAuto: protectedProcedure
      .input(
        z.object({
          groups: z.array(
            z.object({
              activeIngredient: z.string().min(1),
              productIds: z.array(z.number()),
              existingGroupId: z.number().nullable(),
            })
          ),
        })
      )
      .mutation(({ input }) => applyEquivalenceGroups(input.groups)),

    stats: publicProcedure.query(() => getEquivalenceStats()),
    // Geração inicial com 1 clique: preview + apply automático de todos os grupos novos
    generateAndApplyAll: protectedProcedure
      .input(
        z.object({
          crossOnly: z.boolean().default(false), // se true, apenas grupos que cruzam categorias
        }).optional()
      )
      .mutation(async ({ input }) => {
        // 1. Preview sem filtro de categoria (analisa todos os produtos)
        const groups = await previewEquivalenceGroups({});
        // 2. Filtra apenas grupos novos (sem grupo existente)
        const newGroups = groups.filter((g) => g.existingGroupId === null);
        // 3. Se crossOnly, filtra apenas grupos que cruzam categorias
        const toApply = input?.crossOnly
          ? newGroups.filter((g) => g.crossCategory)
          : newGroups;
        if (toApply.length === 0) return { created: 0, updated: 0, skipped: 0, total: groups.length };
        // 4. Aplica todos os grupos novos
        const result = await applyEquivalenceGroups(
          toApply.map((g) => ({
            activeIngredient: g.activeIngredient,
            productIds: g.members.map((m) => m.id),
            existingGroupId: null,
          }))
        );
        return { ...result, total: groups.length };
      }),
  }),

  // ─── Import Logs ──────────────────────────────────────────────────────────
  imports: router({
    list: publicProcedure
      .input(z.object({ limit: z.number().optional() }).optional())
      .query(({ input }) => listImportLogs(input?.limit)),

    processUpload: protectedProcedure
      .input(
        z.object({
          supplierId: z.number(),
          categoryId: z.number().optional().nullable(),
          fileName: z.string(),
          fileUrl: z.string().optional(),
          rows: z.array(
            z.object({
              code: z.string().optional(),
              name: z.string(),
              description: z.string().optional(),
              activeIngredient: z.string().optional(),
              manufacturer: z.string().optional(),
              unit: z.string().optional(),
              concentration: z.string().optional(),
              presentation: z.string().optional(),
              price: z.string().optional(),
              priceUnit: z.string().optional(),
              stock: z.string().optional(),
              imageUrl: z.string().optional(),
              productUrl: z.string().optional(),
              barcode: z.string().optional(),
              gtin: z.string().optional(),
              codigoFornecedor: z.string().optional(),
              informacaoTecnica: z.string().optional(),
              mapa: z.string().optional(),
              categoryName: z.string().optional(), // sobrescreve a categoria global por produto
            })
          ).max(3000),
          replaceExisting: z.boolean().optional(),
          // Ações por linha para duplicatas: "update" | "skip" | "replace" | "insert"
          rowActions: z.record(z.string(), z.enum(["update", "skip", "replace", "insert"])).optional(),
        })
      )
      .mutation(async ({ input }) => {
        // ── 1. Sanitise rows: accept ALL rows that have any non-empty field ──────
        const sanitisePrice = (v?: string) => {
          if (!v) return null;
          const cleaned = v.replace(/[^0-9.,]/g, "").replace(",", ".");
          const num = parseFloat(cleaned);
          return isNaN(num) ? null : cleaned;
        };

        const sanitiseText = (v?: string, maxLen = 512) => {
          if (!v) return null;
          const t = v.trim();
          return t.length > maxLen ? t.slice(0, maxLen) : t || null;
        };
        // MAPA: aceita apenas texto não-vazio; se for numérico, deve ser positivo
        const sanitiseMapa = (v?: string): string | null => {
          if (!v) return null;
          const t = v.trim();
          if (!t) return null;
          // Se parece numérico, valida que seja positivo
          const num = parseFloat(t.replace(',', '.'));
          if (!isNaN(num) && num <= 0) return null; // rejeita zero e negativos
          return t.length > 128 ? t.slice(0, 128) : t;
        };

        // Accept rows even without a name — use code or first non-empty field as fallback
        const validRows = input.rows.map((r) => ({
          ...r,
          name: r.name?.trim() || r.code?.trim() || r.description?.trim()?.slice(0, 100) || "(sem nome)",
        }));

        const batchId = await createImportLog({
          supplierId: input.supplierId,
          categoryId: input.categoryId,
          fileName: input.fileName,
          fileUrl: input.fileUrl,
          totalRows: validRows.length,
          status: "processing",
        });

        // ── 2. Enrich missing activeIngredient via LLM (batch of up to 50) ──────
        const needsEnrichment = validRows.filter(
          (r) => !r.activeIngredient?.trim() && r.name !== "(sem nome)"
        );
        const enrichmentMap = new Map<string, string>();

        if (needsEnrichment.length > 0) {
          try {
            const sample = needsEnrichment.slice(0, 50);
            const llmResp = await invokeLLM({
              messages: [
                {
                  role: "system" as const,
                  content:
                    "Você é um especialista em farmacologia veterinária e humana. " +
                    "Para cada produto listado, informe APENAS o princípio ativo principal (DCI/INN). " +
                    "Se não souber, responda com string vazia. Responda em JSON.",
                },
                {
                  role: "user" as const,
                  content: JSON.stringify(
                    sample.map((r, i) => ({
                      idx: i,
                      name: r.name,
                      concentration: r.concentration || "",
                      presentation: r.presentation || "",
                    }))
                  ),
                },
              ],
              response_format: {
                type: "json_schema" as const,
                json_schema: {
                  name: "enrichment",
                  strict: true,
                  schema: {
                    type: "object",
                    properties: {
                      results: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            idx: { type: "integer" },
                            activeIngredient: { type: "string" },
                          },
                          required: ["idx", "activeIngredient"],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ["results"],
                    additionalProperties: false,
                  },
                },
              },
            });
            const parsed = JSON.parse(llmResp.choices[0].message.content as string) as {
              results: { idx: number; activeIngredient: string }[];
            };
            for (const item of parsed.results) {
              if (item.activeIngredient?.trim()) {
                enrichmentMap.set(sample[item.idx]?.name ?? "", item.activeIngredient.trim());
              }
            }
          } catch (_) {
            // LLM enrichment is best-effort — never block the import
          }
        }

        // ── 3. Build insert payload ───────────────────────────────────────────
        const toInsert = validRows.map((r) => ({
          supplierId: input.supplierId,
          categoryId: input.categoryId,
          code: sanitiseText(r.code, 128),
          name: sanitiseText(r.name, 512) ?? "(sem nome)",
          description: sanitiseText(r.description, 2000),
          activeIngredient:
            sanitiseText(r.activeIngredient, 512) ??
            enrichmentMap.get(r.name) ??
            null,
          manufacturer: sanitiseText(r.manufacturer, 256),
          unit: sanitiseText(r.unit, 64),
          concentration: sanitiseText(r.concentration, 128),
          presentation: sanitiseText(r.presentation, 256),
          price: sanitisePrice(r.price),
          priceUnit: sanitiseText(r.priceUnit, 64),
          stock: sanitiseText(r.stock, 64),
          imageUrl: sanitiseText(r.imageUrl, 2000),
          productUrl: sanitiseText(r.productUrl, 2000),
          barcode: sanitiseText(r.barcode, 128),
          gtin: sanitiseText((r as any).gtin, 64),
          codigoFornecedor: sanitiseText((r as any).codigoFornecedor, 128),
          informacaoTecnica: sanitiseText((r as any).informacaoTecnica, 2000),
          mapa: sanitiseMapa(r.mapa), // Número de registro MAPA/ANVISA (positivo)
          importBatchId: batchId,
          isActive: "yes" as const,
        }));

         // ── 4. Persist (com suporte a rowActions por linha) ─────────────────
        if (input.replaceExisting) {
          await deactivateProductsByBatch(input.supplierId, batchId);
        }

        const rowActions = input.rowActions ?? {};
        let updated = 0;
        let skippedByAction = 0;

        // Se há rowActions, precisamos verificar duplicatas antes de inserir
        const rowsToInsert: typeof toInsert = [];
        if (Object.keys(rowActions).length > 0) {
          // Verificar duplicatas para cada linha com ação definida
          const duplicateCheck = await checkDuplicatesInRows(
            validRows.map((r) => ({
              name: r.name,
              fichaTecnica: r.informacaoTecnica ?? undefined,
              presentation: r.presentation,
              ean: r.gtin ?? r.barcode,
            })),
            input.supplierId
          );
          for (let i = 0; i < toInsert.length; i++) {
            const rowData = toInsert[i];
            const dupInfo = duplicateCheck[i];
            const action = rowActions[String(i)] ?? (dupInfo?.status === "duplicate" ? "update" : "insert");

            if (action === "skip") {
              skippedByAction++;
              continue;
            } else if (action === "update" && dupInfo?.existingId) {
              await mergeProductFromRow(dupInfo.existingId, rowData);
              updated++;
            } else if (action === "replace" && dupInfo?.existingId) {
              // Desativa o existente e insere o novo
              const { getDb: _getDb } = await import("./db");
              const _db = await _getDb();
              if (_db) {
                const { products: _products } = await import("../drizzle/schema");
                const { eq: _eq } = await import("drizzle-orm");
                await _db.update(_products).set({ isActive: "no" }).where(_eq(_products.id, dupInfo.existingId));
              }
              rowsToInsert.push(rowData);
            } else {
              // "insert" ou sem ação definida
              rowsToInsert.push(rowData);
            }
          }
        } else {
          rowsToInsert.push(...toInsert);
        }

        const { inserted, skipped, errors } = await bulkInsertProducts(rowsToInsert);
        const enrichedCount = enrichmentMap.size;

        const finalStatus = inserted > 0 ? "done" : "error";
        const errorSummary =
          errors.length > 0
            ? `${errors.length} linha(s) com erro: ` +
              errors
                .slice(0, 5)
                .map((e) => `Linha ${e.row} ("${e.name}"): ${e.reason}`)
                .join(" | ") +
              (errors.length > 5 ? ` ... e mais ${errors.length - 5}` : "")
            : undefined;

        await updateImportLog(batchId, {
          status: finalStatus,
          importedRows: inserted,
          errorRows: skipped,
          errorMessage: errorSummary,
        });

        return {
          success: true,
          imported: inserted,
          updated,
          skipped: skipped + skippedByAction,
          enriched: enrichedCount,
          rowErrors: errors.slice(0, 20),
          batchId,
        };
       }),

    // ── processUploadV2: novos campos + IA para categoria/subcategoria + preços por fornecedor ──
    processUploadV2: protectedProcedure
      .input(
        z.object({
          fileName: z.string(),
          fileUrl: z.string().optional(),
          rows: z.array(
            z.object({
              ean: z.string().optional(),           // Código EAN / GTIN
              codigoMapa: z.string().optional(),    // Código MAPA/ANVISA/FORN
              codigoFornecedor: z.string().optional(), // Código do fornecedor
              nome: z.string(),                     // Nome do produto
              categoria: z.string().optional(),     // Categoria (se já preenchida)
              subcategoria: z.string().optional(),  // Subcategoria (se já preenchida)
              fichaTecnica: z.string().optional(),  // Ficha técnica / bula
              apresentacao: z.string().optional(),  // Apresentação
              fabricante: z.string().optional(),    // Fabricante
              preco: z.string().optional(),         // Preço de referência
              linkProduto: z.string().optional(),   // Link do produto
              urlImagem: z.string().optional(),     // URL da imagem
              // Preços por fornecedor: chave = nome do fornecedor, valor = preço
              precosFornecedor: z.record(z.string(), z.string()).optional(),
            })
          ).max(3000),
          supplierId: z.number().optional().nullable(),
          replaceExisting: z.boolean().optional(),
          rowActions: z.record(z.string(), z.enum(["update", "skip", "replace", "insert"])).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const sanitiseText = (v?: string, maxLen = 512) => {
          if (!v) return null;
          const t = v.trim();
          return t.length > maxLen ? t.slice(0, maxLen) : t || null;
        };
        const sanitisePrice = (v?: string) => {
          if (!v) return null;
          const cleaned = v.replace(/[^0-9.,]/g, "").replace(",", ".");
          const num = parseFloat(cleaned);
          return isNaN(num) ? null : cleaned;
        };

        const validRows = input.rows.filter(r => r.nome?.trim());
        if (validRows.length === 0) return { success: false, imported: 0, updated: 0, skipped: 0, enriched: 0, rowErrors: [], batchId: 0 };

        // ── 1. Criar log de importação ─────────────────────────────────────────
        const batchId = await createImportLog({
          supplierId: input.supplierId ?? null,
          categoryId: null,
          fileName: input.fileName,
          fileUrl: input.fileUrl,
          totalRows: validRows.length,
          status: "processing",
        });

        // ── 2. Gerar categoria e subcategoria por IA (em lote) ─────────────────
        const needsCategory = validRows.filter(r => !r.categoria?.trim());
        const categoryMap = new Map<string, { categoria: string; subcategoria: string }>();

        if (needsCategory.length > 0) {
          try {
            const BATCH = 40;
            for (let i = 0; i < needsCategory.length; i += BATCH) {
              const sample = needsCategory.slice(i, i + BATCH);
              const llmResp = await invokeLLM({
                messages: [
                  {
                    role: "system",
                    content: `Você é um especialista em classificação de produtos veterinários, agropecuários e farmacêuticos.
                    Classifique cada produto em UMA das categorias: "Medicamentos Veterinários", "Medicamentos Humanos", "Produtos Agro", "Insumos", "Materiais Diversos".
                    Para Medicamentos Veterinários, use subcategorias como: Antiparasitários, Antibióticos, Vacinas, Anti-inflamatórios, Anestésicos, Vitaminas e Suplementos, Hormônios, Dermatológicos, Oftalmológicos, Outros.
                    Para Medicamentos Humanos: Antibióticos, Analgésicos, Anti-inflamatórios, Vitaminas, Outros.
                    Para Produtos Agro: Herbicidas, Inseticidas, Fungicidas, Fertilizantes, Outros.
                    Para Insumos: Seringas, Agulhas, Luvas, Curativos, Outros.
                    Para Materiais Diversos: use a subcategoria mais adequada.
                    Responda APENAS com JSON.`,
                  },
                  {
                    role: "user",
                    content: `Classifique estes produtos:\n${sample.map((r, idx) => `${idx}. ${r.nome}${r.apresentacao ? ` (${r.apresentacao})` : ""}${r.fabricante ? ` - ${r.fabricante}` : ""}`).join("\n")}`,
                  },
                ],
                response_format: {
                  type: "json_schema" as const,
                  json_schema: {
                    name: "product_categories",
                    strict: true,
                    schema: {
                      type: "object",
                      properties: {
                        results: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              idx: { type: "integer" },
                              categoria: { type: "string" },
                              subcategoria: { type: "string" },
                            },
                            required: ["idx", "categoria", "subcategoria"],
                            additionalProperties: false,
                          },
                        },
                      },
                      required: ["results"],
                      additionalProperties: false,
                    },
                  },
                },
              });
              const parsed = JSON.parse(llmResp.choices[0].message.content as string) as {
                results: { idx: number; categoria: string; subcategoria: string }[];
              };
              for (const item of parsed.results) {
                const row = sample[item.idx];
                if (row) categoryMap.set(row.nome, { categoria: item.categoria, subcategoria: item.subcategoria });
              }
            }
          } catch (_) {
            // IA é best-effort — nunca bloqueia a importação
          }
        }

        // ── 3. Resolver/criar categorias no banco ──────────────────────────────
        const categoryIdMap = new Map<string, number>(); // nome -> id
        const db = await getDb();
        if (db) {
          // Carregar categorias existentes
          const existingCats = await db.select().from(categories);
          for (const cat of existingCats) categoryIdMap.set(cat.name.toLowerCase(), cat.id);

          // Criar categorias que não existem
          const uniqueCategories = new Set<string>();
          for (const row of validRows) {
            const cat = row.categoria?.trim() || categoryMap.get(row.nome)?.categoria || "Materiais Diversos";
            uniqueCategories.add(cat);
          }
          for (const catName of Array.from(uniqueCategories)) {
            if (!categoryIdMap.has(catName.toLowerCase())) {
              try {
                const slug = catName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
                const [ins] = await db.insert(categories).values({
                  name: catName,
                  slug: `${slug}-${Date.now()}`,
                  description: `Categoria criada automaticamente na importação`,
                });
                categoryIdMap.set(catName.toLowerCase(), (ins as { insertId?: number }).insertId!);
              } catch (_) { /* ignora duplicata de slug */ }
            }
          }
          // Recarregar após criação
          const refreshedCats = await db.select().from(categories);
          for (const cat of refreshedCats) categoryIdMap.set(cat.name.toLowerCase(), cat.id);
        }

        // ── 4. Resolver fornecedores para preços por fornecedor ────────────────
        const supplierIdMap = new Map<string, number>(); // nome -> id
        if (db) {
          const existingSuppliers = await db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers);
          for (const s of existingSuppliers) supplierIdMap.set(s.name.toLowerCase(), s.id);
        }
        // ── 5. Montar payload de inserção ──────────────────────────────────────────────
        const toInsert = validRows.map((r) => {
          const catName = r.categoria?.trim() || categoryMap.get(r.nome)?.categoria || "Materiais Diversos";
          const subcat = r.subcategoria?.trim() || categoryMap.get(r.nome)?.subcategoria || null;
          const catId = categoryIdMap.get(catName.toLowerCase()) ?? null;
          const eanNorm = r.ean ? r.ean.trim().replace(/\D/g, '') : null;
          return {
            supplierId: input.supplierId ?? 0, // usar o fornecedor informado na importação (0 = sem fornecedor específico)
            categoryId: catId,
            name: sanitiseText(r.nome, 512) ?? "(sem nome)",
            nomeProduto: sanitiseText(r.nome, 512) ?? "(sem nome)",
            gtin: eanNorm ?? sanitiseText(r.ean, 64),
            barcode: eanNorm ?? sanitiseText(r.ean, 128),
            ean: eanNorm ?? null,
            mapa: sanitiseText(r.codigoMapa, 128),
            codigoFornecedor: sanitiseText(r.codigoFornecedor, 128),
            subcategoria: sanitiseText(subcat ?? undefined, 256),
            fichaTecnica: sanitiseText(r.fichaTecnica, 5000),
            presentation: sanitiseText(r.apresentacao, 256),
            manufacturer: sanitiseText(r.fabricante, 256),
            laboratorio: sanitiseText(r.fabricante, 256),
            price: sanitisePrice(r.preco),
            productUrl: sanitiseText(r.linkProduto, 2000),
            imageUrl: sanitiseText(r.urlImagem, 2000),
            importBatchId: batchId,
            isActive: "yes" as const,
          };
        });

         // ── 6. Pré-verificar duplicatas em lote (EAN + nome exato + fuzzy Jaro-Winkler) ──────
        const dupCheckRows = validRows.map(r => ({
          name: r.nome,
          fichaTecnica: r.fichaTecnica ?? undefined,
          presentation: r.apresentacao,
          ean: r.ean,
        }));
        const dupResults = input.supplierId
          ? await checkDuplicatesInRows(dupCheckRows, input.supplierId)
          : dupCheckRows.map((r, i) => ({ rowIndex: i, name: r.name ?? "", fichaTecnica: null, presentation: r.presentation ?? null, status: "new" as const, existingId: null, existingName: null, existingFichaTecnica: null, existingPresentation: null, existingPrice: null, existingSupplierName: null }));
        const dupMap = new Map<number, typeof dupResults[0]>();
        for (const d of dupResults) dupMap.set(d.rowIndex, d);
        // ── 7. Inserir produtos e registrar preços por fornecedor ──────────────
        let inserted = 0;
        let updated = 0;
        let skippedByAction = 0;
        let duplicatesDetected = 0;
        const errors: { row: number; name: string; reason: string }[] = [];
        const duplicatesList: { row: number; name: string; existingName: string; existingId: number }[] = [];
        const rowActions = input.rowActions ?? {};
        const supplierPriceEntries: { productId: number; supplierId: number; price: string | null }[] = [];
        for (let i = 0; i < toInsert.length; i++) {
          const rowData = toInsert[i];
          const origRow = validRows[i];
          const dupInfo = dupMap.get(i);
          const action = rowActions[String(i)] ?? (dupInfo?.status === "duplicate" ? "update" : "insert");
          if (action === "skip") { skippedByAction++; continue; }
          try {
            let productId: number | null = null;
            // Usar resultado do pré-check de duplicatas (EAN + nome exato + fuzzy)
            let existingProductId: number | null = dupInfo?.existingId ?? null;
            // Registrar duplicata detectada
            if (dupInfo?.status === "duplicate" && dupInfo.existingId) {
              duplicatesDetected++;
              duplicatesList.push({ row: i + 1, name: rowData.name, existingName: dupInfo.existingName ?? rowData.name, existingId: dupInfo.existingId });
            }
            if (action === "update" || action === "replace" || (action === "insert" && existingProductId)) {
              if (existingProductId) {
                if (action === "replace") {
                  await db!.update(products).set({ isActive: "no" }).where(eq(products.id, existingProductId));
                  const [ins] = await db!.insert(products).values(rowData);
                  productId = (ins as { insertId?: number }).insertId!;
                  inserted++;
                } else {
                  // Mesclar: atualizar apenas campos não nulos
                  const mergeData: Record<string, unknown> = {};
                  for (const [k, v] of Object.entries(rowData)) {
                    if (v !== null && v !== undefined && v !== '') mergeData[k] = v;
                  }
                  await db!.update(products).set(mergeData).where(eq(products.id, existingProductId));
                  productId = existingProductId;
                  updated++;
                }
              } else {
                const [ins] = await db!.insert(products).values(rowData);
                productId = (ins as { insertId?: number }).insertId!;
                inserted++;
              }
            } else {
              // insert sem duplicata
              if (db) {
                const [ins] = await db.insert(products).values(rowData);
                productId = (ins as { insertId?: number }).insertId!;
                inserted++;
              }
            }

            // Registrar preços por fornecedor
            if (productId && origRow.precosFornecedor) {
              for (const [supplierName, priceStr] of Object.entries(origRow.precosFornecedor)) {
                const sId = supplierIdMap.get(supplierName.toLowerCase());
                if (sId) {
                  const price = sanitisePrice(priceStr);
                  supplierPriceEntries.push({ productId, supplierId: sId, price });
                }
              }
            }
          } catch (err) {
            errors.push({ row: i + 1, name: rowData.name, reason: String(err).slice(0, 200) });
          }
        }

        // ── 7. Salvar preços por fornecedor em lote ────────────────────────────
        if (supplierPriceEntries.length > 0) {
          const { batchUpsertSupplierPrices } = await import("./db");
          await batchUpsertSupplierPrices(supplierPriceEntries);
        }

        await updateImportLog(batchId, {
          status: inserted + updated > 0 ? "done" : "error",
          importedRows: inserted,
          errorRows: errors.length,
          errorMessage: errors.length > 0 ? errors.slice(0, 5).map(e => `L${e.row}: ${e.reason}`).join(" | ") : undefined,
        });

        // Notificar proprietário se duplicatas foram detectadas
        if (duplicatesDetected > 0) {
          const topDuplicates = duplicatesList.slice(0, 10);
          const listText = topDuplicates
            .map((d) => `- Linha ${d.row}: "${d.name}" (similar a "${d.existingName}" ID=${d.existingId})`)
            .join("\n");
          const extraMsg = duplicatesDetected > 10 ? `\n... e mais ${duplicatesDetected - 10} duplicata(s).` : "";
          await notifyOwner({
            title: `[ALERTA] ${duplicatesDetected} duplicata(s) detectada(s) na importacao`,
            content: `Arquivo: ${input.fileName}\nFornecedor ID: ${input.supplierId}\nTotal importado: ${inserted} | Atualizados: ${updated} | Duplicatas: ${duplicatesDetected}\n\nPrimeiras duplicatas detectadas:\n${listText}${extraMsg}`,
          }).catch(() => { /* notificacao e best-effort */ });
        }

        return {
          success: true,
          imported: inserted,
          updated,
          skipped: skippedByAction,
          enriched: categoryMap.size,
          rowErrors: errors.slice(0, 20),
          batchId,
          duplicatesDetected,
          duplicatesList: duplicatesList.slice(0, 50),
        };
      }),

    // ── getStatus: polling de status de uma importação em andamento ──
    getStatus: publicProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;
        const rows = await db
          .select({
            id: importLogs.id,
            status: importLogs.status,
            totalRows: importLogs.totalRows,
            importedRows: importLogs.importedRows,
            errorRows: importLogs.errorRows,
            errorMessage: importLogs.errorMessage,
            updatedAt: importLogs.updatedAt,
          })
          .from(importLogs)
          .where(eq(importLogs.id, input.batchId))
          .limit(1);
        if (!rows[0]) return null;
        const row = rows[0];
        const pct = row.totalRows && row.totalRows > 0
          ? Math.min(100, Math.round(((row.importedRows ?? 0) / row.totalRows) * 100))
          : 0;
        return { ...row, progressPct: pct };
      }),

    // ── getErrors: erros linha a linha de uma importação ──
    getErrors: publicProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { errors: [], total: 0 };
        const rows = await db
          .select({ errorMessage: importLogs.errorMessage, errorRows: importLogs.errorRows, totalRows: importLogs.totalRows })
          .from(importLogs)
          .where(eq(importLogs.id, input.batchId))
          .limit(1);
        if (!rows[0]) return { errors: [], total: 0 };
        const raw = rows[0].errorMessage ?? "";
        // Formato salvo: "L1: razão | L2: razão"
        const errors = raw
          ? raw.split(" | ").map((e, i) => {
              const match = e.match(/^L(\d+): (.+)$/);
              return match
                ? { row: Number(match[1]), reason: match[2] }
                : { row: i + 1, reason: e };
            })
          : [];
        return { errors, total: rows[0].errorRows ?? 0 };
      }),

    // ── previewCategoryClassification: classifica produtos em lote por IA antes de importar ──
    previewCategoryClassification: protectedProcedure
      .input(z.object({
        rows: z.array(z.object({
          rowIndex: z.number(),
          nome: z.string().optional(),
          principioAtivo: z.string().optional(),
          fabricante: z.string().optional(),
          apresentacao: z.string().optional(),
          categoria: z.string().optional(),
          subcategoria: z.string().optional(),
        })),
      }))
      .mutation(async ({ input }) => {
        const { rows } = input;
        if (rows.length === 0) return [];

        // Busca categorias existentes para sugerir as corretas
        const db = await getDb();
        const existingCategories = db ? await db.select({ id: categories.id, name: categories.name }).from(categories) : [];
        const catNames = existingCategories.map(c => c.name).join(", ");

        // Classifica em lotes de 30 para não sobrecarregar o LLM
        const BATCH_SIZE = 30;
        const results: Array<{
          rowIndex: number;
          categoria: string;
          subcategoria: string;
          confidence: "alta" | "media" | "baixa";
          justificativa: string;
          manualOverride: boolean;
        }> = [];

        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          const batch = rows.slice(i, i + BATCH_SIZE);
          // Produtos que já têm categoria definida na planilha não precisam de IA
          const needsAI = batch.filter(r => !r.categoria || r.categoria.trim() === "");
          const hasCategory = batch.filter(r => r.categoria && r.categoria.trim() !== "");

          // Adiciona os que já têm categoria com confiança alta
          for (const r of hasCategory) {
            results.push({
              rowIndex: r.rowIndex,
              categoria: r.categoria!,
              subcategoria: r.subcategoria ?? "",
              confidence: "alta",
              justificativa: "Categoria definida na planilha",
              manualOverride: false,
            });
          }

          if (needsAI.length === 0) continue;

          const productList = needsAI.map((r, idx) =>
            `${idx + 1}. Nome: "${r.nome ?? ""}", Princípio Ativo: "${r.principioAtivo ?? ""}", Fabricante: "${r.fabricante ?? ""}", Apresentação: "${r.apresentacao ?? ""}"`
          ).join("\n");

          const prompt = `Você é um especialista em classificação de produtos veterinários, agropecuários e farmacêuticos.

Categorias disponíveis no sistema: ${catNames || "Medicamentos Veterinários, Medicamentos Humanos, Produtos Agro, Rações, Insumos e Materiais"}

Classifique cada produto abaixo com:
- categoria: uma das categorias disponíveis (ou crie uma nova se necessário)
- subcategoria: subcategoria específica (ex: Antiparasitários, Antibióticos, Vacinas, Suplementos, etc.)
- confidence: "alta" (nome/princípio ativo claro), "media" (alguma ambiguidade), "baixa" (dados insuficientes)
- justificativa: uma frase curta explicando a classificação

Produtos:
${productList}

Responda APENAS com JSON array no formato:
[{"idx": 1, "categoria": "...", "subcategoria": "...", "confidence": "alta|media|baixa", "justificativa": "..."}]`;

          try {
            const response = await invokeLLM({
              messages: [
                { role: "system", content: "Você é um especialista em classificação de produtos. Responda apenas com JSON válido." },
                { role: "user", content: prompt },
              ],
              response_format: { type: "json_object" } as any,
            });
            const rawContent = response?.choices?.[0]?.message?.content ?? "[]";
            const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
            let parsed: any[] = [];
            try {
              const obj = JSON.parse(content);
              parsed = Array.isArray(obj) ? obj : (obj.items ?? obj.products ?? obj.result ?? []);
            } catch { parsed = []; }

            for (let j = 0; j < needsAI.length; j++) {
              const r = needsAI[j];
              const aiResult = parsed.find((p: any) => p.idx === j + 1) ?? parsed[j];
              results.push({
                rowIndex: r.rowIndex,
                categoria: aiResult?.categoria ?? "Sem Categoria",
                subcategoria: aiResult?.subcategoria ?? "",
                confidence: (aiResult?.confidence as any) ?? "baixa",
                justificativa: aiResult?.justificativa ?? "Classificação automática",
                manualOverride: false,
              });
            }
          } catch {
            // Fallback: marca como baixa confiança
            for (const r of needsAI) {
              results.push({
                rowIndex: r.rowIndex,
                categoria: "Sem Categoria",
                subcategoria: "",
                confidence: "baixa",
                justificativa: "Erro na classificação automática",
                manualOverride: false,
              });
            }
          }
        }

        // Ordena pelo rowIndex original
        results.sort((a, b) => a.rowIndex - b.rowIndex);
        return results;
      }),

    // ── applyCategoryReviewToCatalog: aplica categorias revisadas aos produtos já existentes no catálogo ──
    applyCategoryReviewToCatalog: protectedProcedure
      .input(
        z.object({
          reviews: z.array(
            z.object({
              nome: z.string(),
              categoria: z.string(),
              subcategoria: z.string().optional(),
            })
          ),
          matchMode: z.enum(["exact", "fuzzy"]).optional().default("fuzzy"),
        })
      )
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB not available");
        let updated = 0;
        let notFound = 0;
        const errors: string[] = [];

        // Pré-carregar mapa de categorias (nome -> id)
        const existingCats = await db.select({ id: categories.id, name: categories.name }).from(categories);
        const categoryIdMap = new Map<string, number>();
        for (const cat of existingCats) categoryIdMap.set(cat.name.toLowerCase(), cat.id);

        // Função auxiliar para resolver/criar categoria
        const resolveCategoryId = async (catName: string): Promise<number | null> => {
          const key = catName.toLowerCase();
          if (categoryIdMap.has(key)) return categoryIdMap.get(key)!;
          // Criar categoria se não existir
          try {
            const slug = key.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
            const [ins] = await db.insert(categories).values({
              name: catName,
              slug: `${slug}-${Date.now()}`,
              description: `Categoria criada automaticamente na revisão de importação`,
            });
            const newId = (ins as { insertId?: number }).insertId!;
            categoryIdMap.set(key, newId);
            return newId;
          } catch (_) {
            // Pode ter sido criada por outra requisição concorrente
            const refreshed = await db.select({ id: categories.id, name: categories.name }).from(categories).where(sql`LOWER(${categories.name}) = ${key}`);
            if (refreshed.length > 0) { categoryIdMap.set(key, refreshed[0].id); return refreshed[0].id; }
            return null;
          }
        };

        for (const review of input.reviews) {
          try {
            const nomeLower = review.nome.toLowerCase().trim();
            const catId = await resolveCategoryId(review.categoria);
            const setFields = {
              categoryId: catId,
              subcategoria: review.subcategoria ?? null,
              updatedAt: new Date(),
            };

            // Busca por nome exato (case-insensitive)
            const matches = await db
              .select({ id: products.id, name: products.name })
              .from(products)
              .where(sql`LOWER(TRIM(${products.name})) = ${nomeLower}`);

            if (matches.length === 0 && input.matchMode === "fuzzy") {
              // Busca fuzzy: nome contém ou é contido
              const fuzzyMatches = await db
                .select({ id: products.id, name: products.name })
                .from(products)
                .where(sql`LOWER(${products.name}) LIKE ${`%${nomeLower}%`}`);
              if (fuzzyMatches.length > 0) {
                await db
                  .update(products)
                  .set(setFields)
                  .where(eq(products.id, fuzzyMatches[0].id));
                updated++;
              } else {
                notFound++;
              }
            } else if (matches.length > 0) {
              for (const match of matches) {
                await db
                  .update(products)
                  .set(setFields)
                  .where(eq(products.id, match.id));
              }
              updated += matches.length;
            } else {
              notFound++;
            }
          } catch (e: any) {
            errors.push(`Erro ao atualizar "${review.nome}": ${e?.message}`);
          }
        }

        return { success: true, updated, notFound, errors };
      }),

    // ── startBatchImport: inicia importação em lote com progresso em tempo real ──
    startBatchImport: protectedProcedure
      .input(z.object({
        rows: z.array(z.record(z.string(), z.string())).max(3000),
        supplierId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          if (!input.rows || input.rows.length === 0) throw new Error("Array 'rows' não pode estar vazio");
          if (!ctx.user?.id) throw new Error("Usuário não autenticado");
          const { startImportBatchJob } = await import("./jobs/importBatchJob");
          const queueId = await startImportBatchJob(input.rows, input.supplierId, ctx.user.id);
          return { queueId, totalRows: input.rows.length, message: `Importação iniciada com ${input.rows.length} linhas` };
        } catch (error: any) {
          console.error("[startBatchImport]", error?.message || error);
          throw new Error(`Erro ao iniciar importação: ${error?.message || "Erro desconhecido"}`);
        }
      }),

    // ── getImportProgress: obtém progresso da importação em lote ──
    getImportProgress: publicProcedure
      .input(z.object({ queueId: z.string().uuid() }))
      .query(async ({ input }) => {
        try {
          const { getImportProgress } = await import("./jobs/importBatchJob");
          const progress = getImportProgress(input.queueId);
          if (!progress) return { found: false, message: "Importação não encontrada ou expirada" };
          return { found: true, ...progress };
        } catch (error: any) {
          console.error("[getImportProgress]", error?.message || error);
          throw new Error(`Erro ao obter progresso: ${error?.message || "Erro desconhecido"}`);
        }
      }),
  }),
   // ─── Dashboard ────────────────────────────────────────────────────────────
  dashboard: router({
    stats: publicProcedure.query(() => getDashboardStats()),
    productsPerCategory: publicProcedure.query(() => getProductsPerCategory()),
    expiringProposals: publicProcedure
      .input(z.object({ daysAhead: z.number().optional() }).optional())
      .query(({ input }) => getExpiringProposals(input?.daysAhead ?? 7)),
    financialSummary: publicProcedure.query(() => getFinancialSummary()),
    proposalStats: publicProcedure.query(() => getProposalFinancialStats()),
    marginByCategory: publicProcedure.query(() => getMarginByCategory()),
    extendedStats: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { revenueInOrders: 0, avgTicket: 0, wonProposals: 0, productsWithoutCategory: 0, productsWithoutAI: 0 };
      const [orderRows, wonRows, noCatRows, noAIRows] = await Promise.all([
        db.select({ total: sql<number>`COALESCE(SUM(CAST(${proposals.totalValue} AS DECIMAL(15,2))), 0)` })
          .from(proposals)
          .where(inArray(proposals.status, ["order", "in_transit", "delivered"])),
        db.select({ count: sql<number>`count(*)`, total: sql<number>`COALESCE(SUM(CAST(${proposals.totalValue} AS DECIMAL(15,2))), 0)` })
          .from(proposals)
          .where(eq(proposals.status, "delivered")),
        db.select({ count: sql<number>`count(*)` })
          .from(products)
          .where(and(eq(products.isActive, "yes"), isNull(products.categoryId))),
        db.select({ count: sql<number>`count(*)` })
          .from(products)
          .where(and(eq(products.isActive, "yes"), or(isNull(products.fichaTecnica), sql`${products.fichaTecnica} = ''`))),
      ]);
      const revenueInOrders = Number(orderRows[0]?.total ?? 0);
      const wonCount = Number(wonRows[0]?.count ?? 0);
      const wonTotal = Number(wonRows[0]?.total ?? 0);
      return {
        revenueInOrders,
        avgTicket: wonCount > 0 ? wonTotal / wonCount : 0,
        wonProposals: wonCount,
        productsWithoutCategory: Number(noCatRows[0]?.count ?? 0),
        productsWithoutAI: Number(noAIRows[0]?.count ?? 0),
      };
    }),

     recentActivity: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select({
          id: proposals.id,
          title: proposals.title,
          orgName: proposals.orgName,
          status: proposals.status,
          totalValue: proposals.totalValue,
          updatedAt: proposals.updatedAt,
        })
        .from(proposals)
        .orderBy(desc(proposals.updatedAt))
        .limit(5);
    }),

    // ── catalogHealth: saúde cadastral detalhada do catálogo ──
    catalogHealth: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { withoutFichaTecnica: 0, withoutActiveIngredient: 0, withoutManufacturer: 0, withoutEan: 0, withoutCategory: 0, withoutImage: 0, withoutPrice: 0, total: 0 };
      // Query consolidada: 1 passagem pela tabela em vez de 7 queries separadas
      const [healthRow] = await db
        .select({
          total: sql<number>`COUNT(*)`,
          noFicha: sql<number>`SUM(CASE WHEN (fichaTecnica IS NULL OR fichaTecnica = '') THEN 1 ELSE 0 END)`,
          noMfr: sql<number>`SUM(CASE WHEN (manufacturer IS NULL OR manufacturer = '') THEN 1 ELSE 0 END)`,
          noEan: sql<number>`SUM(CASE WHEN (ean IS NULL AND gtin IS NULL AND barcode IS NULL) THEN 1 ELSE 0 END)`,
          noCat: sql<number>`SUM(CASE WHEN categoryId IS NULL THEN 1 ELSE 0 END)`,
          noImg: sql<number>`SUM(CASE WHEN (imageUrl IS NULL OR imageUrl = '') THEN 1 ELSE 0 END)`,
          noPrice: sql<number>`SUM(CASE WHEN (price IS NULL OR price = '0.00') THEN 1 ELSE 0 END)`,
        })
        .from(products)
        .where(eq(products.isActive, "yes"));
      return {
        total: Number(healthRow?.total ?? 0),
        withoutFichaTecnica: Number(healthRow?.noFicha ?? 0),
        withoutActiveIngredient: Number(healthRow?.noFicha ?? 0), // alias para compatibilidade
        withoutManufacturer: Number(healthRow?.noMfr ?? 0),
        withoutEan: Number(healthRow?.noEan ?? 0),
        withoutCategory: Number(healthRow?.noCat ?? 0),
        withoutImage: Number(healthRow?.noImg ?? 0),
        withoutPrice: Number(healthRow?.noPrice ?? 0),
      };
    }),

    // ── proposalPipeline: pipeline de propostas por estágio com valor e prazo ──
    proposalPipeline: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select({
          status: proposals.status,
          count: sql<number>`count(*)`,
          totalValue: sql<number>`COALESCE(SUM(CAST(${proposals.totalValue} AS DECIMAL(15,2))), 0)`,
        })
        .from(proposals)
        .groupBy(proposals.status);
      // Buscar prazo mais próximo por status
      const deadlines = await db
        .select({
          status: proposals.status,
          minDate: sql<Date>`MIN(${proposals.sentAt})`,
        })
        .from(proposals)
        .where(sql`${proposals.sentAt} IS NOT NULL`)
        .groupBy(proposals.status);
      const deadlineMap = Object.fromEntries(deadlines.map(d => [d.status, d.minDate]));
      return rows.map(r => ({
        status: r.status,
        count: Number(r.count),
        totalValue: Number(r.totalValue),
        nearestDeadline: deadlineMap[r.status] ?? null,
      }));
    }),

    // ── actionQueue: fila de ações do dia priorizadas ──
    actionQueue: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const now = new Date();
      const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      // Paralelizar todas as queries com Promise.all para reduzir latência
      const [drafts, noCat, noFicha, expiring, sentProposals] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(proposals).where(eq(proposals.status, "draft")),
        db.select({ count: sql<number>`count(*)` }).from(products).where(and(eq(products.isActive, "yes"), isNull(products.categoryId))),
        db.select({ count: sql<number>`count(*)` }).from(products).where(and(eq(products.isActive, "yes"), or(isNull(products.fichaTecnica), sql`${products.fichaTecnica} = ''`))),
        db.select({ count: sql<number>`count(*)` }).from(proposals).where(and(
          sql`${proposals.sentAt} IS NOT NULL`,
          sql`DATE_ADD(${proposals.sentAt}, INTERVAL COALESCE(${proposals.validityDays}, 30) DAY) <= ${in7Days}`,
          sql`DATE_ADD(${proposals.sentAt}, INTERVAL COALESCE(${proposals.validityDays}, 30) DAY) >= ${now}`,
          sql`${proposals.status} NOT IN ('delivered','cancelled')`
        )),
        db.select({ count: sql<number>`count(*)` }).from(proposals).where(eq(proposals.status, "sent")),
      ]);
      const items: Array<{ type: string; label: string; detail: string; href: string; priority: "critical" | "warning" | "info" }> = [];
      const draftCount = Number(drafts[0]?.count ?? 0);
      const noCatCount = Number(noCat[0]?.count ?? 0);
      const noFichaCount = Number(noFicha[0]?.count ?? 0);
      const expiringCount = Number(expiring[0]?.count ?? 0);
      const sentCount = Number(sentProposals[0]?.count ?? 0);
      if (expiringCount > 0) items.push({ type: "proposal", label: `${expiringCount} proposta${expiringCount > 1 ? "s" : ""} vencendo em 7 dias`, detail: "Verificar prazo de entrega", href: "/propostas-admin", priority: "critical" });
      if (draftCount > 0) items.push({ type: "proposal", label: `${draftCount} proposta${draftCount > 1 ? "s" : ""} em rascunho`, detail: "Continuar montagem", href: "/propostas-admin", priority: "warning" });
      if (sentCount > 0) items.push({ type: "proposal", label: `${sentCount} proposta${sentCount > 1 ? "s" : ""} aguardando retorno`, detail: "Acompanhar status", href: "/propostas-admin", priority: "info" });
      if (noCatCount > 0) items.push({ type: "catalog", label: `${noCatCount} produto${noCatCount > 1 ? "s" : ""} sem categoria`, detail: "Reclassificar com IA", href: "/produtos", priority: noCatCount > 100 ? "warning" : "info" });
      if (noFichaCount > 0) items.push({ type: "catalog", label: `${noFichaCount} produto${noFichaCount > 1 ? "s" : ""} sem ficha técnica`, detail: "Enriquecer via IA", href: "/enriquecimento", priority: noFichaCount > 200 ? "warning" : "info" });
      const priorityOrder = { critical: 0, warning: 1, info: 2 };
      return items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    }),
  }),
  // ─── Quotations ───────────────────────────────────────────────────────────

  // ─── Company Settings ────────────────────────────────────────────────────────
  company: router({
    get: publicProcedure.query(() => getCompanySettings()),
    upsert: publicProcedure
      .input(
        z.object({
          name: z.string().max(256).optional(),
          cnpj: z.string().max(18).optional().nullable(),
          address: z.string().optional().nullable(),
          city: z.string().max(128).optional().nullable(),
          state: z.string().max(2).optional().nullable(),
          zipCode: z.string().max(10).optional().nullable(),
          phone: z.string().max(32).optional().nullable(),
          email: z.string().max(320).optional().nullable(),
          website: z.string().max(256).optional().nullable(),
          logoUrl: z.string().optional().nullable(),
          bankInfo: z.string().optional().nullable(),
          notes: z.string().optional().nullable(),
          minMarginPercent: z.number().min(0).max(100).optional().nullable(),
        })
      )
      .mutation(({ input }) => upsertCompanySettings(input as any)),
  }),

  // ─── Requesting Orgs ─────────────────────────────────────────────────────────
  orgs: router({
    list: publicProcedure
      .input(z.object({ search: z.string().optional() }))
      .query(({ input }) => listRequestingOrgs(input.search)),

    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getRequestingOrgById(input.id)),

    upsert: publicProcedure
      .input(
        z.object({
          name: z.string().min(1).max(256),
          cnpj: z.string().max(18).optional().nullable(),
          address: z.string().optional().nullable(),
          city: z.string().max(128).optional().nullable(),
          state: z.string().max(2).optional().nullable(),
          phone: z.string().max(32).optional().nullable(),
          email: z.string().max(320).optional().nullable(),
          contactPerson: z.string().max(256).optional().nullable(),
          notes: z.string().optional().nullable(),
        })
      )
      .mutation(({ input }) => upsertRequestingOrg(input as any)),

    update: publicProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).max(256).optional(),
          cnpj: z.string().max(18).optional().nullable(),
          address: z.string().optional().nullable(),
          city: z.string().max(128).optional().nullable(),
          state: z.string().max(2).optional().nullable(),
          phone: z.string().max(32).optional().nullable(),
          email: z.string().max(320).optional().nullable(),
          contactPerson: z.string().max(256).optional().nullable(),
          notes: z.string().optional().nullable(),
        })
      )
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return updateRequestingOrg(id, data as any);
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteRequestingOrg(input.id)),
  }),

  // ─── Proposals ───────────────────────────────────────────────────────────────
  proposals: router({
    list: publicProcedure.query(() => listProposals()),

    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getProposalWithItems(input.id)),
    create: publicProcedure
      .input(
        z.object({
          title: z.string().min(1).max(256),
          processNumber: z.string().max(128).optional().nullable(),
          orgId: z.number().optional().nullable(),
          orgName: z.string().max(256).optional().nullable(),
          status: z.enum(["draft", "sent", "order", "in_transit", "delivered", "cancelled"]).optional(),
          validityDays: z.number().optional(),
          paymentTerms: z.string().max(256).optional().nullable(),
          deliveryTerms: z.string().max(256).optional().nullable(),
          notes: z.string().optional().nullable(),
          origem: z.string().max(32).optional().nullable(),
          radarOpportunityId: z.number().optional().nullable(),
        })
      )
      .mutation(({ input }) => createProposal(input as any)),

    update: publicProcedure
      .input(
        z.object({
          id: z.number(),
          title: z.string().min(1).max(256).optional(),
          processNumber: z.string().max(128).optional().nullable(),
          orgId: z.number().optional().nullable(),
          orgName: z.string().max(256).optional().nullable(),
          status: z.enum(["draft", "sent", "order", "in_transit", "delivered", "cancelled"]).optional(),
          validityDays: z.number().optional(),
          paymentTerms: z.string().max(256).optional().nullable(),
          deliveryTerms: z.string().max(256).optional().nullable(),
          notes: z.string().optional().nullable(),
          notesHtml: z.string().optional().nullable(),
        })
      )
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return updateProposal(id, data as any);
      }),

     delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteProposal(input.id)),

    addItem: publicProcedure
      .input(
        z.object({
          proposalId: z.number(),
          productId: z.number().optional().nullable(),
          productName: z.string().min(1).max(512),
          activeIngredient: z.string().max(512).optional().nullable(),
          manufacturer: z.string().max(256).optional().nullable(),
          concentration: z.string().max(128).optional().nullable(),
          presentation: z.string().max(256).optional().nullable(),
          unit: z.string().max(64).optional().nullable(),
          supplierName: z.string().max(256).optional().nullable(),
          unitPrice: z.string().optional().nullable(),
          quantity: z.number().min(1).default(1),
          notes: z.string().optional().nullable(),
          imageUrl: z.string().optional().nullable(),
          productUrl: z.string().optional().nullable(),
          registroMapa: z.string().max(128).optional().nullable(),
        })
      )
      .mutation(({ input }) => addProposalItem(input as any)),

    updateItem: publicProcedure
      .input(
        z.object({
          id: z.number(),
          productId: z.number().optional().nullable(),
          productName: z.string().max(512).optional(),
          activeIngredient: z.string().max(512).optional().nullable(),
          manufacturer: z.string().max(256).optional().nullable(),
          concentration: z.string().max(128).optional().nullable(),
          presentation: z.string().max(256).optional().nullable(),
          unit: z.string().max(64).optional().nullable(),
          supplierName: z.string().max(256).optional().nullable(),
          unitPrice: z.string().optional().nullable(),
          costPrice: z.string().optional().nullable(),
          editalRefPrice: z.string().optional().nullable(),
          suggestedPrice: z.string().optional().nullable(),
          quantity: z.number().min(1).optional(),
          notes: z.string().optional().nullable(),
          sortOrder: z.number().optional(),
          registroMapa: z.string().max(128).optional().nullable(),
          imageUrl: z.string().max(2000).optional().nullable(),
          productUrl: z.string().max(2000).optional().nullable(),
        })
      )
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return updateProposalItem(id, data as any);
      }),

    removeItem: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => removeProposalItem(input.id)),
    // Administration
    listAdmin: publicProcedure
      .input(z.object({
        status: z.string().optional(),
        orgName: z.string().optional(),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
      }).optional())
      .query(({ input }) => listProposalsAdmin(input)),
    advanceStatus: publicProcedure
      .input(z.object({
        id: z.number(),
        newStatus: z.enum(["draft", "sent", "order", "in_transit", "delivered", "cancelled"]),
        notes: z.string().optional(),
        // Parcelamento: apenas quando newStatus === 'delivered'
        installments: z.number().int().min(1).max(60).optional(),
        firstDueDate: z.date().optional(), // data de vencimento da 1ª parcela
      }))
      .mutation(async ({ input }) => {
        await advanceProposalStatus(input.id, input.newStatus, input.notes);
        // Gerar entradas financeiras parceladas ao marcar como entregue
        if (input.newStatus === "delivered" && input.installments && input.installments > 1) {
          const db = await getDb();
          if (!db) return { success: true };
          const [proposal] = await db
            .select({ totalValue: proposals.totalValue, title: proposals.title, orgName: proposals.orgName })
            .from(proposals)
            .where(eq(proposals.id, input.id))
            .limit(1);
          if (proposal?.totalValue) {
            const total = parseFloat(String(proposal.totalValue));
            const parcelValue = total / input.installments;
            const baseDate = input.firstDueDate ? new Date(input.firstDueDate) : new Date();
            for (let i = 0; i < input.installments; i++) {
              const dueDate = new Date(baseDate);
              dueDate.setMonth(dueDate.getMonth() + i);
              await createFinancialEntry({
                type: "income",
                category: "Proposta",
                description: `${proposal.title ?? "Proposta"} — Parcela ${i + 1}/${input.installments}${proposal.orgName ? ` (${proposal.orgName})` : ""}`,
                amount: String(parcelValue.toFixed(2)) as any,
                dueDate,
                isPaid: "no",
                proposalId: input.id,
              });
            }
          }
        } else if (input.newStatus === "delivered") {
          // Parcela única — criar uma entrada financeira
          const db = await getDb();
          if (!db) return { success: true };
          const [proposal] = await db
            .select({ totalValue: proposals.totalValue, title: proposals.title, orgName: proposals.orgName })
            .from(proposals)
            .where(eq(proposals.id, input.id))
            .limit(1);
          if (proposal?.totalValue) {
            const dueDate = input.firstDueDate ? new Date(input.firstDueDate) : new Date();
            await createFinancialEntry({
              type: "income",
              category: "Proposta",
              description: `${proposal.title ?? "Proposta"}${proposal.orgName ? ` (${proposal.orgName})` : ""}`,
              amount: String(parseFloat(String(proposal.totalValue)).toFixed(2)) as any,
              dueDate,
              isPaid: "no",
              proposalId: input.id,
            });
          }
        }
        return { success: true };
      }),
    updateFreight: publicProcedure
      .input(z.object({
        id: z.number(),
        freightValue: z.string().optional().nullable(),
        freightCarrier: z.string().max(256).optional().nullable(),
        freightTrackingCode: z.string().max(128).optional().nullable(),
        freightPaidAt: z.date().optional().nullable(),
      }))
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return updateProposalFreight(id, data as any);
      }),
    getStatusHistory: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getProposalStatusHistory(input.id)),
    duplicate: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => duplicateProposal(input.id)),

    // Sugestão automática de produtos a partir de lista de texto/planilha
    suggestFromList: publicProcedure
      .input(z.object({
        productNames: z.array(z.string().min(1)).min(1).max(200),
      }))
      .mutation(({ input }) => suggestProductsFromList(input.productNames)),

    // Busca similares mais baratos para um produto recém-adicionado à proposta
    findCheaperSimilar: publicProcedure
      .input(z.object({
        productId: z.number(),          // produto recém-adicionado
        unitPrice: z.string(),          // preço unitário do produto adicionado
        excludeProductId: z.number().optional().nullable(), // evitar retornar o próprio produto
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { similars: [] };

        // Buscar o produto para obter o princípio ativo
        const [prod] = await db
          .select({ activeIngredient: products.activeIngredient, name: products.name })
          .from(products)
          .where(eq(products.id, input.productId))
          .limit(1);

        if (!prod?.activeIngredient || prod.activeIngredient.trim().length < 3) {
          return { similars: [] };
        }

        const currentPrice = parseFloat(input.unitPrice);
        if (isNaN(currentPrice) || currentPrice <= 0) return { similars: [] };

        // Buscar produtos com mesmo princípio ativo e preço menor
        const similars = await db
          .select({
            id: products.id,
            name: products.name,
            activeIngredient: products.activeIngredient,
            manufacturer: products.manufacturer,
            concentration: products.concentration,
            presentation: products.presentation,
            price: products.price,
            unit: products.unit,
            imageUrl: products.imageUrl,
            supplierName: suppliers.name,
          })
          .from(products)
          .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
          .where(
            and(
              eq(products.activeIngredient, prod.activeIngredient),
              ne(products.id, input.productId),
              eq(products.isActive, "yes"),
              sql`CAST(${products.price} AS DECIMAL(12,2)) < ${currentPrice}`,
            )
          )
          .orderBy(asc(products.price))
          .limit(5);

        return {
          similars: similars.map((s) => ({
            ...s,
            price: s.price ? String(s.price) : null,
            savingPct: s.price
              ? Math.round(((currentPrice - parseFloat(String(s.price))) / currentPrice) * 100)
              : 0,
          })),
          originalName: prod.name,
          originalPrice: input.unitPrice,
          activeIngredient: prod.activeIngredient,
        };
      }),

    // ─── Validação de Equivalência para Itens de Pregão ──────────────────────────

    validateEquivalenceForItems: protectedProcedure
      .input(
        z.object({
          items: z.array(
            z.object({
              id: z.string(),
              description: z.string().min(1),
              quantity: z.number().optional(),
              unit: z.string().optional(),
              estimatedValue: z.number().optional(),
            })
          ).min(1),
        })
      )
      .mutation(async ({ input }) => {
        return validateEquivalenceForMultipleItems(input.items);
      }),
  }),

  // ─── Financial Entries ────────────────────────────────────────────────
  financial: router({
    list: publicProcedure
      .input(z.object({
        type: z.enum(["income", "expense"]).optional(),
        isPaid: z.enum(["yes", "no"]).optional(),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
        proposalId: z.number().optional(),
      }).optional())
      .query(({ input }) => listFinancialEntries(input)),
    create: publicProcedure
      .input(z.object({
        type: z.enum(["income", "expense"]),
        category: z.string().max(128).optional().nullable(),
        description: z.string().min(1).max(512),
        amount: z.string(),
        dueDate: z.date().optional().nullable(),
        paidAt: z.date().optional().nullable(),
        isPaid: z.enum(["yes", "no"]).default("no"),
        proposalId: z.number().optional().nullable(),
        notes: z.string().optional().nullable(),
      }))
      .mutation(({ input }) => createFinancialEntry(input as any)),
    update: publicProcedure
      .input(z.object({
        id: z.number(),
        type: z.enum(["income", "expense"]).optional(),
        category: z.string().max(128).optional().nullable(),
        description: z.string().max(512).optional(),
        amount: z.string().optional(),
        dueDate: z.date().optional().nullable(),
        paidAt: z.date().optional().nullable(),
        isPaid: z.enum(["yes", "no"]).optional(),
        proposalId: z.number().optional().nullable(),
        notes: z.string().optional().nullable(),
      }))
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return updateFinancialEntry(id, data as any);
      }),
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteFinancialEntry(input.id)),
    summary: publicProcedure
      .input(z.object({
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
      }).optional())
      .query(({ input }) => getFinancialSummary(input?.dateFrom, input?.dateTo)),
    proposalStats: publicProcedure
      .query(() => getProposalFinancialStats()),
    freightReport: publicProcedure
      .input(z.object({
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
      }).optional())
      .query(({ input }) => getFreightReport(input?.dateFrom, input?.dateTo)),
    createFromProposal: publicProcedure
      .input(z.object({
        proposalId: z.number(),
        amount: z.string(),
        description: z.string(),
        isPaid: z.enum(["yes", "no"]).default("no"),
        notes: z.string().optional().nullable(),
      }))
      .mutation(({ input }) =>
        createFinancialEntry({
          type: "income",
          category: "Proposta Aprovada",
          description: input.description,
          amount: input.amount,
          isPaid: input.isPaid,
          proposalId: input.proposalId,
          notes: input.notes ?? null,
        } as any)
      ),
  }),
  masterProducts: router({
    list: publicProcedure
      .input(z.object({ search: z.string().optional(), limit: z.number().optional() }).optional())
      .query(({ input }) => listMasterProducts(input?.search, input?.limit ?? 50)),

    search: publicProcedure
      .input(z.object({ query: z.string(), limit: z.number().optional() }))
      .query(({ input }) => searchMasterProducts(input.query, input.limit ?? 20)),

    previewImport: publicProcedure
      .input(z.object({
        rows: z.array(z.record(z.string(), z.string())),
      }))
      .mutation(({ input }) => previewImportRows(input.rows)),

     previewImportFuzzy: publicProcedure
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
    previewWithDuplicates: publicProcedure
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
    pricesByName: publicProcedure
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
    similarByIngredient: publicProcedure
      .input(z.object({
        productId: z.number(),
        referencePrice: z.number().nullable().optional(),
      }))
      .query(({ input }) => getSimilarProductsByIngredient(input.productId, input.referencePrice ?? null)),

    cheaperAlternatives: publicProcedure
      .input(z.object({
        productId: z.number(),
        referencePrice: z.number().nullable().optional(),
      }))
      .query(({ input }) => getCheaperAlternatives(input.productId, input.referencePrice ?? null)),

    // Histórico de preços
    priceHistory: publicProcedure
      .input(z.object({ productId: z.number() }))
      .query(({ input }) => getProductPriceHistory(input.productId)),

    // Alertas de inflação
    priceAlerts: publicProcedure
      .query(() => getProductsWithPriceAlert()),

    // Listagem com Landed Cost
    listWithLandedCost: publicProcedure
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
  enrichment: router({  // INSIDE appRouter
  // Suggest product fields from name using LLM
  suggestFields: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      categoryName: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { invokeLLM } = await import("./_core/llm");
      const systemMsg = "Você é um especialista em farmácia veterinária. Responda apenas com JSON válido.";
      const userMsg = `Produto: "${input.name}"${input.categoryName ? ` (categoria: ${input.categoryName})` : ""}. Sugira: activeIngredient, concentration, presentation, unit, manufacturer (ou null), description, confidence (0-1). JSON apenas.`;

      try {
        const result = await invokeLLM({
          messages: [
            { role: "system" as const, content: systemMsg },
            { role: "user" as const, content: userMsg },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "product_enrichment",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  activeIngredient: { type: "string" },
                  concentration: { type: "string" },
                  presentation: { type: "string" },
                  unit: { type: "string" },
                  manufacturer: { type: ["string", "null"] },
                  description: { type: "string" },
                  confidence: { type: "number" },
                },
                required: ["activeIngredient", "concentration", "presentation", "unit", "manufacturer", "description", "confidence"],
                additionalProperties: false,
              },
            },
          },
        });
        const content = result.choices?.[0]?.message?.content;
        if (!content || typeof content !== "string") return { error: "Sem resposta do modelo" };
        return JSON.parse(content);
      } catch (e: any) {
        return { error: e.message ?? "Erro ao chamar LLM" };
      }
    }),

  // Bulk enrich multiple products
  bulkSuggest: protectedProcedure
    .input(z.object({
      productIds: z.array(z.number()).min(1).max(20),
    }))
    .mutation(async ({ input }) => {
      const { invokeLLM } = await import("./_core/llm");
      const db = await getDb();
      if (!db) return { results: [] };
      const prods = await db
        .select({ id: products.id, name: products.name, activeIngredient: products.activeIngredient })
        .from(products)
        .where(inArray(products.id, input.productIds));

      const results: Array<{ id: number; name: string; suggestion: any }> = [];
      for (const p of prods) {
        try {
          const sysMsg = "Você é um especialista em farmácia veterinária. Responda apenas com JSON válido.";
          const usrMsg = `Produto: "${p.name}". Sugira: activeIngredient, concentration, presentation, unit, manufacturer (ou null), description, confidence (0-1). JSON apenas.`;
          const res = await invokeLLM({
            messages: [
              { role: "system" as const, content: sysMsg },
              { role: "user" as const, content: usrMsg },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "product_enrichment",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    activeIngredient: { type: "string" },
                    concentration: { type: "string" },
                    presentation: { type: "string" },
                    unit: { type: "string" },
                    manufacturer: { type: ["string", "null"] },
                    description: { type: "string" },
                    confidence: { type: "number" },
                  },
                  required: ["activeIngredient", "concentration", "presentation", "unit", "manufacturer", "description", "confidence"],
                  additionalProperties: false,
                },
              },
            },
          });
          const content = res.choices?.[0]?.message?.content;
          results.push({ id: p.id, name: p.name, suggestion: (content && typeof content === "string") ? JSON.parse(content) : null });
        } catch {
          results.push({ id: p.id, name: p.name, suggestion: null });
        }
      }
      return { results };
    }),

  // Preview: suggest categories for uncategorized products (no DB write)
  batchReclassifyPreview: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .mutation(async ({ input }) => {
      const { invokeLLM } = await import("./_core/llm");
      const db = await getDb();
      if (!db) return { suggestions: [], total: 0 };

      // Count total uncategorized
      const [countRow] = await db
        .select({ total: sql<number>`COUNT(*)` })
        .from(products)
        .where(isNull(products.categoryId));
      const total = Number(countRow?.total ?? 0);

      // Fetch batch
      const prods = await db
        .select({ id: products.id, name: products.name, activeIngredient: products.activeIngredient, manufacturer: products.manufacturer })
        .from(products)
        .where(isNull(products.categoryId))
        .limit(input.limit)
        .offset(input.offset);

      if (prods.length === 0) return { suggestions: [], total };

      // Fetch all categories for context
      const cats = await db
        .select({ id: categories.id, name: categories.name, parentId: categories.parentId })
        .from(categories)
        .orderBy(categories.parentId, categories.sortOrder);

      // Build category list string for LLM
      const catList = cats.map((c) => {
        const parent = cats.find((p) => p.id === c.parentId);
        return parent ? `${c.id}: ${parent.name} > ${c.name}` : `${c.id}: ${c.name}`;
      }).join("\n");

      // Build product list for LLM (batch of up to 50)
      const prodList = prods.map((p) => {
        const extra = [p.activeIngredient, p.manufacturer].filter(Boolean).join(", ");
        return `${p.id}: ${p.name}${extra ? ` (${extra})` : ""}`;
      }).join("\n");

      const systemMsg = `Você é um especialista em classificação de produtos. Analise cada produto e atribua a categoria mais adequada da lista fornecida. Responda APENAS com JSON válido.`;
      const userMsg = `CATEGORIAS DISPONÍVEIS:\n${catList}\n\nPRODUTOS PARA CLASSIFICAR:\n${prodList}\n\nRetorne um array JSON com objetos {productId, categoryId, categoryName, confidence} para cada produto. confidence é 0-1.`;

      try {
        const result = await invokeLLM({
          messages: [
            { role: "system" as const, content: systemMsg },
            { role: "user" as const, content: userMsg },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "batch_reclassify",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  classifications: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        productId: { type: "number" },
                        categoryId: { type: "number" },
                        categoryName: { type: "string" },
                        confidence: { type: "number" },
                      },
                      required: ["productId", "categoryId", "categoryName", "confidence"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["classifications"],
                additionalProperties: false,
              },
            },
          },
        });
        const content = result.choices?.[0]?.message?.content;
        if (!content || typeof content !== "string") return { suggestions: [], total };
        const parsed = JSON.parse(content) as { classifications: Array<{ productId: number; categoryId: number; categoryName: string; confidence: number }> };
        // Merge product names into suggestions
        const suggestions = (parsed.classifications ?? []).map((c) => {
          const prod = prods.find((p) => p.id === c.productId);
          return { ...c, productName: prod?.name ?? "" };
        });
        return { suggestions, total };
      } catch (e: any) {
        return { suggestions: [], total, error: e.message ?? "Erro ao chamar LLM" };
      }
    }),

  // Auto-classify ALL uncategorized products in batches of 50 (server-side loop)
  batchReclassifyAll: protectedProcedure
    .input(z.object({ batchSize: z.number().min(10).max(100).default(50) }).optional())
    .mutation(async ({ input }) => {
      const { invokeLLM } = await import("./_core/llm");
      const db = await getDb();
      if (!db) return { updated: 0, batches: 0, errors: 0 };
      const batchSize = input?.batchSize ?? 50;
      // Fetch all categories once
      const cats = await db
        .select({ id: categories.id, name: categories.name, parentId: categories.parentId })
        .from(categories)
        .orderBy(categories.parentId, categories.sortOrder);
      const catList = cats.map((c) => {
        const parent = cats.find((p) => p.id === c.parentId);
        return parent ? `${c.id}: ${parent.name} > ${c.name}` : `${c.id}: ${c.name}`;
      }).join("\n");
      let updated = 0;
      let batches = 0;
      let errors = 0;
      let offset = 0;
      // Process in batches until no more uncategorized products
      while (true) {
        const prods = await db
          .select({ id: products.id, name: products.name, activeIngredient: products.activeIngredient, manufacturer: products.manufacturer })
          .from(products)
          .where(isNull(products.categoryId))
          .limit(batchSize)
          .offset(0); // always offset 0 since we update as we go
        if (prods.length === 0) break;
        const prodList = prods.map((p) => {
          const extra = [p.activeIngredient, p.manufacturer].filter(Boolean).join(", ");
          return `${p.id}: ${p.name}${extra ? ` (${extra})` : ""}`;
        }).join("\n");
        try {
          const result = await invokeLLM({
            messages: [
              { role: "system" as const, content: "Você é um especialista em classificação de produtos. Analise cada produto e atribua a categoria mais adequada da lista fornecida. Responda APENAS com JSON válido." },
              { role: "user" as const, content: `CATEGORIAS DISPONÍVEIS:\n${catList}\n\nPRODUTOS PARA CLASSIFICAR:\n${prodList}\n\nRetorne um array JSON com objetos {productId, categoryId} para cada produto.` },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "auto_classify",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    classifications: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          productId: { type: "number" },
                          categoryId: { type: "number" },
                        },
                        required: ["productId", "categoryId"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["classifications"],
                  additionalProperties: false,
                },
              },
            },
          });
          const content = result.choices?.[0]?.message?.content;
          if (content && typeof content === "string") {
            const parsed = JSON.parse(content) as { classifications: Array<{ productId: number; categoryId: number }> };
            for (const item of (parsed.classifications ?? [])) {
              // Validate categoryId exists
              const validCat = cats.find((c) => c.id === item.categoryId);
              if (!validCat) continue;
              await db
                .update(products)
                .set({ categoryId: item.categoryId, updatedAt: new Date() })
                .where(eq(products.id, item.productId));
              updated++;
            }
          }
          batches++;
        } catch (_) {
          errors++;
          // Skip this batch and continue
          offset += batchSize;
        }
        // Safety: break if we've processed more than 300 batches (15k products)
        if (batches + errors > 300) break;
      }
      return { updated, batches, errors };
    }),
  // Apply: update categoryId for selected products
  batchReclassifyApply: protectedProcedure
    .input(z.object({
      items: z.array(z.object({
        productId: z.number(),
        categoryId: z.number(),
      })).min(1).max(200),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { updated: 0 };
      let updated = 0;
      for (const item of input.items) {
        await db
          .update(products)
          .set({ categoryId: item.categoryId, updatedAt: new Date() })
          .where(eq(products.id, item.productId));
        updated++;
      }
      return { updated };
    }),

  // ── bulkReclassifySelected: reclassifica produtos selecionados (ou todos sem categoria) com IA ──
  // Suporta 30k produtos via paginação: offset+pageSize para processar em sessões
  bulkReclassifySelected: protectedProcedure
    .input(z.object({
      productIds: z.array(z.number()).optional(), // se omitido, processa todos sem categoria
      batchSize: z.number().min(5).max(100).default(50),
      includeAlreadyCategorized: z.boolean().optional().default(false),
      // Paginação para grandes volumes
      offset: z.number().min(0).default(0),
      pageSize: z.number().min(10).max(500).default(200),
    }))
    .mutation(async ({ input }) => {
      const { invokeLLM } = await import("./_core/llm");
      const db = await getDb();
      if (!db) return { updated: 0, skipped: 0, errors: 0, total: 0, nextOffset: 0, hasMore: false };
      // Carregar categorias
      const cats = await db
        .select({ id: categories.id, name: categories.name, parentId: categories.parentId })
        .from(categories)
        .orderBy(categories.parentId, categories.sortOrder);
      const catList = cats.map((c) => {
        const parent = cats.find((p) => p.id === c.parentId);
        return parent ? `${c.id}: ${parent.name} > ${c.name}` : `${c.id}: ${c.name}`;
      }).join("\n");

      // Contar total sem carregar tudo na memória
      let totalCount = 0;
      if (input.productIds && input.productIds.length > 0) {
        totalCount = input.productIds.length;
      } else {
        const whereClause = input.includeAlreadyCategorized
          ? eq(products.isActive, "yes")
          : isNull(products.categoryId);
        const [cnt] = await db.select({ c: sql<number>`COUNT(*)` }).from(products).where(whereClause);
        totalCount = Number(cnt?.c ?? 0);
      }

      // Buscar apenas a página atual
      let prods: Array<{ id: number; name: string; fichaTecnica: string | null; manufacturer: string | null; presentation: string | null; laboratorio: string | null; subcategoria: string | null; categoryId: number | null }>;
      if (input.productIds && input.productIds.length > 0) {
        const page = input.productIds.slice(input.offset, input.offset + input.pageSize);
        prods = await db
          .select({ id: products.id, name: products.name, fichaTecnica: products.fichaTecnica, manufacturer: products.manufacturer, presentation: products.presentation, laboratorio: products.laboratorio, subcategoria: products.subcategoria, categoryId: products.categoryId })
          .from(products)
          .where(inArray(products.id, page));
      } else {
        const whereClause = input.includeAlreadyCategorized
          ? eq(products.isActive, "yes")
          : isNull(products.categoryId);
        prods = await db
          .select({ id: products.id, name: products.name, fichaTecnica: products.fichaTecnica, manufacturer: products.manufacturer, presentation: products.presentation, laboratorio: products.laboratorio, subcategoria: products.subcategoria, categoryId: products.categoryId })
          .from(products)
          .where(whereClause)
          .orderBy(asc(products.id))
          .limit(input.pageSize)
          .offset(input.offset);
      }

      const total = totalCount;
      let updated = 0;
      let skipped = 0;
      let errors = 0;
      // Processar em sub-lotes para a LLM
      const batchSize = input.batchSize;
      for (let i = 0; i < prods.length; i += batchSize) {
        const batch = prods.slice(i, i + batchSize);
        const prodList = batch.map((p) => {
          const extra = [p.fichaTecnica?.slice(0, 80), p.laboratorio ?? p.manufacturer, p.presentation].filter(Boolean).join(", ");
          return `${p.id}: ${p.name}${extra ? ` (${extra})` : ""}`;
        }).join("\n");
        try {
          const result = await invokeLLM({
            messages: [
              { role: "system" as const, content: "Você é um especialista em classificação de produtos veterinários, agropecuários, farmacêuticos e de construção. Analise cada produto e atribua a categoria mais adequada da lista. Responda APENAS com JSON válido." },
              { role: "user" as const, content: `CATEGORIAS DISPONÍVEIS:\n${catList}\n\nPRODUTOS PARA CLASSIFICAR:\n${prodList}\n\nRetorne um array JSON com objetos {productId, categoryId, subcategoria} para cada produto. subcategoria deve ser uma string curta (ex: "Antiparasitários", "Antibióticos", "Anestésicos") ou string vazia se não se aplicar.` },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "bulk_classify",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    classifications: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          productId: { type: "number" },
                          categoryId: { type: "number" },
                          subcategoria: { type: "string" },
                        },
                        required: ["productId", "categoryId", "subcategoria"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["classifications"],
                  additionalProperties: false,
                },
              },
            },
          });
          const content = result.choices?.[0]?.message?.content;
          if (content && typeof content === "string") {
            const parsed = JSON.parse(content) as { classifications: Array<{ productId: number; categoryId: number; subcategoria: string }> };
            const validItems = (parsed.classifications ?? []).filter(item => cats.find(c => c.id === item.categoryId));
            skipped += (parsed.classifications ?? []).length - validItems.length;
            // Agrupar por (categoryId, subcategoria) para bulk update
            const groups = new Map<string, number[]>();
            const subMap = new Map<string, string | null>();
            for (const item of validItems) {
              const key = `${item.categoryId}|||${item.subcategoria?.trim() || ""}`;
              if (!groups.has(key)) groups.set(key, []);
              groups.get(key)!.push(item.productId);
              subMap.set(key, item.subcategoria?.trim() || null);
            }
            for (const [key, ids] of Array.from(groups.entries())) {
              const [catIdStr] = key.split("|||");
              const catId = parseInt(catIdStr);
              const subcat = subMap.get(key) ?? null;
              if (ids.length > 0) {
                await db.update(products).set({ categoryId: catId, subcategoria: subcat, updatedAt: new Date() }).where(inArray(products.id, ids));
                updated += ids.length;
              }
            }
          }
        } catch (_) {
          errors += batch.length;
        }
      }
      const nextOffset = input.offset + prods.length;
      const hasMore = nextOffset < totalCount;
      return { updated, skipped, errors, total, nextOffset, hasMore };
    }),

    // ── enrichFichaTecnica: extrai ficha técnica do nome do produto via IA ───────────────────────
    // Suporta 30k produtos via paginação: use offset+limit para processar em sessões
    enrichFichaTecnica: protectedProcedure
      .input(z.object({
        scope: z.enum(["withoutFicha", "selected", "all"]).default("withoutFicha"),
        productIds: z.array(z.number()).optional(),
        overwrite: z.boolean().default(false),
        // Paginação para grandes volumes: offset=0 na primeira chamada, incrementar pelo retorno
        offset: z.number().min(0).default(0),
        // Quantos produtos processar nesta chamada (máx 300 para evitar timeout)
        pageSize: z.number().min(10).max(300).default(150),
      }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import("./_core/llm");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

        // 1. Contar total de produtos alvo (sem carregar todos na memória)
        let totalCount = 0;
        if (input.scope === "selected" && input.productIds?.length) {
          totalCount = input.productIds.length;
        } else {
          const countWhere = input.overwrite && input.scope === "all"
            ? eq(products.isActive, "yes")
            : and(eq(products.isActive, "yes"), or(isNull(products.fichaTecnica), eq(products.fichaTecnica, "")));
          const [cnt] = await db.select({ c: sql<number>`COUNT(*)` }).from(products).where(countWhere);
          totalCount = Number(cnt?.c ?? 0);
        }

        // 2. Buscar apenas a página atual (offset+pageSize) — nunca carrega 30k na memória
        let targets: { id: number; name: string }[] = [];
        if (input.scope === "selected" && input.productIds?.length) {
          const page = input.productIds.slice(input.offset, input.offset + input.pageSize);
          targets = await db
            .select({ id: products.id, name: products.name })
            .from(products)
            .where(and(eq(products.isActive, "yes"), inArray(products.id, page)));
        } else {
          const whereClause = input.overwrite && input.scope === "all"
            ? eq(products.isActive, "yes")
            : and(eq(products.isActive, "yes"), or(isNull(products.fichaTecnica), eq(products.fichaTecnica, "")));
          targets = await db
            .select({ id: products.id, name: products.name })
            .from(products)
            .where(whereClause)
            .orderBy(asc(products.id))
            .limit(input.pageSize)
            .offset(input.offset);
        }

        let updated = 0;
        let skipped = 0;
        let errors = 0;
        // Processar em sub-lotes de 30 para a LLM (melhor qualidade de extração)
        const BATCH = 30;
        for (let i = 0; i < targets.length; i += BATCH) {
          const batch = targets.slice(i, i + BATCH);
          try {
            const llmResp = await invokeLLM({
              messages: [
                {
                  role: "system",
                  content: `Você é um especialista em farmácia veterinária e humana. Para cada produto informado, extraia do nome do produto as informações técnicas: princípio ativo / composição, concentração, forma farmacêutica, espécie animal (se veterinário) e classe terapêutica. Se não for possível extrair algum campo, deixe null. Responda em JSON válido.`,
                },
                {
                  role: "user",
                  content: JSON.stringify(batch.map((p, idx) => ({ idx, name: p.name }))),
                },
              ],
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: "ficha_tecnica_extraction",
                  strict: true,
                  schema: {
                    type: "object",
                    properties: {
                      results: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            idx: { type: "integer" },
                            fichaTecnica: { type: ["string", "null"], description: "Princípio ativo / composição completa" },
                            concentration: { type: ["string", "null"], description: "Concentração (ex: 500mg, 10%)" },
                            presentation: { type: ["string", "null"], description: "Forma farmacêutica (ex: comprimido, injetável)" },
                            classeTerapeutica: { type: ["string", "null"], description: "Classe terapêutica" },
                          },
                          required: ["idx", "fichaTecnica", "concentration", "presentation", "classeTerapeutica"],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ["results"],
                    additionalProperties: false,
                  },
                },
              },
            });
            const parsed = JSON.parse(llmResp.choices[0].message.content as string) as {
              results: { idx: number; fichaTecnica: string | null; concentration: string | null; presentation: string | null; classeTerapeutica: string | null }[];
            };
            const toUpdate: Array<{ id: number; fichaTecnica?: string; concentration?: string; presentation?: string }> = [];
            for (const item of (parsed.results ?? [])) {
              const prod = batch[item.idx];
              if (!prod) { skipped++; continue; }
              if (!item.fichaTecnica && !item.concentration && !item.presentation) { skipped++; continue; }
              toUpdate.push({
                id: prod.id,
                ...(item.fichaTecnica ? { fichaTecnica: item.fichaTecnica.trim() } : {}),
                ...(item.concentration ? { concentration: item.concentration.trim() } : {}),
                ...(item.presentation ? { presentation: item.presentation.trim() } : {}),
              });
            }
            await Promise.all(toUpdate.map(({ id, ...fields }) =>
              db.update(products).set({ ...fields, updatedAt: new Date() }).where(eq(products.id, id))
            ));
            updated += toUpdate.length;
          } catch (_) {
            errors += batch.length;
          }
        }
        // Retorna nextOffset para o frontend continuar de onde parou
        const nextOffset = input.offset + targets.length;
        const hasMore = nextOffset < totalCount;
        return { updated, skipped, errors, total: totalCount, processedInPage: targets.length, nextOffset, hasMore };
      }),
    // ── extractFichaTecnica: extrai ficha técnica de UM produto via IA (para modal de edição) ──
    extractFichaTecnica: protectedProcedure
      .input(z.object({
        productId: z.number(),
        name: z.string(),
        manufacturer: z.string().optional(),
        concentration: z.string().optional(),
        presentation: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import("./_core/llm");
        const prompt = [
          `Produto veterinário: "${input.name}"`,
          input.manufacturer ? `Fabricante: ${input.manufacturer}` : null,
          input.concentration ? `Concentração: ${input.concentration}` : null,
          input.presentation ? `Apresentação: ${input.presentation}` : null,
        ].filter(Boolean).join(" | ");
        const resp = await invokeLLM({
          messages: [
            { role: "system", content: "Você é um especialista em medicamentos veterinários. Retorne APENAS um JSON com o campo 'fichaTecnica' contendo a ficha técnica completa do produto (princípio ativo, classe terapêutica, indicações, posologia, contraindicações, forma farmacêutica). Se não souber, retorne fichaTecnica como string vazia." },
            { role: "user", content: prompt },
          ],
          response_format: {
            type: "json_schema" as const,
            json_schema: {
              name: "ficha_tecnica",
              strict: true,
              schema: {
                type: "object",
                properties: { fichaTecnica: { type: "string" } },
                required: ["fichaTecnica"],
                additionalProperties: false,
              },
            },
          },
        });
        const parsed = JSON.parse(resp.choices[0].message.content as string) as { fichaTecnica: string };
        if (!parsed.fichaTecnica?.trim()) throw new TRPCError({ code: "NOT_FOUND", message: "IA não encontrou ficha técnica para este produto" });
        return { fichaTecnica: parsed.fichaTecnica.trim() };
      }),

  // Novos endpoints de enriquecimento com IA (Fase 3)
  listProductsNeedingEnrichment: publicProcedure
    .input(
      z.object({
        limit: z.number().default(100),
        offset: z.number().default(0),
        filterType: z.enum(["missing_active_ingredient", "missing_category", "both"]).default("both"),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");

      let whereCondition: any = eq(products.isActive, "yes");

      if (input.filterType === "missing_active_ingredient") {
        whereCondition = and(eq(products.isActive, "yes"), isNull(products.activeIngredient));
      } else if (input.filterType === "missing_category") {
        whereCondition = and(eq(products.isActive, "yes"), isNull(products.tipoCatalogo));
      } else {
        whereCondition = and(
          eq(products.isActive, "yes"),
          isNull(products.activeIngredient),
          isNull(products.tipoCatalogo)
        );
      }

      const results = await db
        .select()
        .from(products)
        .where(whereCondition)
        .limit(input.limit)
        .offset(input.offset);

      return {
        total: results.length,
        products: results.map((p) => ({
          id: p.id,
          name: p.name,
          manufacturer: p.manufacturer,
          activeIngredient: p.activeIngredient,
          tipoCatalogo: p.tipoCatalogo,
          statusConfiabilidade: p.statusConfiabilidade,
        })),
      };
    }),

  getEnrichmentStats: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB indisponível");

    const allProducts = await db
      .select({
        id: products.id,
        statusConfiabilidade: products.statusConfiabilidade,
        activeIngredient: products.activeIngredient,
      })
      .from(products)
      .where(eq(products.isActive, "yes"));

    const enriquecidos = allProducts.filter(
      (p) => p.statusConfiabilidade === "enriquecido_ia"
    ).length;
    const pendentes = allProducts.filter(
      (p) => !p.activeIngredient || p.statusConfiabilidade === "incompleto"
    ).length;

    return {
      total: allProducts.length,
      enriquecidos,
      pendentes,
      percentualEnriquecido:
        allProducts.length > 0 ? (enriquecidos / allProducts.length) * 100 : 0,
    };
  }),

  // Enriquecer um produto individual com IA
  enrichProduct: protectedProcedure
    .input(
      z.object({
        productId: z.number(),
        productName: z.string(),
        currentActiveIngredient: z.string().optional(),
        currentCategory: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const product = await db
        .select()
        .from(products)
        .where(eq(products.id, input.productId))
        .limit(1);

      if (!product[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Produto ${input.productId} não encontrado` });
      }

      const prod = product[0];

      const prompt = `Analise o seguinte produto veterinário/farmacêutico e extraia as informações solicitadas:

Nome do Produto: ${input.productName}
Fabricante Atual: ${prod.manufacturer || "Não informado"}
Categoria Atual: ${input.currentCategory || "Não informada"}
Princípio Ativo Atual: ${input.currentActiveIngredient || "Não informado"}

Por favor, forneça em JSON:
1. activeIngredient: Princípio ativo principal (nome técnico)
2. concentration: Concentração/dosagem
3. category: medicamento_veterinario, medicamento_humano, produto_nao_medicamentoso ou material_insumo_equipamento
4. subcategory: Antibiótico, Antiparasitário, Vacina, Analgésico, etc
5. manufacturer: Fabricante
6. indication: Indicação terapêutica ou uso
7. confidence: Confiança (0-1)`;

      try {
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "Você é um especialista em farmacologia veterinária e medicamentos. Classifique produtos com precisão. Responda APENAS com JSON válido.",
            },
            { role: "user", content: prompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "product_enrichment",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  activeIngredient: { type: "string" },
                  concentration: { type: "string" },
                  category: { type: "string" },
                  subcategory: { type: "string" },
                  manufacturer: { type: "string" },
                  indication: { type: "string" },
                  confidence: { type: "number" },
                },
                required: ["activeIngredient", "concentration", "category", "subcategory", "manufacturer", "indication", "confidence"],
                additionalProperties: false,
              },
            },
          } as any,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error("Resposta vazia do LLM");

        const contentStr = typeof content === "string" ? content : JSON.stringify(content);
        const enriched = JSON.parse(contentStr);

        await db
          .update(products)
          .set({
            activeIngredient: enriched.activeIngredient,
            concentration: enriched.concentration,
            tipoCatalogo: enriched.category,
            manufacturer: enriched.manufacturer,
            statusConfiabilidade: enriched.confidence > 0.7 ? "completo_validado" : "enriquecido_ia",
          })
          .where(eq(products.id, input.productId));

        return {
          success: true,
          productId: input.productId,
          enrichment: enriched,
        };
      } catch (error) {
        return {
          success: false,
          productId: input.productId,
          error: (error as Error).message,
        };
      }
    }),

  // Enriquecer múltiplos produtos em lote
  enrichProductsBatch: protectedProcedure
    .input(
      z.object({
        productIds: z.array(z.number()).max(100),
        batchSize: z.number().default(50),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const results = [];
      const errors = [];

      for (let i = 0; i < input.productIds.length; i += input.batchSize) {
        const batch = input.productIds.slice(i, i + input.batchSize);

        for (const productId of batch) {
          try {
            const product = await db
              .select()
              .from(products)
              .where(eq(products.id, productId))
              .limit(1);

            if (!product[0]) {
              errors.push({ productId, error: "Produto não encontrado" });
              continue;
            }

            const prod = product[0];

            const prompt = `Produto: "${prod.name}". Fabricante: ${prod.manufacturer || "desconhecido"}. Sugira: activeIngredient, concentration, category (medicamento_veterinario/medicamento_humano/produto_nao_medicamentoso/material_insumo_equipamento), subcategory, indication, confidence (0-1). JSON apenas.`;

            const response = await invokeLLM({
              messages: [
                { role: "system", content: "Especialista em farmacologia veterinária. Responda APENAS com JSON válido." },
                { role: "user", content: prompt },
              ],
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: "enrichment",
                  strict: true,
                  schema: {
                    type: "object",
                    properties: {
                      activeIngredient: { type: "string" },
                      concentration: { type: "string" },
                      category: { type: "string" },
                      subcategory: { type: "string" },
                      indication: { type: "string" },
                      confidence: { type: "number" },
                    },
                    required: ["activeIngredient", "concentration", "category", "subcategory", "indication", "confidence"],
                    additionalProperties: false,
                  },
                },
              } as any,
            });

            const content = response.choices[0]?.message?.content;
            if (!content) throw new Error("Resposta vazia");

            const contentStr = typeof content === "string" ? content : JSON.stringify(content);
            const enriched = JSON.parse(contentStr);

            await db
              .update(products)
              .set({
                activeIngredient: enriched.activeIngredient,
                concentration: enriched.concentration,
                tipoCatalogo: enriched.category,
                statusConfiabilidade: enriched.confidence > 0.7 ? "completo_validado" : "enriquecido_ia",
              })
              .where(eq(products.id, productId));

            results.push({ productId, success: true, confidence: enriched.confidence });
          } catch (error) {
            errors.push({ productId, error: (error as Error).message });
          }
        }

        if (i + input.batchSize < input.productIds.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      return {
        total: input.productIds.length,
        successful: results.length,
        failed: errors.length,
        results,
        errors,
      };
    }),

  // Obter sugestões sem aplicar
  getSuggestions: publicProcedure
    .input(z.object({ productId: z.number(), productName: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const product = await db
        .select()
        .from(products)
        .where(eq(products.id, input.productId))
        .limit(1);

      if (!product[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Produto ${input.productId} não encontrado` });
      }

      const prod = product[0];

      const prompt = `Produto: "${input.productName}". Fabricante: ${prod.manufacturer || "desconhecido"}. P.A.: ${prod.activeIngredient || "não informado"}. Sugira: activeIngredient, concentration, category (medicamento_veterinario/medicamento_humano/produto_nao_medicamentoso/material_insumo_equipamento), subcategory, indication, confidence (0-1). JSON.`;

      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "Especialista em farmacologia veterinária. JSON apenas." },
            { role: "user", content: prompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "suggestions",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  activeIngredient: { type: "string" },
                  concentration: { type: "string" },
                  category: { type: "string" },
                  subcategory: { type: "string" },
                  indication: { type: "string" },
                  confidence: { type: "number" },
                },
                required: ["activeIngredient", "concentration", "category", "subcategory", "indication", "confidence"],
                additionalProperties: false,
              },
            },
          } as any,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error("Resposta vazia");

        const contentStr = typeof content === "string" ? content : JSON.stringify(content);
        const suggestions = JSON.parse(contentStr);

        return { productId: input.productId, productName: input.productName, suggestions };
      } catch (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: (error as Error).message });
      }
    }),

  // Aplicar sugestões aprovadas
  applySuggestions: protectedProcedure
    .input(
      z.object({
        productId: z.number(),
        activeIngredient: z.string().optional(),
        concentration: z.string().optional(),
        category: z.string().optional(),
        manufacturer: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const updateData: any = { statusConfiabilidade: "enriquecido_ia" };

      if (input.activeIngredient) updateData.activeIngredient = input.activeIngredient;
      if (input.concentration) updateData.concentration = input.concentration;
      if (input.category) updateData.tipoCatalogo = input.category;
      if (input.manufacturer) updateData.manufacturer = input.manufacturer;

      await db.update(products).set(updateData).where(eq(products.id, input.productId));

      return { success: true, productId: input.productId };
    }),
  }),
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
    extract: publicProcedure
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
    matchCatalog: publicProcedure
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
    validateItems: publicProcedure
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
    createProposal: publicProcedure
      .input(
        z.object({
          processo: z.object({
            numero: z.string(),
            modalidade: z.string(),
            orgao: z.string(),
            objeto: z.string(),
          }),
          markup: z.number().min(0).max(500).default(30),
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

           if (costPrice === null || isNaN(costPrice)) continue; // pula itens sem preço
          const salePrice = costPrice * (1 + input.markup / 100);
          // Preço de referência do edital (extraído pela IA ou null)
          const editalRefPrice = item.itemPrecoUnitario ?? null;
          // Preço sugerido inicial = custo com markup (editado pelo usuário depois)
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
            unitPrice: String(salePrice.toFixed(2)) as any,
            costPrice: costPrice !== null ? String(costPrice.toFixed(2)) as any : null,
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
    listTemplates: publicProcedure.query(async () => {
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
    getForProposal: publicProcedure
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
    preview: publicProcedure
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
    runBatch: publicProcedure
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
  synonyms: router({
    list: publicProcedure
      .input(z.object({
        category: z.string().optional(),
        search: z.string().optional(),
        activeOnly: z.boolean().optional(),
      }).optional())
      .query(({ input }) => listSynonyms(input ?? {})),

    create: protectedProcedure
      .input(z.object({
        term: z.string().min(1).max(256),
        canonical: z.string().min(1).max(256),
        category: z.string().optional(),
        isActive: z.enum(["yes", "no"]).optional(),
      }))
      .mutation(({ input }) => createSynonym(input as any)),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        term: z.string().min(1).max(256).optional(),
        canonical: z.string().min(1).max(256).optional(),
        category: z.string().optional(),
        isActive: z.enum(["yes", "no"]).optional(),
      }))
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return updateSynonym(id, data as any);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteSynonym(input.id)),

    bulkCreate: protectedProcedure
      .input(z.object({
        items: z.array(z.object({
          term: z.string().min(1).max(256),
          canonical: z.string().min(1).max(256),
          category: z.string().optional(),
        })),
      }))
      .mutation(({ input }) =>
        bulkCreateSynonyms(input.items.map((i) => ({ ...i, isActive: "yes" as const })))
      ),

    bulkToggle: protectedProcedure
      .input(z.object({
        ids: z.array(z.number()).min(1).max(500),
        isActive: z.enum(["yes", "no"]),
      }))
      .mutation(({ input }) => bulkToggleSynonyms(input.ids, input.isActive)),
    bulkDelete: protectedProcedure
      .input(z.object({
        ids: z.array(z.number()).min(1).max(500),
      }))
      .mutation(({ input }) => bulkDeleteSynonyms(input.ids)),
    // Retorna estatísticas de uso dos sinônimos
    stats: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { total: 0, byCategory: [] };
      const [rows] = await (db as any).execute(sql`
        SELECT category, COUNT(*) as count
        FROM synonyms
        WHERE isActive = 'yes'
        GROUP BY category
        ORDER BY count DESC
      `);
      const rowsArr = Array.isArray(rows) ? rows : [];
      const total = rowsArr.reduce((s: number, r: any) => s + Number(r.count), 0);
      return { total, byCategory: rowsArr as Array<{ category: string; count: number }> };
    }),
  }),

  // ─── Templates de Proposta ──────────────────────────────────────────────────
  proposalTemplates: router({
    list: protectedProcedure.query(() => listProposalTemplates()),

    getDefault: protectedProcedure.query(() => getDefaultProposalTemplate()),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getProposalTemplate(input.id)),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(128),
        orgType: z.enum(["prefeitura", "estado", "federal", "privado", "outro"]).default("outro"),
        icmsPercent: z.number().min(0).max(100).default(0),
        stPercent: z.number().min(0).max(100).default(0),
        ipiPercent: z.number().min(0).max(100).default(0),
        otherTaxPercent: z.number().min(0).max(100).default(0),
        freightType: z.enum(["cif", "fob", "none"]).default("cif"),
        freightPercent: z.number().min(0).max(100).default(0),
        validityDays: z.number().int().min(1).default(30),
        declarations: z.string().optional(),
        paymentTerms: z.string().max(256).optional(),
        deliveryDays: z.number().int().min(0).default(15),
        notes: z.string().optional(),
        isDefault: z.enum(["yes", "no"]).default("no"),
      }))
      .mutation(({ input }) => createProposalTemplate({
        ...input,
        icmsPercent: String(input.icmsPercent),
        stPercent: String(input.stPercent),
        ipiPercent: String(input.ipiPercent),
        otherTaxPercent: String(input.otherTaxPercent),
        freightPercent: String(input.freightPercent),
      } as any)),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(128).optional(),
        orgType: z.enum(["prefeitura", "estado", "federal", "privado", "outro"]).optional(),
        icmsPercent: z.number().min(0).max(100).optional(),
        stPercent: z.number().min(0).max(100).optional(),
        ipiPercent: z.number().min(0).max(100).optional(),
        otherTaxPercent: z.number().min(0).max(100).optional(),
        freightType: z.enum(["cif", "fob", "none"]).optional(),
        freightPercent: z.number().min(0).max(100).optional(),
        validityDays: z.number().int().min(1).optional(),
        declarations: z.string().optional(),
        paymentTerms: z.string().max(256).optional(),
        deliveryDays: z.number().int().min(0).optional(),
        notes: z.string().optional(),
        isDefault: z.enum(["yes", "no"]).optional(),
      }))
      .mutation(({ input }) => {
        const { id, icmsPercent, stPercent, ipiPercent, otherTaxPercent, freightPercent, ...rest } = input;
        return updateProposalTemplate(id, {
          ...rest,
          ...(icmsPercent !== undefined && { icmsPercent: String(icmsPercent) }),
          ...(stPercent !== undefined && { stPercent: String(stPercent) }),
          ...(ipiPercent !== undefined && { ipiPercent: String(ipiPercent) }),
          ...(otherTaxPercent !== undefined && { otherTaxPercent: String(otherTaxPercent) }),
          ...(freightPercent !== undefined && { freightPercent: String(freightPercent) }),
        } as any);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteProposalTemplate(input.id)),
    seedDefaults: protectedProcedure
      .mutation(async () => {
        const defaults = [
          {
            name: "Licitação Federal (Ministério/Autarquia)",
            orgType: "federal" as const,
            icmsPercent: "0", stPercent: "0", ipiPercent: "0", otherTaxPercent: "0",
            freightType: "cif" as const, freightPercent: "0",
            validityDays: 90, paymentTerms: "30 dias após entrega", deliveryDays: 30,
            declarations: "Declaramos que os produtos ofertados atendem às especificações do edital, às normas vigentes da ANVISA e ao Decreto nº 7.892/2013.",
            isDefault: "yes" as const,
          },
          {
            name: "Licitação Estadual — Padrão",
            orgType: "estado" as const,
            icmsPercent: "12", stPercent: "2", ipiPercent: "0", otherTaxPercent: "0",
            freightType: "cif" as const, freightPercent: "0",
            validityDays: 60, paymentTerms: "30 dias após entrega", deliveryDays: 20,
            declarations: "Declaramos que os produtos ofertados atendem às especificações do edital e às normas vigentes da ANVISA.",
            isDefault: "no" as const,
          },
          {
            name: "Licitação Municipal (Prefeitura)",
            orgType: "prefeitura" as const,
            icmsPercent: "12", stPercent: "0", ipiPercent: "0", otherTaxPercent: "0",
            freightType: "cif" as const, freightPercent: "0",
            validityDays: 60, paymentTerms: "30 dias após entrega", deliveryDays: 15,
            declarations: "Declaramos que os produtos ofertados atendem às especificações do edital e às normas vigentes da ANVISA.",
            isDefault: "no" as const,
          },
          {
            name: "Venda Direta — Cliente Privado",
            orgType: "privado" as const,
            icmsPercent: "12", stPercent: "0", ipiPercent: "0", otherTaxPercent: "0",
            freightType: "cif" as const, freightPercent: "3",
            validityDays: 30, paymentTerms: "À vista ou 30 dias", deliveryDays: 10,
            declarations: "",
            isDefault: "no" as const,
          },
        ];
        let created = 0;
        for (const t of defaults) {
          await createProposalTemplate(t as any);
          created++;
        }
        return { created };
      }),
  }),
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

