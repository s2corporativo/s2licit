import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Gavel, Plus, Trash2, AlertTriangle, Calculator } from "lucide-react";

interface ItemInput {
  descricao: string;
  custo: string;
  quantidade: string;
  medianaHomologado: string;
}

const emptyItem: ItemInput = { descricao: "", custo: "", quantidade: "1", medianaHomologado: "" };

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function SalaDisputa() {
  const [items, setItems] = useState<ItemInput[]>([{ ...emptyItem }]);
  const [margemMinima, setMargemMinima] = useState("");
  const [margemDesejada, setMargemDesejada] = useState("");
  const [payload, setPayload] = useState<any>(null);

  const query = trpc.precificacao.sugerirLote.useQuery(payload, { enabled: payload != null, retry: false });

  const addItem = () => setItems([...items, { ...emptyItem }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const setItem = (i: number, field: keyof ItemInput, v: string) =>
    setItems(items.map((it, idx) => (idx === i ? { ...it, [field]: v } : it)));

  const calcular = () => {
    const itens = items
      .filter((it) => parseFloat(it.custo.replace(",", ".")) > 0)
      .map((it) => ({
        descricao: it.descricao || undefined,
        custo: parseFloat(it.custo.replace(",", ".")),
        quantidade: parseFloat(it.quantidade.replace(",", ".")) || 1,
        medianaHomologado: it.medianaHomologado ? parseFloat(it.medianaHomologado.replace(",", ".")) : undefined,
      }));
    if (itens.length === 0) return;
    setPayload({
      itens,
      margemMinima: margemMinima ? parseFloat(margemMinima) : undefined,
      margemDesejada: margemDesejada ? parseFloat(margemDesejada) : undefined,
    });
  };

  const data = query.data;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <Gavel className="w-7 h-7 text-red-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sala de Disputa</h1>
          <p className="text-sm text-gray-500">Piso, alvo e preço sugerido por item — nunca desça abaixo do piso no pregão</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 my-4 border border-gray-200 p-3">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Margem mínima %</label>
          <input value={margemMinima} onChange={(e) => setMargemMinima(e.target.value)} placeholder="empresa" className="w-24 border border-gray-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Margem desejada %</label>
          <input value={margemDesejada} onChange={(e) => setMargemDesejada(e.target.value)} placeholder="30" className="w-24 border border-gray-300 px-2 py-1.5 text-sm" />
        </div>
        <button onClick={calcular} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-semibold">
          <Calculator className="w-4 h-4" /> Calcular
        </button>
      </div>

      {/* Entrada de itens */}
      <div className="border border-gray-200 mb-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-3 py-2 font-bold">Descrição</th>
              <th className="text-left px-3 py-2 font-bold">Custo R$</th>
              <th className="text-left px-3 py-2 font-bold">Qtd</th>
              <th className="text-left px-3 py-2 font-bold">Mediana homologada R$ (opcional)</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((it, i) => (
              <tr key={i}>
                <td className="px-3 py-1.5"><input value={it.descricao} onChange={(e) => setItem(i, "descricao", e.target.value)} className="w-full border border-gray-200 px-2 py-1 text-sm" placeholder="Item" /></td>
                <td className="px-3 py-1.5"><input value={it.custo} onChange={(e) => setItem(i, "custo", e.target.value)} className="w-24 border border-gray-200 px-2 py-1 text-sm" placeholder="0,00" /></td>
                <td className="px-3 py-1.5"><input value={it.quantidade} onChange={(e) => setItem(i, "quantidade", e.target.value)} className="w-16 border border-gray-200 px-2 py-1 text-sm" /></td>
                <td className="px-3 py-1.5"><input value={it.medianaHomologado} onChange={(e) => setItem(i, "medianaHomologado", e.target.value)} className="w-28 border border-gray-200 px-2 py-1 text-sm" placeholder="—" /></td>
                <td className="px-3 py-1.5 text-right">{items.length > 1 && <button onClick={() => removeItem(i)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={addItem} className="flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900 px-3 py-2"><Plus className="w-3 h-3" /> Adicionar item</button>
      </div>

      {/* Resultado */}
      {query.error && <div className="text-sm text-red-600 mb-4">Erro: {query.error.message}</div>}
      {data && (
        <div className="border-2 border-red-200">
          <div className="px-4 py-2 bg-red-50 border-b border-red-200 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-red-700">Preços para a disputa (margens {data.margemMinima}% / {data.margemDesejada}%)</span>
            <span className="text-sm font-bold text-gray-700">Total sugerido: {brl(data.totalSugerido)}</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-2 font-bold">Item</th>
                <th className="text-right px-3 py-2 font-bold text-red-700">PISO (não desça)</th>
                <th className="text-right px-3 py-2 font-bold text-green-700">Sugerido</th>
                <th className="text-right px-3 py-2 font-bold text-gray-500">Alvo</th>
                <th className="text-right px-3 py-2 font-bold">Margem sug.</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.itens.map((it: any, i: number) => (
                <tr key={i} className={it.alerta ? "bg-amber-50" : ""}>
                  <td className="px-3 py-2 text-gray-800">{it.descricao || `Item ${i + 1}`}<div className="text-[10px] text-gray-400">custo {brl(it.custo)} · qtd {it.quantidade}</div></td>
                  <td className="px-3 py-2 text-right font-bold text-red-700">{brl(it.piso)}</td>
                  <td className="px-3 py-2 text-right font-bold text-green-700">{brl(it.sugerido)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{brl(it.alvo)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{it.margemNoSugerido.toFixed(1)}%</td>
                  <td className="px-3 py-2">{it.alerta && <span title={it.alerta}><AlertTriangle className="w-4 h-4 text-amber-500" /></span>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 font-bold">
                <td className="px-3 py-2 text-right text-gray-500 text-xs uppercase">Totais</td>
                <td className="px-3 py-2 text-right text-red-700">{brl(data.totalPiso)}</td>
                <td className="px-3 py-2 text-right text-green-700">{brl(data.totalSugerido)}</td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
          {data.itens.some((it: any) => it.alerta) && (
            <div className="p-3 bg-amber-50 border-t border-amber-200 text-xs text-amber-800 space-y-1">
              {data.itens.filter((it: any) => it.alerta).map((it: any, i: number) => (
                <div key={i}>⚠️ <strong>{it.descricao || "Item"}:</strong> {it.alerta}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
