import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { usePermission } from "@/components/RequireAuth";
import {
  AlertCircle,
  Bot,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronLeft,
  FileText,
  Gauge,
  Globe2,
  KanbanSquare,
  LayoutList,
  Loader2,
  MailCheck,
  MoreHorizontal,
  PackagePlus,
  RefreshCw,
  Rows3,
  Search,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const PORTAL_SOURCES = ["copasa", "cemig", "fundep", "funarbe", "comprasmg", "fiemg"] as const;
const STATUS: Record<string, { label: string; cls: string }> = {
  nova: { label: "Nova", cls: "bg-blue-50 text-blue-700" },
  processando: { label: "Processando", cls: "bg-amber-50 text-amber-700" },
  revisao: { label: "Em revisão", cls: "bg-violet-50 text-violet-700" },
  respondida: { label: "Respondida", cls: "bg-emerald-50 text-emerald-700" },
  descartada: { label: "Descartada", cls: "bg-gray-100 text-gray-600" },
  erro: { label: "Erro", cls: "bg-red-50 text-red-700" },
};

const money = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
};
const pct = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? `${(n <= 1 ? n * 100 : n).toFixed(0)}%` : "—";
};
const freshLabel = (state?: string, days?: number | null) => state === "fresh" ? `Atual · ${days ?? 0}d` : state === "attention" ? `${days ?? "?"}d` : state === "stale" ? `Vencido · ${days ?? "?"}d` : "Sem data";
const initialId = () => {
  if (typeof window === "undefined") return null;
  const id = Number(new URLSearchParams(window.location.search).get("cotacao"));
  return Number.isInteger(id) && id > 0 ? id : null;
};
const risk = (value?: string) => value === "red"
  ? { label: "Alto risco", dot: "bg-red-500", cls: "border-red-200 bg-red-50 text-red-700" }
  : value === "yellow"
    ? { label: "Revisar", dot: "bg-amber-400", cls: "border-amber-200 bg-amber-50 text-amber-700" }
    : { label: "Seguro", dot: "bg-emerald-500", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" };

export default function CotacoesRecebidas() {
  const isAdmin = usePermission("admin");
  const canEdit = usePermission("editor");
  const utils = trpc.useUtils();
  const [selectedId, setSelectedId] = useState<number | null>(initialId);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("abertas");
  const list = trpc.emailQuotations.list.useQuery({});
  const emailStatus = trpc.emailQuotations.status.useQuery();
  const deadlines = trpc.emailQuotations.prazosProximos.useQuery({ diasAlerta: 3 });
  const intelligence = trpc.quotationDecision.commercialIntelligence.useQuery();
  const detail = trpc.emailQuotations.get.useQuery({ id: selectedId ?? 0 }, { enabled: selectedId != null });
  const sync = trpc.emailQuotations.sync.useMutation({ onSuccess: (r) => { toast.success(`${r.imported} cotação(ões) importada(s).`); utils.emailQuotations.list.invalidate(); }, onError: (e) => toast.error(e.message) });
  const portals = trpc.portalOpportunitySync.sync.useMutation({ onSuccess: (r) => { toast.success(`${r.imported} oportunidade(s) encontrada(s).`); utils.emailQuotations.list.invalidate(); }, onError: (e) => toast.error(e.message) });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (list.data ?? []).filter((q) => {
      if (status === "abertas" && ["respondida", "descartada"].includes(q.status)) return false;
      if (!["abertas", "todas"].includes(status) && q.status !== status) return false;
      return !term || [q.subject, q.orgao, q.fromName, q.fromAddress].filter(Boolean).some((v) => String(v).toLowerCase().includes(term));
    });
  }, [list.data, search, status]);

  const choose = (id: number) => {
    setSelectedId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("cotacao", String(id));
    window.history.replaceState({}, "", url.toString());
  };

  return <div className="mx-auto max-w-[1840px] p-4 lg:p-6">
    <header className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div><div className="flex items-center gap-2"><BrainCircuit className="h-6 w-6 text-blue-600" /><h1 className="text-2xl font-bold">Cotações recebidas</h1></div><p className="mt-1 text-sm text-gray-500">Decisão por exceção, aprendizado contínuo e proteção comercial.</p></div>
      {isAdmin && <details className="relative"><summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold"><RefreshCw className="h-4 w-4" /> Atualizar fontes</summary><div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border bg-white p-2 shadow-xl"><button onClick={() => sync.mutate({ limit: 25 })} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50"><MailCheck className="h-4 w-4" /> E-mail</button><button onClick={() => portals.mutate({ sources: [...PORTAL_SOURCES] })} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50"><Globe2 className="h-4 w-4" /> Portais</button></div></details>}
    </header>

    <IntelligencePanel data={intelligence.data} loading={intelligence.isLoading} />
    {deadlines.data && (deadlines.data.vencidos.length > 0 || deadlines.data.proximos.length > 0) && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"><strong>{deadlines.data.vencidos.length}</strong> vencida(s) · <strong>{deadlines.data.proximos.length}</strong> vencendo em até 3 dias.</div>}

    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className={`${selectedId ? "hidden lg:block" : "block"} overflow-hidden rounded-xl border bg-white`}>
        <div className="border-b p-3"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cotação" className="h-10 w-full rounded-lg border pl-9 pr-3 text-sm" /></div><div className="mt-2 flex gap-1 overflow-auto">{[["abertas", "Abertas"], ["revisao", "Revisão"], ["respondida", "Respondidas"], ["todas", "Todas"]].map(([value, label]) => <button key={value} onClick={() => setStatus(value)} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${status === value ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"}`}>{label}</button>)}</div></div>
        <div className="max-h-[72vh] overflow-y-auto">{list.isLoading ? <Loader2 className="mx-auto my-10 h-5 w-5 animate-spin" /> : rows.map((q) => { const st = STATUS[q.status] ?? STATUS.nova; return <button key={q.id} onClick={() => choose(q.id)} className={`w-full border-b px-3 py-3 text-left hover:bg-blue-50 ${selectedId === q.id ? "bg-blue-50" : ""}`}><div className="flex justify-between gap-2"><span className="line-clamp-2 text-sm font-semibold">{q.subject || "Cotação sem assunto"}</span><span className={`h-fit rounded-full px-2 py-0.5 text-[10px] font-bold ${st.cls}`}>{st.label}</span></div><div className="mt-1 flex justify-between text-xs text-gray-500"><span className="truncate">{q.orgao || q.fromName || q.fromAddress}</span><span>{q.matchedItems}/{q.totalItems}</span></div></button>; })}</div>
      </aside>
      <main className="min-w-0 overflow-hidden rounded-xl border bg-white">{selectedId == null ? <Empty /> : detail.isLoading ? <div className="flex min-h-[560px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div> : detail.data ? <Workspace data={detail.data} canEdit={canEdit} smtp={emailStatus.data?.smtpConfigured === true} onBack={() => setSelectedId(null)} onChanged={() => { utils.emailQuotations.get.invalidate({ id: selectedId }); utils.emailQuotations.list.invalidate(); utils.emailQuotations.pricingPreview.invalidate({ id: selectedId }); utils.quotationDecision.summary.invalidate({ quotationId: selectedId }); utils.quotationDecision.protection.invalidate({ quotationId: selectedId }); utils.quotationDecision.commercialIntelligence.invalidate(); }} /> : null}</main>
    </div>
  </div>;
}

function IntelligencePanel({ data, loading }: { data: any; loading: boolean }) {
  return <details className="mb-4 rounded-xl border bg-white"><summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3"><span className="flex items-center gap-2 text-sm font-bold"><TrendingUp className="h-4 w-4 text-blue-600" /> Inteligência comercial</span>{loading && <Loader2 className="h-4 w-4 animate-spin" />}</summary>{data && <div className="border-t bg-gray-50/50 p-4"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><Summary label="Decididas" value={String(data.overview.decided)} /><Summary label="Win rate" value={`${data.overview.winRate.toFixed(1)}%`} tone="green" /><Summary label="Margem média" value={`${data.overview.avgMargin.toFixed(1)}%`} /><Summary label="Gap nas perdas" value={data.overview.avgLossGap == null ? "—" : `${data.overview.avgLossGap.toFixed(1)}%`} /></div><div className="mt-3 grid gap-3 lg:grid-cols-3"><Rank title="Produtos mais vencedores" rows={data.topProducts} /><Rank title="Fornecedores mais vencedores" rows={data.topSuppliers} /><div className="rounded-lg border bg-white p-3"><Label>Preços prioritários</Label><div className="mt-2 space-y-2">{(data.priorityPriceUpdates ?? []).slice(0, 5).map((r: any) => <div key={r.productId} className="flex justify-between gap-2 text-xs"><span className="truncate font-semibold">{r.name}</span><span className="shrink-0 text-gray-500">{r.wins} vit. · {freshLabel(r.freshness, r.daysOld)}</span></div>)}</div></div></div></div>}</details>;
}

function Rank({ title, rows = [] }: { title: string; rows?: any[] }) {
  return <div className="rounded-lg border bg-white p-3"><Label>{title}</Label><div className="mt-2 space-y-2">{rows.slice(0, 5).map((r: any, i: number) => <div key={r.id} className="flex justify-between gap-2 text-xs"><span className="truncate"><strong>#{i + 1}</strong> {r.name}</span><span className="shrink-0 text-gray-500">{r.wins} vit. · {r.winRate.toFixed(0)}%</span></div>)}</div></div>;
}

function Empty() { return <div className="flex min-h-[560px] flex-col items-center justify-center text-center"><BrainCircuit className="mb-3 h-10 w-10 text-gray-300" /><strong>Selecione uma cotação</strong><span className="mt-1 text-sm text-gray-400">A análise combina custo, fornecedor, histórico, risco e feedback.</span></div>; }

function Workspace({ data, canEdit, smtp, onBack, onChanged }: any) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const q = data.quotation;
  const items = data.items as any[];
  const [filter, setFilter] = useState("all");
  const [compact, setCompact] = useState(items.length >= 25);
  const [selected, setSelected] = useState<number[]>([]);
  const [picker, setPicker] = useState<any | null>(null);
  const [create, setCreate] = useState<any | null>(null);
  const [sale, setSale] = useState<Record<number, string>>({});
  const [autoRefreshed, setAutoRefreshed] = useState<number | null>(null);
  const preview = trpc.emailQuotations.pricingPreview.useQuery({ id: q.id });
  const decision = trpc.quotationDecision.summary.useQuery({ quotationId: q.id });
  const protection = trpc.quotationDecision.protection.useQuery({ quotationId: q.id });
  const pMap = useMemo(() => new Map((preview.data?.items ?? []).map((x) => [x.quotationItemId, x])), [preview.data]);
  const dMap = useMemo(() => new Map((decision.data?.items ?? []).map((x) => [x.itemId, x])), [decision.data]);

  const resolve = trpc.quotationDecision.resolve.useMutation({ onSuccess: (r) => { toast.success(`${r.autoResolved} resolvido(s); ${r.summary.totals.needsReview} para revisão.`); onChanged(); }, onError: (e) => toast.error(e.message) });
  const refresh = trpc.quotationDecision.refreshPrices.useMutation({ onSuccess: (r) => { if (r.initiated) toast.success(`${r.initiated} fonte(s) atualizando preços.`); }, onError: (e) => toast.error(e.message) });
  const bulk = trpc.quotationDecision.bulkAction.useMutation({ onSuccess: (r) => { toast.success(`${r.affected} registro(s) afetado(s).`); onChanged(); }, onError: (e) => toast.error(e.message) });
  const feedback = trpc.quotationDecision.feedback.useMutation();
  const match = trpc.emailQuotations.setItemMatch.useMutation({ onSuccess: () => { setPicker(null); onChanged(); }, onError: (e) => toast.error(e.message) });
  const salePrice = trpc.emailQuotations.setItemSalePrice.useMutation({ onSuccess: onChanged, onError: (e) => toast.error(e.message) });
  const deadline = trpc.emailQuotations.setPrazo.useMutation({ onSuccess: onChanged, onError: (e) => toast.error(e.message) });
  const status = trpc.emailQuotations.setStatus.useMutation({ onSuccess: onChanged, onError: (e) => toast.error(e.message) });
  const proposal = trpc.emailQuotations.gerarOrcamento.useMutation({ onSuccess: (r) => { window.open(r.pdfUrl, "_blank"); toast.success(`Proposta gerada: ${money(r.total)}.`); onChanged(); }, onError: (e) => toast.error(e.message) });
  const email = trpc.emailQuotations.responderPorEmail.useMutation({ onSuccess: (r) => toast.success(`Enviada para ${r.to}.`), onError: (e) => toast.error(e.message) });
  const funnel = trpc.funil.criarDeCotacao.useMutation({ onSuccess: ({ id }) => navigate(`/funil?oportunidade=${id}`), onError: (e) => toast.error(e.message) });
  const portal = trpc.emailQuotations.prepararParaPortal.useMutation({ onSuccess: async (r) => { await utils.proposals.list.invalidate(); navigate(`/agente-proposta?propostaId=${r.proposalId}`); }, onError: (e) => toast.error(e.message) });

  useEffect(() => { setCompact(items.length >= 25); setSelected([]); }, [q.id]);
  useEffect(() => { if (!preview.data) return; setSale((old) => { const next = { ...old }; preview.data.items.forEach((x) => { if (next[x.quotationItemId] === undefined && x.unitPrice != null) next[x.quotationItemId] = x.unitPrice.toFixed(2); }); return next; }); }, [preview.data]);
  useEffect(() => {
    if (!canEdit || !decision.data || autoRefreshed === q.id || refresh.isPending) return;
    setAutoRefreshed(q.id);
    if (decision.data.items.some((i) => ["stale", "unknown"].includes(i.priceFreshness))) refresh.mutate({ quotationId: q.id });
  }, [canEdit, decision.data, autoRefreshed, q.id]);

  const totals = decision.data?.totals;
  const visible = items.filter((item) => filter === "all" || dMap.get(item.id)?.risk === filter);
  const targetIds = selected.length ? selected : visible.map((item) => item.id);
  const log = (input: any) => feedback.mutate({ quotationId: q.id, ...input });
  const chooseProduct = (item: any, product: any, kind: "product_selected" | "match_approved" = "product_selected") => {
    log({ itemId: item.id, kind, productId: Number(product.id), supplierId: product.supplierId ?? null, previousProductId: item.produtoMatchId ?? null, previousSupplierId: item.productSupplierId ?? null });
    match.mutate({ itemId: item.id, produtoMatchId: Number(product.id), precoSugerido: product.price ?? undefined });
  };
  const saveSale = (item: any) => {
    const value = Number((sale[item.id] ?? "").replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) return toast.error("Preço de venda inválido.");
    log({ itemId: item.id, kind: "sale_adjusted", value });
    salePrice.mutate({ itemId: item.id, salePrice: value });
  };
  const applyMargin = () => {
    const raw = window.prompt("Margem para os itens selecionados (%)", String(preview.data?.defaultMarginPercent ?? 15));
    if (raw == null) return;
    const value = Number(raw.replace(",", "."));
    if (!Number.isFinite(value) || value < 0 || value >= 100) return toast.error("Margem inválida.");
    bulk.mutate({ quotationId: q.id, itemIds: targetIds, action: "apply_margin", value });
  };

  return <div>
    <div className="border-b p-4"><div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between"><div><button onClick={onBack} className="mb-2 inline-flex items-center gap-1 text-xs lg:hidden"><ChevronLeft className="h-4 w-4" /> Voltar</button><h2 className="text-lg font-bold">{q.subject || "Cotação"}</h2><div className="mt-1 flex gap-3 text-sm text-gray-500"><span>{q.orgao || q.fromName}</span><input type="date" defaultValue={q.prazoResposta ? String(q.prazoResposta).slice(0, 10) : ""} onChange={(e) => deadline.mutate({ id: q.id, prazoResposta: e.target.value || null })} disabled={!canEdit} className="rounded border px-2 text-xs" /></div></div><div className="flex flex-wrap gap-2"><Button onClick={() => decision.refetch()}><Globe2 className="h-4 w-4" /> Pesquisar</Button><Button onClick={() => refresh.mutate({ quotationId: q.id })} disabled={!canEdit}><RefreshCw className="h-4 w-4" /> Atualizar preços</Button><Button dark onClick={() => resolve.mutate({ quotationId: q.id })} disabled={!canEdit}><Sparkles className="h-4 w-4" /> Resolver com IA</Button><button onClick={() => proposal.mutate({ id: q.id })} disabled={!canEdit || totals?.canGenerate !== true || protection.data?.canProceed === false} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-40"><FileText className="h-4 w-4" /> Gerar proposta</button>{canEdit && <Actions smtp={smtp} portal={String(q.messageId ?? "").startsWith("portal:")} onEmail={() => email.mutate({ id: q.id })} onPortal={() => portal.mutate({ id: q.id })} onFunnel={() => funnel.mutate({ quotationId: q.id })} onAnswered={() => status.mutate({ id: q.id, status: "respondida" })} onDiscard={() => status.mutate({ id: q.id, status: "descartada" })} />}</div></div></div>

    {protection.data?.alerts?.length > 0 && <div className={`border-b p-3 ${protection.data.red ? "bg-red-50" : "bg-amber-50"}`}><div className="flex gap-2"><ShieldAlert className="h-4 w-4 shrink-0" /><div><strong className="text-sm">Proteção comercial: {protection.data.red} crítico(s), {protection.data.yellow} atenção</strong>{protection.data.alerts.slice(0, 4).map((a: any, i: number) => <div key={`${a.code}-${i}`} className="text-xs text-gray-700">{a.message}</div>)}{protection.data.predictedWinningValue != null && <div className="mt-1 text-[11px] text-gray-500">Mediana vencedora do órgão: {money(protection.data.predictedWinningValue)}</div>}</div></div></div>}

    {totals && <div className="border-b bg-gray-50 p-3"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8"><Summary label="Resolvidos" value={`${totals.resolved}/${totals.totalItems}`} tone="green" /><Summary label="Revisar" value={String(totals.needsReview)} tone="yellow" /><Summary label="Bloqueados" value={String(totals.blocked)} tone="red" /><Summary label="Custo" value={money(totals.totalCost)} /><Summary label="Frete" value={money(totals.totalFreight)} /><Summary label="Tributos" value={money(totals.totalTaxes)} /><Summary label="Venda" value={money(totals.totalSale)} /><Summary label="Lucro/margem" value={`${money(totals.totalProfit)} · ${totals.effectiveMarginPercent.toFixed(1)}%`} /></div><div className="mt-2 flex flex-wrap justify-between gap-2"><div className="flex gap-1">{[["all", "Todos"], ["red", "Críticos"], ["yellow", "Revisar"], ["green", "Seguros"]].map(([v, label]) => <button key={v} onClick={() => setFilter(v)} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${filter === v ? "bg-gray-900 text-white" : "border bg-white"}`}>{label}</button>)}</div><button onClick={() => setCompact((v) => !v)} className="inline-flex items-center gap-1 rounded-full border bg-white px-2.5 py-1 text-[11px] font-bold">{compact ? <LayoutList className="h-3 w-3" /> : <Rows3 className="h-3 w-3" />}{compact ? "Cartões" : "Modo rápido"}</button></div></div>}

    {compact && canEdit && <div className="flex flex-wrap items-center gap-2 border-b p-3"><span className="text-xs text-gray-500">{selected.length ? `${selected.length} selecionado(s)` : "Ação sobre itens visíveis"}</span><Button small onClick={() => bulk.mutate({ quotationId: q.id, itemIds: targetIds, action: "approve_safe" })}>Aprovar seguros</Button><Button small onClick={() => bulk.mutate({ quotationId: q.id, itemIds: targetIds, action: "use_best_supplier" })}>Melhor fornecedor</Button><Button small onClick={applyMargin}>Aplicar margem</Button><Button small onClick={() => bulk.mutate({ quotationId: q.id, itemIds: targetIds, action: "refresh_prices" })}>Atualizar custos</Button></div>}

    {compact ? <FastTable items={visible} dMap={dMap} pMap={pMap} selected={selected} setSelected={setSelected} /> : <div className="space-y-3 p-4">{visible.map((item) => <ItemCard key={item.id} item={item} d={dMap.get(item.id)} p={pMap.get(item.id)} canEdit={canEdit} draft={sale[item.id]} setDraft={(value: string) => setSale((old) => ({ ...old, [item.id]: value }))} save={() => saveSale(item)} approve={() => chooseProduct(item, { id: item.produtoMatchId, price: item.precoSugerido ?? item.productPrice, supplierId: item.productSupplierId }, "match_approved")} useMemory={(m: any) => chooseProduct(item, { id: m.productId, price: m.lastCost, supplierId: m.supplierId })} rejectMemory={(m: any) => log({ itemId: item.id, kind: "product_rejected", productId: m.productId, supplierId: m.supplierId })} useSupplier={(s: any) => { log({ itemId: item.id, kind: "supplier_selected", productId: item.produtoMatchId, supplierId: s.supplierId, previousSupplierId: item.productSupplierId, value: s.effectivePrice }); match.mutate({ itemId: item.id, produtoMatchId: item.produtoMatchId, precoSugerido: String(s.effectivePrice) }); }} rejectSupplier={(s: any) => log({ itemId: item.id, kind: "supplier_rejected", productId: item.produtoMatchId, supplierId: s.supplierId })} onPick={() => setPicker(item)} onCreate={() => setCreate(item)} />)}</div>}

    {picker && <ProductPicker item={picker} onClose={() => setPicker(null)} onUse={(product: any) => chooseProduct(picker, product)} />}
    {create && <QuickCreate item={create} onClose={() => setCreate(null)} onCreated={(product: any) => { chooseProduct(create, product); setCreate(null); }} />}
  </div>;
}

