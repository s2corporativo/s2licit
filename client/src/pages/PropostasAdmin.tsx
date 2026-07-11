import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import {
  ArrowRight,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Edit2,
  ExternalLink,
  Filter,
  Package,
  Search,
  Truck,
  X,
  XCircle,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

type ProposalStatus = "draft" | "sent" | "order" | "in_transit" | "delivered" | "cancelled";

const STATUS_CONFIG: Record<ProposalStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  draft: { label: "Rascunho", color: "text-gray-600", bg: "bg-gray-100", icon: <Edit2 size={12} /> },
  sent: { label: "Enviada", color: "text-blue-700", bg: "bg-blue-50", icon: <ArrowRight size={12} /> },
  order: { label: "Pedido", color: "text-yellow-700", bg: "bg-yellow-50", icon: <Package size={12} /> },
  in_transit: { label: "Em Trânsito", color: "text-orange-700", bg: "bg-orange-50", icon: <Truck size={12} /> },
  delivered: { label: "Entregue", color: "text-green-700", bg: "bg-green-50", icon: <CheckCircle size={12} /> },
  cancelled: { label: "Cancelada", color: "text-blue-900", bg: "bg-blue-50", icon: <XCircle size={12} /> },
};

const STATUS_FLOW: Record<ProposalStatus, ProposalStatus[]> = {
  draft: ["sent", "cancelled"],
  sent: ["order", "cancelled"],
  order: ["in_transit", "cancelled"],
  in_transit: ["delivered", "cancelled"],
  delivered: [],
  cancelled: ["draft"],
};

