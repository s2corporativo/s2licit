import { trpc } from "@/lib/trpc";
import { formatBRL, formatDateBR } from "@/lib/format";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  DollarSign,
  FileScan,
  FileText,
  GitMerge,
  Image as ImageIcon,
  Info,
  Layers,
  Package,
  Search,
  ShieldAlert,
  Sparkles,
  Tag,
  TrendingDown,
  TrendingUp,
  Workflow,
  Zap,
  XCircle,
  BarChart2,
  Activity,
  Sheet,
  Stethoscope,
  CheckCircle,
  AlertTriangle as AlertTriangleIcon,
  RefreshCw,
  Play,
  RotateCcw,
  Trash2,
  WrenchIcon,
  LayoutGrid,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { hasMinimumRole, type Role } from "@/lib/access";
import { Suspense, lazy, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";

// Recharts é pesado — carregado sob demanda apenas quando o gráfico renderiza
const DashboardCharts = lazy(() => import("./dashboard/DashboardCharts"));

// ─── Constantes ──────────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  { status: "draft",       label: "Rascunho",          color: "#9CA3AF", bg: "bg-gray-100",   text: "text-gray-700",   border: "border-gray-300" },
  { status: "sent",        label: "Enviada",            color: "#3B82F6", bg: "bg-blue-50",    text: "text-blue-700",   border: "border-blue-300" },
  { status: "order",       label: "Pedido",             color: "#F59E0B", bg: "bg-amber-50",   text: "text-amber-700",  border: "border-amber-300" },
  { status: "in_transit",  label: "Em Trânsito",        color: "#8B5CF6", bg: "bg-violet-50",  text: "text-violet-700", border: "border-violet-300" },
  { status: "delivered",   label: "Entregue",           color: "#10B981", bg: "bg-emerald-50", text: "text-emerald-700",border: "border-emerald-300" },
  { status: "cancelled",   label: "Cancelada",          color: "#EF4444", bg: "bg-red-50",     text: "text-red-700",    border: "border-red-300" },
];

const S2_PALETTE = [
  "#1A3F8F","#22A94F","#2563EB","#16A34A",
  "#1D4ED8","#15803D","#3B82F6","#4ADE80",
  "#0EA5E9","#059669","#7C3AED","#DC2626",
];

type Period = "today" | "7d" | "30d" | "month";

/** Versão compacta do formatador central: abrevia milhares/milhões nos cards do dashboard. */
function fmtBRL(value: number) {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}K`;
  return formatBRL(value);
}

const fmtDate = formatDateBR;

function buildPncpUrl(externalId: string | null | undefined): string | null {
  if (!externalId) return null;
  const match = externalId.match(/^(\d{14})-(\d+)-(\d+)\/(\d{4})$/);
  if (!match) return null;
  const [, cnpj, campo2, seq, ano] = match;
  return `https://pncp.gov.br/app/editais/${cnpj}/${campo2}/${ano}/${seq}`;
}

// ─── Central de Funções ────────────────────────────────────────────────────────
// Hub com TODAS as funções principais, agrupadas pelo mesmo fluxo do menu lateral
// (Operação → Oportunidades → Propostas → Catálogo → Automação → Execução → Admin).
// Rotas canônicas (sem passar por redirects) e visibilidade por papel.
type FuncItem = { href: string; label: string; desc: string; minRole?: Role };
type FuncGroup = {
  label: string;
  icon: React.ReactNode;
  head: string;   // cor do título do grupo
  hoverBg: string; // hover de cada item
  hoverText: string; // cor do rótulo no hover
  dot: string;     // cor do chevron no hover
  items: FuncItem[];
};

const FUNCTION_GROUPS: FuncGroup[] = [
  {
    label: "Operação", icon: <Zap size={11} />, head: "text-blue-700",
    hoverBg: "hover:bg-blue-50", hoverText: "group-hover:text-blue-700", dot: "group-hover:text-blue-500",
    items: [
      { href: "/agenda", label: "Agenda", desc: "Prazos e compromissos" },
      { href: "/funil", label: "Funil", desc: "Oportunidades por estágio" },
      { href: "/busca", label: "Busca de menor preço", desc: "Encontrar um produto" },
    ],
  },
  {
    label: "Oportunidades", icon: <FileScan size={11} />, head: "text-orange-700",
    hoverBg: "hover:bg-orange-50", hoverText: "group-hover:text-orange-700", dot: "group-hover:text-orange-500",
    items: [
      { href: "/radar-pncp", label: "Radar de licitações", desc: "Editais públicos", minRole: "editor" },
      { href: "/cotacoes-recebidas", label: "Cotações recebidas", desc: "Pedidos por e-mail", minRole: "editor" },
      { href: "/edital", label: "Importar edital", desc: "PDF/DOCX com IA", minRole: "editor" },
    ],
  },
  {
    label: "Propostas", icon: <FileText size={11} />, head: "text-indigo-700",
    hoverBg: "hover:bg-indigo-50", hoverText: "group-hover:text-indigo-700", dot: "group-hover:text-indigo-500",
    items: [
      { href: "/propostas", label: "Propostas", desc: "Criar e gerenciar" },
      { href: "/documentos-habilitacao", label: "Habilitação", desc: "Documentos exigidos", minRole: "editor" },
      { href: "/sala-disputa", label: "Sala de disputa", desc: "Lances e sessão", minRole: "editor" },
      { href: "/templates-proposta", label: "Templates", desc: "Modelos de proposta" },
    ],
  },
  {
    label: "Catálogo", icon: <Package size={11} />, head: "text-emerald-700",
    hoverBg: "hover:bg-emerald-50", hoverText: "group-hover:text-emerald-700", dot: "group-hover:text-emerald-500",
    items: [
      { href: "/produtos", label: "Produtos", desc: "Catálogo completo" },
      { href: "/fornecedores", label: "Fornecedores", desc: "Cadastro de fornecedores", minRole: "editor" },
      { href: "/equivalencias", label: "Produtos equivalentes", desc: "Produtos similares" },
      { href: "/importar", label: "Importar planilha", desc: "Excel ou CSV", minRole: "editor" },
      { href: "/importar-nfe", label: "Importar NF-e", desc: "XML de nota fiscal", minRole: "editor" },
    ],
  },
  {
    label: "Preços e tributos", icon: <DollarSign size={11} />, head: "text-teal-700",
    hoverBg: "hover:bg-teal-50", hoverText: "group-hover:text-teal-700", dot: "group-hover:text-teal-500",
    items: [
      { href: "/analise-precos", label: "Análise de preços", desc: "Evolução e tendências", minRole: "editor" },
      { href: "/comparacao", label: "Comparação de preços", desc: "Entre fornecedores" },
      { href: "/aplicar-precificacao", label: "Precificação em massa", desc: "Margem sobre a venda", minRole: "admin" },
      { href: "/tributos", label: "Motor tributário", desc: "Impostos por UF" },
      { href: "/custo-total", label: "Custo total e fretes", desc: "Piso de venda" },
    ],
  },
  {
    label: "Automação e IA", icon: <Sparkles size={11} />, head: "text-violet-700",
    hoverBg: "hover:bg-violet-50", hoverText: "group-hover:text-violet-700", dot: "group-hover:text-violet-500",
    items: [
      { href: "/scraper-fornecedores", label: "Captura automática de preços", desc: "Login e importação de fornecedores", minRole: "admin" },
      { href: "/captura-inteligente", label: "Central de captura", desc: "Multi-origem com IA", minRole: "editor" },
      { href: "/portais-licitacao", label: "Portais de licitação", desc: "Credenciais de portais", minRole: "editor" },
      { href: "/central-ia", label: "Inteligência artificial", desc: "Modelos e chaves", minRole: "admin" },
      { href: "/agente", label: "Assistente IA", desc: "Pergunte ao sistema" },
    ],
  },
  {
    label: "Execução e resultados", icon: <DollarSign size={11} />, head: "text-rose-700",
    hoverBg: "hover:bg-rose-50", hoverText: "group-hover:text-rose-700", dot: "group-hover:text-rose-500",
    items: [
      { href: "/financeiro", label: "Financeiro", desc: "Pedidos e receitas" },
      { href: "/pos-venda", label: "Pós-venda", desc: "Entregas e contratos" },
      { href: "/desempenho", label: "Desempenho", desc: "Taxa de vitória" },
      { href: "/certidoes", label: "Certidões", desc: "Regularidade fiscal", minRole: "editor" },
    ],
  },
  {
    label: "Administração", icon: <ShieldAlert size={11} />, head: "text-slate-700",
    hoverBg: "hover:bg-slate-50", hoverText: "group-hover:text-slate-800", dot: "group-hover:text-slate-500",
    items: [
      { href: "/configuracao", label: "Dados da empresa", desc: "Cadastro e logo", minRole: "admin" },
      { href: "/usuarios", label: "Usuários e permissões", desc: "Papéis de acesso", minRole: "admin" },
      { href: "/logs", label: "Logs de auditoria", desc: "Trilha de ações", minRole: "admin" },
      { href: "/seguranca", label: "Segurança da conta", desc: "Verificação em duas etapas" },
      { href: "/diagnostico", label: "Diagnóstico", desc: "Saúde do sistema", minRole: "editor" },
    ],
  },
];

