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

function money(value: number | string | null | undefined) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pct(value: number | string | null | undefined) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const normalized = n <= 1 ? n * 100 : n;
  return `${normalized.toFixed(0)}%`;
}

function initialQuotationId(): number | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("cotacao");
  const id = raw ? Number(raw) : NaN;
  return Number.isInteger(id) && id > 0 ? id : null;
}

function riskUi(risk: string) {
  if (risk === "red") return { label: "Alto risco", dot: "bg-red-500", badge: "border-red-200 bg-red-50 text-red-700" };
  if (risk === "yellow") return { label: "Revisar", dot: "bg-amber-400", badge: "border-amber-200 bg-amber-50 text-amber-700" };
  return { label: "Seguro", dot: "bg-emerald-500", badge: "border-emerald-200 bg-emerald-50 text-emerald-700" };
}

function freshnessLabel(value: string, days: number | null) {
  if (value === "fresh") return days == null ? "Preço atual" : `Preço há ${days} dia(s)`;
  if (value === "attention") return `Preço há ${days ?? "?"} dias`;
  if (value === "stale") return `Preço desatualizado · ${days ?? "?"} dias`;
  return "Validade do preço desconhecida";
}

type DetailItem = {
  id: number;
  numeroItem: number | null;
  descricao: string;
  quantidade: string | null;
  unidade: string | null;
  codigoCatalogo: string | null;
  produtoMatchId: number | null;
  matchScore: string | null;
  matchMethod: string;
  matchConfirmado: boolean;
  matchAuto: boolean;
  precoSugerido: string | null;
  precoVendaManual: string | null;
  productName: string | null;
  productManufacturer: string | null;
  productPresentation: string | null;
  productConcentration: string | null;
  productPrice: string | null;
  supplierName: string | null;
};

type DetailData = {
  quotation: {
    id: number;
    messageId: string | null;
    subject: string | null;
    orgao: string | null;
    fromName: string | null;
    fromAddress?: string | null;
    status: string;
    prazoResposta: string | Date | null;
    propostaPdfUrl: string | null;
    propostaGeradaEm: string | Date | null;
  };
  items: DetailItem[];
};

type PickerProduct = {
  id: number;
  name: string;
  price: string | null;
  manufacturer?: string | null;
  concentration?: string | null;
  presentation?: string | null;
  supplierName?: string | null;
};

