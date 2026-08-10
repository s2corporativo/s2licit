import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, Brain, CheckCircle2, FileScan, Inbox, Loader2, MailCheck, Plus, Radar, RefreshCw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { usePermission } from "@/components/RequireAuth";
import { formatBRL } from "@/lib/format";

type Macro = "entrada" | "analise" | "proposta" | "execucao" | "concluida";
type Tab = "pipeline" | "recebidas" | "fontes";
type Fonte = "pncp" | "comprasgov" | "fiemg";

const MACROS: Array<{ id: Macro; label: string; help: string }> = [
  { id: "entrada", label: "Entrada", help: "Recebidas e aguardando decisão" },
  { id: "analise", label: "Análise", help: "Edital, itens, custos e margem" },
  { id: "proposta", label: "Proposta", help: "Proposta, disputa e habilitação" },
  { id: "execucao", label: "Execução", help: "Contrato, entrega e recebimento" },
  { id: "concluida", label: "Concluídas", help: "Encerradas, perdidas ou canceladas" },
];

const STAGE_LABEL: Record<string, string> = {
  nova: "Nova", triagem: "Triagem", analise: "Análise", cotacao: "Cotação", precificacao: "Precificação",
  proposta: "Proposta", enviada: "Enviada", disputa: "Disputa", habilitacao: "Habilitação", vencida: "Vencida",
  perdida: "Perdida", cancelada: "Cancelada", contrato: "Contrato", entrega: "Entrega", faturamento: "Faturamento",
  recebimento: "Recebimento", encerrada: "Encerrada",
};

function deadlineLabel(value: unknown) {
  if (!value) return null;
  const target = new Date(String(value));
  const today = new Date();
  target.setHours(0, 0, 0, 0); today.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { text: `vencido há ${Math.abs(days)}d`, danger: true };
  if (days === 0) return { text: "vence hoje", danger: true };
  if (days <= 3) return { text: `vence em ${days}d`, danger: true };
  return { text: `em ${days}d`, danger: false };
}

