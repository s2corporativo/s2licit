import { useState } from "react";
import { formatBRL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Trophy, TrendingUp, Loader2, Check, X, Ban } from "lucide-react";
import { toast } from "sonner";

const RESULTADO_LABEL: Record<string, string> = {
  ganhou: "Ganhou",
  perdeu: "Perdeu",
  cancelada: "Cancelada",
  pendente: "Pendente",
};

function corWinRate(wr: number): string {
  if (wr >= 60) return "text-emerald-600";
  if (wr >= 35) return "text-amber-600";
  return "text-red-600";
}

function BarraWinRate({ wr }: { wr: number }) {
  return (
    <div className="w-full h-2 bg-gray-100 rounded overflow-hidden">
      <div
        className={`h-full ${wr >= 60 ? "bg-emerald-500" : wr >= 35 ? "bg-amber-500" : "bg-red-500"}`}
        style={{ width: `${wr}%` }}
      />
    </div>
  );
}

export default function Desempenho() {
  const utils = trpc.useUtils();
  const resumo = trpc.desempenho.resumo.useQuery();
  const pendentes = trpc.desempenho.pendentes.useQuery();
  const historico = trpc.desempenho.historico.useQuery();

  const [dar, setDar] = useState<{ id: number; orgao: string } | null>(null);
  const [form, setForm] = useState({ resultado: "ganhou", valorProposto: "", valorVencedor: "", categoria: "", observacao: "" });

  const registrar = trpc.desempenho.registrarResultado.useMutation({
    onSuccess: () => {
      toast.success("Resultado registrado.");
      setDar(null);
      setForm({ resultado: "ganhou", valorProposto: "", valorVencedor: "", categoria: "", observacao: "" });
      utils.desempenho.resumo.invalidate();
      utils.desempenho.pendentes.invalidate();
      utils.desempenho.historico.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const salvar = () => {
    if (!dar) return;
    registrar.mutate({
      id: dar.id,
      resultado: form.resultado as "ganhou" | "perdeu" | "cancelada",
      valorProposto: form.valorProposto ? Number(form.valorProposto) : undefined,
      valorVencedor: form.valorVencedor ? Number(form.valorVencedor) : undefined,
      categoria: form.categoria || undefined,
      observacao: form.observacao || undefined,
    });
  };

  const g = resumo.data?.geral;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <Trophy className="w-7 h-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Desempenho</h1>
          <p className="text-sm text-gray-500">Onde você ganha e onde joga dinheiro fora — taxa de vitória por órgão e categoria</p>
        </div>
      </div>

      {/* KPIs gerais */}
      {g && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="border border-gray-200 p-4 text-center">
            <div className={`text-3xl font-bold ${corWinRate(g.winRate)}`}>{g.winRate}%</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Taxa de vitória</div>
          </div>
          <div className="border border-emerald-200 bg-emerald-50 p-4 text-center">
            <div className="text-3xl font-bold text-emerald-700">{g.ganhou}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Ganhas</div>
          </div>
          <div className="border border-red-200 bg-red-50 p-4 text-center">
            <div className="text-3xl font-bold text-red-700">{g.perdeu}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-red-600">Perdidas</div>
          </div>
          <div className="border border-gray-200 p-4 text-center">
            <div className="text-3xl font-bold text-gray-700">
              {resumo.data?.gapMedioPerda != null ? `+${resumo.data.gapMedioPerda}%` : "—"}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Gap médio nas perdas</div>
          </div>
        </div>
      )}

      {resumo.isLoading && (
        <div className="p-8 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      )}

      {/* Segmentações */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Por órgão
          </h2>
          <SegmentoTabela dados={resumo.data?.porOrgao ?? []} />
        </section>
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Por categoria
          </h2>
          <SegmentoTabela dados={resumo.data?.porCategoria ?? []} />
        </section>
      </div>

      {/* Pendentes de baixa */}
      <section className="mb-8">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-2">Cotações sem desfecho</h2>
        {pendentes.data && pendentes.data.length > 0 ? (
          <div className="space-y-1">
            {pendentes.data.map((p) => (
              <div key={p.id} className="flex items-center gap-3 border border-gray-200 p-2.5">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate text-gray-900">{p.orgao}</div>
                  {p.recebidaEm && <div className="text-[11px] text-gray-400">{new Date(p.recebidaEm).toLocaleDateString("pt-BR")}</div>}
                </div>
                <button
                  onClick={() => setDar({ id: p.id, orgao: p.orgao })}
                  className="text-xs font-semibold px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded"
                >
                  Dar baixa
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-sm text-gray-400">Nenhuma cotação pendente de resultado.</div>
        )}
      </section>

      {/* Histórico */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-2">Histórico</h2>
        {historico.data && historico.data.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b">
                  <th className="py-2 pr-2">Órgão</th>
                  <th className="py-2 pr-2">Categoria</th>
                  <th className="py-2 pr-2">Resultado</th>
                  <th className="py-2 pr-2 text-right">Proposto</th>
                  <th className="py-2 pr-2 text-right">Vencedor</th>
                  <th className="py-2">Data</th>
                </tr>
              </thead>
              <tbody>
                {historico.data.map((h) => (
                  <tr key={h.id} className="border-b border-gray-100">
                    <td className="py-2 pr-2 max-w-[220px] truncate">{h.orgao}</td>
                    <td className="py-2 pr-2 text-gray-500">{h.categoria ?? "—"}</td>
                    <td className="py-2 pr-2">
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold ${
                        h.resultado === "ganhou" ? "text-emerald-600" : h.resultado === "perdeu" ? "text-red-600" : "text-gray-500"
                      }`}>
                        {h.resultado === "ganhou" ? <Check className="w-3 h-3" /> : h.resultado === "perdeu" ? <X className="w-3 h-3" /> : <Ban className="w-3 h-3" />}
                        {RESULTADO_LABEL[h.resultado]}
                      </span>
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">{formatBRL(h.valorProposto)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{formatBRL(h.valorVencedor)}</td>
                    <td className="py-2 text-gray-500">{h.resultadoEm ? new Date(h.resultadoEm).toLocaleDateString("pt-BR") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-sm text-gray-400">Nenhum resultado registrado ainda.</div>
        )}
      </section>

      {/* Modal dar baixa */}
      {dar && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setDar(null)}>
          <div className="bg-white w-full max-w-md p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 mb-1">Registrar resultado</h3>
            <p className="text-xs text-gray-500 mb-4 truncate">{dar.orgao}</p>

            <label className="block text-xs font-semibold text-gray-600 mb-1">Resultado</label>
            <div className="flex gap-2 mb-3">
              {(["ganhou", "perdeu", "cancelada"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setForm((f) => ({ ...f, resultado: r }))}
                  className={`flex-1 text-sm font-semibold py-2 border rounded ${
                    form.resultado === r
                      ? r === "ganhou" ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : r === "perdeu" ? "border-red-500 bg-red-50 text-red-700"
                      : "border-gray-500 bg-gray-50 text-gray-700"
                      : "border-gray-200 text-gray-500"
                  }`}
                >
                  {RESULTADO_LABEL[r]}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Valor proposto (R$)</label>
                <input type="number" step="0.01" value={form.valorProposto}
                  onChange={(e) => setForm((f) => ({ ...f, valorProposto: e.target.value }))}
                  className="w-full border border-gray-300 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Valor vencedor (R$)</label>
                <input type="number" step="0.01" value={form.valorVencedor}
                  onChange={(e) => setForm((f) => ({ ...f, valorVencedor: e.target.value }))}
                  className="w-full border border-gray-300 px-2 py-1.5 text-sm" />
              </div>
            </div>

            <label className="block text-xs font-semibold text-gray-600 mb-1">Categoria</label>
            <input value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
              placeholder="ex.: Medicamentos, Insumos veterinários"
              className="w-full border border-gray-300 px-2 py-1.5 text-sm mb-3" />

            <label className="block text-xs font-semibold text-gray-600 mb-1">Observação</label>
            <textarea value={form.observacao} onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
              rows={2} className="w-full border border-gray-300 px-2 py-1.5 text-sm mb-4" />

            <div className="flex gap-2 justify-end">
              <button onClick={() => setDar(null)} className="text-sm px-4 py-2 text-gray-600">Cancelar</button>
              <button onClick={salvar} disabled={registrar.isPending}
                className="text-sm font-semibold px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded disabled:opacity-50">
                {registrar.isPending ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SegmentoTabela({ dados }: { dados: Array<{ chave: string; ganhou: number; perdeu: number; decididas: number; winRate: number }> }) {
  if (dados.length === 0) {
    return <div className="p-4 text-center text-xs text-gray-400 border border-gray-100">Sem dados ainda.</div>;
  }
  return (
    <div className="space-y-2">
      {dados.map((d) => (
        <div key={d.chave} className="border border-gray-200 p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-medium text-gray-900 truncate pr-2">{d.chave}</span>
            <span className={`text-sm font-bold ${corWinRate(d.winRate)}`}>{d.winRate}%</span>
          </div>
          <BarraWinRate wr={d.winRate} />
          <div className="text-[11px] text-gray-400 mt-1">{d.ganhou} ganhas · {d.perdeu} perdidas</div>
        </div>
      ))}
    </div>
  );
}
