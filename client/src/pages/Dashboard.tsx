import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  CalendarClock,
  FileText,
  Package,
  PackageCheck,
  Plus,
  Search,
} from "lucide-react";
import { Link } from "wouter";

function Metric({ label, value, detail, href, danger }: { label: string; value: string | number; detail: string; href: string; danger?: boolean }) {
  return (
    <Link href={href} className={`rounded-xl border bg-white p-4 no-underline transition hover:shadow-sm ${danger ? "border-red-200 hover:border-red-300" : "border-slate-200 hover:border-blue-300"}`}>
      <p className="m-0 text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mb-0 mt-2 text-2xl font-black ${danger ? "text-red-700" : "text-slate-950"}`}>{value}</p>
      <p className="mb-0 mt-1 text-xs text-slate-500">{detail}</p>
    </Link>
  );
}

function ActionLink({ href, title, description, icon }: { href: string; title: string; description: string; icon: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 no-underline hover:border-blue-300 hover:bg-blue-50/40">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-900">{icon}</span>
      <span className="min-w-0"><span className="block text-sm font-bold text-slate-900">{title}</span><span className="block text-xs text-slate-500">{description}</span></span>
      <ArrowRight className="ml-auto shrink-0 text-slate-400" size={15} />
    </Link>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const summary = trpc.opportunities.summary.useQuery();
  const agenda = trpc.agenda.proximos.useQuery();
  const stats = trpc.dashboard.stats.useQuery();
  const firstName = user?.name?.trim().split(/\s+/)[0];
  const priorities = (agenda.data?.itens ?? []).slice(0, 6);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="flex flex-col gap-4 rounded-2xl bg-blue-950 px-5 py-6 text-white sm:flex-row sm:items-center">
        <div>
          <p className="m-0 text-xs font-bold uppercase tracking-[0.18em] text-blue-200">Visão diária</p>
          <h1 className="mb-1 mt-2 text-2xl font-black">Olá{firstName ? `, ${firstName}` : ""}. O que precisa avançar hoje?</h1>
          <p className="m-0 text-sm text-blue-100">Oportunidades, prazos, propostas e execução derivados do mesmo fluxo.</p>
        </div>
        <Link href="/oportunidades" className="ml-auto inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-black text-blue-950 no-underline hover:bg-blue-50"><Plus size={16} /> Nova oportunidade</Link>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Pipeline canônico">
        <Metric label="Entrada" value={summary.data?.porMacro.entrada ?? "—"} detail="aguardando triagem" href="/oportunidades" />
        <Metric label="Análise" value={summary.data?.porMacro.analise ?? "—"} detail="documento, custos e GO" href="/oportunidades" />
        <Metric label="Proposta" value={summary.data?.porMacro.proposta ?? "—"} detail="proposta, disputa e habilitação" href="/propostas" />
        <Metric label="Execução" value={summary.data?.porMacro.execucao ?? "—"} detail="contrato, compra e entrega" href="/execucao" />
        <Metric label="Críticos" value={summary.data?.criticos ?? "—"} detail="prazo vencido ou até 3 dias" href="/agenda" danger={(summary.data?.criticos ?? 0) > 0} />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <div><h2 className="m-0 text-base font-black text-slate-950">Próximas ações</h2><p className="mb-0 mt-1 text-xs text-slate-500">Fila cronológica consolidada do sistema.</p></div>
            {(agenda.data?.resumo.vencidos ?? 0) > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs font-bold text-red-700"><AlertTriangle size={13} /> {agenda.data?.resumo.vencidos} vencido(s)</span>}
          </div>
          {priorities.length === 0 ? <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">Nenhuma pendência com data registrada.</div> : <div className="space-y-2">{priorities.map((item) => <Link key={item.key} href={item.link} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3 no-underline hover:border-blue-200 hover:bg-blue-50/30"><CalendarClock size={16} className={item.diasRestantes <= 3 ? "text-red-600" : "text-blue-800"} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-800">{item.titulo}</span><span className="block truncate text-[11px] text-slate-500">{item.detalhe}</span></span><span className={`text-xs font-black ${item.diasRestantes <= 3 ? "text-red-700" : "text-slate-600"}`}>{item.diasRestantes < 0 ? `${Math.abs(item.diasRestantes)}d atraso` : item.diasRestantes === 0 ? "hoje" : `${item.diasRestantes}d`}</span></Link>)}</div>}
          <Link href="/agenda" className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-blue-800 no-underline hover:underline">Ver agenda completa <ArrowRight size={12} /></Link>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="m-0 text-base font-black text-slate-950">Ações principais</h2>
          <p className="mb-4 mt-1 text-xs text-slate-500">Uma entrada por responsabilidade.</p>
          <div className="space-y-2">
            <ActionLink href="/oportunidades" title="Trabalhar oportunidades" description="Fontes, recebidas, triagem e análise" icon={<FileText size={17} />} />
            <ActionLink href="/propostas" title="Continuar propostas" description="Preparação, envio e documentos" icon={<FileText size={17} />} />
            <ActionLink href="/execucao" title="Acompanhar execução" description="Contratos, pedidos e entregas" icon={<PackageCheck size={17} />} />
            <ActionLink href="/assistente" title="Consultar IA operacional" description="Prioridades, risco, preço e próxima ação" icon={<Brain size={17} />} />
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <ActionLink href="/catalogo" title="Catálogo" description={`${stats.data?.totalProducts ?? 0} produtos cadastrados`} icon={<Package size={17} />} />
        <ActionLink href="/busca-global" title="Busca global" description="Abrir diretamente produtos, processos e propostas" icon={<Search size={17} />} />
        <ActionLink href="/financeiro" title="Financeiro" description="Receitas, despesas, frete e relatórios" icon={<CalendarClock size={17} />} />
      </section>
    </div>
  );
}
