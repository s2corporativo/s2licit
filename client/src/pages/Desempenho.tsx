import { Loader2, Trophy, TrendingUp } from "lucide-react";
import { trpc } from "@/lib/trpc";

const WON_STAGES = new Set(["vencida", "contrato", "entrega", "faturamento", "recebimento", "encerrada"]);

export default function Desempenho() {
  const query = trpc.opportunities.list.useQuery();
  if (query.isLoading) return <div className="flex min-h-48 items-center justify-center text-slate-400"><Loader2 className="animate-spin" /></div>;
  const rows = query.data ?? [];
  const decided = rows.filter((row) => WON_STAGES.has(row.etapa) || row.etapa === "perdida");
  const won = decided.filter((row) => WON_STAGES.has(row.etapa)).length;
  const lost = decided.filter((row) => row.etapa === "perdida").length;
  const winRate = decided.length ? Math.round((won / decided.length) * 1000) / 10 : 0;
  const cancelled = rows.filter((row) => row.etapa === "cancelada").length;

  const byOrg = new Map<string, { won: number; lost: number }>();
  for (const row of decided) {
    const key = row.orgao?.trim() || "Órgão não informado";
    const current = byOrg.get(key) ?? { won: 0, lost: 0 };
    if (WON_STAGES.has(row.etapa)) current.won++;
    else current.lost++;
    byOrg.set(key, current);
  }
  const ranking = [...byOrg.entries()].map(([orgao, value]) => ({ orgao, ...value, decided: value.won + value.lost, winRate: value.won + value.lost ? Math.round((value.won / (value.won + value.lost)) * 1000) / 10 : 0 })).sort((a, b) => b.decided - a.decided || b.winRate - a.winRate);

  return <div className="mx-auto max-w-6xl space-y-5">
    <section className="rounded-2xl bg-blue-950 p-5 text-white"><div className="flex items-start gap-3"><Trophy size={26} /><div><p className="m-0 text-[10px] font-black uppercase tracking-[0.16em] text-blue-200">Relatório automático</p><h1 className="mb-1 mt-1 text-2xl font-black">Desempenho</h1><p className="m-0 text-sm text-blue-100">Resultados derivados do fluxo canônico. Não existe mais uma segunda baixa manual de ganho/perda.</p></div></div></section>
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4"><Metric label="Taxa de vitória" value={`${winRate}%`} /><Metric label="Ganhas" value={won} /><Metric label="Perdidas" value={lost} /><Metric label="Canceladas" value={cancelled} /></section>
    <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="mb-4 flex items-center gap-2"><TrendingUp size={17} className="text-blue-900" /><div><h2 className="m-0 text-sm font-black text-slate-900">Por órgão</h2><p className="mb-0 mt-1 text-xs text-slate-500">Somente oportunidades com resultado efetivamente conhecido no fluxo.</p></div></div>{ranking.length === 0 ? <div className="rounded-lg border border-dashed border-slate-200 p-10 text-center text-sm text-slate-400">Ainda não há resultados suficientes.</div> : <div className="space-y-2">{ranking.map((row) => <div key={row.orgao} className="grid gap-2 rounded-lg border border-slate-100 p-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center"><div className="truncate text-sm font-bold text-slate-800">{row.orgao}</div><span className="text-xs text-emerald-700">{row.won} ganha(s)</span><span className="text-xs text-red-700">{row.lost} perdida(s)</span><span className="text-sm font-black text-slate-900">{row.winRate}%</span></div>)}</div>}</section>
  </div>;
}

function Metric({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</div><div className="mt-1 text-2xl font-black text-slate-950">{value}</div></div>; }
