import React, { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  ChevronDown,
  ChevronUp,
  Edit2,
  ExternalLink,
  FileText,
  Minus,
  Plus,
  Printer,
  Trash2,
  Workflow,
  X,
} from "lucide-react";

import { useLocation } from "wouter";
import { toast } from "sonner";

// ─── Org Autocomplete ─────────────────────────────────────────────────────────
function OrgAutocomplete({
  value,
  onChange,
  onSelect,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (org: { id: number; name: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: orgs } = trpc.orgs.list.useQuery(
    { search: value },
    { enabled: value.length >= 1 }
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Digite o nome do órgão..."
        className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900 transition-colors"
      />
      {open && value.length >= 1 && (
        <div className="absolute top-full left-0 right-0 bg-white border border-gray-900 shadow-lg z-50 max-h-48 overflow-y-auto">
          {orgs && orgs.length > 0 ? (
            <>
              {orgs.map((org) => (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => { onSelect(org); setOpen(false); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
                >
                  <div className="font-semibold text-gray-900">{org.name}</div>
                  {org.cnpj && <div className="text-[10px] text-gray-400">CNPJ: {org.cnpj}</div>}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  onSelect({ id: 0, name: value });
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-xs text-blue-800 font-bold hover:bg-blue-50 border-t border-gray-200"
              >
                + Cadastrar "{value}" automaticamente
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                onSelect({ id: 0, name: value });
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-xs text-blue-800 font-bold hover:bg-blue-50"
            >
              + Cadastrar "{value}" como novo órgão
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── New Proposal Modal ───────────────────────────────────────────────────────
function NewProposalModal({
  onClose,
  onCreated,
  initialData,
}: {
  onClose: () => void;
  onCreated: (id: number) => void;
  initialData?: Record<string, string> | null;
}) {
  const [title, setTitle] = useState(initialData?.objeto ? `Proposta — ${initialData.objeto.slice(0, 60)}` : "");
  const [processNumber, setProcessNumber] = useState(initialData?.numeroProcesso ?? "");
  const [orgName, setOrgName] = useState(initialData?.orgao ?? "");
  const [orgId, setOrgId] = useState<number | null>(null);
  const [validityDays, setValidityDays] = useState("30");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [deliveryTerms, setDeliveryTerms] = useState("");
  const origemRadar = initialData?.fonte === "Radar de Licitações" ? "radar" : "manual";
  const radarOpportunityId = initialData?.radarOpportunityId ? Number(initialData.radarOpportunityId) : undefined;

  const utils = trpc.useUtils();
  const upsertOrg = trpc.orgs.upsert.useMutation();
  const create = trpc.proposals.create.useMutation({
    onSuccess: (id) => {
      utils.proposals.list.invalidate();
      toast.success("Proposta criada!");
      onCreated(id);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { toast.error("Título é obrigatório"); return; }

    let resolvedOrgId = orgId;
    // Auto-register org if typed but not selected from list
    if (orgName.trim() && !orgId) {
      try {
        resolvedOrgId = await upsertOrg.mutateAsync({ name: orgName.trim() });
        utils.orgs.list.invalidate();
      } catch {}
    }

    create.mutate({
      title: title.trim(),
      processNumber: processNumber.trim() || null,
      orgId: resolvedOrgId || null,
      orgName: orgName.trim() || null,
      validityDays: validityDays ? parseInt(validityDays) : 30,
      paymentTerms: paymentTerms.trim() || null,
      deliveryTerms: deliveryTerms.trim() || null,
      origem: origemRadar,
      radarOpportunityId: radarOpportunityId ?? null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-900">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-800" />
            <h2 className="text-base font-black tracking-tight text-gray-900">Nova Proposta Comercial</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 p-1">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">
              Título da Proposta *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Proposta de Medicamentos Veterinários"
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
              autoFocus
            />
          </div>

          <div>
            <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">
              Número do Processo / Licitação
            </label>
            <input
              type="text"
              value={processNumber}
              onChange={(e) => setProcessNumber(e.target.value)}
              placeholder="Ex: PE 001/2025, Pregão 012/2025"
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">
              Órgão Requisitante
            </label>
            <OrgAutocomplete
              value={orgName}
              onChange={(v) => { setOrgName(v); setOrgId(null); }}
              onSelect={(org) => { setOrgName(org.name); setOrgId(org.id || null); }}
            />
            <div className="text-[10px] text-gray-400 mt-0.5">
              Digite para buscar ou cadastrar automaticamente
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">
                Validade (dias)
              </label>
              <input
                type="number"
                value={validityDays}
                onChange={(e) => setValidityDays(e.target.value)}
                className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
              />
            </div>
            <div className="col-span-2">
              <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">
                Condições de Pagamento
              </label>
              <input
                type="text"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="Ex: 30 dias, À vista"
                className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">
              Prazo de Entrega
            </label>
            <input
              type="text"
              value={deliveryTerms}
              onChange={(e) => setDeliveryTerms(e.target.value)}
              placeholder="Ex: 5 dias úteis após confirmação do pedido"
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 text-sm font-semibold text-gray-700 hover:border-gray-900 transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={create.isPending || upsertOrg.isPending}
              className="flex items-center gap-2 px-6 py-2 bg-gray-900 text-white text-sm font-bold hover:bg-blue-800 transition-colors disabled:opacity-50"
            >
              <FileText size={14} />
              {create.isPending ? "Criando..." : "Criar Proposta"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Proposal List ────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  sent: "Enviada",
  order: "Pedido",
  in_transit: "Em Trânsito",
  delivered: "Entregue",
  cancelled: "Cancelada",
};
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  sent: "bg-blue-50 text-blue-700",
  order: "bg-yellow-50 text-yellow-700",
  in_transit: "bg-orange-50 text-orange-700",
  delivered: "bg-green-50 text-green-700",
  cancelled: "bg-blue-50 text-blue-900",
};

export default function Propostas() {
  const [, navigate] = useLocation();
  const [showNew, setShowNew] = useState(false);
  const [radarDraft, setRadarDraft] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("nova") === "1") {
      const draft = sessionStorage.getItem("radar_proposta_draft");
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          setRadarDraft(parsed);
          sessionStorage.removeItem("radar_proposta_draft");
        } catch {}
      }
      setShowNew(true);
    }
  }, []);

  const { data: proposals, isLoading } = trpc.proposals.list.useQuery();
  const utils = trpc.useUtils();
  const deleteProposal = trpc.proposals.delete.useMutation({
    onSuccess: () => { utils.proposals.list.invalidate(); toast.success("Proposta excluída."); },
    onError: (e) => toast.error(e.message),
  });

  const handleCreated = (id: number) => {
    setShowNew(false);
    navigate(`/propostas/${id}`);
  };

  const formatDate = (d: Date | string) =>
    new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <div className="p-8">
      {showNew && (
        <NewProposalModal onClose={() => { setShowNew(false); setRadarDraft(null); }} onCreated={handleCreated} initialData={radarDraft} />
      )}

      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <span className="its-bar" />
          <h1 className="text-3xl font-black tracking-tight text-gray-900">Propostas Comerciais</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isLoading ? "Carregando..." : `${(proposals ?? []).length} proposta${(proposals ?? []).length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/propostas-admin")}
            className="flex items-center gap-2 border border-gray-200 text-gray-600 px-3 py-2 text-xs font-semibold hover:border-gray-900 transition-colors"
          >
            <Workflow size={13} />
            Administrar
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2.5 text-sm font-bold hover:bg-blue-800 transition-colors flex-shrink-0"
          >
            <Plus size={14} />
            Nova Proposta
          </button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="py-12 text-center">
          <div className="w-6 h-1 bg-blue-800 mx-auto mb-3 animate-pulse" />
          <p className="text-xs text-gray-400 tracking-widest uppercase">Carregando...</p>
        </div>
      ) : !proposals || proposals.length === 0 ? (
        <div className="border border-gray-200 p-12 text-center">
          <FileText size={24} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-500 mb-1">Nenhuma proposta criada</p>
          <p className="text-xs text-gray-400">Clique em "Nova Proposta" para começar</p>
        </div>
      ) : (
        <div className="border border-gray-200">
          <table className="its-table w-full">
            <thead>
              <tr>
                <th>Título / Processo</th>
                <th>Órgão Requisitante</th>
                <th>Status</th>
                <th>Data</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/propostas/${p.id}`)}>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="font-semibold text-gray-900 text-sm">{p.title}</div>
                      {(p as any).origem === "radar" && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-600 text-white shrink-0">
                          📡 RADAR
                        </span>
                      )}
                    </div>
                    {p.processNumber && (
                      <div className="text-[10px] text-gray-400 mt-0.5">Processo: {p.processNumber}</div>
                    )}
                  </td>
                  <td className="text-sm text-gray-600">{p.orgName ?? "—"}</td>
                  <td>
                    <span className={`text-[10px] font-bold px-2 py-0.5 ${STATUS_COLORS[p.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {STATUS_LABELS[p.status] ?? p.status}
                    </span>
                  </td>
                  <td className="text-xs text-gray-500">{formatDate(p.createdAt)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate(`/propostas/${p.id}`)}
                        className="text-gray-400 hover:text-gray-900 p-1"
                        title="Editar"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Excluir esta proposta?")) deleteProposal.mutate({ id: p.id });
                        }}
                        className="text-gray-300 hover:text-blue-800 p-1"
                        title="Excluir"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
