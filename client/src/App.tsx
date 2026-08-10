import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch } from "wouter";
import AppLayout from "./components/AppLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import RequireAuth from "./components/RequireAuth";

const named = <T extends string>(promise: Promise<Record<T, React.ComponentType<any>>>, key: T) => promise.then((module) => ({ default: module[key] }));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Oportunidades = lazy(() => import("./pages/Oportunidades"));
const Execucao = lazy(() => import("./pages/Execucao"));
const Catalogo = lazy(() => import("./pages/Catalogo"));
const AssistenteOperacional = lazy(() => import("./pages/AssistenteOperacional"));
const Agenda = lazy(() => import("./pages/Agenda"));
const Propostas = lazy(() => import("./pages/Propostas"));
const PropostaEditor = lazy(() => import("./pages/PropostaEditor"));
const PropostasAdmin = lazy(() => import("./pages/PropostasAdmin"));
const FinanceiroCentral = lazy(() => import("./pages/FinanceiroCentral"));
const BuscaGlobal = lazy(() => import("./pages/BuscaGlobal"));
const ConfiguracaoEmpresa = lazy(() => import("./pages/ConfiguracaoEmpresa"));
const Integracoes = lazy(() => import("./pages/IntegracoesCentral"));
const Usuarios = lazy(() => import("./pages/Usuarios"));
const Diagnostico = lazy(() => import("./pages/Diagnostico"));
const Manual = lazy(() => import("./pages/Manual"));
const SegurancaMFA = lazy(() => import("./pages/SegurancaMFA"));
const Logs = lazy(() => import("./pages/Logs"));
const Login = lazy(() => import("./pages/Login"));
const Comparacao = lazy(() => import("./pages/Comparacao"));
const Categorias = lazy(() => import("./pages/Categorias"));
const Equivalencias = lazy(() => import("./pages/Equivalencias"));
const Fornecedores = lazy(() => import("./pages/Fornecedores"));
const ImportarPlanilha = lazy(() => import("./pages/ImportarPlanilha"));
const Produtos = lazy(() => import("./pages/Produtos"));
const GestaoImagens = lazy(() => import("./pages/GestaoImagens"));
const EnriquecimentoCatalogo = lazy(() => import("./pages/EnriquecimentoCatalogo"));
const ReclassificacaoIA = lazy(() => import("./pages/ReclassificacaoIA"));
const ImportarEdital = lazy(() => import("./pages/ImportarEdital"));
const AnaliseJuridica = lazy(() => import("./pages/AnaliseJuridica"));
const Sinonimos = lazy(() => import("./pages/Sinonimos"));
const TemplatesProposta = lazy(() => import("./pages/TemplatesProposta"));
const DataQualityDashboard = lazy(() => named(import("./pages/DataQualityDashboard"), "DataQualityDashboard"));
const ImportarNfe = lazy(() => named(import("./pages/ImportarNfe"), "ImportarNfe"));
const AplicarPrecificacao = lazy(() => import("./pages/AplicarPrecificacao"));
const RegrasCategoria = lazy(() => import("./pages/RegrasCategoria"));
const AnalisePrecosV2 = lazy(() => named(import("./pages/AnalisePrecosV2"), "AnalisePrecosV2"));
const ScraperFornecedores = lazy(() => import("./pages/ScraperFornecedores"));
const AgenteProposta = lazy(() => import("./pages/AgenteProposta"));
const CaptureReview = lazy(() => named(import("./pages/CaptureReview"), "CaptureReview"));
const NfeEnrichmentPipeline = lazy(() => named(import("./pages/NfeEnrichmentPipeline"), "NfeEnrichmentPipeline"));
const HistoricoEnriquecimento = lazy(() => import("./pages/HistoricoEnriquecimento"));
const DiligenciasPage = lazy(() => import("./pages/Diligencias"));
const DocumentosHabilitacaoPage = lazy(() => import("./pages/DocumentosHabilitacao"));
const CotacoesRecebidas = lazy(() => import("./pages/CotacoesRecebidas"));
const Certidoes = lazy(() => import("./pages/Certidoes"));
const SalaDisputa = lazy(() => import("./pages/SalaDisputa"));
const PortaisLicitacao = lazy(() => import("./pages/PortaisLicitacao"));
const Desempenho = lazy(() => import("./pages/Desempenho"));
const MotorTributario = lazy(() => import("./pages/MotorTributario"));
const CustoTotal = lazy(() => import("./pages/CustoTotal"));
const IntelligentCaptureCenter = lazy(() => import("./pages/IntelligentCaptureCenter"));
const DatabaseIntegrityCheck = lazy(() => named(import("./pages/DatabaseIntegrityCheck"), "DatabaseIntegrityCheck"));
const CentroOperacional = lazy(() => import("./pages/CentroOperacional"));

