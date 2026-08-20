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
  FileCode2,
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

const PIPELINE = [
  ["draft", "Preparação", "bg-slate-400"],
  ["sent", "Enviadas", "bg-blue-500"],
  ["order", "Pedidos", "bg-amber-500"],
  ["in_transit", "Em trânsito", "bg-violet-500"],
  ["delivered", "Concluídas", "bg-emerald-500"],
] as const;

const STATUS: Record<string, string> = {
  draft: "Em preparação",
  sent: "Enviada",
  order: "Pedido",
  in_transit: "Em trânsito",
  delivered: "Concluída",
  cancelled: "Cancelada",
};

function Metric({ label, value, detail, href, icon, tone = "blue" }: {
  label: string;
  value: string | number;
  detail: string;
  href: string;
  icon: React.ReactNode;
  tone?: "blue" | "emerald" | "amber" | "violet";
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    violet: "bg-violet-50 text-violet-700",
  };
  return <Link href={href} className="group rounded-2xl border border-slate-200 bg-white p-4 no-underline shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
    <div className="mb-4 flex items-start justify-between gap-3"><span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</span><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</span></div>
    <p className="m-0 text-2xl font-black tracking-tight text-slate-950">{value}</p><p className="mb-0 mt-1 text-xs leading-5 text-slate-500">{detail}</p>
  </Link>;
}

function Action({ href, icon, title, detail }: { href: string; icon: React.ReactNode; title: string; detail: string }) {
  return <Link href={href} className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 no-underline transition hover:border-blue-200 hover:bg-blue-50/50">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white group-hover:bg-blue-700">{icon}</span>
    <span className="min-w-0 flex-1"><span className="block text-sm font-black text-slate-900">{title}</span><span className="mt-0.5 block text-xs text-slate-500">{detail}</span></span><ArrowRight size={15} className="text-slate-300" />
  </Link>;
}

