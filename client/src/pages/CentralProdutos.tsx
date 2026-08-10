import { trpc } from "@/lib/trpc";
import { AlertTriangle, Building2, ChevronRight, Database, FileUp, Filter, Image, Package, RefreshCw, Search, Sparkles, Tags } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "wouter";

type Tab = "catalogo" | "precos" | "qualidade" | "importar";
type Quality = "all" | "incomplete" | "without_offer" | "stale_price" | "without_image";

function money(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Metric({ label, value, hint, onClick }: { label: string; value: number; hint: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-left rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md">
      <div className="text-2xl font-black tracking-tight text-slate-950">{value.toLocaleString("pt-BR")}</div>
      <div className="mt-1 text-xs font-bold text-slate-700">{label}</div>
      <div className="mt-1 text-[11px] text-slate-500">{hint}</div>
    </button>
  );
}

export default function CentralProdutos() {
  const [tab, setTab] = useState<Tab>(() => {
    const value = new URLSearchParams(window.location.search).get("tab");
    return value === "precos" || value === "qualidade" || value === "importar" ? value : "catalogo";
  });
  const [search, setSearch] = useState("");
  const [quality, setQuality] = useState<Quality>("all");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const listInput = useMemo(() => ({ search: search.trim() || undefined, quality, limit, offset, sort: "name" as const, sortDir: "asc" as const }), [search, quality, offset]);
  const catalog = trpc.catalog.list.useQuery(listInput, { placeholderData: (previous) => previous });
  const summary = trpc.catalog.qualitySummary.useQuery(undefined, { refetchInterval: 60_000 });
  const total = catalog.data?.total ?? 0;
  const items = catalog.data?.items ?? [];

  const changeTab = (next: Tab) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "catalogo") url.searchParams.delete("tab"); else url.searchParams.set("tab", next);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  };

  const applyQuality = (next: Quality) => {
    setQuality(next);
    setOffset(0);
    setTab("catalogo");
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-5 border-b border-slate-200 bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 p-6 text-white lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-blue-200"><Database size={14} /> Catálogo canônico</div>
            <h1 className="m-0 text-3xl font-black tracking-tight">Central de Produtos</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Uma única visão para produto mestre, ofertas por fornecedor, qualidade, proveniência e importação. O preço exibido prioriza a oferta canônica mais barata e sinaliza fallback legado quando necessário.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/equivalencias" className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold text-white no-underline hover:bg-white/15">Compêndio de equivalências</Link>
            <Link href="/produtos/legado" className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold text-white no-underline hover:bg-white/15">Ferramentas avançadas legadas</Link>
          </div>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-4 pt-3">
          {([
            ["catalogo", "Catálogo", Package],
            ["precos", "Ofertas e preços", Building2],
            ["qualidade", "Qualidade", Sparkles],
            ["importar", "Importar", FileUp],
          ] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => changeTab(key)} className={`flex items-center gap-2 whitespace-nowrap rounded-t-xl px-4 py-3 text-xs font-bold ${tab === key ? "bg-blue-50 text-blue-950" : "text-slate-500 hover:bg-slate-50"}`}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      </section>

      {tab === "catalogo" && (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Metric label="Produtos ativos" value={summary.data?.total ?? 0} hint="Catálogo operacional" onClick={() => applyQuality("all")} />
            <Metric label="Incompletos" value={summary.data?.incomplete ?? 0} hint="Dados técnicos pendentes" onClick={() => applyQuality("incomplete")} />
            <Metric label="Sem oferta" value={summary.data?.withoutOffer ?? 0} hint="Sem preço canônico" onClick={() => applyQuality("without_offer")} />
            <Metric label="Preço vencido" value={summary.data?.stalePrice ?? 0} hint="Oferta > 48 horas" onClick={() => applyQuality("stale_price")} />
            <Metric label="Sem imagem" value={summary.data?.withoutImage ?? 0} hint="Cobertura visual" onClick={() => applyQuality("without_image")} />
            <Metric label="Validados" value={summary.data?.withValidatedTechnicalData ?? 0} hint="Ficha técnica validada" />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(e) => { setSearch(e.target.value); setOffset(0); }} placeholder="Nome, princípio ativo, fabricante, EAN, MAPA, CATMAT ou CATMAS" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:bg-white" />
              </div>
              <div className="flex items-center gap-2">
                <Filter size={14} className="text-slate-400" />
                <select value={quality} onChange={(e) => { setQuality(e.target.value as Quality); setOffset(0); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700">
                  <option value="all">Todos</option>
                  <option value="incomplete">Incompletos</option>
                  <option value="without_offer">Sem oferta</option>
                  <option value="stale_price">Preço vencido</option>
                  <option value="without_image">Sem imagem</option>
                </select>
                <button onClick={() => { catalog.refetch(); summary.refetch(); }} className="rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50" title="Atualizar"><RefreshCw size={15} /></button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                  <tr><th className="px-4 py-3">Produto</th><th className="px-4 py-3">Classificação</th><th className="px-4 py-3">Identidade</th><th className="px-4 py-3 text-right">Melhor custo</th><th className="px-4 py-3">Ofertas</th><th className="px-4 py-3">Qualidade</th></tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                      <td className="px-4 py-3"><div className="flex items-center gap-3">{item.imageUrl ? <img src={item.imageUrl} alt="" className="h-10 w-10 rounded-lg border border-slate-100 object-contain" /> : <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100"><Package size={15} className="text-slate-400" /></div>}<div className="min-w-0"><div className="max-w-md truncate font-bold text-slate-900">{item.name}</div><div className="mt-0.5 text-[10px] text-slate-500">#{item.id}{item.manufacturer ? ` · ${item.manufacturer}` : ""}</div></div></div></td>
                      <td className="px-4 py-3"><div className="font-semibold text-slate-700">{item.categoryName ?? "Sem categoria"}</div><div className="text-[10px] text-slate-400">{item.subcategoria ?? "—"}</div></td>
                      <td className="px-4 py-3"><div className="max-w-xs truncate font-medium text-slate-700">{item.activeIngredient ?? "—"}</div><div className="text-[10px] text-slate-400">{[item.concentration, item.presentation].filter(Boolean).join(" · ") || "Dados técnicos pendentes"}</div></td>
                      <td className="px-4 py-3 text-right"><div className="font-black text-slate-950">{money(item.bestPrice)}</div><div className={`text-[10px] ${item.priceSource === "supplier_offer" ? "text-emerald-600" : item.priceSource === "legacy_product_price" ? "text-amber-600" : "text-slate-400"}`}>{item.priceSource === "supplier_offer" ? item.bestOffer?.supplierName ?? "Oferta canônica" : item.priceSource === "legacy_product_price" ? "Preço legado" : "Sem preço"}</div></td>
                      <td className="px-4 py-3"><span className="rounded-full bg-blue-50 px-2 py-1 font-bold text-blue-800">{item.offerCount}</span></td>
                      <td className="px-4 py-3">{item.needsReview ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 font-bold text-amber-700"><AlertTriangle size={10} /> Revisar</span> : <span className="rounded-full bg-emerald-50 px-2 py-1 font-bold text-emerald-700">Completo</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!catalog.isLoading && items.length === 0 && <div className="p-10 text-center text-sm text-slate-500">Nenhum produto encontrado com os filtros atuais.</div>}
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 p-4 text-xs text-slate-500">
              <span>{total.toLocaleString("pt-BR")} produtos</span>
              <div className="flex gap-2"><button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))} className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold disabled:opacity-40">Anterior</button><button disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold disabled:opacity-40">Próxima</button></div>
            </div>
          </section>
        </>
      )}

      {tab === "precos" && (
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2"><h2 className="m-0 text-lg font-black text-slate-900">Fonte única de custo</h2><p className="mt-2 text-sm leading-6 text-slate-600">O fluxo novo usa <strong>product_supplier_offers</strong> como fonte operacional. Histórico, código do fornecedor e link permanecem associados à oferta, não à identidade do produto.</p><button onClick={() => changeTab("catalogo")} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-blue-950 px-4 py-2 text-xs font-bold text-white">Ver custos no catálogo <ChevronRight size={14} /></button></div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><div className="text-xs font-black uppercase tracking-wider text-amber-800">Compatibilidade</div><p className="mt-2 text-sm text-amber-900">Preços antigos em <code>products.price</code> aparecem apenas como fallback identificado até a migração completa dos consumidores.</p></div>
        </section>
      )}

      {tab === "qualidade" && (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Link href="/produtos?tab=catalogo" onClick={() => applyQuality("incomplete")} className="rounded-2xl border border-slate-200 bg-white p-5 no-underline shadow-sm"><Sparkles className="text-blue-700" /><h3 className="mb-1 mt-4 text-sm font-black text-slate-900">Dados técnicos</h3><p className="m-0 text-xs leading-5 text-slate-500">Filtre produtos incompletos e priorize revisão humana/IA.</p></Link>
          <Link href="/imagens" className="rounded-2xl border border-slate-200 bg-white p-5 no-underline shadow-sm"><Image className="text-blue-700" /><h3 className="mb-1 mt-4 text-sm font-black text-slate-900">Imagens</h3><p className="m-0 text-xs leading-5 text-slate-500">Ferramenta especializada de vinculação e revisão visual.</p></Link>
          <Link href="/reclassificacao" className="rounded-2xl border border-slate-200 bg-white p-5 no-underline shadow-sm"><Tags className="text-blue-700" /><h3 className="mb-1 mt-4 text-sm font-black text-slate-900">Reclassificação</h3><p className="m-0 text-xs leading-5 text-slate-500">Classifique em lote mantendo revisão e rastreabilidade.</p></Link>
          <Link href="/enriquecimento" className="rounded-2xl border border-slate-200 bg-white p-5 no-underline shadow-sm"><Sparkles className="text-blue-700" /><h3 className="mb-1 mt-4 text-sm font-black text-slate-900">Enriquecimento IA</h3><p className="m-0 text-xs leading-5 text-slate-500">Complemente ficha técnica com job persistente e revisão.</p></Link>
        </section>
      )}

      {tab === "importar" && (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Link href="/importar" className="rounded-2xl border border-slate-200 bg-white p-5 no-underline shadow-sm"><FileUp className="text-blue-700" /><h3 className="mb-1 mt-4 text-sm font-black text-slate-900">Planilha / CSV</h3><p className="m-0 text-xs leading-5 text-slate-500">Importação com matching e revisão antes de consolidar.</p></Link>
          <Link href="/importar-nfe" className="rounded-2xl border border-slate-200 bg-white p-5 no-underline shadow-sm"><FileUp className="text-blue-700" /><h3 className="mb-1 mt-4 text-sm font-black text-slate-900">NF-e</h3><p className="m-0 text-xs leading-5 text-slate-500">Capture itens e preços de fornecedor sem duplicar identidade.</p></Link>
          <Link href="/categorias" className="rounded-2xl border border-slate-200 bg-white p-5 no-underline shadow-sm"><Tags className="text-blue-700" /><h3 className="mb-1 mt-4 text-sm font-black text-slate-900">Categorias</h3><p className="m-0 text-xs leading-5 text-slate-500">Administração da taxonomia utilizada pelo catálogo.</p></Link>
        </section>
      )}
    </div>
  );
}
