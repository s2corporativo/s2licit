import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { importSmartRouter } from "./importSmartRouter";
import { agenteRouter } from "./routers/agente";
import { agendaRouter } from "./routers/agenda";
import { aiRouter } from "./routers/ai";
import { auditRouter } from "./routers/auditRouter";
import { authRouter } from "./routers/auth";
import { bulkPricingRouter } from "./routers/bulkPricing";
import { buscaGlobalRouter } from "./routers/buscaGlobal";
import { captureReviewRouter } from "./routers/captureReview";
import { categoriesRouter } from "./routers/categories";
import { categoryPricingRouter } from "./routers/categoryPricing";
import { certidoesRouter } from "./routers/certidoes";
import { companyRouter } from "./routers/company";
import { dashboardRouter } from "./routers/dashboard";
import { declarationsRouter } from "./routers/declarations";
import { desempenhoRouter } from "./routers/desempenho";
import { diagnosticoRouter } from "./routers/diagnostico";
import { documentComposerRouter } from "./routers/documentComposer";
import { documentGovernanceRouter } from "./routers/documentGovernanceRouter";
import { duplicatesRouter } from "./routers/duplicates";
import { editalCanonicalRouter } from "./routers/editalCanonical";
import { emailConfigRouter } from "./routers/emailConfig";
import { emailQuotationsRouter } from "./routers/emailQuotations";
import { enrichmentHistoryRouter } from "./routers/enrichmentHistoryRouter";
import { enrichmentRouter as enrichmentInlineRouter } from "./routers/enrichmentGroup";
import { equivalencesRouter } from "./routers/equivalences";
import { financialRouter } from "./routers/financial";
import { fretesRouter } from "./routers/fretes";
import { funilRouter } from "./routers/funil";
import { imagesRouter } from "./routers/images";
import { importsRouter } from "./routers/importsGroup";
import { integrationsRouter } from "./routers/integrations";
import { intelligentCaptureRouter } from "./routers/intelligentCaptureRouter";
import { legalAnalysisRouter } from "./routers/legalAnalysis";
import { licitacaoAgentRouter } from "./routers/licitacaoAgent";
import { masterProductsRouter } from "./routers/masterProducts";
import { mfaRouter } from "./routers/mfaRouter";
import { nfeEnrichmentPipelineRouter } from "./routers/nfeEnrichmentPipeline";
import { nfeImportRouter } from "./routers/nfeImport";
import { operationalGovernanceRouter } from "./routers/operationalGovernance";
import { opportunitiesRouter } from "./routers/opportunities";
import { orgsRouter } from "./routers/orgs";
import { pncpRadarRouter } from "./routers/pncpRadar";
import { portalCredentialsRouter } from "./routers/portalCredentials";
import { portalOpportunitySyncRouter } from "./routers/portalOpportunitySync";
import { posVendaRouter } from "./routers/posVenda";
import { precificacaoRouter } from "./routers/precificacao";
import { priceAnalysisRouter } from "./routers/priceAnalysis";
import { priceIntelligenceRouter } from "./routers/priceIntelligence";
import { pricingRouter } from "./routers/pricing";
import { productsRouter } from "./routers/productsGroup";
import { proposalEmailAdminRouter } from "./routers/proposalEmailAdmin";
import { proposalTemplatesRouter } from "./routers/proposalTemplates";
import { proposalsRouter } from "./routers/proposals";
import { propostaAgentRouter } from "./routers/propostaAgentRouter";
import { reclassificacaoRouter } from "./routers/reclassificacao";
import { scraperAgentRouter } from "./routers/scraperAgent";
import { suppliersRouter } from "./routers/suppliers";
import { synonymsRouter } from "./routers/synonyms";
import { tambasaCatalogRouter } from "./routers/tambasaCatalog";
import { taxRulesRouter } from "./routers/taxRules";
import { usersRouter } from "./routers/usersRouter";
import { workflowRouter } from "./routers/workflowRouter";
import { initCanonicalAutonomy } from "./services/canonicalAutonomy";

initCanonicalAutonomy();

export const appRouter = router({
  system: systemRouter,
  opportunities: opportunitiesRouter,
  licitacaoAgent: licitacaoAgentRouter,
  pricingEngine: precificacaoRouter,
  documentComposer: documentComposerRouter,
  importSmart: importSmartRouter,
  nfeImport: nfeImportRouter,
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
  proposalEmailAdmin: proposalEmailAdminRouter,
  financial: financialRouter,
  masterProducts: masterProductsRouter,
  priceIntelligence: priceIntelligenceRouter,
  enrichment: enrichmentInlineRouter,
  edital: editalCanonicalRouter,
  declarations: declarationsRouter,
  reclassificacao: reclassificacaoRouter,
  synonyms: synonymsRouter,
  proposalTemplates: proposalTemplatesRouter,
  duplicates: duplicatesRouter,
  intelligentCapture: intelligentCaptureRouter,
  images: imagesRouter,
});

export type AppRouter = typeof appRouter;
