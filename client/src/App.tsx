import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import AppLayout from "./components/AppLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import BuscaRapida from "./pages/BuscaRapida";
import Comparacao from "./pages/Comparacao";
import ConfiguracaoEmpresa from "./pages/ConfiguracaoEmpresa";
import Dashboard from "./pages/Dashboard";
import Categorias from "./pages/Categorias";
import Equivalencias from "./pages/Equivalencias";
import Fornecedores from "./pages/Fornecedores";
import ImportarPlanilha from "./pages/ImportarPlanilha";
import PropostaEditor from "./pages/PropostaEditor";
import Propostas from "./pages/Propostas";
import PropostasAdmin from "./pages/PropostasAdmin";
import ControleFinanceiro from "./pages/ControleFinanceiro";
import Produtos from "./pages/Produtos";
import GestaoImagens from "./pages/GestaoImagens";
import RequireAuth from "./components/RequireAuth";
import PropostaRapida from "./pages/PropostaRapida";
import EnriquecimentoCatalogo from "./pages/EnriquecimentoCatalogo";
import ReclassificacaoIA from "./pages/ReclassificacaoIA";
import ImportarEdital from "./pages/ImportarEdital";
import Sinonimos from "./pages/Sinonimos";
import TemplatesProposta from "./pages/TemplatesProposta";
import PropostaAutomatica from "./pages/PropostaAutomatica";
import { DataQualityDashboard } from "./pages/DataQualityDashboard";
import { GestaoProducts } from "./pages/GestaoProducts";
import { ComparadorFornecedores } from "./pages/ComparadorFornecedores";
import { Orcamentos } from "./pages/Orcamentos";
import { ImportarNfe } from "./pages/ImportarNfe";
import ConfiguradorScraper from "./pages/ConfiguradorScraper";
import ConfiguradorFornecedores from "./pages/ConfiguradorFornecedores";
import ConfiguradorPrecificacao from "./pages/ConfiguradorPrecificacao";
import AplicarPrecificacao from "./pages/AplicarPrecificacao";
import RegrasCategoria from "./pages/RegrasCategoria";
import { AnalisePrecosV2 } from "./pages/AnalisePrecosV2";
import ScraperFornecedores from "./pages/ScraperFornecedores";
import AgenteProposta from "./pages/AgenteProposta";
import Agente from "./pages/Agente";
import MonitoringDashboard from "./pages/MonitoringDashboard";
import PriceAnalyticsDashboard from "./pages/PriceAnalyticsDashboard";
import MarginOptimization from "./pages/MarginOptimization";
import { CaptureReview } from "./pages/CaptureReview";
import { CaptureSchedulerMonitor } from "./pages/CaptureSchedulerMonitor";
import { AIEnrichment } from "./pages/AIEnrichment";
import { CaptureAnalytics } from "./pages/CaptureAnalytics";
import { NfeImport } from "./pages/NfeImport";
import { NfeEnrichmentPipeline } from "./pages/NfeEnrichmentPipeline";
import HistoricoEnriquecimento from "./pages/HistoricoEnriquecimento";
import DiligenciasPage from "./pages/Diligencias";
import DocumentosHabilitacaoPage from "./pages/DocumentosHabilitacao";
import CentralOperacional from "./pages/CentralOperacional";
import ExecutiveDecisionCenter from "./pages/ExecutiveDecisionCenter";
import PostAwardContractsCenter from "./pages/PostAwardContractsCenter";
import IntelligentCaptureCenter from "./pages/IntelligentCaptureCenter";
import { DatabaseIntegrityCheck } from "./pages/DatabaseIntegrityCheck";

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/dashboard"><Redirect to="/" /></Route>
        <Route path="/busca" component={BuscaRapida} />
        <Route path="/comparacao" component={Comparacao} />
        <Route path="/categorias" component={Categorias} />
        <Route path="/produtos" component={Produtos} />
        <Route path="/gestao-produtos">
          <RequireAuth message="Gerencie produtos após fazer login." minRole="editor">
            <GestaoProducts />
          </RequireAuth>
        </Route>
        <Route path="/comparador-fornecedores" component={ComparadorFornecedores} />
        <Route path="/orcamentos">
          <RequireAuth message="Crie orçamentos após fazer login.">
            <Orcamentos />
          </RequireAuth>
        </Route>
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
        <Route path="/configurador-scraper">
          <RequireAuth message="Configure o scraper automático após fazer login." minRole="admin">
            <ConfiguradorScraper />
          </RequireAuth>
        </Route>
        <Route path="/configurador-fornecedores">
          <RequireAuth message="Configure fornecedores após fazer login." minRole="admin">
            <ConfiguradorFornecedores />
          </RequireAuth>
        </Route>
        <Route path="/configurador-precificacao">
          <RequireAuth message="Configure precificação após fazer login." minRole="admin">
            <ConfiguradorPrecificacao />
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
        <Route path="/monitoramento">
          <RequireAuth message="Acesse o dashboard de monitoramento após fazer login." minRole="editor">
            <MonitoringDashboard />
          </RequireAuth>
        </Route>
        <Route path="/analise-precos-v2">
          <RequireAuth message="Analise preços em detalhes após fazer login." minRole="editor">
            <PriceAnalyticsDashboard />
          </RequireAuth>
        </Route>
        <Route path="/margens">
          <RequireAuth message="Acesse o painel de margens após fazer login." minRole="editor">
            <MarginOptimization />
          </RequireAuth>
        </Route>
        <Route path="/captura-revisao">
          <RequireAuth message="Revise produtos capturados após fazer login." minRole="editor">
            <CaptureReview />
          </RequireAuth>
        </Route>
        <Route path="/captura-scheduler">
          <RequireAuth message="Gerencie agendamentos de captura após fazer login." minRole="editor">
            <CaptureSchedulerMonitor />
          </RequireAuth>
        </Route>
        <Route path="/enriquecimento-ia">
          <RequireAuth message="Enriqueça produtos com IA após fazer login." minRole="editor">
            <AIEnrichment />
          </RequireAuth>
        </Route>
        <Route path="/captura-analytics">
          <RequireAuth message="Visualize analytics de captura após fazer login." minRole="editor">
            <CaptureAnalytics />
          </RequireAuth>
        </Route>
        <Route path="/central-operacional">
          <RequireAuth message="Acesse a central operacional após fazer login." minRole="editor">
            <CentralOperacional />
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
        <Route path="/importar-nfe">
          <RequireAuth message="Importe NF-es após fazer login." minRole="editor">
            <NfeImport />
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
        <Route path="/decisao-executiva">
          <RequireAuth message="Acesse o assistente de decisão executivo após fazer login." minRole="editor">
            <ExecutiveDecisionCenter />
          </RequireAuth>
        </Route>
        <Route path="/contratos-pos-licitacao">
          <RequireAuth message="Acesse a gestão de contratos pós-licitação após fazer login." minRole="editor">
            <PostAwardContractsCenter />
          </RequireAuth>
        </Route>
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
        <Route path="/proposta-rapida">
          <RequireAuth message="Crie propostas rápidas após fazer login.">
            <PropostaRapida />
          </RequireAuth>
        </Route>
        <Route path="/propostas/:id">
          <RequireAuth message="Edite propostas após fazer login.">
            <PropostaEditor />
          </RequireAuth>
        </Route>
        <Route path="/propostas-admin">
          <RequireAuth message="Administre propostas após fazer login." minRole="admin">
            <PropostasAdmin />
          </RequireAuth>
        </Route>
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
          <ImportarEdital />
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

        <Route path="/analisador-edital"><Redirect to="/proposta-automatica" /></Route>
        <Route path="/proposta-automatica">
          {() => <PropostaAutomatica />}
        </Route>
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
    </AppLayout>
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
