import { useAuth } from "@/_core/hooks/useAuth";
import { formatBRL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  FileScan,
  FileText,
  PackageCheck,
  Plus,
  Radar,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Link } from "wouter";

const stages = [
  { status: "draft", label: "Em preparação", color: "bg-slate-400" },
  { status: "sent", label: "Enviadas", color: "bg-blue-500" },
  { status: "order", label: "Pedidos", color: "bg-amber-500" },
  { status: "in_transit", label: "Em trânsito", color: "bg-violet-500" },
  { status: "delivered", label: "Entregues", color: "bg-emerald-500" },
] as const;

function Metric({
  label,
  value,
  detail,
  href,
  icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  href: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-4 no-underline shadow-sm shadow-slate-950/[0.025] transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-950/[0.06]"
    >
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-blue-600 via-blue-400 to-cyan-400 opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="mb-4 flex items-start justify-between gap-3">
        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</span>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-100 transition group-hover:bg-blue-100">
          {icon}
        </span>
      </div>
      <p className="m-0 text-[1.7rem] font-black tracking-tight text-slate-950">{value}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="m-0 text-xs leading-relaxed text-slate-500">{detail}</p>
        <ArrowUpRight size={14} className="shrink-0 text-slate-300 transition group-hover:text-blue-600" />
      </div>
    </Link>
  );
}