export default function Oportunidades() {
  const canEdit = usePermission("editor");
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [tab, setTab] = useState<Tab>(() => params.get("origem") === "cotacoes" ? "recebidas" : params.get("origem") === "fontes" ? "fontes" : "pipeline");
  const [selectedId, setSelectedId] = useState<number | null>(() => { const id = Number(params.get("oportunidade")); return Number.isInteger(id) && id > 0 ? id : null; });
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({ titulo: "", orgao: "", numeroProcesso: "", prazoEnvio: "" });

  useEffect(() => {
    const origem = new URLSearchParams(window.location.search).get("origem");
    if (origem === "cotacoes") setTab("recebidas");
    else if (origem === "fontes") setTab("fontes");
  }, []);

  const list = trpc.opportunities.list.useQuery();
  const summary = trpc.opportunities.summary.useQuery();
  const detail = trpc.opportunities.detail.useQuery({ id: selectedId ?? 0 }, { enabled: selectedId != null });
  const quotations = trpc.emailQuotations.list.useQuery({}, { enabled: tab === "recebidas" });
  const reconcile = trpc.opportunities.reconcile.useMutation({ onSuccess: async (r) => { toast.success(r.updated ? `${r.updated} etapa(s) sincronizada(s).` : "Fluxo já sincronizado."); await Promise.all([utils.opportunities.list.invalidate(), utils.opportunities.summary.invalidate(), utils.agenda.proximos.invalidate()]); }, onError: (e) => toast.error(e.message) });
  const create = trpc.opportunities.create.useMutation({ onSuccess: async ({ id }) => { setNewOpen(false); setForm({ titulo: "", orgao: "", numeroProcesso: "", prazoEnvio: "" }); setSelectedId(id); await Promise.all([utils.opportunities.list.invalidate(), utils.opportunities.summary.invalidate()]); toast.success("Oportunidade criada."); }, onError: (e) => toast.error(e.message) });
  const importQuotation = trpc.opportunities.importQuotation.useMutation({ onSuccess: async ({ id, jaExistia }) => { setSelectedId(id); setTab("pipeline"); await utils.opportunities.list.invalidate(); toast.success(jaExistia ? "Cotação já estava no fluxo." : "Cotação adicionada ao fluxo."); }, onError: (e) => toast.error(e.message) });

  const groups = useMemo(() => {
    const grouped = Object.fromEntries(MACROS.map((m) => [m.id, []])) as Record<Macro, any[]>;
    for (const row of list.data ?? []) grouped[row.macroEtapa as Macro]?.push(row);
    return grouped;
  }, [list.data]);

  const openOpportunity = (id: number) => { setSelectedId(id); const url = new URL(window.location.href); url.searchParams.set("oportunidade", String(id)); url.searchParams.delete("origem"); window.history.replaceState({}, "", url); };
  const closeOpportunity = () => { setSelectedId(null); const url = new URL(window.location.href); url.searchParams.delete("oportunidade"); window.history.replaceState({}, "", url); };

  return <div className="mx-auto max-w-[1500px] space-y-5">
    <section className="rounded-2xl bg-blue-950 p-5 text-white"><div className="flex flex-col gap-4 lg:flex-row lg:items-center"><div><p className="m-0 text-[11px] font-black uppercase tracking-[0.16em] text-blue-200">Fluxo canônico</p><h1 className="mb-1 mt-2 text-2xl font-black">Oportunidades</h1><p className="m-0 max-w-3xl text-sm text-blue-100">Todas as origens entram no mesmo ciclo. Proposta, pedido, entrega e faturamento são reconciliados sem baixa duplicada.</p></div><div className="ml-auto flex flex-wrap gap-2"><Link href={selectedId ? `/assistente?oportunidade=${selectedId}` : "/assistente"} className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-xs font-bold text-white no-underline"><Brain size={15} /> IA operacional</Link>{canEdit && <button onClick={() => reconcile.mutate()} disabled={reconcile.isPending} className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-xs font-bold disabled:opacity-50">{reconcile.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Sincronizar</button>}{canEdit && <button onClick={() => setNewOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-black text-blue-950"><Plus size={14} /> Nova oportunidade</button>}</div></div></section>

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Abertas" value={summary.data?.abertas ?? "—"} /><Metric label="Prazo crítico" value={summary.data?.criticos ?? "—"} danger={(summary.data?.criticos ?? 0) > 0} /><Metric label="Em proposta" value={summary.data?.porMacro.proposta ?? "—"} /><Metric label="Em execução" value={summary.data?.porMacro.execucao ?? "—"} /></section>

    <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3"><TabButton active={tab === "pipeline"} onClick={() => setTab("pipeline")} icon={<Inbox size={15} />} label="Fluxo" /><TabButton active={tab === "recebidas"} onClick={() => setTab("recebidas")} icon={<MailCheck size={15} />} label="Recebidas" /><TabButton active={tab === "fontes"} onClick={() => setTab("fontes")} icon={<Radar size={15} />} label="Buscar fontes" /></div>

    {tab === "pipeline" && (list.isLoading ? <Loading /> : <div className="grid gap-3 xl:grid-cols-5">{MACROS.map((macro) => <section key={macro.id} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-2"><div className="mb-2 px-1 py-1"><div className="flex items-center justify-between"><h2 className="m-0 text-xs font-black uppercase tracking-wide text-slate-700">{macro.label}</h2><span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-slate-500">{groups[macro.id].length}</span></div><p className="mb-0 mt-1 text-[10px] text-slate-400">{macro.help}</p></div><div className="space-y-2">{groups[macro.id].map((row) => <OpportunityCard key={row.id} row={row} onOpen={() => openOpportunity(row.id)} />)}{groups[macro.id].length === 0 && <div className="rounded-lg border border-dashed border-slate-200 bg-white p-5 text-center text-[11px] text-slate-400">Nenhuma</div>}</div></section>)}</div>)}
    {tab === "recebidas" && <ReceivedQuotations rows={quotations.data ?? []} loading={quotations.isLoading} canEdit={canEdit} onImport={(id) => importQuotation.mutate({ quotationId: id })} pendingId={importQuotation.variables?.quotationId} />}
    {tab === "fontes" && <SourceSearch canEdit={canEdit} onOpen={openOpportunity} />}

    {selectedId != null && <OpportunityDrawer data={detail.data} loading={detail.isLoading} opportunityId={selectedId} canEdit={canEdit} onClose={closeOpportunity} onChanged={async () => { await Promise.all([utils.opportunities.list.invalidate(), utils.opportunities.summary.invalidate(), utils.opportunities.detail.invalidate({ id: selectedId }), utils.agenda.proximos.invalidate()]); }} navigate={navigate} />}
    {newOpen && <NewModal form={form} setForm={setForm} onClose={() => setNewOpen(false)} pending={create.isPending} onSave={() => create.mutate({ titulo: form.titulo.trim(), orgao: form.orgao.trim() || undefined, numeroProcesso: form.numeroProcesso.trim() || undefined, prazoEnvio: form.prazoEnvio || undefined })} />}
  </div>;
}

function Metric({ label, value, danger }: { label: string; value: string | number; danger?: boolean }) { return <div className={`rounded-xl border bg-white p-4 ${danger ? "border-red-200" : "border-slate-200"}`}><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className={`mt-1 text-2xl font-black ${danger ? "text-red-700" : "text-slate-950"}`}>{value}</div></div>; }
function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) { return <button onClick={onClick} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${active ? "bg-blue-950 text-white" : "bg-white text-slate-600"}`}>{icon}{label}</button>; }
function OpportunityCard({ row, onOpen }: { row: any; onOpen: () => void }) { const deadline = deadlineLabel(row.prazoEnvio); return <button onClick={onOpen} className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-blue-300"><div className="line-clamp-2 text-xs font-bold text-slate-900">{row.titulo}</div>{row.orgao && <div className="mt-1 truncate text-[10px] text-slate-500">{row.orgao}</div>}<div className="mt-2 flex flex-wrap gap-1.5"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold">{STAGE_LABEL[row.etapa] ?? row.etapa}</span>{deadline && <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${deadline.danger ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>{deadline.text}</span>}</div>{row.proximaAcao && <div className="mt-2 flex items-center gap-1 text-[10px] font-bold text-blue-800">{row.proximaAcao.label}<ArrowRight size={10} /></div>}</button>; }

function ReceivedQuotations({ rows, loading, canEdit, onImport, pendingId }: { rows: any[]; loading: boolean; canEdit: boolean; onImport: (id: number) => void; pendingId?: number }) {
  if (loading) return <Loading />;
  const active = rows.filter((r) => !["respondida", "descartada"].includes(r.status));
  return <div className="rounded-xl border border-slate-200 bg-white"><div className="border-b p-4"><h2 className="m-0 text-sm font-black">Entradas recebidas</h2><p className="mb-0 mt-1 text-xs text-slate-500">E-mail e portais permanecem como fontes; ao aceitar, viram oportunidade canônica.</p></div>{active.length === 0 ? <div className="p-10 text-center text-sm text-slate-400">Nenhuma cotação pendente.</div> : <div className="divide-y">{active.map((r) => <div key={r.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{r.orgao ?? r.subject ?? `Cotação #${r.id}`}</div><div className="mt-1 text-xs text-slate-500">{r.matchedItems}/{r.totalItems} itens · {r.status}</div></div><div className="flex gap-2"><Link href={`/cotacoes-recebidas?cotacao=${r.id}`} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 no-underline">Revisar</Link>{canEdit && <button onClick={() => onImport(r.id)} disabled={pendingId === r.id} className="rounded-lg bg-blue-950 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{pendingId === r.id ? "Importando..." : "Levar ao fluxo"}</button>}</div></div>)}</div>}</div>;
}

function SourceSearch({ canEdit, onOpen }: { canEdit: boolean; onOpen: (id: number) => void }) {
  const [text, setText] = useState(""); const [uf, setUf] = useState(""); const [params, setParams] = useState<{ keywords: string[]; uf?: string; diasAtras: number; fontes: Fonte[] } | null>(null);
  const utils = trpc.useUtils();
  const query = trpc.pncpRadar.buscarOportunidades.useQuery(params ?? { keywords: [], diasAtras: 15, fontes: ["pncp", "comprasgov", "fiemg"] }, { enabled: params != null, retry: false });
  const add = trpc.funil.criarDeRadar.useMutation({ onSuccess: async ({ id, jaExistia }) => { await utils.opportunities.list.invalidate(); toast.success(jaExistia ? "Já estava no fluxo." : "Oportunidade adicionada."); onOpen(id); }, onError: (e) => toast.error(e.message) });
  return <div className="space-y-4"><div className="rounded-xl border bg-white p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-end"><Field label="Palavras-chave"><input value={text} onChange={(e) => setText(e.target.value)} placeholder="medicamento, vacina, material..." className={INPUT} /></Field><Field label="UF"><input value={uf} onChange={(e) => setUf(e.target.value.toUpperCase())} maxLength={2} className={`${INPUT} w-20`} /></Field><button onClick={() => setParams({ keywords: text.split(",").map((x) => x.trim()).filter((x) => x.length >= 2), uf: uf || undefined, diasAtras: 15, fontes: ["pncp", "comprasgov", "fiemg"] })} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-950 px-4 py-2 text-sm font-bold text-white"><Search size={15} /> Buscar</button></div></div>{query.isFetching && <Loading />}{query.data && <div className="space-y-2">{query.data.oportunidades.map((op) => <div key={`${op.source}:${op.sourceId}`} className="rounded-xl border bg-white p-4"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><div className="text-sm font-bold">{op.orgao}</div><div className="mt-1 line-clamp-2 text-xs text-slate-600">{op.objeto}</div><div className="mt-2 text-[10px] text-slate-400">{op.source.toUpperCase()} · {op.modalidade}{op.valorEstimado > 0 ? ` · ${formatBRL(op.valorEstimado)}` : ""}</div></div>{canEdit && <button disabled={add.isPending} onClick={() => add.mutate({ source: op.source as Fonte, sourceId: op.sourceId, orgao: op.orgao, modalidade: op.modalidade, numeroProcesso: op.numeroProcesso, objeto: op.objeto, descricaoDetalhada: op.descricaoDetalhada || undefined, uf: op.uf || undefined, municipio: op.municipio || undefined, dataPublicacao: op.dataPublicacao?.toISOString() ?? null, dataAbertura: op.dataAbertura?.toISOString() ?? null, dataEncerramento: op.dataEncerramento?.toISOString() ?? null, valorEstimado: op.valorEstimado, status: op.status, links: op.links, dedupeKey: op.dedupeKey })} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white">Adicionar</button>}</div></div>)}</div>}</div>;
}

