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
import { imagesRouter } from "./routers/images";
import { importSmartRouter } from "./importSmartRouter";
import { nfeImportRouter } from "./routers/nfeImport";
import { priceSyncRouter } from "./routers/priceSync";
import { priceImportRouter } from "./routers/priceImport";
import { priceAnalysisRouter } from "./routers/priceAnalysis";
import { pricingRouter } from "./routers/pricing";
import { categoryPricingRouter } from "./routers/categoryPricing";
import { bulkPricingRouter } from "./routers/bulkPricing";
import { agenteRouter } from "./routers/agente";
import { scraperAgentRouter } from "./routers/scraperAgent";
import { tambasaCatalogRouter } from "./routers/tambasaCatalog";
import { propostaAgentRouter } from "./routers/propostaAgentRouter";
import { captureReviewRouter } from "./routers/captureReview";
import { nfeEnrichmentPipelineRouter } from "./routers/nfeEnrichmentPipeline";
import { enrichmentHistoryRouter } from "./routers/enrichmentHistoryRouter";
import { documentGovernanceRouter } from "./routers/documentGovernanceRouter";
import { workflowRouter } from "./routers/workflowRouter";
import { auditRouter } from "./routers/auditRouter";
import { mfaRouter } from "./routers/mfaRouter";
import { usersRouter } from "./routers/usersRouter";
import { intelligentCaptureRouter } from "./routers/intelligentCaptureRouter";
import { pncpRadarRouter } from "./routers/pncpRadar";
import { emailQuotationsRouter } from "./routers/emailQuotations";
import { certidoesRouter } from "./routers/certidoes";
import { aiRouter } from "./routers/ai";
import { emailConfigRouter } from "./routers/emailConfig";
import { legalAnalysisRouter } from "./routers/legalAnalysis";
import { integrationsRouter } from "./routers/integrations";
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
import { operationalGovernanceRouter } from "./routers/operationalGovernance";
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
  nfeImport: nfeImportRouter,
  priceSync: priceSyncRouter,
  priceImport: priceImportRouter,
  priceAnalysis: priceAnalysisRouter,
  pricing: pricingRouter,
  categoryPricing: categoryPricingRouter,
  bulkPricing: bulkPricingRouter,
  agente: agenteRouter,
  scraperAgent: scraperAgentRouter,
  tambasaCatalog: tambasaCatalogRouter,
  propostaAgent: propostaAgentRouter,
  audit: auditRouter,
  mfa: mfaRouter,
  users: usersRouter,
  captureReview: captureReviewRouter,
  nfeEnrichmentPipeline: nfeEnrichmentPipelineRouter,
  enrichmentHistory: enrichmentHistoryRouter,
  documents: documentGovernanceRouter,
  workflow: workflowRouter,
  pncpRadar: pncpRadarRouter,
  emailQuotations: emailQuotationsRouter,
  certidoes: certidoesRouter,
  ai: aiRouter,
  emailConfig: emailConfigRouter,
  legalAnalysis: legalAnalysisRouter,
  integrations: integrationsRouter,
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
  operationalGovernance: operationalGovernanceRouter,

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

  // ─── Company Settings ─────────────────────────────────────────────────────
  company: companyRouter,

  // ─── Requesting Orgs ──────────────────────────────────────────────────────
  orgs: orgsRouter,

  // ─── Proposals ────────────────────────────────────────────────────────────
  proposals: proposalsRouter,

  // ─── Financial Entries ────────────────────────────────────────────────────
  financial: financialRouter,

  masterProducts: masterProductsRouter,

  priceIntelligence: priceIntelligenceRouter,

  // ─── Catalog Enrichment ───────────────────────────────────────────────────
  enrichment: enrichmentInlineRouter,
  // ─── Reclassificação em Lote via IA ───────────────────────────────────────
  // ─── Importação com Consolidação Automática ───────────────────────────────
  // ─── Reconhecimento Inteligente de Produtos ───────────────────────────────
  // ─── Importação com Matching Automático ───────────────────────────────────
  // ─── Orçamentos e Propostas Comerciais ────────────────────────────────────
  // ─── Importação de Edital (PDF/DOCX)) ─────────────────────────────────────
  edital: editalRouter,

  // ─── (A) Upload seguro de logo ────────────────────────────────────────────
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
      // RIFF (bytes 0-3) também é usado por AVI/WAV — exige "WEBP" nos bytes 8-11.
      const isWebp =
        magic[0] === 0x52 && magic[1] === 0x49 && magic[2] === 0x46 && magic[3] === 0x46 &&
        buffer.length > 12 && buffer.slice(8, 12).toString("ascii") === "WEBP";
      if (!isJpeg && !isPng && !isWebp) throw new TRPCError({ code: "BAD_REQUEST", message: "Formato inválido. Use JPEG, PNG ou WebP." });
      const ext = isJpeg ? "jpg" : isPng ? "png" : "webp";
      const key = `empresa/logo-${Date.now()}.${ext}`;
      const { url } = await storagePut(key, buffer, input.mimeType);
      return { url };
    }),

  // ─── (E) Declarações fixas (templates) ────────────────────────────────────
  declarations: declarationsRouter,

  // ─── Reclassificação em Lote via IA ───────────────────────────────────────
  reclassificacao: reclassificacaoRouter,

  // ─── Sinônimos para Matching ──────────────────────────────────────────────
  synonyms: synonymsRouter,

  // ─── Templates de Proposta ────────────────────────────────────────────────
  proposalTemplates: proposalTemplatesRouter,

  // ─── Metadados e apoio operacional ────────────────────────────────────────

  // ─── Motor Universal de Equivalência e duplicidades ───────────────────────
  duplicates: duplicatesRouter,
  intelligentCapture: intelligentCaptureRouter,

  // ─── Módulos complementares ───────────────────────────────────────────────
  images: imagesRouter,
});
export type AppRouter = typeof appRouter;
