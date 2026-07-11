import { useMemo, useState } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, RefreshCcw, ShieldAlert, Target } from "lucide-react";
import { trpc } from "@/lib/trpc";

function RecommendationBadge({ value }: { value: string | null | undefined }) {
  const map: Record<string, string> = {
    vale_entrar: "bg-emerald-100 text-emerald-800 border-emerald-200",
    entrar_com_cautela: "bg-amber-100 text-amber-800 border-amber-200",
    nao_vale_entrar: "bg-rose-100 text-rose-800 border-rose-200",
  };
  const label: Record<string, string> = {
    vale_entrar: "Vale entrar",
    entrar_com_cautela: "Entrar com cautela",
    nao_vale_entrar: "Não vale entrar",
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${map[value ?? ""] ?? "bg-slate-100 text-slate-700 border-slate-200"}`}>
      {label[value ?? ""] ?? "Sem classificação"}
    </span>
  );
}

export default function ExecutiveDecisionCenter() {
  const [proposalId, setProposalId] = useState("");
  const [selectedDecisionId, setSelectedDecisionId] = useState<number | null>(null);

  const recentQuery = trpc.executiveDecision.listRecentDecisions.useQuery({ limit: 20 });
  const detailQuery = trpc.executiveDecision.getDecision.useQuery(
    { decisionId: selectedDecisionId ?? 0 },
    { enabled: selectedDecisionId !== null },
  );

  const evaluateMutation = trpc.executiveDecision.evaluate.useMutation({
    onSuccess: (data) => {
      setSelectedDecisionId(data.decisionId);
      recentQuery.refetch();
    },
  });

  const recalcMutation = trpc.executiveDecision.recalculateDecision.useMutation({
    onSuccess: (data) => {
      setSelectedDecisionId(data.decisionId);
      recentQuery.refetch();
    },
  });

  const selected = detailQuery.data?.decision;
  const factors = detailQuery.data?.factors ?? [];

  const stats = useMemo(() => {
    const rows = recentQuery.data ?? [];
    return {
      total: rows.length,
      positivas: rows.filter((row) => row.recommendation === "vale_entrar").length,
      cautela: rows.filter((row) => row.recommendation === "entrar_com_cautela").length,
      negativas: rows.filter((row) => row.recommendation === "nao_vale_entrar").length,
    };
  }, [recentQuery.data]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                <Target className="h-3.5 w-3.5" />
                Assistente de Decisão Executivo
              </div>
              <h1 className="text-2xl font-black text-slate-900">Avaliação executiva de oportunidades</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">
                Consolida aderência ao catálogo, risco documental, viabilidade econômica e histórico operacional para recomendar se vale disputar uma oportunidade.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
              <input
                value={proposalId}
                onChange={(e) => setProposalId(e.target.value.replace(/\D/g, ""))}
                placeholder="ID da proposta/oportunidade"
                className="h-11 min-w-[240px] rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-blue-500"
              />
              <button
                onClick={() => evaluateMutation.mutate({ proposalId: Number(proposalId) })}
                disabled={!proposalId || evaluateMutation.isPending}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <BarChart3 className="h-4 w-4" />
                Gerar parecer
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Decisões</p>
              <p className="mt-3 text-3xl font-black text-slate-900">{stats.total}</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Vale entrar</p>
              <p className="mt-3 text-3xl font-black text-emerald-900">{stats.positivas}</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Cautela</p>
              <p className="mt-3 text-3xl font-black text-amber-900">{stats.cautela}</p>
            </div>
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-700">Não vale</p>
              <p className="mt-3 text-3xl font-black text-rose-900">{stats.negativas}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-700">Pareceres recentes</h2>
                <p className="mt-1 text-sm text-slate-500">Últimas avaliações salvas no módulo executivo.</p>
              </div>
              <button
                onClick={() => recentQuery.refetch()}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <RefreshCcw className="h-3.5 w-3.5" /> Atualizar
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              {(recentQuery.data ?? []).map((row) => (
                <button
                  key={row.id}
                  onClick={() => setSelectedDecisionId(row.id)}
                  className="flex w-full flex-col gap-3 px-5 py-4 text-left transition hover:bg-slate-50 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="text-sm font-bold text-slate-900">Proposta #{row.proposalId ?? "—"}</p>
                    <p className="mt-1 text-xs text-slate-500">Score total: {row.totalScore} · Atualizado em {new Date(row.updatedAt).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <RecommendationBadge value={row.recommendation} />
                    <span className="text-sm font-bold text-slate-700">{row.totalScore}/100</span>
                  </div>
                </button>
              ))}
              {!recentQuery.isLoading && (recentQuery.data ?? []).length === 0 && (
                <div className="px-5 py-10 text-center text-sm text-slate-500">Nenhum parecer executivo gerado até o momento.</div>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-700">Decisão detalhada</h2>
                <p className="mt-1 text-sm text-slate-500">Justificativa consolidada para suporte à decisão.</p>
              </div>
              {selected && <RecommendationBadge value={selected.recommendation} />}
            </div>

            {selected ? (
              <div className="mt-5 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Score total</p>
                    <p className="mt-2 text-3xl font-black text-slate-900">{selected.totalScore}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Margem estimada</p>
                    <p className="mt-2 text-3xl font-black text-slate-900">{selected.marginEstimate ?? "0.00"}%</p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Justificativa</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{selected.justification ?? "Sem justificativa registrada."}</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Próximo passo recomendado</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{selected.nextStep ?? "Sem próximo passo registrado."}</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-slate-500" />
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Fatores de decisão</p>
                  </div>
                  <div className="space-y-3">
                    {factors.map((factor) => (
                      <div key={factor.id} className="rounded-xl border border-slate-200 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-slate-900">{factor.factorLabel}</p>
                            <p className="text-xs text-slate-500">Peso {factor.weight}%</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-black text-slate-900">{factor.score}/100</p>
                            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">{factor.impact}</p>
                          </div>
                        </div>
                        {factor.details && (
                          <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950/95 p-3 text-[11px] leading-5 text-slate-100">{factor.details}</pre>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {selected.proposalId && (
                  <button
                    onClick={() => recalcMutation.mutate({ proposalId: selected.proposalId! })}
                    disabled={recalcMutation.isPending}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <RefreshCcw className="h-4 w-4" /> Recalcular parecer
                  </button>
                )}
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
                Selecione um parecer recente ou informe um ID de proposta para gerar a primeira decisão executiva.
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-slate-700">
              <CheckCircle2 className="h-4 w-4" />
              <h3 className="text-sm font-black uppercase tracking-[0.18em]">Regras operacionais</h3>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <p>O parecer executivo é apenas um apoio conservador à decisão. A validação jurídica, técnica e financeira final permanece obrigatória.</p>
              <p>Os fatores são persistidos para rastreabilidade e auditoria, permitindo recalcular a recomendação conforme a base evolui.</p>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4" />
                  <p className="text-sm">Use o módulo prioritariamente após revisar produtos, documentos de habilitação e dados de margem para evitar falsas aprovações.</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
