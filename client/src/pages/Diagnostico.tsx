import { trpc } from "@/lib/trpc";
import { usePermission } from "@/components/RequireAuth";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  DatabaseBackup,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
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

function healthTone(state: string) {
  if (state === "HEALTHY" || state === "CONNECTED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (state === "DOWN" || state === "CONTRACT_DRIFT") return "border-red-200 bg-red-50 text-red-800";
  if (state === "DEGRADED") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-gray-200 bg-gray-50 text-gray-700";
}

export default function Diagnostico() {
  const isAdmin = usePermission("admin");
  const query = trpc.diagnostico.verificar.useQuery(undefined, { refetchOnWindowFocus: false });
  const data = query.data;
  const backupQuery = trpc.diagnostico.backupStatus.useQuery(undefined, { refetchOnWindowFocus: false });
  const backupMutation = trpc.diagnostico.backupAgora.useMutation({
    onSuccess: (response) => {
      if (response.ok) {
        toast.success(`Backup concluído: ${response.arquivo}`);
        backupQuery.refetch();
      } else {
        toast.error("O backup falhou.", { description: response.erro });
      }
    },
    onError: (error) => toast.error("Não foi possível executar o backup.", { description: error.message }),
  });
  const copilot = trpc.diagnostico.analisarIntegracoesIa.useMutation({
    onError: (error) => toast.error("A análise técnica por IA falhou.", { description: error.message }),
  });

  const groups = new Map<string, NonNullable<typeof data>["itens"]>();
  for (const item of data?.itens ?? []) {
    if (!groups.has(item.categoria)) groups.set(item.categoria, []);
    groups.get(item.categoria)!.push(item);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <Activity className="w-7 h-7 text-blue-700" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Integrações e Diagnóstico</h1>
            <p className="text-sm text-gray-500">
              Saúde operacional, telemetria, automações e diagnóstico técnico fundamentado em evidências
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
          className="flex items-center gap-2 text-sm font-semibold px-4 py-2 border border-gray-200 hover:bg-gray-50 disabled:opacity-50 rounded-lg"
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
            <div className="border border-emerald-200 bg-emerald-50 p-3 text-center rounded-xl">
              <div className="text-2xl font-bold text-emerald-700">{data.resumo.ok}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">OK</div>
            </div>
            <div className="border border-amber-200 bg-amber-50 p-3 text-center rounded-xl">
              <div className="text-2xl font-bold text-amber-700">{data.resumo.atencao}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Atenção</div>
            </div>
            <div className="border border-red-200 bg-red-50 p-3 text-center rounded-xl">
              <div className="text-2xl font-bold text-red-700">{data.resumo.erro}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-red-600">Erros</div>
            </div>
          </div>

          {data.integracoes?.length > 0 && (
            <section className="mb-5">
              <div className="flex items-center justify-between gap-3 mb-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Saúde das integrações</h2>
                <span className="text-[10px] text-gray-400">Baseada em configuração + api_logs das últimas 24h</span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {data.integracoes.map((integration) => (
                  <div key={integration.code} className={`border rounded-xl p-3 ${healthTone(integration.state)}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold">{integration.label}</div>
                        <div className="text-[10px] mt-0.5 opacity-70">
                          {integration.transport} · {integration.stability}
                        </div>
                      </div>
                      <span className="text-[9px] font-mono font-bold">{integration.state}</span>
                    </div>
                    <div className="text-[11px] mt-2 leading-relaxed">{integration.detail}</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px] opacity-70">
                      {integration.latencyMs != null && <span>{integration.latencyMs} ms</span>}
                      <span>{integration.errors24h ?? 0} erro(s)/24h</span>
                      {integration.lastSuccessAt && (
                        <span>último OK {new Date(integration.lastSuccessAt).toLocaleString("pt-BR")}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="border border-indigo-200 bg-indigo-50 p-4 mb-5 rounded-xl">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3 max-w-3xl">
                <Bot className="w-5 h-5 text-indigo-700 mt-0.5" />
                <div>
                  <div className="text-sm font-bold text-indigo-950">S2 Integration Engineer — IA especializada</div>
                  <div className="text-xs text-indigo-800 mt-1">
                    Analisa o snapshot real acima e as falhas recentes. A IA é instruída a não inventar estados,
                    a diferenciar ausência de oportunidades de indisponibilidade e a priorizar ações P0/P1/P2.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => copilot.mutate({})}
                disabled={copilot.isPending}
                className="inline-flex items-center gap-2 bg-indigo-700 text-white px-4 py-2 text-xs font-bold hover:bg-indigo-800 disabled:opacity-50 rounded-lg"
              >
                {copilot.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Analisar integrações
              </button>
            </div>
            {copilot.data && (
              <div className="mt-4 border-t border-indigo-200 pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold text-indigo-950">{copilot.data.resumo}</span>
                  <span className="text-[9px] font-bold uppercase bg-white/70 border border-indigo-200 px-1.5 py-0.5 text-indigo-800">
                    {copilot.data.severidade}
                  </span>
                </div>
                {copilot.data.diagnosticos.length > 0 && (
                  <div className="grid md:grid-cols-2 gap-2 mb-3">
                    {copilot.data.diagnosticos.map((diagnosis, index) => (
                      <div key={`${diagnosis.fonte}-${index}`} className="bg-white/80 border border-indigo-100 p-3 rounded-lg">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-bold text-gray-900">{diagnosis.fonte}</div>
                          <div className="text-[10px] text-gray-400">confiança {Math.round(diagnosis.confianca * 100)}%</div>
                        </div>
                        <div className="text-xs text-gray-700 mt-1">{diagnosis.causaProvavel}</div>
                        {diagnosis.evidencias.length > 0 && (
                          <ul className="list-disc list-inside text-[10px] text-gray-500 mt-2">
                            {diagnosis.evidencias.map((evidence, evidenceIndex) => <li key={evidenceIndex}>{evidence}</li>)}
                          </ul>
                        )}
                        <div className="text-[11px] text-blue-800 mt-2"><strong>Ação:</strong> {diagnosis.acao}</div>
                      </div>
                    ))}
                  </div>
                )}
                {copilot.data.prioridades.length > 0 && (
                  <div className="text-xs text-indigo-950">
                    <strong>Prioridades:</strong> {copilot.data.prioridades.join(" · ")}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border border-gray-200 bg-white p-4 mb-4 rounded-xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <DatabaseBackup className="mt-0.5 h-5 w-5 text-blue-700" />
                <div>
                  <div className="text-sm font-bold text-gray-900">Backup do banco de dados</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {backupQuery.data?.ultimo ? (
                      <>
                        Último backup: <strong>{new Date(backupQuery.data.ultimo.em).toLocaleString("pt-BR")}</strong>{" "}
                        ({backupQuery.data.ultimo.arquivo})
                      </>
                    ) : backupQuery.isLoading ? "Verificando..." : "Nenhum backup encontrado ainda."}
                  </div>
                </div>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => backupMutation.mutate()}
                  disabled={backupMutation.isPending}
                  className="flex items-center gap-2 border border-blue-700 px-4 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50 rounded-lg"
                >
                  {backupMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DatabaseBackup className="h-3.5 w-3.5" />}
                  Fazer backup agora
                </button>
              )}
            </div>
          </div>

          <div className="border border-blue-200 bg-blue-50 p-4 mb-6 rounded-xl">
            <div className="flex items-start gap-3">
              <KeyRound className="w-5 h-5 text-blue-700 mt-0.5" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-blue-900">
                  {data.ambiente.total} secrets/configurações de infraestrutura reconhecidos no boot
                </div>
                <div className="text-xs text-blue-700 mt-1">
                  Credenciais operacionais e agendas podem ser alteradas diretamente na Central de Integrações.
                  GitHub/redeploy não é necessário para essas mudanças. Valores secretos nunca são exibidos.
                </div>
                {data.ambiente.configurados.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {data.ambiente.configurados.map((name) => (
                      <code key={name} className="text-[10px] font-semibold bg-white border border-blue-200 text-blue-800 px-2 py-1">
                        {name}
                      </code>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {data.resumo.erro === 0 && data.resumo.atencao === 0 && (
            <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 p-3 mb-6 rounded-lg">
              <ShieldCheck className="w-5 h-5" />
              Tudo em ordem — nenhum problema detectado.
            </div>
          )}

          <div className="space-y-6">
            {[...groups.entries()].map(([category, items]) => (
              <section key={category}>
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">{category}</h2>
                <div className="space-y-2">
                  {items.map((item) => {
                    const status = STATUS[item.status];
                    const Icon = status.icon;
                    return (
                      <div key={item.codigo ?? `${category}-${item.item}`} className={`border ${status.bg} p-3 flex gap-3 rounded-lg`}>
                        <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${status.cor}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900">{item.item}</span>
                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 ${status.chip}`}>{item.status}</span>
                          </div>
                          <div className="text-sm text-gray-600 mt-0.5">{item.detalhe}</div>
                          {item.acao && (
                            <div className="text-xs text-blue-700 bg-blue-50 border border-blue-100 px-2 py-1.5 mt-2 rounded">
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
            O painel usa configuração efetiva e telemetria operacional. Ele não lê nem exibe conteúdo de secrets.
          </p>
        </>
      ) : (
        <div className="p-8 text-center text-red-600">Não foi possível executar o diagnóstico.</div>
      )}
    </div>
  );
}