function ActionLink({
  href,
  title,
  description,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3.5 py-3 no-underline transition-all hover:border-blue-200 hover:bg-blue-50/60"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200 transition group-hover:bg-blue-100 group-hover:text-blue-800 group-hover:ring-blue-200">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-extrabold tracking-tight text-slate-900">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{description}</span>
      </span>
      <ArrowRight className="ml-auto shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-600" size={15} />
    </Link>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();
  const { data: pipeline = [] } = trpc.dashboard.proposalPipeline.useQuery();
  const { data: expiring = [] } = trpc.dashboard.expiringProposals.useQuery({ daysAhead: 7 });

  const pipelineMap = new Map(pipeline.map((item) => [item.status, item]));
  const activeProposals = pipeline
    .filter((item) => !["delivered", "cancelled"].includes(item.status))
    .reduce((total, item) => total + item.count, 0);
  const pipelineValue = pipeline.reduce((total, item) => total + item.totalValue, 0);
  const executionCount = pipeline
    .filter((item) => ["order", "in_transit"].includes(item.status))
    .reduce((total, item) => total + item.count, 0);
  const firstName = user?.name?.trim().split(/\s+/)[0];

  return (
    <div className="mx-auto max-w-[1440px] space-y-5 sm:space-y-6">
      <section className="relative overflow-hidden rounded-[1.35rem] border border-blue-900/20 bg-slate-950 px-5 py-6 text-white shadow-xl shadow-slate-950/10 sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-7rem] left-[35%] h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative grid gap-6 lg:grid-cols-[1.4fr_0.8fr] lg:items-center">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-blue-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.12)]" />
              Central de decisão
            </div>
            <h1 className="mb-2 mt-0 max-w-3xl text-2xl font-black tracking-tight sm:text-[2rem]">
              Olá{firstName ? `, ${firstName}` : ""}. O que precisa avançar hoje?
            </h1>
            <p className="m-0 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-[15px]">
              Oportunidades, propostas, prazos e execução em uma visão única para decidir com rapidez e rastreabilidade.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href="/edital"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-black text-white no-underline shadow-lg shadow-blue-950/25 transition hover:bg-blue-400"
              >
                <Plus size={16} /> Nova oportunidade
              </Link>
              <Link
                href="/radar-pncp"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-slate-100 no-underline transition hover:bg-white/[0.11]"
              >
                <Radar size={16} /> Abrir radar
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 rounded-2xl border border-white/10 bg-white/[0.05] p-3 backdrop-blur-sm">
            <div className="rounded-xl bg-white/[0.05] p-3">
              <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                <Clock3 size={12} /> Atenção
              </div>
              <p className="m-0 text-xl font-black text-white">{expiring.length}</p>
              <p className="mb-0 mt-1 text-[11px] text-slate-400">prazo(s) em 7 dias</p>
            </div>
            <div className="rounded-xl bg-white/[0.05] p-3">
              <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                <TrendingUp size={12} /> Pipeline
              </div>
              <p className="m-0 text-xl font-black text-white">{activeProposals}</p>
              <p className="mb-0 mt-1 text-[11px] text-slate-400">proposta(s) ativas</p>
            </div>
            <Link href="/agente" className="col-span-2 flex items-center gap-3 rounded-xl border border-violet-400/15 bg-violet-400/10 p-3 no-underline transition hover:bg-violet-400/15">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-400/15 text-violet-200">
                <Sparkles size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-black text-white">Assistente IA</span>
                <span className="mt-0.5 block text-[11px] text-slate-400">Apoio rápido para análise e operação</span>
              </span>
              <ArrowRight size={14} className="text-slate-500" />
            </Link>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores essenciais">
        <Metric
          label="Propostas ativas"
          value={isLoading ? "—" : activeProposals}
          detail="preparação, envio ou execução"
          href="/propostas"
          icon={<FileText size={17} />}
        />
        <Metric
          label="Vencem em 7 dias"
          value={expiring.length}
          detail="prazos que exigem conferência"
          href="/agenda"
          icon={<CalendarClock size={17} />}
        />
        <Metric
          label="Valor no pipeline"
          value={formatBRL(pipelineValue)}
          detail="soma das propostas acompanhadas"
          href="/funil"
          icon={<CircleDollarSign size={17} />}
        />
        <Metric
          label="Pedidos e entregas"
          value={executionCount}
          detail="operações em acompanhamento"
          href="/centro-operacional"
          icon={<PackageCheck size={17} />}
        />
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.45fr_0.85fr]">
        <div className="s2-panel p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="s2-kicker">Próximas ações</span>
              <h2 className="mb-0 mt-2 text-lg font-black text-slate-950">Prioridades operacionais</h2>
              <p className="mb-0 mt-1 text-xs leading-relaxed text-slate-500">Atalhos para iniciar, revisar ou concluir o fluxo principal.</p>
            </div>
            {expiring.length > 0 && (
              <Link href="/agenda" className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-800 no-underline hover:bg-amber-100">
                <AlertTriangle size={13} /> {expiring.length} prazo(s)
              </Link>
            )}
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <ActionLink href="/radar-pncp" title="Buscar oportunidades" description="Consultar novas licitações no radar" icon={<Radar size={17} />} />
            <ActionLink href="/edital" title="Analisar edital" description="Importar documentos e conferir exigências" icon={<FileScan size={17} />} />
            <ActionLink href="/propostas" title="Continuar propostas" description="Itens, custos, documentos e envio" icon={<FileText size={17} />} />
            <ActionLink href="/centro-operacional" title="Acompanhar execução" description="Pedidos, entregas e recebimentos" icon={<PackageCheck size={17} />} />
          </div>
        </div>

        <div className="s2-panel p-4 sm:p-5">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <span className="s2-kicker">Fluxo comercial</span>
              <h2 className="mb-0 mt-2 text-lg font-black text-slate-950">Pipeline</h2>
              <p className="mb-0 mt-1 text-xs text-slate-500">Distribuição atual das propostas.</p>
            </div>
            <Link href="/funil" className="rounded-lg px-2 py-1 text-xs font-bold text-blue-700 no-underline hover:bg-blue-50">Ver funil</Link>
          </div>
          <div className="space-y-1.5">
            {stages.map((stage) => {
              const current = pipelineMap.get(stage.status);
              return (
                <Link key={stage.status} href="/propostas" className="group flex items-center gap-3 rounded-xl px-2.5 py-2.5 no-underline transition hover:bg-slate-50">
                  <span className={`h-2.5 w-2.5 rounded-full ${stage.color} ring-4 ring-slate-100`} />
                  <span className="flex-1 text-sm font-semibold text-slate-700 group-hover:text-slate-950">{stage.label}</span>
                  <span className="min-w-7 rounded-lg bg-slate-100 px-2 py-1 text-center text-xs font-black text-slate-900">{current?.count ?? 0}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="s2-panel p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="s2-kicker">Operação</span>
            <h2 className="mb-0 mt-2 text-lg font-black text-slate-950">Acessos complementares</h2>
            <p className="mb-0 mt-1 text-xs text-slate-500">Ferramentas auxiliares sem duplicar a navegação principal.</p>
          </div>
          <TrendingUp className="text-blue-700" size={18} />
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <Link href="/cotacoes-recebidas" className="rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-3 text-sm font-bold text-slate-700 no-underline transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-900">Cotações recebidas</Link>
          <Link href="/produtos" className="rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-3 text-sm font-bold text-slate-700 no-underline transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-900">Catálogo e equivalências</Link>
          <Link href="/fornecedores" className="rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-3 text-sm font-bold text-slate-700 no-underline transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-900">Fornecedores</Link>
          <Link href="/importar-nfe" className="rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-3 text-sm font-bold text-slate-700 no-underline transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-900">Importar XML</Link>
        </div>
      </section>

      <p className="text-center text-[11px] font-medium text-slate-400">
        Base atual: {stats?.totalProducts ?? 0} produtos e {stats?.totalSuppliers ?? 0} fornecedores cadastrados.
      </p>
    </div>
  );
}
