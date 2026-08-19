import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { usePermission } from "@/components/RequireAuth";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronLeft,
  ExternalLink,
  FileText,
  Filter,
  Globe2,
  KanbanSquare,
  Loader2,
  MailCheck,
  MoreHorizontal,
  PackagePlus,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Store,
  Target,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const PORTAL_SOURCES = ["copasa", "cemig", "fundep", "funarbe", "comprasmg", "fiemg"] as const;
const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  nova: { label: "Nova", className: "bg-blue-50 text-blue-700" },
  processando: { label: "Processando", className: "bg-amber-50 text-amber-700" },
  revisao: { label: "Em revisão", className: "bg-violet-50 text-violet-700" },
  respondida: { label: "Respondida", className: "bg-emerald-50 text-emerald-700" },
  descartada: { label: "Descartada", className: "bg-gray-100 text-gray-600" },
  erro: { label: "Erro", className: "bg-red-50 text-red-700" },
};

function money(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
}
function pct(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? `${(n <= 1 ? n * 100 : n).toFixed(0)}%` : "—";
}
function initialQuotationId() {
  if (typeof window === "undefined") return null;
  const id = Number(new URLSearchParams(window.location.search).get("cotacao"));
  return Number.isInteger(id) && id > 0 ? id : null;
}
function riskUi(risk?: string) {
  if (risk === "red") return { label: "Alto risco", dot: "bg-red-500", badge: "border-red-200 bg-red-50 text-red-700" };
  if (risk === "yellow") return { label: "Revisar", dot: "bg-amber-400", badge: "border-amber-200 bg-amber-50 text-amber-700" };
  return { label: "Seguro", dot: "bg-emerald-500", badge: "border-emerald-200 bg-emerald-50 text-emerald-700" };
}
function freshness(value?: string, days?: number | null) {
  if (value === "fresh") return `Preço atual${days != null ? ` · ${days}d` : ""}`;
  if (value === "attention") return `Preço há ${days ?? "?"} dias`;
  if (value === "stale") return `Desatualizado · ${days ?? "?"} dias`;
  return "Data do preço não confirmada";
}

