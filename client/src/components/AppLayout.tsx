import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { getRoleLabel, hasMinimumRole, type Role } from "@/lib/access";
import {
  Activity,
  BookOpen,
  Bot,
  Building2,
  CalendarClock,
  ChevronDown,
  CircleDollarSign,
  Command,
  FileScan,
  FileText,
  Gavel,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PackageCheck,
  Radar,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";

type NavItem = { href: string; icon: React.ElementType; label: string; minRole?: Role };
type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: "Início",
    items: [
      { href: "/", icon: LayoutDashboard, label: "Visão geral" },
      { href: "/agenda", icon: CalendarClock, label: "Agenda e pendências" },
      { href: "/funil", icon: Activity, label: "Funil de trabalho" },
    ],
  },
  {
    label: "Oportunidades",
    items: [
      { href: "/radar-pncp", icon: Radar, label: "Radar de licitações", minRole: "editor" },
      { href: "/cotacoes-recebidas", icon: FileText, label: "Cotações recebidas", minRole: "editor" },
      { href: "/edital", icon: FileScan, label: "Analisar oportunidade", minRole: "editor" },
    ],
  },
  {
    label: "Propostas",
    items: [
      { href: "/propostas", icon: FileText, label: "Central de propostas" },
      { href: "/sala-disputa", icon: Gavel, label: "Sala de disputa", minRole: "editor" },
      { href: "/documentos-habilitacao", icon: ShieldCheck, label: "Habilitação", minRole: "editor" },
    ],
  },
  {
    label: "Execução",
    items: [
      { href: "/centro-operacional", icon: PackageCheck, label: "Operação e entregas", minRole: "editor" },
      { href: "/financeiro", icon: CircleDollarSign, label: "Financeiro" },
      { href: "/pos-venda", icon: PackageCheck, label: "Pós-venda" },
    ],
  },
  {
    label: "Catálogo",
    items: [
      { href: "/produtos", icon: Package, label: "Produtos e preços" },
      { href: "/fornecedores", icon: Building2, label: "Fornecedores", minRole: "editor" },
      { href: "/busca-global", icon: Search, label: "Busca e equivalências" },
      { href: "/enriquecimento", icon: Sparkles, label: "Qualidade do catálogo" },
    ],
  },
  {
    label: "Administração",
    items: [
      { href: "/configuracao", icon: Settings, label: "Configurações", minRole: "admin" },
      { href: "/integracoes", icon: Bot, label: "Integrações e IA", minRole: "admin" },
      { href: "/usuarios", icon: Users, label: "Usuários e permissões", minRole: "admin" },
      { href: "/diagnostico", icon: Activity, label: "Diagnóstico", minRole: "editor" },
      { href: "/manual", icon: BookOpen, label: "Ajuda e manual" },
    ],
  },
];

function cleanPath(value: string): string {
  return value.split("?")[0].replace(/\/$/, "") || "/";
}

function isPathActive(location: string, href: string): boolean {
  const current = cleanPath(location);
  const target = cleanPath(href);
  return target === "/" ? current === "/" : current === target || current.startsWith(`${target}/`);
}

