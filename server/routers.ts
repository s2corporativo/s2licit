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
import { priceAnalysisRouter } from "./routers/priceAnalysis";
import { pricingRouter } from "./routers/pricing";
import { categoryPricingRouter } from "./routers/categoryPricing";
import { bulkPricingRouter } from "./routers/bulkPricing";
import { agenteRouter } from "./routers/agente";
import { scraperAgentRouter } from "./routers/scraperAgent";
import { captureCoreRouter } from "./routers/captureCore";
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
import { portalOpportunitySyncRouter } from "./routers/portalOpportunitySync";
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

import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";

export const appRouter = router({
  system: systemRouter,
  importSmart: importSmartRouter,
  nfeImport: nfeImportRouter,
  priceAnalysis: priceAnalysisRouter,
  pricing: pricingRouter,
  categoryPricing: categoryPricingRouter,
  bulkPricing: bulkPricingRouter,
  agente: agenteRouter,
  scraperAgent: scraperAgentRouter,
  captureCore: captureCoreRouter,
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
  portalOpportunitySync: portalOpportunitySyncRouter,
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
  categories: categoriesRouter,
  suppliers: suppliersRouter,
  products: productsRouter,
  equivalences: equivalencesRouter,
  imports: importsRouter,
  dashboard: dashboardRouter,
  company: companyRouter,
  orgs: orgsRouter,
  proposals: proposalsRouter,
  financial: financialRouter,
  masterProducts: masterProductsRouter,
  priceIntelligence: priceIntelligenceRouter,
  enrichment: enrichmentInlineRouter,
  edital: editalRouter,
  declarations: declarationsRouter,
  reclassificacao: reclassificacaoRouter,
  synonyms: synonymsRouter,
  proposalTemplates: proposalTemplatesRouter,
  duplicates: duplicatesRouter,
  intelligentCapture: intelligentCaptureRouter,
  images: imagesRouter,
});
export type AppRouter = typeof appRouter;