export default function CotacoesRecebidas() {
  const isAdmin = usePermission("admin");
  const canEdit = usePermission("editor");
  const utils = trpc.useUtils();
  const [selectedId, setSelectedId] = useState<number | null>(initialQuotationId);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("abertas");
  const statusQuery = trpc.emailQuotations.status.useQuery();
  const listQuery = trpc.emailQuotations.list.useQuery({});
  const deadlineQuery = trpc.emailQuotations.prazosProximos.useQuery({ diasAlerta: 3 });
  const detailQuery = trpc.emailQuotations.get.useQuery({ id: selectedId ?? 0 }, { enabled: selectedId != null });
  const sync = trpc.emailQuotations.sync.useMutation({ onSuccess: (r) => { if (!r.imapConfigured) return toast.error("E-mail não configurado."); toast.success(`${r.imported} cotação(ões) importada(s).`); utils.emailQuotations.list.invalidate(); }, onError: (e) => toast.error(e.message) });
  const portals = trpc.portalOpportunitySync.sync.useMutation({ onSuccess: (r) => { toast.success(`${r.imported} oportunidade(s) encontrada(s).`); utils.emailQuotations.list.invalidate(); }, onError: (e) => toast.error(e.message) });

  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return (listQuery.data ?? []).filter((q) => {
      if (statusFilter === "abertas" && ["respondida", "descartada"].includes(q.status)) return false;
      if (!["abertas", "todas"].includes(statusFilter) && q.status !== statusFilter) return false;
      return !term || [q.subject, q.orgao, q.fromName, q.fromAddress].filter(Boolean).some((v) => String(v).toLocaleLowerCase("pt-BR").includes(term));
    });
  }, [listQuery.data, search, statusFilter]);

  const choose = (id: number) => {
    setSelectedId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("cotacao", String(id));
    window.history.replaceState({}, "", url.toString());
  };

  return <div className="mx-auto max-w-[1840px] p-4 lg:p-6">
    <header className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div><div className="flex items-center gap-2"><BrainCircuit className="h-6 w-6 text-blue-600" /><h1 className="text-2xl font-bold tracking-tight text-gray-950">Cotações recebidas</h1></div><p className="mt-1 text-sm text-gray-500">A IA resolve o previsível e concentra sua atenção nas exceções.</p></div>
      {isAdmin && <details className="relative self-start"><summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold"><RefreshCw className="h-4 w-4" /> Atualizar fontes</summary><div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border bg-white p-2 shadow-xl"><button onClick={() => sync.mutate({ limit: 25 })} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50">{sync.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4" />} Sincronizar e-mail</button><button onClick={() => portals.mutate({ sources: [...PORTAL_SOURCES] })} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50">{portals.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe2 className="h-4 w-4" />} Buscar portais</button></div></details>}
    </header>

    {deadlineQuery.data && (deadlineQuery.data.vencidos.length > 0 || deadlineQuery.data.proximos.length > 0) && <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"><AlertCircle className="h-4 w-4" /><strong>{deadlineQuery.data.vencidos.length}</strong> vencida(s) · <strong>{deadlineQuery.data.proximos.length}</strong> vencendo em até 3 dias.</div>}

    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className={`${selectedId ? "hidden lg:block" : "block"} overflow-hidden rounded-xl border border-gray-200 bg-white`}>
        <div className="border-b p-3"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cotação" className="h-10 w-full rounded-lg border pl-9 pr-3 text-sm outline-none" /></div><div className="mt-2 flex gap-1 overflow-auto">{[["abertas", "Abertas"], ["revisao", "Revisão"], ["respondida", "Respondidas"], ["todas", "Todas"]].map(([value, label]) => <button key={value} onClick={() => setStatusFilter(value)} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusFilter === value ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"}`}>{label}</button>)}</div></div>
        <div className="max-h-[72vh] overflow-y-auto">{listQuery.isLoading ? <div className="p-10"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> : rows.map((q) => { const st = STATUS_LABELS[q.status] ?? STATUS_LABELS.nova; return <button key={q.id} onClick={() => choose(q.id)} className={`w-full border-b px-3 py-3 text-left hover:bg-blue-50 ${selectedId === q.id ? "bg-blue-50" : ""}`}><div className="flex justify-between gap-2"><span className="line-clamp-2 text-sm font-semibold">{q.subject || "Cotação sem assunto"}</span><span className={`h-fit rounded-full px-2 py-0.5 text-[10px] font-bold ${st.className}`}>{st.label}</span></div><div className="mt-1 flex justify-between text-xs text-gray-500"><span className="truncate">{q.orgao || q.fromName || q.fromAddress}</span><span>{q.matchedItems}/{q.totalItems}</span></div></button>; })}</div>
      </aside>

      <main className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white">{selectedId == null ? <EmptyState /> : detailQuery.isLoading ? <div className="flex min-h-[560px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div> : detailQuery.data ? <Workspace data={detailQuery.data} canEdit={canEdit} smtp={statusQuery.data?.smtpConfigured === true} onBack={() => setSelectedId(null)} onChanged={() => { utils.emailQuotations.get.invalidate({ id: selectedId }); utils.emailQuotations.list.invalidate(); utils.emailQuotations.pricingPreview.invalidate({ id: selectedId }); utils.quotationDecision.summary.invalidate({ quotationId: selectedId }); }} /> : null}</main>
    </div>
  </div>;
}

function EmptyState() {
  return <div className="flex min-h-[560px] flex-col items-center justify-center px-6 text-center"><BrainCircuit className="mb-3 h-11 w-11 text-gray-300" /><p className="font-semibold">Selecione uma cotação</p><p className="mt-1 max-w-lg text-sm text-gray-400">O S2Licit cruzará memória, fornecedores, custos, margens, validade dos preços e histórico de vitórias.</p></div>;
}

function Workspace({ data, canEdit, smtp, onBack, onChanged }: { data: any; canEdit: boolean; smtp: boolean; onBack: () => void; onChanged: () => void }) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const q = data.quotation;
  const items = data.items as any[];
  const [filter, setFilter] = useState("all");
  const [picker, setPicker] = useState<any | null>(null);
  const [compare, setCompare] = useState<any | null>(null);
  const [create, setCreate] = useState<any | null>(null);
  const [sale, setSale] = useState<Record<number, string>>({});
  const preview = trpc.emailQuotations.pricingPreview.useQuery({ id: q.id });
  const decision = trpc.quotationDecision.summary.useQuery({ quotationId: q.id });
  const previewMap = useMemo(() => new Map((preview.data?.items ?? []).map((x) => [x.quotationItemId, x])), [preview.data]);
  const decisionMap = useMemo(() => new Map((decision.data?.items ?? []).map((x) => [x.itemId, x])), [decision.data]);

  useEffect(() => {
    if (!preview.data) return;
    setSale((current) => { const next = { ...current }; preview.data.items.forEach((x) => { if (next[x.quotationItemId] === undefined && x.unitPrice != null) next[x.quotationItemId] = x.unitPrice.toFixed(2); }); return next; });
  }, [preview.data]);

  const resolve = trpc.quotationDecision.resolve.useMutation({ onSuccess: (r) => { toast.success(`${r.autoResolved} item(ns) resolvido(s) automaticamente; ${r.summary.totals.needsReview} para revisão e ${r.summary.totals.blocked} bloqueado(s).`); onChanged(); }, onError: (e) => toast.error(e.message) });
  const match = trpc.emailQuotations.setItemMatch.useMutation({ onSuccess: () => { toast.success("Match atualizado."); setPicker(null); setCompare(null); onChanged(); }, onError: (e) => toast.error(e.message) });
  const saleMutation = trpc.emailQuotations.setItemSalePrice.useMutation({ onSuccess: onChanged, onError: (e) => toast.error(e.message) });
  const deadline = trpc.emailQuotations.setPrazo.useMutation({ onSuccess: onChanged, onError: (e) => toast.error(e.message) });
  const status = trpc.emailQuotations.setStatus.useMutation({ onSuccess: onChanged, onError: (e) => toast.error(e.message) });
  const proposal = trpc.emailQuotations.gerarOrcamento.useMutation({ onSuccess: (r) => { window.open(r.pdfUrl, "_blank"); toast.success(`Proposta gerada: ${money(r.total)}.`); onChanged(); }, onError: (e) => toast.error(e.message) });
  const email = trpc.emailQuotations.responderPorEmail.useMutation({ onSuccess: (r) => { toast.success(`Enviada para ${r.to}.`); onChanged(); }, onError: (e) => toast.error(e.message) });
  const funnel = trpc.funil.criarDeCotacao.useMutation({ onSuccess: ({ id, jaExistia }) => { toast.success(jaExistia ? "Já estava no Funil." : "Enviada ao Funil."); navigate(`/funil?oportunidade=${id}`); }, onError: (e) => toast.error(e.message) });
  const handoff = trpc.emailQuotations.prepararParaPortal.useMutation({ onSuccess: async (r) => { await utils.proposals.list.invalidate(); navigate(`/agente-proposta?propostaId=${r.proposalId}`); }, onError: (e) => toast.error(e.message) });

  const totals = decision.data?.totals;
  const visible = items.filter((item) => filter === "all" || decisionMap.get(item.id)?.risk === filter);
  const useProduct = (item: any, product: any) => match.mutate({ itemId: item.id, produtoMatchId: Number(product.id), precoSugerido: product.price ?? undefined });
  const saveSale = (id: number) => { const n = Number((sale[id] ?? "").replace(",", ".")); if (!Number.isFinite(n) || n <= 0) return toast.error("Preço de venda inválido."); saleMutation.mutate({ itemId: id, salePrice: n }); };

  return <div>
    <div className="border-b p-4 lg:p-5"><div className="flex flex-col gap-4 xl:flex-row xl:justify-between"><div><button onClick={onBack} className="mb-2 inline-flex items-center gap-1 text-xs lg:hidden"><ChevronLeft className="h-4 w-4" /> Voltar</button><h2 className="text-lg font-bold">{q.subject || "Cotação sem assunto"}</h2><div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-500"><span>{q.orgao || q.fromName}</span><label className="flex items-center gap-1"><span className="text-xs">Prazo:</span><input type="date" defaultValue={q.prazoResposta ? String(q.prazoResposta).slice(0, 10) : ""} onChange={(e) => deadline.mutate({ id: q.id, prazoResposta: e.target.value || null })} disabled={!canEdit} className="rounded border px-2 py-1 text-xs" /></label></div></div><div className="flex flex-wrap gap-2"><button onClick={() => decision.refetch()} className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-bold"><Globe2 className="h-4 w-4" /> Pesquisar todos</button><button onClick={() => resolve.mutate({ quotationId: q.id })} disabled={!canEdit || resolve.isPending} className="inline-flex h-10 items-center gap-2 rounded-lg bg-gray-950 px-4 text-sm font-bold text-white disabled:opacity-40">{resolve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Resolver cotação com IA</button><button onClick={() => proposal.mutate({ id: q.id })} disabled={!canEdit || totals?.canGenerate !== true} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-40"><FileText className="h-4 w-4" /> Gerar proposta</button>{canEdit && <Actions smtp={smtp} portal={String(q.messageId ?? "").startsWith("portal:")} onEmail={() => email.mutate({ id: q.id })} onPortal={() => handoff.mutate({ id: q.id })} onFunnel={() => funnel.mutate({ quotationId: q.id })} onAnswered={() => status.mutate({ id: q.id, status: "respondida" })} onDiscard={() => status.mutate({ id: q.id, status: "descartada" })} />}</div></div></div>

    {totals && <div className="border-b bg-gray-50/70 p-4"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8"><Summary label="Resolvidos" value={`${totals.resolved}/${totals.totalItems}`} tone="green" /><Summary label="Revisar" value={String(totals.needsReview)} tone="yellow" /><Summary label="Bloqueados" value={String(totals.blocked)} tone="red" /><Summary label="Custo" value={money(totals.totalCost)} /><Summary label="Frete" value={money(totals.totalFreight)} /><Summary label="Tributos" value={money(totals.totalTaxes)} /><Summary label="Venda" value={money(totals.totalSale)} /><Summary label="Lucro / margem" value={`${money(totals.totalProfit)} · ${totals.effectiveMarginPercent.toFixed(1)}%`} /></div><div className="mt-3 flex flex-wrap justify-between gap-2"><span className="flex items-center gap-1 text-xs text-gray-500"><ShieldAlert className="h-4 w-4" /> Revisão orientada por risco</span><div className="flex flex-wrap gap-1">{[["all", "Todos"], ["red", `Bloqueados ${totals.blocked}`], ["yellow", `Revisar ${totals.needsReview}`], ["green", `Seguros ${totals.resolved}`]].map(([v, l]) => <button key={v} onClick={() => setFilter(v)} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${filter === v ? "bg-gray-900 text-white" : "border bg-white text-gray-600"}`}>{l}</button>)}</div></div></div>}

    <div className="space-y-3 p-4">{visible.map((item) => <ItemCard key={item.id} item={item} d={decisionMap.get(item.id)} p={previewMap.get(item.id)} canEdit={canEdit} draft={sale[item.id]} setDraft={(v: string) => setSale((s) => ({ ...s, [item.id]: v }))} saveSale={() => saveSale(item.id)} approve={() => item.produtoMatchId && useProduct(item, { id: item.produtoMatchId, price: item.precoSugerido ?? item.productPrice })} useMemory={(m: any) => useProduct(item, { id: m.productId, price: m.lastCost == null ? undefined : String(m.lastCost) })} useSupplier={(s: any) => item.produtoMatchId && useProduct(item, { id: item.produtoMatchId, price: s.effectivePrice == null ? undefined : String(s.effectivePrice) })} onPick={() => setPicker(item)} onCompare={() => setCompare(item)} onCreate={() => setCreate(item)} />)}</div>

    {picker && <ProductPicker item={picker} onClose={() => setPicker(null)} onCreate={() => { setCreate(picker); setPicker(null); }} onUse={(product: any) => useProduct(picker, product)} />}
    {compare && <Compare item={compare} d={decisionMap.get(compare.id)} onClose={() => setCompare(null)} onUse={(product: any) => useProduct(compare, product)} />}
    {create && <QuickCreate item={create} onClose={() => setCreate(null)} onCreated={(product: any) => { useProduct(create, product); setCreate(null); }} />}
  </div>;
}

