import { useAuth } from "@/_core/hooks/useAuth";
import { formatBRL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Boxes,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileScan,
  FileText,
  PackageCheck,
  Radar,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  WandSparkles,
  Zap,
} from "lucide-react";
import { Link } from "wouter";

const PIPELINE_STAGES = [
  { status: "draft", label: "Preparação", className: "bg-slate-400" },
  { status: "sent", label: "Enviadas", className: "bg-blue-500" },
  { status: "order", label: "Pedidos", className: "bg-amber-500" },
  { status: "in_transit", label: "Em trânsito", className: "bg-violet-500" },
  { status: "delivered", label: "Concluídas", className: "bg-emerald-500" },
] as const;

const STATUS_LABELS: Record<string, string> = {
  draft: "Em preparação",
  sent: "Enviada",
  order: "Pedido",
  in_transit: "Em trânsito",
  delivered: "Concluída",
  cancelled: "Cancelada",
};

function MetricCard({
  label,
  value,
  detail,
  href,
  icon,
  accent = "blue",
}: {
  label: string;
  value: string | number;
  detail: string;
  href: string;
  icon: React.ReactNode;
  accent?: "blue" | "emerald" | "amber" | "violet";
}) {
  const accentClasses = {
    blue: "bg-blue-50 text-blue-700 group-hover:bg-blue-100",
    emerald: "bg-emerald-50 text-emerald-700 group-hover:bg-emerald-100",
    amber: "bg-amber-50 text-amber-700 group-hover:bg-amber-100",
    violet: "bg-violet-50 text-violet-700 group-hover:bg-violet-100",
  };

  return (
    <Link
      href={href}
      className="group rounded-2xl border border-slate-200/80 bg-white p-4 no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${accentClasses[accent]}`}>{icon}</span>
      </div>
      <p className="m-0 text-2xl font-black tracking-tight text-slate-950">{value}</p>
      <p className="mb-0 mt-1 text-xs leading-5 text-slate-500">{detail}</p>
    </Link>
  );
}

function QuickAction({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 no-underline transition hover:border-blue-200 hover:bg-blue-50/50"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white transition group-hover:bg-blue-700">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black text-slate-900">{title}</span>
        <span className="mt-0.5 block text-xs leading-4 text-slate-500">{description}</span>
      </span>
      <ArrowRight className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600" size={16} />
    </Link>
  );
}

