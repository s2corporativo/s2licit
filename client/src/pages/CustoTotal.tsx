import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Truck, Loader2, Plus, Trash2, AlertTriangle, Calculator } from "lucide-react";
import { toast } from "sonner";

/**
 * Custo Total & Fretes: o preço anunciado do fornecedor não é o custo real.
 * Aqui entra frete de entrada/saída, impostos (Motor Tributário), taxas e
 * custo financeiro — e sai o preço mínimo sustentável.
 */

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const num = (s: string) => parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
const moeda = (v: number | null) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function CustoTotal() {
  const utils = trpc.useUtils();
  const [f, setF] = useState({
    preco: "", qtd: "1", freteEntrada: "", freteSaida: "", outros: "",
    ufDestino: "MG", taxas: "", financeiro: "", margemMin: "10", margemDes: "25",
  });

  const preco = num(f.preco);
  const calc = trpc.fretes.custoTotal.useQuery(
    {
      precoProdutoUnit: preco,
      quantidade: num(f.qtd) || 1,
      freteEntradaTotal: num(f.freteEntrada) || undefined,
      freteSaidaTotal: num(f.freteSaida) || undefined,
      outrosCustosTotal: num(f.outros) || undefined,
      ufDestino: f.ufDestino,
      taxasPct: num(f.taxas) || undefined,
      custoFinanceiroPct: num(f.financeiro) || undefined,
      margemMinimaPct: num(f.margemMin) || undefined,
      margemDesejadaPct: num(f.margemDes) || undefined,
    },
    { enabled: preco > 0 },
  );

  // Cotações de frete registradas
  const fretes = trpc.fretes.listar.useQuery({});
  const [novoFrete, setNovoFrete] = useState(false);
  const [ff, setFf] = useState({ descricao: "", tipo: "saida", transportadora: "", ufDestino: "", valorFrete: "", prazoDias: "" });
  const salvarFrete = trpc.fretes.salvar.useMutation({
    onSuccess: () => {
      toast.success("Cotação de frete registrada.");
      setNovoFrete(false);
      setFf({ descricao: "", tipo: "saida", transportadora: "", ufDestino: "", valorFrete: "", prazoDias: "" });
      utils.fretes.listar.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const removerFrete = trpc.fretes.remover.useMutation({
    onSuccess: () => utils.fretes.listar.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const campo = (label: string, key: keyof typeof f, placeholder = "") => (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      <input value={f[key]} onChange={(e) => setF((s) => ({ ...s, [key]: e.target.value }))}
        className="w-full border border-gray-300 px-2 py-1.5 text-sm" placeholder={placeholder} />
    </div>
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Truck className="w-7 h-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Custo Total & Fretes</h1>
          <p className="text-sm text-gray-500">O custo real inclui fretes, impostos e taxas — compare fornecedores pelo custo total, não pelo preço anunciado</p>
        </div>
      </div>

      {/* Calculadora de custo total */}
      <section className="mt-5 border border-gray-200 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2">
          <Calculator className="w-4 h-4" /> Custo total de aquisição
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {campo("Preço unit. fornecedor (R$)*", "preco", "10,00")}
          {campo("Quantidade", "qtd")}
          {campo("Frete entrada — lote (R$)", "freteEntrada", "0,00")}
          {campo("Frete saída — lote (R$)", "freteSaida", "0,00")}
          {campo("Outros custos — lote (R$)", "outros", "embalagem…")}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">UF de destino</label>
            <select value={f.ufDestino} onChange={(e) => setF((s) => ({ ...s, ufDestino: e.target.value }))}
              className="w-full border border-gray-300 px-2 py-1.5 text-sm">
              {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </div>
          {campo("Taxas do portal (%)", "taxas", "0")}
          {campo("Custo financeiro (%)", "financeiro", "prazo de recebimento")}
          {campo("Margem mínima (%)", "margemMin")}
          {campo("Margem desejada (%)", "margemDes")}
        </div>

        {preco > 0 && calc.data && (
          <div className="border-t border-gray-100 mt-4 pt-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="border border-gray-200 p-2.5 text-center">
                <div className="text-lg font-bold text-gray-800">{moeda(calc.data.custoUnitarioReal)}</div>
                <div className="text-[10px] font-bold uppercase text-gray-500">Custo unit. real</div>
              </div>
              <div className="border border-gray-200 p-2.5 text-center">
                <div className="text-lg font-bold text-gray-800">{moeda(calc.data.custoLoteReal)}</div>
                <div className="text-[10px] font-bold uppercase text-gray-500">Custo do lote</div>
              </div>
              <div className="border border-gray-200 p-2.5 text-center">
                <div className="text-lg font-bold text-red-600">{calc.data.percentuaisSobreVenda.toFixed(1)}%</div>
                <div className="text-[10px] font-bold uppercase text-gray-500">Impostos+taxas s/ venda</div>
              </div>
              <div className="border-2 border-red-300 bg-red-50 p-2.5 text-center">
                <div className="text-lg font-bold text-red-700">{moeda(calc.data.precoMinimoUnit)}</div>
                <div className="text-[10px] font-bold uppercase text-red-600">PISO — não desça</div>
              </div>
              <div className="border-2 border-emerald-300 bg-emerald-50 p-2.5 text-center">
                <div className="text-lg font-bold text-emerald-700">{moeda(calc.data.precoRecomendadoUnit)}</div>
                <div className="text-[10px] font-bold uppercase text-emerald-600">Recomendado</div>
              </div>
            </div>
            {calc.data.impostosPct > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                Impostos de {calc.data.impostosPct.toFixed(2)}% aplicados pelo Motor Tributário para destino {f.ufDestino}.
              </p>
            )}
            {calc.data.alertas.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 p-2 mt-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {a}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Cotações de frete */}
      <section className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">Cotações de frete registradas</h2>
          <button onClick={() => setNovoFrete((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded">
            <Plus className="w-3.5 h-3.5" /> Registrar frete
          </button>
        </div>

        {novoFrete && (
          <div className="border border-blue-200 bg-blue-50/40 p-3 mb-3 grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Descrição *</label>
              <input value={ff.descricao} onChange={(e) => setFf((s) => ({ ...s, descricao: e.target.value }))}
                className="w-full border border-gray-300 px-2 py-1.5 text-sm" placeholder="ex.: Entrega BH → Viçosa, 3 caixas medicamento" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Tipo</label>
              <select value={ff.tipo} onChange={(e) => setFf((s) => ({ ...s, tipo: e.target.value }))}
                className="w-full border border-gray-300 px-2 py-1.5 text-sm">
                <option value="saida">Saída (→ órgão)</option>
                <option value="entrada">Entrada (fornecedor →)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Transportadora</label>
              <input value={ff.transportadora} onChange={(e) => setFf((s) => ({ ...s, transportadora: e.target.value }))}
                className="w-full border border-gray-300 px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">UF destino</label>
              <select value={ff.ufDestino} onChange={(e) => setFf((s) => ({ ...s, ufDestino: e.target.value }))}
                className="w-full border border-gray-300 px-2 py-1.5 text-sm">
                <option value="">—</option>
                {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Valor (R$) *</label>
              <input value={ff.valorFrete} onChange={(e) => setFf((s) => ({ ...s, valorFrete: e.target.value }))}
                className="w-full border border-gray-300 px-2 py-1.5 text-sm" placeholder="120,00" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Prazo (dias)</label>
              <input value={ff.prazoDias} onChange={(e) => setFf((s) => ({ ...s, prazoDias: e.target.value }))}
                className="w-full border border-gray-300 px-2 py-1.5 text-sm" />
            </div>
            <div className="col-span-2 md:col-span-3 flex justify-end gap-2">
              <button onClick={() => setNovoFrete(false)} className="text-sm px-3 py-1.5 text-gray-600">Cancelar</button>
              <button
                disabled={salvarFrete.isPending || ff.descricao.trim().length < 3 || !ff.valorFrete}
                onClick={() => salvarFrete.mutate({
                  descricao: ff.descricao.trim(),
                  tipo: ff.tipo as "entrada" | "saida",
                  transportadora: ff.transportadora || undefined,
                  ufDestino: ff.ufDestino || undefined,
                  valorFrete: num(ff.valorFrete),
                  prazoDias: ff.prazoDias ? parseInt(ff.prazoDias, 10) : undefined,
                })}
                className="text-sm font-semibold px-4 py-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded disabled:opacity-50">
                {salvarFrete.isPending ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        )}

        {fretes.isLoading ? (
          <div className="p-6 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : fretes.data && fretes.data.length > 0 ? (
          <div className="space-y-1.5">
            {fretes.data.map((fr) => (
              <div key={fr.id} className="flex items-center gap-3 border border-gray-200 p-2.5">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${fr.tipo === "saida" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"}`}>
                  {fr.tipo === "saida" ? "SAÍDA" : "ENTRADA"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900 truncate">{fr.descricao}</div>
                  <div className="text-[11px] text-gray-500">
                    {fr.transportadora && `${fr.transportadora} · `}
                    {fr.ufDestino && `${fr.ufDestino} · `}
                    {fr.prazoDias != null && `${fr.prazoDias}d · `}
                    {new Date(fr.createdAt).toLocaleDateString("pt-BR")}
                  </div>
                </div>
                <span className="text-sm font-bold text-gray-800 tabular-nums">{moeda(Number(fr.valorFrete))}</span>
                <button onClick={() => removerFrete.mutate({ id: fr.id })} className="text-gray-300 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-sm text-gray-400 border border-dashed border-gray-200">
            Nenhuma cotação de frete registrada. Registre aqui os valores que você cotar com as
            transportadoras para usá-los na calculadora acima.
          </div>
        )}
      </section>
    </div>
  );
}
