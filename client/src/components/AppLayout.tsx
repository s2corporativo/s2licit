import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { getRoleLabel, hasMinimumRole, type Role } from "@/lib/access";
import {
  Activity, BookOpen, Bot, Building2, CalendarClock, ChevronDown, CircleDollarSign,
  FileScan, FileText, Gavel, LayoutDashboard, LogOut, Menu, Package, PackageCheck,
  Radar, Search, Settings, ShieldCheck, Sparkles, Users, X
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
      { href: "/captura-inteligente", icon: FileScan, label: "Captura inteligente", minRole: "editor" },
      { href: "/captura-revisao", icon: ShieldCheck, label: "Revisão de captura", minRole: "editor" },
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

function currentPageLabel(location: string): string {
  for (const group of navGroups) {
    const item = group.items.find((entry) => isPathActive(location, entry.href));
    if (item) return item.label;
  }
  return "S2 Licit";
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
      <div className="flex h-screen items-center justify-center bg-slate-50 text-sm font-semibold text-slate-600">
        Carregando S2 Licit...
      </div>
    );
  }

  const sidebar = (
    <aside className="flex h-full w-[248px] shrink-0 flex-col border-r border-slate-200 bg-white text-slate-900">
      <div className="relative border-b border-slate-200 px-5 py-5">
        <Link href="/" className="block rounded-xl bg-blue-950 p-2.5 no-underline" aria-label="Ir para o início do S2 Licit">
          <img src="/s2-corporativo-logo.png" alt="S2 Corporativo — Soluções, Estratégia, Resultados" className="mx-auto h-[82px] w-full object-contain" />
        </Link>
        <button className="absolute right-3 top-3 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu">
          <X size={17} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Navegação principal">
        {visibleGroups.map((group) => {
          const activeGroup = group.items.some((item) => isPathActive(location, item.href));
          const isCollapsed = collapsed[group.label] && !activeGroup;
          return (
            <section key={group.label} className="mb-2">
              <button type="button" className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 hover:bg-slate-50" onClick={() => setCollapsed((state) => ({ ...state, [group.label]: !state[group.label] }))} aria-expanded={!isCollapsed}>
                {group.label}
                <ChevronDown size={13} className={`transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
              </button>
              {!isCollapsed && (
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isPathActive(location, item.href);
                    return (
                      <Link key={item.href} href={item.href} onClick={() => setSidebarOpen(false)} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] no-underline transition-colors ${active ? "bg-blue-50 font-bold text-blue-950" : "font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}>
                        <Icon size={16} strokeWidth={active ? 2.2 : 1.7} className="shrink-0" />
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

      <div className="border-t border-slate-200 p-3">
        {isAuthenticated ? (
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="m-0 truncate text-xs font-bold text-slate-800">{user?.name ?? "Usuário"}</p>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-[10px] text-slate-500">{getRoleLabel(user?.role)}</span>
              <button onClick={() => logout()} className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold text-slate-500 hover:bg-white hover:text-red-700">
                <LogOut size={12} /> Sair
              </button>
            </div>
          </div>
        ) : (
          <a href={getLoginUrl()} className="block rounded-lg bg-blue-950 px-3 py-2 text-center text-xs font-bold text-white no-underline">Entrar</a>
        )}
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <div className="hidden h-full lg:block">{sidebar}</div>
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 h-full w-full bg-slate-950/45" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu" />
          <div className="absolute inset-y-0 left-0">{sidebar}</div>
        </div>
      )}

      <div className="flex h-full min-w-0 flex-1 flex-col">
        {isAuthenticated && (
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
            <button className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu"><Menu size={19} /></button>
            <div className="min-w-0"><p className="m-0 truncate text-sm font-extrabold text-slate-900">{currentPageLabel(location)}</p></div>
            <Link href="/busca-global" className="ml-auto flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500 no-underline hover:border-slate-300 hover:bg-white">
              <Search size={14} /><span className="hidden sm:inline">Buscar no sistema</span>
            </Link>
          </header>
        )}
        <main className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
