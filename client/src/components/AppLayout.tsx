import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import {
  Bot,
  BarChart3,
  Building2,
  CheckCircle2,
  DollarSign,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  GitMerge,
  Image,
  LayoutGrid,
  LogIn,
  LogOut,
  Package,
  Search,
  Settings,
  Sparkles,
  Workflow,
  FileScan,
  Receipt,
  BookMarked,
  Sparkle,
  Zap,
  Globe,
  ShieldAlert,
  ShieldCheck,
  FolderClock,
  ClipboardList,
  MailCheck,
  Radar,
  Brain,
  Gavel,
  KeyRound,
  CalendarClock,
  Trophy,
  KanbanSquare,
  Percent,
  Truck,
  PackageCheck,
} from "lucide-react";
import { Link, useLocation } from "wouter";

type NavItem = { href: string; icon: React.ElementType; label: string };
type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: "Geral",
    items: [
      { href: "/", icon: LayoutGrid, label: "Dashboard" },
      { href: "/busca-global", icon: Search, label: "Busca Global" },
      { href: "/agenda", icon: CalendarClock, label: "Agenda" },
      { href: "/desempenho", icon: Trophy, label: "Desempenho" },
    ],
  },
  {
    label: "Oportunidades",
    items: [
      { href: "/funil", icon: KanbanSquare, label: "Funil de Oportunidades" },
      { href: "/radar-pncp", icon: Radar, label: "Radar de Oportunidades" },
      { href: "/cotacoes-recebidas", icon: MailCheck, label: "Cotações Recebidas" },
      { href: "/central-operacional", icon: ClipboardList, label: "Central Operacional" },
      { href: "/edital", icon: FileScan, label: "Importar Edital" },
      { href: "/decisao-executiva", icon: Zap, label: "Decisão Executiva" },
    ],
  },
  {
    label: "Preços & Precificação",
    items: [
      { href: "/busca", icon: Search, label: "Busca Rápida" },
      { href: "/comparacao", icon: BarChart3, label: "Comparação de Preços" },
      { href: "/analise-precos", icon: BarChart3, label: "Análise de Preços" },
      { href: "/sala-disputa", icon: Gavel, label: "Sala de Disputa" },
      { href: "/custo-total", icon: Truck, label: "Custo Total & Fretes" },
      { href: "/tributos", icon: Percent, label: "Motor Tributário" },
      { href: "/aplicar-precificacao", icon: DollarSign, label: "Precificação em Massa" },
      { href: "/regras-categoria", icon: FolderOpen, label: "Regras por Categoria" },
    ],
  },
  {
    label: "Propostas",
    items: [
      { href: "/proposta-rapida", icon: Sparkles, label: "Proposta Rápida" },
      { href: "/proposta-automatica", icon: Sparkle, label: "Proposta Automática" },
      { href: "/propostas", icon: FileText, label: "Propostas Comerciais" },
      { href: "/templates-proposta", icon: Receipt, label: "Templates de Proposta" },
      { href: "/propostas-admin", icon: Workflow, label: "Adm. Propostas" },
      { href: "/agente-proposta", icon: Zap, label: "Agente de Propostas" },
    ],
  },
  {
    label: "Habilitação & Disputa",
    items: [
      { href: "/certidoes", icon: ShieldCheck, label: "Certidões" },
      { href: "/documentos-habilitacao", icon: FolderClock, label: "Documentos" },
      { href: "/diligencias", icon: ShieldAlert, label: "Diligências" },
      { href: "/portais-licitacao", icon: KeyRound, label: "Portais de Licitação" },
    ],
  },
  {
    label: "Pós-venda & Financeiro",
    items: [
      { href: "/pos-venda", icon: PackageCheck, label: "Pós-venda" },
      { href: "/contratos-pos-licitacao", icon: FileText, label: "Contratos Pós-Licitação" },
      { href: "/financeiro", icon: DollarSign, label: "Controle Financeiro" },
    ],
  },
  {
    label: "Catálogo",
    items: [
      { href: "/categorias", icon: FolderOpen, label: "Categorias" },
      { href: "/produtos", icon: Package, label: "Produtos" },
      { href: "/equivalencias", icon: GitMerge, label: "Equivalências" },
      { href: "/imagens", icon: Image, label: "Imagens" },
      { href: "/qualidade", icon: CheckCircle2, label: "Qualidade de Dados" },
      { href: "/enriquecimento", icon: Sparkles, label: "Enriquecimento IA" },
      { href: "/reclassificacao", icon: GitMerge, label: "Reclassificação IA" },
      { href: "/sinonimos", icon: BookMarked, label: "Sinônimos" },
    ],
  },
  {
    label: "Fornecedores & Captura",
    items: [
      { href: "/fornecedores", icon: Building2, label: "Fornecedores" },
      { href: "/configurador-fornecedores", icon: KeyRound, label: "Credenciais de Fornecedores" },
      { href: "/scraper-fornecedores", icon: Globe, label: "Agente de Preços" },
      { href: "/captura-inteligente", icon: Globe, label: "Captura Inteligente" },
      { href: "/captura-scheduler", icon: CalendarClock, label: "Agendador de Captura" },
      { href: "/captura-analytics", icon: BarChart3, label: "Analytics de Captura" },
      { href: "/enriquecimento-nfe", icon: FileScan, label: "Pipeline NF-e" },
      { href: "/historico-enriquecimento", icon: FolderClock, label: "Histórico de Enriquecimento" },
    ],
  },
  {
    label: "IA & Sistema",
    items: [
      { href: "/agente", icon: Bot, label: "Assistente IA" },
      { href: "/central-ia", icon: Brain, label: "Central de IA" },
      { href: "/importar", icon: FileSpreadsheet, label: "Importar Planilha" },
      { href: "/importar-nfe", icon: Receipt, label: "Importar NF-e" },
      { href: "/configuracao", icon: Settings, label: "Configurações" },
    ],
  },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, isAuthenticated, loading, logout } = useAuth();

  // Mostra um loading mínimo apenas enquanto verifica a sessão
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-10 h-1 bg-blue-800 mx-auto mb-4 animate-pulse" />
          <p className="text-xs font-semibold tracking-widest uppercase text-gray-400">
            Carregando...
          </p>
        </div>
      </div>
    );
  }

  // Sistema acessível sem login — apenas exibe botão de login na sidebar
  return (
    <div className="min-h-screen flex bg-white">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="px-4 py-4 border-b border-gray-200 bg-gradient-to-br from-[#0f2557] to-[#1A3F8F]">
          <div className="flex flex-col items-center gap-2">
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310419663032500506/YFd8WWT3YwWshCdAgCSgfQ/logo_s2_transparent_ce807d16.png"
              alt="S2 Corporativo"
              className="h-16 w-auto object-contain drop-shadow-sm"
            />
            <div className="text-center">
              <div className="text-[9px] font-bold tracking-widest text-blue-200 uppercase leading-none">
                Orçamentos & Fornecedores
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.label} className="mb-1">
              <div className="px-3 pt-3 pb-1">
                <span className="text-[9px] font-bold tracking-widest uppercase text-gray-400">{group.label}</span>
              </div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === "/"
                    ? location === "/"
                    : location.startsWith(item.href);
                return (
                  <Link key={item.href} href={item.href} className={`nav-item ${isActive ? "active" : ""}`}>
                    <Icon size={14} strokeWidth={isActive ? 2.5 : 2} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User area */}
        <div className="border-t border-gray-200 p-3">
          {isAuthenticated ? (
            <>
              <div className="flex items-center gap-2 px-1 mb-2">
                <div className="w-6 h-6 bg-gray-900 flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-[10px] font-bold">
                    {user?.name?.[0]?.toUpperCase() ?? "U"}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-gray-900 truncate">
                    {user?.name ?? "Usuário"}
                  </div>
                  <div className="text-[10px] text-gray-400 truncate">
                    {user?.email ?? ""}
                  </div>
                </div>
              </div>
              <button
                onClick={() => logout()}
                className="nav-item w-full text-left"
              >
                <LogOut size={13} />
                <span>Sair</span>
              </button>
            </>
          ) : (
            <a
              href={getLoginUrl()}
              className="nav-item w-full text-left text-gray-500 hover:text-gray-900"
            >
              <LogIn size={13} />
              <span>Entrar</span>
            </a>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-auto">{children}</main>
    </div>
  );
}
