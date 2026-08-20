import { formatBRL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  Bot,
  Boxes,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Filter,
  Grid2X2,
  Image as ImageIcon,
  LayoutList,
  Loader2,
  Package,
  Pencil,
  RefreshCw,
  Search,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

const PAGE_SIZE = 48;

const QUALITY_FIELDS = [
  ["name", "Nome"],
  ["categoryId", "Categoria"],
  ["manufacturer", "Fabricante"],
  ["activeIngredient", "Composição"],
  ["concentration", "Concentração"],
  ["presentation", "Apresentação"],
  ["unit", "Unidade"],
  ["fichaTecnica", "Ficha técnica"],
  ["imageUrl", "Imagem"],
  ["price", "Preço"],
] as const;

function hasValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "" && value !== "0.00";
  return true;
}

function productQuality(product: any) {
  const missing = QUALITY_FIELDS.filter(([key]) => !hasValue(product[key])).map(([, label]) => label);
  const filled = QUALITY_FIELDS.length - missing.length;
  const pct = Math.round((filled / QUALITY_FIELDS.length) * 100);
  return { missing, filled, pct };
}

function QualityPill({ product }: { product: any }) {
  const quality = productQuality(product);
  const style = quality.pct >= 80
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : quality.pct >= 55
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-rose-50 text-rose-700 border-rose-200";
  return (
    <span title={quality.missing.length ? `Faltando: ${quality.missing.join(", ")}` : "Cadastro completo"} className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-black ${style}`}>
      {quality.pct >= 80 ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
      {quality.pct}% completo
    </span>
  );
}

function AiBadge({ product }: { product: any }) {
  const enriched = product.statusConfiabilidade === "enriquecido_ia" || hasValue(product.fichaTecnica);
  return enriched ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-700"><Bot size={11} /> IA enriquecido</span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500"><Bot size={11} /> IA pendente</span>
  );
}

function ProductImage({ product, large = false }: { product: any; large?: boolean }) {
  const [error, setError] = useState(false);
  const size = large ? "h-56 w-full" : "h-32 w-full";
  if (!product.imageUrl || error) {
    return <div className={`${size} flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 text-slate-300`}><Package size={large ? 48 : 30} /></div>;
  }
  return <img src={product.imageUrl} alt={product.name} onError={() => setError(true)} className={`${size} object-contain bg-white p-3`} loading="lazy" />;
}

function JobBanner({ label, status }: { label: string; status: any }) {
  const progress = status?.progresso ?? {};
  const processed = Number(progress.processed ?? 0);
  const total = Number(progress.total ?? 0);
  const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-white"><Loader2 size={18} className="animate-spin" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-black text-violet-950">{label}</div>
            <div className="text-xs font-black text-violet-700">{pct}%</div>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-violet-100"><div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${pct}%` }} /></div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 text-[10px] font-semibold text-violet-700">
            <span>{processed}/{total || "—"} processados</span>
            <span>{Number(progress.updated ?? 0)} atualizados</span>
            <span>{Number(progress.errors ?? 0)} erros</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditProductModal({
  product,
  categories,
  suppliers,
  onClose,
}: {
  product: any;
  categories: any[];
  suppliers: any[];
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    name: product.name ?? "",
    code: product.code ?? "",
    manufacturer: product.manufacturer ?? "",
    activeIngredient: product.activeIngredient ?? "",
    concentration: product.concentration ?? "",
    presentation: product.presentation ?? "",
    unit: product.unit ?? "",
    description: product.description ?? "",
    fichaTecnica: product.fichaTecnica ?? "",
    price: product.price ?? "",
    stock: product.stock ?? "",
    barcode: product.barcode ?? product.ean ?? product.gtin ?? "",
    imageUrl: product.imageUrl ?? "",
    productUrl: product.productUrl ?? "",
    categoryId: String(product.categoryId ?? ""),
    supplierId: String(product.supplierId ?? ""),
  });

  const update = trpc.products.update.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.products.list.invalidate(), utils.dashboard.catalogHealth.invalidate(), utils.enrichment.getEnrichmentStats.invalidate()]);
      toast.success("Produto atualizado.");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate({
      id: product.id,
      name: form.name,
      code: form.code || null,
      manufacturer: form.manufacturer || null,
      activeIngredient: form.activeIngredient || null,
      concentration: form.concentration || null,
      presentation: form.presentation || null,
      unit: form.unit || null,
      description: form.description || null,
      fichaTecnica: form.fichaTecnica || null,
      price: form.price || null,
      stock: form.stock || null,
      barcode: form.barcode || null,
      imageUrl: form.imageUrl || null,
      productUrl: form.productUrl || null,
      categoryId: form.categoryId ? Number(form.categoryId) : undefined,
      supplierId: form.supplierId ? Number(form.supplierId) : undefined,
    });
  };

  const field = (key: keyof typeof form, label: string, placeholder = "") => (
    <label className="block">
      <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</span>
      <input value={form[key]} onChange={(e) => setForm((old) => ({ ...old, [key]: e.target.value }))} placeholder={placeholder} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm">
      <div className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-slate-50 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.14em] text-blue-700">Editar produto</div>
            <div className="mt-0.5 max-w-[70vw] truncate text-lg font-black text-slate-950">{product.name}</div>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-100"><X size={17} /></button>
        </div>
        <form onSubmit={submit} className="grid gap-5 p-5 lg:grid-cols-[260px_1fr]">
          <div className="space-y-3">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><ProductImage product={{ ...product, imageUrl: form.imageUrl }} large /></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3"><QualityPill product={{ ...product, ...form, categoryId: form.categoryId }} /><p className="mb-0 mt-2 text-[11px] leading-5 text-slate-500">A IA funciona melhor com nome específico, fabricante e apresentação corretos.</p></div>
          </div>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">{field("name", "Nome do produto")}</div>
              {field("code", "Código interno")}
              {field("barcode", "EAN / código de barras")}
              {field("manufacturer", "Fabricante / laboratório")}
              {field("activeIngredient", "Princípio ativo / composição")}
              {field("concentration", "Concentração / dimensão")}
              {field("presentation", "Apresentação")}
              {field("unit", "Unidade")}
              {field("price", "Preço de aquisição")}
              {field("stock", "Estoque")}
              <label className="block">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Categoria</span>
                <select value={form.categoryId} onChange={(e) => setForm((old) => ({ ...old, categoryId: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400">
                  <option value="">Sem categoria</option>
                  {categories.map((category: any) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Fornecedor principal</span>
                <select value={form.supplierId} onChange={(e) => setForm((old) => ({ ...old, supplierId: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400">
                  <option value="">Sem fornecedor</option>
                  {suppliers.map((supplier: any) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                </select>
              </label>
              <div className="sm:col-span-2">{field("imageUrl", "URL da imagem")}</div>
              <div className="sm:col-span-2">{field("productUrl", "Página do produto / fonte")}</div>
            </div>
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Descrição comercial</span>
              <textarea value={form.description} onChange={(e) => setForm((old) => ({ ...old, description: e.target.value }))} rows={3} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Ficha técnica</span>
              <textarea value={form.fichaTecnica} onChange={(e) => setForm((old) => ({ ...old, fichaTecnica: e.target.value }))} rows={5} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400" />
            </label>
            <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
              <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">Cancelar</button>
              <button disabled={update.isPending} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white hover:bg-blue-800 disabled:opacity-50">{update.isPending && <Loader2 size={14} className="animate-spin" />} Salvar alterações</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ProdutosModern() {
  const utils = trpc.useUtils();
  const initialIncomplete = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("incompletos") === "1";
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [incompleteOnly, setIncompleteOnly] = useState(initialIncomplete);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<any | null>(null);
  const [aiBusyId, setAiBusyId] = useState<number | null>(null);
  const [jobId, setJobId] = useState<number | null>(null);
  const [jobLabel, setJobLabel] = useState("");

  const { data: categories = [] } = trpc.categories.list.useQuery();
  const { data: suppliers = [] } = trpc.suppliers.list.useQuery({ activeOnly: true });
  const { data: health } = trpc.dashboard.catalogHealth.useQuery();
  const { data: enrichmentStats } = trpc.enrichment.getEnrichmentStats.useQuery();

  const listInput: any = {
    search: search.trim() || undefined,
    categoryId: categoryId ? Number(categoryId) : undefined,
    incomplete: incompleteOnly || undefined,
    isActive: "yes",
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    sortBy: "name",
    sortDir: "asc",
  };
  const { data: result, isLoading, isFetching } = trpc.products.list.useQuery(listInput);
  const products: any[] = (result as any)?.items ?? [];
  const total = Number((result as any)?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const categoryMap = useMemo(() => new Map(categories.map((item: any) => [item.id, item.name])), [categories]);
  const supplierMap = useMemo(() => new Map(suppliers.map((item: any) => [item.id, item.name])), [suppliers]);
  const selectedProducts = products.filter((product) => selected.has(product.id));
  const allVisibleSelected = products.length > 0 && products.every((product) => selected.has(product.id));

  const suggestFields = trpc.enrichment.suggestFields.useMutation();
  const suggestCategory = trpc.categories.suggest.useMutation();
  const updateProduct = trpc.products.update.useMutation();
  const enrichFicha = trpc.enrichment.enrichFichaTecnica.useMutation();
  const classifyJob = trpc.enrichment.bulkReclassifyStartJob.useMutation();
  const fichaJob = trpc.enrichment.enrichFichaTecnicaStartJob.useMutation();
  const { data: jobStatus } = trpc.enrichment.aiJobStatus.useQuery(
    { jobId: jobId ?? 0 },
    { enabled: jobId !== null, refetchInterval: 1500 },
  );

  useEffect(() => {
    if (!jobId || !jobStatus) return;
    const status = String(jobStatus.status ?? "").toLowerCase();
    if (["completed", "concluido", "concluído", "success", "done"].includes(status)) {
      const updated = Number(jobStatus.progresso?.updated ?? 0);
      toast.success(`${jobLabel} concluído. ${updated} produto(s) atualizados.`);
      setJobId(null);
      setSelected(new Set());
      Promise.all([
        utils.products.list.invalidate(),
        utils.dashboard.catalogHealth.invalidate(),
        utils.enrichment.getEnrichmentStats.invalidate(),
      ]);
    } else if (["failed", "erro", "error", "cancelled"].includes(status)) {
      toast.error(`${jobLabel} não foi concluído.`, { description: jobStatus.errorMessages?.[0] });
      setJobId(null);
    }
  }, [jobId, jobLabel, jobStatus, utils]);

  useEffect(() => { setPage(1); }, [search, categoryId, incompleteOnly]);

  const refreshCatalog = async () => {
    await Promise.all([
      utils.products.list.invalidate(),
      utils.dashboard.catalogHealth.invalidate(),
      utils.enrichment.getEnrichmentStats.invalidate(),
    ]);
  };

  const completeWithAi = async (product: any) => {
    setAiBusyId(product.id);
    try {
      const categoryName = product.categoryId ? String(categoryMap.get(product.categoryId) ?? "") : undefined;
      const [fieldRaw, categoryRaw] = await Promise.all([
        suggestFields.mutateAsync({ name: product.name, categoryName }),
        product.categoryId ? Promise.resolve(null) : suggestCategory.mutateAsync({ productNames: [product.name] }),
      ]);
      const fields: any = fieldRaw as any;
      if (fields?.error) throw new Error(fields.error);
      const cat: any = (categoryRaw as any)?.results?.[0];
      const patch: any = { id: product.id };
      const applied: string[] = [];
      const mappings = [
        ["activeIngredient", "Princípio ativo"],
        ["concentration", "Concentração"],
        ["presentation", "Apresentação"],
        ["unit", "Unidade"],
        ["manufacturer", "Fabricante"],
        ["description", "Descrição"],
      ] as const;
      for (const [key, label] of mappings) {
        if (!hasValue(product[key]) && hasValue(fields?.[key])) {
          patch[key] = String(fields[key]).trim();
          applied.push(label);
        }
      }
      if (!product.categoryId && cat?.categoryId && Number(cat.confidence ?? 0) >= 0.55) {
        patch.categoryId = Number(cat.categoryId);
        applied.push(`Categoria: ${cat.categoryName}`);
      }
      if (Object.keys(patch).length > 1) await updateProduct.mutateAsync(patch);
      let fichaUpdated = false;
      if (!hasValue(product.fichaTecnica)) {
        const fichaResult = await enrichFicha.mutateAsync({ scope: "selected", productIds: [product.id], overwrite: false, offset: 0, pageSize: 1 });
        fichaUpdated = Number(fichaResult.updated ?? 0) > 0;
        if (fichaUpdated) applied.push("Ficha técnica");
      }
      await refreshCatalog();
      const fieldConfidence = Math.round(Number(fields?.confidence ?? 0) * 100);
      const categoryConfidence = cat ? Math.round(Number(cat.confidence ?? 0) * 100) : null;
      toast.success(applied.length ? `IA completou ${applied.length} informação(ões).` : "Nenhum campo faltante pôde ser completado com segurança.", {
        description: `Confiança dos dados: ${fieldConfidence}%${categoryConfidence !== null ? ` · categoria: ${categoryConfidence}%` : ""}${fichaUpdated ? " · ficha técnica atualizada" : ""}`,
      });
    } catch (error) {
      toast.error("A IA não conseguiu completar este produto.", { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setAiBusyId(null);
    }
  };

  const startClassify = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return toast.error("Selecione produtos para classificar.");
    try {
      const result = await classifyJob.mutateAsync({ productIds: ids, includeAlreadyCategorized: false });
      setJobId(result.jobId);
      setJobLabel("Classificação por IA");
      toast.success("Classificação iniciada em segundo plano.");
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  };

  const startFicha = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return toast.error("Selecione produtos para enriquecer.");
    try {
      const result = await fichaJob.mutateAsync({ scope: "selected", productIds: ids, overwrite: false });
      setJobId(result.jobId);
      setJobLabel("Enriquecimento de ficha técnica");
      toast.success("Enriquecimento iniciado em segundo plano.");
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  };

  const toggleSelect = (id: number) => setSelected((old) => {
    const next = new Set(old);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const selectVisible = () => setSelected((old) => {
    const next = new Set(old);
    if (allVisibleSelected) products.forEach((product) => next.delete(product.id));
    else products.forEach((product) => next.add(product.id));
    return next;
  });

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 pb-10">
      <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 p-5 text-white shadow-xl sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/20 bg-violet-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-violet-200"><Bot size={12} /> Catálogo inteligente</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[10px] font-bold text-slate-300">{Number(health?.total ?? total)} produtos ativos</span>
            </div>
            <h1 className="m-0 text-2xl font-black tracking-tight sm:text-3xl">Produtos claros, comparáveis e prontos para cotar.</h1>
            <p className="mb-0 mt-2 max-w-3xl text-sm leading-6 text-slate-300">A IA classifica, completa ficha técnica, fabricante, composição, concentração e apresentação sem sobrescrever seus dados preenchidos por padrão.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Link href="/importar" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-xs font-black text-slate-950 no-underline hover:bg-blue-50"><Package size={15} /> Importar produtos</Link>
            <Link href="/produtos-legado" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-xs font-black text-white no-underline hover:bg-white/10"><LayoutList size={15} /> Ferramentas avançadas</Link>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
        <button onClick={() => setIncompleteOnly(false)} className={`rounded-2xl border p-3 text-left transition ${!incompleteOnly ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total</div><div className="mt-1 text-xl font-black text-slate-950">{Number(health?.total ?? total)}</div>
        </button>
        <button onClick={() => setIncompleteOnly(true)} className={`rounded-2xl border p-3 text-left transition ${incompleteOnly ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Sem ficha</div><div className="mt-1 text-xl font-black text-amber-700">{Number(health?.withoutFichaTecnica ?? 0)}</div>
        </button>
        <div className="rounded-2xl border border-slate-200 bg-white p-3"><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Sem categoria</div><div className="mt-1 text-xl font-black text-rose-700">{Number(health?.withoutCategory ?? 0)}</div></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3"><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Sem fabricante</div><div className="mt-1 text-xl font-black text-slate-950">{Number(health?.withoutManufacturer ?? 0)}</div></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3"><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Sem imagem</div><div className="mt-1 text-xl font-black text-slate-950">{Number(health?.withoutImage ?? 0)}</div></div>
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-3"><div className="text-[10px] font-black uppercase tracking-wider text-violet-500">IA enriquecido</div><div className="mt-1 text-xl font-black text-violet-800">{Math.round(Number(enrichmentStats?.percentualEnriquecido ?? 0))}%</div></div>
      </section>

      {jobId && <JobBanner label={jobLabel} status={jobStatus} />}

      <section className="sticky top-0 z-20 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative min-w-0 flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por produto, código, composição, fabricante, EAN..." className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Filter size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="max-w-[220px] rounded-xl border border-slate-200 bg-white py-2.5 pl-8 pr-8 text-xs font-bold text-slate-700 outline-none">
                <option value="">Todas as categorias</option>
                {categories.map((category: any) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </div>
            <button onClick={() => setIncompleteOnly((v) => !v)} className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold ${incompleteOnly ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}><AlertTriangle size={14} /> Incompletos</button>
            <button onClick={refreshCatalog} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50" title="Atualizar"><RefreshCw size={15} className={isFetching ? "animate-spin" : ""} /></button>
            <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white">
              <button onClick={() => setView("grid")} className={`flex h-9 w-9 items-center justify-center ${view === "grid" ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-50"}`} title="Cards"><Grid2X2 size={15} /></button>
              <button onClick={() => setView("list")} className={`flex h-9 w-9 items-center justify-center ${view === "list" ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-50"}`} title="Lista"><LayoutList size={15} /></button>
            </div>
          </div>
        </div>
        {selected.size > 0 && (
          <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center">
            <span className="text-xs font-black text-slate-900">{selected.size} selecionado(s)</span>
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <button disabled={Boolean(jobId)} onClick={startClassify} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-3 py-2 text-xs font-black text-white hover:bg-blue-800 disabled:opacity-50"><Bot size={14} /> Classificar com IA</button>
              <button disabled={Boolean(jobId)} onClick={startFicha} className="inline-flex items-center gap-1.5 rounded-xl bg-violet-700 px-3 py-2 text-xs font-black text-white hover:bg-violet-800 disabled:opacity-50"><WandSparkles size={14} /> Completar fichas</button>
              <button onClick={() => setSelected(new Set())} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Limpar seleção</button>
            </div>
          </div>
        )}
      </section>

      <div className="flex items-center justify-between gap-3 px-1">
        <button onClick={selectVisible} className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-950"><span className={`flex h-4 w-4 items-center justify-center rounded border ${allVisibleSelected ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 bg-white"}`}>{allVisibleSelected && <Check size={11} />}</span>{allVisibleSelected ? "Desmarcar página" : "Selecionar página"}</button>
        <span className="text-xs text-slate-400">{total} resultado(s)</span>
      </div>

      {isLoading ? (
        <div className="flex min-h-[300px] items-center justify-center"><Loader2 className="animate-spin text-blue-700" size={28} /></div>
      ) : products.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white py-16 text-center"><Boxes className="mx-auto text-slate-300" size={40} /><h3 className="mb-0 mt-3 text-lg font-black text-slate-800">Nenhum produto encontrado</h3><p className="mb-0 mt-1 text-sm text-slate-500">Ajuste os filtros ou importe novos produtos.</p></div>
      ) : view === "grid" ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {products.map((product) => {
            const checked = selected.has(product.id);
            const category = categoryMap.get(product.categoryId) as string | undefined;
            const supplier = supplierMap.get(product.supplierId) as string | undefined;
            const aiBusy = aiBusyId === product.id;
            return (
              <article key={product.id} className={`group overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${checked ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-200"}`}>
                <div className="relative border-b border-slate-100">
                  <ProductImage product={product} />
                  <button onClick={() => toggleSelect(product.id)} className={`absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg border shadow-sm ${checked ? "border-blue-700 bg-blue-700 text-white" : "border-slate-200 bg-white/95 text-transparent hover:text-slate-300"}`}><Check size={14} /></button>
                  {product.productUrl && <a href={product.productUrl} target="_blank" rel="noreferrer" className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white/95 text-slate-500 shadow-sm hover:text-blue-700"><ExternalLink size={13} /></a>}
                </div>
                <div className="p-4">
                  <div className="mb-2 flex flex-wrap gap-1.5"><QualityPill product={product} /><AiBadge product={product} /></div>
                  <h3 className="m-0 line-clamp-2 min-h-[40px] text-sm font-black leading-5 text-slate-950" title={product.name}>{product.name}</h3>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold text-slate-500">
                    {category && <span className="rounded-md bg-blue-50 px-1.5 py-1 text-blue-700">{category}</span>}
                    {product.subcategoria && <span className="rounded-md bg-slate-100 px-1.5 py-1">{product.subcategoria}</span>}
                    {product.manufacturer && <span className="rounded-md bg-slate-100 px-1.5 py-1">{product.manufacturer}</span>}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2.5">
                    <div><div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Composição</div><div className="mt-0.5 truncate text-[11px] font-bold text-slate-700" title={product.activeIngredient || ""}>{product.activeIngredient || "—"}</div></div>
                    <div><div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Apresentação</div><div className="mt-0.5 truncate text-[11px] font-bold text-slate-700" title={product.presentation || ""}>{[product.concentration, product.presentation].filter(Boolean).join(" · ") || "—"}</div></div>
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Custo</div><div className="mt-0.5 text-lg font-black text-slate-950">{product.price ? formatBRL(Number(product.price)) : "—"}</div><div className="truncate text-[10px] text-slate-400">{supplier || "Fornecedor não definido"}</div></div>
                    <div className="flex gap-1.5">
                      <button onClick={() => setEditing(product)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50" title="Editar"><Pencil size={14} /></button>
                      <button disabled={aiBusy || aiBusyId !== null} onClick={() => completeWithAi(product)} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-violet-700 px-2.5 text-[10px] font-black text-white hover:bg-violet-800 disabled:opacity-50" title="Preencher somente campos faltantes com IA">{aiBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} IA</button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] border-collapse text-left">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-[0.1em] text-slate-400"><tr><th className="w-12 px-4 py-3"></th><th className="px-3 py-3">Produto</th><th className="px-3 py-3">Categoria</th><th className="px-3 py-3">Dados técnicos</th><th className="px-3 py-3">Fornecedor</th><th className="px-3 py-3 text-right">Custo</th><th className="px-3 py-3">Qualidade</th><th className="w-36 px-3 py-3"></th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((product) => {
                  const checked = selected.has(product.id);
                  const aiBusy = aiBusyId === product.id;
                  return <tr key={product.id} className={checked ? "bg-blue-50/50" : "hover:bg-slate-50/60"}>
                    <td className="px-4 py-3"><button onClick={() => toggleSelect(product.id)} className={`flex h-5 w-5 items-center justify-center rounded border ${checked ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 bg-white text-transparent"}`}><Check size={11} /></button></td>
                    <td className="px-3 py-3"><div className="flex items-center gap-3"><div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-slate-100"><ProductImage product={product} /></div><div className="min-w-0"><div className="max-w-[300px] truncate text-xs font-black text-slate-950" title={product.name}>{product.name}</div><div className="mt-1 text-[10px] text-slate-400">#{product.id} {product.code ? `· ${product.code}` : ""}</div></div></div></td>
                    <td className="px-3 py-3"><div className="max-w-[170px] truncate text-xs font-bold text-slate-700">{String(categoryMap.get(product.categoryId) ?? "Sem categoria")}</div><div className="mt-0.5 text-[10px] text-slate-400">{product.subcategoria || "—"}</div></td>
                    <td className="px-3 py-3"><div className="max-w-[230px] truncate text-xs font-bold text-slate-700">{product.activeIngredient || product.fichaTecnica || "—"}</div><div className="mt-0.5 max-w-[230px] truncate text-[10px] text-slate-400">{[product.concentration, product.presentation, product.manufacturer].filter(Boolean).join(" · ") || "Dados técnicos pendentes"}</div></td>
                    <td className="px-3 py-3 text-xs font-semibold text-slate-600">{String(supplierMap.get(product.supplierId) ?? "—")}</td>
                    <td className="px-3 py-3 text-right text-xs font-black text-slate-950">{product.price ? formatBRL(Number(product.price)) : "—"}</td>
                    <td className="px-3 py-3"><QualityPill product={product} /></td>
                    <td className="px-3 py-3"><div className="flex justify-end gap-1.5"><button onClick={() => setEditing(product)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><Pencil size={13} /></button><button disabled={aiBusy || aiBusyId !== null} onClick={() => completeWithAi(product)} className="inline-flex h-8 items-center gap-1 rounded-lg bg-violet-700 px-2 text-[10px] font-black text-white disabled:opacity-50">{aiBusy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} IA</button></div></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row">
        <div className="text-xs text-slate-500">Página <strong className="text-slate-900">{page}</strong> de <strong className="text-slate-900">{pages}</strong> · {total} produtos</div>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft size={14} /> Anterior</button>
          <button disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Próxima <ChevronRight size={14} /></button>
        </div>
      </div>

      {editing && <EditProductModal product={editing} categories={categories as any[]} suppliers={suppliers as any[]} onClose={() => setEditing(null)} />}
    </div>
  );
}
