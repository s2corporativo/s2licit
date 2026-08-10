import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { usePermission } from "@/components/RequireAuth";
import {
  MailCheck,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  KanbanSquare,
  Globe2,
  Sparkles,
  FileText,
  ExternalLink,
  Bot,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const PORTAL_SOURCES = [
  "copasa",
  "cemig",
  "fundep",
  "funarbe",
  "comprasmg",
  "fiemg",
] as const;

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  nova: { label: "Nova", className: "bg-blue-100 text-blue-800" },
  processando: { label: "Processando", className: "bg-amber-100 text-amber-800" },
  revisao: { label: "Em revisão", className: "bg-purple-100 text-purple-800" },
  respondida: { label: "Respondida", className: "bg-green-100 text-green-800" },
  descartada: { label: "Descartada", className: "bg-gray-100 text-gray-600" },
  erro: { label: "Erro", className: "bg-red-100 text-red-800" },
};

export default function CotacoesRecebidas() {
  const isAdmin = usePermission("admin");
  const canEdit = usePermission("editor");
  const utils = trpc.useUtils();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const statusQuery = trpc.emailQuotations.status.useQuery();
  const portalStatusQuery = trpc.portalOpportunitySync.status.useQuery();
  const listQuery = trpc.emailQuotations.list.useQuery({});
  const prazosQuery = trpc.emailQuotations.prazosProximos.useQuery({ diasAlerta: 3 });
  const accuracyQuery = trpc.emailQuotations.autoMatchAccuracy.useQuery({ diasJanela: 90 });
  const detailQuery = trpc.emailQuotations.get.useQuery(
    { id: selectedId ?? 0 },
    { enabled: selectedId != null },
  );

  const syncMutation = trpc.emailQuotations.sync.useMutation({
    onSuccess: (res) => {
      if (!res.imapConfigured) {
        toast.error("IMAP não configurado no servidor.");
        return;
      }
      toast.success(`Sincronização concluída: ${res.imported} importada(s), ${res.skipped} já existentes.`);
      if (res.errors.length > 0) toast.warning(`${res.errors.length} e-mail(s) com aviso.`);
      utils.emailQuotations.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const portalSyncMutation = trpc.portalOpportunitySync.sync.useMutation({
    onSuccess: (res) => {
      toast.success(
        `Radar S2: ${res.imported} nova(s), ${res.skipped} já existente(s), ${res.matchedItems} item(ns) encontrados na Tambasa.`,
      );
      if (res.unmatchedItems > 0) {
        toast.warning(`${res.unmatchedItems} item(ns) ficaram sem correspondência na Tambasa.`);
      }
      if (res.errors.length > 0) toast.warning(`${res.errors.length} aviso(s) na captura dos portais.`);
      utils.emailQuotations.list.invalidate();
      utils.emailQuotations.prazosProximos.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const imapConfigured = statusQuery.data?.imapConfigured;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex items-center gap-3">
          <MailCheck className="w-7 h-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Radar e Cotações Recebidas</h1>
            <p className="text-sm text-gray-500">
              COPASA, CEMIG, Fundep, Funarbe, Compras MG e FIEMG/SESI/SENAI cruzados com a Tambasa
            </p>
            {portalStatusQuery.data && (
              <p className="text-[11px] text-gray-400 mt-0.5">
                Busca automática: 7h, 12h e 17h · login e envio somente com aprovação humana
              </p>
            )}
          </div>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => portalSyncMutation.mutate({ sources: [...PORTAL_SOURCES] })}
              disabled={portalSyncMutation.isPending}
              className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              {portalSyncMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe2 className="w-4 h-4" />}
              Buscar seis portais
            </button>
            <button
              onClick={() => syncMutation.mutate({ limit: 25 })}
              disabled={syncMutation.isPending}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              {syncMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Sincronizar e-mail
            </button>
          </div>
        )}
      </div>

      {prazosQuery.data && (prazosQuery.data.vencidos.length + prazosQuery.data.proximos.length) > 0 && (
        <div className="mb-6 flex items-start gap-3 border border-red-200 bg-red-50 p-4">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
          <div className="text-sm text-red-800">
            <strong>Prazos de resposta:</strong>{" "}
            {prazosQuery.data.vencidos.length > 0 && (
              <span>{prazosQuery.data.vencidos.length} vencido(s). </span>
            )}
            {prazosQuery.data.proximos.length > 0 && (
              <span>{prazosQuery.data.proximos.length} vencendo em até 3 dias.</span>
            )}
          </div>
        </div>
      )}

      {isAdmin && statusQuery.data?.autoPipelineEnabled && (
        <div className="mb-6 flex items-start gap-3 border border-indigo-200 bg-indigo-50 p-4">
          <Sparkles className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />
          <div className="text-sm text-indigo-900">
            <strong>Pipeline automático ligado</strong> — matches com confiança ≥{" "}
            {Math.round((statusQuery.data.autoConfirmThreshold ?? 0.92) * 100)}% são confirmados sozinhos e a
            proposta é gerada sem intervenção.{" "}
            {statusQuery.data.autoSendEnabled ? "Envio também automático." : "Envio continua manual (1 clique)."}
            {accuracyQuery.data && accuracyQuery.data.taxaAcerto != null && (
              <span className="ml-1">
                Taxa de acerto (90d): <strong>{accuracyQuery.data.taxaAcerto}%</strong>{" "}
                ({accuracyQuery.data.confirmados} confirmações, {accuracyQuery.data.corrigidos} corrigidas).
              </span>
            )}
          </div>
        </div>
      )}

      {imapConfigured === false && (
        <div className="mb-6 flex items-start gap-3 border border-amber-200 bg-amber-50 p-4">
          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-800">
            <strong>A caixa de e-mail ainda não foi conectada.</strong> Esta tela lê automaticamente
            os pedidos de cotação que chegam no e-mail da empresa, mas isso exige uma configuração
            única no servidor. Peça ao responsável técnico para definir as variáveis{" "}
            <code>IMAP_HOST</code>, <code>IMAP_USER</code> e <code>IMAP_PASSWORD</code> no ambiente
            (porta e TLS opcionais). O radar público dos seis portais continua disponível.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="border border-gray-200">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-bold uppercase tracking-wider text-gray-500">
            Cotações {listQuery.data ? `(${listQuery.data.length})` : ""}
          </div>
          {listQuery.isLoading ? (
            <div className="p-8 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
          ) : listQuery.data && listQuery.data.length > 0 ? (
            <ul className="divide-y divide-gray-100 max-h-[70vh] overflow-y-auto">
              {listQuery.data.map((q) => {
                const st = STATUS_LABELS[q.status] ?? STATUS_LABELS.nova;
                return (
                  <li key={q.id}>
                    <button
                      onClick={() => setSelectedId(q.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors ${selectedId === q.id ? "bg-blue-50" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm text-gray-900 truncate flex items-center gap-1">
                          {q.propostaGeradaEm && (
                            <Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0" aria-label="Proposta gerada automaticamente" />
                          )}
                          {q.subject || "(sem assunto)"}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 shrink-0 ${st.className}`}>{st.label}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1 text-xs text-gray-500">
                        <span className="truncate">{q.orgao || q.fromName || q.fromAddress || "—"}</span>
                        <span className="shrink-0">{q.matchedItems}/{q.totalItems} itens</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="p-8 text-center text-sm text-gray-400">
              Nenhuma cotação recebida ainda.{isAdmin ? " Use uma das opções de sincronização acima." : ""}
            </div>
          )}
        </div>

        <div className="border border-gray-200">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-bold uppercase tracking-wider text-gray-500">
            Detalhe e cruzamento
          </div>
          {selectedId == null ? (
            <div className="p-8 text-center text-sm text-gray-400">Selecione uma cotação à esquerda.</div>
          ) : detailQuery.isLoading ? (
            <div className="p-8 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
          ) : detailQuery.data ? (
            <QuotationDetail
              data={detailQuery.data}
              canEdit={canEdit}
              onChanged={() => {
                utils.emailQuotations.get.invalidate({ id: selectedId });
                utils.emailQuotations.list.invalidate();
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

type DetailData = {
  quotation: {
    id: number;
    subject: string | null;
    orgao: string | null;
    fromName: string | null;
    status: string;
    bodyText: string | null;
    prazoResposta: string | Date | null;
    propostaPdfUrl: string | null;
    propostaGeradaEm: string | Date | null;
    propostaMargemPercent: string | null;
  };
  items: Array<{
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
  }>;
};

function QuotationDetail({
  data,
  canEdit,
  onChanged,
}: {
  data: DetailData;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [, navigate] = useLocation();
  const confirmMutation = trpc.emailQuotations.setItemMatch.useMutation({
    onSuccess: () => { toast.success("Item atualizado."); onChanged(); },
    onError: (e) => toast.error(e.message),
  });
  const statusMutation = trpc.emailQuotations.setStatus.useMutation({
    onSuccess: () => { toast.success("Status atualizado."); onChanged(); },
    onError: (e) => toast.error(e.message),
  });
  const prazoMutation = trpc.emailQuotations.setPrazo.useMutation({
    onSuccess: () => { toast.success("Prazo atualizado."); onChanged(); },
    onError: (e) => toast.error(e.message),
  });
  const orcamentoMutation = trpc.emailQuotations.gerarOrcamento.useMutation({
    onSuccess: (res) => {
      window.open(res.pdfUrl, "_blank");
      const overrideNote = res.categoryOverrides > 0
        ? ` (${res.categoryOverrides} item(ns) com margem de categoria, efetiva ${res.effectiveMarginPercent}%)`
        : "";
      toast.success(
        `Orçamento gerado: ${res.itemCount} item(ns), margem ${res.marginPercent}%${overrideNote}.` +
          (res.itemsSemPreco > 0 ? ` ${res.itemsSemPreco} sem preço cadastrado.` : ""),
      );
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
      toast.success(jaExistia ? "Cotação já estava no Funil." : "Cotação enviada ao Funil.");
      navigate(`/funil?oportunidade=${id}`);
    },
    onError: (error) => toast.error(error.message),
  });
  const prepararPortalMutation = trpc.emailQuotations.prepararParaPortal.useMutation({
    onSuccess: (res) => {
      toast.success(res.created ? "Proposta criada a partir da cotação." : "Proposta já existia — abrindo.");
      navigate(`/agente-proposta?propostaId=${res.proposalId}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const { quotation, items } = data;
  const isPortalSourced = (quotation.fromName ?? "").startsWith("Portal ");

  return (
    <div className="max-h-[70vh] overflow-y-auto">
      <div className="p-4 border-b border-gray-100">
        <div className="font-semibold text-gray-900">{quotation.subject || "(sem assunto)"}</div>
        <div className="text-xs text-gray-500 mt-0.5">{quotation.orgao || "—"}</div>
        {quotation.propostaGeradaEm && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-indigo-700 bg-indigo-50 px-2 py-1 w-fit">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>
              Proposta gerada automaticamente
              {quotation.propostaMargemPercent ? ` (margem ${quotation.propostaMargemPercent}%)` : ""}.
            </span>
            {quotation.propostaPdfUrl && (
              <a
                href={quotation.propostaPdfUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-0.5 font-semibold underline hover:text-indigo-900"
              >
                <FileText className="w-3 h-3" /> Ver PDF <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 mt-2">
          <label className="text-[11px] font-semibold text-gray-500">Prazo de resposta:</label>
          <input
            type="date"
            defaultValue={quotation.prazoResposta ? String(quotation.prazoResposta).slice(0, 10) : ""}
            onChange={(e) => prazoMutation.mutate({ id: quotation.id, prazoResposta: e.target.value || null })}
            disabled={!canEdit}
            className="border border-gray-300 px-2 py-1 text-xs"
          />
        </div>
        {canEdit && <div className="flex flex-wrap gap-2 mt-3">
          <button
            onClick={() => funnelMutation.mutate({ quotationId: quotation.id })}
            disabled={funnelMutation.isPending}
            className="flex items-center gap-1 text-xs font-semibold text-white bg-gray-900 hover:bg-blue-700 px-3 py-1 disabled:opacity-60"
          >
            {funnelMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <KanbanSquare className="w-3 h-3" />}
            Abrir no Funil
          </button>
          <button
            onClick={() => orcamentoMutation.mutate({ id: quotation.id })}
            disabled={orcamentoMutation.isPending}
            className="flex items-center gap-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 disabled:opacity-60"
          >
            {orcamentoMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            Gerar orçamento (PDF)
          </button>
          {statusInfo.data?.smtpConfigured && (
            <button
              onClick={() => responderMutation.mutate({ id: quotation.id })}
              disabled={responderMutation.isPending}
              className="flex items-center gap-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1 disabled:opacity-60"
              title="Gera o orçamento e envia por e-mail ao remetente"
            >
              {responderMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Responder por e-mail
            </button>
          )}
          {isPortalSourced && (
            <button
              onClick={() => prepararPortalMutation.mutate({ id: quotation.id })}
              disabled={prepararPortalMutation.isPending}
              className="flex items-center gap-1 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 px-3 py-1 disabled:opacity-60"
              title="Cria a proposta e abre o Agente de Propostas para preencher no portal"
            >
              {prepararPortalMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3" />}
              Preencher no portal
            </button>
          )}
          <button
            onClick={() => statusMutation.mutate({ id: quotation.id, status: "respondida" })}
            className="text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 px-3 py-1"
          >
            Marcar respondida
          </button>
          <button
            onClick={() => statusMutation.mutate({ id: quotation.id, status: "descartada" })}
            className="text-xs font-semibold text-gray-600 bg-gray-50 hover:bg-gray-100 px-3 py-1"
          >
            Descartar
          </button>
        </div>}
      </div>

      <table className="w-full text-xs">
        <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider">
          <tr>
            <th className="text-left px-3 py-2 font-bold">Item solicitado</th>
            <th className="text-left px-3 py-2 font-bold">Qtd</th>
            <th className="text-left px-3 py-2 font-bold">Match</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((item) => (
            <tr key={item.id}>
              <td className="px-3 py-2 align-top">
                <div className="font-medium text-gray-800">{item.descricao}</div>
                {item.codigoCatalogo && (
                  <div className="text-[10px] text-gray-400 mt-0.5">cód. {item.codigoCatalogo}</div>
                )}
              </td>
              <td className="px-3 py-2 align-top whitespace-nowrap text-gray-600">
                {item.quantidade ?? "—"} {item.unidade ?? ""}
              </td>
              <td className="px-3 py-2 align-top">
                {item.produtoMatchId ? (
                  <div className="flex items-center gap-1">
                    {item.matchConfirmado ? (
                      item.matchAuto ? (
                        <Sparkles className="w-3.5 h-3.5 text-indigo-500" aria-label="Confirmado automaticamente" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                      )
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                    )}
                    <span className="text-gray-700">
                      #{item.produtoMatchId}
                      <span className="text-gray-400 ml-1">
                        ({item.matchMethod}
                        {item.matchScore ? ` ${Math.round(Number(item.matchScore) * 100)}%` : ""})
                      </span>
                    </span>
                  </div>
                ) : (
                  <span className="flex items-center gap-1 text-gray-400">
                    <XCircle className="w-3.5 h-3.5" /> sem match
                  </span>
                )}
                {item.precoSugerido && (
                  <div className="text-[10px] text-gray-500 mt-0.5">preço: R$ {item.precoSugerido}</div>
                )}
              </td>
              <td className="px-3 py-2 align-top text-right">
                {canEdit && item.produtoMatchId && !item.matchConfirmado && (
                  <button
                    onClick={() =>
                      confirmMutation.mutate({
                        itemId: item.id,
                        produtoMatchId: item.produtoMatchId,
                        precoSugerido: item.precoSugerido,
                      })
                    }
                    disabled={confirmMutation.isPending}
                    className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 disabled:opacity-50"
                  >
                    Confirmar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {items.length === 0 && (
        <div className="p-6 text-center text-sm text-gray-400">
          Nenhum item extraído automaticamente. O conteúdo original está preservado para conferência manual.
        </div>
      )}
    </div>
  );
}
