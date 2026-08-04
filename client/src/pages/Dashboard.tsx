import { useAuth } from "@/_core/hooks/useAuth";
import { formatBRL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  FileScan,
  FileText,
  PackageCheck,
  Plus,
  Radar,
  TrendingUp,
} from "lucide-react";
import { Link } from "wouter";

const stages = [
  { status: "draft", label: "Em preparação", color: "bg-slate-500" },
  { status: "sent", label: "Enviadas", color: "bg-blue-600" },
  { status: "order", label: "Pedidos", color: "bg-amber-500" },
  { status: "in_transit", label: "Em trânsito", color: "bg-violet-600" },
  { status: "delivered", label: "Entregues", color: "bg-emerald-600" },
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
      className="rounded-xl border border-slate-200 bg-white p-4 no-underline transition hover:border-blue-300 hover:shadow-sm"
    >
      <div className="mb-3 flex items-center justify-between text-blue-900">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
        {icon}
      </div>
      <p className="m-0 text-2xl font-black text-slate-950">{value}</p>
      <p className="mb-0 mt-1 text-xs text-slate-500">{detail}</p>
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
      className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 no-underline hover:border-blue-300 hover:bg-blue-50/40"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-900">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-slate-900">{title}</span>
        <span className="block text-xs text-slate-500">{description}</span>
      </span>
      <ArrowRight className="ml-auto shrink-0 text-slate-400" size={15} />
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
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="flex flex-col gap-4 rounded-2xl bg-blue-950 px-5 py-6 text-white sm:flex-row sm:items-center">
        <div>
          <p className="m-0 text-xs font-bold uppercase tracking-[0.18em] text-blue-200">Visão diária</p>
          <h1 className="mb-1 mt-2 text-2xl font-black">Olá{firstName ? `, ${firstName}` : ""}. O que precisa avançar hoje?</h1>
          <p className="m-0 text-sm text-blue-100">Prazos, propostas e execução em uma única visão.</p>
        </div>
        <Link
          href="/edital"
          className="ml-auto inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-black text-blue-950 no-underline hover:bg-blue-50"
        >
          <Plus size={16} /> Nova oportunidade
        </Link>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Indicadores essenciais">
        <Metric
          label="Propostas ativas"
          value={isLoading ? "—" : activeProposals}
          detail="em preparação, enviadas ou execução"
          href="/propostas"
          icon={<FileText size={18} />}
        />
        <Metric
          label="Vencem em 7 dias"
          value={expiring.length}
          detail="exigem conferência de prazo"
          href="/agenda"
          icon={<CalendarClock size={18} />}
        />
        <Metric
          label="Valor no pipeline"
          value={formatBRL(pipelineValue)}
          detail="soma das propostas acompanhadas"
          href="/funil"
          icon={<CircleDollarSign size={18} />}
        />
        <Metric
          label="Pedidos e entregas"
          value={executionCount}
          detail="operações que precisam de acompanhamento"
          href="/centro-operacional"
          icon={<PackageCheck size={18} />}
        />
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="m-0 text-base font-black text-slate-950">Prioridades</h2>
              <p className="mb-0 mt-1 text-xs text-slate-500">Ações mais frequentes para iniciar ou concluir o trabalho.</p>
            </div>
            {expiring.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800">
                <AlertTriangle size={13} /> {expiring.length} prazo(s)
              </span>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <ActionLink href="/radar-pncp" title="Buscar oportunidades" description="Consultar o radar de licitações" icon={<Radar size={17} />} />
            <ActionLink href="/edital" title="Analisar edital" description="Importar e conferir exigências" icon={<FileScan size={17} />} />
            <ActionLink href="/propostas" title="Continuar propostas" description="Itens, custos, documentos e envio" icon={<FileText size={17} />} />
            <ActionLink href="/centro-operacional" title="Acompanhar execução" description="Pedidos, entregas e recebimentos" icon={<PackageCheck size={17} />} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="m-0 text-base font-black text-slate-950">Pipeline</h2>
              <p className="mb-0 mt-1 text-xs text-slate-500">Situação atual das propostas.</p>
            </div>
            <Link href="/funil" className="text-xs font-bold text-blue-800 no-underline hover:underline">Ver funil</Link>
          </div>
          <div className="space-y-3">
            {stages.map((stage) => {
              const current = pipelineMap.get(stage.status);
              return (
                <Link key={stage.status} href="/propostas" className="flex items-center gap-3 no-underline">
                  <span className={`h-2.5 w-2.5 rounded-full ${stage.color}`} />
                  <span className="flex-1 text-sm font-semibold text-slate-700">{stage.label}</span>
                  <span className="text-sm font-black text-slate-950">{current?.count ?? 0}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="m-0 text-base font-black text-slate-950">Acessos operacionais</h2>
            <p className="mb-0 mt-1 text-xs text-slate-500">Funções auxiliares, sem repetir todo o menu.</p>
          </div>
          <TrendingUp className="text-blue-900" size={18} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/cotacoes-recebidas" className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 no-underline hover:bg-blue-50">Cotações recebidas</Link>
          <Link href="/produtos" className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 no-underline hover:bg-blue-50">Catálogo e equivalências</Link>
          <Link href="/fornecedores" className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 no-underline hover:bg-blue-50">Fornecedores</Link>
          <Link href="/importar-nfe" className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 no-underline hover:bg-blue-50">Importar XML</Link>
        </div>
      </section>

      <p className="text-center text-xs text-slate-400">
        {stats?.totalProducts ?? 0} produtos e {stats?.totalSuppliers ?? 0} fornecedores cadastrados.
      </p>
    </div>
  );
}