// ─── Componentes auxiliares ───────────────────────────────────────────────────

function SectionHeader({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <span className="text-gray-400">{icon}</span>
        <h2 className="text-[11px] font-black tracking-widest uppercase text-gray-500">{title}</h2>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-100 rounded-sm ${className}`} />;
}

function EmptyState({ icon, title, desc, action }: { icon?: React.ReactNode; title: string; desc?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
      {icon && <div className="text-gray-300 mb-1">{icon}</div>}
      <p className="text-sm font-semibold text-gray-500">{title}</p>
      {desc && <p className="text-xs text-gray-400 max-w-xs">{desc}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

function Tooltip2({ text, children }: { text: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-48 bg-gray-900 text-white text-[10px] px-2 py-1.5 rounded shadow-lg leading-relaxed pointer-events-none">
          {text}
        </span>
      )}
    </span>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, subtitle, icon, iconBg, href, tooltip, trend, status,
}: {
  label: string; value: string | number; subtitle?: string;
  icon: React.ReactNode; iconBg: string; href: string;
  tooltip?: string; trend?: "up" | "down" | "neutral"; status?: "ok" | "warn" | "critical";
}) {
  const statusBar = status === "critical" ? "border-l-4 border-l-red-500" : status === "warn" ? "border-l-4 border-l-amber-400" : "";
  return (
    <Link href={href} className={`bg-white border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all block group ${statusBar}`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-8 h-8 ${iconBg} flex items-center justify-center rounded-sm flex-shrink-0`}>{icon}</div>
        {tooltip && (
          <Tooltip2 text={tooltip}>
            <Info size={12} className="text-gray-300 hover:text-gray-500 cursor-help mt-0.5" />
          </Tooltip2>
        )}
      </div>
      <div className="text-2xl font-black tracking-tight text-gray-900 group-hover:text-blue-800 transition-colors leading-none mb-1">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 leading-tight">{label}</div>
      {subtitle && <div className="text-[10px] text-gray-400 mt-1">{subtitle}</div>}
      {trend === "up" && <div className="flex items-center gap-1 mt-1"><TrendingUp size={10} className="text-emerald-500" /><span className="text-[10px] text-emerald-600">Alta</span></div>}
      {trend === "down" && <div className="flex items-center gap-1 mt-1"><TrendingDown size={10} className="text-red-500" /><span className="text-[10px] text-red-600">Baixa</span></div>}
    </Link>
  );
}

