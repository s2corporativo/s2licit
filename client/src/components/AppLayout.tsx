import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { getRoleLabel, hasMinimumRole, type Role } from "@/lib/access";
import {
  Activity,
  BarChart3,
  BookOpen,
  Bot,
  Brain,
  Building2,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  DollarSign,
  FileScan,
  FileSpreadsheet,
  FileText,
  Gauge,
  Gavel,
  GitCompareArrows,
  GitMerge,
  Image,
  KanbanSquare,
  Landmark,
  LayoutGrid,
  LayoutTemplate,
  Lock,
  LogOut,
  MailCheck,
  Menu,
  MessageSquareWarning,
  Package,
  PackageCheck,
  Percent,
  PlugZap,
  Radar,
  Receipt,
  Scale,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Tag,
  Trophy,
  Truck,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";

const AZUL_SIDEBAR = "#2e3c55";
const LARANJA_ATIVO = "#e05008";
const TRACO = 1.5;

type NavItem = { href: string; icon: React.ElementType; label: string; minRole?: Role };
type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: "VISÃO GERAL",
    items: [
      { href: "/", icon: LayoutGrid, label: "Dashboard" },
      { href: "/agenda", icon: CalendarClock, label: "Agenda" },
      { href: "/funil", icon: KanbanSquare, label: "Funil de oportunidades" },
    ],
  },
  {
    label: "OPORTUNIDADES",
    items: [
      { href: "/radar-pncp", icon: Radar, label: "Radar de licitações", minRole: "editor" },
      { href: "/cotacoes-recebidas", icon: MailCheck, label: "Cotações recebidas", minRole: "editor" },
      { href: "/edital", icon: FileScan, label: "Importar edital", minRole: "editor" },
      { href: "/analise-juridica", icon: Scale, label: "Análise jurídica (IA)", minRole: "editor" },
      { href: "/diligencias", icon: MessageSquareWarning, label: "Diligências e recursos", minRole: "editor" },
    ],
  },
  {
    label: "CATÁLOGO",
    items: [
      { href: "/produtos", icon: Package, label: "Produtos" },
      { href: "/busca-global", icon: Search, label: "Busca unificada" },
      { href: "/equivalencias", icon: GitMerge, label: "Produtos equivalentes" },
      { href: "/enriquecimento", icon: Sparkles, label: "Completar dados (IA)" },
      { href: "/imagens", icon: Image, label: "Imagens de produtos" },
    ],
  },
  {
    label: "PREÇOS E TRIBUTOS",
    items: [
      { href: "/analise-precos", icon: BarChart3, label: "Análise de preços", minRole: "editor" },
      { href: "/comparacao", icon: GitCompareArrows, label: "Comparação de preços" },
      { href: "/aplicar-precificacao", icon: Percent, label: "Precificação em massa", minRole: "admin" },
      { href: "/tributos", icon: Scale, label: "Motor tributário" },
      { href: "/custo-total", icon: Truck, label: "Custo total e fretes" },
    ],
  },
  {
    label: "FORNECEDORES E CAPTURA",
    items: [
      { href: "/fornecedores", icon: Building2, label: "Fornecedores", minRole: "editor" },
      { href: "/scraper-fornecedores", icon: Bot, label: "Captura automática de preços", minRole: "admin" },
      { href: "/captura-inteligente", icon: Brain, label: "Central de captura", minRole: "editor" },
      { href: "/captura-revisao", icon: ClipboardCheck, label: "Revisão de capturas", minRole: "editor" },
      { href: "/importar", icon: FileSpreadsheet, label: "Importar planilha", minRole: "editor" },
      { href: "/importar-nfe", icon: Receipt, label: "Importar NF-e", minRole: "editor" },
    ],
  },
  {
    label: "PROPOSTAS E DISPUTA",
    items: [
      { href: "/propostas", icon: FileText, label: "Propostas" },
      { href: "/templates-proposta", icon: LayoutTemplate, label: "Templates de proposta" },
      { href: "/documentos-habilitacao", icon: ShieldCheck, label: "Habilitação", minRole: "editor" },
      { href: "/certidoes", icon: ScrollText, label: "Certidões", minRole: "editor" },
      { href: "/sala-disputa", icon: Gavel, label: "Sala de disputa", minRole: "editor" },
      { href: "/agente-proposta", icon: Tag, label: "Agente de proposta", minRole: "editor" },
    ],
  },
  {
    label: "EXECUÇÃO E RESULTADOS",
    items: [
      { href: "/centro-operacional", icon: Gauge, label: "Central operacional", minRole: "editor" },
      { href: "/pos-venda", icon: PackageCheck, label: "Pós-venda" },
      { href: "/financeiro", icon: DollarSign, label: "Financeiro" },
      { href: "/desempenho", icon: Trophy, label: "Desempenho" },
    ],
  },
  {
    label: "SISTEMA",
    items: [
      { href: "/integracoes", icon: PlugZap, label: "Integrações e credenciais", minRole: "admin" },
      { href: "/central-ia", icon: Brain, label: "Inteligência artificial", minRole: "admin" },
      { href: "/portais-licitacao", icon: PlugZap, label: "Portais de licitação", minRole: "editor" },
      { href: "/diagnostico", icon: Activity, label: "Diagnóstico", minRole: "editor" },
      { href: "/configuracao", icon: Settings, label: "Dados da empresa", minRole: "admin" },
      { href: "/usuarios", icon: Users, label: "Usuários e permissões", minRole: "admin" },
      { href: "/logs", icon: ClipboardList, label: "Logs de auditoria", minRole: "admin" },
      { href: "/seguranca", icon: Lock, label: "Segurança da conta" },
      { href: "/manual", icon: BookOpen, label: "Manual e glossário" },
    ],
  },
];