const STATUS_PIPELINE: ProposalStatus[] = ["draft", "sent", "order", "in_transit", "delivered"];

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as ProposalStatus] ?? STATUS_CONFIG.draft;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cfg.bg} ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function FreightModal({
  proposal,
  onClose,
}: {
  proposal: { id: number; freightValue?: string | null; freightCarrier?: string | null; freightTrackingCode?: string | null };
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    freightValue: proposal.freightValue ?? "",
    freightCarrier: proposal.freightCarrier ?? "",
    freightTrackingCode: proposal.freightTrackingCode ?? "",
  });
  const updateFreight = trpc.proposals.updateFreight.useMutation({
    onSuccess: () => {
      utils.proposals.listAdmin.invalidate();
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-md border border-gray-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-sm font-bold uppercase tracking-widest">Dados do Frete</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900">
            <X size={16} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">
              Valor do Frete (R$)
            </label>
            <input
              type="number"
              step="0.01"
              value={form.freightValue}
              onChange={(e) => setForm((f) => ({ ...f, freightValue: e.target.value }))}
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
              placeholder="0,00"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">
              Transportadora
            </label>
            <input
              type="text"
              value={form.freightCarrier}
              onChange={(e) => setForm((f) => ({ ...f, freightCarrier: e.target.value }))}
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
              placeholder="Nome da transportadora"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">
              Código de Rastreio
            </label>
            <input
              type="text"
              value={form.freightTrackingCode}
              onChange={(e) => setForm((f) => ({ ...f, freightTrackingCode: e.target.value }))}
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
              placeholder="Ex: BR123456789"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-gray-600 border border-gray-200 hover:border-gray-900 transition-colors">
            Cancelar
          </button>
          <button
            onClick={() =>
              updateFreight.mutate({
                id: proposal.id,
                freightValue: form.freightValue || null,
                freightCarrier: form.freightCarrier || null,
                freightTrackingCode: form.freightTrackingCode || null,
              })
            }
            disabled={updateFreight.isPending}
            className="px-4 py-2 text-xs font-bold uppercase tracking-widest bg-gray-900 text-white hover:bg-black transition-colors disabled:opacity-50"
          >
            {updateFreight.isPending ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusHistoryModal({
  proposalId,
  onClose,
}: {
  proposalId: number;
  onClose: () => void;
}) {
  const { data: history, isLoading } = trpc.proposals.getStatusHistory.useQuery({ id: proposalId });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-lg border border-gray-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-sm font-bold uppercase tracking-widest">Histórico de Status</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900">
            <X size={16} />
          </button>
        </div>
        <div className="p-6 max-h-96 overflow-y-auto">
          {isLoading ? (
            <p className="text-sm text-gray-500 text-center py-4">Carregando...</p>
          ) : !history || history.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">Nenhum histórico registrado.</p>
          ) : (
            <div className="space-y-3">
              {history.map((h) => (
                <div key={h.id} className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0">
                  <div className="w-2 h-2 rounded-full bg-gray-400 mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={h.fromStatus ?? "draft"} />
                      <ArrowRight size={10} className="text-gray-400" />
                      <StatusBadge status={h.toStatus} />
                    </div>
                    {h.notes && <p className="text-xs text-gray-500 mt-1">{h.notes}</p>}
                    <p className="text-[10px] text-gray-400 mt-1">
                      {new Date(h.createdAt).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-gray-600 border border-gray-200 hover:border-gray-900 transition-colors">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function AdvanceStatusModal({
  proposal,
  nextStatuses,
  onClose,
}: {
  proposal: { id: number; title: string; status: string; totalValue?: string | null };
  nextStatuses: ProposalStatus[];
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [selectedStatus, setSelectedStatus] = useState<ProposalStatus>(nextStatuses[0]);
  const [notes, setNotes] = useState("");
  const [createEntry, setCreateEntry] = useState(true);
  const [entryIsPaid, setEntryIsPaid] = useState<"yes" | "no">("no");

  const isDelivered = selectedStatus === "delivered";
  const totalValue = parseFloat(String(proposal.totalValue ?? 0));

  const createFromProposal = trpc.financial.createFromProposal.useMutation();
  const advance = trpc.proposals.advanceStatus.useMutation({
    onSuccess: async () => {
      utils.proposals.listAdmin.invalidate();
      if (isDelivered && createEntry && totalValue > 0) {
        await createFromProposal.mutateAsync({
          proposalId: proposal.id,
          amount: String(totalValue.toFixed(2)),
          description: `Entrega: ${proposal.title}`,
          isPaid: entryIsPaid,
          notes: notes || null,
        });
        utils.financial.list.invalidate();
        utils.financial.summary.invalidate();
      }
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-md border border-gray-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-sm font-bold uppercase tracking-widest">Alterar Status</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900">
            <X size={16} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">
            Proposta: <strong>{proposal.title}</strong>
          </p>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
              Novo Status
            </label>
            <div className="space-y-2">
              {nextStatuses.map((s) => {
                const cfg = STATUS_CONFIG[s];
                return (
                  <label key={s} className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="radio"
                      name="status"
                      value={s}
                      checked={selectedStatus === s}
                      onChange={() => setSelectedStatus(s)}
                      className="accent-gray-900"
                    />
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cfg.bg} ${cfg.color}`}>
                      {cfg.icon}
                      {cfg.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {isDelivered && totalValue > 0 && (
            <div className="border border-green-200 bg-green-50 p-3 space-y-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createEntry}
                  onChange={(e) => setCreateEntry(e.target.checked)}
                  className="accent-green-700 mt-0.5"
                />
                <div>
                  <p className="text-xs font-bold text-green-800">
                    Criar lançamento de receita automaticamente
                  </p>
                  <p className="text-[11px] text-green-700 mt-0.5">
                    Valor: <strong>{totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong> → Controle Financeiro
                  </p>
                </div>
              </label>
              {createEntry && (
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-green-700 mb-1">
                    Situação do recebimento
                  </label>
                  <div className="flex gap-2">
                    {(["no", "yes"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setEntryIsPaid(v)}
                        className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-widest border transition-colors ${
                          entryIsPaid === v
                            ? "bg-green-700 text-white border-green-700"
                            : "border-green-300 text-green-700 hover:border-green-700"
                        }`}
                      >
                        {v === "yes" ? "Já Recebido" : "A Receber"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">
              Observação (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900 resize-none"
              rows={2}
              placeholder="Motivo ou observação da mudança..."
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-gray-600 border border-gray-200 hover:border-gray-900 transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => advance.mutate({ id: proposal.id, newStatus: selectedStatus, notes: notes || undefined })}
            disabled={advance.isPending || createFromProposal.isPending}
            className="px-4 py-2 text-xs font-bold uppercase tracking-widest bg-blue-800 text-white hover:bg-blue-900 transition-colors disabled:opacity-50"
          >
            {advance.isPending || createFromProposal.isPending ? "Salvando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProposalRow({ proposal }: { proposal: any }) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [expanded, setExpanded] = useState(false);
  const [showFreight, setShowFreight] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showAdvance, setShowAdvance] = useState(false);

  const duplicate = trpc.proposals.duplicate.useMutation({
    onSuccess: (newId) => {
      utils.proposals.listAdmin.invalidate();
      navigate(`/propostas/${newId}`);
    },
  });

  const status = proposal.status as ProposalStatus;
  const nextStatuses = STATUS_FLOW[status] ?? [];
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;

  const totalItems = parseFloat(proposal.totalValue ?? "0");
  const freightVal = parseFloat(proposal.freightValue ?? "0");
  const grandTotal = totalItems + freightVal;

  return (
    <>
      <div className="border border-gray-200 bg-white hover:border-gray-400 transition-colors">
        {/* Main row */}
        <div className="flex items-center gap-4 px-4 py-3">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-gray-400 hover:text-gray-900 shrink-0"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {/* Status badge */}
          <div className="w-28 shrink-0">
            <StatusBadge status={status} />
          </div>

          {/* Title + org */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{proposal.title}</p>
            <p className="text-[11px] text-gray-500 truncate">
              {proposal.orgName ?? "—"}{proposal.processNumber ? ` · Proc. ${proposal.processNumber}` : ""}
            </p>
          </div>

          {/* Total */}
          <div className="text-right shrink-0 w-28">
            <p className="text-sm font-bold text-gray-900">
              {grandTotal > 0 ? `R$ ${grandTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}
            </p>
            {freightVal > 0 && (
              <p className="text-[10px] text-gray-400">
                + frete R$ {freightVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            )}
          </div>

          {/* Date */}
          <div className="text-right shrink-0 w-24 hidden md:block">
            <p className="text-[11px] text-gray-500">
              {new Date(proposal.createdAt).toLocaleDateString("pt-BR")}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => navigate(`/propostas/${proposal.id}`)}
              title="Abrir proposta"
              className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            >
              <ExternalLink size={13} />
            </button>
            <button
              onClick={() => duplicate.mutate({ id: proposal.id })}
              title="Duplicar proposta"
              className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            >
              <Copy size={13} />
            </button>
            {nextStatuses.length > 0 && (
              <button
                onClick={() => setShowAdvance(true)}
                title="Avançar status"
                className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition-colors"
              >
                <ArrowRight size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Frete</p>
                <p className="text-gray-700">
                  {proposal.freightValue
                    ? `R$ ${parseFloat(proposal.freightValue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                    : "Não informado"}
                </p>
                {proposal.freightCarrier && (
                  <p className="text-gray-500">{proposal.freightCarrier}</p>
                )}
                {proposal.freightTrackingCode && (
                  <p className="text-gray-500 font-mono">{proposal.freightTrackingCode}</p>
                )}
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Datas</p>
                {proposal.sentAt && <p className="text-gray-500">Enviada: {new Date(proposal.sentAt).toLocaleDateString("pt-BR")}</p>}
                {proposal.orderedAt && <p className="text-gray-500">Pedido: {new Date(proposal.orderedAt).toLocaleDateString("pt-BR")}</p>}
                {proposal.shippedAt && <p className="text-gray-500">Enviado: {new Date(proposal.shippedAt).toLocaleDateString("pt-BR")}</p>}
                {proposal.deliveredAt && <p className="text-gray-500">Entregue: {new Date(proposal.deliveredAt).toLocaleDateString("pt-BR")}</p>}
                {proposal.cancelledAt && <p className="text-blue-700">Cancelado: {new Date(proposal.cancelledAt).toLocaleDateString("pt-BR")}</p>}
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Condições</p>
                {proposal.paymentTerms && <p className="text-gray-500">{proposal.paymentTerms}</p>}
                {proposal.deliveryTerms && <p className="text-gray-500">{proposal.deliveryTerms}</p>}
                {proposal.validityDays && <p className="text-gray-500">Validade: {proposal.validityDays} dias</p>}
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Ações</p>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => setShowFreight(true)}
                    className="text-left text-[11px] text-blue-600 hover:text-blue-800 font-semibold"
                  >
                    Editar frete
                  </button>
                  <button
                    onClick={() => setShowHistory(true)}
                    className="text-left text-[11px] text-gray-600 hover:text-gray-900 font-semibold"
                  >
                    Ver histórico
                  </button>
                  {nextStatuses.length > 0 && (
                    <button
                      onClick={() => setShowAdvance(true)}
                      className="text-left text-[11px] text-blue-600 hover:text-blue-800 font-semibold"
                    >
                      Avançar status →
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showFreight && (
        <FreightModal proposal={proposal} onClose={() => setShowFreight(false)} />
      )}
      {showHistory && (
        <StatusHistoryModal proposalId={proposal.id} onClose={() => setShowHistory(false)} />
      )}
      {showAdvance && nextStatuses.length > 0 && (
        <AdvanceStatusModal
          proposal={proposal}
          nextStatuses={nextStatuses}
          onClose={() => setShowAdvance(false)}
        />
      )}
    </>
  );
}

export default function PropostasAdmin() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  const { data: proposals, isLoading } = trpc.proposals.listAdmin.useQuery();

  const filtered = useMemo(() => {
    if (!proposals) return [];
    let result = proposals;
    if (filterStatus !== "all") result = result.filter((p) => p.status === filterStatus);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          (p.orgName ?? "").toLowerCase().includes(q) ||
          (p.processNumber ?? "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [proposals, filterStatus, search]);

  // Stats by status
  const stats = useMemo(() => {
    if (!proposals) return {};
    const s: Record<string, number> = {};
    for (const p of proposals) {
      s[p.status ?? "draft"] = (s[p.status ?? "draft"] ?? 0) + 1;
    }
    return s;
  }, [proposals]);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold uppercase tracking-widest text-gray-900">
              Administração de Propostas
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Gerencie o ciclo de vida das propostas comerciais
            </p>
          </div>
          <button
            onClick={() => navigate("/propostas")}
            className="text-xs font-semibold text-gray-600 border border-gray-200 px-3 py-2 hover:border-gray-900 transition-colors"
          >
            ← Propostas
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* Pipeline overview */}
        <div className="grid grid-cols-5 gap-0 border border-gray-200">
          {STATUS_PIPELINE.map((s, i) => {
            const cfg = STATUS_CONFIG[s];
            const count = stats[s] ?? 0;
            const isActive = filterStatus === s;
            return (
              <button
                key={s}
                onClick={() => setFilterStatus(isActive ? "all" : s)}
                className={`flex flex-col items-center py-4 px-2 border-r border-gray-200 last:border-r-0 transition-colors ${
                  isActive ? "bg-gray-900 text-white" : "hover:bg-gray-50"
                }`}
              >
                <span className={`text-2xl font-bold ${isActive ? "text-white" : "text-gray-900"}`}>
                  {count}
                </span>
                <span className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${isActive ? "text-gray-300" : cfg.color}`}>
                  {cfg.label}
                </span>
                {i < STATUS_PIPELINE.length - 1 && (
                  <ArrowRight size={10} className={`mt-1 ${isActive ? "text-gray-400" : "text-gray-300"}`} />
                )}
              </button>
            );
          })}
        </div>

        {/* Search and filters */}
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 border border-gray-200 px-3 py-2">
            <Search size={14} className="text-gray-400 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por título, órgão ou número do processo..."
              className="flex-1 text-sm focus:outline-none"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-900">
                <X size={12} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-2 border px-3 py-2 text-xs font-semibold transition-colors ${
              showFilters ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-600 hover:border-gray-900"
            }`}
          >
            <Filter size={12} />
            Filtros
          </button>
        </div>

        {showFilters && (
          <div className="border border-gray-200 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">Status</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFilterStatus("all")}
                className={`px-3 py-1 text-xs font-semibold border transition-colors ${
                  filterStatus === "all" ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-600 hover:border-gray-900"
                }`}
              >
                Todos ({proposals?.length ?? 0})
              </button>
              {Object.entries(STATUS_CONFIG).map(([s, cfg]) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(filterStatus === s ? "all" : s)}
                  className={`px-3 py-1 text-xs font-semibold border transition-colors ${
                    filterStatus === s ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-600 hover:border-gray-900"
                  }`}
                >
                  {cfg.label} ({stats[s] ?? 0})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Cancelled count */}
        {stats["cancelled"] ? (
          <div className="flex items-center gap-2 text-xs text-blue-800">
            <XCircle size={12} />
            {stats["cancelled"]} proposta(s) cancelada(s)
            <button
              onClick={() => setFilterStatus(filterStatus === "cancelled" ? "all" : "cancelled")}
              className="underline"
            >
              {filterStatus === "cancelled" ? "Ocultar" : "Ver"}
            </button>
          </div>
        ) : null}

        {/* Proposals list */}
        {isLoading ? (
          <div className="text-center py-12 text-sm text-gray-500">Carregando propostas...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 border border-gray-200">
            <Clock size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-500">
              {search || filterStatus !== "all"
                ? "Nenhuma proposta encontrada com os filtros aplicados."
                : "Nenhuma proposta cadastrada ainda."}
            </p>
            {(search || filterStatus !== "all") && (
              <button
                onClick={() => { setSearch(""); setFilterStatus("all"); }}
                className="mt-2 text-xs text-blue-800 underline"
              >
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] text-gray-400">
              {filtered.length} proposta{filtered.length !== 1 ? "s" : ""}
              {filterStatus !== "all" ? ` com status "${STATUS_CONFIG[filterStatus as ProposalStatus]?.label}"` : ""}
            </p>
            {filtered.map((p) => (
              <ProposalRow key={p.id} proposal={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