// ─── Dashboard principal ──────────────────────────────────────────────────────

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const funcaoGroups = useMemo(
    () =>
      FUNCTION_GROUPS
        .map((g) => ({ ...g, items: g.items.filter((it) => hasMinimumRole(user?.role, it.minRole)) }))
        .filter((g) => g.items.length > 0),
    [user?.role],
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [catalogCollapsed, setCatalogCollapsed] = useState(false);
  const [pipelineCollapsed, setPipelineCollapsed] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);

  // ── Queries ──
  const { data: stats, isLoading: statsLoading } = trpc.dashboard.stats.useQuery();
  const { data: extStats } = trpc.dashboard.extendedStats.useQuery();
  const { data: catalogHealth } = trpc.dashboard.catalogHealth.useQuery();
  const { data: perCategory } = trpc.dashboard.productsPerCategory.useQuery();
  const { data: expiringProposals } = trpc.dashboard.expiringProposals.useQuery({ daysAhead: 7 });
  const { data: proposalPipeline = [] } = trpc.dashboard.proposalPipeline.useQuery();
  const { data: actionQueue = [] } = trpc.dashboard.actionQueue.useQuery();
  const { data: marginData = [] } = trpc.dashboard.marginByCategory.useQuery();
  // Checklist de primeiros passos (só pesa nas queries enquanto não foi dispensado)
  const [primeirosPassosDispensado, setPrimeirosPassosDispensado] = useState(
    () => localStorage.getItem("s2.primeirosPassos.dispensado") === "1"
  );
  const { data: companyData } = trpc.company.get.useQuery(undefined, { enabled: !primeirosPassosDispensado });
  const { data: taxRulesData } = trpc.taxRules.listar.useQuery(undefined, { enabled: !primeirosPassosDispensado });
  const { data: templatesData } = trpc.proposalTemplates.list.useQuery(undefined, { enabled: !primeirosPassosDispensado });
  const [integrityOpen, setIntegrityOpen] = useState(false);
  const diagQuery = trpc.system.diagnose.useQuery(undefined, { enabled: diagOpen, staleTime: 0 });
  const sysErrorsQuery = trpc.system.getSystemErrors.useQuery(undefined, { enabled: diagOpen, staleTime: 0 });
  const integrityQuery = trpc.system.validateCatalogIntegrity.useQuery(undefined, { enabled: integrityOpen, staleTime: 30000 });
  const fixCatalogMutation = trpc.system.fixCatalogIntegrity.useMutation({
    onSuccess: (res) => { toast.success(res.message); integrityQuery.refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const resetJobLockMutation = trpc.system.resetJobLock.useMutation({
    onSuccess: (res) => { toast.success(res.message); sysErrorsQuery.refetch(); diagQuery.refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const forceResyncMutation = trpc.system.forceResync.useMutation({
    onSuccess: (res) => { toast.success(res.message); sysErrorsQuery.refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const clearJobErrorsMutation = trpc.system.clearJobErrors.useMutation({
    onSuccess: (res) => { toast.success(res.message); sysErrorsQuery.refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Dados derivados ──
  const categoryChartData = useMemo(() =>
    (perCategory ?? [])
      .filter((c) => Number(c.count) > 0)
      .sort((a, b) => Number(b.count) - Number(a.count))
      .slice(0, 10)
      .map((c, i) => ({
        name: (c.categoryName ?? "").length > 22 ? (c.categoryName ?? "").slice(0, 22) + "…" : (c.categoryName ?? ""),
        fullName: c.categoryName ?? "",
        count: Number(c.count),
        color: c.categoryColor ?? S2_PALETTE[i % S2_PALETTE.length],
        categoryId: c.categoryId,
        pct: stats?.totalProducts ? Math.round((Number(c.count) / stats.totalProducts) * 100) : 0,
      }))
  , [perCategory, stats]);

  const totalCategoryCount = categoryChartData.reduce((s, c) => s + c.count, 0);

  const pipelineByStatus = useMemo(() => {
    const map: Record<string, { count: number; totalValue: number; nearestDeadline: Date | null }> = {};
    for (const r of proposalPipeline) map[r.status] = { count: r.count, totalValue: r.totalValue, nearestDeadline: r.nearestDeadline };
    return map;
  }, [proposalPipeline]);

  const totalPipelineValue = proposalPipeline.reduce((s, r) => s + r.totalValue, 0);
  const totalPipelineCount = proposalPipeline.reduce((s, r) => s + r.count, 0);


  const catalogTotal = catalogHealth?.total ?? stats?.totalProducts ?? 0;
  // Com catálogo vazio não existe "saúde" a medir: null exibe "sem dados"
  // em vez do antigo 100% enganoso no primeiro acesso.
  const healthScore = catalogTotal > 0
    ? Math.round(100 - ((
        (catalogHealth?.withoutFichaTecnica ?? catalogHealth?.withoutActiveIngredient ?? 0) +
        (catalogHealth?.withoutCategory ?? 0) +
        (catalogHealth?.withoutManufacturer ?? 0)
      ) / (catalogTotal * 3)) * 100)
    : null;


  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(26,63,143,0.08),_transparent_36%),linear-gradient(180deg,#f8fbff_0%,#f2f5fb_45%,#eef2f8_100%)]">

      {/* ══════════════════════════════════════════════════════════════════════
          PRIMEIRA DOBRA — Header Executivo
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="border-b border-white/10 bg-gradient-to-br from-[#0b1f4f] via-[#1A3F8F] to-[#1e5fa8] px-6 py-7 shadow-[0_18px_48px_rgba(15,35,88,0.22)]">
        <div className="max-w-7xl mx-auto">
          {/* Linha 1: Logo + Título + Filtro de Período */}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/6 px-4 py-4 backdrop-blur-sm">
            <div className="flex items-center gap-5">
              <img
                src="/logo-s2.svg"
                alt="S2 Corporativo"
                className="h-16 w-auto object-contain drop-shadow-lg"
              />
              <div>
                <h1 className="text-xl font-black text-white tracking-tight leading-tight">
                  Central de Operações
                </h1>
                <p className="text-blue-200 text-xs mt-0.5 font-medium">
                  Orçamentos · Fornecedores · Propostas · Licitações
                </p>
              </div>
            </div>
          </div>

          {/* Linha 2: CTAs principais (rotas canônicas, sem redirects) */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 backdrop-blur-sm">
            <Link
              href="/propostas"
              className="flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-black text-blue-900 shadow-lg shadow-[#08193b]/20 transition-all hover:-translate-y-0.5 hover:bg-blue-50"
            >
              <Sparkles size={15} />
              Nova Proposta
            </Link>
            <Link
              href="/edital"
              className="flex items-center gap-2 rounded-xl border border-blue-300/70 bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-900/15 transition-all hover:-translate-y-0.5 hover:bg-blue-500"
            >
              <FileScan size={15} />
              Importar Edital
            </Link>
            <Link
              href="/importar"
              className="flex items-center gap-2 rounded-xl border border-emerald-300/70 bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-emerald-900/15 transition-all hover:-translate-y-0.5 hover:bg-emerald-500"
            >
              <Sheet size={15} />
              Importar Planilha
            </Link>
            <Link
              href="/importar-nfe"
              className="flex items-center gap-2 rounded-xl border border-sky-300/70 bg-sky-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-sky-900/15 transition-all hover:-translate-y-0.5 hover:bg-sky-500"
            >
              <FileText size={15} />
              Importar XML
            </Link>
            {hasMinimumRole(user?.role, "admin") && (
              <Link
                href="/scraper-fornecedores"
                className="flex items-center gap-2 rounded-xl border border-purple-300/40 bg-purple-600/30 px-5 py-3 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-purple-600/50"
              >
                <Tag size={15} />
                Captura de Preços
              </Link>
            )}
            <Link
              href="/busca"
              className="flex items-center gap-2 rounded-xl border border-white/25 bg-white/8 px-5 py-3 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-white/14"
            >
              <Search size={15} />
              Buscar Produto
            </Link>
            {/* Ferramenta de manutenção (reset de jobs, limpeza) — só para admin */}
            {hasMinimumRole(user?.role, "admin") && (
              <button
                onClick={() => setDiagOpen((v) => !v)}
                className="flex items-center gap-2 rounded-xl border border-cyan-300/35 bg-cyan-600/20 px-5 py-3 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-cyan-600/38"
              >
                <Stethoscope size={15} />
                {diagOpen ? "Fechar Diagnóstico" : "Rodar Diagnóstico"}
              </button>
            )}
            {/* Alertas rápidos no header */}
            {(expiringProposals?.length ?? 0) > 0 && (
              <Link href="/propostas" className="ml-auto flex items-center gap-2 rounded-xl border border-amber-300/35 bg-amber-400/18 px-3 py-2 text-xs font-bold text-amber-100 transition-colors hover:bg-amber-400/28">
                <Clock size={12} />
                {expiringProposals!.length} proposta{expiringProposals!.length > 1 ? "s" : ""} vencendo
              </Link>
            )}

          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-7 px-6 py-7">

        {/* ── Primeiros passos: trilha guiada para quem está começando ── */}
        {(() => {
          if (primeirosPassosDispensado) return null;
          const passos = [
            {
              done: Boolean((companyData as any)?.name),
              label: "Preencha os dados da sua empresa",
              desc: "Nome, CNPJ, contato e dados bancários — saem no rodapé das propostas.",
              href: "/configuracao",
              minRole: "admin" as Role,
            },
            {
              done: (stats?.totalProducts ?? 0) > 0,
              label: "Importe seu catálogo de produtos",
              desc: "Traga uma planilha (Excel/CSV) ou uma NF-e para começar a cotar.",
              href: "/importar",
              minRole: "editor" as Role,
            },
            {
              done: ((taxRulesData as any[]) ?? []).length > 0,
              label: "Cadastre suas regras de impostos",
              desc: "Sem elas, o cálculo de preço mínimo sai sem impostos.",
              href: "/tributos",
            },
            {
              done: ((templatesData as any[]) ?? []).length > 0,
              label: "Crie um template de proposta",
              desc: "Preenche impostos, frete e declarações automaticamente em toda proposta.",
              href: "/templates-proposta",
            },
            {
              done: totalPipelineCount > 0,
              label: "Traga sua primeira oportunidade",
              desc: "Importe um edital ou busque no Radar de licitações.",
              href: "/edital",
              minRole: "editor" as Role,
            },
          ].filter((p) => hasMinimumRole(user?.role, p.minRole));
          const feitos = passos.filter((p) => p.done).length;
          if (passos.length === 0 || feitos === passos.length) return null;
          return (
            <div className="border border-blue-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50/60 px-5 py-3">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-blue-700" />
                  <span className="text-[12px] font-black uppercase tracking-widest text-blue-900">
                    Primeiros passos — {feitos} de {passos.length} concluídos
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <Link href="/manual" className="text-[11px] font-bold text-blue-700 hover:underline">
                    Como operar o S2 →
                  </Link>
                  <button
                    onClick={() => {
                      localStorage.setItem("s2.primeirosPassos.dispensado", "1");
                      setPrimeirosPassosDispensado(true);
                    }}
                    className="text-[11px] font-semibold text-gray-400 hover:text-gray-600"
                    aria-label="Dispensar checklist de primeiros passos"
                  >
                    Dispensar
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 lg:grid-cols-5">
                {passos.map((p, i) => (
                  <Link
                    key={p.href}
                    href={p.href}
                    className={`group border-b border-gray-100 px-5 py-4 transition-colors last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 ${
                      p.done ? "bg-emerald-50/40" : "hover:bg-blue-50/50"
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      {p.done ? (
                        <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />
                      ) : (
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-blue-300 text-[9px] font-black text-blue-700">
                          {i + 1}
                        </span>
                      )}
                      <span className={`text-[12px] font-bold ${p.done ? "text-emerald-800 line-through decoration-emerald-300" : "text-gray-800 group-hover:text-blue-800"}`}>
                        {p.label}
                      </span>
                    </div>
                    <p className="pl-6 text-[11px] leading-snug text-gray-500">{p.desc}</p>
                  </Link>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ══════════════════════════════════════════════════════════════════
            PAINEL DE AUTODIAGNÓSTICO
        ══════════════════════════════════════════════════════════════════ */}
        {diagOpen && (
          <div className="bg-gray-900 border border-cyan-500/30 shadow-lg">
            {/* Header */}
            <div className="px-5 py-3 border-b border-cyan-500/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Stethoscope size={14} className="text-cyan-400" />
                <span className="text-[11px] font-black tracking-widest uppercase text-cyan-300">Autodiagnóstico do Sistema</span>
              </div>
              <div className="flex items-center gap-3">
                {diagQuery.isFetching && (
                  <span className="flex items-center gap-1 text-[10px] text-cyan-400">
                    <RefreshCw size={10} className="animate-spin" /> Verificando...
                  </span>
                )}
                {diagQuery.data && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 border ${
                    diagQuery.data.overallStatus === "ok"
                      ? "bg-emerald-900/50 text-emerald-300 border-emerald-500/30"
                      : diagQuery.data.overallStatus === "warn"
                        ? "bg-amber-900/50 text-amber-300 border-amber-500/30"
                        : "bg-red-900/50 text-red-300 border-red-500/30"
                  }`}>
                    {diagQuery.data.overallStatus === "ok" ? "SISTEMA OK" : diagQuery.data.overallStatus === "warn" ? `${diagQuery.data.warnCount} AVISO(S)` : `${diagQuery.data.errorCount} ERRO(S)`}
                  </span>
                )}
                <button
                  onClick={() => { diagQuery.refetch(); sysErrorsQuery.refetch(); }}
                  className="text-[10px] text-cyan-400 hover:text-cyan-200 flex items-center gap-1 border border-cyan-500/30 px-2 py-0.5"
                >
                  <RefreshCw size={9} /> Retestar
                </button>
              </div>
            </div>

            {/* Verificações de saúde */}
            <div className="divide-y divide-gray-800">
              {diagQuery.isLoading && !diagQuery.data && (
                <div className="px-5 py-4 text-[12px] text-gray-400 flex items-center gap-2">
                  <RefreshCw size={12} className="animate-spin text-cyan-400" />
                  Executando verificações...
                </div>
              )}
              {(diagQuery.data?.checks ?? []).map((c, i) => (
                <div key={i} className="flex items-start gap-3 px-5 py-2.5">
                  {c.status === "ok"
                    ? <CheckCircle size={13} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                    : c.status === "warn"
                      ? <AlertTriangleIcon size={13} className="text-amber-400 mt-0.5 flex-shrink-0" />
                      : <XCircle size={13} className="text-red-400 mt-0.5 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-bold text-gray-200">{c.check}</span>
                    <span className="text-[11px] text-gray-400 ml-2">{c.detail}</span>
                  </div>
                </div>
              ))}
              {diagQuery.data && (
                <div className="px-5 py-2 text-[10px] text-gray-500">
                  Verificado em {new Date(diagQuery.data.timestamp).toLocaleString("pt-BR")}
                </div>
              )}
            </div>

            {/* ── Painel de Correção Manual dos Jobs ── */}
            <div className="border-t border-cyan-500/20">
              <div className="px-5 py-3 flex items-center justify-between gap-2 bg-gray-800/50">
                <div className="flex items-center gap-2">
                  <WrenchIcon size={13} className="text-amber-400" />
                  <span className="text-[11px] font-black tracking-widest uppercase text-amber-300">Correção Manual dos Jobs</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => resetJobLockMutation.mutate({})}
                    disabled={resetJobLockMutation.isPending}
                    className="flex items-center gap-1 text-[9px] font-bold text-amber-300 hover:text-amber-100 bg-amber-900/30 hover:bg-amber-900/50 border border-amber-500/30 px-2 py-1 transition-colors disabled:opacity-50"
                    title="Reseta todos os jobs travados (processing há mais de 30 min)"
                  >
                    {resetJobLockMutation.isPending ? <RefreshCw size={9} className="animate-spin" /> : <RotateCcw size={9} />}
                    Reset Jobs Travados
                  </button>
                  <button
                    type="button"
                    onClick={() => clearJobErrorsMutation.mutate({ olderThanDays: 30 })}
                    disabled={clearJobErrorsMutation.isPending}
                    className="flex items-center gap-1 text-[9px] font-bold text-red-300 hover:text-red-100 bg-red-900/30 hover:bg-red-900/50 border border-red-500/30 px-2 py-1 transition-colors disabled:opacity-50"
                    title="Remove registros de erro com mais de 30 dias"
                  >
                    {clearJobErrorsMutation.isPending ? <RefreshCw size={9} className="animate-spin" /> : <Trash2 size={9} />}
                    Limpar Erros (+30d)
                  </button>
                </div>
              </div>
              {sysErrorsQuery.isLoading && (
                <div className="px-5 py-3 text-[11px] text-gray-400 flex items-center gap-2">
                  <RefreshCw size={11} className="animate-spin" /> Carregando status dos jobs...
                </div>
              )}
              {/* Jobs travados */}
              {sysErrorsQuery.data && (sysErrorsQuery.data.stuckJobs ?? []).length > 0 && (
                <div className="px-5 py-2">
                  <div className="text-[9px] font-bold uppercase text-amber-400 tracking-wider mb-1">Jobs Travados ({sysErrorsQuery.data.stuckJobs.length})</div>
                  {sysErrorsQuery.data.stuckJobs.map((job: any) => (
                    <div key={job.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-gray-800">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <RefreshCw size={10} className="text-blue-400 animate-spin flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="text-[10px] font-semibold text-gray-200 truncate">{job.label}</div>
                          <div className="text-[9px] text-gray-500">{job.detail}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => resetJobLockMutation.mutate({ jobId: job.id })}
                        disabled={resetJobLockMutation.isPending}
                        className="flex items-center gap-1 text-[9px] font-bold text-amber-300 bg-amber-900/30 border border-amber-500/30 px-2 py-0.5 hover:bg-amber-900/50 transition-colors disabled:opacity-50 flex-shrink-0"
                      >
                        <RotateCcw size={8} /> Reset
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {/* Jobs com erro */}
              {sysErrorsQuery.data && (sysErrorsQuery.data.errors ?? []).length > 0 && (
                <div className="px-5 py-2">
                  <div className="text-[9px] font-bold uppercase text-red-400 tracking-wider mb-1">Importações com Erro ({sysErrorsQuery.data.errors.length})</div>
                  {sysErrorsQuery.data.errors.map((job: any) => (
                    <div key={job.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-gray-800">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <AlertTriangleIcon size={10} className="text-red-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="text-[10px] font-semibold text-gray-200 truncate">{job.label}</div>
                          <div className="text-[9px] text-gray-500 truncate">{job.detail}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => forceResyncMutation.mutate({ jobId: job.id })}
                        disabled={forceResyncMutation.isPending}
                        className="flex items-center gap-1 text-[9px] font-bold text-blue-300 bg-blue-900/30 border border-blue-500/30 px-2 py-0.5 hover:bg-blue-900/50 transition-colors disabled:opacity-50 flex-shrink-0"
                      >
                        <Play size={8} /> Reprocessar
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {sysErrorsQuery.data && (sysErrorsQuery.data.errors ?? []).length === 0 && (sysErrorsQuery.data.stuckJobs ?? []).length === 0 && (
                <div className="px-5 py-3 text-[11px] text-emerald-400 flex items-center gap-2">
                  <CheckCircle size={11} /> Nenhum job com erro ou travado
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            INTEGRIDADE DO CATÁLOGO
        ══════════════════════════════════════════════════════════════════ */}
        <div className="bg-white border border-gray-200 shadow-sm">
          <button
            type="button"
            onClick={() => setIntegrityOpen(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <ShieldAlert size={14} className="text-indigo-600" />
              <span className="text-[11px] font-black tracking-widest uppercase text-gray-600">Integridade do Catálogo</span>
              {integrityQuery.data && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 ${
                  integrityQuery.data.integrityScore >= 80 ? "bg-green-100 text-green-700" :
                  integrityQuery.data.integrityScore >= 50 ? "bg-amber-100 text-amber-700" :
                  "bg-red-100 text-red-700"
                }`}>{integrityQuery.data.integrityScore}%</span>
              )}
            </div>
            {integrityOpen ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />}
          </button>

          {integrityOpen && (
            <div className="border-t border-gray-100">
              {integrityQuery.isLoading && (
                <div className="px-5 py-4 text-[11px] text-gray-500 flex items-center gap-2">
                  <RefreshCw size={11} className="animate-spin" /> Analisando catálogo...
                </div>
              )}
              {integrityQuery.data && (
                <>
                  {/* Métricas principais */}
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-px bg-gray-100">
                    {[
                      { label: "Total", value: integrityQuery.data.total, color: "bg-white text-gray-900" },
                      { label: "Sem Tipo", value: integrityQuery.data.semTipo, color: integrityQuery.data.semTipo > 0 ? "bg-red-50 text-red-700" : "bg-white text-gray-400" },
                      { label: "Sem Status", value: integrityQuery.data.semStatus, color: integrityQuery.data.semStatus > 0 ? "bg-amber-50 text-amber-700" : "bg-white text-gray-400" },
                      { label: "Sem Ficha", value: integrityQuery.data.semFicha, color: integrityQuery.data.semFicha > 0 ? "bg-amber-50 text-amber-700" : "bg-white text-gray-400" },
                      { label: "Sem Categoria", value: integrityQuery.data.semCategoria, color: integrityQuery.data.semCategoria > 0 ? "bg-red-50 text-red-700" : "bg-white text-gray-400" },
                      { label: "Sem Fabricante", value: integrityQuery.data.semFabricante, color: integrityQuery.data.semFabricante > 0 ? "bg-amber-50 text-amber-700" : "bg-white text-gray-400" },
                    ].map((m) => (
                      <div key={m.label} className={`p-3 text-center ${m.color}`}>
                        <div className="text-lg font-black">{m.value}</div>
                        <div className="text-[9px] font-semibold uppercase tracking-wide">{m.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Distribuição por tipoCatalogo */}
                  {integrityQuery.data.distribuicaoTipo.length > 0 && (
                    <div className="px-5 py-3 border-t border-gray-100">
                      <div className="text-[9px] font-bold uppercase text-gray-400 tracking-wider mb-2">Distribuição por Tipo</div>
                      <div className="flex flex-wrap gap-2">
                        {integrityQuery.data.distribuicaoTipo.map((d: any) => (
                          <span key={d.tipo} className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 font-semibold">
                            {d.tipo ?? "NULL"}: {d.total}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Botões de ação */}
                  {integrityQuery.data.semTipo > 0 && (
                    <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => fixCatalogMutation.mutate({ dryRun: true })}
                        disabled={fixCatalogMutation.isPending}
                        className="flex items-center gap-1.5 text-[10px] font-bold text-gray-700 bg-gray-100 border border-gray-300 px-3 py-1.5 hover:bg-gray-200 transition-colors disabled:opacity-50"
                      >
                        {fixCatalogMutation.isPending ? <RefreshCw size={9} className="animate-spin" /> : <Info size={9} />}
                        Simular Correção
                      </button>
                      <button
                        type="button"
                        onClick={() => fixCatalogMutation.mutate({ dryRun: false })}
                        disabled={fixCatalogMutation.isPending}
                        className="flex items-center gap-1.5 text-[10px] font-bold text-white bg-indigo-700 px-3 py-1.5 hover:bg-indigo-800 transition-colors disabled:opacity-50"
                      >
                        {fixCatalogMutation.isPending ? <RefreshCw size={9} className="animate-spin" /> : <WrenchIcon size={9} />}
                        Corrigir Automaticamente ({integrityQuery.data.semTipo} produtos)
                      </button>
                    </div>
                  )}
                  {integrityQuery.data.semTipo === 0 && (
                    <div className="px-5 py-3 border-t border-gray-100 text-[11px] text-emerald-600 flex items-center gap-2">
                      <CheckCircle size={11} /> Todos os produtos têm tipoCatalogo definido
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            FILA DE AÇÃO DO DIA
        ══════════════════════════════════════════════════════════════════ */}
        {actionQueue.length > 0 && (
          <div className="bg-white border border-gray-200 shadow-sm">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-amber-500" />
                <span className="text-[11px] font-black tracking-widest uppercase text-gray-600">Fila de Ação do Dia</span>
                <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5">{actionQueue.length}</span>
              </div>
              <span className="text-[10px] text-gray-400">Ordenado por criticidade</span>
            </div>
            <div className="divide-y divide-gray-50">
              {actionQueue.map((item, i) => {
                const isPriCritical = item.priority === "critical";
                const isPriWarning = item.priority === "warning";
                return (
                  <Link key={i} href={item.href} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors group">
                    <div className={`w-1.5 h-8 rounded-full flex-shrink-0 ${isPriCritical ? "bg-red-500" : isPriWarning ? "bg-amber-400" : "bg-blue-300"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900 truncate">{item.label}</div>
                      <div className="text-[11px] text-gray-400">{item.detail}</div>
                    </div>
                    <div className={`text-[10px] font-bold px-2 py-0.5 flex-shrink-0 ${isPriCritical ? "bg-red-50 text-red-700 border border-red-200" : isPriWarning ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-blue-50 text-blue-700 border border-blue-200"}`}>
                      {isPriCritical ? "CRÍTICO" : isPriWarning ? "ATENÇÃO" : "INFO"}
                    </div>
                    <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-600 flex-shrink-0" />
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            KPIs — OPERAÇÃO COMERCIAL
        ══════════════════════════════════════════════════════════════════ */}
        <div>
          <SectionHeader icon={<DollarSign size={14} />} title="Operação Comercial" action={
            <Link href="/propostas" className="text-[10px] font-bold text-blue-700 hover:underline flex items-center gap-1">
              Ver todas <ArrowRight size={9} />
            </Link>
          } />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard
              label="Propostas Abertas"
              value={totalPipelineCount}
              subtitle={`${fmtBRL(totalPipelineValue)} em carteira`}
              icon={<FileText size={16} className="text-blue-700" />}
              iconBg="bg-blue-50"
              href="/propostas"
              tooltip="Total de propostas em qualquer estágio do pipeline"
            />
            <KpiCard
              label="Propostas Ganhas"
              value={extStats?.wonProposals ?? 0}
              subtitle="status entregue"
              icon={<CheckCircle2 size={16} className="text-emerald-700" />}
              iconBg="bg-emerald-50"
              href="/propostas"
              tooltip="Propostas com status Entregue"
              status={(extStats?.wonProposals ?? 0) > 0 ? "ok" : "neutral" as any}
            />
            <KpiCard
              label="Receita em Pedidos"
              value={fmtBRL(extStats?.revenueInOrders ?? 0)}
              subtitle="pedidos + trânsito + entregues"
              icon={<TrendingUp size={16} className="text-violet-700" />}
              iconBg="bg-violet-50"
              href="/propostas"
              tooltip="Soma dos valores de propostas em status Pedido, Em Trânsito e Entregue"
            />
            <KpiCard
              label="Ticket Médio"
              value={fmtBRL(extStats?.avgTicket ?? 0)}
              subtitle="por proposta ganha"
              icon={<BarChart2 size={16} className="text-orange-700" />}
              iconBg="bg-orange-50"
              href="/propostas"
              tooltip="Valor médio das propostas com status Entregue"
            />
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            PIPELINE DE PROPOSTAS
        ══════════════════════════════════════════════════════════════════ */}
        <div className="bg-white border border-gray-200 shadow-sm">
          <button
            className="w-full px-5 py-3 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50 transition-colors"
            onClick={() => setPipelineCollapsed(v => !v)}
          >
            <div className="flex items-center gap-2">
              <Workflow size={14} className="text-gray-400" />
              <span className="text-[11px] font-black tracking-widest uppercase text-gray-600">Pipeline de Propostas</span>
              <span className="text-[10px] bg-gray-100 text-gray-600 font-bold px-1.5 py-0.5">{totalPipelineCount} total</span>
            </div>
            <ChevronDown size={14} className={`text-gray-400 transition-transform ${pipelineCollapsed ? "-rotate-90" : ""}`} />
          </button>
          {!pipelineCollapsed && (
            <div className="p-5">
              {totalPipelineCount === 0 ? (
                <EmptyState
                  icon={<FileText size={28} />}
                  title="Nenhuma proposta cadastrada"
                  desc="Crie sua primeira proposta para visualizar o pipeline"
                  action={<Link href="/propostas" className="text-xs font-bold text-blue-700 hover:underline">Criar proposta →</Link>}
                />
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {PIPELINE_STAGES.map(stage => {
                    const d = pipelineByStatus[stage.status];
                    if (!d && stage.status !== "draft") return null;
                    const count = d?.count ?? 0;
                    const val = d?.totalValue ?? 0;
                    return (
                      <Link key={stage.status} href="/propostas" className={`p-3 border ${stage.border} ${stage.bg} hover:shadow-sm transition-all block group`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[10px] font-black uppercase tracking-wider ${stage.text}`}>{stage.label}</span>
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
                        </div>
                        <div className={`text-2xl font-black ${stage.text}`}>{count}</div>
                        {val > 0 && <div className="text-[10px] text-gray-500 mt-1">{fmtBRL(val)}</div>}
                        {d?.nearestDeadline && <div className="text-[10px] text-gray-400 mt-0.5">{fmtDate(d.nearestDeadline)}</div>}
                      </Link>
                    );
                  })}
                </div>
              )}
              <div className="mt-3 flex justify-end">
                <Link href="/propostas" className="text-[10px] font-bold text-blue-700 hover:underline flex items-center gap-1">
                  Administrar propostas <ArrowRight size={9} />
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            KPIs — CATÁLOGO
        ══════════════════════════════════════════════════════════════════ */}
        <div>
          <SectionHeader icon={<Package size={14} />} title="Catálogo de Produtos" action={
            <Link href="/produtos" className="text-[10px] font-bold text-blue-700 hover:underline flex items-center gap-1">
              Ver catálogo <ArrowRight size={9} />
            </Link>
          } />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {statsLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
            ) : (
              <>
                <KpiCard label="Produtos Ativos" value={stats?.totalProducts ?? 0} icon={<Package size={16} className="text-blue-700" />} iconBg="bg-blue-50" href="/produtos" tooltip="Total de produtos com status ativo no catálogo" />
                <KpiCard label="Fornecedores" value={stats?.totalSuppliers ?? 0} icon={<Building2 size={16} className="text-indigo-700" />} iconBg="bg-indigo-50" href="/fornecedores" tooltip="Fornecedores ativos cadastrados" />
                <KpiCard label="Categorias" value={stats?.totalCategories ?? 0} icon={<Tag size={16} className="text-teal-700" />} iconBg="bg-teal-50" href="/categorias" tooltip="Categorias e subcategorias disponíveis" />
                <KpiCard label="Grupos de Equiv." value={stats?.totalEquivGroups ?? 0} icon={<GitMerge size={16} className="text-purple-700" />} iconBg="bg-purple-50" href="/equivalencias" tooltip="Grupos de equivalência por princípio ativo" />

              </>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            SAÚDE DO CATÁLOGO
        ══════════════════════════════════════════════════════════════════ */}
        <div className="bg-white border border-gray-200 shadow-sm">
          <button
            className="w-full px-5 py-3 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50 transition-colors"
            onClick={() => setCatalogCollapsed(v => !v)}
          >
            <div className="flex items-center gap-3">
              <Activity size={14} className="text-gray-400" />
              <span className="text-[11px] font-black tracking-widest uppercase text-gray-600">Saúde do Catálogo</span>
              <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 ${
                healthScore === null ? "bg-gray-50 text-gray-500 border border-gray-200"
                : healthScore >= 80 ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : healthScore >= 50 ? "bg-amber-50 text-amber-700 border border-amber-200"
                : "bg-red-50 text-red-700 border border-red-200"
              }`}>
                {healthScore === null ? <AlertTriangle size={9} /> : healthScore >= 80 ? <CheckCircle2 size={9} /> : healthScore >= 50 ? <AlertTriangle size={9} /> : <XCircle size={9} />}
                {healthScore === null ? "sem produtos — importe o catálogo" : `${healthScore}% saudável`}
              </div>
            </div>
            <ChevronDown size={14} className={`text-gray-400 transition-transform ${catalogCollapsed ? "-rotate-90" : ""}`} />
          </button>
          {!catalogCollapsed && (
            <div className="p-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { label: "Sem Ficha Técnica", count: catalogHealth?.withoutFichaTecnica ?? catalogHealth?.withoutActiveIngredient ?? extStats?.productsWithoutAI ?? 0, href: "/produtos?openReclassify=1", action: "Reclassificar com IA", icon: <Sparkles size={13} />, urgency: (catalogHealth?.withoutFichaTecnica ?? catalogHealth?.withoutActiveIngredient ?? 0) > 100 },
                  { label: "Sem Fabricante", count: catalogHealth?.withoutManufacturer ?? 0, href: "/produtos", action: "Corrigir cadastro", icon: <Building2 size={13} />, urgency: (catalogHealth?.withoutManufacturer ?? 0) > 200 },
                  { label: "Sem EAN/GTIN", count: catalogHealth?.withoutEan ?? 0, href: "/produtos", action: "Adicionar código", icon: <Tag size={13} />, urgency: false },
                  { label: "Sem Categoria", count: catalogHealth?.withoutCategory ?? extStats?.productsWithoutCategory ?? 0, href: "/produtos", action: "Reclassificar com IA", icon: <Layers size={13} />, urgency: (catalogHealth?.withoutCategory ?? 0) > 50 },
                  { label: "Sem Imagem", count: catalogHealth?.withoutImage ?? 0, href: "/produtos", action: "Vincular imagens", icon: <ImageIcon size={13} />, urgency: false },
                  { label: "Sem Preço", count: catalogHealth?.withoutPrice ?? 0, href: "/produtos", action: "Atualizar preços", icon: <DollarSign size={13} />, urgency: (catalogHealth?.withoutPrice ?? 0) > 100 },
                ].map((item) => (
                  <Link key={item.label} href={item.href} className={`p-3 border transition-all block group hover:shadow-sm ${
                    item.count === 0 ? "border-emerald-200 bg-emerald-50/50" : item.urgency ? "border-amber-200 bg-amber-50/50" : "border-gray-200 bg-white hover:border-blue-300"
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`${item.count === 0 ? "text-emerald-500" : item.urgency ? "text-amber-600" : "text-gray-400"}`}>{item.icon}</span>
                      {item.count === 0 ? <CheckCircle2 size={10} className="text-emerald-500" /> : <AlertTriangle size={10} className={item.urgency ? "text-amber-500" : "text-gray-300"} />}
                    </div>
                    <div className={`text-2xl font-black ${item.count === 0 ? "text-emerald-600" : item.urgency ? "text-amber-700" : "text-gray-800"}`}>{item.count.toLocaleString("pt-BR")}</div>
                    <div className="text-[10px] font-bold text-gray-500 mt-0.5 leading-tight">{item.label}</div>
                    {item.count > 0 && <div className="text-[10px] text-blue-600 mt-1 group-hover:underline">{item.action} →</div>}
                  </Link>
                ))}
              </div>
              {/* Barra de progresso geral */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-gray-500">Completude cadastral estimada</span>
                  <span className="text-[10px] font-black text-gray-700">{healthScore === null ? "—" : `${healthScore}%`}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${healthScore === null ? "bg-gray-300" : healthScore >= 80 ? "bg-emerald-500" : healthScore >= 50 ? "bg-amber-400" : "bg-red-500"}`}
                    style={{ width: `${healthScore ?? 0}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>




        {/* ══════════════════════════════════════════════════════════════════
            GRÁFICO — PRODUTOS POR CATEGORIA (barras horizontais)
        ══════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-white border border-gray-200 shadow-sm p-5">
            <SectionHeader icon={<BarChart3 size={14} />} title="Produtos por Categoria — Top 10" action={
              <Link href="/produtos" className="text-[10px] font-bold text-blue-700 hover:underline flex items-center gap-1">
                Ver todas <ArrowRight size={9} />
              </Link>
            } />
            {categoryChartData.length > 0 ? (
              <>
                <Suspense
                  fallback={
                    <div
                      className="w-full animate-pulse bg-gray-100"
                      style={{ height: Math.max(220, categoryChartData.length * 28) }}
                    />
                  }
                >
                  <DashboardCharts
                    data={categoryChartData}
                    selectedCategoryId={selectedCategoryId}
                    onSelectCategory={(categoryId) =>
                      setSelectedCategoryId((prev) => (prev === categoryId ? null : categoryId))
                    }
                  />
                </Suspense>
                {selectedCategoryId && (
                  <button
                    onClick={() => navigate(`/produtos?categoryId=${selectedCategoryId}`)}
                    className="mt-3 w-full flex items-center justify-between px-3 py-2 bg-blue-800 text-white text-xs font-bold hover:bg-blue-900 transition-colors"
                  >
                    <span>Ver produtos desta categoria</span>
                    <ArrowRight size={12} />
                  </button>
                )}
              </>
            ) : (
              <EmptyState icon={<BarChart3 size={28} />} title="Nenhum produto categorizado" desc="Importe produtos e classifique por categoria para visualizar o gráfico." />
            )}
          </div>

          {/* Margem por categoria — coluna lateral */}
          <div className="bg-white border border-gray-200 shadow-sm p-5">
            <SectionHeader icon={<TrendingUp size={14} />} title="Margem por Categoria" />
            {marginData.filter(m => m.itemCount > 0).length > 0 ? (
              <div className="space-y-2">
                {marginData.filter(m => m.itemCount > 0).slice(0, 8).map((m) => {
                  const pct = parseFloat(m.marginPercent.toFixed(1));
                  const color = pct >= 20 ? "#166534" : pct >= 10 ? "#1d4ed8" : "#b91c1c";
                  const bg = pct >= 20 ? "bg-emerald-500" : pct >= 10 ? "bg-blue-600" : "bg-red-600";
                  const name = m.categoryName.length > 18 ? m.categoryName.slice(0, 18) + "…" : m.categoryName;
                  return (
                    <div key={m.categoryName} className="flex items-center gap-2">
                      <div className="w-24 text-[10px] text-gray-600 truncate flex-shrink-0">{name}</div>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${bg}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                      <div className="text-[10px] font-bold w-10 text-right flex-shrink-0" style={{ color }}>{pct}%</div>
                    </div>
                  );
                })}
                <div className="flex items-center gap-4 pt-2 border-t border-gray-100">
                  {[{ color: "bg-emerald-500", label: "≥20% ótimo" }, { color: "bg-blue-600", label: "≥10% bom" }, { color: "bg-red-600", label: "<10% atenção" }].map(l => (
                    <div key={l.label} className="flex items-center gap-1">
                      <div className={`w-2 h-2 rounded-full ${l.color}`} />
                      <span className="text-[9px] text-gray-400">{l.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState icon={<TrendingUp size={24} />} title="Sem dados de margem" desc="Cadastre propostas com valores para calcular margens." />
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            ACESSO RÁPIDO — reorganizado por grupo
        ══════════════════════════════════════════════════════════════════ */}
        <div>
          <SectionHeader
            icon={<LayoutGrid size={14} />}
            title="Central de Funções"
            action={
              <Link href="/manual" className="text-[10px] font-bold text-blue-700 hover:underline flex items-center gap-1">
                Como operar <ArrowRight size={9} />
              </Link>
            }
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {funcaoGroups.map((g) => (
              <div key={g.label} className="bg-white border border-gray-200 p-4 shadow-sm rounded-sm">
                <div className={`text-[10px] font-black tracking-widest uppercase ${g.head} mb-3 flex items-center gap-1.5`}>
                  {g.icon} {g.label}
                </div>
                <div className="space-y-1">
                  {g.items.map((a) => (
                    <Link
                      key={a.href}
                      href={a.href}
                      className={`flex items-center justify-between py-1.5 px-2 ${g.hoverBg} transition-colors group rounded-sm`}
                    >
                      <div className="min-w-0">
                        <div className={`text-xs font-semibold text-gray-800 ${g.hoverText}`}>{a.label}</div>
                        <div className="text-[10px] text-gray-400 truncate">{a.desc}</div>
                      </div>
                      <ChevronRight size={11} className={`text-gray-300 ${g.dot} flex-shrink-0`} />
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
