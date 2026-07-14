import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { usePermission } from "@/components/RequireAuth";
import { KanbanSquare, Loader2, Plus, X, ChevronRight, History, CheckCircle2, Ban, FileSearch } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

/**
 * Funil de Oportunidades — kanban da operação inteira, da triagem ao
 * recebimento. Movimentação registra histórico auditável.
 */

const ETAPA_LABEL: Record<string, string> = {
  nova: "Nova",
  triagem: "Triagem",
  analise: "Análise",
  cotacao: "Cotação",
  precificacao: "Precificação",
  proposta: "Proposta",
  enviada: "Enviada",
  disputa: "Disputa",
  habilitacao: "Habilitação",
  vencida: "Vencida",
  perdida: "Perdida",
  cancelada: "Cancelada",
  contrato: "Contrato",
  entrega: "Entrega",
  faturamento: "Faturamento",
  recebimento: "Recebimento",
  encerrada: "Encerrada",
};

const ETAPA_COR: Record<string, string> = {
  nova: "border-t-blue-400",
  triagem: "border-t-sky-400",
  analise: "border-t-cyan-400",
  cotacao: "border-t-teal-400",
  precificacao: "border-t-emerald-400",
  proposta: "border-t-amber-400",
  enviada: "border-t-orange-400",
  disputa: "border-t-red-400",
  habilitacao: "border-t-purple-400",
  vencida: "border-t-green-500",
  perdida: "border-t-gray-400",
  cancelada: "border-t-gray-300",
  contrato: "border-t-indigo-400",
  entrega: "border-t-blue-500",
  faturamento: "border-t-emerald-500",
  recebimento: "border-t-green-600",
  encerrada: "border-t-gray-500",
};

const RISCO_BADGE: Record<string, string> = {
  baixo: "bg-emerald-50 text-emerald-700",
  medio: "bg-amber-50 text-amber-700",
  alto: "bg-red-50 text-red-700",
};

