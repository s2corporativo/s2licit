import { useAuth } from "@/_core/hooks/useAuth";
import { hasMinimumRole } from "@/lib/access";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Database,
  GitCompareArrows,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

function money(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
}

function decisionLabel(value?: string) {
  if (value === "approved") return "Aprovado";
  if (value === "rejected") return "Divergente";
  if (value === "needs_review") return "Revisar";
  return null;
}

function engineLabel(engine?: string) {
  if (engine === "compendium_grounded_ai") return "IA + Compêndio";
  if (engine === "deterministic_memory_fallback") return "Determinístico + memória (IA indisponível)";
  if (engine === "deterministic_memory") return "Determinístico + memória";
  return "Motor técnico";
}

export default function CompendioEquivalencias() {
  const { user } = useAuth();
  const canEdit = hasMinimumRole(user?.role, "editor");
  const initialProductId = new URLSearchParams(window.location.search).get("productId")?.replace(/\D/g, "") ?? "";
  const [search, setSearch] = useState("");
  const [description, setDescription] = useState("");
  const [productId, setProductId] = useState(initialProductId);
  const [useAI, setUseAI] = useState(true);
  const [status, setStatus] = useState<"all" | "draft" | "ai_review" | "human_validated" | "rejected">("all");

  const stats = trpc.equivalenceCompendium.stats.useQuery(undefined, { refetchInterval: 60_000 });
  const entries = trpc.equivalenceCompendium.list.useQuery({
    search: search.trim() || undefined,
    status: status === "all" ? undefined : status,
    limit: 100,
    offset: 0,
  });
  const analyze = trpc.equivalenceCompendium.analyze.useMutation({ onError: (error) => toast.error(error.message) });
  const bootstrap = trpc.equivalenceCompendium.bootstrap.useMutation({
    onSuccess: async (result) => {
      toast.success(`Compêndio atualizado: ${result.entriesCreated} entradas e ${result.membersLinked} vínculos processados.`);
      await Promise.all([stats.refetch(), entries.refetch()]);
    },
    onError: (error) => toast.error(error.message),
  });
  const feedback = trpc.equivalenceCompendium.feedback.useMutation({
    onSuccess: async () => {
      toast.success("Decisão incorporada à memória do Compêndio.");
      await stats.refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const validateEntry = trpc.equivalenceCompendium.validateEntry.useMutation({
    onSuccess: async () => {
      toast.success("Entrada validada e priorizada como conhecimento humano.");
      await Promise.all([stats.refetch(), entries.refetch()]);
    },
    onError: (error) => toast.error(error.message),
  });

  const runAnalysis = () => {
    const id = Number(productId);
    if (!description.trim() && (!Number.isInteger(id) || id <= 0)) {
      toast.error("Informe a descrição do item ou o ID de um produto do catálogo.");
      return;
    }
    analyze.mutate({
      productId: Number.isInteger(id) && id > 0 ? id : undefined,
      description: description.trim() || undefined,
      limit: 20,
      useAI,
    });
  };

  const result = analyze.data;

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-6 bg-gradient-to-br from-violet-950 via-indigo-950 to-slate-950 p-6 text-white lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-violet-200"><BrainCircuit size={15} /> Inteligência técnica persistente</div>
            <h1 className="m-0 text-3xl font-black tracking-tight">Compêndio de Equivalências</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">Módulo multiproduto independente. Regras críticas filtram primeiro; depois entram conhecimento validado do Compêndio, precedentes humanos e IA especializada. Preço só ordena candidatos tecnicamente admissíveis.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/produtos" className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold text-white no-underline hover:bg-white/15">Central de Produtos</Link>
            <Link href="/equivalencias/legado" className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold text-white no-underline hover:bg-white/15">Grupos legados</Link>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Entradas", stats.data?.entries ?? 0],
          ["Validadas", stats.data?.validatedEntries ?? 0],
          ["Produtos vinculados", stats.data?.members ?? 0],
          ["Aprovações humanas", stats.data?.approvedFeedback ?? 0],
          ["Rejeições humanas", stats.data?.rejectedFeedback ?? 0],
        ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-2xl font-black text-slate-950">{Number(value).toLocaleString("pt-BR")}</div><div className="mt-1 text-[11px] font-bold text-slate-500">{label}</div></div>)}
      </section>

      <section className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2"><GitCompareArrows size={18} className="text-indigo-700" /><h2 className="m-0 text-base font-black text-slate-900">Analisar equivalência</h2></div>
            <p className="mt-2 text-xs leading-5 text-slate-500">Use um produto canônico ou cole uma especificação de edital. O sistema nunca usa a IA como primeiro filtro.</p>
            <label className="mt-4 block text-[10px] font-black uppercase tracking-wider text-slate-500">ID do produto</label>
            <input value={productId} onChange={(event) => setProductId(event.target.value.replace(/\D/g, ""))} placeholder="Ex.: 1234" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:bg-white" />
            <div className="my-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400"><span className="h-px flex-1 bg-slate-200" /> ou <span className="h-px flex-1 bg-slate-200" /></div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">Descrição / especificação</label>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={8} placeholder="Descrição do edital, ficha técnica ou requisito..." className="mt-1 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm leading-5 outline-none focus:border-indigo-400 focus:bg-white" />
            <label className="mt-3 flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3"><div><div className="text-xs font-bold text-slate-800">IA especializada</div><div className="mt-0.5 text-[10px] text-slate-500">Grounded no Compêndio; fallback determinístico automático.</div></div><input type="checkbox" checked={useAI} onChange={(event) => setUseAI(event.target.checked)} className="h-4 w-4 accent-indigo-700" /></label>
            <button onClick={runAnalysis} disabled={analyze.isPending} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-950 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{analyze.isPending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}{analyze.isPending ? "Analisando..." : "Analisar equivalentes"}</button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2"><Database size={17} className="text-indigo-700" /><h2 className="m-0 text-sm font-black text-slate-900">Memória local</h2></div>
            <p className="mt-2 text-xs leading-5 text-slate-500">Agrupa identidades técnicas exatas já existentes e cria a base inicial de conhecimento. A operação é idempotente.</p>
            {canEdit ? <button onClick={() => bootstrap.mutate({ limit: 1000 })} disabled={bootstrap.isPending} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-xs font-black text-indigo-900 disabled:opacity-50">{bootstrap.isPending ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}{bootstrap.isPending ? "Sincronizando..." : "Sincronizar catálogo → compêndio"}</button> : <p className="mb-0 mt-3 text-[10px] text-slate-400">Somente Editor/Admin pode alterar a memória do Compêndio.</p>}
          </div>
        </div>

        <div className="space-y-4">
          {!result ? (
            <div className="flex min-h-[430px] items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white p-8 text-center"><div><BrainCircuit size={34} className="mx-auto text-slate-300" /><h3 className="mb-1 mt-4 text-base font-black text-slate-700">Motor pronto</h3><p className="m-0 max-w-md text-xs leading-5 text-slate-500">A análise cruza requisitos críticos, catálogo, conhecimento validado, precedentes e ofertas atuais.</p></div></div>
          ) : (
            <>
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><div className="text-[10px] font-black uppercase tracking-wider text-indigo-600">Referência estruturada</div><div className="mt-1 text-sm font-black text-indigo-950">{result.reference.name}</div><div className="mt-1 text-xs text-indigo-800">{[result.reference.activeIngredient, result.reference.concentration, result.reference.pharmaceuticalForm || result.reference.presentation].filter(Boolean).join(" · ") || "Requisitos técnicos insuficientes para confirmação automática"}</div></div>
                  <div className="text-right"><div className="rounded-full bg-white px-3 py-1 text-[10px] font-black text-indigo-800">{engineLabel(result.engine)}</div><div className="mt-1 text-[10px] text-indigo-700">{result.compendiumKnowledgeCount ?? 0} entradas de conhecimento · {result.feedbackMemoryCount ?? 0} precedentes</div></div>
                </div>
              </div>

              <div className="space-y-3">
                {result.candidates.map((candidate) => {
                  const ai = candidate.aiAssessment;
                  const accepted = ai?.decision === "approved" || (!ai && candidate.status === "APROVADO");
                  const divergent = ai?.decision === "rejected" || candidate.status === "DIVERGENTE";
                  return (
                    <div key={candidate.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${accepted ? "border-emerald-200" : divergent ? "border-red-200" : "border-amber-200"}`}>
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-black text-slate-900">{candidate.name}</span><span className={`rounded-full px-2 py-1 text-[10px] font-black ${accepted ? "bg-emerald-50 text-emerald-700" : divergent ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{decisionLabel(ai?.decision) ?? candidate.status}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">Score {candidate.technicalScore}%</span></div>
                          <div className="mt-2 text-xs text-slate-600">{[candidate.activeIngredient, candidate.concentration, candidate.pharmaceuticalForm || candidate.presentation, candidate.manufacturer].filter(Boolean).join(" · ")}</div>
                          {ai?.justification && <div className="mt-2 rounded-lg bg-slate-50 p-2.5 text-[11px] leading-5 text-slate-600"><strong>Avaliação:</strong> {ai.justification}</div>}
                          {ai?.criticalDivergences?.length ? <div className="mt-2 flex items-start gap-2 text-[11px] text-red-700"><AlertTriangle size={13} className="mt-0.5 shrink-0" /><span>{ai.criticalDivergences.join("; ")}</span></div> : null}
                        </div>
                        <div className="min-w-[180px] rounded-xl bg-slate-50 p-3 text-right"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Melhor oferta</div><div className="mt-1 text-lg font-black text-slate-950">{money(candidate.bestOffer?.effectivePrice)}</div><div className="text-[10px] text-slate-500">{candidate.bestOffer?.supplierName ?? `${candidate.offerCount} oferta(s)`}</div></div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3"><div className="text-[10px] text-slate-400">Produto #{candidate.id} · {candidate.offerCount} oferta(s)</div>{canEdit && <div className="flex flex-wrap gap-2"><button disabled={feedback.isPending} onClick={() => feedback.mutate({ queryText: description || undefined, referenceProductId: result.reference.productId, candidateProductId: candidate.id, decision: "approved", reason: "Aprovado pelo operador no Compêndio", scoreSnapshot: candidate })} className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-black text-emerald-800"><ThumbsUp size={12} /> Aprovar</button><button disabled={feedback.isPending} onClick={() => feedback.mutate({ queryText: description || undefined, referenceProductId: result.reference.productId, candidateProductId: candidate.id, decision: "needs_review", reason: "Revisão adicional solicitada pelo operador", scoreSnapshot: candidate })} className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] font-black text-amber-800"><AlertTriangle size={12} /> Revisar</button><button disabled={feedback.isPending} onClick={() => feedback.mutate({ queryText: description || undefined, referenceProductId: result.reference.productId, candidateProductId: candidate.id, decision: "rejected", reason: "Rejeitado pelo operador no Compêndio", scoreSnapshot: candidate })} className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[10px] font-black text-red-800"><ThumbsDown size={12} /> Rejeitar</button></div>}</div>
                    </div>
                  );
                })}
                {result.candidates.length === 0 && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Nenhum candidato tecnicamente plausível encontrado.</div>}
              </div>
            </>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div><div className="flex items-center gap-2"><ShieldCheck size={17} className="text-indigo-700" /><h2 className="m-0 text-base font-black text-slate-900">Base consolidada</h2></div><p className="mb-0 mt-1 text-xs text-slate-500">Entradas persistentes e seu nível de validação.</p></div>
          <div className="flex flex-wrap gap-2"><div className="relative"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar no compêndio" className="rounded-xl border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs outline-none" /></div><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold"><option value="all">Todos</option><option value="draft">Rascunho</option><option value="ai_review">Revisão IA</option><option value="human_validated">Validado humano</option><option value="rejected">Rejeitado</option></select></div>
        </div>
        <div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Entrada</th><th className="px-4 py-3">Perfil técnico</th><th className="px-4 py-3">Produtos</th><th className="px-4 py-3">Feedback</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr></thead><tbody>{(entries.data?.items ?? []).map((entry: any) => <tr key={entry.id} className="border-t border-slate-100"><td className="px-4 py-3"><div className="font-bold text-slate-900">{entry.canonicalName}</div><div className="text-[10px] text-slate-400">{entry.catalogType}</div></td><td className="px-4 py-3"><div className="font-medium text-slate-700">{entry.activeIngredient ?? "—"}</div><div className="text-[10px] text-slate-400">{[entry.concentration, entry.pharmaceuticalForm].filter(Boolean).join(" · ") || "—"}</div></td><td className="px-4 py-3 font-bold text-slate-700">{Number(entry.memberCount ?? 0)}</td><td className="px-4 py-3 font-bold text-slate-700">{Number(entry.feedbackCount ?? 0)}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-black ${entry.validationStatus === "human_validated" ? "bg-emerald-50 text-emerald-700" : entry.validationStatus === "rejected" ? "bg-red-50 text-red-700" : "bg-indigo-50 text-indigo-700"}`}>{entry.validationStatus}</span></td><td className="px-4 py-3 text-right">{canEdit && entry.validationStatus !== "human_validated" && entry.validationStatus !== "rejected" && <button disabled={validateEntry.isPending} onClick={() => validateEntry.mutate({ entryId: Number(entry.id) })} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-black text-emerald-800"><CheckCircle2 size={11} /> Validar</button>}</td></tr>)}</tbody></table>{!entries.isLoading && (entries.data?.items?.length ?? 0) === 0 && <div className="p-8 text-center text-xs text-slate-500">Nenhuma entrada para este filtro.</div>}</div>
      </section>
    </div>
  );
}
