import { lazy, Suspense } from "react";
import { Redirect, Route, Switch } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import AppLayout from "./components/AppLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import RequireAuth from "./components/RequireAuth";

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
const DataQualityDashboard = lazy(() =>
  import("./pages/DataQualityDashboard").then((module) => ({ default: module.DataQualityDashboard })),
);
const ImportarNfe = lazy(() =>
  import("./pages/ImportarNfe").then((module) => ({ default: module.ImportarNfe })),
);
const AplicarPrecificacao = lazy(() => import("./pages/AplicarPrecificacao"));
const RegrasCategoria = lazy(() => import("./pages/RegrasCategoria"));
const AnalisePrecosV2 = lazy(() =>
  import("./pages/AnalisePrecosV2").then((module) => ({ default: module.AnalisePrecosV2 })),
);
const ScraperFornecedores = lazy(() => import("./pages/ScraperFornecedores"));
const AgenteProposta = lazy(() => import("./pages/AgenteProposta"));
const CaptureReview = lazy(() =>
  import("./pages/CaptureReview").then((module) => ({ default: module.CaptureReview })),
);
const NfeEnrichmentPipeline = lazy(() =>
  import("./pages/NfeEnrichmentPipeline").then((module) => ({ default: module.NfeEnrichmentPipeline })),
);
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
const DatabaseIntegrityCheck = lazy(() =>
  import("./pages/DatabaseIntegrityCheck").then((module) => ({ default: module.DatabaseIntegrityCheck })),
);
const CentroOperacional = lazy(() => import("./pages/CentroOperacional"));

function PageLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-1 w-8 animate-pulse rounded bg-blue-800" />
    </div>
  );
}

