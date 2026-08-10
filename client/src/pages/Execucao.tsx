import { useMemo, useState } from "react";
import { BriefcaseBusiness, CheckCircle2, Loader2, PackageCheck, Truck } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { formatBRL, formatDateBR } from "@/lib/format";

type Tab = "pedidos" | "entregas" | "contratos";

const ORDER_STATUS = ["solicitado", "confirmado", "faturado", "enviado", "recebido", "divergente", "cancelado"] as const;
const DELIVERY_STATUS = ["preparando", "transito", "entregue", "atrasada", "devolvida"] as const;

export default function Execucao() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const requested = params.get("tab");
  const [tab, setTab] = useState<Tab>(requested === "contratos" || requested === "entregas" ? requested : "pedidos");

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <section className="rounded-2xl bg-blue-950 p-5 text-white">
        <div className="flex items-start gap-3">
          <PackageCheck size={26} className="mt-0.5" />
          <div>
            <p className="m-0 text-[10px] font-black uppercase tracking-[0.16em] text-blue-200">Após adjudicação</p>
            <h1 className="mb-1 mt-1 text-2xl font-black">Execução</h1>
            <p className="m-0 text-sm text-blue-100">Contrato, compra e entrega no mesmo fluxo. Mudanças vinculadas atualizam a oportunidade automaticamente; recebimentos e pagamentos ficam no Financeiro.</p>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <TabButton active={tab === "pedidos"} onClick={() => setTab("pedidos")} icon={<PackageCheck size={15} />} label="Pedidos" />
        <TabButton active={tab === "entregas"} onClick={() => setTab("entregas")} icon={<Truck size={15} />} label="Entregas" />
        <TabButton active={tab === "contratos"} onClick={() => setTab("contratos")} icon={<BriefcaseBusiness size={15} />} label="Contratos" />
      </div>

      {tab === "pedidos" && <Orders />}
      {tab === "entregas" && <Deliveries />}
      {tab === "contratos" && <Contracts />}
    </div>
  );
}

function Orders() {
  const query = trpc.posVenda.pedidos.useQuery();
  const utils = trpc.useUtils();
  const change = trpc.opportunities.updateOrderStatus.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.posVenda.pedidos.invalidate(),
        utils.opportunities.list.invalidate(),
        utils.opportunities.summary.invalidate(),
        utils.agenda.proximos.invalidate(),
      ]);
      toast.success("Pedido e fluxo atualizados.");
    },
    onError: (error) => toast.error(error.message),
  });
  if (query.isLoading) return <Loading />;
  const rows = query.data ?? [];
  if (!rows.length) return <Empty title="Nenhum pedido em execução" text="Quando uma proposta vencedora gerar compra, o pedido aparecerá aqui." />;
  return <div className="space-y-2">{rows.map((row) => <article key={row.id} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="text-sm font-black text-slate-900">{row.descricao}</div><div className="mt-1 text-xs text-slate-500">{row.fornecedorNome} · {formatBRL(Number(row.valorTotal))}{row.prazoEntrega ? ` · entrega ${formatDateBR(row.prazoEntrega)}` : ""}</div>{row.vinculo && <div className="mt-1 text-[10px] text-slate-400">Vínculo: {row.vinculo}</div>}</div><select value={row.status} disabled={change.isPending} onChange={(event) => change.mutate({ id: row.id, status: event.target.value as typeof ORDER_STATUS[number] })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">{ORDER_STATUS.map((status) => <option key={status} value={status}>{status}</option>)}</select></div></article>)}</div>;
}

function Deliveries() {
  const query = trpc.posVenda.entregas.useQuery();
  const utils = trpc.useUtils();
  const change = trpc.opportunities.updateDeliveryStatus.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.posVenda.entregas.invalidate(),
        utils.opportunities.list.invalidate(),
        utils.opportunities.summary.invalidate(),
        utils.agenda.proximos.invalidate(),
      ]);
      toast.success("Entrega e fluxo atualizados.");
    },
    onError: (error) => toast.error(error.message),
  });
  if (query.isLoading) return <Loading />;
  const rows = query.data ?? [];
  if (!rows.length) return <Empty title="Nenhuma entrega em acompanhamento" text="Entregas vinculadas à execução aparecerão aqui." />;
  return <div className="space-y-2">{rows.map((row) => <article key={row.id} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="text-sm font-black text-slate-900">{row.descricao}</div><div className="mt-1 text-xs text-slate-500">{[row.transportadora, row.rastreio, row.previsao ? `previsão ${formatDateBR(row.previsao)}` : null].filter(Boolean).join(" · ")}</div>{row.entregueEm && <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700"><CheckCircle2 size={11} /> entregue {formatDateBR(row.entregueEm)}</div>}</div><select value={row.status} disabled={change.isPending} onChange={(event) => change.mutate({ id: row.id, status: event.target.value as typeof DELIVERY_STATUS[number] })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">{DELIVERY_STATUS.map((status) => <option key={status} value={status}>{status}</option>)}</select></div></article>)}</div>;
}

function Contracts() {
  const query = trpc.operationalGovernance.listContracts.useQuery();
  if (query.isLoading) return <Loading />;
  const rows = query.data ?? [];
  if (!rows.length) return <Empty title="Nenhum contrato cadastrado" text="Contratos e instrumentos pós-adjudicação aparecerão aqui." />;
  return <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] font-black uppercase tracking-wider text-slate-500"><th className="p-3">Contrato</th><th className="p-3">Órgão</th><th className="p-3">Valor</th><th className="p-3">Saldo</th><th className="p-3">Fim vigência</th><th className="p-3">Status</th></tr></thead><tbody>{rows.map((row: any) => <tr key={row.id} className="border-b border-slate-100 last:border-0"><td className="p-3 font-bold text-slate-900">{row.numeroContrato}</td><td className="p-3 text-slate-600">{row.orgao}</td><td className="p-3 font-semibold">{formatBRL(Number(row.valorContratado ?? 0))}</td><td className="p-3">{formatBRL(Number(row.saldoContratual ?? 0))}</td><td className="p-3">{row.fimVigencia ? formatDateBR(row.fimVigencia) : "—"}{row.daysToExpire != null && row.daysToExpire <= 45 && <div className="text-[10px] font-bold text-amber-700">{row.daysToExpire} dia(s)</div>}</td><td className="p-3"><span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">{row.status}</span></td></tr>)}</tbody></table></div>;
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) { return <button onClick={onClick} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${active ? "bg-blue-950 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{icon}{label}</button>; }
function Loading() { return <div className="flex min-h-48 items-center justify-center text-slate-400"><Loader2 className="animate-spin" size={20} /></div>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="rounded-xl border border-dashed border-slate-200 bg-white p-12 text-center"><div className="text-sm font-black text-slate-700">{title}</div><div className="mt-1 text-xs text-slate-400">{text}</div></div>; }
