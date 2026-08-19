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
  Store,
  Target,
  TrendingUp,
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
  const intelligence = trpc.quotationDecision.commercialIntelligence.useQuery();
  const detailQuery = trpc.emailQuotations.get.useQuery({ id: selectedId ?? 0 }, { enabled: selectedId != null });
  const sync = trpc.emailQuotations.sync.useMutation({
    onSuccess: (r) => {
      if (!r.imapConfigured) return toast.error("E-mail não configurado.");
      toast.success(`${r.imported} cotação(ões) importada(s).`);
      utils.emailQuotations.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const portals = trpc.portalOpportunitySync.sync.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.imported} oportunidade(s) encontrada(s).`);
      utils.emailQuotations.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

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
      <div>
        <div className="flex items-center gap-2"><BrainCircuit className="h-6 w-6 text-blue-600" /><h1 className="text-2xl font-bold tracking-tight text-gray-950">Cotações recebidas</h1></div>
        <p className="mt-1 text-sm text-gray-500">A IA resolve o previsível, aprende com suas escolhas e concentra sua atenção nas exceções.</p>
      </div>
      {isAdmin && <details className="relative self-start"><summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold"><RefreshCw className="h-4 w-4" /> Atualizar fontes</summary><div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border bg-white p-2 shadow-xl"><button onClick={() => sync.mutate({ limit: 25 })} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50">{sync.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4" />} Sincronizar e-mail</button><button onClick={() => portals.mutate({ sources: [...PORTAL_SOURCES] })} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50">{portals.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe2 className="h-4 w-4" />} Buscar portais</button></div></details>}
    </header>

    <CommercialIntelligence data={intelligence.data} loading={intelligence.isLoading} />

    {deadlineQuery.data && (deadlineQuery.data.vencidos.length > 0 || deadlineQuery.data.proximos.length > 0) && <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"><AlertCircle className="h-4 w-4" /><strong>{deadlineQuery.data.vencidos.length}</strong> vencida(s) · <strong>{deadlineQuery.data.proximos.length}</strong> vencendo em até 3 dias.</div>}

    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className={`${selectedId ? "hidden lg:block" : "block"} overflow-hidden rounded-xl border border-gray-200 bg-white`}>
        <div className="border-b p-3"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cotação" className="h-10 w-full rounded-lg border pl-9 pr-3 text-sm outline-none" /></div><div className="mt-2 flex gap-1 overflow-auto">{[["abertas", "Abertas"], ["revisao", "Revisão"], ["respondida", "Respondidas"], ["todas", "Todas"]].map(([value, label]) => <button key={value} onClick={() => setStatusFilter(value)} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusFilter === value ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"}`}>{label}</button>)}</div></div>
        <div className="max-h-[72vh] overflow-y-auto">{listQuery.isLoading ? <div className="p-10"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> : rows.map((q) => { const st = STATUS_LABELS[q.status] ?? STATUS_LABELS.nova; return <button key={q.id} onClick={() => choose(q.id)} className={`w-full border-b px-3 py-3 text-left hover:bg-blue-50 ${selectedId === q.id ? "bg-blue-50" : ""}`}><div className="flex justify-between gap-2"><span className="line-clamp-2 text-sm font-semibold">{q.subject || "Cotação sem assunto"}</span><span className={`h-fit rounded-full px-2 py-0.5 text-[10px] font-bold ${st.className}`}>{st.label}</span></div><div className="mt-1 flex justify-between text-xs text-gray-500"><span className="truncate">{q.orgao || q.fromName || q.fromAddress}</span><span>{q.matchedItems}/{q.totalItems}</span></div></button>; })}</div>
      </aside>

      <main className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white">{selectedId == null ? <EmptyState /> : detailQuery.isLoading ? <div className="flex min-h-[560px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div> : detailQuery.data ? <Workspace data={detailQuery.data} canEdit={canEdit} smtp={statusQuery.data?.smtpConfigured === true} onBack={() => setSelectedId(null)} onChanged={() => { utils.emailQuotations.get.invalidate({ id: selectedId }); utils.emailQuotations.list.invalidate(); utils.emailQuotations.pricingPreview.invalidate({ id: selectedId }); utils.quotationDecision.summary.invalidate({ quotationId: selectedId }); utils.quotationDecision.protection.invalidate({ quotationId: selectedId }); utils.quotationDecision.commercialIntelligence.invalidate(); }} /> : null}</main>
    </div>
  </div>;
}

