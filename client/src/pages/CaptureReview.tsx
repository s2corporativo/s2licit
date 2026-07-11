import { useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  CheckCircle,
  Download,
  RotateCcw,
  Sparkles,
  XCircle,
} from "lucide-react";

export const ALL_SUPPLIERS = "__all_suppliers__";
export const ALL_STATUS = "__all_status__";

type ReviewStatus = "detected" | "approved" | "rejected" | "applied";

type UndoItemSnapshot = {
  id: number;
  previousStatus: ReviewStatus;
  previousApprovedBy?: number | null;
  previousApprovedAt?: string | null;
};

type LastBatchAction = {
  actionType: "approve" | "reject";
  itemCount: number;
  items: UndoItemSnapshot[];
};

export function mapSupplierFilterValue(value: string): number | undefined {
  if (value === ALL_SUPPLIERS) return undefined;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function mapStatusFilterValue(value: string): ReviewStatus | undefined {
  return value === ALL_STATUS ? undefined : (value as ReviewStatus);
}

function formatStatusLabel(status: ReviewStatus) {
  switch (status) {
    case "detected":
      return "Detectado";
    case "approved":
      return "Aprovado";
    case "rejected":
      return "Rejeitado";
    case "applied":
      return "Aplicado";
    default:
      return status;
  }
}

export function CaptureReview() {
  const utils = trpc.useUtils();
  const [supplierId, setSupplierId] = useState<number | undefined>();
  const [status, setStatus] = useState<ReviewStatus | undefined>();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [limit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [lastBatchAction, setLastBatchAction] = useState<LastBatchAction | null>(null);

  const { data: pendingProducts, isLoading: loadingPending } =
    trpc.captureReview.listPending.useQuery({
      supplierId,
      status,
      limit,
      offset,
    });

  const { data: stats } = trpc.captureReview.getReviewStats.useQuery({
    supplierId,
  });

  const { data: suppliers } = trpc.captureReview.getSuppliersWithPending.useQuery();

  const approveMutation = trpc.captureReview.approveBatch.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.captureReview.listPending.invalidate(),
        utils.captureReview.getReviewStats.invalidate(),
        utils.captureReview.getSuppliersWithPending.invalidate(),
      ]);
      toast.success("Itens aprovados com sucesso.");
    },
    onError: (error) => toast.error(error.message),
  });

  const rejectMutation = trpc.captureReview.rejectBatch.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.captureReview.listPending.invalidate(),
        utils.captureReview.getReviewStats.invalidate(),
        utils.captureReview.getSuppliersWithPending.invalidate(),
      ]);
      toast.success("Itens rejeitados com sucesso.");
    },
    onError: (error) => toast.error(error.message),
  });

  const undoMutation = trpc.captureReview.undoBatchAction.useMutation({
    onSuccess: async (result) => {
      if (!result.success) {
        toast.error(result.error ?? "Não foi possível desfazer a última ação.");
        return;
      }
      await Promise.all([
        utils.captureReview.listPending.invalidate(),
        utils.captureReview.getReviewStats.invalidate(),
        utils.captureReview.getSuppliersWithPending.invalidate(),
      ]);
      setLastBatchAction(null);
      toast.success(`Última ação desfeita em ${result.restored} item(ns).`);
    },
    onError: (error) => toast.error(error.message),
  });

  const exportMutation = trpc.captureReview.exportChanges.useMutation({
    onError: (error) => toast.error(error.message),
  });

  const selectedItems = useMemo(
    () => pendingProducts?.items.filter((item: any) => selectedIds.has(item.id)) ?? [],
    [pendingProducts?.items, selectedIds]
  );

  const handleSelectAll = () => {
    if (!pendingProducts?.items) return;

    const newSelected = new Set(selectedIds);
    if (newSelected.size === pendingProducts.items.length) {
      newSelected.clear();
    } else {
      pendingProducts.items.forEach((item: any) => newSelected.add(item.id));
    }
    setSelectedIds(newSelected);
  };

  const handleSelectItem = (id: number) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const buildUndoSnapshot = async (): Promise<UndoItemSnapshot[]> => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return [];

    const items = await utils.captureReview.getItemsByIds.fetch({ ids });
    return items.map((item) => ({
      id: item.id,
      previousStatus: item.status ?? "detected",
      previousApprovedBy: item.approvedBy ?? null,
      previousApprovedAt: item.approvedAt ? new Date(item.approvedAt).toISOString() : null,
    }));
  };

  const handleApproveBatch = async () => {
    if (selectedIds.size === 0) return;

    const snapshot = await buildUndoSnapshot();
    await approveMutation.mutateAsync({ ids: Array.from(selectedIds) });
    setLastBatchAction({
      actionType: "approve",
      itemCount: snapshot.length,
      items: snapshot,
    });
    setSelectedIds(new Set());
  };

  const handleRejectBatch = async () => {
    if (selectedIds.size === 0) return;

    const snapshot = await buildUndoSnapshot();
    await rejectMutation.mutateAsync({ ids: Array.from(selectedIds) });
    setLastBatchAction({
      actionType: "reject",
      itemCount: snapshot.length,
      items: snapshot,
    });
    setSelectedIds(new Set());
  };

  const handleUndoLastAction = async () => {
    if (!lastBatchAction || lastBatchAction.items.length === 0) return;
    await undoMutation.mutateAsync({ items: lastBatchAction.items });
  };

  const handleExport = async () => {
    const result = await exportMutation.mutateAsync({
      supplierId,
      status,
    });

    const element = document.createElement("a");
    element.setAttribute(
      "href",
      "data:text/csv;charset=utf-8," + encodeURIComponent(result.csv)
    );
    element.setAttribute("download", result.filename);
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const getStatusBadge = (currentStatus: string) => {
    switch (currentStatus) {
      case "detected":
        return (
          <Badge variant="outline" className="border-yellow-200 bg-yellow-50 text-yellow-700">
            <AlertCircle className="mr-1 h-3 w-3" />
            Detectado
          </Badge>
        );
      case "approved":
        return (
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
            <CheckCircle className="mr-1 h-3 w-3" />
            Aprovado
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
            <XCircle className="mr-1 h-3 w-3" />
            Rejeitado
          </Badge>
        );
      case "applied":
        return (
          <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
            <CheckCircle className="mr-1 h-3 w-3" />
            Aplicado
          </Badge>
        );
      default:
        return <Badge>{currentStatus}</Badge>;
    }
  };

  const statCards = [
    { label: "Total", value: stats?.total ?? 0, tone: "text-slate-900" },
    { label: "Pendentes", value: stats?.pendingReview ?? 0, tone: "text-yellow-600" },
    { label: "Aprovados", value: stats?.approved ?? 0, tone: "text-emerald-600" },
    { label: "Rejeitados", value: stats?.rejected ?? 0, tone: "text-red-600" },
    { label: "Aplicados", value: stats?.applied ?? 0, tone: "text-blue-600" },
  ];

  return (
    <div className="space-y-6 bg-slate-50/60 pb-8">
      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <div className="bg-gradient-to-r from-[#0f2358] via-[#1A3F8F] to-[#1f6fb2] px-6 py-6 text-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-[0.18em] text-blue-50 uppercase">
                <Sparkles className="h-3.5 w-3.5" />
                Central de revisão
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tight">Revisão de Captura</h1>
                <p className="mt-2 max-w-2xl text-sm text-blue-100/90">
                  Revise alterações capturadas, aprove ou rejeite em lote e, se necessário, desfaça a última ação sem sair da operação.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                onClick={handleExport}
                disabled={exportMutation.isPending}
              >
                <Download className="mr-2 h-4 w-4" />
                Exportar CSV
              </Button>
              <Button
                variant="outline"
                className="border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
                onClick={handleUndoLastAction}
                disabled={!lastBatchAction || undoMutation.isPending}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Desfazer última ação
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {statCards.map((card) => (
          <Card key={card.label} className="border-slate-200 p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {card.label}
            </div>
            <div className={`mt-3 text-3xl font-black tracking-tight ${card.tone}`}>
              {card.value}
            </div>
          </Card>
        ))}
      </div>

      {lastBatchAction && (
        <Card className="border-amber-200 bg-amber-50/70 p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-sm font-semibold text-amber-900">
                Última ação registrada: {lastBatchAction.actionType === "approve" ? "aprovação" : "rejeição"} em lote
              </div>
              <div className="mt-1 text-sm text-amber-800">
                {lastBatchAction.itemCount} item(ns) alterado(s). Use o botão de desfazer enquanto esta sessão permanecer aberta.
              </div>
            </div>
            <Button
              variant="outline"
              className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
              onClick={handleUndoLastAction}
              disabled={undoMutation.isPending}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Restaurar estado anterior
            </Button>
          </div>
        </Card>
      )}

      <Card className="border-slate-200 p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_auto]">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Fornecedor</label>
            <Select
              value={supplierId?.toString() ?? ALL_SUPPLIERS}
              onValueChange={(value) => {
                setOffset(0);
                setSupplierId(mapSupplierFilterValue(value));
              }}
            >
              <SelectTrigger className="border-slate-300 bg-white">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SUPPLIERS}>Todos</SelectItem>
                {suppliers?.map((supplier: any) => (
                  <SelectItem key={supplier.supplierId} value={supplier.supplierId.toString()}>
                    {supplier.supplierName} ({supplier.pendingCount})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Status</label>
            <Select
              value={status ?? ALL_STATUS}
              onValueChange={(value) => {
                setOffset(0);
                setStatus(mapStatusFilterValue(value));
              }}
            >
              <SelectTrigger className="border-slate-300 bg-white">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STATUS}>Todos</SelectItem>
                <SelectItem value="detected">Detectado</SelectItem>
                <SelectItem value="approved">Aprovado</SelectItem>
                <SelectItem value="rejected">Rejeitado</SelectItem>
                <SelectItem value="applied">Aplicado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
              {pendingProducts?.items?.length ?? 0} registro(s) nesta página
            </div>
          </div>
        </div>
      </Card>

      {selectedIds.size > 0 && (
        <Card className="border-blue-200 bg-blue-50/80 p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-sm font-semibold text-blue-900">
                {selectedIds.size} item(ns) selecionado(s)
              </div>
              <div className="mt-1 text-sm text-blue-800">
                {selectedItems.slice(0, 2).map((item: any) => item.productName).join(", ")}
                {selectedItems.length > 2 ? ` e mais ${selectedItems.length - 2}` : ""}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleApproveBatch} disabled={approveMutation.isPending}>
                <CheckCircle className="mr-2 h-4 w-4" />
                Aprovar lote
              </Button>
              <Button
                variant="destructive"
                onClick={handleRejectBatch}
                disabled={rejectMutation.isPending}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Rejeitar lote
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden border-slate-200 shadow-sm">
        {loadingPending ? (
          <div className="p-10 text-center text-sm text-slate-500">Carregando registros da revisão...</div>
        ) : pendingProducts?.items && pendingProducts.items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px]">
              <thead className="bg-slate-100/80 text-slate-700">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <Checkbox
                      checked={selectedIds.size === pendingProducts.items.length && pendingProducts.items.length > 0}
                      onChange={handleSelectAll}
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.18em]">Produto</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.18em]">Fornecedor</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.18em]">Campo</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.18em]">Valor anterior</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.18em]">Novo valor</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.18em]">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.18em]">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {pendingProducts.items.map((item: any) => (
                  <tr key={item.id} className="transition hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Checkbox
                        checked={selectedIds.has(item.id)}
                        onChange={() => handleSelectItem(item.id)}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900">{item.productName}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{item.supplierName}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{item.field}</td>
                    <td className="max-w-[220px] px-4 py-3 text-sm text-slate-500">{item.oldValue || "-"}</td>
                    <td className="max-w-[220px] px-4 py-3 text-sm font-medium text-slate-900">{item.newValue || "-"}</td>
                    <td className="px-4 py-3">{getStatusBadge(item.status)}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {new Date(item.createdAt).toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 text-center">
            <div className="text-base font-semibold text-slate-700">Nenhum produto pendente de revisão</div>
            <div className="mt-2 text-sm text-slate-500">
              Ajuste os filtros ou execute nova captura para gerar registros revisáveis.
            </div>
          </div>
        )}
      </Card>

      {pendingProducts && pendingProducts.total >= limit && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
          >
            Anterior
          </Button>
          <span className="text-sm text-slate-600">Página {Math.floor(offset / limit) + 1}</span>
          <Button
            variant="outline"
            onClick={() => setOffset(offset + limit)}
            disabled={!pendingProducts || pendingProducts.items.length < limit}
          >
            Próxima
          </Button>
        </div>
      )}
    </div>
  );
}