export default function CotacoesRecebidas() {
  const isAdmin = usePermission("admin");
  const canEdit = usePermission("editor");
  const utils = trpc.useUtils();
  const [selectedId, setSelectedId] = useState<number | null>(initialQuotationId);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("abertas");

  const statusQuery = trpc.emailQuotations.status.useQuery();
  const listQuery = trpc.emailQuotations.list.useQuery({});
  const deadlinesQuery = trpc.emailQuotations.prazosProximos.useQuery({ diasAlerta: 3 });
  const detailQuery = trpc.emailQuotations.get.useQuery({ id: selectedId ?? 0 }, { enabled: selectedId != null });

  const syncMutation = trpc.emailQuotations.sync.useMutation({
    onSuccess: (res) => {
      if (!res.imapConfigured) return toast.error("E-mail ainda não configurado.");
      toast.success(`${res.imported} cotação(ões) importada(s).`);
      utils.emailQuotations.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const portalMutation = trpc.portalOpportunitySync.sync.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.imported} nova(s) oportunidade(s) encontrada(s).`);
      utils.emailQuotations.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return (listQuery.data ?? []).filter((quotation) => {
      if (statusFilter === "abertas" && ["respondida", "descartada"].includes(quotation.status)) return false;
      if (statusFilter !== "todas" && statusFilter !== "abertas" && quotation.status !== statusFilter) return false;
      if (!term) return true;
      return [quotation.subject, quotation.orgao, quotation.fromName, quotation.fromAddress]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(term));
    });
  }, [listQuery.data, search, statusFilter]);

  const selectQuotation = (id: number) => {
    setSelectedId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("cotacao", String(id));
    window.history.replaceState({}, "", url.toString());
  };

  return (
    <div className="mx-auto max-w-[1840px] p-4 lg:p-6">
      <header className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold tracking-tight text-gray-950">Cotações recebidas</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">Operação por exceção: a IA resolve o previsível e destaca apenas o que exige decisão humana.</p>
        </div>
        {isAdmin && (
          <details className="relative self-start lg:self-auto">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              <RefreshCw className="h-4 w-4" /> Atualizar fontes
            </summary>
            <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
              <button onClick={() => syncMutation.mutate({ limit: 25 })} disabled={syncMutation.isPending} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50">
                {syncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4" />} Sincronizar e-mail
              </button>
              <button onClick={() => portalMutation.mutate({ sources: [...PORTAL_SOURCES] })} disabled={portalMutation.isPending} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50">
                {portalMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe2 className="h-4 w-4" />} Buscar portais
              </button>
            </div>
          </details>
        )}
      </header>

      {deadlinesQuery.data && (deadlinesQuery.data.vencidos.length > 0 || deadlinesQuery.data.proximos.length > 0) && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span><strong>{deadlinesQuery.data.vencidos.length}</strong> vencida(s) e <strong>{deadlinesQuery.data.proximos.length}</strong> vencendo em até 3 dias.</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className={`${selectedId ? "hidden lg:block" : "block"} overflow-hidden rounded-xl border border-gray-200 bg-white`}>
          <div className="border-b border-gray-100 p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar órgão ou cotação" className="h-10 w-full rounded-lg border border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-blue-400" />
            </div>
            <div className="mt-2 flex gap-1 overflow-x-auto">
              {[{ value: "abertas", label: "Abertas" }, { value: "revisao", label: "Revisão" }, { value: "respondida", label: "Respondidas" }, { value: "todas", label: "Todas" }].map((filter) => (
                <button key={filter.value} onClick={() => setStatusFilter(filter.value)} className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusFilter === filter.value ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"}`}>{filter.label}</button>
              ))}
            </div>
          </div>
          <div className="max-h-[72vh] overflow-y-auto">
            {listQuery.isLoading ? (
              <div className="p-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-400" /></div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">Nenhuma cotação neste filtro.</div>
            ) : filtered.map((quotation) => {
              const status = STATUS_LABELS[quotation.status] ?? STATUS_LABELS.nova;
              return (
                <button key={quotation.id} onClick={() => selectQuotation(quotation.id)} className={`w-full border-b border-gray-100 px-3 py-3 text-left transition hover:bg-blue-50 ${selectedId === quotation.id ? "bg-blue-50" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 text-sm font-semibold text-gray-900">{quotation.subject || "Cotação sem assunto"}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${status.className}`}>{status.label}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-gray-500">
                    <span className="truncate">{quotation.orgao || quotation.fromName || quotation.fromAddress || "Origem não identificada"}</span>
                    <span className="shrink-0 font-medium">{quotation.matchedItems}/{quotation.totalItems}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {selectedId == null ? (
            <div className="flex min-h-[560px] flex-col items-center justify-center px-6 text-center">
              <BrainCircuit className="mb-3 h-11 w-11 text-gray-300" />
              <p className="font-semibold text-gray-700">Selecione uma cotação</p>
              <p className="mt-1 max-w-lg text-sm text-gray-400">O S2Licit cruzará memória, fornecedores, custos, margens, validade do preço e histórico de vitórias.</p>
            </div>
          ) : detailQuery.isLoading ? (
            <div className="flex min-h-[560px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
          ) : detailQuery.data ? (
            <QuotationWorkspace
              data={detailQuery.data as DetailData}
              canEdit={canEdit}
              smtpConfigured={statusQuery.data?.smtpConfigured === true}
              onBack={() => setSelectedId(null)}
              onChanged={() => {
                utils.emailQuotations.get.invalidate({ id: selectedId });
                utils.emailQuotations.list.invalidate();
                utils.emailQuotations.pricingPreview.invalidate({ id: selectedId });
                utils.quotationDecision.summary.invalidate({ quotationId: selectedId });
              }}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}

function QuotationWorkspace({ data, canEdit, smtpConfigured, onChanged, onBack }: { data: DetailData; canEdit: boolean; smtpConfigured: boolean; onChanged: () => void; onBack: () => void }) {
  const [, navigate] = useLocation();
  const { quotation, items } = data;
  const utils = trpc.useUtils();
  const [riskFilter, setRiskFilter] = useState<"all" | "red" | "yellow" | "green">("all");
  const [pickerItem, setPickerItem] = useState<DetailItem | null>(null);
  const [compareItem, setCompareItem] = useState<DetailItem | null>(null);
  const [createItem, setCreateItem] = useState<DetailItem | null>(null);
  const [saleDrafts, setSaleDrafts] = useState<Record<number, string>>({});

  const previewQuery = trpc.emailQuotations.pricingPreview.useQuery({ id: quotation.id });
  const decisionQuery = trpc.quotationDecision.summary.useQuery({ quotationId: quotation.id });
  const previewById = useMemo(() => new Map((previewQuery.data?.items ?? []).map((row) => [row.quotationItemId, row])), [previewQuery.data]);
  const decisionById = useMemo(() => new Map((decisionQuery.data?.items ?? []).map((row) => [row.itemId, row])), [decisionQuery.data]);

  useEffect(() => {
    if (!previewQuery.data) return;
    setSaleDrafts((current) => {
      const next = { ...current };
      for (const row of previewQuery.data.items) {
        if (next[row.quotationItemId] === undefined && row.unitPrice != null) next[row.quotationItemId] = row.unitPrice.toFixed(2);
      }
      return next;
    });
  }, [previewQuery.data]);

  const resolveMutation = trpc.quotationDecision.resolve.useMutation({
    onSuccess: (result) => {
      toast.success(`IA concluiu ${result.autoResolved} novo(s) match(es). ${result.summary.totals.needsReview} para revisão e ${result.summary.totals.blocked} bloqueado(s).`);
      onChanged();
    },
    onError: (error) => toast.error(error.message),
  });
  const matchMutation = trpc.emailQuotations.setItemMatch.useMutation({
    onSuccess: () => {
      toast.success("Produto vinculado.");
      setPickerItem(null);
      setCompareItem(null);
      onChanged();
    },
    onError: (error) => toast.error(error.message),
  });
  const saleMutation = trpc.emailQuotations.setItemSalePrice.useMutation({
    onSuccess: () => { toast.success("Preço de venda atualizado."); onChanged(); },
    onError: (error) => toast.error(error.message),
  });
  const deadlineMutation = trpc.emailQuotations.setPrazo.useMutation({ onSuccess: onChanged, onError: (error) => toast.error(error.message) });
  const statusMutation = trpc.emailQuotations.setStatus.useMutation({ onSuccess: onChanged, onError: (error) => toast.error(error.message) });
  const proposalMutation = trpc.emailQuotations.gerarOrcamento.useMutation({
    onSuccess: (result) => { window.open(result.pdfUrl, "_blank"); toast.success(`Proposta gerada: ${money(result.total)}.`); onChanged(); },
    onError: (error) => toast.error(error.message),
  });
  const emailMutation = trpc.emailQuotations.responderPorEmail.useMutation({
    onSuccess: (result) => { toast.success(`Proposta enviada para ${result.to}.`); onChanged(); },
    onError: (error) => toast.error(error.message),
  });
  const funnelMutation = trpc.funil.criarDeCotacao.useMutation({
    onSuccess: ({ id, jaExistia }) => { toast.success(jaExistia ? "Oportunidade já existia no Funil." : "Oportunidade criada no Funil."); navigate(`/funil?oportunidade=${id}`); },
    onError: (error) => toast.error(error.message),
  });
  const handoffMutation = trpc.emailQuotations.prepararParaPortal.useMutation({
    onSuccess: async (result) => { await utils.proposals.list.invalidate(); navigate(`/agente-proposta?propostaId=${result.proposalId}`); },
    onError: (error) => toast.error(error.message),
  });

  const totals = decisionQuery.data?.totals;
  const isPortal = (quotation.messageId ?? "").startsWith("portal:");
  const filteredItems = items.filter((item) => riskFilter === "all" || decisionById.get(item.id)?.risk === riskFilter);

  const saveSale = (itemId: number) => {
    const raw = saleDrafts[itemId]?.replace(",", ".").trim();
    if (!raw) return saleMutation.mutate({ itemId, salePrice: null });
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return toast.error("Informe um preço de venda válido.");
    saleMutation.mutate({ itemId, salePrice: value });
  };

  const useProduct = (item: DetailItem, product: { id: number; price?: string | null }) => {
    matchMutation.mutate({ itemId: item.id, produtoMatchId: product.id, precoSugerido: product.price ?? undefined });
  };

  return (
    <div>
      <div className="border-b border-gray-100 p-4 lg:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <button onClick={onBack} className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-gray-500 lg:hidden"><ChevronLeft className="h-4 w-4" /> Voltar</button>
            <h2 className="text-lg font-bold text-gray-950">{quotation.subject || "Cotação sem assunto"}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-500">
              <span>{quotation.orgao || quotation.fromName || "Origem não identificada"}</span>
              <label className="flex items-center gap-1.5">
                <span className="text-xs">Prazo:</span>
                <input type="date" defaultValue={quotation.prazoResposta ? String(quotation.prazoResposta).slice(0, 10) : ""} onChange={(event) => deadlineMutation.mutate({ id: quotation.id, prazoResposta: event.target.value || null })} disabled={!canEdit} className="rounded border border-gray-200 px-2 py-1 text-xs" />
              </label>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => decisionQuery.refetch()} disabled={decisionQuery.isFetching} className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              {decisionQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe2 className="h-4 w-4" />} Pesquisar todos
            </button>
            <button onClick={() => resolveMutation.mutate({ quotationId: quotation.id })} disabled={!canEdit || resolveMutation.isPending} className="inline-flex h-10 items-center gap-2 rounded-lg bg-gray-950 px-4 text-sm font-bold text-white hover:bg-black disabled:opacity-50">
              {resolveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Resolver cotação com IA
            </button>
            <button onClick={() => proposalMutation.mutate({ id: quotation.id })} disabled={!canEdit || totals?.canGenerate !== true || proposalMutation.isPending} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">
              {proposalMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Gerar proposta
            </button>
            {canEdit && (
              <details className="relative">
                <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg border border-gray-200"><MoreHorizontal className="h-5 w-5" /></summary>
                <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
                  {smtpConfigured && <button onClick={() => emailMutation.mutate({ id: quotation.id })} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50">Gerar e enviar por e-mail</button>}
                  {isPortal && <button onClick={() => handoffMutation.mutate({ id: quotation.id })} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50"><Bot className="h-4 w-4" /> Preencher no portal</button>}
                  <button onClick={() => funnelMutation.mutate({ quotationId: quotation.id })} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50"><KanbanSquare className="h-4 w-4" /> Enviar ao Funil</button>
                  <button onClick={() => statusMutation.mutate({ id: quotation.id, status: "respondida" })} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50">Marcar como respondida</button>
                  <button onClick={() => statusMutation.mutate({ id: quotation.id, status: "descartada" })} className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">Descartar</button>
                </div>
              </details>
            )}
          </div>
        </div>
      </div>

      {totals && (
        <div className="border-b border-gray-100 bg-gray-50/70 p-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            <Summary label="Resolvidos" value={`${totals.resolved}/${totals.totalItems}`} tone="green" />
            <Summary label="Revisar" value={String(totals.needsReview)} tone="yellow" />
            <Summary label="Bloqueados" value={String(totals.blocked)} tone="red" />
            <Summary label="Custo" value={money(totals.totalCost)} />
            <Summary label="Frete" value={money(totals.totalFreight)} />
            <Summary label="Tributos" value={money(totals.totalTaxes)} />
            <Summary label="Venda" value={money(totals.totalSale)} strong />
            <Summary label="Lucro / margem" value={`${money(totals.totalProfit)} · ${totals.effectiveMarginPercent.toFixed(1)}%`} />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-xs text-gray-500"><ShieldAlert className="h-4 w-4" /> Revisão final orientada por risco: verdes podem seguir; amarelos e vermelhos concentram a atenção.</div>
            <div className="flex flex-wrap gap-1">
              {[
                { value: "all", label: "Todos" },
                { value: "red", label: `Bloqueados ${totals.blocked}` },
                { value: "yellow", label: `Revisar ${totals.needsReview}` },
                { value: "green", label: `Seguros ${totals.resolved}` },
              ].map((filter) => (
                <button key={filter.value} onClick={() => setRiskFilter(filter.value as "all" | "red" | "yellow" | "green")} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${riskFilter === filter.value ? "bg-gray-900 text-white" : "border border-gray-200 bg-white text-gray-600"}`}>{filter.label}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3 p-4">
        {filteredItems.map((item) => (
          <DecisionItemCard
            key={item.id}
            item={item}
            decision={decisionById.get(item.id)}
            pricing={previewById.get(item.id)}
            canEdit={canEdit}
            pending={matchMutation.isPending || saleMutation.isPending}
            saleDraft={saleDrafts[item.id]}
            setSaleDraft={(value) => setSaleDrafts((current) => ({ ...current, [item.id]: value }))}
            saveSale={() => saveSale(item.id)}
            approve={() => item.produtoMatchId && useProduct(item, { id: item.produtoMatchId, price: item.precoSugerido ?? item.productPrice })}
            useMemory={(candidate) => useProduct(item, { id: candidate.productId, price: candidate.lastCost == null ? undefined : String(candidate.lastCost) })}
            useSupplierCost={(supplier) => item.produtoMatchId && supplier.effectivePrice != null && useProduct(item, { id: item.produtoMatchId, price: String(supplier.effectivePrice) })}
            onPick={() => setPickerItem(item)}
            onCompare={() => setCompareItem(item)}
            onCreate={() => setCreateItem(item)}
          />
        ))}
        {filteredItems.length === 0 && <div className="p-12 text-center text-sm text-gray-400">Nenhum item neste filtro.</div>}
      </div>

      {quotation.propostaGeradaEm && quotation.propostaPdfUrl && (
        <div className="border-t border-gray-100 p-4">
          <a href={quotation.propostaPdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700"><FileText className="h-4 w-4" /> Ver proposta já gerada <ExternalLink className="h-3 w-3" /></a>
        </div>
      )}

      {pickerItem && <ProductPicker item={pickerItem} onClose={() => setPickerItem(null)} onSelect={(product) => useProduct(pickerItem, product)} onCreate={() => { setCreateItem(pickerItem); setPickerItem(null); }} />}
      {compareItem && <CompareAlternatives item={compareItem} decision={decisionById.get(compareItem.id)} onClose={() => setCompareItem(null)} onUse={(product) => useProduct(compareItem, product)} />}
      {createItem && <QuickCreateProduct item={createItem} onClose={() => setCreateItem(null)} onCreated={(product) => { useProduct(createItem, product); setCreateItem(null); }} />}
    </div>
  );
}

type DecisionData = {
  risk?: string;
  riskReasons?: string[];
  priceFreshness?: string;
  priceAgeDays?: number | null;
  maxPurchasePrice?: number | null;
  minMarginPercent?: number;
  memory?: Array<{
    productId: number;
    productName: string;
    supplierName: string | null;
    confidence: number;
    approvals: number;
    wins: number;
    lastCost: number | null;
    evidence: string[];
  }>;
  supplierRanking?: Array<{
    rank: number;
    supplierName: string | null;
    score: number;
    landedCost: number | null;
    effectivePrice: number | null;
    winCount: number;
    freshness: string;
    daysOld: number | null;
    availability: string | null;
    link: string | null;
  }>;
};

type PricingData = {
  baseCost?: number | null;
  freightValue?: number;
  taxValue?: number;
  custoUnitario?: number | null;
  marginPercent?: number | null;
  unitPrice?: number | null;
  totalPrice?: number | null;
};

function DecisionItemCard({ item, decision, pricing, canEdit, pending, saleDraft, setSaleDraft, saveSale, approve, useMemory, useSupplierCost, onPick, onCompare, onCreate }: {
  item: DetailItem;
  decision: DecisionData | undefined;
  pricing: PricingData | undefined;
  canEdit: boolean;
  pending: boolean;
  saleDraft?: string;
  setSaleDraft: (value: string) => void;
  saveSale: () => void;
  approve: () => void;
  useMemory: (candidate: NonNullable<DecisionData["memory"]>[number]) => void;
  useSupplierCost: (supplier: NonNullable<DecisionData["supplierRanking"]>[number]) => void;
  onPick: () => void;
  onCompare: () => void;
  onCreate: () => void;
}) {
  const risk = riskUi(decision?.risk ?? (item.produtoMatchId ? "yellow" : "red"));
  const memory = decision?.memory?.[0];
  const supplier = decision?.supplierRanking?.[0];

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${risk.dot}`} /><span className="truncate text-xs font-bold text-gray-600">Item {item.numeroItem ?? item.id}</span><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${risk.badge}`}>{risk.label}</span></div>
        {decision?.priceFreshness && <span className="text-[10px] font-medium text-gray-400">{freshnessLabel(decision.priceFreshness, decision.priceAgeDays ?? null)}</span>}
      </div>

      <div className="grid xl:grid-cols-[1fr_1.15fr_1.35fr]">
        <div className="border-b border-gray-100 p-4 xl:border-b-0 xl:border-r">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Produto solicitado</div>
          <div className="mt-2 text-sm font-semibold leading-5 text-gray-950">{item.descricao}</div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-gray-500"><span className="rounded bg-gray-100 px-2 py-0.5">{item.quantidade ?? "—"} {item.unidade ?? ""}</span>{item.codigoCatalogo && <span className="rounded bg-gray-100 px-2 py-0.5">Cód. {item.codigoCatalogo}</span>}</div>
          {decision?.riskReasons && decision.riskReasons.length > 0 && <div className="mt-3 space-y-1">{decision.riskReasons.slice(0, 4).map((reason) => <div key={reason} className="flex items-start gap-1.5 text-[11px] text-gray-600"><AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />{reason}</div>)}</div>}
        </div>

        <div className="border-b border-gray-100 p-4 xl:border-b-0 xl:border-r">
          <div className="flex items-center justify-between gap-2"><div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Match e memória</div>{item.matchScore != null && <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-600">Confiança {pct(item.matchScore)}</span>}</div>
          {item.productName ? (
            <div className="mt-2">
              <div className="font-bold text-gray-950">{item.productName}</div>
              <div className="mt-0.5 text-xs text-gray-500">{[item.productManufacturer, item.productConcentration, item.productPresentation].filter(Boolean).join(" · ") || "Sem ficha técnica complementar"}</div>
              <div className="mt-1 text-xs font-medium text-gray-500">{item.supplierName || "Fornecedor do cadastro não informado"}</div>
              <div className="mt-2"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${item.matchConfirmado ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{item.matchConfirmado ? (item.matchAuto ? "Confirmado automaticamente" : "Match aprovado") : "Aguardando confirmação"}</span></div>
            </div>
          ) : <div className="mt-3 rounded-lg border border-dashed border-red-200 bg-red-50/50 p-3 text-sm text-red-700">Nenhum produto confirmado.</div>}

          {memory && (!item.matchConfirmado || memory.productId !== item.produtoMatchId) && (
            <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-blue-700"><BrainCircuit className="h-3.5 w-3.5" /> Memória operacional</div>
              <div className="mt-1 text-xs font-bold text-gray-900">{memory.productName}</div>
              <div className="mt-1 text-[10px] text-gray-500">{memory.evidence.join(" · ")} · confiança {pct(memory.confidence)}</div>
              {canEdit && <button onClick={() => useMemory(memory)} disabled={pending} className="mt-2 inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-1.5 text-[11px] font-bold text-white disabled:opacity-50">Usar histórico <ArrowRight className="h-3 w-3" /></button>}
            </div>
          )}

          {canEdit && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {item.produtoMatchId && !item.matchConfirmado && <button onClick={approve} disabled={pending} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-2 text-xs font-bold text-white disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" /> Aprovar</button>}
              <button onClick={onPick} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-2 text-xs font-bold text-gray-700"><Search className="h-3.5 w-3.5" /> Trocar</button>
              <button onClick={onCompare} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-2 text-xs font-bold text-gray-700"><Filter className="h-3.5 w-3.5" /> Comparar</button>
              <button onClick={onCreate} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-2 text-xs font-bold text-gray-700"><PackagePlus className="h-3.5 w-3.5" /> Criar</button>
            </div>
          )}
        </div>

        <div className="p-4">
          <div className="flex items-center justify-between gap-2"><div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Decisão econômica</div>{supplier && <span className="rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-bold text-indigo-700">Fornecedor #{supplier.rank} · score {supplier.score}</span>}</div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Metric label="Produto" value={money(pricing?.baseCost)} />
            <Metric label="Frete" value={money(pricing?.freightValue ?? 0)} icon={<Truck className="h-3 w-3" />} />
            <Metric label="Tributos" value={money(pricing?.taxValue ?? 0)} />
            <Metric label="Custo real" value={money(pricing?.custoUnitario)} strong />
            <Metric label="Margem" value={pricing?.marginPercent != null ? `${Number(pricing.marginPercent).toFixed(1)}%` : "—"} />
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-[160px_1fr]">
            <label>
              <span className="mb-1 block text-[10px] font-bold uppercase text-gray-400">Preço de venda</span>
              <div className="flex h-10 items-center rounded-lg border border-gray-200 px-2"><span className="text-xs text-gray-400">R$</span><input value={saleDraft ?? (pricing?.unitPrice != null ? Number(pricing.unitPrice).toFixed(2) : "")} onChange={(event) => setSaleDraft(event.target.value)} onBlur={saveSale} onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }} disabled={!canEdit || pricing?.unitPrice == null} className="w-full px-2 text-right text-sm font-bold outline-none disabled:bg-gray-50" /></div>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-2"><div className="flex items-center gap-1 text-[9px] font-bold uppercase text-emerald-700"><Target className="h-3 w-3" /> Compra máxima</div><div className="mt-1 text-sm font-extrabold text-emerald-800">{money(decision?.maxPurchasePrice)}</div><div className="mt-0.5 text-[9px] text-emerald-700">preserva margem mínima de {decision?.minMarginPercent?.toFixed(1) ?? "—"}%</div></div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-2"><div className="text-[9px] font-bold uppercase text-gray-400">Total do item</div><div className="mt-1 text-sm font-extrabold text-gray-900">{money(pricing?.totalPrice)}</div></div>
            </div>
          </div>

          {supplier && (
            <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-indigo-700"><Store className="h-3.5 w-3.5" /> Melhor fornecedor agora</div><div className="mt-1 text-xs font-bold text-gray-950">{supplier.supplierName || "Fornecedor"} · custo {money(supplier.landedCost)}</div><div className="mt-0.5 text-[10px] text-gray-500">{supplier.winCount} vitória(s) · {freshnessLabel(supplier.freshness, supplier.daysOld)} · {supplier.availability || "estoque não informado"}</div></div>
                <div className="flex gap-1">{supplier.link && <a href={supplier.link} target="_blank" rel="noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-200 text-indigo-700"><ExternalLink className="h-3.5 w-3.5" /></a>}{canEdit && supplier.effectivePrice != null && <button onClick={() => useSupplierCost(supplier)} className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[11px] font-bold text-white">Usar custo</button>}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Summary({ label, value, strong = false, tone }: { label: string; value: string; strong?: boolean; tone?: "green" | "yellow" | "red" }) {
  const toneClass = tone === "green" ? "border-emerald-100 bg-emerald-50" : tone === "yellow" ? "border-amber-100 bg-amber-50" : tone === "red" ? "border-red-100 bg-red-50" : "border-gray-100 bg-white";
  return <div className={`rounded-lg border px-3 py-2 ${toneClass}`}><div className="text-[9px] font-bold uppercase tracking-wide text-gray-500">{label}</div><div className={`mt-0.5 text-sm ${strong ? "font-extrabold text-blue-700" : "font-bold text-gray-900"}`}>{value}</div></div>;
}

function Metric({ label, value, strong = false, icon }: { label: string; value: string; strong?: boolean; icon?: React.ReactNode }) {
  return <div className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2"><div className="flex items-center gap-1 text-[9px] font-bold uppercase text-gray-400">{icon}{label}</div><div className={`mt-1 text-sm ${strong ? "font-extrabold text-blue-700" : "font-bold text-gray-900"}`}>{value}</div></div>;
}

function ProductPicker({ item, onClose, onSelect, onCreate }: { item: DetailItem; onClose: () => void; onSelect: (product: PickerProduct) => void; onCreate: () => void }) {
  const [query, setQuery] = useState(item.productName || item.descricao.slice(0, 80));
  const productsQuery = trpc.products.list.useQuery({ search: query.trim(), searchField: "all", isActive: "yes", limit: 50, sortBy: "price", sortDir: "asc" });
  return (
    <Modal title="Trocar produto" subtitle={item.descricao} onClose={onClose}>
      <div className="p-4">
        <div className="flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 w-full rounded-lg border border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-blue-400" placeholder="Nome, princípio ativo, marca ou código" /></div><button onClick={onCreate} className="rounded-lg border border-gray-200 px-3 text-sm font-bold"><PackagePlus className="mr-1 inline h-4 w-4" /> Criar</button></div>
        <div className="mt-4 max-h-[60vh] overflow-auto rounded-xl border border-gray-100">
          {productsQuery.isLoading ? <div className="p-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> : (productsQuery.data ?? []).map((product) => (
            <button key={product.id} onClick={() => onSelect(product as PickerProduct)} className="flex w-full items-center justify-between gap-3 border-b border-gray-100 p-3 text-left hover:bg-blue-50"><div><div className="text-sm font-bold text-gray-900">{product.name}</div><div className="mt-0.5 text-xs text-gray-500">{[product.manufacturer, product.concentration, product.presentation, product.supplierName].filter(Boolean).join(" · ")}</div></div><div className="shrink-0 text-right"><div className="text-sm font-bold">{money(product.price)}</div><div className="text-[10px] text-blue-700">Selecionar</div></div></button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function CompareAlternatives({ item, decision, onClose, onUse }: { item: DetailItem; decision: DecisionData | undefined; onClose: () => void; onUse: (product: { id: number; price?: string | null }) => void }) {
  const equivalentsQuery = trpc.products.suggestEquivalentsByFichaTecnica.useQuery({ productId: item.produtoMatchId ?? 0, limit: 20, onlyWithPrice: true }, { enabled: item.produtoMatchId != null });
  const rows = useMemo(() => {
    const output: Array<{ id: number; name: string; price: string | null; source: string; confidence: number | null; supplierName: string | null }> = [];
    if (item.produtoMatchId && item.productName) output.push({ id: item.produtoMatchId, name: item.productName, price: item.precoSugerido ?? item.productPrice, source: "Produto atual", confidence: item.matchScore == null ? null : Number(item.matchScore), supplierName: item.supplierName });
    for (const memory of decision?.memory ?? []) output.push({ id: memory.productId, name: memory.productName, price: memory.lastCost == null ? null : String(memory.lastCost), source: `Memória · ${memory.approvals} uso(s) · ${memory.wins} vitória(s)`, confidence: memory.confidence, supplierName: memory.supplierName });
    for (const equivalent of (equivalentsQuery.data as { equivalents?: Array<Record<string, unknown>> } | undefined)?.equivalents ?? []) {
      const score = Number(equivalent.score);
      output.push({ id: Number(equivalent.id), name: String(equivalent.name ?? "Produto"), price: equivalent.price == null ? null : String(equivalent.price), source: `Equivalente técnico · ${String(equivalent.status ?? "revisão")}`, confidence: Number.isFinite(score) ? (score > 1 ? score / 100 : score) : null, supplierName: equivalent.supplierName == null ? null : String(equivalent.supplierName) });
    }
    return output.filter((row, index, array) => array.findIndex((other) => other.id === row.id) === index).sort((a, b) => Number(b.confidence ?? 0) - Number(a.confidence ?? 0) || Number(a.price ?? Infinity) - Number(b.price ?? Infinity));
  }, [item, decision, equivalentsQuery.data]);

  return (
    <Modal title="Comparar alternativas" subtitle={item.descricao} onClose={onClose} wide>
      <div className="overflow-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-gray-50 text-left text-[10px] font-bold uppercase text-gray-500"><tr><th className="px-4 py-3">Produto</th><th className="px-3 py-3">Fonte / evidência</th><th className="px-3 py-3">Fornecedor</th><th className="px-3 py-3 text-right">Confiança</th><th className="px-3 py-3 text-right">Custo</th><th className="px-4 py-3" /></tr></thead><tbody className="divide-y divide-gray-100">{rows.map((row, index) => <tr key={row.id} className="hover:bg-blue-50/40"><td className="px-4 py-3"><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-[10px] font-bold text-white">{index + 1}</span><span className="font-bold">{row.name}</span></div></td><td className="px-3 py-3 text-xs text-gray-600">{row.source}</td><td className="px-3 py-3 text-xs">{row.supplierName || "—"}</td><td className="px-3 py-3 text-right text-xs font-bold">{pct(row.confidence)}</td><td className="px-3 py-3 text-right font-bold">{money(row.price)}</td><td className="px-4 py-3 text-right"><button onClick={() => onUse({ id: row.id, price: row.price })} className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-bold text-white">Usar</button></td></tr>)}{rows.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-gray-400">Nenhuma alternativa encontrada.</td></tr>}</tbody></table></div>
    </Modal>
  );
}

function QuickCreateProduct({ item, onClose, onCreated }: { item: DetailItem; onClose: () => void; onCreated: (product: { id: number; price?: string | null }) => void }) {
  const suppliersQuery = trpc.suppliers.list.useQuery({ activeOnly: true });
  const categoriesQuery = trpc.categories.list.useQuery();
  const [form, setForm] = useState({ name: item.descricao.slice(0, 300), supplierId: "", categoryId: "", price: "", manufacturer: "", concentration: "", presentation: "" });
  const createMutation = trpc.products.create.useMutation({
    onSuccess: (result) => {
      const id = Number((result as { insertId?: number | string } | undefined)?.insertId);
      if (!Number.isInteger(id) || id <= 0) return toast.error("Produto criado, mas sem ID retornado.");
      toast.success("Produto criado e pronto para vincular.");
      onCreated({ id, price: form.price || null });
    },
    onError: (error) => toast.error(error.message),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const supplierId = Number(form.supplierId);
    const categoryId = Number(form.categoryId);
    if (!supplierId || !categoryId) return toast.error("Selecione fornecedor e categoria.");
    createMutation.mutate({ name: form.name, supplierId, categoryId, price: form.price || null, manufacturer: form.manufacturer || null, concentration: form.concentration || null, presentation: form.presentation || null, unit: item.unidade || null, isActive: "yes" });
  };

  const fieldClass = "h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400";
  return (
    <Modal title="Criar produto do catálogo" subtitle="O novo produto será vinculado ao item imediatamente." onClose={onClose}>
      <form onSubmit={submit} className="grid gap-3 p-4 md:grid-cols-2">
        <label className="md:col-span-2"><FieldLabel>Nome</FieldLabel><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={fieldClass} required /></label>
        <label><FieldLabel>Fornecedor</FieldLabel><select value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value })} className={fieldClass} required><option value="">Selecione</option>{(suppliersQuery.data ?? []).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
        <label><FieldLabel>Categoria</FieldLabel><select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })} className={fieldClass} required><option value="">Selecione</option>{(categoriesQuery.data ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label><FieldLabel>Custo de aquisição</FieldLabel><input value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} className={fieldClass} placeholder="0,00" /></label>
        <label><FieldLabel>Fabricante</FieldLabel><input value={form.manufacturer} onChange={(event) => setForm({ ...form, manufacturer: event.target.value })} className={fieldClass} /></label>
        <label><FieldLabel>Concentração</FieldLabel><input value={form.concentration} onChange={(event) => setForm({ ...form, concentration: event.target.value })} className={fieldClass} /></label>
        <label><FieldLabel>Apresentação</FieldLabel><input value={form.presentation} onChange={(event) => setForm({ ...form, presentation: event.target.value })} className={fieldClass} /></label>
        <div className="md:col-span-2 flex justify-end gap-2 border-t border-gray-100 pt-3"><button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-bold">Cancelar</button><button type="submit" disabled={createMutation.isPending} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Criar e vincular</button></div>
      </form>
    </Modal>
  );
}

function Modal({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className={`max-h-[90vh] w-full overflow-hidden rounded-2xl bg-white shadow-2xl ${wide ? "max-w-6xl" : "max-w-4xl"}`}><div className="flex items-start justify-between gap-3 border-b border-gray-100 p-4"><div><h3 className="font-bold text-gray-950">{title}</h3>{subtitle && <p className="mt-0.5 line-clamp-2 text-sm text-gray-500">{subtitle}</p>}</div><button onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button></div><div className="max-h-[78vh] overflow-auto">{children}</div></div></div>;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500">{children}</span>;
}
