import { Brain, CheckCircle2, Loader2, XCircle, Zap } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { formatBRL } from "@/lib/format";
import Integracoes from "./Integracoes";

export default function IntegracoesCentral() {
  const status = trpc.ai.status.useQuery();
  const usage = trpc.ai.consumo.useQuery();
  const test = trpc.ai.testar.useMutation({
    onSuccess: (result) => result.ok ? toast.success(`IA respondeu via ${result.provedor}.`) : toast.error(result.erro ?? "Falha no teste da IA."),
    onError: (error) => toast.error(error.message),
  });
  const active = status.data?.ativo;
  return <div className="space-y-5">
    <section className="mx-auto max-w-4xl rounded-2xl bg-blue-950 p-5 text-white">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center"><div className="flex items-start gap-3"><Brain size={26} className="mt-0.5" /><div><p className="m-0 text-[10px] font-black uppercase tracking-[0.16em] text-blue-200">Integrações e IA</p><h1 className="mb-1 mt-1 text-2xl font-black">Saúde das integrações</h1><p className="m-0 text-sm text-blue-100">Chaves, conectividade e consumo no mesmo ambiente.</p></div></div><button onClick={() => test.mutate({})} disabled={test.isPending || !status.data?.algumConfigurado} className="ml-auto inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-black text-blue-950 disabled:opacity-50">{test.isPending ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />} Testar IA</button></div>
    </section>
    <section className="mx-auto grid max-w-4xl gap-3 md:grid-cols-3"><StatusCard title="Provedor ativo" value={active ? `${active.kind} · ${active.model}` : "Não configurado"} ok={Boolean(active)} /><StatusCard title="Chamadas IA" value={(usage.data?.totais.chamadas ?? 0).toLocaleString("pt-BR")} ok={Boolean(status.data?.algumConfigurado)} /><StatusCard title="Custo estimado" value={formatBRL(usage.data?.totais.custoBrl ?? 0)} ok /></section>
    <Integracoes />
  </div>;
}

function StatusCard({ title, value, ok }: { title: string; value: string; ok: boolean }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2">{ok ? <CheckCircle2 size={15} className="text-emerald-600" /> : <XCircle size={15} className="text-amber-600" />}<span className="text-[10px] font-black uppercase tracking-wider text-slate-500">{title}</span></div><div className="mt-2 truncate text-sm font-black text-slate-900">{value}</div></div>;
}