function PageLoading() { return <div className="min-h-[60vh] flex items-center justify-center"><div className="w-8 h-1 bg-blue-800 animate-pulse rounded" /></div>; }

function Router() {
  return <Switch>
    <Route path="/login"><Suspense fallback={<PageLoading />}><Login /></Suspense></Route>
    <Route><AppLayout><RequireAuth message="Faça login para acessar o sistema."><Suspense fallback={<PageLoading />}><Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/dashboard"><Redirect to="/" /></Route>
      <Route path="/oportunidades"><RequireAuth minRole="editor"><Oportunidades /></RequireAuth></Route>
      <Route path="/propostas"><Propostas /></Route>
      <Route path="/propostas/:id"><PropostaEditor /></Route>
      <Route path="/propostas-admin"><PropostasAdmin /></Route>
      <Route path="/execucao"><RequireAuth minRole="editor"><Execucao /></RequireAuth></Route>
      <Route path="/catalogo"><Catalogo /></Route>
      <Route path="/financeiro"><FinanceiroCentral /></Route>
      <Route path="/agenda" component={Agenda} />
      <Route path="/assistente"><AssistenteOperacional /></Route>
      <Route path="/busca-global" component={BuscaGlobal} />
      <Route path="/configuracao"><RequireAuth minRole="admin"><ConfiguracaoEmpresa /></RequireAuth></Route>
      <Route path="/integracoes"><RequireAuth minRole="admin"><Integracoes /></RequireAuth></Route>
      <Route path="/usuarios"><RequireAuth minRole="admin"><Usuarios /></RequireAuth></Route>
      <Route path="/diagnostico"><RequireAuth minRole="editor"><Diagnostico /></RequireAuth></Route>
      <Route path="/admin/operacional"><RequireAuth minRole="admin"><CentroOperacional /></RequireAuth></Route>
      <Route path="/manual" component={Manual} />
      <Route path="/seguranca"><SegurancaMFA /></Route>
      <Route path="/logs"><RequireAuth minRole="admin"><Logs /></RequireAuth></Route>
      <Route path="/admin/database-health"><RequireAuth minRole="admin"><DatabaseIntegrityCheck /></RequireAuth></Route>
      <Route path="/produtos" component={Produtos} />
      <Route path="/fornecedores"><RequireAuth minRole="editor"><Fornecedores /></RequireAuth></Route>
      <Route path="/comparacao" component={Comparacao} />
      <Route path="/equivalencias" component={Equivalencias} />
      <Route path="/categorias" component={Categorias} />
      <Route path="/qualidade"><RequireAuth minRole="editor"><DataQualityDashboard /></RequireAuth></Route>
      <Route path="/enriquecimento"><EnriquecimentoCatalogo /></Route>
      <Route path="/reclassificacao"><RequireAuth minRole="editor"><ReclassificacaoIA /></RequireAuth></Route>
      <Route path="/imagens"><GestaoImagens /></Route>
      <Route path="/importar"><RequireAuth minRole="editor"><ImportarPlanilha /></RequireAuth></Route>
      <Route path="/importar-nfe"><RequireAuth minRole="editor"><ImportarNfe /></RequireAuth></Route>
      <Route path="/enriquecimento-nfe"><RequireAuth minRole="editor"><NfeEnrichmentPipeline /></RequireAuth></Route>
      <Route path="/historico-enriquecimento"><RequireAuth minRole="editor"><HistoricoEnriquecimento /></RequireAuth></Route>
      <Route path="/captura-inteligente"><RequireAuth minRole="editor"><IntelligentCaptureCenter /></RequireAuth></Route>
      <Route path="/captura-revisao"><RequireAuth minRole="editor"><CaptureReview /></RequireAuth></Route>
      <Route path="/scraper-fornecedores"><RequireAuth minRole="admin"><ScraperFornecedores /></RequireAuth></Route>
      <Route path="/sinonimos"><Sinonimos /></Route>
      <Route path="/analise-precos"><RequireAuth minRole="editor"><AnalisePrecosV2 /></RequireAuth></Route>
      <Route path="/aplicar-precificacao"><RequireAuth minRole="admin"><AplicarPrecificacao /></RequireAuth></Route>
      <Route path="/regras-categoria"><RequireAuth minRole="admin"><RegrasCategoria /></RequireAuth></Route>
      <Route path="/edital"><RequireAuth minRole="editor"><ImportarEdital /></RequireAuth></Route>
      <Route path="/analise-juridica"><RequireAuth minRole="editor"><AnaliseJuridica /></RequireAuth></Route>
      <Route path="/cotacoes-recebidas"><CotacoesRecebidas /></Route>
      <Route path="/sala-disputa"><RequireAuth minRole="editor"><SalaDisputa /></RequireAuth></Route>
      <Route path="/documentos-habilitacao"><RequireAuth minRole="editor"><DocumentosHabilitacaoPage /></RequireAuth></Route>
      <Route path="/diligencias"><RequireAuth minRole="editor"><DiligenciasPage /></RequireAuth></Route>
      <Route path="/certidoes"><RequireAuth minRole="editor"><Certidoes /></RequireAuth></Route>
      <Route path="/portais-licitacao"><RequireAuth minRole="editor"><PortaisLicitacao /></RequireAuth></Route>
      <Route path="/templates-proposta"><TemplatesProposta /></Route>
      <Route path="/agente-proposta"><RequireAuth minRole="editor"><AgenteProposta /></RequireAuth></Route>
      <Route path="/desempenho" component={Desempenho} />
      <Route path="/tributos" component={MotorTributario} />
      <Route path="/custo-total" component={CustoTotal} />
      <Route path="/funil"><Redirect to="/oportunidades" /></Route>
      <Route path="/radar-pncp"><Redirect to="/oportunidades?origem=fontes" /></Route>
      <Route path="/pos-venda"><Redirect to="/execucao" /></Route>
      <Route path="/centro-operacional"><Redirect to="/execucao" /></Route>
      <Route path="/central-operacional"><Redirect to="/oportunidades" /></Route>
      <Route path="/decisao-executiva"><Redirect to="/oportunidades" /></Route>
      <Route path="/contratos-pos-licitacao"><Redirect to="/execucao?tab=contratos" /></Route>
      <Route path="/central-ia"><Redirect to="/integracoes" /></Route>
      <Route path="/agente"><Redirect to="/assistente" /></Route>
      <Route path="/busca"><Redirect to="/busca-global?modo=precos" /></Route>
      <Route path="/proposta-rapida"><Redirect to="/propostas" /></Route>
      <Route path="/analisador-edital"><Redirect to="/edital" /></Route>
      <Route path="/proposta-automatica"><Redirect to="/edital" /></Route>
      <Route path="/configurador-fornecedores"><Redirect to="/scraper-fornecedores" /></Route>
      <Route path="/captura-scheduler"><Redirect to="/captura-inteligente" /></Route>
      <Route path="/captura-analytics"><Redirect to="/captura-inteligente" /></Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch></Suspense></RequireAuth></AppLayout></Route>
  </Switch>;
}

function App() { return <ErrorBoundary><TooltipProvider><Toaster /><Router /></TooltipProvider></ErrorBoundary>; }
export default App;
