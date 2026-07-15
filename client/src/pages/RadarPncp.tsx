import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { usePermission } from "@/components/RequireAuth";
import { Radar, Search, Loader2, ExternalLink, AlertTriangle, KanbanSquare } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type Fonte = "pncp" | "comprasgov" | "fiemg";

/** Rótulo e cor do badge de cada fonte. */
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

/**
 * Radar de oportunidades — busca pública de licitações em múltiplas fontes
 * (PNCP, Compras.gov.br e Sistema S / FIEMG) por palavra-chave.
 */
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
    setFontes((atual) =>
      atual.includes(id) ? atual.filter((f) => f !== id) : [...atual, id],
    );
  };

  const buscar = () => {
    const keywords = keywordsInput
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length >= 2);
    const fontesEscolhidas = fontes.length > 0 ? fontes : (["pncp"] as Fonte[]);
    setParams({
      keywords,
      uf: uf.trim() ? uf.trim().toUpperCase() : undefined,
      diasAtras: dias,
      fontes: fontesEscolhidas,
    });
  };

  // Toast de erro num efeito (antes era disparado no corpo do render, empilhando
  // a cada re-render).
  useEffect(() => {
    if (query.error) toast.error("Falha ao consultar o Radar: " + query.error.message);
  }, [query.error]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Radar className="w-7 h-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Radar de Oportunidades</h1>
          <p className="text-sm text-gray-500">Licitações do PNCP, Compras.gov.br e Sistema S / FIEMG em um só lugar</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-6 border border-gray-200 p-4">
        <div className="flex-1 min-w-[240px]">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
            Palavras-chave (separadas por vírgula)
          </label>
          <input
            value={keywordsInput}
            onChange={(e) => setKeywordsInput(e.target.value)}
            placeholder="medicamento, seringa, amoxicilina"
            className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">UF</label>
          <input
            value={uf}
            onChange={(e) => setUf(e.target.value)}
            placeholder="MG"
            maxLength={2}
            className="w-16 border border-gray-300 px-3 py-2 text-sm uppercase focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Período</label>
          <select
            value={dias}
            onChange={(e) => setDias(Number(e.target.value))}
            className="border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          >
            <option value={3}>3 dias</option>
            <option value={7}>7 dias</option>
            <option value={15}>15 dias</option>
            <option value={30}>30 dias</option>
          </select>
        </div>
        <button
          onClick={buscar}
          disabled={query.isFetching}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {query.isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Buscar
        </button>

        {/* Seleção de fontes */}
        <div className="w-full">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Fontes</label>
          <div className="flex flex-wrap gap-3">
            {FONTES_DISPONIVEIS.map((f) => (
              <label key={f.id} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={fontes.includes(f.id)}
                  onChange={() => toggleFonte(f.id)}
                  className="accent-blue-600"
                />
                {f.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {params && query.data && (
        <div className="text-sm text-gray-500 mb-3">
          {query.data.encontradas} oportunidade(s) encontrada(s)
          {typeof query.data.totalRegistros === "number" && query.data.totalRegistros > 0
            ? ` — ${query.data.totalRegistros} no PNCP no período`
            : ""}
          {query.data.porFonte && Object.keys(query.data.porFonte).length > 0 && (
            <span className="ml-1 text-gray-400">
              ({Object.entries(query.data.porFonte)
                .map(([src, n]) => `${FONTE_META[src]?.label ?? src}: ${n}`)
                .join(" · ")})
            </span>
          )}
        </div>
      )}

      {query.data?.erros && query.data.erros.length > 0 && (
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 mb-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Algumas fontes não responderam</span> (as demais foram consultadas normalmente):
            <ul className="list-disc list-inside mt-0.5">
              {query.data.erros.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {query.data && query.data.oportunidades.length > 0 ? (
        <div className="space-y-3">
          {query.data.oportunidades.map((op) => (
            <div key={`${op.source}:${op.sourceId}`} className="border border-gray-200 p-4 hover:border-blue-300 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900">{op.orgao}</div>
                  <div className="text-xs text-gray-500">{op.unidadeCompradora} · {op.uf} {op.municipio ? `· ${op.municipio}` : ""}</div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-[10px] font-bold px-2 py-0.5 ${FONTE_META[op.source]?.badge ?? "bg-gray-100 text-gray-700"}`}>
                    {FONTE_META[op.source]?.label ?? op.source}
                  </span>
                  <span className="text-[10px] font-medium px-2 py-0.5 bg-gray-100 text-gray-600">{op.modalidade}</span>
                </div>
              </div>
              <p className="text-sm text-gray-700 mt-2 line-clamp-3">{op.objeto}</p>
              <div className="flex flex-wrap items-center justify-between gap-2 mt-3 text-xs text-gray-500">
                <span>
                  {op.valorEstimado > 0 ? `R$ ${op.valorEstimado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "valor não informado"}
                </span>
                <div className="flex items-center gap-3">
                  {op.links[0] && (
                    <a href={op.links[0]} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-700 hover:text-blue-900 font-semibold">
                      Abrir no portal <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => funnelMutation.mutate({
                        source: op.source as Fonte,
                        sourceId: op.sourceId,
                        orgao: op.orgao,
                        modalidade: op.modalidade,
                        numeroProcesso: op.numeroProcesso,
                        objeto: op.objeto,
                        descricaoDetalhada: op.descricaoDetalhada || undefined,
                        uf: op.uf || undefined,
                        municipio: op.municipio || undefined,
                        dataPublicacao: op.dataPublicacao?.toISOString() ?? null,
                        dataAbertura: op.dataAbertura?.toISOString() ?? null,
                        dataEncerramento: op.dataEncerramento?.toISOString() ?? null,
                        valorEstimado: op.valorEstimado,
                        status: op.status,
                        links: op.links,
                        dedupeKey: op.dedupeKey,
                      })}
                      disabled={funnelMutation.isPending}
                      className="flex items-center gap-1 bg-gray-900 px-2.5 py-1.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {funnelMutation.isPending && funnelMutation.variables?.sourceId === op.sourceId
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
      ) : params && !query.isFetching && !query.error ? (
        <div className="text-center py-12 text-sm text-gray-400">
          Nenhuma oportunidade encontrada para esses critérios.
        </div>
      ) : null}
    </div>
  );
}