function OpportunityDrawer({ data, loading, opportunityId, canEdit, onClose, onChanged, navigate }: { data: any; loading: boolean; opportunityId: number; canEdit: boolean; onClose: () => void; onChanged: () => Promise<void>; navigate: (to: string) => void }) {
  const [reason, setReason] = useState(""); const [decisionOpen, setDecisionOpen] = useState(false);
  const decide = trpc.opportunities.decide.useMutation({ onSuccess: async () => { setDecisionOpen(false); setReason(""); await onChanged(); toast.success("Decisão registrada."); }, onError: (e) => toast.error(e.message) });
  const createProposal = trpc.opportunities.createProposal.useMutation({ onSuccess: async ({ proposalId }) => { await onChanged(); navigate(`/propostas/${proposalId}`); }, onError: (e) => toast.error(e.message) });
  const move = trpc.opportunities.move.useMutation({ onSuccess: onChanged, onError: (e) => toast.error(e.message) });
  const row = data?.opportunity;
  return <div className="fixed inset-0 z-50 bg-slate-950/50" onClick={onClose}><aside className="absolute inset-y-0 right-0 w-full max-w-2xl overflow-y-auto bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>{loading || !row ? <Loading /> : <div className="p-5"><div className="flex items-start gap-3 border-b pb-4"><div className="min-w-0 flex-1"><div className="text-[10px] font-black uppercase tracking-wider text-blue-700">Oportunidade #{opportunityId} · {row.macroEtapa}</div><h2 className="mt-1 text-xl font-black">{row.titulo}</h2><p className="mt-1 text-xs text-slate-500">{[row.orgao, row.numeroProcesso, STAGE_LABEL[row.etapa]].filter(Boolean).join(" · ")}</p></div><button onClick={onClose} className="rounded-lg p-2 text-slate-400"><X size={18} /></button></div>{row.objeto && <section className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">{row.objeto}</section>}<section className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4"><div className="text-[10px] font-black uppercase tracking-wider text-blue-600">Próxima ação</div><div className="mt-1 text-sm font-black text-blue-950">{row.proximaAcao?.label ?? "Fluxo concluído"}</div><div className="mt-3 flex flex-wrap gap-2"><Link href={`/assistente?oportunidade=${opportunityId}`} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-900 no-underline"><Brain size={13} className="mr-1 inline" />Consultar IA</Link>{canEdit && ["nova", "triagem"].includes(row.etapa) && <button onClick={() => setDecisionOpen(true)} className="rounded-lg bg-blue-950 px-3 py-2 text-xs font-bold text-white">Decidir GO / NO-GO</button>}{canEdit && ["analise", "cotacao", "precificacao"].includes(row.etapa) && <><Link href={`/edital?oportunidade=${opportunityId}`} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-900 no-underline"><FileScan size={13} className="mr-1 inline" />Analisar edital</Link><button onClick={() => createProposal.mutate({ opportunityId })} disabled={createProposal.isPending} className="rounded-lg bg-blue-950 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Criar proposta manual</button></>}{data.proposals?.[0] && <Link href={`/propostas/${data.proposals[0].id}`} className="rounded-lg bg-blue-950 px-3 py-2 text-xs font-bold text-white no-underline">Abrir proposta</Link>}{row.macroEtapa === "execucao" && <Link href="/execucao" className="rounded-lg bg-blue-950 px-3 py-2 text-xs font-bold text-white no-underline">Abrir execução</Link>}{canEdit && row.etapa === "recebimento" && <button onClick={() => move.mutate({ id: opportunityId, paraEtapa: "encerrada", justificativa: "Recebimento confirmado e ciclo encerrado" })} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">Encerrar</button>}</div></section>{decisionOpen && <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Justificativa da decisão" className="min-h-20 w-full rounded-lg border border-amber-200 bg-white p-2 text-sm" /><div className="mt-2 flex gap-2"><button disabled={reason.trim().length < 5 || decide.isPending} onClick={() => decide.mutate({ id: opportunityId, decisao: "go", justificativa: reason })} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><CheckCircle2 size={13} className="mr-1 inline" />GO</button><button disabled={reason.trim().length < 5 || decide.isPending} onClick={() => decide.mutate({ id: opportunityId, decisao: "no_go", justificativa: reason })} className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">NO-GO</button></div></section>}<section className="mt-5 grid gap-3 sm:grid-cols-3"><Mini label="Propostas" value={data.proposals?.length ?? 0} /><Mini label="Pedidos" value={data.orders?.length ?? 0} /><Mini label="Entregas / NFs" value={(data.deliveries?.length ?? 0) + (data.invoices?.length ?? 0)} /></section><section className="mt-5"><h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Histórico</h3><div className="mt-2 space-y-2">{(data.events ?? []).slice(0, 20).map((event: any) => <div key={event.id} className="rounded-lg border p-3"><div className="text-xs font-bold">{STAGE_LABEL[event.deEtapa] ?? event.deEtapa ?? "Entrada"} → {STAGE_LABEL[event.paraEtapa] ?? event.paraEtapa}</div>{event.justificativa && <div className="mt-1 text-[11px] text-slate-500">{event.justificativa}</div>}</div>)}</div></section></div>}</aside></div>;
}

