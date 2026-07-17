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
  DollarSign,
  FileScan,
  FileSpreadsheet,
  FileText,
  GitMerge,
  Gavel,
  Image,
  KanbanSquare,
  KeyRound,
  LayoutGrid,
  LogIn,
  LogOut,
  MailCheck,
  Menu,
  Package,
  PackageCheck,
  Radar,
  Receipt,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Tag,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";

type NavItem = {
  href: string;
  icon: React.ElementType;
  label: string;
  minRole?: Role;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

/**
 * O menu segue o fluxo real de trabalho da licitação, do início ao fim:
 * 1) a oportunidade chega → 2) o catálogo dá o preço → 3) os fornecedores
 * alimentam o catálogo (captura automática) → 4) a proposta é montada e
 * disputada → 5) execução e resultado. Administração fica isolada no rodapé.
 */
const navGroups: NavGroup[] = [
  {
    label: "Visão geral",
    items: [
      { href: "/", icon: LayoutGrid, label: "Dashboard" },
      { href: "/agenda", icon: CalendarClock, label: "Agenda" },
      { href: "/funil", icon: KanbanSquare, label: "Funil de oportunidades" },
    ],
  },
  {
    label: "1 · Oportunidades",
    items: [
      { href: "/radar-pncp", icon: Radar, label: "Radar PNCP", minRole: "editor" },
      { href: "/cotacoes-recebidas", icon: MailCheck, label: "Cotações recebidas", minRole: "editor" },
      { href: "/edital", icon: FileScan, label: "Importar edital", minRole: "editor" },
    ],
  },
  {
    label: "2 · Catálogo e preços",
    items: [
      { href: "/produtos", icon: Package, label: "Produtos" },
      { href: "/equivalencias", icon: GitMerge, label: "Equivalências" },
      { href: "/analise-precos", icon: BarChart3, label: "Análise de preços", minRole: "editor" },
      { href: "/enriquecimento", icon: Sparkles, label: "Enriquecimento" },
      { href: "/imagens", icon: Image, label: "Imagens de produtos" },
    ],
  },
  {
    label: "3 · Fornecedores e captura",
    items: [
      { href: "/fornecedores", icon: Building2, label: "Fornecedores", minRole: "editor" },
      { href: "/scraper-fornecedores", icon: Bot, label: "Captura automática", minRole: "admin" },
      { href: "/captura-inteligente", icon: Brain, label: "Captura multi-origem", minRole: "editor" },
      { href: "/captura-revisao", icon: ClipboardCheck, label: "Revisão de capturas", minRole: "editor" },
      { href: "/importar", icon: FileSpreadsheet, label: "Importar planilha", minRole: "editor" },
      { href: "/importar-nfe", icon: Receipt, label: "Importar NF-e", minRole: "editor" },
      { href: "/configurador-fornecedores", icon: KeyRound, label: "Acessos e credenciais", minRole: "admin" },
    ],
  },
  {
    label: "4 · Propostas e disputa",
    items: [
      { href: "/propostas", icon: FileText, label: "Propostas" },
      { href: "/documentos-habilitacao", icon: ShieldCheck, label: "Habilitação", minRole: "editor" },
      { href: "/certidoes", icon: ScrollText, label: "Certidões", minRole: "editor" },
      { href: "/sala-disputa", icon: Gavel, label: "Sala de disputa", minRole: "editor" },
      { href: "/agente-proposta", icon: Tag, label: "Agente de proposta", minRole: "editor" },
    ],
  },
  {
    label: "5 · Execução e resultados",
    items: [
      { href: "/pos-venda", icon: PackageCheck, label: "Pós-venda" },
      { href: "/financeiro", icon: DollarSign, label: "Financeiro" },
      { href: "/desempenho", icon: Trophy, label: "Desempenho" },
    ],
  },
  {
    label: "Administração",
    items: [
      { href: "/central-ia", icon: Brain, label: "Inteligência artificial", minRole: "admin" },
      { href: "/portais-licitacao", icon: KeyRound, label: "Portais de licitação", minRole: "editor" },
      { href: "/diagnostico", icon: Activity, label: "Diagnóstico", minRole: "editor" },
      { href: "/configuracao", icon: Settings, label: "Dados da empresa", minRole: "admin" },
      { href: "/usuarios", icon: Users, label: "Usuários e permissões", minRole: "admin" },
      { href: "/logs", icon: ScrollText, label: "Logs de auditoria", minRole: "admin" },
      { href: "/seguranca", icon: ShieldCheck, label: "Segurança (MFA)" },
    ],
  },
];

/** Título da página atual (para a topbar), derivado do item de menu ativo. */
function currentPageLabel(location: string): string {
  for (const group of navGroups) {
    for (const item of group.items) {
      if (item.href === "/" ? location === "/" : location.startsWith(item.href)) {
        return item.label;
      }
    }
  }
  return "";
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, isAuthenticated, loading, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="its-bar mx-auto animate-pulse" />
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
            Carregando...
          </p>
        </div>
      </div>
    );
  }

  const visibleNavGroups = isAuthenticated
    ? navGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => hasMinimumRole(user?.role, item.minRole)),
        }))
        .filter((group) => group.items.length > 0)
    : [];

  const sidebar = (
    <aside className="saas-sidebar w-64 flex-shrink-0 flex flex-col h-full overflow-hidden bg-[oklch(0.17_0.03_275)] text-slate-300">
      {/* Marca */}
      <div className="px-5 py-5 flex items-center gap-3 border-b border-white/10">
        <img
          src="https://d2xsxph8kpxj0f.cloudfront.net/310419663032500506/YFd8WWT3YwWshCdAgCSgfQ/logo_s2_transparent_ce807d16.png"
          alt=""
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          className="h-10 w-auto object-contain drop-shadow"
        />
        <div className="min-w-0">
          <div className="text-sm font-black text-white tracking-tight leading-none">S2 Licit</div>
          <div className="text-[9px] font-bold tracking-widest text-indigo-300 uppercase mt-1">
            Licitações · Fornecedores
          </div>
        </div>
        <button
          className="ml-auto lg:hidden text-slate-400 hover:text-white"
          onClick={() => setSidebarOpen(false)}
          aria-label="Fechar menu"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 py-3 overflow-y-auto" aria-label="Navegação principal">
        {visibleNavGroups.map((group) => (
          <div key={group.label} className="mb-1">
            <div className="px-5 pt-3 pb-1">
              <span className="text-[9px] font-bold tracking-widest uppercase text-slate-500">
                {group.label}
              </span>
            </div>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/" ? location === "/" : location.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`nav-item ${isActive ? "active" : ""}`}
                >
                  <Icon size={14} strokeWidth={isActive ? 2.5 : 2} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        {isAuthenticated ? (
          <>
            <Link
              href="/manual"
              className={`nav-item mb-2 ${location === "/manual" ? "active" : ""}`}
            >
              <BookOpen size={13} />
              <span>Como operar</span>
            </Link>
            <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl bg-white/5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">
                  {user?.name?.[0]?.toUpperCase() ?? "U"}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-white truncate">
                  {user?.name ?? "Usuário"}
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  {getRoleLabel(user?.role)}
                </div>
              </div>
              <button
                onClick={() => logout()}
                title="Sair"
                className="text-slate-400 hover:text-white transition"
              >
                <LogOut size={14} />
              </button>
            </div>
          </>
        ) : (
          <a href={getLoginUrl()} className="nav-item w-full text-left">
            <LogIn size={13} />
            <span>Entrar</span>
          </a>
        )}
      </div>
    </aside>
  );

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      {/* Sidebar fixa em desktop */}
      <div className="hidden lg:block h-full">{sidebar}</div>

      {/* Sidebar móvel (overlay) */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute inset-y-0 left-0">{sidebar}</div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col h-full">
        {/* Topbar */}
        {isAuthenticated && (
          <header className="flex-shrink-0 h-14 bg-card/80 backdrop-blur border-b border-border flex items-center gap-3 px-4 lg:px-6">
            <button
              className="lg:hidden text-muted-foreground hover:text-foreground"
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu size={20} />
            </button>
            <div className="font-bold text-sm text-foreground truncate">
              {currentPageLabel(location)}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Link
                href="/busca-global"
                className="flex items-center gap-2 rounded-xl border border-border bg-secondary/60 px-3 py-1.5 text-xs text-muted-foreground hover:border-ring hover:text-foreground transition"
              >
                <Search size={13} />
                <span className="hidden sm:inline">Buscar no sistema...</span>
              </Link>
            </div>
          </header>
        )}

        <main className="flex-1 min-w-0 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