function QueueItem({ item }: { item: any }) {
  const priority = item.priority as "critical" | "warning" | "info";
  const styles = {
    critical: "border-rose-200 bg-rose-50 text-rose-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    info: "border-blue-200 bg-blue-50 text-blue-700",
  };
  const href = item.href === "/propostas-admin" ? "/propostas" : item.href;
  return (
    <Link href={href} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 no-underline transition hover:border-slate-300 hover:shadow-sm">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${styles[priority]}`}>
        {priority === "critical" ? <AlertTriangle size={16} /> : priority === "warning" ? <Clock3 size={16} /> : <Zap size={16} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-slate-900">{item.label}</span>
        <span className="mt-0.5 block text-xs text-slate-500">{item.detail}</span>
      </span>
      <ArrowRight size={15} className="shrink-0 text-slate-300" />
    </Link>
  );
}

function HealthRow({ label, missing, total, href }: { label: string; missing: number; total: number; href: string }) {
  const completed = Math.max(0, total - missing);
  const pct = total > 0 ? Math.round((completed / total) * 100) : 100;
  return (
    <Link href={href} className="block rounded-xl p-2.5 no-underline transition hover:bg-slate-50">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="text-xs font-bold text-slate-700">{label}</span>
        <span className="text-xs font-black text-slate-900">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-slate-900 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
        <span>{completed} completos</span>
        <span>{missing} pendentes</span>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();
  const { data: extended } = trpc.dashboard.extendedStats.useQuery();
  const { data: pipeline = [] } = trpc.dashboard.proposalPipeline.useQuery();
  const { data: expiring = [] } = trpc.dashboard.expiringProposals.useQuery({ daysAhead: 7 });
  const { data: actionQueue = [] } = trpc.dashboard.actionQueue.useQuery();
  const { data: catalogHealth } = trpc.dashboard.catalogHealth.useQuery();
  const { data: recentActivity = [] } = trpc.dashboard.recentActivity.useQuery();
  const { data: enrichment } = trpc.enrichment.getEnrichmentStats.useQuery();

  const pipelineMap = new Map(pipeline.map((item: any) => [item.status, item]));
  const activeProposals = pipeline
    .filter((item: any) => !["delivered", "cancelled"].includes(item.status))
    .reduce((total: number, item: any) => total + Number(item.count ?? 0), 0);
  const pipelineValue = pipeline.reduce((total: number, item: any) => total + Number(item.totalValue ?? 0), 0);
  const maxPipelineCount = Math.max(1, ...pipeline.map((item: any) => Number(item.count ?? 0)));
  const firstName = user?.name?.trim().split(/\s+/)[0];
  const totalProducts = Number(catalogHealth?.total ?? stats?.totalProducts ?? 0);
  const enrichedPct = Math.round(Number(enrichment?.percentualEnriquecido ?? 0));
  const catalogCoreMissing = Math.max(
    Number(catalogHealth?.withoutCategory ?? 0),
    Number(catalogHealth?.withoutFichaTecnica ?? 0),
    Number(catalogHealth?.withoutManufacturer ?? 0),
  );
  const catalogReadyPct = totalProducts > 0 ? Math.max(0, Math.round(((totalProducts - catalogCoreMissing) / totalProducts) * 100)) : 100;

  return (
    <div className="mx-auto max-w-[1480px] space-y-5 pb-8">
      <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 px-5 py-6 text-white shadow-xl sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-100px] left-1/3 h-56 w-56 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/20 bg-blue-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-blue-200">
                <Target size={12} /> Centro de comando
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold text-emerald-200">
                <Bot size={12} /> IA conectada ao catálogo
              </span>
            </div>
            <h1 className="m-0 text-2xl font-black tracking-tight sm:text-3xl">{firstName ? `${firstName}, ` : ""}o que merece atenção agora?</h1>
            <p className="mb-0 mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Cotações, propostas, catálogo e inteligência comercial reunidos para você atuar primeiro no que tem prazo, risco ou oportunidade.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:max-w-[560px] lg:justify-end">
            <Link href="/cotacoes-recebidas" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-xs font-black text-slate-950 no-underline transition hover:bg-blue-50">
              <Sparkles size={15} /> Resolver cotações
            </Link>
            <Link href="/radar-pncp" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-xs font-black text-white no-underline transition hover:bg-white/10">
              <Radar size={15} /> Radar PNCP
            </Link>
            <Link href="/produtos" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-xs font-black text-white no-underline transition hover:bg-white/10">
              <Boxes size={15} /> Catálogo inteligente
            </Link>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Indicadores executivos">
        <MetricCard label="Pipeline ativo" value={isLoading ? "—" : activeProposals} detail={`${expiring.length} com validade próxima`} href="/propostas" icon={<FileText size={18} />} />
        <MetricCard label="Valor no pipeline" value={formatBRL(pipelineValue)} detail="propostas em acompanhamento" href="/funil" icon={<CircleDollarSign size={18} />} accent="violet" />
        <MetricCard label="Receita em execução" value={formatBRL(Number(extended?.revenueInOrders ?? 0))} detail="pedidos, trânsito e entregas" href="/centro-operacional" icon={<PackageCheck size={18} />} accent="emerald" />
        <MetricCard label="Propostas ganhas" value={Number(extended?.wonProposals ?? 0)} detail={`ticket médio ${formatBRL(Number(extended?.avgTicket ?? 0))}`} href="/desempenho" icon={<Trophy size={18} />} accent="amber" />
        <MetricCard label="Catálogo pronto" value={`${catalogReadyPct}%`} detail={`${totalProducts} produtos ativos`} href="/produtos" icon={<CheckCircle2 size={18} />} accent="emerald" />
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="m-0 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Fila inteligente</p>
              <h2 className="mb-0 mt-1 text-lg font-black tracking-tight text-slate-950">Prioridades agora</h2>
              <p className="mb-0 mt-1 text-xs text-slate-500">Organizadas por prazo, impacto e pendência operacional.</p>
            </div>
            <Link href="/agenda" className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 no-underline hover:bg-slate-200">
              <CalendarClock size={13} /> Agenda
            </Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {actionQueue.length > 0 ? actionQueue.slice(0, 6).map((item: any, index: number) => <QueueItem key={`${item.type}-${index}`} item={item} />) : (
              <div className="col-span-full rounded-xl border border-dashed border-emerald-200 bg-emerald-50/60 p-5 text-center">
                <CheckCircle2 className="mx-auto text-emerald-600" size={24} />
                <p className="mb-0 mt-2 text-sm font-black text-emerald-900">Nenhuma pendência crítica na fila.</p>
                <p className="mb-0 mt-1 text-xs text-emerald-700">Use o radar para buscar novas oportunidades.</p>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <p className="m-0 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Comercial</p>
              <h2 className="mb-0 mt-1 text-lg font-black tracking-tight text-slate-950">Pipeline</h2>
            </div>
            <Link href="/funil" className="text-xs font-black text-blue-700 no-underline hover:underline">Abrir funil</Link>
          </div>
          <div className="space-y-4">
            {PIPELINE_STAGES.map((stage) => {
              const item: any = pipelineMap.get(stage.status);
              const count = Number(item?.count ?? 0);
              const pct = Math.max(count > 0 ? 7 : 0, Math.round((count / maxPipelineCount) * 100));
              return (
                <Link key={stage.status} href="/propostas" className="block no-underline">
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-xs font-bold text-slate-700"><span className={`h-2 w-2 rounded-full ${stage.className}`} />{stage.label}</span>
                    <span className="text-xs font-black text-slate-950">{count} <span className="font-medium text-slate-400">· {formatBRL(Number(item?.totalValue ?? 0))}</span></span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${stage.className}`} style={{ width: `${pct}%` }} /></div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1fr] xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="m-0 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Catálogo</p>
              <h2 className="mb-0 mt-1 flex items-center gap-2 text-lg font-black tracking-tight text-slate-950">Saúde dos dados <Boxes size={18} className="text-blue-700" /></h2>
              <p className="mb-0 mt-1 text-xs text-slate-500">Quanto mais completo o produto, melhor o match e a formação de preço.</p>
            </div>
            <div className="rounded-xl bg-slate-950 px-3 py-2 text-right text-white">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Enriquecido por IA</div>
              <div className="mt-0.5 text-xl font-black">{enrichedPct}%</div>
            </div>
          </div>
          <div className="grid gap-1 sm:grid-cols-2">
            <HealthRow label="Categoria definida" missing={Number(catalogHealth?.withoutCategory ?? 0)} total={totalProducts} href="/produtos?incompletos=1" />
            <HealthRow label="Ficha técnica" missing={Number(catalogHealth?.withoutFichaTecnica ?? 0)} total={totalProducts} href="/produtos?incompletos=1" />
            <HealthRow label="Fabricante" missing={Number(catalogHealth?.withoutManufacturer ?? 0)} total={totalProducts} href="/produtos?incompletos=1" />
            <HealthRow label="EAN / código" missing={Number(catalogHealth?.withoutEan ?? 0)} total={totalProducts} href="/produtos?incompletos=1" />
            <HealthRow label="Imagem" missing={Number(catalogHealth?.withoutImage ?? 0)} total={totalProducts} href="/imagens" />
            <HealthRow label="Preço cadastrado" missing={Number(catalogHealth?.withoutPrice ?? 0)} total={totalProducts} href="/produtos" />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <Link href="/produtos?incompletos=1" className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-3 py-2.5 text-xs font-black text-white no-underline hover:bg-blue-800"><WandSparkles size={14} /> Completar com IA</Link>
            <Link href="/reclassificacao" className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 py-2.5 text-xs font-black text-slate-800 no-underline hover:bg-slate-200"><RefreshCw size={14} /> Reclassificar</Link>
            <Link href="/enriquecimento" className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 py-2.5 text-xs font-black text-slate-800 no-underline hover:bg-slate-200"><Sparkles size={14} /> Fichas em lote</Link>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <p className="m-0 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Movimentação</p>
              <h2 className="mb-0 mt-1 text-lg font-black tracking-tight text-slate-950">Atividade recente</h2>
            </div>
            <TrendingUp className="text-blue-700" size={18} />
          </div>
          <div className="divide-y divide-slate-100">
            {recentActivity.length > 0 ? recentActivity.map((item: any) => (
              <Link key={item.id} href={`/propostas/${item.id}`} className="flex items-center gap-3 py-3 no-underline first:pt-0 last:pb-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><FileText size={15} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-black text-slate-900">{item.title || `Proposta #${item.id}`}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-slate-500">{item.orgName || "Órgão não informado"} · {STATUS_LABELS[item.status] ?? item.status}</span>
                </span>
                <span className="shrink-0 text-xs font-black text-slate-900">{formatBRL(Number(item.totalValue ?? 0))}</span>
              </Link>
            )) : <p className="m-0 py-8 text-center text-xs text-slate-400">Nenhuma atividade recente.</p>}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="m-0 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Atalhos</p>
            <h2 className="mb-0 mt-1 text-base font-black text-slate-950">Começar uma ação</h2>
          </div>
          <span className="text-[11px] font-semibold text-slate-400">{stats?.totalSuppliers ?? 0} fornecedores cadastrados</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <QuickAction href="/cotacoes-recebidas" icon={<Sparkles size={17} />} title="Cotações recebidas" description="Match, custos, pesquisa e proposta" />
          <QuickAction href="/edital" icon={<FileScan size={17} />} title="Analisar edital" description="Extrair itens e exigências" />
          <QuickAction href="/radar-pncp" icon={<Radar size={17} />} title="Buscar oportunidades" description="Radar PNCP e oportunidades" />
          <QuickAction href="/produtos" icon={<Boxes size={17} />} title="Catálogo inteligente" description="Classificar e completar com IA" />
        </div>
      </section>
    </div>
  );
}