function Actions({ smtp, portal, onEmail, onPortal, onFunnel, onAnswered, onDiscard }: any) {
  return <details className="relative"><summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg border"><MoreHorizontal className="h-5 w-5" /></summary><div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border bg-white p-2 shadow-xl">{smtp && <button onClick={onEmail} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50">Gerar e enviar por e-mail</button>}{portal && <button onClick={onPortal} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50"><Bot className="h-4 w-4" /> Preencher no portal</button>}<button onClick={onFunnel} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50"><KanbanSquare className="h-4 w-4" /> Enviar ao Funil</button><button onClick={onAnswered} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50">Marcar como respondida</button><button onClick={onDiscard} className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">Descartar</button></div></details>;
}

function ItemCard({ item, d, p, canEdit, draft, setDraft, saveSale, approve, useMemory, useSupplier, onPick, onCompare, onCreate }: any) {
  const risk = riskUi(d?.risk);
  const memory = d?.memory?.[0];
  const supplier = d?.supplierRanking?.[0];
  return <section className="overflow-hidden rounded-xl border bg-white"><div className="flex items-center justify-between border-b px-4 py-2.5"><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${risk.dot}`} /><span className="text-xs font-bold">Item {item.numeroItem ?? item.id}</span><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${risk.badge}`}>{risk.label}</span></div><span className="text-[10px] text-gray-400">{freshness(d?.priceFreshness, d?.priceAgeDays)}</span></div><div className="grid xl:grid-cols-[1fr_1.15fr_1.35fr]">
    <div className="border-b p-4 xl:border-b-0 xl:border-r"><Label>Produto solicitado</Label><div className="mt-2 text-sm font-semibold">{item.descricao}</div><div className="mt-2 flex gap-1 text-[11px] text-gray-500"><span className="rounded bg-gray-100 px-2 py-0.5">{item.quantidade ?? "—"} {item.unidade ?? ""}</span>{item.codigoCatalogo && <span className="rounded bg-gray-100 px-2 py-0.5">Cód. {item.codigoCatalogo}</span>}</div>{d?.riskReasons?.length > 0 && <div className="mt-3 space-y-1">{d.riskReasons.slice(0, 4).map((r: string) => <div key={r} className="flex gap-1 text-[11px] text-gray-600"><AlertCircle className="mt-0.5 h-3 w-3 shrink-0" /> {r}</div>)}</div>}</div>
    <div className="border-b p-4 xl:border-b-0 xl:border-r"><div className="flex justify-between"><Label>Match e memória</Label>{item.matchScore != null && <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold">Confiança {pct(item.matchScore)}</span>}</div>{item.productName ? <div className="mt-2"><div className="font-bold">{item.productName}</div><div className="text-xs text-gray-500">{[item.productManufacturer, item.productConcentration, item.productPresentation].filter(Boolean).join(" · ")}</div><div className="mt-1 text-xs">{item.supplierName || "Fornecedor não informado"}</div><span className={`mt-2 inline-block rounded-full px-2 py-1 text-[10px] font-bold ${item.matchConfirmado ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{item.matchConfirmado ? (item.matchAuto ? "Confirmado automaticamente" : "Match aprovado") : "Aguardando confirmação"}</span></div> : <div className="mt-3 rounded-lg border border-dashed border-red-200 bg-red-50 p-3 text-sm text-red-700">Sem produto confirmado.</div>}{memory && (!item.matchConfirmado || memory.productId !== item.produtoMatchId) && <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3"><div className="flex items-center gap-1 text-[10px] font-bold uppercase text-blue-700"><BrainCircuit className="h-3 w-3" /> Memória operacional</div><div className="mt-1 text-xs font-bold">{memory.productName}</div><div className="text-[10px] text-gray-500">{memory.evidence.join(" · ")} · {pct(memory.confidence)}</div>{canEdit && <button onClick={() => useMemory(memory)} className="mt-2 inline-flex items-center gap-1 rounded bg-blue-600 px-2 py-1.5 text-[11px] font-bold text-white">Usar histórico <ArrowRight className="h-3 w-3" /></button>}</div>}{canEdit && <div className="mt-3 flex flex-wrap gap-1">{item.produtoMatchId && !item.matchConfirmado && <Action onClick={approve} primary><CheckCircle2 className="h-3.5 w-3.5" /> Aprovar</Action>}<Action onClick={onPick}><Search className="h-3.5 w-3.5" /> Trocar</Action><Action onClick={onCompare}><Filter className="h-3.5 w-3.5" /> Comparar</Action><Action onClick={onCreate}><PackagePlus className="h-3.5 w-3.5" /> Criar</Action></div>}</div>
    <div className="p-4"><div className="flex justify-between"><Label>Decisão econômica</Label>{supplier && <span className="rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-bold text-indigo-700">Fornecedor #{supplier.rank} · {supplier.score}</span>}</div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5"><Metric label="Produto" value={money(p?.baseCost)} /><Metric label="Frete" value={money(p?.freightValue)} icon={<Truck className="h-3 w-3" />} /><Metric label="Tributos" value={money(p?.taxValue)} /><Metric label="Custo real" value={money(p?.custoUnitario)} strong /><Metric label="Margem" value={p?.marginPercent != null ? `${Number(p.marginPercent).toFixed(1)}%` : "—"} /></div><div className="mt-3 grid gap-2 md:grid-cols-[160px_1fr]"><label><Label>Preço de venda</Label><div className="mt-1 flex h-10 items-center rounded-lg border px-2"><span className="text-xs text-gray-400">R$</span><input value={draft ?? (p?.unitPrice != null ? Number(p.unitPrice).toFixed(2) : "")} onChange={(e) => setDraft(e.target.value)} onBlur={saveSale} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} disabled={!canEdit} className="w-full px-2 text-right text-sm font-bold outline-none" /></div></label><div className="grid grid-cols-2 gap-2"><div className="rounded-lg border border-emerald-100 bg-emerald-50 p-2"><div className="flex items-center gap-1 text-[9px] font-bold uppercase text-emerald-700"><Target className="h-3 w-3" /> Compra máxima</div><div className="mt-1 text-sm font-extrabold text-emerald-800">{money(d?.maxPurchasePrice)}</div><div className="text-[9px] text-emerald-700">margem mínima {d?.minMarginPercent?.toFixed?.(1) ?? "—"}%</div></div><div className="rounded-lg bg-gray-50 p-2"><Label>Total do item</Label><div className="mt-1 text-sm font-extrabold">{money(p?.totalPrice)}</div></div></div></div>{supplier && <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="flex items-center gap-1 text-[10px] font-bold uppercase text-indigo-700"><Store className="h-3.5 w-3.5" /> Melhor fornecedor</div><div className="mt-1 text-xs font-bold">{supplier.supplierName || "Fornecedor"} · custo {money(supplier.landedCost)}</div><div className="text-[10px] text-gray-500">{supplier.winCount} vitória(s) · {freshness(supplier.freshness, supplier.daysOld)} · {supplier.availability || "estoque não informado"}</div></div><div className="flex gap-1">{supplier.link && <a href={supplier.link} target="_blank" rel="noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded border"><ExternalLink className="h-3.5 w-3.5" /></a>}{canEdit && supplier.effectivePrice != null && <button onClick={() => useSupplier(supplier)} className="rounded bg-indigo-600 px-2.5 py-1.5 text-[11px] font-bold text-white">Usar custo</button>}</div></div></div>}</div>
  </div></section>;
}