function currentPageMeta(location: string): { label: string; group: string } {
  for (const group of navGroups) {
    const item = group.items.find((entry) => isPathActive(location, entry.href));
    if (item) return { label: item.label, group: group.label };
  }
  return { label: "S2 Licit", group: "Operação" };
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, isAuthenticated, loading, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ Administração: true });

  const visibleGroups = useMemo(
    () =>
      isAuthenticated
        ? navGroups
            .map((group) => ({
              ...group,
              items: group.items.filter((item) => hasMinimumRole(user?.role, item.minRole)),
            }))
            .filter((group) => group.items.length > 0)
        : [],
    [isAuthenticated, user?.role],
  );

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-sm font-semibold text-slate-300">
        <div className="flex items-center gap-3">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-400" />
          Carregando S2 Licit...
        </div>
      </div>
    );
  }

  const pageMeta = currentPageMeta(location);

  const sidebar = (
    <aside className="saas-sidebar flex h-full w-[272px] shrink-0 flex-col border-r border-white/10 bg-slate-950 text-slate-100 shadow-2xl shadow-slate-950/20">
      <div className="relative px-4 pb-4 pt-5">
        <Link
          href="/"
          className="group block rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 no-underline transition hover:border-white/20 hover:bg-white/[0.07]"
          aria-label="Ir para o início do S2 Licit"
        >
          <img
            src="/s2-corporativo-logo.png"
            alt="S2 Corporativo — Soluções, Estratégia, Resultados"
            className="mx-auto h-[68px] w-full object-contain"
          />
          <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-300">S2 Licit</span>
            <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-300">Operacional</span>
          </div>
        </Link>
        <button
          className="absolute right-5 top-6 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Fechar menu"
        >
          <X size={17} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Navegação principal">
        {visibleGroups.map((group) => {
          const activeGroup = group.items.some((item) => isPathActive(location, item.href));
          const isCollapsed = collapsed[group.label] && !activeGroup;
          return (
            <section key={group.label} className="mb-2">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 transition hover:bg-white/[0.04] hover:text-slate-300"
                onClick={() => setCollapsed((state) => ({ ...state, [group.label]: !state[group.label] }))}
                aria-expanded={!isCollapsed}
              >
                {group.label}
                <ChevronDown size={13} className={`transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
              </button>
              {!isCollapsed && (
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isPathActive(location, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setSidebarOpen(false)}
                        className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] no-underline transition-all ${
                          active
                            ? "bg-blue-500/15 font-bold text-white ring-1 ring-inset ring-blue-400/20"
                            : "font-medium text-slate-400 hover:bg-white/[0.05] hover:text-white"
                        }`}
                      >
                        {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-blue-400" />}
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${active ? "bg-blue-400/15 text-blue-300" : "bg-white/[0.04] text-slate-500 group-hover:text-slate-300"}`}>
                          <Icon size={15} strokeWidth={active ? 2.25 : 1.75} />
                        </span>
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        {isAuthenticated ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-xs font-black uppercase text-blue-200 ring-1 ring-inset ring-blue-400/20">
                {(user?.name ?? "S2").trim().slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-xs font-bold text-white">{user?.name ?? "Usuário"}</p>
                <span className="mt-0.5 block text-[10px] text-slate-500">{getRoleLabel(user?.role)}</span>
              </div>
              <button
                onClick={() => logout()}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-red-500/10 hover:text-red-300"
                aria-label="Sair do sistema"
                title="Sair"
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
        ) : (
          <a href={getLoginUrl()} className="block rounded-xl bg-blue-600 px-3 py-2.5 text-center text-xs font-bold text-white no-underline hover:bg-blue-500">
            Entrar
          </a>
        )}
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      <div className="hidden h-full lg:block">{sidebar}</div>
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 h-full w-full bg-slate-950/65 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu" />
          <div className="absolute inset-y-0 left-0">{sidebar}</div>
        </div>
      )}

      <div className="flex h-full min-w-0 flex-1 flex-col">
        {isAuthenticated && (
          <header className="flex h-[68px] shrink-0 items-center gap-3 border-b border-slate-200/80 bg-white/95 px-4 shadow-sm shadow-slate-950/[0.02] backdrop-blur-xl sm:px-6">
            <button className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu">
              <Menu size={19} />
            </button>

            <div className="min-w-0">
              <div className="mb-0.5 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                <span>S2 Licit</span>
                <span className="text-slate-300">/</span>
                <span>{pageMeta.group}</span>
              </div>
              <p className="m-0 truncate text-[15px] font-extrabold tracking-tight text-slate-950">{pageMeta.label}</p>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Link
                href="/agente"
                className="hidden items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-800 no-underline transition hover:border-violet-300 hover:bg-violet-100 md:flex"
              >
                <Sparkles size={14} /> Assistente IA
              </Link>
              <Link
                href="/busca-global"
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 no-underline transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-900"
              >
                <Search size={14} />
                <span className="hidden sm:inline">Buscar</span>
                <span className="hidden rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[9px] text-slate-400 xl:inline">
                  <Command size={9} className="inline" /> K
                </span>
              </Link>
            </div>
          </header>
        )}
        <main className="s2-main flex-1 overflow-y-auto p-4 sm:p-6 lg:p-7">{children}</main>
      </div>
    </div>
  );
}