function EditorRoute({ children }: { children: React.ReactNode }) {
  return <RequireAuth minRole="editor">{children}</RequireAuth>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  return <RequireAuth minRole="admin">{children}</RequireAuth>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login">
        <Suspense fallback={<PageLoading />}>
          <Login />
        </Suspense>
      </Route>

      <Route>
        <AppLayout>
          <RequireAuth message="Faça login para acessar o sistema.">
            <Suspense fallback={<PageLoading />}>
              <Switch>
                <Route path="/" component={Dashboard} />
                <Route path="/dashboard"><Redirect to="/" /></Route>

                <Route path="/oportunidades"><EditorRoute><Oportunidades /></EditorRoute></Route>
                <Route path="/propostas"><Propostas /></Route>
                <Route path="/propostas/:id"><EditorRoute><PropostaEditor /></EditorRoute></Route>
                <Route path="/propostas-admin"><EditorRoute><PropostasAdmin /></EditorRoute></Route>
                <Route path="/execucao"><EditorRoute><Execucao /></EditorRoute></Route>
                <Route path="/catalogo"><Catalogo /></Route>
                <Route path="/financeiro"><EditorRoute><FinanceiroCentral /></EditorRoute></Route>
                <Route path="/agenda" component={Agenda} />
                <Route path="/assistente"><AssistenteOperacional /></Route>
                <Route path="/busca-global" component={BuscaGlobal} />
                <Route path="/desempenho" component={Desempenho} />

                <Route path="/configuracao"><AdminRoute><ConfiguracaoEmpresa /></AdminRoute></Route>
                <Route path="/integracoes"><AdminRoute><Integracoes /></AdminRoute></Route>
                <Route path="/usuarios"><AdminRoute><Usuarios /></AdminRoute></Route>
                <Route path="/diagnostico"><EditorRoute><Diagnostico /></EditorRoute></Route>
                <Route path="/admin/operacional"><AdminRoute><CentroOperacional /></AdminRoute></Route>
                <Route path="/manual" component={Manual} />
                <Route path="/seguranca"><SegurancaMFA /></Route>
                <Route path="/logs"><AdminRoute><Logs /></AdminRoute></Route>
                <Route path="/admin/database-health"><AdminRoute><DatabaseIntegrityCheck /></AdminRoute></Route>

                <Route path="/produtos" component={Produtos} />
                <Route path="/fornecedores"><EditorRoute><Fornecedores /></EditorRoute></Route>
                <Route path="/comparacao" component={Comparacao} />
                <Route path="/equivalencias" component={Equivalencias} />
                <Route path="/categorias" component={Categorias} />
                <Route path="/qualidade"><EditorRoute><DataQualityDashboard /></EditorRoute></Route>
                <Route path="/enriquecimento"><EditorRoute><EnriquecimentoCatalogo /></EditorRoute></Route>
                <Route path="/reclassificacao"><EditorRoute><ReclassificacaoIA /></EditorRoute></Route>
                <Route path="/imagens"><EditorRoute><GestaoImagens /></EditorRoute></Route>
                <Route path="/importar"><EditorRoute><ImportarPlanilha /></EditorRoute></Route>
                <Route path="/importar-nfe"><EditorRoute><ImportarNfe /></EditorRoute></Route>
                <Route path="/enriquecimento-nfe"><EditorRoute><NfeEnrichmentPipeline /></EditorRoute></Route>
                <Route path="/historico-enriquecimento"><EditorRoute><HistoricoEnriquecimento /></EditorRoute></Route>
                <Route path="/captura-inteligente"><EditorRoute><IntelligentCaptureCenter /></EditorRoute></Route>
                <Route path="/captura-revisao"><EditorRoute><CaptureReview /></EditorRoute></Route>
                <Route path="/scraper-fornecedores"><AdminRoute><ScraperFornecedores /></AdminRoute></Route>
                <Route path="/sinonimos"><EditorRoute><Sinonimos /></EditorRoute></Route>
                <Route path="/analise-precos"><EditorRoute><AnalisePrecosV2 /></EditorRoute></Route>
                <Route path="/aplicar-precificacao"><AdminRoute><AplicarPrecificacao /></AdminRoute></Route>
                <Route path="/regras-categoria"><AdminRoute><RegrasCategoria /></AdminRoute></Route>

                <Route path="/edital"><EditorRoute><ImportarEdital /></EditorRoute></Route>
                <Route path="/analise-juridica"><EditorRoute><AnaliseJuridica /></EditorRoute></Route>
                <Route path="/cotacoes-recebidas"><EditorRoute><CotacoesRecebidas /></EditorRoute></Route>
                <Route path="/sala-disputa"><EditorRoute><SalaDisputa /></EditorRoute></Route>
                <Route path="/documentos-habilitacao"><EditorRoute><DocumentosHabilitacaoPage /></EditorRoute></Route>
                <Route path="/diligencias"><EditorRoute><DiligenciasPage /></EditorRoute></Route>
                <Route path="/certidoes"><EditorRoute><Certidoes /></EditorRoute></Route>
                <Route path="/portais-licitacao"><EditorRoute><PortaisLicitacao /></EditorRoute></Route>
                <Route path="/templates-proposta"><EditorRoute><TemplatesProposta /></EditorRoute></Route>
                <Route path="/agente-proposta"><EditorRoute><AgenteProposta /></EditorRoute></Route>
                <Route path="/tributos"><EditorRoute><MotorTributario /></EditorRoute></Route>
                <Route path="/custo-total"><EditorRoute><CustoTotal /></EditorRoute></Route>

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
                <Route path="/propostas-admin-antigo"><Redirect to="/propostas-admin" /></Route>
                <Route path="/analisador-edital"><Redirect to="/edital" /></Route>
                <Route path="/proposta-automatica"><Redirect to="/edital" /></Route>
                <Route path="/configurador-fornecedores"><Redirect to="/scraper-fornecedores" /></Route>
                <Route path="/captura-scheduler"><Redirect to="/captura-inteligente" /></Route>
                <Route path="/captura-analytics"><Redirect to="/captura-inteligente" /></Route>

                <Route path="/404" component={NotFound} />
                <Route component={NotFound} />
              </Switch>
            </Suspense>
          </RequireAuth>
        </AppLayout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </ErrorBoundary>
  );
}

export default App;