function ProductPicker({ item, onClose, onCreate, onUse }: any) {
  const [query, setQuery] = useState(item.productName || item.descricao.slice(0, 80));
  const products = trpc.products.list.useQuery({ search: query.trim(), searchField: "all", isActive: "yes", limit: 50, sortBy: "price", sortDir: "asc" });
  const productRows = products.data?.items ?? [];
  return <Modal title="Trocar produto" subtitle={item.descricao} onClose={onClose}><div className="p-4"><div className="flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} className="h-11 w-full rounded-lg border pl-9 pr-3 text-sm" /></div><button onClick={onCreate} className="rounded-lg border px-3 text-sm font-bold"><PackagePlus className="mr-1 inline h-4 w-4" /> Criar</button></div><div className="mt-4 max-h-[60vh] overflow-auto rounded-xl border">{productRows.map((product) => <button key={product.id} onClick={() => onUse(product)} className="flex w-full justify-between gap-3 border-b p-3 text-left hover:bg-blue-50"><div><div className="text-sm font-bold">{product.name}</div><div className="text-xs text-gray-500">{[product.manufacturer, product.concentration, product.presentation, product.supplierName].filter(Boolean).join(" · ")}</div></div><div className="text-right"><div className="text-sm font-bold">{money(product.price)}</div><div className="text-[10px] text-blue-700">Selecionar</div></div></button>)}</div></div></Modal>;
}

