import { useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, Download, RotateCcw, Sparkles, XCircle } from "lucide-react";

export const ALL_STATUS = "__all_status__";
export const ALL_SOURCES = "__all_sources__";
export const ALL_SUPPLIERS = "__all_suppliers__";
export function mapSupplierFilterValue(value: string): number | undefined {
  if (value === ALL_SUPPLIERS) return undefined;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

type ReviewStatus = "pending" | "approved" | "rejected" | "applied";
type SourceType = "url" | "html" | "pdf" | "spreadsheet" | "xml" | "docx" | "text" | "image";
type UndoItemSnapshot = { id: number; previousStatus: ReviewStatus };
type LastBatchAction = { actionType: "approve" | "reject"; itemCount: number; items: UndoItemSnapshot[] };

export function mapStatusFilterValue(value: string): ReviewStatus | undefined {
  return value === ALL_STATUS ? undefined : (value as ReviewStatus);
}

const SOURCE_LABELS: Record<SourceType, string> = {
  url: "Site", html: "HTML", pdf: "PDF", spreadsheet: "Planilha", xml: "XML", docx: "DOCX", text: "Texto", image: "Imagem / OCR",
};

function formatStatusLabel(status: ReviewStatus) {
  if (status === "pending") return "Pendente";
  if (status === "approved") return "Aprovado";
  if (status === "rejected") return "Rejeitado";
  return "Aplicado";
}

function statusBadge(status: ReviewStatus) {
  const map: Record<ReviewStatus, string> = {
    pending: "border-amber-200 bg-amber-50 text-amber-700",
    approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
    rejected: "border-red-200 bg-red-50 text-red-700",
    applied: "border-blue-200 bg-blue-50 text-blue-700",
  };
  return <Badge variant="outline" className={map[status]}>{status === "pending" ? <AlertCircle className="mr-1 h-3 w-3" /> : status === "rejected" ? <XCircle className="mr-1 h-3 w-3" /> : <CheckCircle className="mr-1 h-3 w-3" />}{formatStatusLabel(status)}</Badge>;
}

export function CaptureReview() {
  const utils = trpc.useUtils();
  const [source, setSource] = useState<SourceType | undefined>();
  const [status, setStatus] = useState<ReviewStatus | undefined>();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [limit] = useState(30);
  const [offset, setOffset] = useState(0);
  const [lastBatchAction, setLastBatchAction] = useState<LastBatchAction | null>(null);

  const pendingQuery = trpc.captureReview.listPending.useQuery({ sourceType: source, status, limit, offset }, { placeholderData: (prev) => prev });
  const statsQuery = trpc.captureReview.getReviewStats.useQuery({ sourceType: source });
  const sourcesQuery = trpc.captureReview.getSourcesWithPending.useQuery();

  const invalidate = async () => {
    await Promise.all([
      utils.captureReview.listPending.invalidate(),
      utils.captureReview.getReviewStats.invalidate(),
      utils.captureReview.getSourcesWithPending.invalidate(),
      utils.intelligentCapture.listBatches.invalidate(),
    ]);
  };

  const approveMutation = trpc.captureReview.approveBatch.useMutation({ onSuccess: async () => { await invalidate(); toast.success("Itens aprovados."); }, onError: (e) => toast.error(e.message) });
  const rejectMutation = trpc.captureReview.rejectBatch.useMutation({ onSuccess: async () => { await invalidate(); toast.success("Itens rejeitados."); }, onError: (e) => toast.error(e.message) });
  const applyMutation = trpc.captureReview.applyApprovedChanges.useMutation({
    onSuccess: async (result) => {
      await invalidate();
      if (result.skipped) toast.warning(`${result.applied} aplicado(s); ${result.skipped} sem match permaneceram aprovados para tratamento manual.`);
      else toast.success(`${result.applied} item(ns) aplicado(s) ao catálogo.`);
      setSelectedIds(new Set());
    },
    onError: (e) => toast.error(e.message),
  });
  const undoMutation = trpc.captureReview.undoBatchAction.useMutation({ onSuccess: async (r) => { await invalidate(); setLastBatchAction(null); toast.success(`${r.restored} item(ns) restaurado(s).`); }, onError: (e) => toast.error(e.message) });
  const exportMutation = trpc.captureReview.exportChanges.useMutation({ onError: (e) => toast.error(e.message) });

  const items = pendingQuery.data?.items ?? [];
  const selectedItems = useMemo(() => items.filter((item) => selectedIds.has(item.id)), [items, selectedIds]);
  const selectedApproved = selectedItems.length > 0 && selectedItems.every((item) => item.status === "approved");

  const toggleAll = () => setSelectedIds((current) => current.size === items.length ? new Set() : new Set(items.map((item) => item.id)));
  const toggleOne = (id: number) => setSelectedIds((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const snapshot = async (): Promise<UndoItemSnapshot[]> => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return [];
    const rows = await utils.captureReview.getItemsByIds.fetch({ ids });
    return rows.map((row) => ({ id: row.id, previousStatus: row.status }));
  };

  const approve = async () => {
    if (!selectedIds.size) return;
    const itemsBefore = await snapshot();
    await approveMutation.mutateAsync({ ids: Array.from(selectedIds) });
    setLastBatchAction({ actionType: "approve", itemCount: itemsBefore.length, items: itemsBefore });
    setSelectedIds(new Set());
  };
  const reject = async () => {
    if (!selectedIds.size) return;
    const itemsBefore = await snapshot();
    await rejectMutation.mutateAsync({ ids: Array.from(selectedIds) });
    setLastBatchAction({ actionType: "reject", itemCount: itemsBefore.length, items: itemsBefore });
    setSelectedIds(new Set());
  };
  const exportCsv = async () => {
    const result = await exportMutation.mutateAsync({ sourceType: source, status });
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(result.csv);
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const stats = statsQuery.data;
  const statCards = [
    ["Total", stats?.total ?? 0, "text-slate-900"],
    ["Pendentes", stats?.pendingReview ?? 0, "text-amber-600"],
    ["Aprovados", stats?.approved ?? 0, "text-emerald-600"],
    ["Rejeitados", stats?.rejected ?? 0, "text-red-600"],
    ["Aplicados", stats?.applied ?? 0, "text-blue-600"],
  ] as const;

  return (
    <div className="space-y-5 pb-8">
      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <div className="bg-gradient-to-r from-[#0f2358] via-[#1A3F8F] to-[#1f6fb2] px-6 py-6 text-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]"><Sparkles className="h-3.5 w-3.5" /> Central de revisão</div>
              <h1 className="mt-2 text-3xl font-black tracking-tight">Revisão de Captura</h1>
              <p className="mt-2 max-w-3xl text-sm text-blue-100/90">Os itens exibidos aqui são os mesmos lotes gerados pela Captura Inteligente. Aprove ou rejeite antes de qualquer alteração no catálogo.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={exportCsv} disabled={exportMutation.isPending}><Download className="mr-2 h-4 w-4" /> Exportar CSV</Button>
              <Button variant="outline" className="border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100" onClick={() => lastBatchAction && undoMutation.mutate({ items: lastBatchAction.items })} disabled={!lastBatchAction || undoMutation.isPending}><RotateCcw className="mr-2 h-4 w-4" /> Desfazer última ação</Button>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {statCards.map(([label, value, tone]) => <Card key={label} className="border-slate-200 p-4 shadow-sm"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div><div className={`mt-2 text-3xl font-black ${tone}`}>{value}</div></Card>)}
      </div>

      <Card className="border-slate-200 p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_auto]">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Origem</label>
            <Select value={source ?? ALL_SOURCES} onValueChange={(value) => { setOffset(0); setSource(value === ALL_SOURCES ? undefined : value as SourceType); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SOURCES}>Todas as origens</SelectItem>
                {(sourcesQuery.data ?? []).map((row) => <SelectItem key={row.sourceType} value={row.sourceType}>{SOURCE_LABELS[row.sourceType as SourceType]} ({row.pendingCount})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Status</label>
            <Select value={status ?? ALL_STATUS} onValueChange={(value) => { setOffset(0); setStatus(mapStatusFilterValue(value)); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STATUS}>Todos</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="approved">Aprovado</SelectItem>
                <SelectItem value="rejected">Rejeitado</SelectItem>
                <SelectItem value="applied">Aplicado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end"><div className="rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-600">{pendingQuery.data?.total ?? 0} registro(s)</div></div>
        </div>
      </Card>

      {selectedIds.size > 0 && (
        <Card className="border-blue-200 bg-blue-50/70 p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div><div className="font-semibold text-blue-950">{selectedIds.size} item(ns) selecionado(s)</div><div className="mt-1 text-sm text-blue-800">{selectedItems.slice(0, 2).map((item) => item.productName).join(", ")}{selectedItems.length > 2 ? ` e mais ${selectedItems.length - 2}` : ""}</div></div>
            <div className="flex flex-wrap gap-2">
              {selectedApproved && <Button onClick={() => applyMutation.mutate({ ids: Array.from(selectedIds) })} disabled={applyMutation.isPending}><Sparkles className="mr-2 h-4 w-4" /> Aplicar ao catálogo</Button>}
              <Button onClick={approve} disabled={approveMutation.isPending}><CheckCircle className="mr-2 h-4 w-4" /> Aprovar</Button>
              <Button variant="destructive" onClick={reject} disabled={rejectMutation.isPending}><XCircle className="mr-2 h-4 w-4" /> Rejeitar</Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden border-slate-200 shadow-sm">
        {pendingQuery.isLoading ? <div className="p-10 text-center text-sm text-slate-500">Carregando revisão...</div> : items.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead className="bg-slate-100/80 text-slate-700"><tr>
                <th className="px-4 py-3 text-left"><Checkbox checked={selectedIds.size === items.length && items.length > 0} onCheckedChange={() => toggleAll()} /></th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase">Produto capturado</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase">Origem</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase">Match no catálogo</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase">Preço</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase">Ação sugerida</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase">Data</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {items.map((item) => <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3"><Checkbox checked={selectedIds.has(item.id)} onCheckedChange={() => toggleOne(item.id)} /></td>
                  <td className="px-4 py-3"><div className="font-semibold text-slate-900">{item.productName}</div><div className="mt-1 text-xs text-slate-500">{[item.manufacturer, item.presentation, item.category].filter(Boolean).join(" · ") || "Sem detalhes adicionais"}</div></td>
                  <td className="px-4 py-3 text-sm text-slate-700"><div>{SOURCE_LABELS[item.sourceType as SourceType]}</div><div className="mt-1 max-w-[220px] truncate text-xs text-slate-400">{item.sourceLabel || `Lote #${item.batchId}`}</div></td>
                  <td className="px-4 py-3 text-sm">{item.matchedProductId ? <><div className="font-medium text-emerald-700">{item.matchedProductName || `Produto #${item.matchedProductId}`}</div><div className="mt-1 text-xs text-slate-500">{item.duplicateSignal}</div></> : <span className="font-medium text-amber-700">Sem match — revisão manual</span>}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-800">{item.price != null ? Number(item.price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{item.actionSuggestion === "create" ? "Criar" : item.actionSuggestion === "update" ? "Atualizar" : item.actionSuggestion === "ignore" ? "Ignorar" : "Revisar"}</td>
                  <td className="px-4 py-3">{statusBadge(item.status as ReviewStatus)}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{new Date(item.createdAt).toLocaleDateString("pt-BR")}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        ) : <div className="p-10 text-center"><div className="font-semibold text-slate-700">Nenhum item neste filtro</div><div className="mt-2 text-sm text-slate-500">Nova captura aparecerá aqui imediatamente para revisão.</div></div>}
      </Card>

      {(pendingQuery.data?.total ?? 0) > limit && <div className="flex items-center justify-between"><Button variant="outline" onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}>Anterior</Button><span className="text-sm text-slate-600">Página {Math.floor(offset / limit) + 1}</span><Button variant="outline" onClick={() => setOffset(offset + limit)} disabled={offset + limit >= (pendingQuery.data?.total ?? 0)}>Próxima</Button></div>}
    </div>
  );
}
