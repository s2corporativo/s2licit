import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { usePermission } from "@/components/RequireAuth";
import { Percent, Loader2, Plus, Ban, Calculator, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

/**
 * Motor Tributário: simulador por operação + gestão das regras versionadas.
 * As saídas são ESTIMATIVAS a partir das regras cadastradas — o
 * enquadramento definitivo deve ser validado com o contador.
 */

const TIPO_LABEL: Record<string, string> = {
  simples_efetiva: "Simples (alíq. efetiva)",
  icms: "ICMS",
  difal: "DIFAL",
  st: "ICMS-ST",
  fcp: "FCP",
  iss: "ISS",
  outro: "Outro",
};

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function MotorTributario() {
  const isAdmin = usePermission("admin");
  const utils = trpc.useUtils();
  const regras = trpc.taxRules.listar.useQuery();

  // Simulador
  const [sim, setSim] = useState({ valorVenda: "", custo: "", ufDestino: "MG" });
  const valorVenda = parseFloat(sim.valorVenda.replace(",", ".")) || 0;
  const custo = parseFloat(sim.custo.replace(",", ".")) || undefined;
  const simulacao = trpc.taxRules.simular.useQuery(
    { valorVenda, custo, ufOrigem: "MG", ufDestino: sim.ufDestino },
    { enabled: valorVenda > 0 },
  );

  // Formulário de regra
  const [formAberto, setFormAberto] = useState(false);
  const [form, setForm] = useState({
    descricao: "", tipo: "simples_efetiva", ufDestino: "", percentual: "",
    vigenciaInicio: new Date().toISOString().slice(0, 10), observacoes: "",
  });

  const salvar = trpc.taxRules.salvar.useMutation({
    onSuccess: () => {
      toast.success("Regra salva.");
      setFormAberto(false);
      setForm({ descricao: "", tipo: "simples_efetiva", ufDestino: "", percentual: "", vigenciaInicio: new Date().toISOString().slice(0, 10), observacoes: "" });
      utils.taxRules.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const desativar = trpc.taxRules.desativar.useMutation({
    onSuccess: () => { toast.success("Regra desativada."); utils.taxRules.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Percent className="w-7 h-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Motor Tributário</h1>
          <p className="text-sm text-gray-500">Estimativa de carga tributária por operação — valide o enquadramento com seu contador</p>
        </div>
      </div>

      {/* Simulador */}
      <section className="mt-5 border border-gray-200 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2">
          <Calculator className="w-4 h-4" /> Simulador por operação
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Valor de venda (R$)</label>
            <input value={sim.valorVenda} onChange={(e) => setSim((s) => ({ ...s, valorVenda: e.target.value }))}
              className="w-full border border-gray-300 px-2 py-1.5 text-sm" placeholder="1000,00" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Custo (R$, opcional)</label>
            <input value={sim.custo} onChange={(e) => setSim((s) => ({ ...s, custo: e.target.value }))}
              className="w-full border border-gray-300 px-2 py-1.5 text-sm" placeholder="700,00" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">UF de destino</label>
            <select value={sim.ufDestino} onChange={(e) => setSim((s) => ({ ...s, ufDestino: e.target.value }))}
              className="w-full border border-gray-300 px-2 py-1.5 text-sm">
              {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <span className="text-xs text-gray-400">Origem fixa: MG</span>
          </div>
        </div>

        {valorVenda > 0 && simulacao.data && (
          <div className="border-t border-gray-100 pt-3">
            {simulacao.data.linhas.length > 0 ? (
              <table className="w-full text-sm mb-3">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400">
                    <th className="py-1">Tributo (regra)</th>
                    <th className="py-1 text-right">%</th>
                    <th className="py-1 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {simulacao.data.linhas.map((l) => (
                    <tr key={l.regraId} className="border-t border-gray-50">
                      <td className="py-1.5">{l.descricao} <span className="text-gray-400 text-xs">({TIPO_LABEL[l.tipo] ?? l.tipo})</span></td>
                      <td className="py-1.5 text-right tabular-nums">{l.percentual.toFixed(2)}%</td>
                      <td className="py-1.5 text-right tabular-nums">{moeda(l.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="border border-gray-200 p-2.5 text-center">
                <div className="text-lg font-bold text-red-600">{simulacao.data.totalPercentual.toFixed(2)}%</div>
                <div className="text-[10px] font-bold uppercase text-gray-500">Carga estimada</div>
              </div>
              <div className="border border-gray-200 p-2.5 text-center">
                <div className="text-lg font-bold text-gray-800">{moeda(simulacao.data.valorLiquido)}</div>
                <div className="text-[10px] font-bold uppercase text-gray-500">Líquido</div>
              </div>
              {simulacao.data.lucroLiquido != null && (
                <div className={`border p-2.5 text-center ${simulacao.data.lucroLiquido < 0 ? "border-red-300 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
                  <div className={`text-lg font-bold ${simulacao.data.lucroLiquido < 0 ? "text-red-700" : "text-emerald-700"}`}>{moeda(simulacao.data.lucroLiquido)}</div>
                  <div className="text-[10px] font-bold uppercase text-gray-500">Lucro líquido</div>
                </div>
              )}
              {simulacao.data.margemLiquidaPercentual != null && (
                <div className="border border-gray-200 p-2.5 text-center">
                  <div className="text-lg font-bold text-gray-800">{simulacao.data.margemLiquidaPercentual.toFixed(1)}%</div>
                  <div className="text-[10px] font-bold uppercase text-gray-500">Margem líquida</div>
                </div>
              )}
            </div>
            {simulacao.data.alertas.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 p-2 mt-3">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {a}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Regras */}
      <section className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">Regras cadastradas</h2>
          {isAdmin && (
            <button onClick={() => setFormAberto((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded">
              <Plus className="w-3.5 h-3.5" /> Nova regra
            </button>
          )}
        </div>

        {formAberto && (
          <div className="border border-blue-200 bg-blue-50/40 p-3 mb-3 grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="col-span-2 md:col-span-3">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Descrição *</label>
              <input value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                className="w-full border border-gray-300 px-2 py-1.5 text-sm" placeholder="ex.: Simples Nacional — alíquota efetiva Anexo I" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Tipo</label>
              <select value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}
                className="w-full border border-gray-300 px-2 py-1.5 text-sm">
                {Object.entries(TIPO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">UF destino (vazio = todas)</label>
              <select value={form.ufDestino} onChange={(e) => setForm((f) => ({ ...f, ufDestino: e.target.value }))}
                className="w-full border border-gray-300 px-2 py-1.5 text-sm">
                <option value="">Todas</option>
                {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Percentual (%) *</label>
              <input value={form.percentual} onChange={(e) => setForm((f) => ({ ...f, percentual: e.target.value }))}
                className="w-full border border-gray-300 px-2 py-1.5 text-sm" placeholder="6,00" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Vigência a partir de</label>
              <input type="date" value={form.vigenciaInicio} onChange={(e) => setForm((f) => ({ ...f, vigenciaInicio: e.target.value }))}
                className="w-full border border-gray-300 px-2 py-1.5 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Observações</label>
              <input value={form.observacoes} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                className="w-full border border-gray-300 px-2 py-1.5 text-sm" placeholder="fonte da alíquota, orientação do contador…" />
            </div>
            <div className="col-span-2 md:col-span-3 flex justify-end gap-2">
              <button onClick={() => setFormAberto(false)} className="text-sm px-3 py-1.5 text-gray-600">Cancelar</button>
              <button
                disabled={salvar.isPending || form.descricao.trim().length < 3 || !form.percentual}
                onClick={() => salvar.mutate({
                  descricao: form.descricao.trim(),
                  tipo: form.tipo as any,
                  ufDestino: form.ufDestino || null,
                  percentual: parseFloat(form.percentual.replace(",", ".")) || 0,
                  vigenciaInicio: form.vigenciaInicio,
                  observacoes: form.observacoes || undefined,
                })}
                className="text-sm font-semibold px-4 py-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded disabled:opacity-50">
                {salvar.isPending ? "Salvando…" : "Salvar regra"}
              </button>
            </div>
          </div>
        )}

        {regras.isLoading ? (
          <div className="p-6 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : regras.data && regras.data.length > 0 ? (
          <div className="space-y-1.5">
            {regras.data.map((r) => (
              <div key={r.id} className={`flex items-center gap-3 border p-2.5 ${r.ativo ? "border-gray-200" : "border-gray-100 opacity-50"}`}>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900">{r.descricao}</div>
                  <div className="text-[11px] text-gray-500">
                    {TIPO_LABEL[r.tipo] ?? r.tipo} · {Number(r.percentual).toFixed(2)}%
                    {r.ufDestino ? ` · destino ${r.ufDestino}` : " · todas as UFs"}
                    {` · vigente desde ${new Date(r.vigenciaInicio).toLocaleDateString("pt-BR")}`}
                    {r.vigenciaFim ? ` até ${new Date(r.vigenciaFim).toLocaleDateString("pt-BR")}` : ""}
                    {!r.ativo ? " · DESATIVADA" : ""}
                  </div>
                </div>
                {isAdmin && r.ativo && (
                  <button onClick={() => desativar.mutate({ id: r.id })} title="Desativar"
                    className="text-gray-300 hover:text-red-500"><Ban className="w-4 h-4" /></button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-sm text-gray-400 border border-dashed border-gray-200">
            Nenhuma regra cadastrada. Comece com a alíquota efetiva do Simples Nacional
            (ex.: "Simples Nacional — efetiva 6%") e, se vender para fora de MG, cadastre o DIFAL por UF.
          </div>
        )}
      </section>
    </div>
  );
}