function moeda(v: number | null): string {
  if (v == null) return "";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export default function Funil() {
  const canEdit = usePermission("editor");
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const kanban = trpc.funil.kanban.useQuery();
  const [detalheId, setDetalheId] = useState<number | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [novaAberta, setNovaAberta] = useState(false);
  const [form, setForm] = useState({ titulo: "", orgao: "", numeroProcesso: "", valorEstimado: "", prazoEnvio: "" });

  const invalidar = () => {
    utils.funil.kanban.invalidate();
    if (detalheId) utils.funil.detalhe.invalidate({ id: detalheId });
  };

  const criar = trpc.funil.criar.useMutation({
    onSuccess: () => {
      toast.success("Oportunidade criada.");
      setNovaAberta(false);
      setForm({ titulo: "", orgao: "", numeroProcesso: "", valorEstimado: "", prazoEnvio: "" });
      invalidar();
    },
    onError: (e) => toast.error(e.message),
  });

  const mover = trpc.funil.mover.useMutation({
    onSuccess: () => { toast.success("Movida."); invalidar(); },
    onError: (e) => toast.error(e.message),
  });

  const decidir = trpc.funil.decidir.useMutation({
    onSuccess: ({ decision }) => {
      toast.success(decision.value === "go" ? "Decisão GO registrada." : "Decisão NO-GO registrada.");
      setDecisionReason("");
      invalidar();
    },
    onError: (e) => toast.error(e.message),
  });

  const detalhe = trpc.funil.detalhe.useQuery(
    { id: detalheId ?? 0 },
    { enabled: detalheId != null },
  );

  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("oportunidade"));
    if (Number.isInteger(id) && id > 0) setDetalheId(id);
  }, []);

  const data = kanban.data;
  // Só mostra colunas com cards + as etapas iniciais (para não poluir)
  const etapasVisiveis = data
    ? data.etapas.filter(
        (e) => (data.colunas[e]?.length ?? 0) > 0 || ["nova", "triagem", "analise", "cotacao", "proposta", "enviada"].includes(e),
      )
    : [];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <KanbanSquare className="w-7 h-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Funil de Oportunidades</h1>
            <p className="text-sm text-gray-500">Da triagem ao recebimento — toda movimentação fica registrada</p>
          </div>
        </div>
        {canEdit && (
          <button
            onClick={() => setNovaAberta(true)}
            className="flex items-center gap-2 text-sm font-semibold px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded"
          >
            <Plus className="w-4 h-4" /> Nova oportunidade
          </button>
        )}
      </div>

      {kanban.isLoading ? (
        <div className="p-10 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {etapasVisiveis.map((etapa) => (
            <div key={etapa} className={`w-64 shrink-0 bg-gray-50 border border-gray-200 border-t-4 ${ETAPA_COR[etapa]} rounded-sm`}>
              <div className="px-3 py-2 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-600">{ETAPA_LABEL[etapa]}</span>
                <span className="text-xs font-bold text-gray-400">{data?.colunas[etapa]?.length ?? 0}</span>
              </div>
              <div className="px-2 pb-2 space-y-2 min-h-[60px]">
                {(data?.colunas[etapa] ?? []).map((card) => (
                  <button
                    key={card.id}
                    onClick={() => setDetalheId(card.id)}
                    className="w-full text-left bg-white border border-gray-200 hover:border-blue-300 hover:shadow-sm p-2.5 rounded-sm transition-all"
                  >
                    <div className="text-sm font-medium text-gray-900 line-clamp-2">{card.titulo}</div>
                    {card.orgao && <div className="text-[11px] text-gray-500 truncate mt-0.5">{card.orgao}</div>}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {card.valorEstimado != null && (
                        <span className="text-[11px] font-semibold text-gray-700">{moeda(card.valorEstimado)}</span>
                      )}
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${RISCO_BADGE[card.risco] ?? ""}`}>
                        {card.risco}
                      </span>
                      {card.diasPrazo != null && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          card.diasPrazo < 0 ? "bg-red-100 text-red-700" : card.diasPrazo <= 3 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"
                        }`}>
                          {card.diasPrazo < 0 ? `venceu há ${-card.diasPrazo}d` : card.diasPrazo === 0 ? "hoje" : `${card.diasPrazo}d`}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal nova oportunidade */}
      {novaAberta && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setNovaAberta(false)}>
          <div className="bg-white w-full max-w-md p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 mb-3">Nova oportunidade</h3>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Título *</label>
            <input value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
              className="w-full border border-gray-300 px-2 py-1.5 text-sm mb-3" placeholder="ex.: Pregão 45/2026 — Medicamentos veterinários" />
            <label className="block text-xs font-semibold text-gray-600 mb-1">Órgão</label>
            <input value={form.orgao} onChange={(e) => setForm((f) => ({ ...f, orgao: e.target.value }))}
              className="w-full border border-gray-300 px-2 py-1.5 text-sm mb-3" />
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Nº processo</label>
                <input value={form.numeroProcesso} onChange={(e) => setForm((f) => ({ ...f, numeroProcesso: e.target.value }))}
                  className="w-full border border-gray-300 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Valor estimado (R$)</label>
                <input type="number" step="0.01" value={form.valorEstimado}
                  onChange={(e) => setForm((f) => ({ ...f, valorEstimado: e.target.value }))}
                  className="w-full border border-gray-300 px-2 py-1.5 text-sm" />
              </div>
            </div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Prazo de envio</label>
            <input type="date" value={form.prazoEnvio} onChange={(e) => setForm((f) => ({ ...f, prazoEnvio: e.target.value }))}
              className="w-full border border-gray-300 px-2 py-1.5 text-sm mb-4" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setNovaAberta(false)} className="text-sm px-4 py-2 text-gray-600">Cancelar</button>
              <button
                disabled={criar.isPending || form.titulo.trim().length < 3}
                onClick={() => criar.mutate({
                  titulo: form.titulo.trim(),
                  orgao: form.orgao || undefined,
                  numeroProcesso: form.numeroProcesso || undefined,
                  valorEstimado: form.valorEstimado ? parseFloat(form.valorEstimado.replace(",", ".")) : undefined,
                  prazoEnvio: form.prazoEnvio || undefined,
                })}
                className="text-sm font-semibold px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded disabled:opacity-50"
              >
                {criar.isPending ? "Criando…" : "Criar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Painel de detalhe */}
      {detalheId != null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => { setDetalheId(null); navigate("/funil"); }}>
          <div className="bg-white w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            {detalhe.isLoading || !detalhe.data ? (
              <div className="p-6 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 mb-1">
                  <h3 className="font-bold text-gray-900">{detalhe.data.titulo}</h3>
                  <button onClick={() => { setDetalheId(null); navigate("/funil"); }}><X className="w-4 h-4 text-gray-400" /></button>
                </div>
                <div className="text-xs text-gray-500 mb-3">
                  {detalhe.data.orgao && <span>{detalhe.data.orgao} · </span>}
                  {detalhe.data.numeroProcesso && <span>Proc. {detalhe.data.numeroProcesso} · </span>}
                  <span>origem: {detalhe.data.origemTipo}</span>
                </div>

                {detalhe.data.objeto && (
                  <p className="text-sm text-gray-700 bg-gray-50 border border-gray-100 p-2.5 mb-3 whitespace-pre-wrap">{detalhe.data.objeto}</p>
                )}

                {detalhe.data.decisao ? (
                  <div className={`mb-4 border p-3 ${
                    detalhe.data.decisao.value === "go"
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-gray-200 bg-gray-50"
                  }`}>
                    <div className="flex items-center gap-2 text-sm font-bold">
                      {detalhe.data.decisao.value === "go"
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                        : <Ban className="w-4 h-4 text-gray-600" />}
                      Decisão {detalhe.data.decisao.value === "go" ? "GO" : "NO-GO"}
                    </div>
                    <p className="mt-1 text-xs text-gray-600">{detalhe.data.decisao.reason}</p>
                    {detalhe.data.decisao.actor && (
                      <p className="mt-1 text-[10px] text-gray-400">Registrada por {detalhe.data.decisao.actor}</p>
                    )}
                  </div>
                ) : canEdit && ["nova", "triagem"].includes(detalhe.data.etapa) ? (
                  <div className="mb-4 border border-amber-200 bg-amber-50 p-3">
                    <label className="block text-xs font-bold text-amber-900 mb-1">Decisão obrigatória: GO ou NO-GO</label>
                    <textarea
                      value={decisionReason}
                      onChange={(event) => setDecisionReason(event.target.value)}
                      placeholder="Registre o motivo da decisão (mínimo 5 caracteres)"
                      className="w-full min-h-16 border border-amber-200 bg-white px-2 py-1.5 text-sm"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        disabled={decidir.isPending || decisionReason.trim().length < 5}
                        onClick={() => decidir.mutate({ id: detalheId, decisao: "go", justificativa: decisionReason.trim() })}
                        className="flex items-center gap-1 bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> GO — analisar
                      </button>
                      <button
                        disabled={decidir.isPending || decisionReason.trim().length < 5}
                        onClick={() => decidir.mutate({ id: detalheId, decisao: "no_go", justificativa: decisionReason.trim() })}
                        className="flex items-center gap-1 bg-gray-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        <Ban className="w-3.5 h-3.5" /> NO-GO — encerrar
                      </button>
                    </div>
                  </div>
                ) : null}

                {canEdit && ["analise", "precificacao"].includes(detalhe.data.etapa) && (
                  <button
                    onClick={() => navigate(`/edital?funilId=${detalheId}`)}
                    className="mb-4 flex w-full items-center justify-center gap-2 bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800"
                  >
                    <FileSearch className="w-4 h-4" /> Revisar edital e montar proposta
                  </button>
                )}

                {canEdit && detalhe.data.proximasEtapas.length > 0 && !["nova", "triagem"].includes(detalhe.data.etapa) && (
                  <div className="mb-4">
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Próxima ação</label>
                    <div className="flex flex-wrap gap-1.5">
                      {detalhe.data.proximasEtapas.map((etapa) => (
                        <button
                          key={etapa}
                          disabled={mover.isPending}
                          onClick={() => mover.mutate({ id: detalheId, paraEtapa: etapa })}
                          className="text-[11px] font-semibold px-2 py-1 rounded border border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
                        >
                          {ETAPA_LABEL[etapa] ?? etapa}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                    <History className="w-3.5 h-3.5" /> Histórico
                  </div>
                  <div className="space-y-1.5">
                    {detalhe.data.eventos.map((ev: any) => (
                      <div key={ev.id} className="text-xs text-gray-600 flex items-center gap-1.5 border-b border-gray-50 pb-1.5">
                        <span className="text-gray-400">{new Date(ev.createdAt).toLocaleString("pt-BR")}</span>
                        {ev.deEtapa && <span>{ETAPA_LABEL[ev.deEtapa] ?? ev.deEtapa}</span>}
                        <ChevronRight className="w-3 h-3 text-gray-300" />
                        <span className="font-semibold">{ETAPA_LABEL[ev.paraEtapa] ?? ev.paraEtapa}</span>
                        {ev.justificativa && <span className="text-gray-400 truncate">— {ev.justificativa}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
