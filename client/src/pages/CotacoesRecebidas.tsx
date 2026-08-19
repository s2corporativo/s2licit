import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { usePermission } from "@/components/RequireAuth";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronLeft,
  Database,
  ExternalLink,
  FileText,
  Globe2,
  History,
  KanbanSquare,
  Loader2,
  MailCheck,
  MoreHorizontal,
  PackagePlus,
  Percent,
  ReceiptText,
  RefreshCw,
  Search,
  Sparkles,
  Store,
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

function confidenceClass(value: number | string | null | undefined) {
  const n = Number(value);
  const normalized = n <= 1 ? n : n / 100;
  if (!Number.isFinite(normalized)) return "bg-gray-100 text-gray-600";
  if (normalized >= 0.92) return "bg-emerald-50 text-emerald-700";
  if (normalized >= 0.75) return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-700";
}

function searchTerm(text: string) {
  const words = text
    .replace(/[^\p{L}\p{N}%/.-]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 4);
  return words.join(" ").slice(0, 100) || text.slice(0, 80);
}

function initialQuotationId(): number | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("cotacao");
  const id = raw ? Number(raw) : NaN;
  return Number.isInteger(id) && id > 0 ? id : null;
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
  const prazosQuery = trpc.emailQuotations.prazosProximos.useQuery({ diasAlerta: 3 });
  const detailQuery = trpc.emailQuotations.get.useQuery(
    { id: selectedId ?? 0 },
    { enabled: selectedId != null },
  );

  const pipelineMutation = trpc.emailQuotations.autoPipeline.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.proposalsGenerated} proposta(s) processada(s); ${res.blocked} aguardando revisão.`);
      utils.emailQuotations.list.invalidate();
      if (selectedId) utils.emailQuotations.get.invalidate({ id: selectedId });
    },
    onError: (e) => toast.error(e.message),
  });
  const syncMutation = trpc.emailQuotations.sync.useMutation({
    onSuccess: (res) => {
      if (!res.imapConfigured) return toast.error("E-mail ainda não configurado.");
      toast.success(`${res.imported} cotação(ões) importada(s).`);
      utils.emailQuotations.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const portalSyncMutation = trpc.portalOpportunitySync.sync.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.imported} nova(s) oportunidade(s) encontrada(s) nos portais.`);
      utils.emailQuotations.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return (listQuery.data ?? []).filter((q) => {
      if (statusFilter === "abertas" && ["respondida", "descartada"].includes(q.status)) return false;
      if (statusFilter !== "todas" && statusFilter !== "abertas" && q.status !== statusFilter) return false;
      if (!term) return true;
      return [q.subject, q.orgao, q.fromName, q.fromAddress]
        .filter(Boolean)
        .some((v) => String(v).toLocaleLowerCase("pt-BR").includes(term));
    });
  }, [listQuery.data, search, statusFilter]);

  const selectQuotation = (id: number) => {
    setSelectedId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("cotacao", String(id));
    window.history.replaceState({}, "", url.toString());
  };

  return (
    <div className="mx-auto max-w-[1760px] p-4 lg:p-6">
      <header className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <MailCheck className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold tracking-tight text-gray-950">Cotações recebidas</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            IA identifica o item, sugere equivalentes, consolida custos e deixa a aprovação na mesma tela.
          </p>
        </div>
        {isAdmin && (
          <details className="relative self-start lg:self-auto">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              <RefreshCw className="h-4 w-4" /> Atualizar dados
            </summary>
            <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
              <button
                onClick={() => syncMutation.mutate({ limit: 25 })}
                disabled={syncMutation.isPending}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                {syncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4" />}
                Sincronizar e-mail
              </button>
              <button
                onClick={() => portalSyncMutation.mutate({ sources: [...PORTAL_SOURCES] })}
                disabled={portalSyncMutation.isPending}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                {portalSyncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe2 className="h-4 w-4" />}
                Buscar portais
              </button>
              <button
                onClick={() => pipelineMutation.mutate()}
                disabled={pipelineMutation.isPending || statusQuery.data?.autoPipelineEnabled === false}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                {pipelineMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Processar automação
              </button>
            </div>
          </details>
        )}
      </header>

      {prazosQuery.data && (prazosQuery.data.vencidos.length > 0 || prazosQuery.data.proximos.length > 0) && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            <strong>{prazosQuery.data.vencidos.length}</strong> vencida(s) e <strong>{prazosQuery.data.proximos.length}</strong> vencendo em até 3 dias.
          </span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className={`${selectedId ? "hidden lg:block" : "block"} overflow-hidden rounded-xl border border-gray-200 bg-white`}>
          <div className="border-b border-gray-100 p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar órgão ou cotação"
                className="h-10 w-full rounded-lg border border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-blue-400"
              />
            </div>
            <div className="mt-2 flex gap-1 overflow-x-auto">
              {[
                { v: "abertas", l: "Abertas" },
                { v: "revisao", l: "Revisão" },
                { v: "respondida", l: "Respondidas" },
                { v: "todas", l: "Todas" },
              ].map((f) => (
                <button
                  key={f.v}
                  onClick={() => setStatusFilter(f.v)}
                  className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusFilter === f.v ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"}`}
                >
                  {f.l}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[72vh] overflow-y-auto">
            {listQuery.isLoading ? (
              <div className="p-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-400" /></div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">Nenhuma cotação neste filtro.</div>
            ) : filtered.map((q) => {
              const st = STATUS_LABELS[q.status] ?? STATUS_LABELS.nova;
              return (
                <button
                  key={q.id}
                  onClick={() => selectQuotation(q.id)}
                  className={`w-full border-b border-gray-100 px-3 py-3 text-left transition hover:bg-blue-50 ${selectedId === q.id ? "bg-blue-50" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 text-sm font-semibold text-gray-900">{q.subject || "Cotação sem assunto"}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${st.className}`}>{st.label}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs text-gray-500">
                    <span className="truncate">{q.orgao || q.fromName || q.fromAddress || "Origem não identificada"}</span>
                    <span className="shrink-0 font-medium">{q.matchedItems}/{q.totalItems}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {selectedId == null ? (
            <div className="flex min-h-[540px] flex-col items-center justify-center px-6 text-center">
              <MailCheck className="mb-3 h-10 w-10 text-gray-300" />
              <p className="font-semibold text-gray-700">Selecione uma cotação</p>
              <p className="mt-1 max-w-lg text-sm text-gray-400">
                Match, pesquisa de equivalentes, custo real e preço de venda são revisados sem sair desta página.
              </p>
            </div>
          ) : detailQuery.isLoading ? (
            <div className="flex min-h-[540px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
          ) : detailQuery.data ? (
            <QuotationDetail
              data={detailQuery.data as DetailData}
              canEdit={canEdit}
              onBack={() => setSelectedId(null)}
              onChanged={() => {
                utils.emailQuotations.get.invalidate({ id: selectedId });
                utils.emailQuotations.pricingPreview.invalidate({ id: selectedId });
                utils.emailQuotations.suggestSimilar.invalidate({ quotationId: selectedId });
                utils.emailQuotations.list.invalidate();
              }}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
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
  productFreightValue: string | null;
  productTaxValue: string | null;
  productUrl: string | null;
  productSupplierId: number | null;
  productCode: string | null;
  supplierName: string | null;
  categoryName: string | null;
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
    bodyText: string | null;
    prazoResposta: string | Date | null;
    propostaPdfUrl: string | null;
    propostaGeradaEm: string | Date | null;
    propostaMargemPercent: string | null;
  };
  items: DetailItem[];
};

type SimilarCandidate = {
  id: number;
  name: string;
  activeIngredient: string | null;
  manufacturer: string | null;
  concentration: string | null;
  presentation: string | null;
  price: string | null;
  priceUnit: string | null;
  supplierName: string | null;
  categoryName: string | null;
  score: number;
  method: string;
};

function QuotationDetail({ data, canEdit, onChanged, onBack }: { data: DetailData; canEdit: boolean; onChanged: () => void; onBack: () => void }) {
  const [, navigate] = useLocation();
  const { quotation, items } = data;
  const utils = trpc.useUtils();
  const [pickerItem, setPickerItem] = useState<DetailItem | null>(null);
  const [researchItem, setResearchItem] = useState<DetailItem | null>(null);
  const [createItem, setCreateItem] = useState<DetailItem | null>(null);
  const [saleDrafts, setSaleDrafts] = useState<Record<number, string>>({});

  const previewQuery = trpc.emailQuotations.pricingPreview.useQuery({ id: quotation.id });
  const similarQuery = trpc.emailQuotations.suggestSimilar.useQuery({ quotationId: quotation.id });
  const previewById = useMemo(() => new Map((previewQuery.data?.items ?? []).map((p) => [p.quotationItemId, p])), [previewQuery.data]);
  const suggestionById = useMemo(
    () => new Map((similarQuery.data ?? []).map((s) => [s.itemId, (s.candidates?.[0] ?? null) as SimilarCandidate | null])),
    [similarQuery.data],
  );

  useEffect(() => {
    if (!previewQuery.data) return;
    setSaleDrafts((current) => {
      const next = { ...current };
      for (const p of previewQuery.data.items) {
        if (next[p.quotationItemId] === undefined && p.unitPrice != null) next[p.quotationItemId] = p.unitPrice.toFixed(2);
      }
      return next;
    });
  }, [previewQuery.data]);

  const matchMutation = trpc.emailQuotations.setItemMatch.useMutation({
    onSuccess: () => {
      toast.success("Match aprovado e produto vinculado.");
      setPickerItem(null);
      setResearchItem(null);
      onChanged();
    },
    onError: (e) => toast.error(e.message),
  });
  const saleMutation = trpc.emailQuotations.setItemSalePrice.useMutation({
    onSuccess: () => { toast.success("Preço atualizado."); onChanged(); },
    onError: (e) => toast.error(e.message),
  });
  const prazoMutation = trpc.emailQuotations.setPrazo.useMutation({
    onSuccess: onChanged,
    onError: (e) => toast.error(e.message),
  });
  const statusMutation = trpc.emailQuotations.setStatus.useMutation({
    onSuccess: () => { toast.success("Status atualizado."); onChanged(); },
    onError: (e) => toast.error(e.message),
  });
  const orcamentoMutation = trpc.emailQuotations.gerarOrcamento.useMutation({
    onSuccess: (res) => {
      window.open(res.pdfUrl, "_blank");
      toast.success(`Proposta gerada: ${money(res.total)} · margem efetiva ${res.effectiveMarginPercent}%.`);
      onChanged();
    },
    onError: (e) => toast.error(e.message),
  });
  const statusInfo = trpc.emailQuotations.status.useQuery();
  const responderMutation = trpc.emailQuotations.responderPorEmail.useMutation({
    onSuccess: (res) => { toast.success(`Proposta enviada para ${res.to}.`); onChanged(); },
    onError: (e) => toast.error(e.message),
  });
  const funnelMutation = trpc.funil.criarDeCotacao.useMutation({
    onSuccess: ({ id, jaExistia }) => {
      toast.success(jaExistia ? "Oportunidade já existia no Funil." : "Oportunidade criada no Funil.");
      navigate(`/funil?oportunidade=${id}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const prepararPortalMutation = trpc.emailQuotations.prepararParaPortal.useMutation({
    onSuccess: async (res) => {
      await utils.proposals.list.invalidate();
      navigate(`/agente-proposta?propostaId=${res.proposalId}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const isPortalSourced = (quotation.messageId ?? "").startsWith("portal:");
  const canGenerate = previewQuery.data?.canGenerate === true;

  const approve = (item: DetailItem, product: { id: number; price?: string | null }) => {
    matchMutation.mutate({ itemId: item.id, produtoMatchId: product.id, precoSugerido: product.price ?? undefined });
  };

  const saveSale = (itemId: number) => {
    const raw = saleDrafts[itemId]?.replace(",", ".").trim();
    if (!raw) return saleMutation.mutate({ itemId, salePrice: null });
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return toast.error("Informe um preço de venda válido.");
    saleMutation.mutate({ itemId, salePrice: value });
  };

  const restoreAutomatic = (itemId: number) => {
    saleMutation.mutate({ itemId, salePrice: null }, {
      onSuccess: async () => {
        setSaleDrafts((prev) => { const next = { ...prev }; delete next[itemId]; return next; });
        await utils.emailQuotations.pricingPreview.invalidate({ id: quotation.id });
        onChanged();
      },
    });
  };

  return (
    <div>
      <div className="border-b border-gray-100 p-4 lg:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <button onClick={onBack} className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-gray-500 lg:hidden">
              <ChevronLeft className="h-4 w-4" /> Voltar às cotações
            </button>
            <h2 className="text-lg font-bold text-gray-950">{quotation.subject || "Cotação sem assunto"}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
              <span>{quotation.orgao || quotation.fromName || "Origem não identificada"}</span>
              <label className="flex items-center gap-1.5">
                <span className="text-xs">Prazo:</span>
                <input
                  type="date"
                  defaultValue={quotation.prazoResposta ? String(quotation.prazoResposta).slice(0, 10) : ""}
                  onChange={(e) => prazoMutation.mutate({ id: quotation.id, prazoResposta: e.target.value || null })}
                  disabled={!canEdit}
                  className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-700"
                />
              </label>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => orcamentoMutation.mutate({ id: quotation.id })}
              disabled={!canEdit || !canGenerate || orcamentoMutation.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              title={!canGenerate ? "Aprove os matches e confirme os custos antes de gerar" : undefined}
            >
              {orcamentoMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Gerar proposta
            </button>
            {canEdit && (
              <details className="relative">
                <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50"><MoreHorizontal className="h-5 w-5" /></summary>
                <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
                  {statusInfo.data?.smtpConfigured && (
                    <button onClick={() => responderMutation.mutate({ id: quotation.id })} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50">Gerar e enviar por e-mail</button>
                  )}
                  {isPortalSourced && (
                    <button onClick={() => prepararPortalMutation.mutate({ id: quotation.id })} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50"><Bot className="h-4 w-4" /> Preencher no portal</button>
                  )}
                  <button
                    onClick={() => {
                      if (window.confirm("Esta ação cria uma oportunidade real no Funil. Deseja continuar?")) funnelMutation.mutate({ quotationId: quotation.id });
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50"
                  ><KanbanSquare className="h-4 w-4" /> Enviar ao Funil</button>
                  <button onClick={() => statusMutation.mutate({ id: quotation.id, status: "respondida" })} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50">Marcar como respondida</button>
                  <button onClick={() => statusMutation.mutate({ id: quotation.id, status: "descartada" })} className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">Descartar cotação</button>
                </div>
              </details>
            )}
          </div>
        </div>

        {quotation.propostaGeradaEm && quotation.propostaPdfUrl && (
          <a href={quotation.propostaPdfUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700">
            <Sparkles className="h-3.5 w-3.5" /> Ver proposta já gerada <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {previewQuery.data && (
        <div className="grid grid-cols-2 gap-2 border-b border-gray-100 bg-gray-50/60 p-3 md:grid-cols-4 xl:grid-cols-7 lg:p-4">
          <Summary label="Produtos" value={money(previewQuery.data.totalBaseCost)} />
          <Summary label="Frete" value={money(previewQuery.data.totalFreight)} />
          <Summary label="Tributos" value={money(previewQuery.data.totalTaxes)} />
          <Summary label="Custo real" value={money(previewQuery.data.totalCost)} />
          <Summary label="Venda" value={money(previewQuery.data.totalSale)} strong />
          <Summary label="Lucro" value={money(previewQuery.data.totalProfit)} />
          <Summary label="Margem real" value={`${previewQuery.data.effectiveMarginPercent.toFixed(2)}%`} />
        </div>
      )}

      {previewQuery.data && !previewQuery.data.canGenerate && (
        <div className="mx-4 mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {previewQuery.data.unmatchedItems > 0 && <span><strong>{previewQuery.data.unmatchedItems}</strong> item(ns) sem produto.</span>}
          {previewQuery.data.itemsSemCusto > 0 && <span><strong>{previewQuery.data.itemsSemCusto}</strong> item(ns) sem custo real.</span>}
        </div>
      )}

      <div className="space-y-3 p-4">
        {items.map((item) => {
          const pricing = previewById.get(item.id) as any;
          const suggestion = suggestionById.get(item.id) ?? null;
          return (
            <QuotationItemCard
              key={item.id}
              item={item}
              pricing={pricing}
              suggestion={suggestion}
              canEdit={canEdit}
              saleDraft={saleDrafts[item.id]}
              setSaleDraft={(value) => setSaleDrafts((prev) => ({ ...prev, [item.id]: value }))}
              saveSale={() => saveSale(item.id)}
              restoreAutomatic={() => restoreAutomatic(item.id)}
              approveCurrent={() => item.produtoMatchId && approve(item, { id: item.produtoMatchId, price: item.precoSugerido ?? item.productPrice })}
              approveSuggestion={() => suggestion && approve(item, { id: suggestion.id, price: suggestion.price })}
              onChangeProduct={() => setPickerItem(item)}
              onCreateProduct={() => setCreateItem(item)}
              onResearch={() => setResearchItem(item)}
              pending={matchMutation.isPending || saleMutation.isPending}
            />
          );
        })}
      </div>

      {items.length === 0 && <div className="p-10 text-center text-sm text-gray-400">Nenhum item foi extraído desta cotação.</div>}

      {pickerItem && (
        <ProductPicker
          item={pickerItem}
          onClose={() => setPickerItem(null)}
          onSelect={(product) => approve(pickerItem, product)}
          onCreate={() => { setCreateItem(pickerItem); setPickerItem(null); }}
          pending={matchMutation.isPending}
        />
      )}

      {researchItem && (
        <ProductResearchModal
          item={researchItem}
          onClose={() => setResearchItem(null)}
          onUse={(product) => approve(researchItem, product)}
          pending={matchMutation.isPending}
        />
      )}

      {createItem && (
        <QuickCreateProduct
          item={createItem}
          onClose={() => setCreateItem(null)}
          onCreated={(product) => {
            setCreateItem(null);
            approve(createItem, product);
          }}
        />
      )}
    </div>
  );
}

function QuotationItemCard({
  item,
  pricing,
  suggestion,
  canEdit,
  saleDraft,
  setSaleDraft,
  saveSale,
  restoreAutomatic,
  approveCurrent,
  approveSuggestion,
  onChangeProduct,
  onCreateProduct,
  onResearch,
  pending,
}: {
  item: DetailItem;
  pricing: any;
  suggestion: SimilarCandidate | null;
  canEdit: boolean;
  saleDraft?: string;
  setSaleDraft: (value: string) => void;
  saveSale: () => void;
  restoreAutomatic: () => void;
  approveCurrent: () => void;
  approveSuggestion: () => void;
  onChangeProduct: () => void;
  onCreateProduct: () => void;
  onResearch: () => void;
  pending: boolean;
}) {
  const hasCurrent = item.produtoMatchId != null;
  const proposedName = hasCurrent ? item.productName : suggestion?.name;
  const proposedManufacturer = hasCurrent ? item.productManufacturer : suggestion?.manufacturer;
  const proposedDetails = hasCurrent
    ? [item.productConcentration, item.productPresentation].filter(Boolean).join(" · ")
    : [suggestion?.concentration, suggestion?.presentation].filter(Boolean).join(" · ");
  const proposedSupplier = hasCurrent ? item.supplierName : suggestion?.supplierName;
  const score = hasCurrent ? item.matchScore : suggestion?.score;
  const approved = hasCurrent && item.matchConfirmado;

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="grid gap-0 xl:grid-cols-[minmax(260px,1.05fr)_minmax(320px,1.15fr)_minmax(430px,1.35fr)]">
        <div className="border-b border-gray-100 p-4 xl:border-b-0 xl:border-r">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Produto solicitado</div>
          <div className="mt-2 text-sm font-semibold leading-5 text-gray-950">{item.descricao}</div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-500">
            {item.numeroItem != null && <span className="rounded bg-gray-100 px-1.5 py-0.5">Item {item.numeroItem}</span>}
            <span className="rounded bg-gray-100 px-1.5 py-0.5">{item.quantidade ?? "—"} {item.unidade ?? ""}</span>
            {item.codigoCatalogo && <span className="rounded bg-gray-100 px-1.5 py-0.5">Cód. {item.codigoCatalogo}</span>}
          </div>
        </div>

        <div className="border-b border-gray-100 p-4 xl:border-b-0 xl:border-r">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Produto sugerido</div>
            {proposedName && score != null && (
              <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${confidenceClass(score)}`}>Confiança {pct(score)}</span>
            )}
          </div>

          {proposedName ? (
            <div className="mt-2">
              <div className="flex items-start gap-2">
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${approved ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                  {approved ? <Check className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                </span>
                <div className="min-w-0">
                  <div className="font-bold leading-5 text-gray-950">{proposedName}</div>
                  <div className="mt-0.5 text-xs text-gray-500">{[proposedManufacturer, proposedDetails].filter(Boolean).join(" · ") || "Sem detalhes técnicos adicionais"}</div>
                  <div className="mt-0.5 text-xs font-medium text-gray-500">{proposedSupplier || "Fornecedor não informado"}</div>
                  {hasCurrent && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                      <span className={`rounded-full px-2 py-0.5 font-bold ${approved ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {approved ? (item.matchAuto ? "Aprovado automaticamente" : "Match aprovado") : "Aguardando aprovação"}
                      </span>
                      <span className="text-gray-400">Método: {item.matchMethod}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-500">
              A IA ainda não encontrou equivalente com confiança suficiente.
            </div>
          )}

          {canEdit && (
            <div className="mt-4 flex flex-wrap gap-2">
              {!approved && proposedName && (
                <button
                  onClick={hasCurrent ? approveCurrent : approveSuggestion}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                ><CheckCircle2 className="h-3.5 w-3.5" /> Aprovar match</button>
              )}
              <button onClick={onChangeProduct} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50">
                <Search className="h-3.5 w-3.5" /> Trocar produto
              </button>
              <button onClick={onCreateProduct} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50">
                <PackagePlus className="h-3.5 w-3.5" /> Criar produto
              </button>
            </div>
          )}
        </div>

        <div className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Custo e venda</div>
            <button onClick={onResearch} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100">
              <Globe2 className="h-3.5 w-3.5" /> Pesquisar preços e fontes
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Metric icon={<Store className="h-3.5 w-3.5" />} label="Produto" value={money(pricing?.baseCost)} />
            <Metric icon={<Truck className="h-3.5 w-3.5" />} label="Frete" value={money(pricing?.freightValue ?? 0)} />
            <Metric icon={<ReceiptText className="h-3.5 w-3.5" />} label="Tributos" value={money(pricing?.taxValue ?? 0)} />
            <Metric icon={<Database className="h-3.5 w-3.5" />} label="Custo real" value={money(pricing?.custoUnitario)} strong />
            <Metric icon={<Percent className="h-3.5 w-3.5" />} label="Margem" value={pricing?.marginPercent != null ? `${Number(pricing.marginPercent).toFixed(2)}%` : "—"} />
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label>
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">Preço de venda</span>
              <div className="flex items-center rounded-lg border border-gray-200 bg-white px-2 focus-within:border-blue-400">
                <span className="text-xs text-gray-400">R$</span>
                <input
                  value={saleDraft ?? (pricing?.unitPrice != null ? Number(pricing.unitPrice).toFixed(2) : "")}
                  onChange={(e) => setSaleDraft(e.target.value)}
                  onBlur={saveSale}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  disabled={!canEdit || pricing?.unitPrice == null}
                  className="h-9 w-28 px-2 text-right text-sm font-bold outline-none disabled:bg-gray-50"
                />
              </div>
            </label>
            <div className="pb-1 text-xs text-gray-500">
              Total: <strong className="text-gray-900">{money(pricing?.totalPrice)}</strong>
            </div>
            {canEdit && pricing?.pricingMode === "manual" && (
              <button onClick={restoreAutomatic} className="mb-1 text-xs font-semibold text-blue-700 hover:underline">Voltar à margem automática</button>
            )}
          </div>

          {pricing?.costUpdatedAt && (
            <div className="mt-2 text-[10px] text-gray-400">
              Custo com histórico de {new Date(pricing.costUpdatedAt).toLocaleDateString("pt-BR")} · origem {pricing.costSource}.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Metric({ icon, label, value, strong = false }: { icon: React.ReactNode; label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2">
      <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-gray-400">{icon}{label}</div>
      <div className={`mt-1 text-sm ${strong ? "font-extrabold text-blue-700" : "font-bold text-gray-900"}`}>{value}</div>
    </div>
  );
}

function Summary({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-white px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-0.5 text-base ${strong ? "font-extrabold text-blue-700" : "font-bold text-gray-900"}`}>{value}</div>
    </div>
  );
}

type PickerProduct = {
  id: number;
  name: string;
  price: string | null;
  manufacturer: string | null;
  concentration: string | null;
  presentation: string | null;
  supplierName: string | null;
  categoryName: string | null;
  code: string | null;
  productUrl?: string | null;
};

function ProductPicker({ item, onClose, onSelect, onCreate, pending }: { item: DetailItem; onClose: () => void; onSelect: (product: PickerProduct) => void; onCreate: () => void; pending: boolean }) {
  const [query, setQuery] = useState("");
  const effectiveQuery = query.trim() || item.productName || searchTerm(item.descricao);
  const productsQuery = trpc.products.list.useQuery({
    search: effectiveQuery,
    searchField: "all",
    isActive: "yes",
    limit: 40,
    sortBy: "price",
    sortDir: "asc",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-gray-100 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-gray-950">Trocar produto</h3>
              <p className="mt-0.5 line-clamp-2 text-sm text-gray-500">{item.descricao}</p>
            </div>
            <button onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
          </div>
          <div className="mt-3 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nome, código, princípio ativo, marca ou apresentação"
                className="h-11 w-full rounded-lg border border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-blue-400"
              />
            </div>
            <button onClick={onCreate} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-bold text-gray-700 hover:bg-gray-50">
              <PackagePlus className="h-4 w-4" /> Criar novo
            </button>
          </div>
        </div>
        <div className="overflow-y-auto p-3">
          {productsQuery.isLoading ? (
            <div className="p-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-gray-400" /></div>
          ) : productsQuery.data?.items?.length ? (
            <div className="divide-y divide-gray-100 rounded-xl border border-gray-100">
              {productsQuery.data.items.map((product) => (
                <button
                  key={product.id}
                  onClick={() => onSelect(product as PickerProduct)}
                  disabled={pending}
                  className="grid w-full gap-3 px-4 py-3 text-left hover:bg-blue-50 disabled:opacity-50 sm:grid-cols-[minmax(0,1fr)_150px_110px] sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900">{product.name}</div>
                    <div className="mt-0.5 text-xs text-gray-500">{[product.manufacturer, product.concentration, product.presentation].filter(Boolean).join(" · ") || "Sem detalhes adicionais"}</div>
                    <div className="mt-0.5 text-xs text-gray-400">{product.supplierName || "Fornecedor não informado"}{product.code ? ` · cód. ${product.code}` : ""}</div>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="text-[10px] font-bold uppercase text-gray-400">Preço catálogo</div>
                    <div className="font-bold text-gray-900">{money(product.price)}</div>
                  </div>
                  <span className="justify-self-start rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white sm:justify-self-end">Selecionar</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center text-sm text-gray-400">Nenhum produto encontrado. Tente termos mais curtos ou crie o produto.</div>
          )}
        </div>
      </div>
    </div>
  );
}

type ResearchRow = {
  key: string;
  productId: number | null;
  name: string;
  source: string;
  supplier: string | null;
  price: number | null;
  freight: number | null;
  taxes: number | null;
  landedCost: number | null;
  confidence: number | null;
  link: string | null;
  updatedAt: string | Date | null;
  kind: "selected" | "supplier" | "equivalent" | "catalog" | "history";
};

function ProductResearchModal({ item, onClose, onUse, pending }: { item: DetailItem; onClose: () => void; onUse: (product: { id: number; price?: string | null }) => void; pending: boolean }) {
  const queryText = item.productName || searchTerm(item.descricao);
  const catalogQuery = trpc.priceIntelligence.listWithLandedCost.useQuery({ search: queryText, limit: 40 });
  const supplierQuery = trpc.products.getSupplierPrices.useQuery(
    { productId: item.produtoMatchId ?? 0 },
    { enabled: item.produtoMatchId != null },
  );
  const historyQuery = trpc.products.priceHistoryByProduct.useQuery(
    { productId: item.produtoMatchId ?? 0, limit: 12 },
    { enabled: item.produtoMatchId != null },
  );
  const equivalentsQuery = trpc.products.suggestEquivalentsByFichaTecnica.useQuery(
    { productId: item.produtoMatchId ?? 0, limit: 20, onlyWithPrice: true },
    { enabled: item.produtoMatchId != null },
  );

  const rows = useMemo<ResearchRow[]>(() => {
    const out: ResearchRow[] = [];

    if (item.produtoMatchId && item.productName) {
      const price = Number(item.precoSugerido ?? item.productPrice);
      const freight = Number(item.productFreightValue ?? 0);
      const taxes = Number(item.productTaxValue ?? 0);
      out.push({
        key: `selected-${item.produtoMatchId}`,
        productId: item.produtoMatchId,
        name: item.productName,
        source: "Produto atualmente sugerido",
        supplier: item.supplierName,
        price: Number.isFinite(price) ? price : null,
        freight: Number.isFinite(freight) ? freight : 0,
        taxes: Number.isFinite(taxes) ? taxes : 0,
        landedCost: Number.isFinite(price) ? price + (Number.isFinite(freight) ? freight : 0) + (Number.isFinite(taxes) ? taxes : 0) : null,
        confidence: item.matchScore != null ? Number(item.matchScore) : null,
        link: item.productUrl,
        updatedAt: null,
        kind: "selected",
      });
    }

    for (const offer of supplierQuery.data ?? []) {
      const price = Number(offer.promoPrice ?? offer.price);
      out.push({
        key: `supplier-${offer.id}`,
        productId: item.produtoMatchId,
        name: item.productName || item.descricao,
        source: "Fornecedor / fonte externa sincronizada",
        supplier: offer.supplierName ?? null,
        price: Number.isFinite(price) ? price : null,
        freight: null,
        taxes: null,
        landedCost: Number.isFinite(price) ? price : null,
        confidence: 1,
        link: offer.linkProduto ?? null,
        updatedAt: offer.updatedAt ?? null,
        kind: "supplier",
      });
    }

    for (const equivalent of (equivalentsQuery.data as any)?.equivalents ?? []) {
      const price = Number(equivalent.price);
      const rawScore = Number(equivalent.score);
      out.push({
        key: `equivalent-${equivalent.id}`,
        productId: equivalent.id,
        name: equivalent.name,
        source: `Equivalente técnico · ${equivalent.status ?? "revisão"}`,
        supplier: equivalent.supplierName ?? null,
        price: Number.isFinite(price) ? price : null,
        freight: null,
        taxes: null,
        landedCost: Number.isFinite(price) ? price : null,
        confidence: Number.isFinite(rawScore) ? (rawScore > 1 ? rawScore / 100 : rawScore) : null,
        link: equivalent.productUrl ?? null,
        updatedAt: null,
        kind: "equivalent",
      });
    }

    for (const product of catalogQuery.data ?? []) {
      const price = Number(product.price);
      const freight = Number((product as any).freightValue ?? 0);
      const taxes = Number((product as any).taxValue ?? 0);
      const landed = Number((product as any).landedCost);
      out.push({
        key: `catalog-${product.id}`,
        productId: product.id,
        name: product.name,
        source: "Catálogo interno / base de preços",
        supplier: product.supplierName ?? null,
        price: Number.isFinite(price) ? price : null,
        freight: Number.isFinite(freight) ? freight : 0,
        taxes: Number.isFinite(taxes) ? taxes : 0,
        landedCost: Number.isFinite(landed) ? landed : (Number.isFinite(price) ? price : null),
        confidence: product.id === item.produtoMatchId ? 1 : null,
        link: product.productUrl ?? null,
        updatedAt: null,
        kind: "catalog",
      });
    }

    for (const h of historyQuery.data ?? []) {
      const price = Number(h.precoNovo ?? h.price);
      const landed = Number(h.landedCost);
      out.push({
        key: `history-${h.id}`,
        productId: item.produtoMatchId,
        name: item.productName || item.descricao,
        source: `Fornecedor anterior / histórico${h.origem ? ` · ${h.origem}` : ""}`,
        supplier: null,
        price: Number.isFinite(price) ? price : null,
        freight: h.freightValue != null ? Number(h.freightValue) : null,
        taxes: h.taxValue != null ? Number(h.taxValue) : null,
        landedCost: Number.isFinite(landed) ? landed : (Number.isFinite(price) ? price : null),
        confidence: 1,
        link: null,
        updatedAt: h.recordedAt ?? null,
        kind: "history",
      });
    }

    const priority: Record<ResearchRow["kind"], number> = { selected: 0, supplier: 1, equivalent: 2, catalog: 3, history: 4 };
    return out
      .filter((row, index, arr) => arr.findIndex((other) => other.key === row.key) === index)
      .sort((a, b) => {
        const confA = a.confidence ?? -1;
        const confB = b.confidence ?? -1;
        if (confA !== confB) return confB - confA;
        const costA = a.landedCost ?? Number.POSITIVE_INFINITY;
        const costB = b.landedCost ?? Number.POSITIVE_INFINITY;
        if (costA !== costB) return costA - costB;
        return priority[a.kind] - priority[b.kind];
      });
  }, [item, catalogQuery.data, supplierQuery.data, equivalentsQuery.data, historyQuery.data]);

  const loading = catalogQuery.isLoading || supplierQuery.isLoading || historyQuery.isLoading || equivalentsQuery.isLoading;
  const refetchAll = () => {
    catalogQuery.refetch();
    if (item.produtoMatchId) {
      supplierQuery.refetch();
      historyQuery.refetch();
      equivalentsQuery.refetch();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-gray-100 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2"><Globe2 className="h-5 w-5 text-blue-600" /><h3 className="font-bold text-gray-950">Pesquisa automática e ranking</h3></div>
              <p className="mt-1 max-w-3xl text-sm text-gray-500">{item.descricao}</p>
              <p className="mt-1 text-xs text-gray-400">
                Consolida catálogo, equivalentes técnicos, ofertas capturadas de fornecedores e histórico. Preços externos exibidos são somente os já sincronizados pelos conectores autorizados do S2Licit.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={refetchAll} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50"><RefreshCw className="h-3.5 w-3.5" /> Atualizar ranking</button>
              <button onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wide text-gray-500">
            <span className="rounded-full bg-gray-100 px-2.5 py-1">Catálogo interno</span>
            <span className="rounded-full bg-gray-100 px-2.5 py-1">Equivalentes</span>
            <span className="rounded-full bg-gray-100 px-2.5 py-1">Distribuidores / fornecedores</span>
            <span className="rounded-full bg-gray-100 px-2.5 py-1">Histórico</span>
            <span className="rounded-full bg-gray-100 px-2.5 py-1">Links externos sincronizados</span>
          </div>
        </div>

        <div className="overflow-auto">
          {loading && rows.length === 0 ? (
            <div className="p-14 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-gray-400" /><div className="mt-2 text-sm text-gray-400">Consolidando fontes…</div></div>
          ) : rows.length === 0 ? (
            <div className="p-14 text-center text-sm text-gray-400">Nenhuma fonte compatível foi encontrada com os dados atualmente sincronizados.</div>
          ) : (
            <table className="w-full min-w-[1020px] text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="border-b border-gray-200 text-left text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Ranking / produto</th>
                  <th className="px-3 py-3">Fonte</th>
                  <th className="px-3 py-3">Fornecedor</th>
                  <th className="px-3 py-3 text-right">Preço</th>
                  <th className="px-3 py-3 text-right">Frete</th>
                  <th className="px-3 py-3 text-right">Tributos</th>
                  <th className="px-3 py-3 text-right">Custo</th>
                  <th className="px-3 py-3 text-right">Confiança</th>
                  <th className="px-4 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row, index) => (
                  <tr key={row.key} className="hover:bg-blue-50/40">
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-900 text-[10px] font-bold text-white">{index + 1}</span>
                        <div>
                          <div className="font-semibold text-gray-900">{row.name}</div>
                          {row.updatedAt && <div className="mt-0.5 text-[10px] text-gray-400">Atualizado em {new Date(row.updatedAt).toLocaleString("pt-BR")}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-600">{row.source}</td>
                    <td className="px-3 py-3 text-xs font-medium text-gray-700">{row.supplier || "—"}</td>
                    <td className="px-3 py-3 text-right font-semibold">{money(row.price)}</td>
                    <td className="px-3 py-3 text-right text-gray-600">{row.freight == null ? "—" : money(row.freight)}</td>
                    <td className="px-3 py-3 text-right text-gray-600">{row.taxes == null ? "—" : money(row.taxes)}</td>
                    <td className="px-3 py-3 text-right font-bold text-gray-900">{money(row.landedCost)}</td>
                    <td className="px-3 py-3 text-right">
                      {row.confidence != null ? <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${confidenceClass(row.confidence)}`}>{pct(row.confidence)}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {row.link && (
                          <a href={row.link} target="_blank" rel="noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50" title="Abrir fonte"><ExternalLink className="h-3.5 w-3.5" /></a>
                        )}
                        {row.productId != null && row.price != null && (
                          <button
                            onClick={() => onUse({ id: row.productId!, price: String(row.price) })}
                            disabled={pending}
                            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                          >Usar <ArrowRight className="h-3 w-3" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function QuickCreateProduct({ item, onClose, onCreated }: { item: DetailItem; onClose: () => void; onCreated: (product: { id: number; price?: string | null }) => void }) {
  const suppliersQuery = trpc.suppliers.list.useQuery({ activeOnly: true });
  const categoriesQuery = trpc.categories.list.useQuery();
  const [form, setForm] = useState({
    name: item.descricao.slice(0, 300),
    supplierId: "",
    categoryId: "",
    price: "",
    manufacturer: "",
    concentration: "",
    presentation: "",
  });

  const createMutation = trpc.products.create.useMutation({
    onSuccess: (res: any) => {
      const id = Number(res?.insertId);
      if (!Number.isInteger(id) || id <= 0) {
        toast.error("Produto criado, mas o identificador não retornou. Abra o catálogo para vinculá-lo.");
        return;
      }
      toast.success("Produto criado no catálogo.");
      onCreated({ id, price: form.price || null });
    },
    onError: (e) => toast.error(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const supplierId = Number(form.supplierId);
    const categoryId = Number(form.categoryId);
    if (!Number.isInteger(supplierId) || supplierId <= 0) return toast.error("Selecione o fornecedor.");
    if (!Number.isInteger(categoryId) || categoryId <= 0) return toast.error("Selecione a categoria.");
    createMutation.mutate({
      name: form.name.trim(),
      supplierId,
      categoryId,
      price: form.price.trim() || null,
      manufacturer: form.manufacturer.trim() || null,
      concentration: form.concentration.trim() || null,
      presentation: form.presentation.trim() || null,
      isActive: "yes",
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={submit} className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 p-4">
          <div><h3 className="font-bold text-gray-950">Criar produto a partir da cotação</h3><p className="mt-1 text-sm text-gray-500">Cadastre o mínimo necessário agora; os demais dados podem ser enriquecidos depois.</p></div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <label className="sm:col-span-2"><FieldLabel>Nome do produto</FieldLabel><input required maxLength={512} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400" /></label>
          <label><FieldLabel>Fornecedor *</FieldLabel><select required value={form.supplierId} onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm"><option value="">Selecione</option>{(suppliersQuery.data ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label><FieldLabel>Categoria *</FieldLabel><select required value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm"><option value="">Selecione</option>{(categoriesQuery.data ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label><FieldLabel>Custo unitário</FieldLabel><input inputMode="decimal" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value.replace(",", ".") }))} placeholder="0,00" className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400" /></label>
          <label><FieldLabel>Fabricante</FieldLabel><input value={form.manufacturer} onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400" /></label>
          <label><FieldLabel>Concentração</FieldLabel><input value={form.concentration} onChange={(e) => setForm((f) => ({ ...f, concentration: e.target.value }))} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400" /></label>
          <label><FieldLabel>Apresentação</FieldLabel><input value={form.presentation} onChange={(e) => setForm((f) => ({ ...f, presentation: e.target.value }))} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400" /></label>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 p-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700">Cancelar</button>
          <button type="submit" disabled={createMutation.isPending} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">{createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />} Criar e vincular</button>
        </div>
      </form>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400">{children}</span>;
}
