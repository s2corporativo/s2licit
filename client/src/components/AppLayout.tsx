import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { getRoleLabel, hasMinimumRole, type Role } from "@/lib/access";
import {
  Activity,
  BookOpen,
  Bot,
  Brain,
  Building2,
  CalendarClock,
  DollarSign,
  FileScan,
  FileSpreadsheet,
  FileText,
  GitMerge,
  Gavel,
  KanbanSquare,
  KeyRound,
  LayoutGrid,
  LogIn,
  LogOut,
  MailCheck,
  Package,
  PackageCheck,
  Radar,
  ScrollText,
  Settings,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";
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
 * O menu segue o fluxo real da licitação: entrada da oportunidade, análise,
 * proposta, catálogo, automações e execução. Telas técnicas ficam concentradas
 * em Integrações, sem misturar configurações com a operação diária.
 */
const navGroups: NavGroup[] = [
  {
    label: "Operação",
    items: [
      { href: "/", icon: LayoutGrid, label: "Dashboard" },
      { href: "/agenda", icon: CalendarClock, label: "Agenda" },
      { href: "/funil", icon: KanbanSquare, label: "Funil" },
    ],
  },
  {
    label: "Oportunidades",
    items: [
      { href: "/radar-pncp", icon: Radar, label: "Radar PNCP", minRole: "editor" },
      { href: "/cotacoes-recebidas", icon: MailCheck, label: "Cotações", minRole: "editor" },
      { href: "/edital", icon: FileScan, label: "Importar edital", minRole: "editor" },
    ],
  },
  {
    label: "Propostas",
    items: [
      { href: "/propostas", icon: FileText, label: "Propostas" },
      {
        href: "/documentos-habilitacao",
        icon: ShieldCheck,
        label: "Habilitação",
        minRole: "editor",
      },
      { href: "/sala-disputa", icon: Gavel, label: "Sala de disputa", minRole: "editor" },
    ],
  },
  {
    label: "Catálogo",
    items: [
      { href: "/produtos", icon: Package, label: "Produtos" },
      { href: "/fornecedores", icon: Building2, label: "Fornecedores", minRole: "editor" },
      { href: "/equivalencias", icon: GitMerge, label: "Equivalências" },
      { href: "/importar", icon: FileSpreadsheet, label: "Importar planilha", minRole: "editor" },
    ],
  },
  {
    label: "Automação e integrações",
    items: [
      {
        href: "/captura-inteligente",
        icon: Bot,
        label: "Captura automática",
        minRole: "editor",
      },
      {
        href: "/portais-licitacao",
        icon: KeyRound,
        label: "Acessos aos portais",
        minRole: "editor",
      },
      {
        href: "/configurador-fornecedores",
        icon: Building2,
        label: "Acessos fornecedores",
        minRole: "admin",
      },
      { href: "/central-ia", icon: Brain, label: "Inteligência artificial", minRole: "admin" },
      { href: "/diagnostico", icon: Activity, label: "Diagnóstico", minRole: "editor" },
    ],
  },
  {
    label: "Execução e resultados",
    items: [
      { href: "/pos-venda", icon: PackageCheck, label: "Pós-venda" },
      { href: "/financeiro", icon: DollarSign, label: "Financeiro" },
      { href: "/desempenho", icon: Trophy, label: "Desempenho" },
    ],
  },
  {
    label: "Administração",
    items: [
      { href: "/configuracao", icon: Settings, label: "Dados da empresa", minRole: "admin" },
      { href: "/usuarios", icon: Users, label: "Usuários e permissões", minRole: "admin" },
      { href: "/logs", icon: ScrollText, label: "Logs de auditoria", minRole: "admin" },
      { href: "/seguranca", icon: ShieldCheck, label: "Segurança (MFA)" },
    ],
  },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, isAuthenticated, loading, logout } = useAuth();

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

  const visibleNavGroups = isAuthenticated
    ? navGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => hasMinimumRole(user?.role, item.minRole)),
        }))
        .filter((group) => group.items.length > 0)
    : [];

  return (
    <div className="min-h-screen flex bg-white">
      <aside className="w-60 flex-shrink-0 border-r border-gray-200 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-200 bg-gradient-to-br from-[#0f2557] to-[#1A3F8F]">
          <div className="flex flex-col items-center gap-2">
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310419663032500506/YFd8WWT3YwWshCdAgCSgfQ/logo_s2_transparent_ce807d16.png"
              alt="S2 Corporativo"
              className="h-16 w-auto object-contain drop-shadow-sm"
            />
            <div className="text-center">
              <div className="text-[9px] font-bold tracking-widest text-blue-200 uppercase leading-none">
                Licitações & Fornecedores
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-3 overflow-y-auto" aria-label="Navegação principal">
          {visibleNavGroups.map((group) => (
            <div key={group.label} className="mb-1">
              <div className="px-3 pt-3 pb-1">
                <span className="text-[9px] font-bold tracking-widest uppercase text-gray-400">
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
                    className={`nav-item ${isActive ? "active" : ""}`}
                  >
                    <Icon size={14} strokeWidth={isActive ? 2.5 : 2} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-gray-200 p-3">
          {isAuthenticated ? (
            <>
              <Link
                href="/manual"
                className={`nav-item mb-2 ${location === "/manual" ? "active" : ""}`}
              >
                <BookOpen size={13} />
                <span>Como operar</span>
              </Link>
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
                    {getRoleLabel(user?.role)}
                  </div>
                </div>
              </div>
              <button onClick={() => logout()} className="nav-item w-full text-left">
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

      <main className="flex-1 min-w-0 overflow-auto">{children}</main>
    </div>
  );
}
