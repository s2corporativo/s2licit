import { trpc } from "@/lib/trpc";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";

const STATUS = {
  ok: {
    icon: CheckCircle2,
    cor: "text-emerald-600",
    bg: "border-emerald-200",
    chip: "bg-emerald-50 text-emerald-700",
  },
  atencao: {
    icon: AlertTriangle,
    cor: "text-amber-600",
    bg: "border-amber-200",
    chip: "bg-amber-50 text-amber-700",
  },
  erro: {
    icon: XCircle,
    cor: "text-red-600",
    bg: "border-red-200",
    chip: "bg-red-50 text-red-700",
  },
} as const;

export default function Diagnostico() {
  const query = trpc.diagnostico.verificar.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const data = query.data;

  const groups = new Map<string, NonNullable<typeof data>["itens"]>();
  for (const item of data?.itens ?? []) {
    if (!groups.has(item.categoria)) groups.set(item.categoria, []);
    groups.get(item.categoria)!.push(item);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <Activity className="w-7 h-7 text-blue-700" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Integrações e Diagnóstico</h1>
            <p className="text-sm text-gray-500">
              Estado real do banco, automações, dados e credenciais disponibilizadas ao sistema
            </p>
          </div>
        </div>
        <button
          onClick={() => query.refetch()}
          disabled={query.isFetching}
          className="flex items-center gap-2 text-sm font-semibold px-4 py-2 border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${query.isFetching ? "animate-spin" : ""}`} />
          Verificar novamente
        </button>
      </div>

      {query.isLoading ? (
        <div className="p-10 text-center text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mx-auto" />
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
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

          <div className="border border-blue-200 bg-blue-50 p-4 mb-6">
            <div className="flex items-start gap-3">
              <KeyRound className="w-5 h-5 text-blue-700 mt-0.5" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-blue-900">
                  {data.ambiente.total} configurações sensíveis reconhecidas pelo container
                </div>
                <div className="text-xs text-blue-700 mt-1">
                  Os valores permanecem ocultos. Após alterar um secret no GitHub, execute o workflow Deploy VPS.
                </div>
                {data.ambiente.configurados.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {data.ambiente.configurados.map((name) => (
                      <code
                        key={name}
                        className="text-[10px] font-semibold bg-white border border-blue-200 text-blue-800 px-2 py-1"
                      >
                        {name}
                      </code>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {data.resumo.erro === 0 && data.resumo.atencao === 0 && (
            <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 p-3 mb-6">
              <ShieldCheck className="w-5 h-5" />
              Tudo em ordem — nenhum problema detectado.
            </div>
          )}

          <div className="space-y-6">
            {[...groups.entries()].map(([category, items]) => (
              <section key={category}>
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                  {category}
                </h2>
                <div className="space-y-2">
                  {items.map((item) => {
                    const status = STATUS[item.status];
                    const Icon = status.icon;
                    return (
                      <div key={item.codigo ?? `${category}-${item.item}`} className={`border ${status.bg} p-3 flex gap-3`}>
                        <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${status.cor}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900">{item.item}</span>
                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 ${status.chip}`}>
                              {item.status}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600 mt-0.5">{item.detalhe}</div>
                          {item.acao && (
                            <div className="text-xs text-blue-700 bg-blue-50 border border-blue-100 px-2 py-1.5 mt-2">
                              <strong>Ação:</strong> {item.acao}
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
            O painel não lê nem exibe o conteúdo dos secrets. Ele confirma apenas se cada variável chegou ao container e se os dados essenciais estão disponíveis.
          </p>
        </>
      ) : (
        <div className="p-8 text-center text-red-600">Não foi possível executar o diagnóstico.</div>
      )}
    </div>
  );
}
