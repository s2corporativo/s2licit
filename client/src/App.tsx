import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import AppLayout from "./components/AppLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import RequireAuth from "./components/RequireAuth";

// Todas as telas são carregadas sob demanda (code-splitting): o navegador só
// baixa o pedaço da tela que está sendo aberta, em vez do sistema inteiro de
// uma vez. É o que mantém a abertura rápida mesmo com 60+ telas.
const named = <T extends string>(p: Promise<Record<T, React.ComponentType<any>>>, key: T) =>
  p.then((m) => ({ default: m[key] }));

const BuscaRapida = lazy(() => import("./pages/BuscaRapida"));
const Comparacao = lazy(() => import("./pages/Comparacao"));
const ConfiguracaoEmpresa = lazy(() => import("./pages/ConfiguracaoEmpresa"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Categorias = lazy(() => import("./pages/Categorias"));
const Equivalencias = lazy(() => import("./pages/Equivalencias"));
const Fornecedores = lazy(() => import("./pages/Fornecedores"));
const ImportarPlanilha = lazy(() => import("./pages/ImportarPlanilha"));
const PropostaEditor = lazy(() => import("./pages/PropostaEditor"));
const Propostas = lazy(() => import("./pages/Propostas"));
const ControleFinanceiro = lazy(() => import("./pages/ControleFinanceiro"));
const Produtos = lazy(() => import("./pages/Produtos"));
const GestaoImagens = lazy(() => import("./pages/GestaoImagens"));
const EnriquecimentoCatalogo = lazy(() => import("./pages/EnriquecimentoCatalogo"));
const ReclassificacaoIA = lazy(() => import("./pages/ReclassificacaoIA"));
const ImportarEdital = lazy(() => import("./pages/ImportarEdital"));
const Sinonimos = lazy(() => import("./pages/Sinonimos"));
const TemplatesProposta = lazy(() => import("./pages/TemplatesProposta"));
const DataQualityDashboard = lazy(() => named(import("./pages/DataQualityDashboard"), "DataQualityDashboard"));
const ImportarNfe = lazy(() => named(import("./pages/ImportarNfe"), "ImportarNfe"));
const ConfiguradorFornecedores = lazy(() => import("./pages/ConfiguradorFornecedores"));
const AplicarPrecificacao = lazy(() => import("./pages/AplicarPrecificacao"));
const RegrasCategoria = lazy(() => import("./pages/RegrasCategoria"));
const AnalisePrecosV2 = lazy(() => named(import("./pages/AnalisePrecosV2"), "AnalisePrecosV2"));
const ScraperFornecedores = lazy(() => import("./pages/ScraperFornecedores"));
const AgenteProposta = lazy(() => import("./pages/AgenteProposta"));
const Agente = lazy(() => import("./pages/Agente"));
const CaptureReview = lazy(() => named(import("./pages/CaptureReview"), "CaptureReview"));
const NfeEnrichmentPipeline = lazy(() => named(import("./pages/NfeEnrichmentPipeline"), "NfeEnrichmentPipeline"));
const HistoricoEnriquecimento = lazy(() => import("./pages/HistoricoEnriquecimento"));
const DiligenciasPage = lazy(() => import("./pages/Diligencias"));
const DocumentosHabilitacaoPage = lazy(() => import("./pages/DocumentosHabilitacao"));
const CotacoesRecebidas = lazy(() => import("./pages/CotacoesRecebidas"));
const RadarPncp = lazy(() => import("./pages/RadarPncp"));
const Certidoes = lazy(() => import("./pages/Certidoes"));
const CentralIA = lazy(() => import("./pages/CentralIA"));
const SalaDisputa = lazy(() => import("./pages/SalaDisputa"));
const PortaisLicitacao = lazy(() => import("./pages/PortaisLicitacao"));
const Agenda = lazy(() => import("./pages/Agenda"));
const Desempenho = lazy(() => import("./pages/Desempenho"));
const Funil = lazy(() => import("./pages/Funil"));
const MotorTributario = lazy(() => import("./pages/MotorTributario"));
const CustoTotal = lazy(() => import("./pages/CustoTotal"));
const PosVenda = lazy(() => import("./pages/PosVenda"));
const BuscaGlobal = lazy(() => import("./pages/BuscaGlobal"));
const IntelligentCaptureCenter = lazy(() => import("./pages/IntelligentCaptureCenter"));
const DatabaseIntegrityCheck = lazy(() => named(import("./pages/DatabaseIntegrityCheck"), "DatabaseIntegrityCheck"));
const Login = lazy(() => import("./pages/Login"));
const Manual = lazy(() => import("./pages/Manual"));
const Diagnostico = lazy(() => import("./pages/Diagnostico"));

function PageLoading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-8 h-1 bg-blue-800 animate-pulse rounded" />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      {/* Login fica fora do layout e da exigência de autenticação */}
      <Route path="/login">
        <Suspense fallback={<PageLoading />}><Login /></Suspense>
      </Route>
      <Route>
        <AppLayout>
          <RequireAuth message="Faça login para acessar o sistema.">
            <Suspense fallback={<PageLoading />}>
            <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/dashboard"><Redirect to="/" /></Route>
        <Route path="/agenda" component={Agenda} />
        <Route path="/desempenho" component={Desempenho} />
        <Route path="/funil" component={Funil} />
        <Route path="/tributos" component={MotorTributario} />
        <Route path="/custo-total" component={CustoTotal} />
        <Route path="/pos-venda" component={PosVenda} />
        <Route path="/busca-global" component={BuscaGlobal} />
        <Route path="/manual" component={Manual} />
        <Route path="/diagnostico">
          <RequireAuth message="Acesse a Central de Diagnóstico após fazer login." minRole="editor">
            <Diagnostico />
          </RequireAuth>
        </Route>
        <Route path="/busca" component={BuscaRapida} />
        <Route path="/comparacao" component={Comparacao} />
        <Route path="/categorias" component={Categorias} />
        <Route path="/produtos" component={Produtos} />
        <Route path="/equivalencias" component={Equivalencias} />
        <Route path="/qualidade">
          <RequireAuth message="Acesse o Dashboard de Qualidade após fazer login." minRole="editor">
            <DataQualityDashboard />
          </RequireAuth>
        </Route>
        <Route path="/fornecedores">
          <RequireAuth message="Gerencie fornecedores após fazer login." minRole="editor">
            <Fornecedores />
          </RequireAuth>
        </Route>
        <Route path="/importar">
          <RequireAuth message="Importe planilhas após fazer login." minRole="editor">
            <ImportarPlanilha />
          </RequireAuth>
        </Route>
        <Route path="/importar-nfe">
          <RequireAuth message="Importe NFe após fazer login." minRole="editor">
            <ImportarNfe />
          </RequireAuth>
        </Route>
        <Route path="/configurador-fornecedores">
          <RequireAuth message="Configure fornecedores após fazer login." minRole="admin">
            <ConfiguradorFornecedores />
          </RequireAuth>
        </Route>
        <Route path="/aplicar-precificacao">
          <RequireAuth message="Aplique precificação após fazer login." minRole="admin">
            <AplicarPrecificacao />
          </RequireAuth>
        </Route>
        <Route path="/regras-categoria">
          <RequireAuth message="Configure regras após fazer login." minRole="admin">
            <RegrasCategoria />
          </RequireAuth>
        </Route>
        <Route path="/analise-precos">
          <RequireAuth message="Analise preços após fazer login." minRole="editor">
            <AnalisePrecosV2 />
          </RequireAuth>
        </Route>
        <Route path="/captura-revisao">
          <RequireAuth message="Revise produtos capturados após fazer login." minRole="editor">
            <CaptureReview />
          </RequireAuth>
        </Route>
        <Route path="/captura-scheduler"><Redirect to="/captura-inteligente" /></Route>
        <Route path="/captura-analytics"><Redirect to="/captura-inteligente" /></Route>
        <Route path="/central-operacional"><Redirect to="/funil" /></Route>
        <Route path="/cotacoes-recebidas">
          <RequireAuth message="Acesse as cotações recebidas após fazer login.">
            <CotacoesRecebidas />
          </RequireAuth>
        </Route>
        <Route path="/radar-pncp">
          <RequireAuth message="Acesse o radar de oportunidades após fazer login.">
            <RadarPncp />
          </RequireAuth>
        </Route>
        <Route path="/certidoes">
          <RequireAuth message="Acesse as certidões após fazer login." minRole="editor">
            <Certidoes />
          </RequireAuth>
        </Route>
        <Route path="/central-ia">
          <RequireAuth message="Acesse a Central de IA após fazer login." minRole="admin">
            <CentralIA />
          </RequireAuth>
        </Route>
        <Route path="/sala-disputa">
          <RequireAuth message="Acesse a Sala de Disputa após fazer login." minRole="editor">
            <SalaDisputa />
          </RequireAuth>
        </Route>
        <Route path="/portais-licitacao">
          <RequireAuth message="Acesse os portais de licitação após fazer login." minRole="editor">
            <PortaisLicitacao />
          </RequireAuth>
        </Route>
        <Route path="/documentos-habilitacao">
          <RequireAuth message="Gerencie documentos de habilitação após fazer login." minRole="editor">
            <DocumentosHabilitacaoPage />
          </RequireAuth>
        </Route>
        <Route path="/diligencias">
          <RequireAuth message="Gerencie diligências e recursos após fazer login." minRole="editor">
            <DiligenciasPage />
          </RequireAuth>
        </Route>
        <Route path="/enriquecimento-nfe">
          <RequireAuth message="Enriqueça produtos de NF-e após fazer login." minRole="editor">
            <NfeEnrichmentPipeline />
          </RequireAuth>
        </Route>
        <Route path="/historico-enriquecimento">
          <RequireAuth message="Visualize o histórico de enriquecimento após fazer login." minRole="editor">
            <HistoricoEnriquecimento />
          </RequireAuth>
        </Route>
        <Route path="/decisao-executiva"><Redirect to="/funil" /></Route>
        <Route path="/contratos-pos-licitacao"><Redirect to="/pos-venda" /></Route>
        <Route path="/captura-inteligente">
          <RequireAuth message="Acesse a captura inteligente multi-origem após fazer login." minRole="editor">
            <IntelligentCaptureCenter />
          </RequireAuth>
        </Route>
        <Route path="/admin/database-health">
          <RequireAuth message="Acesse o verificador de integridade do banco após fazer login." minRole="admin">
            <DatabaseIntegrityCheck />
          </RequireAuth>
        </Route>

        <Route path="/propostas">
          <RequireAuth message="Gerencie propostas comerciais após fazer login.">
            <Propostas />
          </RequireAuth>
        </Route>
        <Route path="/proposta-rapida"><Redirect to="/edital" /></Route>
        <Route path="/propostas/:id">
          <RequireAuth message="Edite propostas após fazer login.">
            <PropostaEditor />
          </RequireAuth>
        </Route>
        <Route path="/propostas-admin"><Redirect to="/propostas" /></Route>
        <Route path="/financeiro">
          <RequireAuth message="Acesse o controle financeiro após fazer login.">
            <ControleFinanceiro />
          </RequireAuth>
        </Route>
        <Route path="/enriquecimento">
          <RequireAuth message="Faça login para acessar o enriquecimento de catálogo.">
            <EnriquecimentoCatalogo />
          </RequireAuth>
        </Route>
        <Route path="/reclassificacao">
          <RequireAuth message="Faça login para acessar a reclassificação em lote." minRole="editor">
            <ReclassificacaoIA />
          </RequireAuth>
        </Route>
        <Route path="/edital">
          <RequireAuth message="Importe editais após fazer login." minRole="editor">
            <ImportarEdital />
          </RequireAuth>
        </Route>
        <Route path="/imagens">
          <RequireAuth message="Gerencie imagens de produtos após fazer login.">
            <GestaoImagens />
          </RequireAuth>
        </Route>
        <Route path="/configuracao">
          <RequireAuth message="Acesse as configurações após fazer login." minRole="admin">
            <ConfiguracaoEmpresa />
          </RequireAuth>
        </Route>

        <Route path="/sinonimos">
          <RequireAuth message="Faça login para gerenciar sinônimos de matching.">
            <Sinonimos />
          </RequireAuth>
        </Route>
        <Route path="/templates-proposta">
          <RequireAuth message="Faça login para gerenciar templates de proposta.">
            <TemplatesProposta />
          </RequireAuth>
        </Route>

        <Route path="/analisador-edital"><Redirect to="/edital" /></Route>
        <Route path="/proposta-automatica"><Redirect to="/edital" /></Route>
        <Route path="/scraper-fornecedores">
          <RequireAuth message="Faça login para acessar o agente de scraping." minRole="admin">
            <ScraperFornecedores />
          </RequireAuth>
        </Route>
        <Route path="/agente-proposta">
          <RequireAuth message="Faça login para usar o agente de propostas." minRole="editor">
            <AgenteProposta />
          </RequireAuth>
        </Route>
        <Route path="/agente">
          <RequireAuth message="Faça login para acessar o assistente IA.">
            <Agente />
          </RequireAuth>
        </Route>
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
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
