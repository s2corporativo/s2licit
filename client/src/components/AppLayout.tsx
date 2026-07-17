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
  Gavel,
  GitMerge,
  Image,
  KanbanSquare,
  KeyRound,
  LayoutGrid,
  Lock,
  LogOut,
  MailCheck,
  Menu,
  Package,
  PackageCheck,
  PlugZap,
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

/**
 * Shell no padrão visual Verdelimp ERP (sidebar compacta, seções em
 * maiúsculas, item ativo com borda laranja), na paleta AZUL do S2 — com
 * ícones de linha finos (traço 1.5) e fios/hairlines delicados.
 */
const AZUL_SIDEBAR = "#2e3c55"; // equivalente azul do verde #334532 da Verdelimp
const LARANJA_ATIVO = "#e05008"; // mesmo acento de item ativo da Verdelimp
const TRACO = 1.5; // espessura fina dos ícones

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
 * oportunidade → catálogo/preço → fornecedores e captura → proposta e
 * disputa → execução e resultado. Administração fica isolada no rodapé.
 */
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
      { href: "/radar-pncp", icon: Radar, label: "Radar PNCP", minRole: "editor" },
      { href: "/cotacoes-recebidas", icon: MailCheck, label: "Cotações recebidas", minRole: "editor" },
      { href: "/edital", icon: FileScan, label: "Importar edital", minRole: "editor" },
    ],
  },
  {
    label: "CATÁLOGO E PREÇOS",
    items: [
      { href: "/produtos", icon: Package, label: "Produtos" },
      { href: "/equivalencias", icon: GitMerge, label: "Equivalências" },
      { href: "/analise-precos", icon: BarChart3, label: "Análise de preços", minRole: "editor" },
      { href: "/enriquecimento", icon: Sparkles, label: "Enriquecimento" },
      { href: "/imagens", icon: Image, label: "Imagens de produtos" },
    ],
  },
  {
    label: "FORNECEDORES E CAPTURA",
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
    label: "PROPOSTAS E DISPUTA",
    items: [
      { href: "/propostas", icon: FileText, label: "Propostas" },
      { href: "/documentos-habilitacao", icon: ShieldCheck, label: "Habilitação", minRole: "editor" },
      { href: "/certidoes", icon: ScrollText, label: "Certidões", minRole: "editor" },
      { href: "/sala-disputa", icon: Gavel, label: "Sala de disputa", minRole: "editor" },
      { href: "/agente-proposta", icon: Tag, label: "Agente de proposta", minRole: "editor" },
    ],
  },
  {
    label: "EXECUÇÃO E RESULTADOS",
    items: [
      { href: "/pos-venda", icon: PackageCheck, label: "Pós-venda" },
      { href: "/financeiro", icon: DollarSign, label: "Financeiro" },
      { href: "/desempenho", icon: Trophy, label: "Desempenho" },
    ],
  },
  {
    label: "SISTEMA",
    items: [
      { href: "/central-ia", icon: Brain, label: "Inteligência artificial", minRole: "admin" },
      { href: "/portais-licitacao", icon: PlugZap, label: "Portais de licitação", minRole: "editor" },
      { href: "/diagnostico", icon: Activity, label: "Diagnóstico", minRole: "editor" },
      { href: "/configuracao", icon: Settings, label: "Dados da empresa", minRole: "admin" },
      { href: "/usuarios", icon: Users, label: "Usuários e permissões", minRole: "admin" },
      { href: "/logs", icon: ClipboardList, label: "Logs de auditoria", minRole: "admin" },
      { href: "/seguranca", icon: Lock, label: "Segurança (MFA)" },
      { href: "/manual", icon: BookOpen, label: "Manual do sistema" },
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
  const [semLogo, setSemLogo] = useState(false);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center h-screen"
        style={{ color: "#1A3F8F", fontSize: 18, background: "#f3f4f6" }}
      >
        Carregando...
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
    <aside
      className="saas-sidebar flex flex-col h-full flex-shrink-0 relative"
      style={{ width: 220, background: AZUL_SIDEBAR, color: "#fff" }}
    >
      {/* Marca — logo em chip branco, como na Verdelimp */}
      <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid rgba(255,255,255,.12)" }}>
        {!semLogo && (
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310419663032500506/YFd8WWT3YwWshCdAgCSgfQ/logo_s2_transparent_ce807d16.png"
            alt="S2 Licit"
            onError={() => setSemLogo(true)}
            style={{
              maxWidth: 180,
              maxHeight: 48,
              objectFit: "contain",
              display: "block",
              margin: "0 auto 6px",
              background: "#fff",
              borderRadius: 6,
              padding: 4,
            }}
          />
        )}
        <p style={{ margin: 0, fontWeight: 900, fontSize: 13, textAlign: "center", letterSpacing: ".5px" }}>
          S2 LICIT
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 9, color: "rgba(255,255,255,.4)", textAlign: "center" }}>
          Licitações &amp; Fornecedores
        </p>
        <button
          className="lg:hidden absolute top-3 right-3 text-white/60 hover:text-white"
          onClick={() => setSidebarOpen(false)}
          aria-label="Fechar menu"
        >
          <X size={16} strokeWidth={TRACO} />
        </button>
      </div>

      <nav style={{ flex: 1, padding: "5px 4px", overflowY: "auto" }} aria-label="Navegação principal">
        {visibleNavGroups.map((group, gi) => (
          <div key={group.label}>
            <p
              style={{
                margin: "8px 8px 3px",
                paddingTop: gi > 0 ? 7 : 0,
                fontSize: 9,
                color: "rgba(255,255,255,.3)",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: ".5px",
                // fio fino separando as seções
                borderTop: gi > 0 ? "1px solid rgba(255,255,255,.07)" : "none",
              }}
            >
              {group.label}
            </p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active =
                item.href === "/" ? location === "/" : location.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 8px",
                    background: active ? "rgba(255,255,255,.18)" : "transparent",
                    color: active ? "#fff" : "rgba(255,255,255,.85)",
                    cursor: "pointer",
                    borderRadius: 7,
                    marginBottom: 1,
                    fontSize: 11,
                    fontWeight: active ? 700 : 400,
                    textAlign: "left",
                    borderLeft: active ? `3px solid ${LARANJA_ATIVO}` : "3px solid transparent",
                    textDecoration: "none",
                  }}
                >
                  <Icon
                    size={14}
                    strokeWidth={active ? 2 : TRACO}
                    style={{ flexShrink: 0, opacity: active ? 1 : 0.75 }}
                  />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div style={{ padding: "9px 12px", borderTop: "1px solid rgba(255,255,255,.1)" }}>
        {isAuthenticated ? (
          <>
            <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,.7)", fontWeight: 600 }}>
              {user?.name ?? "Usuário"}
            </p>
            <p style={{ margin: "2px 0 5px", fontSize: 10, color: "rgba(255,255,255,.4)" }}>
              {getRoleLabel(user?.role)}
            </p>
            <button
              onClick={() => logout()}
              className="flex items-center justify-center gap-1.5"
              style={{
                width: "100%",
                background: "rgba(255,255,255,.1)",
                border: "1px solid rgba(255,255,255,.12)",
                color: "#fff",
                padding: 6,
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 11,
              }}
            >
              <LogOut size={12} strokeWidth={TRACO} />
              Sair
            </button>
          </>
        ) : (
          <a
            href={getLoginUrl()}
            style={{
              display: "block",
              width: "100%",
              background: "rgba(255,255,255,.1)",
              border: "1px solid rgba(255,255,255,.12)",
              color: "#fff",
              padding: 6,
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 11,
              textAlign: "center",
              textDecoration: "none",
            }}
          >
            Entrar
          </a>
        )}
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#f3f4f6" }}>
      {/* Sidebar fixa em desktop */}
      <div className="hidden lg:block h-full">{sidebar}</div>

      {/* Sidebar móvel (overlay) */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute inset-y-0 left-0">{sidebar}</div>
        </div>
      )}

      <div className="flex flex-col flex-1 min-w-0 h-full">
        {/* Topbar fina branca com fio delicado, como na Verdelimp */}
        {isAuthenticated && (
          <div
            className="flex items-center gap-3"
            style={{
              background: "#fff",
              borderBottom: "1px solid #e5e7eb",
              padding: "8px 20px",
              flexShrink: 0,
            }}
          >
            <button
              className="lg:hidden text-gray-400 hover:text-gray-700"
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu size={18} strokeWidth={TRACO} />
            </button>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }} className="truncate">
              {currentPageLabel(location)}
            </span>
            <div className="ml-auto flex items-center gap-3">
              <Link
                href="/busca-global"
                className="flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition"
                style={{
                  fontSize: 11,
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: "4px 10px",
                }}
              >
                <Search size={12} strokeWidth={TRACO} />
                <span className="hidden sm:inline">Buscar no sistema...</span>
              </Link>
              <span
                className="hidden sm:flex items-center gap-1.5"
                style={{ fontSize: 11, color: "#9ca3af" }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: "#2563eb",
                    display: "inline-block",
                  }}
                />
                S2 Licit ERP
              </span>
            </div>
          </div>
        )}

        <main style={{ flex: 1, overflowY: "auto", padding: 22, background: "#f3f4f6" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