function FastTable({ items, dMap, pMap, selected, setSelected }: any) {
  const all = items.length > 0 && selected.length === items.length;
  const toggle = (id: number) => setSelected((old: number[]) => old.includes(id) ? old.filter((x) => x !== id) : [...old, id]);
  return <div className="overflow-auto"><table className="w-full min-w-[1050px] text-sm"><thead className="bg-gray-50 text-left text-[10px] uppercase text-gray-500"><tr><th className="p-2"><input type="checkbox" checked={all} onChange={() => setSelected(all ? [] : items.map((x: any) => x.id))} /></th><th>Risco</th><th>Solicitado</th><th>Match</th><th>Fornecedor</th><th className="text-right">Custo</th><th className="text-right">Venda</th><th className="text-right">Margem</th><th>Preço</th></tr></thead><tbody>{items.map((item: any) => { const d = dMap.get(item.id); const p = pMap.get(item.id); const r = risk(d?.risk); return <tr key={item.id} className="border-t"><td className="p-2"><input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /></td><td><span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${r.cls}`}>{r.label}</span></td><td className="max-w-[280px] p-2 text-xs font-semibold">{item.descricao}</td><td className="max-w-[220px] p-2 text-xs">{item.productName || "Sem match"}</td><td className="p-2 text-xs">{d?.supplierRanking?.[0]?.supplierName || item.supplierName || "—"}</td><td className="p-2 text-right font-bold">{money(p?.custoUnitario)}</td><td className="p-2 text-right font-bold">{money(p?.unitPrice)}</td><td className="p-2 text-right">{p?.marginPercent == null ? "—" : `${Number(p.marginPercent).toFixed(1)}%`}</td><td className="p-2 text-xs text-gray-500">{freshLabel(d?.priceFreshness, d?.priceAgeDays)}</td></tr>; })}</tbody></table></div>;
}

function ItemCard({ item, d, p, canEdit, draft, setDraft, save, approve, useMemory, rejectMemory, useSupplier, rejectSupplier, onPick, onCreate }: any) {
  const r = risk(d?.risk);
  const memory = d?.memory?.[0];
  const score = trpc.quotationDecision.supplierScore.useQuery({ productId: item.produtoMatchId ?? 1 }, { enabled: item.produtoMatchId != null });
  const supplier = score.data?.[0] ?? d?.supplierRanking?.[0];
  return <section className="rounded-xl border"><div className="flex justify-between border-b px-4 py-2"><span className="flex items-center gap-2 text-xs font-bold"><span className={`h-2.5 w-2.5 rounded-full ${r.dot}`} /> Item {item.numeroItem ?? item.id}<span className={`rounded-full border px-2 py-0.5 text-[10px] ${r.cls}`}>{r.label}</span></span><span className="text-[10px] text-gray-400">{freshLabel(d?.priceFreshness, d?.priceAgeDays)}</span></div><div className="grid xl:grid-cols-[1fr_1.1fr_1.35fr]"><div className="border-b p-4 xl:border-b-0 xl:border-r"><Label>Solicitado</Label><div className="mt-2 text-sm font-semibold">{item.descricao}</div>{d?.riskReasons?.slice(0, 3).map((reason: string) => <div key={reason} className="mt-1 flex gap-1 text-[11px] text-gray-600"><AlertCircle className="h-3 w-3" />{reason}</div>)}</div><div className="border-b p-4 xl:border-b-0 xl:border-r"><Label>Match e aprendizado</Label><div className="mt-2 font-bold">{item.productName || "Sem produto"}</div><div className="text-xs text-gray-500">{item.supplierName || "Fornecedor não informado"} · confiança {pct(item.matchScore)}</div>{memory && memory.productId !== item.produtoMatchId && <div className="mt-3 rounded-lg bg-blue-50 p-2 text-xs"><strong>Memória:</strong> {memory.productName} · {pct(memory.confidence)}{canEdit && <div className="mt-2 flex gap-1"><Button small onClick={() => useMemory(memory)}>Usar</Button><Button small onClick={() => rejectMemory(memory)}>Não sugerir</Button></div>}</div>}{canEdit && <div className="mt-3 flex gap-1">{item.produtoMatchId && !item.matchConfirmado && <Button small dark onClick={approve}><CheckCircle2 className="h-3 w-3" /> Aprovar</Button>}<Button small onClick={onPick}><Search className="h-3 w-3" /> Trocar</Button><Button small onClick={onCreate}><PackagePlus className="h-3 w-3" /> Criar</Button></div>}</div><div className="p-4"><div className="flex justify-between"><Label>Decisão econômica</Label>{supplier && <span className="rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-bold text-indigo-700">Score {supplier.finalScore ?? supplier.score}/100</span>}</div><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5"><Metric label="Produto" value={money(p?.baseCost)} /><Metric label="Frete" value={money(p?.freightValue)} icon={<Truck className="h-3 w-3" />} /><Metric label="Tributos" value={money(p?.taxValue)} /><Metric label="Custo" value={money(p?.custoUnitario)} strong /><Metric label="Margem" value={p?.marginPercent == null ? "—" : `${Number(p.marginPercent).toFixed(1)}%`} /></div><div className="mt-3 grid gap-2 sm:grid-cols-[150px_1fr]"><label><Label>Venda</Label><input value={draft ?? (p?.unitPrice != null ? Number(p.unitPrice).toFixed(2) : "")} onChange={(e) => setDraft(e.target.value)} onBlur={save} disabled={!canEdit} className="mt-1 h-10 w-full rounded-lg border px-3 text-right font-bold" /></label><div className="grid grid-cols-2 gap-2"><div className="rounded-lg bg-emerald-50 p-2"><span className="flex items-center gap-1 text-[9px] font-bold uppercase text-emerald-700"><Target className="h-3 w-3" /> Compra máxima</span><strong className="mt-1 block text-sm text-emerald-800">{money(d?.maxPurchasePrice)}</strong></div><div className="rounded-lg bg-gray-50 p-2"><Label>Total</Label><strong className="mt-1 block text-sm">{money(p?.totalPrice)}</strong></div></div></div>{supplier && <div className="mt-3 rounded-lg bg-indigo-50 p-2 text-xs"><div className="flex items-center gap-1 font-bold text-indigo-700"><Gauge className="h-3.5 w-3.5" /> {supplier.supplierName || "Fornecedor"}</div><div className="text-gray-600">custo {money(supplier.landedCost)} · win {supplier.winRate ?? "—"}% · confiabilidade {supplier.reliability ?? "—"}</div>{canEdit && <div className="mt-2 flex gap-1"><Button small onClick={() => useSupplier(supplier)}>Usar fornecedor</Button><Button small onClick={() => rejectSupplier(supplier)}>Rejeitar</Button></div>}</div>}</div></div></section>;
}

function ProductPicker({ item, onClose, onUse }: any) {
  const [query, setQuery] = useState(item.productName || item.descricao.slice(0, 80));
  const products = trpc.products.list.useQuery({ search: query, searchField: "all", isActive: "yes", limit: 50, sortBy: "price", sortDir: "asc" });
  return <Modal title="Trocar produto" onClose={onClose}><div className="p-3"><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} className="h-10 w-full rounded-lg border px-3 text-sm" /><div className="mt-3 max-h-[60vh] space-y-2 overflow-auto">{(products.data?.items ?? []).map((product: any) => <button key={product.id} onClick={() => onUse(product)} className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left hover:bg-blue-50"><span><strong className="block text-sm">{product.name}</strong><span className="text-xs text-gray-500">{product.supplierName || "—"} · {product.manufacturer || "—"}</span></span><strong>{money(product.price)}</strong></button>)}</div></div></Modal>;
}

function QuickCreate({ item, onClose, onCreated }: any) {
  const suppliers = trpc.suppliers.list.useQuery({ activeOnly: true });
  const categories = trpc.categories.list.useQuery();
  const [form, setForm] = useState({ name: item.descricao.slice(0, 300), supplierId: "", categoryId: "", price: "" });
  const create = trpc.products.create.useMutation({ onSuccess: (r: any) => { const id = Number(r?.insertId); if (!id) return toast.error("Produto criado sem ID."); onCreated({ id, price: form.price || null, supplierId: Number(form.supplierId) }); }, onError: (e) => toast.error(e.message) });
  return <Modal title="Criar produto" onClose={onClose}><form onSubmit={(e) => { e.preventDefault(); const supplierId = Number(form.supplierId); const categoryId = Number(form.categoryId); if (!supplierId || !categoryId) return toast.error("Selecione fornecedor e categoria."); create.mutate({ name: form.name, supplierId, categoryId, price: form.price || null, unit: item.unidade || null, isActive: "yes" }); }} className="grid gap-3 p-4 sm:grid-cols-2"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-10 rounded-lg border px-3 sm:col-span-2" /><select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} className="h-10 rounded-lg border px-3"><option value="">Fornecedor</option>{(suppliers.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="h-10 rounded-lg border px-3"><option value="">Categoria</option>{(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Custo" className="h-10 rounded-lg border px-3" /><button type="submit" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 font-bold text-white"><Check className="h-4 w-4" /> Criar e vincular</button></form></Modal>;
}

function Actions({ smtp, portal, onEmail, onPortal, onFunnel, onAnswered, onDiscard }: any) { return <details className="relative"><summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg border"><MoreHorizontal className="h-5 w-5" /></summary><div className="absolute right-0 z-30 mt-2 w-60 rounded-xl border bg-white p-2 shadow-xl">{smtp && <button onClick={onEmail} className="w-full rounded p-2 text-left text-sm hover:bg-gray-50">Enviar por e-mail</button>}{portal && <button onClick={onPortal} className="flex w-full items-center gap-2 rounded p-2 text-sm hover:bg-gray-50"><Bot className="h-4 w-4" /> Preencher portal</button>}<button onClick={onFunnel} className="flex w-full items-center gap-2 rounded p-2 text-sm hover:bg-gray-50"><KanbanSquare className="h-4 w-4" /> Funil</button><button onClick={onAnswered} className="w-full rounded p-2 text-left text-sm hover:bg-gray-50">Marcar respondida</button><button onClick={onDiscard} className="w-full rounded p-2 text-left text-sm text-red-600 hover:bg-red-50">Descartar</button></div></details>; }
function Summary({ label, value, tone }: { label: string; value: string; tone?: string }) { const cls = tone === "green" ? "bg-emerald-50 border-emerald-100" : tone === "yellow" ? "bg-amber-50 border-amber-100" : tone === "red" ? "bg-red-50 border-red-100" : "bg-white"; return <div className={`rounded-lg border px-3 py-2 ${cls}`}><Label>{label}</Label><div className="mt-0.5 text-sm font-bold">{value}</div></div>; }
function Metric({ label, value, icon, strong }: { label: string; value: string; icon?: React.ReactNode; strong?: boolean }) { return <div className="rounded-lg bg-gray-50 p-2"><Label>{icon}{label}</Label><div className={`mt-1 text-sm font-bold ${strong ? "text-blue-700" : ""}`}>{value}</div></div>; }
function Label({ children }: { children: React.ReactNode }) { return <span className="text-[9px] font-bold uppercase tracking-wide text-gray-500">{children}</span>; }
function Button({ children, onClick, dark, small, disabled }: { children: React.ReactNode; onClick: () => void; dark?: boolean; small?: boolean; disabled?: boolean }) { return <button onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center gap-1 rounded-lg border font-bold disabled:opacity-40 ${small ? "px-2.5 py-1.5 text-xs" : "h-10 px-3 text-sm"} ${dark ? "border-gray-900 bg-gray-900 text-white" : "bg-white"}`}>{children}</button>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b p-4"><strong>{title}</strong><button onClick={onClose}><X className="h-5 w-5" /></button></div>{children}</div></div>; }
