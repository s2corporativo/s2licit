import { formatBRL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bot,
  Boxes,
  BrainCircuit,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  GitMerge,
  History,
  Package,
  RefreshCw,
  Search,
  ShoppingCart,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  WandSparkles,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

type Tab = "executive" | "products" | "quotations";

function money(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? formatBRL(n) : "—";
}

function dateTime(value: unknown) {
  if (!value) return "—";
  const d = new Date(value as any);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function SectionTitle({ eyebrow, title, detail }: { eyebrow: string; title: string; detail?: string }) {
  return <div><p className="m-0 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{eyebrow}</p><h2 className="mb-0 mt-1 text-lg font-black text-slate-950">{title}</h2>{detail && <p className="mb-0 mt-1 text-xs leading-5 text-slate-500">{detail}</p>}</div>;
}

function Kpi({ label, value, detail, icon }: { label: string; value: string | number; detail: string; icon: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="m-0 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p><p className="mb-0 mt-2 text-2xl font-black tracking-tight text-slate-950">{value}</p><p className="mb-0 mt-1 text-xs text-slate-500">{detail}</p></div><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white">{icon}</span></div></div>;
}

function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "green" | "amber" | "red" | "blue" | "violet" }) {
  const cls = { slate: "border-slate-200 bg-slate-50 text-slate-700", green: "border-emerald-200 bg-emerald-50 text-emerald-700", amber: "border-amber-200 bg-amber-50 text-amber-700", red: "border-rose-200 bg-rose-50 text-rose-700", blue: "border-blue-200 bg-blue-50 text-blue-700", violet: "border-violet-200 bg-violet-50 text-violet-700" }[tone];
  return <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-black ${cls}`}>{children}</span>;
}

export default function InteligenciaLicitacoes() {
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const [tab, setTab] = useState<Tab>("executive");
  const [productSearch, setProductSearch] = useState("");
  const [productId, setProductId] = useState<number | null>(() => Number(params?.get("productId")) || null);
  const [quotationId, setQuotationId] = useState<number | null>(() => Number(params?.get("quotationId")) || null);
  const utils = trpc.useUtils();

  const { data: queue = [] } = trpc.dashboard.actionQueue.useQuery();
  const { data: commercial } = trpc.quotationDecision.commercialIntelligence.useQuery();
  const { data: productList } = trpc.products.list.useQuery({ search: productSearch.trim() || undefined, isActive: "yes", limit: 20, offset: 0, sortBy: "name", sortDir: "asc" });
  const { data: selectedProduct } = trpc.products.get.useQuery({ id: productId ?? 0 }, { enabled: productId != null });
  const { data: priceHistory = [] } = trpc.products.priceHistoryByProduct.useQuery({ productId: productId ?? 0, limit: 40 }, { enabled: productId != null });
  const { data: supplierScore = [] } = trpc.quotationDecision.supplierScore.useQuery({ productId: productId ?? 0 }, { enabled: productId != null });
  const { data: equivalents } = trpc.products.suggestEquivalentsByFichaTecnica.useQuery({ productId: productId ?? 0, limit: 20, onlyWithPrice: false }, { enabled: productId != null });
  const { data: duplicates = [] } = trpc.duplicates.detectDuplicates.useQuery({ productId: productId ?? undefined, minSimilarity: 0.78, limit: 200 }, { enabled: productId != null });
  const { data: quotations = [] } = trpc.emailQuotations.list.useQuery(undefined);
  const { data: timeline = [] } = trpc.quotationDecision.timeline.useQuery({ quotationId: quotationId ?? 0 }, { enabled: quotationId != null });
  const { data: smartMargins } = trpc.quotationDecision.smartMargins.useQuery({ quotationId: quotationId ?? 0 }, { enabled: quotationId != null });

  const merge = trpc.duplicates.mergeDuplicates.useMutation({
    onSuccess: async () => { toast.success("Produtos mesclados. O histórico foi preservado."); await Promise.all([utils.duplicates.detectDuplicates.invalidate(), utils.products.list.invalidate()]); },
    onError: (e) => toast.error(e.message),
  });
  const notDuplicate = trpc.duplicates.markAsNotDuplicate.useMutation({
    onSuccess: async () => { toast.success("Par marcado como não duplicado."); await utils.duplicates.detectDuplicates.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const setSale = trpc.emailQuotations.setItemSalePrice.useMutation({
    onSuccess: async () => { toast.success("Preço recomendado aplicado."); await Promise.all([utils.quotationDecision.smartMargins.invalidate(), utils.quotationDecision.summary.invalidate()]); },
    onError: (e) => toast.error(e.message),
  });

  const productRows: any[] = (productList as any)?.items ?? [];
  const historyRows: any[] = priceHistory as any[];
  const supplierRows: any[] = supplierScore as any[];
  const equivalentRows: any[] = (equivalents as any)?.equivalents ?? [];
  const duplicateGroup: any = (duplicates as any[]).find((group) => group.products?.some((p: any) => p.id === productId));

  const priceStats = useMemo(() => {
    const values = historyRows.map((row) => Number(row.price ?? row.preco)).filter((n) => Number.isFinite(n) && n > 0);
    const current = Number((selectedProduct as any)?.price ?? 0) || null;
    const min = values.length ? Math.min(...values) : null;
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    const newest = values[0] ?? current;
    const oldest = values.length > 1 ? values[values.length - 1] : null;
    const trend = newest && oldest ? ((newest - oldest) / oldest) * 100 : null;
    return { current, min, avg, trend };
  }, [historyRows, selectedProduct]);

  const bestSupplier: any = supplierRows[0] ?? null;
  const approvedEquivalents = equivalentRows.filter((row) => row.status === "APROVADO");
  const cheapestEquivalent: any = [...approvedEquivalents].filter((row) => Number(row.price) > 0).sort((a, b) => Number(a.price) - Number(b.price))[0] ?? null;
  const bestTechnical: any = [...equivalentRows].sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0))[0] ?? null;
  const overview: any = (commercial as any)?.overview ?? {};

  const tabs: Array<[Tab, string, React.ReactNode]> = [
    ["executive", "Visão executiva", <TrendingUp size={14} />],
    ["products", "Produtos & compras", <ShoppingCart size={14} />],
    ["quotations", "Cotações", <History size={14} />],
  ];

  return <div className="mx-auto max-w-[1500px] space-y-5 pb-10">
    <section className="relative overflow-hidden rounded-3xl bg-slate-950 p-6 text-white shadow-xl">
      <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div><div className="mb-2 flex flex-wrap gap-2"><Badge tone="blue"><BrainCircuit size={11} className="mr-1" /> Inteligência comercial</Badge><Badge tone="green"><Sparkles size={11} className="mr-1" /> dados reais do S2Licit</Badge></div><h1 className="m-0 text-2xl font-black tracking-tight sm:text-3xl">Decida compra, preço e prioridade em uma única tela</h1><p className="mb-0 mt-2 max-w-3xl text-sm leading-6 text-slate-300">Radar de preços, equivalência técnica, duplicados, fornecedores, margem histórica, timeline e aprendizado das decisões do operador.</p></div>
        <Link href="/agente" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-black text-slate-950 no-underline"><Bot size={15} /> Pergunte ao S2Licit</Link>
      </div>
    </section>

    <div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      {tabs.map(([key, label, icon]) => <button key={key} onClick={() => setTab(key)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black transition ${tab === key ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>{icon}{label}</button>)}
    </div>

    {tab === "executive" && <>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Taxa de vitória" value={`${Number(overview.winRate ?? 0).toFixed(1)}%`} detail={`${Number(overview.decided ?? 0)} cotações decididas`} icon={<Trophy size={17} />} />
        <Kpi label="Margem média" value={`${Number(overview.avgMargin ?? 0).toFixed(1)}%`} detail="margem observada nos itens precificados" icon={<CircleDollarSign size={17} />} />
        <Kpi label="Gap nas perdas" value={overview.avgLossGap == null ? "—" : `${Number(overview.avgLossGap).toFixed(1)}%`} detail="diferença média para o vencedor" icon={<Target size={17} />} />
        <Kpi label="Ações agora" value={queue.length} detail="fila de pendências priorizada" icon={<AlertTriangle size={17} />} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><SectionTitle eyebrow="O que precisa de mim hoje?" title="Fila operacional" detail="Prazo, risco e pendências que merecem ação antes do restante." /><div className="mt-4 grid gap-2 sm:grid-cols-2">{queue.length ? queue.slice(0, 10).map((item: any, index: number) => <Link key={`${item.type}-${index}`} href={item.href === "/propostas-admin" ? "/propostas" : item.href} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 no-underline hover:bg-slate-50"><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${item.priority === "critical" ? "bg-rose-50 text-rose-700" : item.priority === "warning" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>{item.priority === "critical" ? <AlertTriangle size={15} /> : <Clock3 size={15} />}</span><span className="min-w-0 flex-1"><strong className="block text-xs text-slate-900">{item.label}</strong><span className="mt-0.5 block text-[11px] text-slate-500">{item.detail}</span></span><ArrowRight size={14} className="text-slate-300" /></Link>) : <div className="col-span-full rounded-xl bg-emerald-50 p-5 text-center text-sm font-bold text-emerald-800">Nenhuma pendência crítica.</div>}</div></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><SectionTitle eyebrow="Radar de manutenção" title="Preços que merecem atualização" detail="Produtos recorrentes priorizados por uso e histórico de vitória." /><div className="mt-4 space-y-2">{((commercial as any)?.priorityPriceUpdates ?? []).slice(0, 8).map((row: any) => <button key={row.productId} onClick={() => { setProductId(row.productId); setProductSearch(row.name); setTab("products"); }} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"><RefreshCw size={15} className="text-amber-600" /><span className="min-w-0 flex-1"><strong className="block truncate text-xs text-slate-900">{row.name}</strong><span className="text-[10px] text-slate-500">{row.uses} usos · {row.wins} vitórias · {row.daysOld == null ? "idade desconhecida" : `${row.daysOld} dias`}</span></span><Badge tone={row.freshness === "stale" ? "red" : "amber"}>{row.freshness}</Badge></button>)}</div></div>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {[[(commercial as any)?.topProducts ?? [], "Produtos que mais vencem", "Produto"], [(commercial as any)?.topSuppliers ?? [], "Fornecedores de melhor histórico", "Fornecedor"], [(commercial as any)?.categories ?? [], "Categorias mais relevantes", "Categoria"]].map(([rows, title, kind]: any) => <div key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><SectionTitle eyebrow={kind} title={title} /><div className="mt-4 space-y-2">{rows.slice(0, 7).map((row: any, index: number) => <div key={row.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[10px] font-black text-slate-500">#{index + 1}</span><span className="min-w-0 flex-1"><strong className="block truncate text-xs text-slate-900">{row.name}</strong><span className="text-[10px] text-slate-500">{row.uses} usos · {row.wins} vitórias</span></span><span className="text-xs font-black text-slate-900">{Number(row.winRate ?? 0).toFixed(0)}%</span></div>)}</div></div>)}
      </section>
    </>}

    {tab === "products" && <>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 lg:flex-row lg:items-end"><div className="flex-1"><SectionTitle eyebrow="Produto mestre" title="Radar de preços e assistente de compra" detail="Selecione um produto; ele se torna o mestre da análise e o sistema cruza histórico, fornecedores, equivalentes e duplicados." /><div className="relative mt-4"><Search size={15} className="absolute left-3 top-3 text-slate-400" /><input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Buscar produto, marca, princípio ativo..." className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-400" /></div></div><Link href="/produtos" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-700 no-underline"><Boxes size={14} /> Abrir catálogo</Link></div><div className="mt-3 flex gap-2 overflow-x-auto pb-1">{productRows.map((p: any) => <button key={p.id} onClick={() => setProductId(p.id)} className={`min-w-[220px] rounded-xl border p-3 text-left ${productId === p.id ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}><strong className="block line-clamp-2 text-xs text-slate-900">{p.name}</strong><span className="mt-1 block text-[10px] text-slate-500">{p.manufacturer ?? "Fabricante não informado"} · {money(p.price)}</span></button>)}</div></section>

      {productId && <>
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"><Kpi label="Preço atual" value={money(priceStats.current)} detail={(selectedProduct as any)?.manufacturer ?? "produto mestre"} icon={<Package size={17} />} /><Kpi label="Menor histórico" value={money(priceStats.min)} detail={`${historyRows.length} registro(s) de preço`} icon={<ArrowDown size={17} />} /><Kpi label="Preço médio" value={money(priceStats.avg)} detail="média do histórico disponível" icon={<CircleDollarSign size={17} />} /><Kpi label="Tendência" value={priceStats.trend == null ? "—" : `${priceStats.trend >= 0 ? "+" : ""}${priceStats.trend.toFixed(1)}%`} detail="primeiro x último preço registrado" icon={priceStats.trend != null && priceStats.trend > 0 ? <ArrowUp size={17} /> : <ArrowDown size={17} />} /></section>

        <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><SectionTitle eyebrow="Radar de preços" title="Fontes e histórico" detail="Sem inventar preço: apenas fontes já sincronizadas e histórico do catálogo." /><div className="mt-4 space-y-2">{supplierRows.slice(0, 6).map((row: any) => <div key={`${row.supplierId}-${row.offerId}`} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 text-[10px] font-black text-white">#{row.rank}</span><span className="min-w-0 flex-1"><strong className="block text-xs text-slate-900">{row.supplierName ?? `Fornecedor ${row.supplierId}`}</strong><span className="mt-0.5 block text-[10px] text-slate-500">Score {Number(row.finalScore ?? row.score ?? 0).toFixed(0)}/100 · confiabilidade {Number(row.reliability ?? 0).toFixed(0)}%</span></span><strong className="text-sm text-slate-950">{money(row.landedCost ?? row.effectivePrice)}</strong></div><div className="mt-2 flex flex-wrap gap-1.5"><Badge tone={row.freshness === "fresh" ? "green" : row.freshness === "stale" ? "red" : "amber"}>{row.freshness}</Badge><Badge>{row.availability ?? "estoque não informado"}</Badge><Badge tone="violet">{Number(row.winRate ?? 0).toFixed(0)}% vitórias</Badge>{row.link && <a href={row.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-black text-blue-700 no-underline"><ExternalLink size={10} /> fonte</a>}</div></div>)}{!supplierRows.length && <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500">Nenhuma oferta sincronizada para este produto.</div>}</div></div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><SectionTitle eyebrow="Assistente de compra" title="Melhores caminhos" detail="Compara custo, qualidade do fornecedor e equivalência técnica." /><div className="mt-4 grid gap-3">{bestSupplier && <div className="rounded-xl bg-emerald-50 p-4"><div className="flex items-center gap-2 text-xs font-black text-emerald-900"><CheckCircle2 size={15} /> Melhor fornecedor do produto mestre</div><p className="mb-0 mt-2 text-sm font-black text-emerald-950">{bestSupplier.supplierName ?? `Fornecedor ${bestSupplier.supplierId}`} · {money(bestSupplier.landedCost ?? bestSupplier.effectivePrice)}</p><p className="mb-0 mt-1 text-[11px] text-emerald-700">Score final {Number(bestSupplier.finalScore ?? 0).toFixed(0)}/100 · preferência do operador {Number(bestSupplier.operatorPreference ?? 0).toFixed(0)}%</p></div>}{bestTechnical && <div className="rounded-xl bg-blue-50 p-4"><div className="flex items-center gap-2 text-xs font-black text-blue-900"><BrainCircuit size={15} /> Melhor equivalente técnico</div><p className="mb-0 mt-2 text-sm font-black text-blue-950">{bestTechnical.name}</p><p className="mb-0 mt-1 text-[11px] text-blue-700">Compatibilidade {Number(bestTechnical.score ?? 0).toFixed(0)}% · {money(bestTechnical.price)}</p></div>}{cheapestEquivalent && <div className="rounded-xl bg-violet-50 p-4"><div className="flex items-center gap-2 text-xs font-black text-violet-900"><ShoppingCart size={15} /> Equivalente aprovado de menor preço</div><p className="mb-0 mt-2 text-sm font-black text-violet-950">{cheapestEquivalent.name} · {money(cheapestEquivalent.price)}</p><p className="mb-0 mt-1 text-[11px] text-violet-700">{cheapestEquivalent.supplierName ?? "Fornecedor não informado"} · compatibilidade {Number(cheapestEquivalent.score ?? 0).toFixed(0)}%</p></div>}</div></div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><SectionTitle eyebrow="Produto mestre + equivalentes" title={(selectedProduct as any)?.name ?? "Produto selecionado"} detail="Equivalência técnica considera princípio ativo, concentração e apresentação; divergências críticas permanecem sinalizadas." /><div className="mt-4 grid gap-2 sm:grid-cols-2">{equivalentRows.slice(0, 12).map((row: any) => <button key={row.id} onClick={() => setProductId(row.id)} className="rounded-xl border border-slate-200 p-3 text-left hover:border-blue-300 hover:bg-blue-50/30"><div className="flex items-start justify-between gap-2"><strong className="line-clamp-2 text-xs text-slate-900">{row.name}</strong><Badge tone={row.status === "APROVADO" ? "green" : row.status === "DIVERGENTE" ? "red" : "amber"}>{row.score}%</Badge></div><p className="mb-0 mt-2 text-[10px] text-slate-500">{row.manufacturer ?? "Fabricante não informado"} · {money(row.price)}</p></button>)}{!equivalentRows.length && <div className="col-span-full rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500">A ficha técnica ainda não encontrou equivalentes confiáveis.</div>}</div></div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><SectionTitle eyebrow="Qualidade do catálogo" title="Possíveis duplicados" detail="Mescle somente quando os registros forem realmente o mesmo produto; caso contrário, ensine o sistema a mantê-los separados." /><div className="mt-4 space-y-2">{duplicateGroup?.products?.filter((p: any) => p.id !== productId).map((p: any) => <div key={p.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3"><strong className="block text-xs text-amber-950">{p.name}</strong><p className="mb-2 mt-1 text-[10px] text-amber-700">Similaridade {Math.round(Number(p.similarity ?? duplicateGroup.similarity ?? 0) * 100)}% · {p.manufacturer ?? "fabricante não informado"}</p><div className="flex gap-2"><button disabled={merge.isPending} onClick={() => merge.mutate({ primaryProductId: productId, secondaryProductId: p.id })} className="inline-flex items-center gap-1 rounded-lg bg-slate-950 px-2.5 py-1.5 text-[10px] font-black text-white"><GitMerge size={11} /> Mesclar no mestre</button><button disabled={notDuplicate.isPending} onClick={() => notDuplicate.mutate({ productId1: productId, productId2: p.id })} className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-[10px] font-black text-amber-800"><XCircle size={11} /> Manter separados</button></div></div>)}{!duplicateGroup && <div className="rounded-xl bg-emerald-50 p-4 text-xs font-bold text-emerald-800">Nenhum duplicado relevante detectado para o produto mestre.</div>}</div></div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><SectionTitle eyebrow="Histórico" title="Evolução dos preços" /><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead><tr className="border-b border-slate-200 text-[10px] uppercase text-slate-400"><th className="px-2 py-2">Data</th><th className="px-2 py-2">Preço</th><th className="px-2 py-2">Frete</th><th className="px-2 py-2">Tributos</th><th className="px-2 py-2">Fornecedor</th><th className="px-2 py-2">Origem</th></tr></thead><tbody>{historyRows.slice(0, 20).map((row: any, index: number) => <tr key={row.id ?? index} className="border-b border-slate-100"><td className="px-2 py-2 text-slate-500">{dateTime(row.recordedAt ?? row.createdAt)}</td><td className="px-2 py-2 font-black text-slate-900">{money(row.price ?? row.preco)}</td><td className="px-2 py-2">{money(row.freightValue)}</td><td className="px-2 py-2">{money(row.taxValue)}</td><td className="px-2 py-2">{row.supplierName ?? row.supplierId ?? "—"}</td><td className="px-2 py-2">{row.source ?? row.origem ?? "histórico"}</td></tr>)}</tbody></table></div></section>
      </>}
    </>}

    {tab === "quotations" && <>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 lg:flex-row lg:items-end"><div className="flex-1"><SectionTitle eyebrow="Cotação" title="Timeline e margem inteligente" detail="Acompanhe onde a cotação parou e use o histórico de vitórias para formar uma faixa de preço, sempre mantendo revisão humana." /></div><select value={quotationId ?? ""} onChange={(e) => setQuotationId(e.target.value ? Number(e.target.value) : null)} className="min-w-[320px] rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">Selecione uma cotação</option>{(quotations as any[]).map((q: any) => <option key={q.id} value={q.id}>#{q.id} · {q.orgao ?? q.fromName ?? "Sem órgão"} · {q.subject ?? "Cotação"}</option>)}</select></div></section>
      {quotationId && <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><SectionTitle eyebrow="Linha do tempo" title="Do recebimento ao resultado" /><div className="mt-5 space-y-0">{(timeline as any[]).map((event: any, index: number) => <div key={event.key} className="relative flex gap-3 pb-5"><div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-4 border-white bg-slate-950 text-white">{event.status === "warning" ? <AlertTriangle size={12} /> : event.status === "current" ? <Clock3 size={12} /> : <CheckCircle2 size={12} />}</div>{index < (timeline as any[]).length - 1 && <div className="absolute left-[15px] top-7 h-full w-px bg-slate-200" />}<div className="min-w-0 flex-1 pt-0.5"><div className="flex flex-wrap items-center gap-2"><strong className="text-xs text-slate-900">{event.title}</strong><Badge tone={event.status === "warning" ? "red" : event.status === "current" ? "amber" : event.status === "future" ? "blue" : "green"}>{event.status}</Badge></div><p className="mb-0 mt-1 text-[11px] leading-5 text-slate-500">{event.detail}</p><p className="mb-0 mt-1 text-[10px] text-slate-400">{dateTime(event.at)}</p></div></div>)}</div></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><SectionTitle eyebrow="Margem inteligente" title="Faixa recomendada por item" detail="Prioriza a mediana das margens vencedoras do mesmo produto; sem histórico, respeita a margem mínima de proteção." /><div className="mt-4 space-y-2">{((smartMargins as any)?.items ?? []).map((item: any) => <div key={item.itemId} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start"><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-1.5"><Badge tone={item.risk === "green" ? "green" : item.risk === "red" ? "red" : "amber"}>{item.risk}</Badge><Badge>{item.winningSamples} amostra(s) vencedoras</Badge></div><strong className="mt-2 block text-sm text-slate-950">{item.productName ?? item.description}</strong><p className="mb-0 mt-1 text-[11px] text-slate-500">Custo {money(item.currentCost)} · margem atual {item.currentMarginPercent == null ? "—" : `${Number(item.currentMarginPercent).toFixed(1)}%`} · mínimo {Number(item.minMarginPercent).toFixed(1)}%</p><p className="mb-0 mt-2 text-[10px] leading-5 text-slate-500">{(item.rationale ?? []).join(" ")}</p></div><div className="min-w-[190px] rounded-xl bg-slate-950 p-3 text-white"><span className="block text-[9px] font-black uppercase text-slate-400">Preço recomendado</span><strong className="mt-1 block text-xl">{money(item.recommendedSale)}</strong><span className="mt-1 block text-[10px] text-slate-300">Faixa {money(item.lowSale)} – {money(item.highSale)} · margem {Number(item.recommendedMarginPercent).toFixed(1)}%</span>{item.recommendedSale != null && <button onClick={() => setSale.mutate({ itemId: item.itemId, salePrice: Number(item.recommendedSale) })} disabled={setSale.isPending} className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-lg bg-white px-2 py-1.5 text-[10px] font-black text-slate-950"><WandSparkles size={11} /> Aplicar recomendado</button>}</div></div></div>)}</div></div>
      </section>}
    </>}
  </div>;
}