function CommercialIntelligence({ data, loading }: { data: any; loading: boolean }) {
  return <details className="mb-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3"><div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-blue-600" /><span className="text-sm font-bold">Inteligência comercial</span><span className="text-xs text-gray-400">vitórias, margens e prioridades de preço</span></div>{loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}</summary>
    {data && <div className="border-t bg-gray-50/50 p-4"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><Summary label="Cotações decididas" value={String(data.overview.decided)} /><Summary label="Taxa de vitória" value={`${data.overview.winRate.toFixed(1)}%`} tone="green" /><Summary label="Margem média" value={`${data.overview.avgMargin.toFixed(1)}%`} /><Summary label="Gap médio nas perdas" value={data.overview.avgLossGap == null ? "—" : `${data.overview.avgLossGap.toFixed(1)}%`} tone={data.overview.avgLossGap != null && data.overview.avgLossGap > 5 ? "yellow" : undefined} /></div><div className="mt-4 grid gap-3 xl:grid-cols-3"><MiniRanking title="Produtos com melhor histórico" rows={(data.topProducts ?? []).slice(0, 5)} /><MiniRanking title="Fornecedores mais competitivos" rows={(data.topSuppliers ?? []).slice(0, 5)} /><div className="rounded-lg border bg-white p-3"><Label>Preços que merecem atualização</Label><div className="mt-2 space-y-2">{(data.priorityPriceUpdates ?? []).slice(0, 5).map((r: any) => <div key={r.productId} className="flex items-center justify-between gap-2 text-xs"><span className="truncate font-semibold">{r.name}</span><span className="shrink-0 text-gray-500">{r.wins} vit. · {freshness(r.freshness, r.daysOld)}</span></div>)}{(data.priorityPriceUpdates ?? []).length === 0 && <div className="text-xs text-gray-400">Nenhum preço prioritário pendente.</div>}</div></div></div></div>}
  </details>;
}

