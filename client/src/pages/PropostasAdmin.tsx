import { useState } from "react";
import { ArrowLeft, FileText, Loader2, Search } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { formatBRL } from "@/lib/format";

export default function PropostasAdmin() {
  const [status, setStatus] = useState("");
  const [orgName, setOrgName] = useState("");
  const query = trpc.proposals.listAdmin.useQuery({ status: status || undefined, orgName: orgName || undefined });
  const rows = (query.data ?? []) as any[];
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <section className="flex flex-col gap-3 rounded-2xl bg-blue-950 p-5 text-white sm:flex-row sm:items-center">
        <div><p className="m-0 text-[10px] font-black uppercase tracking-[0.16em] text-blue-200">Visão administrativa</p><h1 className="mb-1 mt-1 text-2xl font-black">Propostas</h1><p className="m-0 text-sm text-blue-100">Consulta consolidada para gestão, auditoria e filtros. A edição continua na proposta individual.</p></div>
        <Link href="/propostas" className="ml-auto inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-bold text-blue-950 no-underline"><ArrowLeft size={14} /> Voltar</Link>
      </section>
      <section className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4"><div className="relative min-w-[240px] flex-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Filtrar por órgão" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400" /></div><select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">Todos os status</option><option value="draft">Rascunho</option><option value="sent">Enviada</option><option value="order">Pedido</option><option value="in_transit">Em trânsito</option><option value="delivered">Entregue</option><option value="cancelled">Cancelada</option></select></section>
      {query.isLoading ? <div className="flex min-h-48 items-center justify-center text-slate-400"><Loader2 className="animate-spin" /></div> : rows.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-400">Nenhuma proposta para os filtros.</div> : <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] font-black uppercase tracking-wider text-slate-500"><th className="p-3">Proposta</th><th className="p-3">Órgão</th><th className="p-3">Status</th><th className="p-3">Valor</th><th className="p-3">Atualização</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-b border-slate-100 last:border-0"><td className="p-3"><Link href={`/propostas/${row.id}`} className="inline-flex items-center gap-2 font-bold text-blue-900 no-underline hover:underline"><FileText size={14} />{row.title}</Link><div className="mt-1 text-[10px] text-slate-400">{row.processNumber ?? `#${row.id}`}</div></td><td className="p-3 text-slate-600">{row.orgName ?? "—"}</td><td className="p-3"><span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold">{row.status}</span></td><td className="p-3 font-semibold">{row.totalValue != null ? formatBRL(Number(row.totalValue)) : "—"}</td><td className="p-3 text-xs text-slate-500">{row.updatedAt ? new Date(row.updatedAt).toLocaleString("pt-BR") : row.createdAt ? new Date(row.createdAt).toLocaleString("pt-BR") : "—"}</td></tr>)}</tbody></table></section>}
    </div>
  );
}