function Compare({ item, d, onClose, onUse }: any) {
  const eq = trpc.products.suggestEquivalentsByFichaTecnica.useQuery({ productId: item.produtoMatchId ?? 0, limit: 20, onlyWithPrice: true }, { enabled: item.produtoMatchId != null });
  const rows = useMemo(() => {
    const output: any[] = [];
    if (item.produtoMatchId && item.productName) output.push({ id: item.produtoMatchId, name: item.productName, price: item.precoSugerido ?? item.productPrice, source: "Atual", confidence: Number(item.matchScore), supplierName: item.supplierName });
    (d?.memory ?? []).forEach((m: any) => output.push({ id: m.productId, name: m.productName, price: m.lastCost, source: `Memória · ${m.approvals} uso(s) · ${m.wins} vitória(s)`, confidence: m.confidence, supplierName: m.supplierName }));
    ((eq.data as any)?.equivalents ?? []).forEach((e: any) => output.push({ id: e.id, name: e.name, price: e.price, source: `Equivalente técnico · ${e.status ?? "revisão"}`, confidence: Number(e.score) > 1 ? Number(e.score) / 100 : Number(e.score), supplierName: e.supplierName }));
    return output.filter((r, i, a) => a.findIndex((x) => x.id === r.id) === i).sort((a, b) => Number(b.confidence ?? 0) - Number(a.confidence ?? 0));
  }, [item, d, eq.data]);
  return <Modal title="Comparar alternativas" subtitle={item.descricao} onClose={onClose} wide><div className="overflow-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-gray-50 text-left text-[10px] uppercase text-gray-500"><tr><th className="p-3">Produto</th><th>Fonte</th><th>Fornecedor</th><th className="text-right">Confiança</th><th className="text-right">Custo</th><th /></tr></thead><tbody>{rows.map((r, i) => <tr key={r.id} className="border-t"><td className="p-3 font-bold">#{i + 1} {r.name}</td><td className="text-xs">{r.source}</td><td className="text-xs">{r.supplierName || "—"}</td><td className="text-right">{pct(r.confidence)}</td><td className="text-right font-bold">{money(r.price)}</td><td className="p-3 text-right"><button onClick={() => onUse(r)} className="rounded bg-blue-600 px-2 py-1 text-xs font-bold text-white">Usar</button></td></tr>)}</tbody></table></div></Modal>;
}

function QuickCreate({ item, onClose, onCreated }: any) {
  const suppliers = trpc.suppliers.list.useQuery({ activeOnly: true });
  const categories = trpc.categories.list.useQuery();
  const [form, setForm] = useState({ name: item.descricao.slice(0, 300), supplierId: "", categoryId: "", price: "" });
  const create = trpc.products.create.useMutation({ onSuccess: (r: any) => { const id = Number(r?.insertId); if (!id) return toast.error("Produto criado sem ID retornado."); onCreated({ id, price: form.price || null }); }, onError: (e) => toast.error(e.message) });
  const field = "h-10 w-full rounded-lg border px-3 text-sm";
  return <Modal title="Criar produto" subtitle="Será vinculado imediatamente à cotação." onClose={onClose}><form onSubmit={(e) => { e.preventDefault(); const supplierId = Number(form.supplierId); const categoryId = Number(form.categoryId); if (!supplierId || !categoryId) return toast.error("Selecione fornecedor e categoria."); create.mutate({ name: form.name, supplierId, categoryId, price: form.price || null, unit: item.unidade || null, isActive: "yes" }); }} className="grid gap-3 p-4 md:grid-cols-2"><label className="md:col-span-2"><Label>Nome</Label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} /></label><label><Label>Fornecedor</Label><select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} className={field}><option value="">Selecione</option>{(suppliers.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label><Label>Categoria</Label><select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className={field}><option value="">Selecione</option>{(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label><Label>Custo de aquisição</Label><input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={field} /></label><div className="md:col-span-2 flex justify-end gap-2 border-t pt-3"><button type="button" onClick={onClose} className="rounded border px-4 py-2 text-sm font-bold">Cancelar</button><button type="submit" className="inline-flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm font-bold text-white">{create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Criar e vincular</button></div></form></Modal>;
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: string }) {
  const cls = tone === "green" ? "border-emerald-100 bg-emerald-50" : tone === "yellow" ? "border-amber-100 bg-amber-50" : tone === "red" ? "border-red-100 bg-red-50" : "bg-white";
  return <div className={`rounded-lg border px-3 py-2 ${cls}`}><Label>{label}</Label><div className="mt-0.5 text-sm font-bold">{value}</div></div>;
}
function Metric({ label, value, icon, strong }: { label: string; value: string; icon?: React.ReactNode; strong?: boolean }) { return <div className="rounded-lg bg-gray-50 px-2.5 py-2"><div className="flex items-center gap-1"><Label>{icon}{label}</Label></div><div className={`mt-1 text-sm font-bold ${strong ? "text-blue-700" : ""}`}>{value}</div></div>; }
function Label({ children }: { children: React.ReactNode }) { return <span className="text-[9px] font-bold uppercase tracking-wide text-gray-500">{children}</span>; }
function Action({ children, onClick, primary }: { children: React.ReactNode; onClick: () => void; primary?: boolean }) { return <button onClick={onClick} className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-bold ${primary ? "bg-emerald-600 text-white" : "border text-gray-700"}`}>{children}</button>; }
function Modal({ title, subtitle, onClose, children, wide }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className={`max-h-[90vh] w-full overflow-hidden rounded-2xl bg-white shadow-2xl ${wide ? "max-w-6xl" : "max-w-4xl"}`}><div className="flex justify-between border-b p-4"><div><h3 className="font-bold">{title}</h3>{subtitle && <p className="mt-0.5 line-clamp-2 text-sm text-gray-500">{subtitle}</p>}</div><button onClick={onClose}><X className="h-5 w-5" /></button></div><div className="max-h-[78vh] overflow-auto">{children}</div></div></div>; }