function MiniRanking({ title, rows }: { title: string; rows: any[] }) {
  return <div className="rounded-lg border bg-white p-3"><Label>{title}</Label><div className="mt-2 space-y-2">{rows.map((r, i) => <div key={r.id} className="flex items-center justify-between gap-2 text-xs"><span className="truncate"><strong>#{i + 1}</strong> {r.name}</span><span className="shrink-0 text-gray-500">{r.wins} vit. · {r.winRate.toFixed(0)}%</span></div>)}{rows.length === 0 && <div className="text-xs text-gray-400">Sem histórico suficiente.</div>}</div></div>;
}

function EmptyState() {
  return <div className="flex min-h-[560px] flex-col items-center justify-center px-6 text-center"><BrainCircuit className="mb-3 h-11 w-11 text-gray-300" /><p className="font-semibold">Selecione uma cotação</p><p className="mt-1 max-w-lg text-sm text-gray-400">O S2Licit cruzará memória, fornecedores, custos, margens, validade dos preços, feedback e histórico de vitórias.</p></div>;
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
  const [compact, setCompact] = useState(items.length >= 25);
  const [selected, setSelected] = useState<number[]>([]);
  const [autoRefreshQuotationId, setAutoRefreshQuotationId] = useState<number | null>(null);
  const preview = trpc.emailQuotations.pricingPreview.useQuery({ id: q.id });
  const decision = trpc.quotationDecision.summary.useQuery({ quotationId: q.id });
  const protection = trpc.quotationDecision.protection.useQuery({ quotationId: q.id });
  const previewMap = useMemo(() => new Map((preview.data?.items ?? []).map((x) => [x.quotationItemId, x])), [preview.data]);
  const decisionMap = useMemo(() => new Map((decision.data?.items ?? []).map((x) => [x.itemId, x])), [decision.data]);

  useEffect(() => {
    setCompact(items.length >= 25);
    setSelected([]);
  }, [q.id]);

  useEffect(() => {
    if (!preview.data) return;
    setSale((current) => { const next = { ...current }; preview.data.items.forEach((x) => { if (next[x.quotationItemId] === undefined && x.unitPrice != null) next[x.quotationItemId] = x.unitPrice.toFixed(2); }); return next; });
  }, [preview.data]);

  const resolve = trpc.quotationDecision.resolve.useMutation({ onSuccess: (r) => { toast.success(`${r.autoResolved} item(ns) resolvido(s) automaticamente; ${r.summary.totals.needsReview} para revisão e ${r.summary.totals.blocked} bloqueado(s).`); onChanged(); }, onError: (e) => toast.error(e.message) });
  const refreshPrices = trpc.quotationDecision.refreshPrices.useMutation({ onSuccess: (r) => { if (r.initiated > 0) toast.success(`${r.initiated} fonte(s) autorizada(s) atualizando preços vencidos.`); }, onError: (e) => toast.error(e.message) });
  const bulk = trpc.quotationDecision.bulkAction.useMutation({ onSuccess: (r) => { toast.success(`${r.affected} registro(s) afetado(s).`); onChanged(); }, onError: (e) => toast.error(e.message) });
  const feedback = trpc.quotationDecision.feedback.useMutation();
  const match = trpc.emailQuotations.setItemMatch.useMutation({ onSuccess: () => { toast.success("Match atualizado."); setPicker(null); setCompare(null); onChanged(); }, onError: (e) => toast.error(e.message) });
  const saleMutation = trpc.emailQuotations.setItemSalePrice.useMutation({ onSuccess: onChanged, onError: (e) => toast.error(e.message) });
  const deadline = trpc.emailQuotations.setPrazo.useMutation({ onSuccess: onChanged, onError: (e) => toast.error(e.message) });
  const status = trpc.emailQuotations.setStatus.useMutation({ onSuccess: onChanged, onError: (e) => toast.error(e.message) });
  const proposal = trpc.emailQuotations.gerarOrcamento.useMutation({ onSuccess: (r) => { window.open(r.pdfUrl, "_blank"); toast.success(`Proposta gerada: ${money(r.total)}.`); onChanged(); }, onError: (e) => toast.error(e.message) });
  const email = trpc.emailQuotations.responderPorEmail.useMutation({ onSuccess: (r) => { toast.success(`Enviada para ${r.to}.`); onChanged(); }, onError: (e) => toast.error(e.message) });
  const funnel = trpc.funil.criarDeCotacao.useMutation({ onSuccess: ({ id, jaExistia }) => { toast.success(jaExistia ? "Já estava no Funil." : "Enviada ao Funil."); navigate(`/funil?oportunidade=${id}`); }, onError: (e) => toast.error(e.message) });
  const handoff = trpc.emailQuotations.prepararParaPortal.useMutation({ onSuccess: async (r) => { await utils.proposals.list.invalidate(); navigate(`/agente-proposta?propostaId=${r.proposalId}`); }, onError: (e) => toast.error(e.message) });

  useEffect(() => {
    if (!canEdit || !decision.data || autoRefreshQuotationId === q.id || refreshPrices.isPending) return;
    const stale = decision.data.items.some((i) => i.priceFreshness === "stale" || i.priceFreshness === "unknown");
    setAutoRefreshQuotationId(q.id);
    if (stale) refreshPrices.mutate({ quotationId: q.id });
  }, [canEdit, decision.data, q.id, autoRefreshQuotationId]);

  const totals = decision.data?.totals;
  const visible = items.filter((item) => filter === "all" || decisionMap.get(item.id)?.risk === filter);
  const chosenIds = selected.length > 0 ? selected : visible.map((i) => i.id);
  const toggleSelected = (id: number) => setSelected((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  const toggleAll = () => setSelected(selected.length === visible.length ? [] : visible.map((i) => i.id));

  const logFeedback = (payload: any) => feedback.mutate({ quotationId: q.id, ...payload });
  const useProduct = (item: any, product: any, kind: "product_selected" | "match_approved" = "product_selected") => {
    logFeedback({ itemId: item.id, kind, productId: Number(product.id), supplierId: product.supplierId ?? null, previousProductId: item.produtoMatchId ?? null, previousSupplierId: item.productSupplierId ?? null });
    match.mutate({ itemId: item.id, produtoMatchId: Number(product.id), precoSugerido: product.price ?? undefined });
  };
  const useSupplier = (item: any, supplier: any) => {
    logFeedback({ itemId: item.id, kind: "supplier_selected", productId: item.produtoMatchId, supplierId: supplier.supplierId, previousSupplierId: item.productSupplierId ?? null, value: supplier.effectivePrice ?? null });
    if (item.produtoMatchId) match.mutate({ itemId: item.id, produtoMatchId: item.produtoMatchId, precoSugerido: supplier.effectivePrice == null ? undefined : String(supplier.effectivePrice) });
  };
  const saveSale = (id: number) => {
    const n = Number((sale[id] ?? "").replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return toast.error("Preço de venda inválido.");
    logFeedback({ itemId: id, kind: "sale_adjusted", value: n });
    saleMutation.mutate({ itemId: id, salePrice: n });
  };
  const applyMargin = () => {
    const suggested = preview.data?.defaultMarginPercent ?? 15;
    const raw = window.prompt("Margem de venda para os itens selecionados (%)", String(suggested));
    if (raw == null) return;
    const value = Number(raw.replace(",", "."));
    if (!Number.isFinite(value) || value < 0 || value >= 100) return toast.error("Margem inválida.");
    bulk.mutate({ quotationId: q.id, itemIds: chosenIds, action: "apply_margin", value });
  };

  return <div>
    <div className="border-b p-4 lg:p-5"><div className="flex flex-col gap-4 xl:flex-row xl:justify-between"><div><button onClick={onBack} className="mb-2 inline-flex items-center gap-1 text-xs lg:hidden"><ChevronLeft className="h-4 w-4" /> Voltar</button><h2 className="text-lg font-bold">{q.subject || "Cotação sem assunto"}</h2><div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-500"><span>{q.orgao || q.fromName}</span><label className="flex items-center gap-1"><span className="text-xs">Prazo:</span><input type="date" defaultValue={q.prazoResposta ? String(q.prazoResposta).slice(0, 10) : ""} onChange={(e) => deadline.mutate({ id: q.id, prazoResposta: e.target.value || null })} disabled={!canEdit} className="rounded border px-2 py-1 text-xs" /></label></div></div><div className="flex flex-wrap gap-2"><button onClick={() => decision.refetch()} className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-bold"><Globe2 className="h-4 w-4" /> Pesquisar todos</button><button onClick={() => refreshPrices.mutate({ quotationId: q.id })} disabled={!canEdit || refreshPrices.isPending} className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-bold disabled:opacity-40">{refreshPrices.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Atualizar preços</button><button onClick={() => resolve.mutate({ quotationId: q.id })} disabled={!canEdit || resolve.isPending} className="inline-flex h-10 items-center gap-2 rounded-lg bg-gray-950 px-4 text-sm font-bold text-white disabled:opacity-40">{resolve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Resolver cotação com IA</button><button onClick={() => proposal.mutate({ id: q.id })} disabled={!canEdit || totals?.canGenerate !== true || protection.data?.canProceed === false} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-40"><FileText className="h-4 w-4" /> Gerar proposta</button>{canEdit && <Actions smtp={smtp} portal={String(q.messageId ?? "").startsWith("portal:")} onEmail={() => email.mutate({ id: q.id })} onPortal={() => handoff.mutate({ id: q.id })} onFunnel={() => funnel.mutate({ quotationId: q.id })} onAnswered={() => status.mutate({ id: q.id, status: "respondida" })} onDiscard={() => status.mutate({ id: q.id, status: "descartada" })} />}</div></div></div>

    {protection.data && protection.data.alerts.length > 0 && <div className={`border-b px-4 py-3 ${protection.data.red > 0 ? "bg-red-50" : protection.data.yellow > 0 ? "bg-amber-50" : "bg-blue-50"}`}><div className="flex items-start gap-2"><ShieldAlert className={`mt-0.5 h-4 w-4 shrink-0 ${protection.data.red > 0 ? "text-red-600" : "text-amber-600"}`} /><div><div className="text-sm font-bold">Proteção comercial: {protection.data.red} crítico(s), {protection.data.yellow} atenção</div><div className="mt-1 space-y-0.5 text-xs text-gray-700">{protection.data.alerts.slice(0, 5).map((a: any, i: number) => <div key={`${a.code}-${i}`}>{a.message}</div>)}</div>{protection.data.predictedWinningValue != null && <div className="mt-1 text-[11px] text-gray-500">Referência histórica do órgão: {money(protection.data.predictedWinningValue)} · {protection.data.historicalSamples} amostra(s).</div>}</div></div></div>}

    {totals && <div className="border-b bg-gray-50/70 p-4"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8"><Summary label="Resolvidos" value={`${totals.resolved}/${totals.totalItems}`} tone="green" /><Summary label="Revisar" value={String(totals.needsReview)} tone="yellow" /><Summary label="Bloqueados" value={String(totals.blocked)} tone="red" /><Summary label="Custo" value={money(totals.totalCost)} /><Summary label="Frete" value={money(totals.totalFreight)} /><Summary label="Tributos" value={money(totals.totalTaxes)} /><Summary label="Venda" value={money(totals.totalSale)} /><Summary label="Lucro / margem" value={`${money(totals.totalProfit)} · ${totals.effectiveMarginPercent.toFixed(1)}%`} /></div><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-1 text-xs text-gray-500"><ShieldAlert className="h-4 w-4" /> Revisão orientada por risco</span><div className="flex flex-wrap gap-1">{[["all", "Todos"], ["red", `Bloqueados ${totals.blocked}`], ["yellow", `Revisar ${totals.needsReview}`], ["green", `Seguros ${totals.resolved}`]].map(([v, l]) => <button key={v} onClick={() => setFilter(v)} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${filter === v ? "bg-gray-900 text-white" : "border bg-white text-gray-600"}`}>{l}</button>)}<button onClick={() => setCompact((v) => !v)} className="ml-1 inline-flex items-center gap-1 rounded-full border bg-white px-2.5 py-1 text-[11px] font-bold text-gray-600">{compact ? <LayoutList className="h-3 w-3" /> : <Rows3 className="h-3 w-3" />}{compact ? "Cartões" : "Modo rápido"}</button></div></div></div>}

    {compact && canEdit && <div className="flex flex-wrap items-center gap-2 border-b bg-white px-4 py-3"><span className="text-xs font-semibold text-gray-500">{selected.length ? `${selected.length} selecionado(s)` : "Nenhum selecionado: ações afetam os itens visíveis"}</span><button onClick={() => bulk.mutate({ quotationId: q.id, itemIds: chosenIds, action: "approve_safe" })} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Aprovar seguros</button><button onClick={() => bulk.mutate({ quotationId: q.id, itemIds: chosenIds, action: "use_best_supplier" })} className="rounded-lg border px-3 py-2 text-xs font-bold">Usar melhores fornecedores</button><button onClick={applyMargin} className="rounded-lg border px-3 py-2 text-xs font-bold">Aplicar margem</button><button onClick={() => bulk.mutate({ quotationId: q.id, itemIds: chosenIds, action: "refresh_prices" })} className="rounded-lg border px-3 py-2 text-xs font-bold">Atualizar custos</button></div>}

    {compact ? <FastTable items={visible} decisionMap={decisionMap} previewMap={previewMap} selected={selected} toggleSelected={toggleSelected} toggleAll={toggleAll} onOpen={(item) => setCompare(item)} /> : <div className="space-y-3 p-4">{visible.map((item) => <ItemCard key={item.id} item={item} d={decisionMap.get(item.id)} p={previewMap.get(item.id)} canEdit={canEdit} draft={sale[item.id]} setDraft={(v: string) => setSale((s) => ({ ...s, [item.id]: v }))} saveSale={() => saveSale(item.id)} approve={() => item.produtoMatchId && useProduct(item, { id: item.produtoMatchId, price: item.precoSugerido ?? item.productPrice, supplierId: item.productSupplierId }, "match_approved")} useMemory={(m: any) => useProduct(item, { id: m.productId, price: m.lastCost == null ? undefined : String(m.lastCost), supplierId: m.supplierId })} rejectMemory={(m: any) => logFeedback({ itemId: item.id, kind: "product_rejected", productId: m.productId, supplierId: m.supplierId })} useSupplier={(s: any) => useSupplier(item, s)} rejectSupplier={(s: any) => logFeedback({ itemId: item.id, kind: "supplier_rejected", productId: item.produtoMatchId, supplierId: s.supplierId })} onPick={() => setPicker(item)} onCompare={() => setCompare(item)} onCreate={() => setCreate(item)} />)}</div>}

    {picker && <ProductPicker item={picker} onClose={() => setPicker(null)} onCreate={() => { setCreate(picker); setPicker(null); }} onUse={(product: any) => useProduct(picker, product)} />}
    {compare && <Compare item={compare} d={decisionMap.get(compare.id)} onClose={() => setCompare(null)} onUse={(product: any) => useProduct(compare, product)} />}
    {create && <QuickCreate item={create} onClose={() => setCreate(null)} onCreated={(product: any) => { useProduct(create, product); setCreate(null); }} />}
  </div>;
}

function FastTable({ items, decisionMap, previewMap, selected, toggleSelected, toggleAll, onOpen }: any) {
  return <div className="overflow-auto"><table className="w-full min-w-[1180px] text-sm"><thead className="sticky top-0 bg-gray-50 text-left text-[10px] font-bold uppercase text-gray-500"><tr><th className="px-3 py-2"><input type="checkbox" checked={items.length > 0 && selected.length === items.length} onChange={toggleAll} /></th><th>Risco</th><th>Solicitado</th><th>Match</th><th>Fornecedor</th><th className="text-right">Custo</th><th className="text-right">Venda</th><th className="text-right">Margem</th><th>Preço</th><th className="px-3 py-2" /></tr></thead><tbody>{items.map((item: any) => { const d = decisionMap.get(item.id); const p = previewMap.get(item.id); const risk = riskUi(d?.risk); const supplier = d?.supplierRanking?.[0]; return <tr key={item.id} className="border-t hover:bg-blue-50/30"><td className="px-3 py-2"><input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggleSelected(item.id)} /></td><td><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold ${risk.badge}`}><span className={`h-2 w-2 rounded-full ${risk.dot}`} />{risk.label}</span></td><td className="max-w-[300px] px-2 py-2"><div className="line-clamp-2 text-xs font-semibold">{item.descricao}</div></td><td className="max-w-[260px] px-2 py-2"><div className="line-clamp-2 text-xs font-semibold">{item.productName || "Sem match"}</div></td><td className="px-2 py-2 text-xs">{supplier?.supplierName || item.supplierName || "—"}</td><td className="px-2 py-2 text-right font-bold">{money(p?.custoUnitario)}</td><td className="px-2 py-2 text-right font-bold">{money(p?.unitPrice)}</td><td className="px-2 py-2 text-right">{p?.marginPercent == null ? "—" : `${Number(p.marginPercent).toFixed(1)}%`}</td><td className="px-2 py-2 text-xs text-gray-500">{freshness(d?.priceFreshness, d?.priceAgeDays)}</td><td className="px-3 py-2 text-right"><button onClick={() => onOpen(item)} className="rounded border px-2 py-1 text-xs font-bold">Revisar</button></td></tr>; })}</tbody></table></div>;
}

function Actions({ smtp, portal, onEmail, onPortal, onFunnel, onAnswered, onDiscard }: any) {
  return <details className="relative"><summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg border"><MoreHorizontal className="h-5 w-5" /></summary><div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border bg-white p-2 shadow-xl">{smtp && <button onClick={onEmail} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50">Gerar e enviar por e-mail</button>}{portal && <button onClick={onPortal} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50"><Bot className="h-4 w-4" /> Preencher no portal</button>}<button onClick={onFunnel} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50"><KanbanSquare className="h-4 w-4" /> Enviar ao Funil</button><button onClick={onAnswered} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50">Marcar como respondida</button><button onClick={onDiscard} className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">Descartar</button></div></details>;
}

function ItemCard({ item, d, p, canEdit, draft, setDraft, saveSale, approve, useMemory, rejectMemory, useSupplier, rejectSupplier, onPick, onCompare, onCreate }: any) {
  const risk = riskUi(d?.risk);
  const memory = d?.memory?.[0];
  const supplierScore = trpc.quotationDecision.supplierScore.useQuery({ productId: item.produtoMatchId ?? 1 }, { enabled: item.produtoMatchId != null });
  const supplier = supplierScore.data?.[0] ?? d?.supplierRanking?.[0];
  return <section className="overflow-hidden rounded-xl border bg-white"><div className="flex items-center justify-between border-b px-4 py-2.5"><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${risk.dot}`} /><span className="text-xs font-bold">Item {item.numeroItem ?? item.id}</span><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${risk.badge}`}>{risk.label}</span></div><span className="text-[10px] text-gray-400">{freshness(d?.priceFreshness, d?.priceAgeDays)}</span></div><div className="grid xl:grid-cols-[1fr_1.15fr_1.35fr]">
    <div className="border-b p-4 xl:border-b-0 xl:border-r"><Label>Produto solicitado</Label><div className="mt-2 text-sm font-semibold">{item.descricao}</div><div className="mt-2 flex gap-1 text-[11px] text-gray-500"><span className="rounded bg-gray-100 px-2 py-0.5">{item.quantidade ?? "—"} {item.unidade ?? ""}</span>{item.codigoCatalogo && <span className="rounded bg-gray-100 px-2 py-0.5">Cód. {item.codigoCatalogo}</span>}</div>{d?.riskReasons?.length > 0 && <div className="mt-3 space-y-1">{d.riskReasons.slice(0, 4).map((r: string) => <div key={r} className="flex gap-1 text-[11px] text-gray-600"><AlertCircle className="mt-0.5 h-3 w-3 shrink-0" /> {r}</div>)}</div>}</div>
    <div className="border-b p-4 xl:border-b-0 xl:border-r"><div className="flex justify-between"><Label>Match e aprendizado</Label>{item.matchScore != null && <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold">Confiança {pct(item.matchScore)}</span>}</div>{item.productName ? <div className="mt-2"><div className="font-bold">{item.productName}</div><div className="text-xs text-gray-500">{[item.productManufacturer, item.productConcentration, item.productPresentation].filter(Boolean).join(" · ")}</div><div className="mt-1 text-xs">{item.supplierName || "Fornecedor não informado"}</div><span className={`mt-2 inline-block rounded-full px-2 py-1 text-[10px] font-bold ${item.matchConfirmado ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{item.matchConfirmado ? (item.matchAuto ? "Confirmado automaticamente" : "Match aprovado") : "Aguardando confirmação"}</span></div> : <div className="mt-3 rounded-lg border border-dashed border-red-200 bg-red-50 p-3 text-sm text-red-700">Sem produto confirmado.</div>}{memory && (!item.matchConfirmado || memory.productId !== item.produtoMatchId) && <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3"><div className="flex items-center gap-1 text-[10px] font-bold uppercase text-blue-700"><BrainCircuit className="h-3 w-3" /> Memória operacional</div><div className="mt-1 text-xs font-bold">{memory.productName}</div><div className="text-[10px] text-gray-500">{memory.evidence.join(" · ")} · {pct(memory.confidence)}</div>{canEdit && <div className="mt-2 flex gap-1"><button onClick={() => useMemory(memory)} className="inline-flex items-center gap-1 rounded bg-blue-600 px-2 py-1.5 text-[11px] font-bold text-white">Usar histórico <ArrowRight className="h-3 w-3" /></button><button onClick={() => rejectMemory(memory)} className="rounded border border-blue-200 px-2 py-1.5 text-[11px] font-bold text-blue-700">Não sugerir</button></div>}</div>}{canEdit && <div className="mt-3 flex flex-wrap gap-1">{item.produtoMatchId && !item.matchConfirmado && <Action onClick={approve} primary><CheckCircle2 className="h-3.5 w-3.5" /> Aprovar</Action>}<Action onClick={onPick}><Search className="h-3.5 w-3.5" /> Trocar</Action><Action onClick={onCompare}><Filter className="h-3.5 w-3.5" /> Comparar</Action><Action onClick={onCreate}><PackagePlus className="h-3.5 w-3.5" /> Criar</Action></div>}</div>
    <div className="p-4"><div className="flex justify-between"><Label>Decisão econômica</Label>{supplier && <span className="rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-bold text-indigo-700">Fornecedor #{supplier.rank} · score {supplier.finalScore ?? supplier.score}</span>}</div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5"><Metric label="Produto" value={money(p?.baseCost)} /><Metric label="Frete" value={money(p?.freightValue)} icon={<Truck className="h-3 w-3" />} /><Metric label="Tributos" value={money(p?.taxValue)} /><Metric label="Custo real" value={money(p?.custoUnitario)} strong /><Metric label="Margem" value={p?.marginPercent != null ? `${Number(p.marginPercent).toFixed(1)}%` : "—"} /></div><div className="mt-3 grid gap-2 md:grid-cols-[160px_1fr]"><label><Label>Preço de venda</Label><div className="mt-1 flex h-10 items-center rounded-lg border px-2"><span className="text-xs text-gray-400">R$</span><input value={draft ?? (p?.unitPrice != null ? Number(p.unitPrice).toFixed(2) : "")} onChange={(e) => setDraft(e.target.value)} onBlur={saveSale} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} disabled={!canEdit} className="w-full px-2 text-right text-sm font-bold outline-none" /></div></label><div className="grid grid-cols-2 gap-2"><div className="rounded-lg border border-emerald-100 bg-emerald-50 p-2"><div className="flex items-center gap-1 text-[9px] font-bold uppercase text-emerald-700"><Target className="h-3 w-3" /> Compra máxima</div><div className="mt-1 text-sm font-extrabold text-emerald-800">{money(d?.maxPurchasePrice)}</div><div className="text-[9px] text-emerald-700">margem mínima {d?.minMarginPercent?.toFixed?.(1) ?? "—"}%</div></div><div className="rounded-lg bg-gray-50 p-2"><Label>Total do item</Label><div className="mt-1 text-sm font-extrabold">{money(p?.totalPrice)}</div></div></div></div>{supplier && <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="flex items-center gap-1 text-[10px] font-bold uppercase text-indigo-700"><Gauge className="h-3.5 w-3.5" /> Score de fornecedor</div><div className="mt-1 text-xs font-bold">{supplier.supplierName || "Fornecedor"} · custo {money(supplier.landedCost)}</div><div className="text-[10px] text-gray-500">score {supplier.finalScore ?? supplier.score}/100 · vitória {supplier.winRate ?? "—"}% · confiabilidade {supplier.reliability ?? "—"} · {freshness(supplier.freshness, supplier.daysOld)}</div></div><div className="flex gap-1">{supplier.link && <a href={supplier.link} target="_blank" rel="noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded border"><ExternalLink className="h-3.5 w-3.5" /></a>}{canEdit && supplier.effectivePrice != null && <button onClick={() => useSupplier(supplier)} className="rounded bg-indigo-600 px-2.5 py-1.5 text-[11px] font-bold text-white">Usar</button>}{canEdit && <button onClick={() => rejectSupplier(supplier)} className="rounded border border-indigo-200 px-2 py-1.5 text-[11px] font-bold text-indigo-700">Rejeitar</button>}</div></div></div>}</div>
  </div></section>;
}

function ProductPicker({ item, onClose, onCreate, onUse }: any) {
  const [query, setQuery] = useState(item.productName || item.descricao.slice(0, 80));
  const products = trpc.products.list.useQuery({ search: query.trim(), searchField: "all", isActive: "yes", limit: 50, sortBy: "price", sortDir: "asc" });
  const rows = products.data?.items ?? [];
  return <Modal title="Trocar produto" subtitle={item.descricao} onClose={onClose} wide><div className="border-b p-4"><div className="flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} className="h-11 w-full rounded-lg border pl-9 pr-3 text-sm" /></div><button onClick={onCreate} className="rounded-lg border px-3 text-sm font-bold">Criar novo</button></div></div><div className="max-h-[65vh] overflow-auto"><table className="w-full min-w-[850px] text-sm"><thead className="sticky top-0 bg-gray-50 text-left text-[10px] uppercase text-gray-500"><tr><th className="p-3">Produto</th><th>Fabricante</th><th>Fornecedor</th><th className="text-right">Preço</th><th /></tr></thead><tbody>{rows.map((product: any) => <tr key={product.id} className="border-t"><td className="p-3"><div className="font-bold">{product.name}</div><div className="text-[10px] text-gray-500">{[product.concentration, product.presentation, product.code].filter(Boolean).join(" · ")}</div></td><td className="text-xs">{product.manufacturer || "—"}</td><td className="text-xs">{product.supplierName || "—"}</td><td className="text-right font-bold">{money(product.price)}</td><td className="p-3 text-right"><button onClick={() => onUse(product)} className="rounded bg-blue-600 px-2.5 py-1.5 text-xs font-bold text-white">Selecionar</button></td></tr>)}</tbody></table>{products.isLoading && <div className="p-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>}</div></Modal>;
}

function Compare({ item, d, onClose, onUse }: any) {
  const rows = useMemo(() => {
    const out: any[] = [];
    if (item.produtoMatchId) out.push({ id: item.produtoMatchId, name: item.productName, source: "Match atual", supplierName: item.supplierName, confidence: Number(item.matchScore ?? 1), price: item.precoSugerido ?? item.productPrice, supplierId: item.productSupplierId });
    for (const m of d?.memory ?? []) out.push({ id: m.productId, name: m.productName, source: "Memória", supplierName: m.supplierName, confidence: m.confidence, price: m.lastCost, supplierId: m.supplierId });
    return out.filter((r, i, all) => r.id && all.findIndex((x) => x.id === r.id) === i).slice(0, 8);
  }, [item, d]);
  return <Modal title="Comparar alternativas" subtitle={item.descricao} onClose={onClose} wide><div className="overflow-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-gray-50 text-left text-[10px] uppercase text-gray-500"><tr><th className="p-3">Produto</th><th>Fonte</th><th>Fornecedor</th><th className="text-right">Confiança</th><th className="text-right">Custo</th><th /></tr></thead><tbody>{rows.map((r, i) => <tr key={r.id} className="border-t"><td className="p-3 font-bold">#{i + 1} {r.name}</td><td className="text-xs">{r.source}</td><td className="text-xs">{r.supplierName || "—"}</td><td className="text-right">{pct(r.confidence)}</td><td className="text-right font-bold">{money(r.price)}</td><td className="p-3 text-right"><button onClick={() => onUse(r)} className="rounded bg-blue-600 px-2 py-1 text-xs font-bold text-white">Usar</button></td></tr>)}</tbody></table></div></Modal>;
}

function QuickCreate({ item, onClose, onCreated }: any) {
  const suppliers = trpc.suppliers.list.useQuery({ activeOnly: true });
  const categories = trpc.categories.list.useQuery();
  const [form, setForm] = useState({ name: item.descricao.slice(0, 300), supplierId: "", categoryId: "", price: "" });
  const create = trpc.products.create.useMutation({ onSuccess: (r: any) => { const id = Number(r?.insertId); if (!id) return toast.error("Produto criado sem ID retornado."); onCreated({ id, price: form.price || null, supplierId: Number(form.supplierId) }); }, onError: (e) => toast.error(e.message) });
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
