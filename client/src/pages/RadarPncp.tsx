import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { usePermission } from "@/components/RequireAuth";
import {
  Radar,
  Search,
  Loader2,
  ExternalLink,
  AlertTriangle,
  KanbanSquare,
  CheckCircle2,
  XCircle,
  CircleMinus,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type Fonte = "pncp" | "comprasgov" | "fiemg";

const FONTE_META: Record<string, { label: string; badge: string }> = {
  pncp: { label: "PNCP", badge: "bg-blue-100 text-blue-800" },
  comprasgov: { label: "Compras.gov.br", badge: "bg-emerald-100 text-emerald-800" },
  fiemg: { label: "Sistema S / FIEMG", badge: "bg-amber-100 text-amber-800" },
};

const FONTES_DISPONIVEIS: { id: Fonte; label: string }[] = [
  { id: "pncp", label: "PNCP" },
  { id: "comprasgov", label: "Compras.gov.br" },
  { id: "fiemg", label: "Sistema S / FIEMG" },
];

function SourceStatusCard({ status }: { status: {
  fonte: string;
  label: string;
  status: string;
  encontradas: number;
  durationMs: number;
  detail: string | null;
  partial: boolean;
} }) {
  const healthy = status.status === "SUCCESS";
  const empty = status.status === "NO_RESULTS";
  const degraded = status.status === "PARTIAL";
  const Icon = healthy ? CheckCircle2 : empty ? CircleMinus : degraded ? AlertTriangle : XCircle;
  const tone = healthy
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : empty
      ? "border-gray-200 bg-gray-50 text-gray-600"
      : degraded
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-red-200 bg-red-50 text-red-800";

  return (
    <div className={`rounded-lg border px-3 py-2 ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <Icon className="w-3.5 h-3.5" />
          {status.label}
        </div>
        <span className="text-[10px] font-mono opacity-70">{status.durationMs} ms</span>
      </div>
      <div className="mt-1 text-[11px]">
        {healthy || empty ? `${status.encontradas} registro(s) retornado(s)` : status.status}
      </div>
      {status.detail && <div className="mt-1 text-[10px] leading-relaxed opacity-80">{status.detail}</div>}
    </div>
  );
}

export default function RadarPncp() {
  const canEdit = usePermission("editor");
  const [, navigate] = useLocation();
  const [keywordsInput, setKeywordsInput] = useState("");
  const [uf, setUf] = useState("");
  const [dias, setDias] = useState(7);
  const [fontes, setFontes] = useState<Fonte[]>(["pncp", "comprasgov", "fiemg"]);
  const [params, setParams] = useState<{
    keywords: string[];
    uf?: string;
    diasAtras: number;
    fontes: Fonte[];
  } | null>(null);

  const query = trpc.pncpRadar.buscarOportunidades.useQuery(
    {
      keywords: params?.keywords ?? [],
      uf: params?.uf,
      diasAtras: params?.diasAtras ?? 7,
      fontes: params?.fontes ?? ["pncp", "comprasgov", "fiemg"],
    },
    { enabled: params != null, retry: false },
  );

  const funnelMutation = trpc.funil.criarDeRadar.useMutation({
    onSuccess: ({ id, jaExistia }) => {
      toast.success(jaExistia ? "Oportunidade já estava no Funil." : "Oportunidade enviada ao Funil.");
      navigate(`/funil?oportunidade=${id}`);
    },
    onError: (error) => toast.error(error.message),
  });

  const toggleFonte = (id: Fonte) => {
    setFontes((atual) => atual.includes(id) ? atual.filter((fonte) => fonte !== id) : [...atual, id]);
  };

  const buscar = () => {
    const keywords = keywordsInput
      .split(",")
      .map((keyword) => keyword.trim())
      .filter((keyword) => keyword.length >= 2);
    const fontesEscolhidas = fontes.length > 0 ? fontes : (["pncp"] as Fonte[]);
    setParams({
      keywords,
      uf: uf.trim() ? uf.trim().toUpperCase() : undefined,
      diasAtras: dias,
      fontes: fontesEscolhidas,
    });
  };

  useEffect(() => {
    if (query.error) {
      toast.error("Não foi possível executar o Radar.", { description: query.error.message });
    }
  }, [query.error]);

  const allConsultedNormally =
    query.data?.statusFontes?.every((status) => ["SUCCESS", "NO_RESULTS"].includes(status.status)) ?? false;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Radar className="w-7 h-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Radar de Oportunidades</h1>
          <p className="text-sm text-gray-500">
            Busca multi-fonte com diagnóstico individual de PNCP, Compras.gov.br e Sistema S / FIEMG
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-6 border border-gray-200 p-4 rounded-xl">
        <div className="flex-1 min-w-[240px]">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
            Palavras-chave (separadas por vírgula)
          </label>
          <input
            value={keywordsInput}
            onChange={(event) => setKeywordsInput(event.target.value)}
            placeholder="medicamento, seringa, amoxicilina"
            className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">UF</label>
          <input
            value={uf}
            onChange={(event) => setUf(event.target.value)}
            placeholder="MG"
            maxLength={2}
            className="w-16 border border-gray-300 px-3 py-2 text-sm uppercase focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Período</label>
          <select
            value={dias}
            onChange={(event) => setDias(Number(event.target.value))}
            className="border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          >
            <option value={3}>3 dias</option>
            <option value={7}>7 dias</option>
            <option value={15}>15 dias</option>
            <option value={30}>30 dias</option>
          </select>
        </div>
        <button
          type="button"
          onClick={buscar}
          disabled={query.isFetching}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {query.isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Buscar
        </button>

        <div className="w-full">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Fontes</label>
          <div className="flex flex-wrap gap-3">
            {FONTES_DISPONIVEIS.map((fonte) => (
              <label key={fonte.id} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={fontes.includes(fonte.id)}
                  onChange={() => toggleFonte(fonte.id)}
                  className="accent-blue-600"
                />
                {fonte.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {query.data?.statusFontes && query.data.statusFontes.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-4">
          {query.data.statusFontes.map((status) => (
            <SourceStatusCard key={status.fonte} status={status} />
          ))}
        </div>
      )}

      {params && query.data && (
        <div className="text-sm text-gray-500 mb-3">
          {query.data.encontradas} oportunidade(s) encontrada(s)
          {typeof query.data.totalRegistros === "number" && query.data.totalRegistros > 0
            ? ` — ${query.data.totalRegistros} registro(s) reportados pelo PNCP`
            : ""}
          {query.data.porFonte && Object.keys(query.data.porFonte).length > 0 && (
            <span className="ml-1 text-gray-400">
              ({Object.entries(query.data.porFonte)
                .map(([source, count]) => `${FONTE_META[source]?.label ?? source}: ${count}`)
                .join(" · ")})
            </span>
          )}
        </div>
      )}

      {query.data?.coberturaDegradada && (
        <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 mb-3 rounded-lg">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Cobertura parcial.</span>{" "}
            O resultado abaixo pode estar incompleto porque pelo menos uma fonte apresentou degradação.
            {query.data.erros.length > 0 && (
              <ul className="list-disc list-inside mt-1">
                {query.data.erros.map((error, index) => <li key={index}>{error}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}

      {query.data && query.data.oportunidades.length > 0 ? (
        <div className="space-y-3">
          {query.data.oportunidades.map((opportunity) => (
            <div
              key={`${opportunity.source}:${opportunity.sourceId}`}
              className="border border-gray-200 p-4 hover:border-blue-300 transition-colors rounded-xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900">{opportunity.orgao}</div>
                  <div className="text-xs text-gray-500">
                    {opportunity.unidadeCompradora} · {opportunity.uf} {opportunity.municipio ? `· ${opportunity.municipio}` : ""}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-[10px] font-bold px-2 py-0.5 ${FONTE_META[opportunity.source]?.badge ?? "bg-gray-100 text-gray-700"}`}>
                    {FONTE_META[opportunity.source]?.label ?? opportunity.source}
                  </span>
                  <span className="text-[10px] font-medium px-2 py-0.5 bg-gray-100 text-gray-600">
                    {opportunity.modalidade}
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-700 mt-2 line-clamp-3">{opportunity.objeto}</p>
              <div className="flex flex-wrap items-center justify-between gap-2 mt-3 text-xs text-gray-500">
                <span>
                  {opportunity.valorEstimado > 0
                    ? `R$ ${opportunity.valorEstimado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                    : "valor não informado"}
                </span>
                <div className="flex items-center gap-3">
                  {opportunity.links[0] && (
                    <a
                      href={opportunity.links[0]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-blue-700 hover:text-blue-900 font-semibold"
                    >
                      Abrir no portal <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => funnelMutation.mutate({
                        source: opportunity.source as Fonte,
                        sourceId: opportunity.sourceId,
                        orgao: opportunity.orgao,
                        modalidade: opportunity.modalidade,
                        numeroProcesso: opportunity.numeroProcesso,
                        objeto: opportunity.objeto,
                        descricaoDetalhada: opportunity.descricaoDetalhada || undefined,
                        uf: opportunity.uf || undefined,
                        municipio: opportunity.municipio || undefined,
                        dataPublicacao: opportunity.dataPublicacao?.toISOString() ?? null,
                        dataAbertura: opportunity.dataAbertura?.toISOString() ?? null,
                        dataEncerramento: opportunity.dataEncerramento?.toISOString() ?? null,
                        valorEstimado: opportunity.valorEstimado,
                        status: opportunity.status,
                        links: opportunity.links,
                        dedupeKey: opportunity.dedupeKey,
                      })}
                      disabled={funnelMutation.isPending}
                      className="flex items-center gap-1 bg-gray-900 px-2.5 py-1.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {funnelMutation.isPending && funnelMutation.variables?.sourceId === opportunity.sourceId
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <KanbanSquare className="w-3 h-3" />}
                      Enviar ao Funil
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : params && !query.isFetching && !query.error && query.data ? (
        allConsultedNormally ? (
          <div className="text-center py-12 text-sm text-gray-400">
            Nenhuma oportunidade encontrada para esses critérios. Todas as fontes consultadas responderam normalmente.
          </div>
        ) : (
          <div className="text-center py-12 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl">
            Não há oportunidades confirmadas, mas a cobertura está degradada. Consulte o diagnóstico das fontes acima antes de concluir que não existem oportunidades.
          </div>
        )
      ) : null}
    </div>
  );
}
