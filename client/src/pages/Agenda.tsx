import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { CalendarClock, Loader2, MailCheck, ShieldCheck, FileText, AlertTriangle } from "lucide-react";

const TIPO_ICON: Record<string, any> = {
  cotacao: MailCheck,
  certidao: ShieldCheck,
  contrato_alerta: AlertTriangle,
  contrato_fim: FileText,
};

const URGENCIA_STYLE: Record<string, string> = {
  vencido: "border-red-300 bg-red-50 text-red-800",
  hoje: "border-red-200 bg-red-50 text-red-700",
  urgente: "border-amber-200 bg-amber-50 text-amber-800",
  proximo: "border-blue-200 bg-blue-50 text-blue-800",
  futuro: "border-gray-200 bg-white text-gray-700",
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
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <CalendarClock className="w-7 h-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
          <p className="text-sm text-gray-500">Todos os prazos num lugar só — cotações, certidões e contratos</p>
        </div>
      </div>

      {data && (
        <div className="flex gap-3 my-4">
          <div className="flex-1 border border-red-200 bg-red-50 p-3 text-center">
            <div className="text-2xl font-bold text-red-700">{data.resumo.vencidos}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-red-600">Vencidos</div>
          </div>
          <div className="flex-1 border border-amber-200 bg-amber-50 p-3 text-center">
            <div className="text-2xl font-bold text-amber-700">{data.resumo.hoje}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Hoje</div>
          </div>
          <div className="flex-1 border border-blue-200 bg-blue-50 p-3 text-center">
            <div className="text-2xl font-bold text-blue-700">{data.resumo.semana}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Nesta semana</div>
          </div>
        </div>
      )}

      {query.isLoading ? (
        <div className="p-8 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : data && data.itens.length > 0 ? (
        <div className="space-y-2">
          {data.itens.map((it, i) => {
            const Icon = TIPO_ICON[it.tipo] ?? CalendarClock;
            return (
              <Link key={i} href={it.link} className={`flex items-center gap-3 border p-3 hover:shadow-sm transition-shadow ${URGENCIA_STYLE[it.urgencia]}`}>
                <Icon className="w-5 h-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{it.titulo}</div>
                  {it.detalhe && <div className="text-xs opacity-70 truncate">{it.detalhe}</div>}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold">{rotuloPrazo(it.diasRestantes)}</div>
                  <div className="text-[10px] opacity-70">{new Date(it.data).toLocaleDateString("pt-BR")}</div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="p-10 text-center text-sm text-gray-400">Nenhum prazo próximo. Tudo em dia. ✅</div>
      )}
    </div>
  );
}
