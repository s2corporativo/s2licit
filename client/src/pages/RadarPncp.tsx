import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Radar, Search, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

/**
 * Radar de oportunidades PNCP — busca pública de licitações por palavra-chave.
 */
export default function RadarPncp() {
  const [keywordsInput, setKeywordsInput] = useState("");
  const [uf, setUf] = useState("");
  const [dias, setDias] = useState(7);
  const [params, setParams] = useState<{ keywords: string[]; uf?: string; diasAtras: number } | null>(null);

  const query = trpc.pncpRadar.buscarOportunidades.useQuery(
    {
      keywords: params?.keywords ?? [],
      uf: params?.uf,
      diasAtras: params?.diasAtras ?? 7,
    },
    { enabled: params != null, retry: false },
  );

  const buscar = () => {
    const keywords = keywordsInput
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length >= 2);
    setParams({ keywords, uf: uf.trim() ? uf.trim().toUpperCase() : undefined, diasAtras: dias });
  };

  if (query.error) toast.error("Falha ao consultar o PNCP: " + query.error.message);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Radar className="w-7 h-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Radar de Oportunidades</h1>
          <p className="text-sm text-gray-500">Licitações publicadas no PNCP (Portal Nacional de Contratações Públicas)</p>
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
      </div>

      {params && query.data && (
        <div className="text-sm text-gray-500 mb-3">
          {query.data.encontradas} oportunidade(s) encontrada(s) de {query.data.totalRegistros} no período.
        </div>
      )}

      {query.data && query.data.oportunidades.length > 0 ? (
        <div className="space-y-3">
          {query.data.oportunidades.map((op) => (
            <div key={op.sourceId} className="border border-gray-200 p-4 hover:border-blue-300 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900">{op.orgao}</div>
                  <div className="text-xs text-gray-500">{op.unidadeCompradora} · {op.uf} {op.municipio ? `· ${op.municipio}` : ""}</div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-100 text-blue-800 shrink-0">{op.modalidade}</span>
              </div>
              <p className="text-sm text-gray-700 mt-2 line-clamp-3">{op.objeto}</p>
              <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
                <span>
                  {op.valorEstimado > 0 ? `R$ ${op.valorEstimado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "valor não informado"}
                </span>
                {op.links[0] && (
                  <a href={op.links[0]} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-700 hover:text-blue-900 font-semibold">
                    Abrir no portal <ExternalLink className="w-3 h-3" />
                  </a>
                )}
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