const INPUT = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400";
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block flex-1"><span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span>{children}</label>; }
function Mini({ label, value }: { label: string; value: number }) { return <div className="rounded-lg border p-3"><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-1 text-xl font-black">{value}</div></div>; }
function Loading() { return <div className="flex min-h-40 items-center justify-center text-slate-400"><Loader2 className="animate-spin" size={20} /></div>; }
function NewModal({ form, setForm, onClose, onSave, pending }: { form: any; setForm: (next: any) => void; onClose: () => void; onSave: () => void; pending: boolean }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onClick={onClose}><div className="w-full max-w-lg rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}><div className="flex items-center justify-between"><h3 className="text-base font-black">Nova oportunidade</h3><button onClick={onClose}><X size={17} /></button></div><div className="mt-4 space-y-3"><Field label="Título *"><input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className={INPUT} /></Field><Field label="Órgão"><input value={form.orgao} onChange={(e) => setForm({ ...form, orgao: e.target.value })} className={INPUT} /></Field><div className="grid grid-cols-2 gap-3"><Field label="Processo"><input value={form.numeroProcesso} onChange={(e) => setForm({ ...form, numeroProcesso: e.target.value })} className={INPUT} /></Field><Field label="Prazo"><input type="date" value={form.prazoEnvio} onChange={(e) => setForm({ ...form, prazoEnvio: e.target.value })} className={INPUT} /></Field></div></div><div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="px-3 py-2 text-sm text-slate-500">Cancelar</button><button onClick={onSave} disabled={pending || form.titulo.trim().length < 3} className="rounded-lg bg-blue-950 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Salvar</button></div></div></div>; }
