import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { usePermission } from "@/components/RequireAuth";
import {
  AlertCircle,
  Bot,
  Check,
  ChevronLeft,
  ExternalLink,
  FileText,
  Globe2,
  KanbanSquare,
  Loader2,
  MailCheck,
  MoreHorizontal,
  RefreshCw,
  Search,
  Sparkles,
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
    <div className="mx-auto max-w-[1700px] p-4 lg:p-6">
      <header className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <MailCheck className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold tracking-tight text-gray-950">Cotações recebidas</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">Selecione a cotação, vincule o produto, confira o custo e defina a venda.</p>
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
              {[{ v: "abertas", l: "Abertas" }, { v: "revisao", l: "Revisão" }, { v: "respondida", l: "Respondidas" }, { v: "todas", l: "Todas" }].map((f) => (
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
            <div className="flex min-h-[520px] flex-col items-center justify-center px-6 text-center">
              <MailCheck className="mb-3 h-10 w-10 text-gray-300" />
              <p className="font-semibold text-gray-700">Selecione uma cotação</p>
              <p className="mt-1 max-w-md text-sm text-gray-400">O trabalho de match e precificação será feito integralmente aqui, sem sair desta tela.</p>
            </div>
          ) : detailQuery.isLoading ? (
            <div className="flex min-h-[520px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
          ) : detailQuery.data ? (
            <QuotationDetail
              data={detailQuery.data as DetailData}
              canEdit={canEdit}
              onBack={() => setSelectedId(null)}
              onChanged={() => {
                utils.emailQuotations.get.invalidate({ id: selectedId });
                utils.emailQuotations.pricingPreview.invalidate({ id: selectedId });
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

function QuotationDetail({ data, canEdit, onChanged, onBack }: { data: DetailData; canEdit: boolean; onChanged: () => void; onBack: () => void }) {
  const [, navigate] = useLocation();
  const { quotation, items } = data;
  const utils = trpc.useUtils();
  const [pickerItem, setPickerItem] = useState<DetailItem | null>(null);
  const [saleDrafts, setSaleDrafts] = useState<Record<number, string>>({});

  const previewQuery = trpc.emailQuotations.pricingPreview.useQuery({ id: quotation.id });
  const previewById = useMemo(() => new Map((previewQuery.data?.items ?? []).map((p) => [p.quotationItemId, p])), [previewQuery.data]);

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
    onSuccess: () => { toast.success("Produto vinculado."); setPickerItem(null); onChanged(); },
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
              title={!canGenerate ? "Selecione todos os produtos e confirme os custos antes de gerar" : undefined}
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
                  ><KanbanSquare className="h-4 w-4" /> Enviar ao Funil (cria oportunidade)</button>
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
        <div className="grid grid-cols-2 gap-2 border-b border-gray-100 bg-gray-50/60 p-3 md:grid-cols-4 lg:p-4">
          <Summary label="Custo total" value={money(previewQuery.data.totalCost)} />
          <Summary label="Venda total" value={money(previewQuery.data.totalSale)} strong />
          <Summary label="Lucro estimado" value={money(previewQuery.data.totalProfit)} />
          <Summary label="Margem real" value={`${previewQuery.data.effectiveMarginPercent.toFixed(2)}%`} />
        </div>
      )}

      {previewQuery.data && !previewQuery.data.canGenerate && (
        <div className="mx-4 mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {previewQuery.data.unmatchedItems > 0 && <span><strong>{previewQuery.data.unmatchedItems}</strong> item(ns) sem produto.</span>}
          {previewQuery.data.itemsSemCusto > 0 && <span><strong>{previewQuery.data.itemsSemCusto}</strong> item(ns) sem custo.</span>}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1050px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-white text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3 w-[30%]">Item solicitado</th>
              <th className="px-3 py-3">Qtd.</th>
              <th className="px-3 py-3 w-[29%]">Produto selecionado</th>
              <th className="px-3 py-3 text-right">Custo</th>
              <th className="px-3 py-3 w-[135px]">Venda</th>
              <th className="px-3 py-3 text-right">Margem</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((item) => {
              const p = previewById.get(item.id);
              return (
                <tr key={item.id} className="align-top hover:bg-gray-50/60">
                  <td className="px-4 py-3">
                    <div className="font-medium leading-5 text-gray-900">{item.descricao}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-gray-400">
                      {item.numeroItem != null && <span>Item {item.numeroItem}</span>}
                      {item.codigoCatalogo && <span>Cód. {item.codigoCatalogo}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-gray-700">{item.quantidade ?? "—"} {item.unidade ?? ""}</td>
                  <td className="px-3 py-3">
                    {item.produtoMatchId ? (
                      <div>
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-3 w-3" /></span>
                          <div className="min-w-0">
                            <div className="font-semibold leading-5 text-gray-900">{item.productName || `Produto #${item.produtoMatchId}`}</div>
                            <div className="mt-0.5 text-xs text-gray-500">{[item.productManufacturer, item.productConcentration, item.productPresentation].filter(Boolean).join(" · ")}</div>
                            <div className="mt-0.5 text-xs font-medium text-gray-500">{item.supplierName || "Fornecedor não informado"}</div>
                          </div>
                        </div>
                        {canEdit && <button onClick={() => setPickerItem(item)} className="mt-2 text-xs font-semibold text-blue-700 hover:underline">Trocar produto</button>}
                      </div>
                    ) : (
                      <button
                        onClick={() => canEdit && setPickerItem(item)}
                        disabled={!canEdit}
                        className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                      ><Search className="h-3.5 w-3.5" /> Selecionar produto</button>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-gray-800">{p?.custoUnitario != null ? money(p.custoUnitario) : "—"}</td>
                  <td className="px-3 py-3">
                    {p?.unitPrice != null ? (
                      <div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-400">R$</span>
                          <input
                            value={saleDrafts[item.id] ?? p.unitPrice.toFixed(2)}
                            onChange={(e) => setSaleDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            onBlur={() => saveSale(item.id)}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            disabled={!canEdit}
                            className="w-24 rounded-md border border-gray-200 px-2 py-1.5 text-right font-semibold outline-none focus:border-blue-400 disabled:bg-gray-50"
                          />
                        </div>
                        <div className="mt-1 flex items-center gap-1">
                          <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${p.pricingMode === "manual" ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-500"}`}>{p.pricingMode === "manual" ? "Manual" : "Automático"}</span>
                          {canEdit && p.pricingMode === "manual" && <button onClick={() => restoreAutomatic(item.id)} className="text-[10px] text-gray-500 hover:underline">usar margem</button>}
                        </div>
                      </div>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className={`px-3 py-3 text-right font-semibold ${p?.belowCost ? "text-red-600" : "text-gray-700"}`}>{p?.marginPercent != null ? `${p.marginPercent.toFixed(2)}%` : "—"}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{p?.totalPrice != null ? money(p.totalPrice) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {items.length === 0 && <div className="p-10 text-center text-sm text-gray-400">Nenhum item foi extraído desta cotação.</div>}

      {pickerItem && (
        <ProductPicker
          item={pickerItem}
          onClose={() => setPickerItem(null)}
          onSelect={(product) => matchMutation.mutate({ itemId: pickerItem.id, produtoMatchId: product.id, precoSugerido: product.price ?? null })}
          pending={matchMutation.isPending}
        />
      )}
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
};

function ProductPicker({ item, onClose, onSelect, pending }: { item: DetailItem; onClose: () => void; onSelect: (product: PickerProduct) => void; pending: boolean }) {
  const [query, setQuery] = useState("");
  const effectiveQuery = query.trim();
  const productsQuery = trpc.products.list.useQuery(
    {
      search: effectiveQuery || item.descricao.slice(0, 120),
      searchField: "all",
      isActive: "yes",
      limit: 30,
      sortBy: "price",
      sortDir: "asc",
    },
    { enabled: true },
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-gray-100 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-gray-950">Selecionar produto para o match</h3>
              <p className="mt-0.5 line-clamp-2 text-sm text-gray-500">{item.descricao}</p>
            </div>
            <button onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
          </div>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Digite nome, código, princípio ativo, marca ou apresentação"
              className="h-11 w-full rounded-lg border border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-blue-400"
            />
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
                  className="grid w-full grid-cols-[minmax(0,1fr)_140px_110px] items-center gap-4 px-4 py-3 text-left hover:bg-blue-50 disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900">{product.name}</div>
                    <div className="mt-0.5 text-xs text-gray-500">{[product.manufacturer, product.concentration, product.presentation].filter(Boolean).join(" · ") || "Sem detalhes adicionais"}</div>
                    <div className="mt-0.5 text-xs text-gray-400">{product.supplierName || "Fornecedor não informado"}{product.code ? ` · cód. ${product.code}` : ""}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-bold uppercase text-gray-400">Custo</div>
                    <div className="font-bold text-gray-900">{money(product.price)}</div>
                  </div>
                  <span className="justify-self-end rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white">Selecionar</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center text-sm text-gray-400">Nenhum produto encontrado. Simplifique os termos da busca.</div>
          )}
        </div>
      </div>
    </div>
  );
}