function stripQuery(value: string): string {
  return value.split("?")[0];
}

function isPathActive(location: string, href: string): boolean {
  const path = stripQuery(href);
  if (path === "/") return location === "/";
  return location === path || location.startsWith(`${path}/`);
}

function currentPageLabel(location: string): string {
  for (const group of navGroups) {
    for (const item of group.items) {
      if (isPathActive(location, item.href)) return item.label;
    }
  }
  return "S2 Licit";
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, isAuthenticated, loading, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-gray-100 text-lg text-blue-900">Carregando...</div>;
  }

  const visibleNavGroups = isAuthenticated
    ? navGroups
        .map((group) => ({ ...group, items: group.items.filter((item) => hasMinimumRole(user?.role, item.minRole)) }))
        .filter((group) => group.items.length > 0)
    : [];

  const sidebar = (
    <aside className="relative flex h-full w-[220px] shrink-0 flex-col text-white" style={{ background: AZUL_SIDEBAR }}>
      <div className="border-b border-white/10 px-3 py-3">
        <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-white text-blue-900">
          <Landmark size={24} strokeWidth={1.5} />
        </div>
        <p className="m-0 text-center text-[13px] font-black tracking-wide">S2 LICIT</p>
        <p className="mt-0.5 text-center text-[10px] text-white/65">Licitações &amp; Fornecedores</p>
        <button className="absolute right-3 top-3 text-white/60 hover:text-white lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu"><X size={16} /></button>
      </div>

      <nav className="flex-1 overflow-y-auto px-1 py-1" aria-label="Navegação principal">
        {visibleNavGroups.map((group, groupIndex) => (
          <div key={group.label}>
            <p className="mx-2 mb-1 mt-2 border-t border-white/[.07] pt-2 text-[10px] font-bold uppercase tracking-wide text-white/65" style={{ borderTop: groupIndex === 0 ? "none" : undefined }}>{group.label}</p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isPathActive(location, item.href);
              return (
                <Link key={item.href} href={item.href} onClick={() => setSidebarOpen(false)} className="mb-px flex w-full items-center gap-2 rounded-lg px-2 py-[7px] text-left text-[12.5px] no-underline" style={{ background: active ? "rgba(255,255,255,.18)" : "transparent", color: active ? "#fff" : "rgba(255,255,255,.85)", fontWeight: active ? 700 : 400, borderLeft: active ? `3px solid ${LARANJA_ATIVO}` : "3px solid transparent" }}>
                  <Icon size={14} strokeWidth={active ? 2 : TRACO} className="shrink-0" style={{ opacity: active ? 1 : 0.75 }} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 px-3 py-2">
        {isAuthenticated ? (
          <>
            <p className="m-0 text-[11px] font-semibold text-white/75">{user?.name ?? "Usuário"}</p>
            <p className="mb-1 mt-0.5 text-[10px] text-white/60">{getRoleLabel(user?.role)}</p>
            <button onClick={() => logout()} className="flex w-full items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/10 p-1.5 text-[11px] text-white"><LogOut size={12} /> Sair</button>
          </>
        ) : (
          <a href={getLoginUrl()} className="block w-full rounded-md border border-white/10 bg-white/10 p-1.5 text-center text-[11px] text-white no-underline">Entrar</a>
        )}
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <div className="hidden h-full lg:block">{sidebar}</div>
      {sidebarOpen && <div className="fixed inset-0 z-50 lg:hidden"><button className="absolute inset-0 h-full w-full bg-black/50" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu" /><div className="absolute inset-y-0 left-0">{sidebar}</div></div>}

      <div className="flex h-full min-w-0 flex-1 flex-col">
        {isAuthenticated && (
          <header className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-5 py-2">
            <button className="text-gray-400 hover:text-gray-700 lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu"><Menu size={18} /></button>
            <span className="truncate text-[13px] font-bold text-gray-900">{currentPageLabel(location)}</span>
            <div className="ml-auto flex items-center gap-3">
              <Link href="/busca-global" className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] text-gray-500 no-underline hover:text-gray-800"><Search size={12} /><span className="hidden sm:inline">Buscar no sistema...</span></Link>
              <span className="hidden items-center gap-1.5 text-[11px] text-gray-400 sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-blue-600" />S2 Licit ERP</span>
            </div>
          </header>
        )}
        <main className="flex-1 overflow-y-auto bg-gray-100 p-[22px]">{children}</main>
      </div>
    </div>
  );
}
