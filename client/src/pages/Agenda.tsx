import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  CalendarClock,
  CircleDollarSign,
  FileText,
  Gavel,
  Loader2,
  MailCheck,
  PackageCheck,
  ShieldCheck,
} from "lucide-react";

const TIPO_ICON: Record<string, React.ElementType> = {
  oportunidade: FileText,
  sessao: Gavel,
  cotacao: MailCheck,
  certidao: ShieldCheck,
  contrato: AlertTriangle,
  entrega: PackageCheck,
  receber: CircleDollarSign,
  pagar: CircleDollarSign,
};

const URGENCIA_STYLE: Record<string, string> = {
  vencido: "border-red-300 bg-red-50 text-red-800",
  hoje: "border-red-200 bg-red-50 text-red-700",
  urgente: "border-amber-200 bg-amber-50 text-amber-800",
  proximo: "border-blue-200 bg-blue-50 text-blue-800",
  futuro: "border-slate-200 bg-white text-slate-700",
};

function rotuloPrazo(dias: number): string {
  if (dias < 0) return `vencido há ${Math.abs(dias)}d`;
  if (dias === 0) return "hoje";
  if (dias === 1) return "amanhã";
  return `em ${dias} dias`;
}

export default function Agenda() {
  const query = trpc.agenda.proximos.useQuery();
  const data = query.data;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="rounded-2xl bg-blue-950 p-5 text-white">
        <div className="flex items-start gap-3">
          <CalendarClock className="mt-0.5 h-7 w-7" />
          <div>
            <p className="m-0 text-[10px] font-black uppercase tracking-[0.16em] text-blue-200">Agenda global</p>
            <h1 className="mb-1 mt-1 text-2xl font-black">Prazos e próximas ações</h1>
            <p className="m-0 text-sm text-blue-100">Oportunidades, sessões, cotações, certidões, contratos, entregas, recebimentos e pagamentos em uma fila cronológica.</p>
          </div>
        </div>
      </section>

      {data && (
        <section className="grid grid-cols-3 gap-3">
          <Metric label="Vencidos" value={data.resumo.vencidos} danger={data.resumo.vencidos > 0} />
          <Metric label="Hoje" value={data.resumo.hoje} danger={data.resumo.hoje > 0} />
          <Metric label="Nesta semana" value={data.resumo.semana} />
        </section>
      )}

      {query.isLoading ? (
        <div className="p-8 text-center text-slate-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
      ) : data && data.itens.length > 0 ? (
        <section className="space-y-2">
          {data.itens.map((item) => {
            const Icon = TIPO_ICON[item.tipo] ?? CalendarClock;
            return (
              <Link key={item.key} href={item.link} className={`flex items-center gap-3 rounded-xl border p-3 no-underline transition hover:shadow-sm ${URGENCIA_STYLE[item.urgencia]}`}>
                <Icon className="h-5 w-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{item.titulo}</div>
                  {item.detalhe && <div className="truncate text-xs opacity-70">{item.detalhe}</div>}
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-black">{rotuloPrazo(item.diasRestantes)}</div>
                  <div className="text-[10px] opacity-70">{new Date(item.data).toLocaleDateString("pt-BR")}</div>
                </div>
              </Link>
            );
          })}
        </section>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-400">Nenhuma pendência com data registrada.</div>
      )}
    </div>
  );
}

function Metric({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return <div className={`rounded-xl border bg-white p-4 text-center ${danger ? "border-red-200" : "border-slate-200"}`}><div className={`text-2xl font-black ${danger ? "text-red-700" : "text-slate-900"}`}>{value}</div><div className="mt-1 text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</div></div>;
}
