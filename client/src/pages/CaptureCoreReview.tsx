import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, HeartPulse, Loader2, PlusCircle, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import CaptureConnectorWizard from "@/components/CaptureConnectorWizard";

function money(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(number)
    : "—";
}

function healthLabel(status: string) {
  if (status === "healthy") return "Saudável";
  if (status === "attention") return "Atenção";
  if (status === "login_required") return "Login necessário";
  if (status === "degraded") return "Degradado";
  return "Sem baseline";
}

function actionPresentation(action: string) {
  if (action === "create") {
    return {
      label: "Novo produto",
      className: "bg-blue-50 text-blue-700",
      icon: <PlusCircle className="h-3 w-3" />,
    };
  }
  if (action === "blocked") {
    return {
      label: "Bloqueada",
      className: "bg-red-50 text-red-700",
      icon: <AlertTriangle className="h-3 w-3" />,
    };
  }
  return {
    label: "Revisão",
    className: "bg-amber-50 text-amber-700",
    icon: <ShieldCheck className="h-3 w-3" />,
  };
}

export default function CaptureCoreReview() {
  const utils = trpc.useUtils();
  const { data: queue = [], isLoading } = trpc.captureCore.reviewQueue.useQuery({ limit: 200 });
  const { data: health = [] } = trpc.captureCore.health.useQuery();
  const [productIds, setProductIds] = useState<Record<number, string>>({});
  const [terms, setTerms] = useState("");
  const [showConnectorWizard, setShowConnectorWizard] = useState(false);

  const decide = trpc.captureCore.decideObservation.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.captureCore.reviewQueue.invalidate(),
        utils.captureCore.health.invalidate(),
      ]);
      if (result.applied && result.created) {
        toast.success("Novo produto criado após revisão e registrado para aprendizado.");
      } else {
        toast.success(result.applied
          ? "Observação aplicada e registrada para aprendizado."
          : "Observação rejeitada e registrada para aprendizado.");
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const refresh = trpc.captureCore.refreshTerms.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.jobs.length} fornecedor(es) receberam atualização prioritária.`);
      setTerms("");
    },
    onError: (error) => toast.error(error.message),
  });

  const pendingCount = queue.length;
  const newCount = useMemo(() => queue.filter((item: any) => item.action === "create").length, [queue]);
  const blockedCount = useMemo(() => queue.filter((item: any) => item.action === "blocked").length, [queue]);
  const healthyCount = useMemo(() => health.filter((item: any) => item.status === "healthy").length, [health]);

  const handleRefresh = () => {
    const list = terms.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    if (!list.length) {
      toast.error("Informe ao menos um produto, SKU ou EAN, um por linha.");
      return;
    }
    refresh.mutate({ terms: list.slice(0, 500), trigger: "manual" });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Capture Core</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Revisão, saúde e atualização prioritária</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Alterações determinísticas e seguras são aplicadas automaticamente. Conflitos de identidade, variações anormais e produtos novos ficam aqui para decisão humana e alimentam a memória supervisionada da IA.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowConnectorWizard((value) => !value)}
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          {showConnectorWizard ? "Ocultar configuração" : "Adicionar conector"}
        </button>
      </header>

      {showConnectorWizard && (
        <CaptureConnectorWizard
          onSaved={() => {
            void utils.captureCore.health.invalidate();
            setShowConnectorWizard(false);
          }}
        />
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Pendentes de revisão" value={pendingCount} helper="Observações ainda não decididas" />
        <Metric label="Novos produtos" value={newCount} helper="Criação depende de aprovação" />
        <Metric label="Bloqueadas" value={blockedCount} helper="Anomalia ou conflito forte" />
        <Metric label="Conectores saudáveis" value={healthyCount} helper={`de ${health.length} monitorados`} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-blue-700" />
            <h2 className="font-bold text-slate-900">Atualizar itens importantes agora</h2>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Cole produtos, SKUs ou EANs de uma proposta/edital, um por linha. O S2 cria um único refresh prioritário por fornecedor com busca seletiva, sem varrer todo o catálogo.
          </p>
          <textarea
            value={terms}
            onChange={(event) => setTerms(event.target.value)}
            rows={7}
            placeholder={"Seringa 20 ml\n7891234567890\nSKU-1234"}
            className="mt-4 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="button"
            disabled={refresh.isPending}
            onClick={handleRefresh}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-950 px-4 py-2 text-sm font-bold text-white hover:bg-blue-900 disabled:opacity-50"
          >
            {refresh.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar preços prioritários
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <HeartPulse className="h-4 w-4 text-emerald-700" />
            <h2 className="font-bold text-slate-900">Saúde dos conectores</h2>
          </div>
          <div className="mt-4 space-y-2">
            {health.length === 0 ? (
              <p className="text-sm text-slate-500">A saúde será calculada após as primeiras execuções do Capture Core.</p>
            ) : health.map((item: any) => (
              <div key={item.id} className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-800">Configuração #{item.scraperConfigId}</div>
                  <div className="truncate text-[11px] text-slate-500">
                    {healthLabel(item.status)} · baseline {item.baselineItems ?? "—"} · última captura {item.lastCapturedItems ?? "—"}
                  </div>
                </div>
                <div className="text-lg font-black tabular-nums text-slate-900">{Math.round(Number(item.score || 0))}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="font-bold text-slate-900">Fila de revisão</h2>
            <p className="mt-1 text-xs text-slate-500">Itens novos e casos incertos só alteram o catálogo após aprovação explícita.</p>
          </div>
          <ShieldCheck className="h-5 w-5 text-blue-800" />
        </div>

        {isLoading ? (
          <div className="p-10 text-center text-slate-500"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
        ) : queue.length === 0 ? (
          <div className="p-10 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
            <p className="mt-3 text-sm font-semibold text-slate-700">Nenhuma observação pendente.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {queue.map((item: any) => {
              const selectedProductId = productIds[item.id] ?? (item.productId ? String(item.productId) : "");
              const presentation = actionPresentation(item.action);
              const canCreateFromObservation = item.action === "create" && Boolean(item.ean);
              const approveDisabled = decide.isPending || (!selectedProductId && !canCreateFromObservation);
              return (
                <article key={item.id} className="p-4 sm:p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${presentation.className}`}>
                          {presentation.icon}
                          {presentation.label}
                        </span>
                        <span className="text-[11px] text-slate-400">Fornecedor #{item.supplierId}</span>
                        <span className="text-[11px] text-slate-400">Confiança {Number(item.confidence || 0).toFixed(0)}%</span>
                      </div>
                      <h3 className="mt-2 text-sm font-black text-slate-900">{item.rawName}</h3>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                        <span>Preço: <strong>{money(item.price)}</strong></span>
                        <span>EAN: {item.ean || "—"}</span>
                        <span>SKU: {item.supplierSku || "—"}</span>
                        <span>Estoque: {item.stock ?? "desconhecido"}</span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-500">{item.reason || "Sem justificativa registrada."}</p>
                    </div>

                    <div className="w-full shrink-0 space-y-2 xl:w-[310px]">
                      <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        Produto mestre ID {item.action === "create" ? "(opcional)" : ""}
                      </label>
                      <input
                        inputMode="numeric"
                        value={selectedProductId}
                        onChange={(event) => setProductIds((current) => ({ ...current, [item.id]: event.target.value.replace(/\D/g, "") }))}
                        placeholder={item.action === "create"
                          ? "Vazio = criar após validar o EAN"
                          : "Informe o produto mestre correspondente"}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                      />
                      {item.action === "create" && !item.ean && !selectedProductId && (
                        <p className="text-[11px] leading-4 text-amber-700">Sem EAN confiável: selecione um produto mestre existente para aprovar.</p>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={approveDisabled}
                          onClick={() => decide.mutate({
                            observationId: item.id,
                            decision: "approve",
                            expectedProductId: selectedProductId ? Number(selectedProductId) : undefined,
                          })}
                          className="inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-40"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Aprovar
                        </button>
                        <button
                          type="button"
                          disabled={decide.isPending}
                          onClick={() => decide.mutate({ observationId: item.id, decision: "reject" })}
                          className="inline-flex items-center justify-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-40"
                        >
                          <XCircle className="h-3.5 w-3.5" /> Rejeitar
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value, helper }: { label: string; value: string | number; helper: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-black text-slate-950">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{helper}</div>
    </div>
  );
}
