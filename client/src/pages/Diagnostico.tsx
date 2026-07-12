import { trpc } from "@/lib/trpc";
import { Activity, Loader2, CheckCircle2, AlertTriangle, XCircle, RefreshCw } from "lucide-react";

/**
 * Central de Diagnóstico: painel de saúde do sistema. Roda verificações
 * reais (banco, integrações, dados, segurança, agendador) e mostra o que
 * está OK, o que merece atenção e o que está com erro — com o que fazer.
 */

const STATUS = {
  ok: { icon: CheckCircle2, cor: "text-emerald-600", bg: "border-emerald-200", chip: "bg-emerald-50 text-emerald-700" },
  atencao: { icon: AlertTriangle, cor: "text-amber-600", bg: "border-amber-200", chip: "bg-amber-50 text-amber-700" },
  erro: { icon: XCircle, cor: "text-red-600", bg: "border-red-200", chip: "bg-red-50 text-red-700" },
} as const;

export default function Diagnostico() {
  const q = trpc.diagnostico.verificar.useQuery(undefined, { refetchOnWindowFocus: false });
  const data = q.data;

  // Agrupa por categoria
  const grupos = new Map<string, NonNullable<typeof data>["itens"]>();
  for (const it of data?.itens ?? []) {
    if (!grupos.has(it.categoria)) grupos.set(it.categoria, []);
    grupos.get(it.categoria)!.push(it);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Activity className="w-7 h-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Central de Diagnóstico</h1>
            <p className="text-sm text-gray-500">Saúde do sistema em tempo real — o que está funcionando e o que precisa de ação</p>
          </div>
        </div>
        <button
          onClick={() => q.refetch()}
          disabled={q.isFetching}
          className="flex items-center gap-2 text-sm font-semibold px-4 py-2 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${q.isFetching ? "animate-spin" : ""}`} /> Verificar de novo
        </button>
      </div>

      {q.isLoading ? (
        <div className="p-10 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : data ? (
        <>
          {/* Placar */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="border border-emerald-200 bg-emerald-50 p-3 text-center">
              <div className="text-2xl font-bold text-emerald-700">{data.resumo.ok}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">OK</div>
            </div>
            <div className="border border-amber-200 bg-amber-50 p-3 text-center">
              <div className="text-2xl font-bold text-amber-700">{data.resumo.atencao}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Atenção</div>
            </div>
            <div className="border border-red-200 bg-red-50 p-3 text-center">
              <div className="text-2xl font-bold text-red-700">{data.resumo.erro}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-red-600">Erros</div>
            </div>
          </div>

          {data.resumo.erro === 0 && data.resumo.atencao === 0 && (
            <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 p-3 mb-6">
              <CheckCircle2 className="w-5 h-5" /> Tudo em ordem — nenhum problema detectado.
            </div>
          )}

          {/* Checagens por categoria */}
          <div className="space-y-6">
            {[...grupos.entries()].map(([categoria, itens]) => (
              <section key={categoria}>
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">{categoria}</h2>
                <div className="space-y-2">
                  {itens.map((it, i) => {
                    const s = STATUS[it.status];
                    const Icon = s.icon;
                    return (
                      <div key={i} className={`border ${s.bg} p-3 flex gap-3`}>
                        <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${s.cor}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900">{it.item}</span>
                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${s.chip}`}>{it.status}</span>
                          </div>
                          <div className="text-sm text-gray-600 mt-0.5">{it.detalhe}</div>
                          {it.acao && (
                            <div className="text-xs text-blue-700 bg-blue-50 border border-blue-100 px-2 py-1.5 mt-2 rounded">
                              <strong>O que fazer:</strong> {it.acao}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          <p className="text-xs text-gray-400 mt-8 border-t border-gray-100 pt-4">
            Encontrou um problema que não sabe resolver? Copie o item aqui e me mande no chat — eu corrijo no código e o
            sistema se atualiza sozinho no próximo deploy.
          </p>
        </>
      ) : (
        <div className="p-8 text-center text-red-500">Não foi possível rodar o diagnóstico.</div>
      )}
    </div>
  );
}
