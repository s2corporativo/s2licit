import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PackageCheck, Loader2, Plus, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

/**
 * Pós-venda: venceu a disputa → pedido ao fornecedor → entrega → nota
 * fiscal → recebimento. Abas: Pedidos, Entregas, A Receber, A Pagar, Fluxo.
 */

type Aba = "pedidos" | "entregas" | "receber" | "pagar" | "fluxo";

const num = (s: string) => parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (d: string | Date | null) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

const STATUS_PEDIDO = ["solicitado", "confirmado", "faturado", "enviado", "recebido", "divergente", "cancelado"] as const;
const STATUS_ENTREGA = ["preparando", "transito", "entregue", "atrasada", "devolvida"] as const;

export default function PosVenda() {
  const [aba, setAba] = useState<Aba>("pedidos");
  const utils = trpc.useUtils();

  const pedidos = trpc.posVenda.pedidos.useQuery(undefined, { enabled: aba === "pedidos" });
  const entregas = trpc.posVenda.entregas.useQuery(undefined, { enabled: aba === "entregas" });
  const notas = trpc.posVenda.notas.useQuery(undefined, { enabled: aba === "receber" });
  const contas = trpc.posVenda.contasPagar.useQuery(undefined, { enabled: aba === "pagar" });
  const fluxo = trpc.posVenda.fluxoCaixa.useQuery(undefined, { enabled: aba === "fluxo" });

  const ok = (msg: string) => () => {
    toast.success(msg);
    utils.posVenda.invalidate();
  };
  const err = (e: any) => toast.error(e.message);

  const salvarPedido = trpc.posVenda.salvarPedido.useMutation({ onSuccess: ok("Pedido salvo."), onError: err });
  const mudarStatusPedido = trpc.posVenda.mudarStatusPedido.useMutation({ onSuccess: ok("Status atualizado."), onError: err });
  const salvarEntrega = trpc.posVenda.salvarEntrega.useMutation({ onSuccess: ok("Entrega salva."), onError: err });
  const salvarNota = trpc.posVenda.salvarNota.useMutation({ onSuccess: ok("Nota registrada."), onError: err });
  const marcarNotaPaga = trpc.posVenda.marcarNotaPaga.useMutation({ onSuccess: ok("Recebimento registrado."), onError: err });
  const salvarConta = trpc.posVenda.salvarContaPagar.useMutation({ onSuccess: ok("Conta registrada."), onError: err });
  const marcarContaPaga = trpc.posVenda.marcarContaPaga.useMutation({ onSuccess: ok("Pagamento registrado."), onError: err });

  // Forms
  const [fp, setFp] = useState({ fornecedorNome: "", descricao: "", valorTotal: "", prazoEntrega: "", vinculo: "" });
  const [fe, setFe] = useState({ descricao: "", transportadora: "", rastreio: "", previsao: "" });
  const [fn, setFn] = useState({ numero: "", orgao: "", valorBruto: "", retencoes: "", dataEmissao: new Date().toISOString().slice(0, 10), vencimento: "" });
  const [fc, setFc] = useState({ descricao: "", credor: "", categoria: "fornecedor", valor: "", vencimento: "" });
  const [formAberto, setFormAberto] = useState(false);

  const inp = "w-full border border-gray-300 px-2 py-1.5 text-sm";
  const lbl = "block text-xs font-semibold text-gray-600 mb-1";

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <PackageCheck className="w-7 h-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pós-venda</h1>
          <p className="text-sm text-gray-500">Pedido ao fornecedor → entrega → nota fiscal → recebimento — o lucro real se decide aqui</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200 mb-4">
        {([
          ["pedidos", "Pedidos de compra"],
          ["entregas", "Entregas"],
          ["receber", "A Receber (NF)"],
          ["pagar", "A Pagar"],
          ["fluxo", "Fluxo de caixa"],
        ] as [Aba, string][]).map(([k, label]) => (
          <button key={k} onClick={() => { setAba(k); setFormAberto(false); }}
            className={`text-sm font-semibold px-4 py-2 border-b-2 -mb-px transition-colors ${
              aba === k ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {aba !== "fluxo" && (
        <button onClick={() => setFormAberto((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded mb-3">
          <Plus className="w-3.5 h-3.5" /> Novo registro
        </button>
      )}

      {/* ── PEDIDOS ── */}
      {aba === "pedidos" && (
        <>
          {formAberto && (
            <div className="border border-blue-200 bg-blue-50/40 p-3 mb-3 grid grid-cols-2 md:grid-cols-3 gap-3">
              <div><label className={lbl}>Fornecedor *</label>
                <input className={inp} value={fp.fornecedorNome} onChange={(e) => setFp((s) => ({ ...s, fornecedorNome: e.target.value }))} /></div>
              <div className="col-span-2"><label className={lbl}>Descrição *</label>
                <input className={inp} value={fp.descricao} onChange={(e) => setFp((s) => ({ ...s, descricao: e.target.value }))} placeholder="ex.: 200 fr Ivermectina 1% — Pregão 45/2026" /></div>
              <div><label className={lbl}>Valor total (R$) *</label>
                <input className={inp} value={fp.valorTotal} onChange={(e) => setFp((s) => ({ ...s, valorTotal: e.target.value }))} /></div>
              <div><label className={lbl}>Prazo de entrega</label>
                <input type="date" className={inp} value={fp.prazoEntrega} onChange={(e) => setFp((s) => ({ ...s, prazoEntrega: e.target.value }))} /></div>
              <div><label className={lbl}>Vínculo (empenho/AF/contrato)</label>
                <input className={inp} value={fp.vinculo} onChange={(e) => setFp((s) => ({ ...s, vinculo: e.target.value }))} /></div>
              <div className="col-span-2 md:col-span-3 flex justify-end">
                <button disabled={salvarPedido.isPending || !fp.fornecedorNome || !fp.descricao || !fp.valorTotal}
                  onClick={() => { salvarPedido.mutate({ fornecedorNome: fp.fornecedorNome, descricao: fp.descricao, valorTotal: num(fp.valorTotal), prazoEntrega: fp.prazoEntrega || undefined, vinculo: fp.vinculo || undefined }); setFormAberto(false); setFp({ fornecedorNome: "", descricao: "", valorTotal: "", prazoEntrega: "", vinculo: "" }); }}
                  className="text-sm font-semibold px-4 py-1.5 bg-blue-600 text-white rounded disabled:opacity-50">Salvar pedido</button>
              </div>
            </div>
          )}
          {pedidos.isLoading ? <Carregando /> : (pedidos.data ?? []).length === 0 ? <Vazio texto="Nenhum pedido de compra. Ao vencer uma disputa, registre aqui o pedido ao fornecedor." /> : (
            <div className="space-y-1.5">
              {(pedidos.data ?? []).map((p) => (
                <div key={p.id} className="border border-gray-200 p-2.5 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900 truncate">{p.descricao}</div>
                    <div className="text-[11px] text-gray-500">
                      {p.fornecedorNome} · {moeda(Number(p.valorTotal))}
                      {p.prazoEntrega && ` · entrega até ${dataBR(p.prazoEntrega)}`}
                      {p.vinculo && ` · ${p.vinculo}`}
                    </div>
                  </div>
                  <select value={p.status} onChange={(e) => mudarStatusPedido.mutate({ id: p.id, status: e.target.value as any })}
                    className="border border-gray-200 text-xs font-semibold px-2 py-1 rounded">
                    {STATUS_PEDIDO.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── ENTREGAS ── */}
      {aba === "entregas" && (
        <>
          {formAberto && (
            <div className="border border-blue-200 bg-blue-50/40 p-3 mb-3 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="col-span-2"><label className={lbl}>Descrição *</label>
                <input className={inp} value={fe.descricao} onChange={(e) => setFe((s) => ({ ...s, descricao: e.target.value }))} /></div>
              <div><label className={lbl}>Transportadora</label>
                <input className={inp} value={fe.transportadora} onChange={(e) => setFe((s) => ({ ...s, transportadora: e.target.value }))} /></div>
              <div><label className={lbl}>Rastreio</label>
                <input className={inp} value={fe.rastreio} onChange={(e) => setFe((s) => ({ ...s, rastreio: e.target.value }))} /></div>
              <div><label className={lbl}>Previsão</label>
                <input type="date" className={inp} value={fe.previsao} onChange={(e) => setFe((s) => ({ ...s, previsao: e.target.value }))} /></div>
              <div className="col-span-2 md:col-span-3 flex items-end justify-end">
                <button disabled={salvarEntrega.isPending || !fe.descricao}
                  onClick={() => { salvarEntrega.mutate({ descricao: fe.descricao, transportadora: fe.transportadora || undefined, rastreio: fe.rastreio || undefined, previsao: fe.previsao || undefined }); setFormAberto(false); setFe({ descricao: "", transportadora: "", rastreio: "", previsao: "" }); }}
                  className="text-sm font-semibold px-4 py-1.5 bg-blue-600 text-white rounded disabled:opacity-50">Salvar entrega</button>
              </div>
            </div>
          )}
          {entregas.isLoading ? <Carregando /> : (entregas.data ?? []).length === 0 ? <Vazio texto="Nenhuma entrega em acompanhamento." /> : (
            <div className="space-y-1.5">
              {(entregas.data ?? []).map((d) => (
                <div key={d.id} className="border border-gray-200 p-2.5 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900 truncate">{d.descricao}</div>
                    <div className="text-[11px] text-gray-500">
                      {d.transportadora && `${d.transportadora} · `}
                      {d.rastreio && `${d.rastreio} · `}
                      previsão {dataBR(d.previsao)}{d.entregueEm && ` · entregue ${dataBR(d.entregueEm)}`}
                    </div>
                  </div>
                  <select value={d.status}
                    onChange={(e) => salvarEntrega.mutate({ id: d.id, descricao: d.descricao, status: e.target.value as any, entregueEm: e.target.value === "entregue" ? new Date().toISOString().slice(0, 10) : undefined })}
                    className="border border-gray-200 text-xs font-semibold px-2 py-1 rounded">
                    {STATUS_ENTREGA.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── A RECEBER ── */}
      {aba === "receber" && (
        <>
          {formAberto && (
            <div className="border border-blue-200 bg-blue-50/40 p-3 mb-3 grid grid-cols-2 md:grid-cols-3 gap-3">
              <div><label className={lbl}>Nº da NF *</label>
                <input className={inp} value={fn.numero} onChange={(e) => setFn((s) => ({ ...s, numero: e.target.value }))} /></div>
              <div className="col-span-2"><label className={lbl}>Órgão *</label>
                <input className={inp} value={fn.orgao} onChange={(e) => setFn((s) => ({ ...s, orgao: e.target.value }))} /></div>
              <div><label className={lbl}>Valor bruto (R$) *</label>
                <input className={inp} value={fn.valorBruto} onChange={(e) => setFn((s) => ({ ...s, valorBruto: e.target.value }))} /></div>
              <div><label className={lbl}>Retenções (R$)</label>
                <input className={inp} value={fn.retencoes} onChange={(e) => setFn((s) => ({ ...s, retencoes: e.target.value }))} /></div>
              <div><label className={lbl}>Emissão</label>
                <input type="date" className={inp} value={fn.dataEmissao} onChange={(e) => setFn((s) => ({ ...s, dataEmissao: e.target.value }))} /></div>
              <div><label className={lbl}>Previsão de recebimento</label>
                <input type="date" className={inp} value={fn.vencimento} onChange={(e) => setFn((s) => ({ ...s, vencimento: e.target.value }))} /></div>
              <div className="col-span-2 flex items-end justify-end">
                <button disabled={salvarNota.isPending || !fn.numero || !fn.orgao || !fn.valorBruto}
                  onClick={() => { salvarNota.mutate({ numero: fn.numero, orgao: fn.orgao, valorBruto: num(fn.valorBruto), retencoes: num(fn.retencoes) || undefined, dataEmissao: fn.dataEmissao, vencimento: fn.vencimento || undefined }); setFormAberto(false); setFn({ numero: "", orgao: "", valorBruto: "", retencoes: "", dataEmissao: new Date().toISOString().slice(0, 10), vencimento: "" }); }}
                  className="text-sm font-semibold px-4 py-1.5 bg-blue-600 text-white rounded disabled:opacity-50">Registrar NF</button>
              </div>
            </div>
          )}
          {notas.isLoading ? <Carregando /> : (notas.data ?? []).length === 0 ? <Vazio texto="Nenhuma nota fiscal registrada." /> : (
            <div className="space-y-1.5">
              {(notas.data ?? []).map((n) => {
                const liquido = Number(n.valorBruto) - Number(n.retencoes);
                const atrasada = n.status !== "paga" && n.vencimento && new Date(n.vencimento) < new Date();
                return (
                  <div key={n.id} className={`border p-2.5 flex items-center gap-3 ${atrasada ? "border-red-200 bg-red-50/40" : "border-gray-200"}`}>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-900 truncate">NF {n.numero} — {n.orgao}</div>
                      <div className="text-[11px] text-gray-500">
                        emitida {dataBR(n.dataEmissao)} · prev. {dataBR(n.vencimento)}
                        {n.recebidoEm && ` · recebida ${dataBR(n.recebidoEm)}`}
                        {atrasada && <span className="text-red-600 font-bold"> · ATRASADA</span>}
                      </div>
                    </div>
                    <span className="text-sm font-bold text-gray-800 tabular-nums">{moeda(liquido)}</span>
                    {n.status !== "paga" && n.status !== "cancelada" ? (
                      <button onClick={() => marcarNotaPaga.mutate({ id: n.id })}
                        className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Recebida
                      </button>
                    ) : (
                      <span className="text-xs font-bold text-emerald-600 uppercase">{n.status}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── A PAGAR ── */}
      {aba === "pagar" && (
        <>
          {formAberto && (
            <div className="border border-blue-200 bg-blue-50/40 p-3 mb-3 grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="col-span-2"><label className={lbl}>Descrição *</label>
                <input className={inp} value={fc.descricao} onChange={(e) => setFc((s) => ({ ...s, descricao: e.target.value }))} /></div>
              <div><label className={lbl}>Credor</label>
                <input className={inp} value={fc.credor} onChange={(e) => setFc((s) => ({ ...s, credor: e.target.value }))} /></div>
              <div><label className={lbl}>Categoria</label>
                <select className={inp} value={fc.categoria} onChange={(e) => setFc((s) => ({ ...s, categoria: e.target.value }))}>
                  {["fornecedor", "frete", "imposto", "taxa", "despesa"].map((c) => <option key={c} value={c}>{c}</option>)}
                </select></div>
              <div><label className={lbl}>Valor (R$) *</label>
                <input className={inp} value={fc.valor} onChange={(e) => setFc((s) => ({ ...s, valor: e.target.value }))} /></div>
              <div><label className={lbl}>Vencimento *</label>
                <input type="date" className={inp} value={fc.vencimento} onChange={(e) => setFc((s) => ({ ...s, vencimento: e.target.value }))} /></div>
              <div className="col-span-2 md:col-span-3 flex justify-end">
                <button disabled={salvarConta.isPending || !fc.descricao || !fc.valor || !fc.vencimento}
                  onClick={() => { salvarConta.mutate({ descricao: fc.descricao, credor: fc.credor || undefined, categoria: fc.categoria as any, valor: num(fc.valor), vencimento: fc.vencimento }); setFormAberto(false); setFc({ descricao: "", credor: "", categoria: "fornecedor", valor: "", vencimento: "" }); }}
                  className="text-sm font-semibold px-4 py-1.5 bg-blue-600 text-white rounded disabled:opacity-50">Registrar conta</button>
              </div>
            </div>
          )}
          {contas.isLoading ? <Carregando /> : (contas.data ?? []).length === 0 ? <Vazio texto="Nenhuma conta a pagar registrada." /> : (
            <div className="space-y-1.5">
              {(contas.data ?? []).map((c) => {
                const atrasada = !c.pagoEm && new Date(c.vencimento) < new Date();
                return (
                  <div key={c.id} className={`border p-2.5 flex items-center gap-3 ${atrasada ? "border-red-200 bg-red-50/40" : "border-gray-200"} ${c.pagoEm ? "opacity-60" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-900 truncate">{c.descricao}</div>
                      <div className="text-[11px] text-gray-500">
                        {c.credor && `${c.credor} · `}{c.categoria} · vence {dataBR(c.vencimento)}
                        {c.pagoEm && ` · paga ${dataBR(c.pagoEm)}`}
                        {atrasada && <span className="text-red-600 font-bold"> · ATRASADA</span>}
                      </div>
                    </div>
                    <span className="text-sm font-bold text-gray-800 tabular-nums">{moeda(Number(c.valor))}</span>
                    {!c.pagoEm && (
                      <button onClick={() => marcarContaPaga.mutate({ id: c.id })}
                        className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Paga
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── FLUXO DE CAIXA ── */}
      {aba === "fluxo" && (
        fluxo.isLoading || !fluxo.data ? <Carregando /> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              <div className="border border-emerald-200 bg-emerald-50 p-3 text-center">
                <div className="text-xl font-bold text-emerald-700">{moeda(fluxo.data.aReceber)}</div>
                <div className="text-[10px] font-bold uppercase text-emerald-600">A receber</div>
              </div>
              <div className="border border-red-200 bg-red-50 p-3 text-center">
                <div className="text-xl font-bold text-red-700">{moeda(fluxo.data.aPagar)}</div>
                <div className="text-[10px] font-bold uppercase text-red-600">A pagar</div>
              </div>
              <div className={`border p-3 text-center ${fluxo.data.saldoProjetado >= 0 ? "border-gray-200" : "border-red-300 bg-red-50"}`}>
                <div className={`text-xl font-bold ${fluxo.data.saldoProjetado >= 0 ? "text-gray-800" : "text-red-700"}`}>{moeda(fluxo.data.saldoProjetado)}</div>
                <div className="text-[10px] font-bold uppercase text-gray-500">Saldo projetado</div>
              </div>
            </div>
            {(fluxo.data.atrasadosReceber > 0 || fluxo.data.atrasadosPagar > 0) && (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 p-2 mb-4">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {fluxo.data.atrasadosReceber > 0 && <span>{moeda(fluxo.data.atrasadosReceber)} a receber em atraso. </span>}
                {fluxo.data.atrasadosPagar > 0 && <span>{moeda(fluxo.data.atrasadosPagar)} a pagar em atraso.</span>}
              </div>
            )}
            {fluxo.data.porMes.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b">
                    <th className="py-2">Mês</th>
                    <th className="py-2 text-right">Entradas</th>
                    <th className="py-2 text-right">Saídas</th>
                    <th className="py-2 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {fluxo.data.porMes.map((m) => (
                    <tr key={m.mes} className="border-b border-gray-50">
                      <td className="py-2 font-medium">{m.mes}</td>
                      <td className="py-2 text-right tabular-nums text-emerald-700">{moeda(m.receber)}</td>
                      <td className="py-2 text-right tabular-nums text-red-600">{moeda(m.pagar)}</td>
                      <td className={`py-2 text-right tabular-nums font-bold ${m.saldo >= 0 ? "text-gray-800" : "text-red-700"}`}>{moeda(m.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Vazio texto="Sem lançamentos em aberto — registre notas fiscais e contas a pagar para projetar o caixa." />
            )}
          </>
        )
      )}
    </div>
  );
}

function Carregando() {
  return <div className="p-8 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;
}
function Vazio({ texto }: { texto: string }) {
  return <div className="p-6 text-center text-sm text-gray-400 border border-dashed border-gray-200">{texto}</div>;
}