function Priority({ item }: { item: any }) {
  const level = item.priority as "critical" | "warning" | "info";
  const cls = level === "critical" ? "border-rose-200 bg-rose-50 text-rose-700" : level === "warning" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-blue-200 bg-blue-50 text-blue-700";
  const href = item.href === "/propostas-admin" ? "/propostas" : item.href;
  return <Link href={href} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 no-underline transition hover:shadow-sm">
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${cls}`}>{level === "critical" ? <AlertTriangle size={16} /> : level === "warning" ? <Clock3 size={16} /> : <Zap size={16} />}</span>
    <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900">{item.label}</span><span className="mt-0.5 block text-xs text-slate-500">{item.detail}</span></span><ArrowRight size={14} className="text-slate-300" />
  </Link>;
}

function Health({ label, missing, total, href }: { label: string; missing: number; total: number; href: string }) {
  const complete = Math.max(0, total - missing);
  const pct = total ? Math.round(complete / total * 100) : 100;
  return <Link href={href} className="block rounded-xl p-2.5 no-underline transition hover:bg-slate-50">
    <div className="mb-1.5 flex justify-between gap-3 text-xs"><strong className="text-slate-700">{label}</strong><strong className="text-slate-950">{pct}%</strong></div>
    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-900" style={{ width: `${pct}%` }} /></div>
    <div className="mt-1 flex justify-between text-[10px] text-slate-400"><span>{complete} completos</span><span>{missing} pendentes</span></div>
  </Link>;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();
  const { data: extended } = trpc.dashboard.extendedStats.useQuery();
  const { data: pipeline = [] } = trpc.dashboard.proposalPipeline.useQuery();
  const { data: expiring = [] } = trpc.dashboard.expiringProposals.useQuery({ daysAhead: 7 });
  const { data: queue = [] } = trpc.dashboard.actionQueue.useQuery();
  const { data: catalog } = trpc.dashboard.catalogHealth.useQuery();
  const { data: activity = [] } = trpc.dashboard.recentActivity.useQuery();
  const { data: enrichment } = trpc.enrichment.getEnrichmentStats.useQuery();

  const byStatus = new Map(pipeline.map((item: any) => [item.status, item]));
  const active = pipeline.filter((item: any) => !["delivered", "cancelled"].includes(item.status)).reduce((sum: number, item: any) => sum + Number(item.count ?? 0), 0);
  const pipelineValue = pipeline.reduce((sum: number, item: any) => sum + Number(item.totalValue ?? 0), 0);
  const maxStage = Math.max(1, ...pipeline.map((item: any) => Number(item.count ?? 0)));
  const firstName = user?.name?.trim().split(/\s+/)[0];
  const totalProducts = Number(catalog?.total ?? stats?.totalProducts ?? 0);
  const coreMissing = Math.max(Number(catalog?.withoutCategory ?? 0), Number(catalog?.withoutFichaTecnica ?? 0), Number(catalog?.withoutManufacturer ?? 0));
  const catalogPct = totalProducts ? Math.max(0, Math.round((totalProducts - coreMissing) / totalProducts * 100)) : 100;
  const aiPct = Math.round(Number(enrichment?.percentualEnriquecido ?? 0));

  return <div className="mx-auto max-w-[1480px] space-y-5 pb-8">
    <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 px-5 py-6 text-white shadow-xl sm:px-7 sm:py-7">
      <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-blue-600/20 blur-3xl" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center"><div className="min-w-0 flex-1"><div className="mb-3 flex flex-wrap gap-2"><span className="inline-flex items-center gap-1.5 rounded-full bg-blue-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-blue-200"><Target size={12} /> Centro de comando</span><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold text-emerald-200"><Bot size={12} /> IA conectada ao catálogo</span></div><h1 className="m-0 text-2xl font-black tracking-tight sm:text-3xl">{firstName ? `${firstName}, ` : ""}o que merece atenção agora?</h1><p className="mb-0 mt-2 max-w-2xl text-sm leading-6 text-slate-300">Cotações, propostas, produtos e oportunidades reunidos para você agir primeiro onde há prazo, risco ou maior retorno.</p></div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:max-w-[620px] lg:justify-end"><Link href="/cotacoes-recebidas" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-xs font-black text-slate-950 no-underline"><Sparkles size={15}/> Resolver cotações</Link><Link href="/radar-pncp" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-xs font-black text-white no-underline"><Radar size={15}/> Radar PNCP</Link><Link href="/produtos" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-xs font-black text-white no-underline"><Boxes size={15}/> Catálogo inteligente</Link></div>
      </div>
    </section>

    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Metric label="Pipeline ativo" value={isLoading ? "—" : active} detail={`${expiring.length} com validade próxima`} href="/propostas" icon={<FileText size={18}/>} />
      <Metric label="Valor no pipeline" value={formatBRL(pipelineValue)} detail="propostas em acompanhamento" href="/funil" icon={<CircleDollarSign size={18}/>} tone="violet" />
      <Metric label="Receita em execução" value={formatBRL(Number(extended?.revenueInOrders ?? 0))} detail="pedidos, trânsito e entregas" href="/centro-operacional" icon={<PackageCheck size={18}/>} tone="emerald" />
      <Metric label="Propostas ganhas" value={Number(extended?.wonProposals ?? 0)} detail={`ticket médio ${formatBRL(Number(extended?.avgTicket ?? 0))}`} href="/desempenho" icon={<Trophy size={18}/>} tone="amber" />
      <Metric label="Catálogo pronto" value={`${catalogPct}%`} detail={`${totalProducts} produtos ativos`} href="/produtos" icon={<CheckCircle2 size={18}/>} tone="emerald" />
    </section>

    <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-start justify-between"><div><p className="m-0 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Fila inteligente</p><h2 className="mb-0 mt-1 text-lg font-black text-slate-950">Prioridades agora</h2><p className="mb-0 mt-1 text-xs text-slate-500">Ordenadas por prazo, impacto e pendência operacional.</p></div><Link href="/agenda" className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 no-underline"><CalendarClock size={13}/> Agenda</Link></div><div className="grid gap-2 sm:grid-cols-2">{queue.length ? queue.slice(0,6).map((item:any,index:number)=><Priority key={`${item.type}-${index}`} item={item}/>) : <div className="col-span-full rounded-xl border border-dashed border-emerald-200 bg-emerald-50 p-5 text-center"><CheckCircle2 className="mx-auto text-emerald-600"/><p className="mb-0 mt-2 text-sm font-black text-emerald-900">Nenhuma pendência crítica.</p></div>}</div></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex justify-between"><div><p className="m-0 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Comercial</p><h2 className="mb-0 mt-1 text-lg font-black">Pipeline</h2></div><Link href="/funil" className="text-xs font-black text-blue-700 no-underline">Abrir funil</Link></div><div className="space-y-4">{PIPELINE.map(([status,label,color])=>{const item:any=byStatus.get(status);const count=Number(item?.count??0);const pct=Math.max(count?7:0,Math.round(count/maxStage*100));return <Link key={status} href="/propostas" className="block no-underline"><div className="mb-1.5 flex justify-between gap-3"><span className="flex items-center gap-2 text-xs font-bold text-slate-700"><span className={`h-2 w-2 rounded-full ${color}`}/>{label}</span><span className="text-xs font-black text-slate-950">{count} <span className="font-medium text-slate-400">· {formatBRL(Number(item?.totalValue??0))}</span></span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${color}`} style={{width:`${pct}%`}}/></div></Link>})}</div></div>
    </section>

    <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-start justify-between"><div><p className="m-0 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Catálogo</p><h2 className="mb-0 mt-1 flex items-center gap-2 text-lg font-black">Saúde dos dados <Boxes size={18} className="text-blue-700"/></h2><p className="mb-0 mt-1 text-xs text-slate-500">Dados completos aumentam a confiança do match e da formação de preço.</p></div><div className="rounded-xl bg-slate-950 px-3 py-2 text-right text-white"><span className="block text-[9px] font-bold uppercase text-slate-400">Enriquecido por IA</span><strong className="text-xl">{aiPct}%</strong></div></div><div className="grid gap-1 sm:grid-cols-2"><Health label="Categoria definida" missing={Number(catalog?.withoutCategory??0)} total={totalProducts} href="/produtos?incompletos=1"/><Health label="Ficha técnica" missing={Number(catalog?.withoutFichaTecnica??0)} total={totalProducts} href="/produtos?incompletos=1"/><Health label="Fabricante" missing={Number(catalog?.withoutManufacturer??0)} total={totalProducts} href="/produtos?incompletos=1"/><Health label="EAN / código" missing={Number(catalog?.withoutEan??0)} total={totalProducts} href="/produtos?incompletos=1"/><Health label="Imagem" missing={Number(catalog?.withoutImage??0)} total={totalProducts} href="/imagens"/><Health label="Preço cadastrado" missing={Number(catalog?.withoutPrice??0)} total={totalProducts} href="/produtos"/></div><div className="mt-4 grid gap-2 sm:grid-cols-3"><Link href="/produtos?incompletos=1" className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-3 py-2.5 text-xs font-black text-white no-underline"><WandSparkles size={14}/> Completar com IA</Link><Link href="/reclassificacao" className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 py-2.5 text-xs font-black text-slate-800 no-underline"><RefreshCw size={14}/> Reclassificar</Link><Link href="/enriquecimento" className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 py-2.5 text-xs font-black text-slate-800 no-underline"><Sparkles size={14}/> Fichas em lote</Link></div></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex justify-between"><div><p className="m-0 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Movimentação</p><h2 className="mb-0 mt-1 text-lg font-black">Atividade recente</h2></div><TrendingUp className="text-blue-700" size={18}/></div><div className="divide-y divide-slate-100">{activity.length ? activity.map((item:any)=><Link key={item.id} href={`/propostas/${item.id}`} className="flex items-center gap-3 py-3 no-underline"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><FileText size={15}/></span><span className="min-w-0 flex-1"><strong className="block truncate text-xs text-slate-900">{item.title||`Proposta #${item.id}`}</strong><span className="block truncate text-[11px] text-slate-500">{item.orgName||"Órgão não informado"} · {STATUS[item.status]??item.status}</span></span><strong className="text-xs text-slate-900">{formatBRL(Number(item.totalValue??0))}</strong></Link>) : <p className="py-8 text-center text-xs text-slate-400">Nenhuma atividade recente.</p>}</div></div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"><div className="mb-3 flex items-center justify-between"><div><p className="m-0 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Atalhos</p><h2 className="mb-0 mt-1 text-base font-black">Começar uma ação</h2></div><span className="text-[11px] font-semibold text-slate-400">{stats?.totalSuppliers??0} fornecedores cadastrados</span></div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5"><Action href="/cotacoes-recebidas" icon={<Sparkles size={17}/>} title="Cotações recebidas" detail="Match, custos, pesquisa e proposta"/><Action href="/edital" icon={<FileScan size={17}/>} title="Analisar edital" detail="Extrair itens e exigências"/><Action href="/importar-nfe" icon={<FileCode2 size={17}/>} title="Importar XML" detail="Cadastrar produtos de NF-e"/><Action href="/radar-pncp" icon={<Radar size={17}/>} title="Buscar oportunidades" detail="Radar PNCP e oportunidades"/><Action href="/produtos" icon={<Boxes size={17}/>} title="Catálogo inteligente" detail="Classificar e completar com IA"/></div></section>
  </div>;
}
