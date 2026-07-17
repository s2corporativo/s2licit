import { metadataRouter } from "./routers/metadata";
import { authRouter } from "./routers/auth";
import { masterProductsRouter } from "./routers/masterProducts";
import { priceIntelligenceRouter } from "./routers/priceIntelligence";
import { editalRouter } from "./routers/edital";
import { declarationsRouter } from "./routers/declarations";
import { reclassificacaoRouter } from "./routers/reclassificacao";
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


import { TRPCError } from "@trpc/server";
import { z } from "zod";



import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, router } from "./_core/trpc";

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

  auth: authRouter,


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

  masterProducts: masterProductsRouter,


  priceIntelligence: priceIntelligenceRouter,

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
  edital: editalRouter,

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
  declarations: declarationsRouter,


  // REMOVIDO: Histórico de Licitações — módulo excluído em 26/03/2026

  // ─── 7. Ranking de Competitividade ───────────────────────────────────────────

  // ─── 8. Alerta de Risco Financeiro ───────────────────────────────────────────

  // ─── 9. Estoque ──────────────────────────────────────────────────────────────
   // ─── 10. Regras Tributárias ───────────────────────────────────────────────────

  // ─── 11. Reajuste Contratual ──────────────────────────────────────────────────

  // ─── 12. Painel Economia Potencial ───────────────────────────────────────────

  // ─── Reclassificação em Lote via IA ───────────────────────────────────────
  reclassificacao: reclassificacaoRouter,

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

