import { useAuth } from "@/_core/hooks/useAuth";
import { hasMinimumRole } from "@/lib/access";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronRight,
  Database,
  FileUp,
  Filter,
  GitMerge,
  History,
  Image,
  Loader2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Tags,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

type Tab = "catalogo" | "precos" | "qualidade" | "importar";
type Quality = "all" | "incomplete" | "without_offer" | "stale_price" | "without_image";
type DetailTab = "identificacao" | "tecnico" | "ofertas" | "historico";

function money(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateTime(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR");
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

const INPUT = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:bg-white";
const LABEL = "mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500";

function normalizeForCompare(value: unknown) {
  return value == null || value === "" ? null : value;
}

function ProductDrawer({
  productId,
  canEdit,
  onClose,
  onChanged,
}: {
  productId: number;
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<DetailTab>("identificacao");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [offer, setOffer] = useState({ supplierId: "", price: "", supplierCode: "", link: "" });
  const detail = trpc.catalog.detail.useQuery({ productId });
  const categories = trpc.categories.list.useQuery();
  const suppliers = trpc.suppliers.list.useQuery({ activeOnly: true });
  const utils = trpc.useUtils();

  const product = detail.data?.product as any;
  useEffect(() => {
    if (!product) return;
    setForm({
      name: product.name ?? "",
      code: product.code ?? "",
      manufacturer: product.manufacturer ?? "",
      categoryId: product.categoryId ?? "",
      barcode: product.barcode ?? "",
      gtin: product.gtin ?? "",
      ean: product.ean ?? "",
      mapa: product.mapa ?? "",
      catmatCode: product.catmatCode ?? "",
      catmasCode: product.catmasCode ?? "",
      ncm: product.ncm ?? "",
      activeIngredient: product.activeIngredient ?? "",
      concentration: product.concentration ?? "",
      pharmaceuticalForm: product.pharmaceuticalForm ?? "",
      presentation: product.presentation ?? "",
      unit: product.unit ?? "",
      especieAnimal: product.especieAnimal ?? "",
      viaAdministracao: product.viaAdministracao ?? "",
      classeTerapeutica: product.classeTerapeutica ?? "",
      subcategoria: product.subcategoria ?? "",
      fichaTecnica: product.fichaTecnica ?? "",
      description: product.description ?? "",
      imageUrl: product.imageUrl ?? "",
      productUrl: product.productUrl ?? "",
    });
  }, [productId, product?.updatedAt]);

  const update = trpc.catalog.update.useMutation({
    onSuccess: async () => {
      toast.success("Produto atualizado.");
      setEditing(false);
      await Promise.all([detail.refetch(), utils.catalog.list.invalidate(), utils.catalog.qualitySummary.invalidate()]);
      onChanged();
    },
    onError: (error) => toast.error(error.message),
  });
  const saveOffer = trpc.catalog.saveOffer.useMutation({
    onSuccess: async () => {
      toast.success("Oferta salva e histórico atualizado.");
      setOffer({ supplierId: "", price: "", supplierCode: "", link: "" });
      await Promise.all([detail.refetch(), utils.catalog.list.invalidate(), utils.catalog.qualitySummary.invalidate()]);
      onChanged();
    },
    onError: (error) => toast.error(error.message),
  });

  const set = (key: string, value: any) => setForm((current) => ({ ...current, [key]: value }));
  const dirtyPatch = () => {
    if (!product) return {};
    const patch: Record<string, any> = {};
    for (const [key, value] of Object.entries(form)) {
      const normalized = key === "categoryId" ? (value ? Number(value) : null) : normalizeForCompare(value);
      if (normalizeForCompare((product as any)[key]) !== normalized) patch[key] = normalized;
    }
    return patch;
  };
  const submitEdit = () => {
    const patch = dirtyPatch();
    if (!Object.keys(patch).length) {
      setEditing(false);
      toast.info("Nenhuma alteração para salvar.");
      return;
    }
    update.mutate({ productId, patch: patch as any });
  };

  const renderInput = (key: string, label: string, placeholder?: string) => (
    <div><label className={LABEL}>{label}</label><input disabled={!editing} value={form[key] ?? ""} onChange={(e) => set(key, e.target.value)} placeholder={placeholder} className={`${INPUT} disabled:bg-white disabled:text-slate-700`} /></div>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 p-5">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-700">Produto canônico #{productId}</div>
            <h2 className="mt-1 truncate text-xl font-black text-slate-950">{product?.name ?? "Carregando..."}</h2>
            <div className="mt-1 text-xs text-slate-500">{product?.manufacturer ?? "Sem fabricante"} · {detail.data?.offers?.length ?? 0} oferta(s)</div>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/equivalencias?productId=${productId}`} className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-900 no-underline">Buscar equivalentes</Link>
            {canEdit && <button onClick={() => setEditing((value) => !value)} className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" title="Editar"><Pencil size={15} /></button>}
            <button onClick={onClose} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><X size={16} /></button>
          </div>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-4 pt-2">
          {([
            ["identificacao", "Identificação"],
            ["tecnico", "Dados técnicos"],
            ["ofertas", "Ofertas"],
            ["historico", "Histórico"],
          ] as const).map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`rounded-t-lg px-4 py-2.5 text-xs font-bold ${tab === key ? "bg-blue-50 text-blue-950" : "text-slate-500"}`}>{label}</button>)}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {detail.isLoading && <div className="flex justify-center py-16"><Loader2 className="animate-spin text-blue-700" /></div>}

          {product && tab === "identificacao" && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">{renderInput("name", "Nome do produto")}</div>
              {renderInput("code", "Código interno")}
              {renderInput("manufacturer", "Fabricante / laboratório")}
              <div><label className={LABEL}>Categoria</label><select disabled={!editing} value={form.categoryId ?? ""} onChange={(e) => set("categoryId", e.target.value)} className={`${INPUT} disabled:bg-white`}><option value="">Sem categoria</option>{categories.data?.map((category: any) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
              {renderInput("subcategoria", "Subcategoria")}
              {renderInput("ean", "EAN")}
              {renderInput("gtin", "GTIN")}
              {renderInput("barcode", "Código de barras")}
              {renderInput("mapa", "Registro MAPA / ANVISA")}
              {renderInput("catmatCode", "CATMAT")}
              {renderInput("catmasCode", "CATMAS")}
              {renderInput("ncm", "NCM")}
              {renderInput("imageUrl", "URL da imagem")}
              {renderInput("productUrl", "URL de referência")}
              <div className="md:col-span-2"><label className={LABEL}>Descrição</label><textarea disabled={!editing} value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={4} className={`${INPUT} resize-y disabled:bg-white`} /></div>
            </div>
          )}

          {product && tab === "tecnico" && (
            <div className="grid gap-4 md:grid-cols-2">
              {renderInput("activeIngredient", "Princípio ativo / composição")}
              {renderInput("concentration", "Concentração")}
              {renderInput("pharmaceuticalForm", "Forma farmacêutica")}
              {renderInput("presentation", "Apresentação")}
              {renderInput("unit", "Unidade")}
              {renderInput("especieAnimal", "Espécie-alvo")}
              {renderInput("viaAdministracao", "Via de administração")}
              {renderInput("classeTerapeutica", "Classe terapêutica")}
              <div className="md:col-span-2"><label className={LABEL}>Ficha técnica</label><textarea disabled={!editing} value={form.fichaTecnica ?? ""} onChange={(e) => set("fichaTecnica", e.target.value)} rows={10} className={`${INPUT} resize-y font-mono text-xs disabled:bg-white`} /></div>
            </div>
          )}

          {product && tab === "ofertas" && (
            <div className="space-y-4">
              {canEdit && (
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                  <div className="mb-3 text-xs font-black text-blue-950">Adicionar ou atualizar oferta</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div><label className={LABEL}>Fornecedor</label><select value={offer.supplierId} onChange={(e) => setOffer((current) => ({ ...current, supplierId: e.target.value }))} className={INPUT}><option value="">Selecione...</option>{suppliers.data?.map((supplier: any) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></div>
                    <div><label className={LABEL}>Preço</label><input type="number" step="0.01" value={offer.price} onChange={(e) => setOffer((current) => ({ ...current, price: e.target.value }))} className={INPUT} /></div>
                    <div><label className={LABEL}>Código no fornecedor</label><input value={offer.supplierCode} onChange={(e) => setOffer((current) => ({ ...current, supplierCode: e.target.value }))} className={INPUT} /></div>
                    <div><label className={LABEL}>Link</label><input value={offer.link} onChange={(e) => setOffer((current) => ({ ...current, link: e.target.value }))} className={INPUT} /></div>
                  </div>
                  <button disabled={!offer.supplierId || saveOffer.isPending} onClick={() => saveOffer.mutate({ productId, supplierId: Number(offer.supplierId), price: offer.price || null, supplierCode: offer.supplierCode || undefined, link: offer.link || undefined, origin: "catalog_drawer" })} className="mt-3 flex items-center gap-2 rounded-xl bg-blue-950 px-4 py-2 text-xs font-black text-white disabled:opacity-40">{saveOffer.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Salvar oferta</button>
                </div>
              )}

              <div className="space-y-2">
                {(detail.data?.offers ?? []).map((row: any) => {
                  const best = detail.data?.bestOffer?.id === row.id;
                  return <div key={row.id} className={`rounded-2xl border p-4 ${best ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><span className="text-sm font-black text-slate-900">{row.supplierName ?? `Fornecedor #${row.supplierId}`}</span>{best && <span className="rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-black uppercase text-emerald-800">Melhor custo</span>}</div><div className="mt-1 text-[10px] text-slate-500">Código: {row.codigoFornecedor ?? "—"} · atualizado {dateTime(row.updatedAt)}</div></div><div className="text-right"><div className="text-lg font-black text-slate-950">{money(row.effectivePrice)}</div>{row.promoPrice && <div className="text-[10px] text-emerald-700">Promocional</div>}</div></div></div>;
                })}
                {(detail.data?.offers?.length ?? 0) === 0 && <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">Nenhuma oferta vinculada.</div>}
              </div>
            </div>
          )}

          {product && tab === "historico" && (
            <div className="grid gap-5 lg:grid-cols-2">
              <div><div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900"><History size={15} /> Histórico de preço</div><div className="space-y-2">{(detail.data?.priceHistory ?? []).map((row: any) => <div key={row.id} className="rounded-xl border border-slate-200 p-3"><div className="flex justify-between gap-3"><span className="font-bold text-slate-800">{money(row.price)}</span><span className="text-[10px] text-slate-400">{dateTime(row.recordedAt)}</span></div><div className="mt-1 text-[10px] text-slate-500">Fornecedor #{row.supplierId ?? "—"} · {row.origem ?? "histórico"}</div></div>)}{(detail.data?.priceHistory?.length ?? 0) === 0 && <div className="text-xs text-slate-400">Sem histórico.</div>}</div></div>
              <div><div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900"><CheckCircle2 size={15} /> Proveniência</div><div className="space-y-2">{(detail.data?.provenance ?? []).map((row: any) => <div key={row.id} className="rounded-xl border border-slate-200 p-3"><div className="font-bold text-slate-800">{row.fieldName}</div><div className="mt-1 text-[10px] text-slate-500">{row.sourceType} · confiança {row.confidence ?? "—"}% · {dateTime(row.createdAt)}</div></div>)}{(detail.data?.provenance?.length ?? 0) === 0 && <div className="text-xs text-slate-400">Sem proveniência registrada ainda.</div>}</div></div>
            </div>
          )}
        </div>

        {editing && canEdit && (
          <div className="flex justify-end gap-2 border-t border-slate-200 p-4"><button onClick={() => { setEditing(false); detail.refetch(); }} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600">Cancelar</button><button onClick={submitEdit} disabled={update.isPending} className="flex items-center gap-2 rounded-xl bg-blue-950 px-5 py-2 text-xs font-black text-white disabled:opacity-50">{update.isPending && <Loader2 size={13} className="animate-spin" />} Salvar alterações</button></div>
        )}
      </aside>
    </div>
  );
}

function NewProductModal({ onClose, onCreated }: { onClose: () => void; onCreated: (productId: number) => void }) {
  const [form, setForm] = useState({ name: "", categoryId: "", supplierId: "", initialPrice: "", activeIngredient: "", concentration: "", presentation: "", manufacturer: "" });
  const categories = trpc.categories.list.useQuery();
  const suppliers = trpc.suppliers.list.useQuery({ activeOnly: true });
  const create = trpc.catalog.create.useMutation({
    onSuccess: (result) => { toast.success("Produto canônico criado."); onCreated(result.productId); },
    onError: (error) => toast.error(error.message),
  });
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = () => {
    if (!form.name.trim()) return toast.error("Informe o nome do produto.");
    if (form.initialPrice && !form.supplierId) return toast.error("Para informar preço inicial, selecione um fornecedor.");
    create.mutate({
      name: form.name.trim(),
      categoryId: form.categoryId ? Number(form.categoryId) : null,
      supplierId: form.supplierId ? Number(form.supplierId) : null,
      initialPrice: form.initialPrice || null,
      activeIngredient: form.activeIngredient || null,
      concentration: form.concentration || null,
      presentation: form.presentation || null,
      manufacturer: form.manufacturer || null,
    });
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-slate-200 p-5"><div><div className="text-[10px] font-black uppercase tracking-wider text-blue-700">Cadastro canônico</div><h2 className="mt-1 text-xl font-black text-slate-950">Novo produto</h2></div><button onClick={onClose} className="rounded-xl border border-slate-200 p-2"><X size={16} /></button></div><div className="grid gap-4 p-5 md:grid-cols-2"><div className="md:col-span-2"><label className={LABEL}>Nome *</label><input value={form.name} onChange={(e) => set("name", e.target.value)} className={INPUT} /></div><div><label className={LABEL}>Categoria</label><select value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)} className={INPUT}><option value="">Sem categoria</option>{categories.data?.map((row: any) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div><div><label className={LABEL}>Fornecedor inicial (opcional)</label><select value={form.supplierId} onChange={(e) => set("supplierId", e.target.value)} className={INPUT}><option value="">Nenhum — produto independente</option>{suppliers.data?.map((row: any) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div><div><label className={LABEL}>Preço inicial</label><input type="number" step="0.01" value={form.initialPrice} onChange={(e) => set("initialPrice", e.target.value)} className={INPUT} /></div><div><label className={LABEL}>Fabricante</label><input value={form.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} className={INPUT} /></div><div><label className={LABEL}>Princípio ativo / composição</label><input value={form.activeIngredient} onChange={(e) => set("activeIngredient", e.target.value)} className={INPUT} /></div><div><label className={LABEL}>Concentração</label><input value={form.concentration} onChange={(e) => set("concentration", e.target.value)} className={INPUT} /></div><div className="md:col-span-2"><label className={LABEL}>Apresentação</label><input value={form.presentation} onChange={(e) => set("presentation", e.target.value)} className={INPUT} /></div></div><div className="flex justify-end gap-2 border-t border-slate-200 p-4"><button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold">Cancelar</button><button onClick={submit} disabled={create.isPending} className="flex items-center gap-2 rounded-xl bg-blue-950 px-5 py-2 text-xs font-black text-white disabled:opacity-50">{create.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Criar produto</button></div></div></div>;
}

export default function CentralProdutos() {
  const { user } = useAuth();
  const canEdit = hasMinimumRole(user?.role, "editor");
  const [tab, setTab] = useState<Tab>(() => {
    const value = new URLSearchParams(window.location.search).get("tab");
    return value === "precos" || value === "qualidade" || value === "importar" ? value : "catalogo";
  });
  const [search, setSearch] = useState("");
  const [quality, setQuality] = useState<Quality>("all");
  const [offset, setOffset] = useState(0);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const limit = 50;

  const listInput = useMemo(() => ({ search: search.trim() || undefined, quality, limit, offset, sort: "name" as const, sortDir: "asc" as const }), [search, quality, offset]);
  const catalog = trpc.catalog.list.useQuery(listInput, { placeholderData: (previous) => previous });
  const summary = trpc.catalog.qualitySummary.useQuery(undefined, { refetchInterval: 60_000 });
  const duplicateStats = trpc.duplicates.getDuplicateStats.useQuery(undefined, { enabled: tab === "qualidade" });
  const mergeHistory = trpc.duplicates.mergeHistory.useQuery({ limit: 10 }, { enabled: tab === "qualidade" });
  const utils = trpc.useUtils();
  const undoMerge = trpc.duplicates.undoMerge.useMutation({
    onSuccess: async (result) => {
      toast.success(`${result.restoredProducts} produto(s) restaurado(s).`);
      await Promise.all([mergeHistory.refetch(), duplicateStats.refetch(), utils.catalog.list.invalidate(), utils.catalog.qualitySummary.invalidate()]);
    },
    onError: (error) => toast.error(error.message),
  });
  const total = catalog.data?.total ?? 0;
  const items = catalog.data?.items ?? [];

  const refresh = async () => { await Promise.all([catalog.refetch(), summary.refetch()]); };
  const changeTab = (next: Tab) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "catalogo") url.searchParams.delete("tab"); else url.searchParams.set("tab", next);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  };
  const applyQuality = (next: Quality) => { setQuality(next); setOffset(0); setTab("catalogo"); };

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-5 border-b border-slate-200 bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 p-6 text-white lg:flex-row lg:items-end lg:justify-between">
          <div><div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-blue-200"><Database size={14} /> Catálogo canônico</div><h1 className="m-0 text-3xl font-black tracking-tight">Central de Produtos</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Produto mestre independente de fornecedor, ofertas versionadas, qualidade e proveniência em uma única central. O menor custo atual vem das ofertas canônicas.</p></div>
          <div className="flex flex-wrap gap-2">{canEdit && <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-black text-blue-950"><Plus size={14} /> Novo produto</button>}<Link href="/equivalencias" className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold text-white no-underline hover:bg-white/15">Compêndio de equivalências</Link><Link href="/produtos/legado" className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold text-white no-underline hover:bg-white/15">Ferramentas legadas</Link></div>
        </div>
        <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-4 pt-3">{([["catalogo", "Catálogo", Package], ["precos", "Ofertas e preços", Building2], ["qualidade", "Qualidade", Sparkles], ["importar", "Importar", FileUp]] as const).map(([key, label, Icon]) => <button key={key} onClick={() => changeTab(key)} className={`flex items-center gap-2 whitespace-nowrap rounded-t-xl px-4 py-3 text-xs font-bold ${tab === key ? "bg-blue-50 text-blue-950" : "text-slate-500 hover:bg-slate-50"}`}><Icon size={15} /> {label}</button>)}</div>
      </section>

      {tab === "catalogo" && <><section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"><Metric label="Produtos ativos" value={summary.data?.total ?? 0} hint="Catálogo operacional" onClick={() => applyQuality("all")} /><Metric label="Incompletos" value={summary.data?.incomplete ?? 0} hint="Dados técnicos pendentes" onClick={() => applyQuality("incomplete")} /><Metric label="Sem oferta" value={summary.data?.withoutOffer ?? 0} hint="Sem preço canônico" onClick={() => applyQuality("without_offer")} /><Metric label="Preço vencido" value={summary.data?.stalePrice ?? 0} hint="Oferta > 48 horas" onClick={() => applyQuality("stale_price")} /><Metric label="Sem imagem" value={summary.data?.withoutImage ?? 0} hint="Cobertura visual" onClick={() => applyQuality("without_image")} /><Metric label="Validados" value={summary.data?.withValidatedTechnicalData ?? 0} hint="Ficha técnica validada" /></section><section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center"><div className="relative flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => { setSearch(e.target.value); setOffset(0); }} placeholder="Nome, princípio ativo, fabricante, EAN, MAPA, CATMAT ou CATMAS" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:bg-white" /></div><div className="flex items-center gap-2"><Filter size={14} className="text-slate-400" /><select value={quality} onChange={(e) => { setQuality(e.target.value as Quality); setOffset(0); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700"><option value="all">Todos</option><option value="incomplete">Incompletos</option><option value="without_offer">Sem oferta</option><option value="stale_price">Preço vencido</option><option value="without_image">Sem imagem</option></select><button onClick={() => void refresh()} className="rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50"><RefreshCw size={15} /></button></div></div><div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500"><tr><th className="px-4 py-3">Produto</th><th className="px-4 py-3">Classificação</th><th className="px-4 py-3">Identidade</th><th className="px-4 py-3 text-right">Melhor custo</th><th className="px-4 py-3">Ofertas</th><th className="px-4 py-3">Qualidade</th></tr></thead><tbody>{items.map((item: any) => <tr key={item.id} onClick={() => setSelectedProductId(item.id)} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50/70"><td className="px-4 py-3"><div className="flex items-center gap-3">{item.imageUrl ? <img src={item.imageUrl} alt="" className="h-10 w-10 rounded-lg border border-slate-100 object-contain" /> : <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100"><Package size={15} className="text-slate-400" /></div>}<div className="min-w-0"><div className="max-w-md truncate font-bold text-slate-900">{item.name}</div><div className="mt-0.5 text-[10px] text-slate-500">#{item.id}{item.manufacturer ? ` · ${item.manufacturer}` : ""}</div></div></div></td><td className="px-4 py-3"><div className="font-semibold text-slate-700">{item.categoryName ?? "Sem categoria"}</div><div className="text-[10px] text-slate-400">{item.subcategoria ?? "—"}</div></td><td className="px-4 py-3"><div className="max-w-xs truncate font-medium text-slate-700">{item.activeIngredient ?? "—"}</div><div className="text-[10px] text-slate-400">{[item.concentration, item.presentation].filter(Boolean).join(" · ") || "Dados técnicos pendentes"}</div></td><td className="px-4 py-3 text-right"><div className="font-black text-slate-950">{money(item.bestPrice)}</div><div className={`text-[10px] ${item.priceSource === "supplier_offer" ? "text-emerald-600" : item.priceSource === "legacy_product_price" ? "text-amber-600" : "text-slate-400"}`}>{item.priceSource === "supplier_offer" ? item.bestOffer?.supplierName ?? "Oferta canônica" : item.priceSource === "legacy_product_price" ? "Preço legado" : "Sem preço"}</div></td><td className="px-4 py-3"><span className="rounded-full bg-blue-50 px-2 py-1 font-bold text-blue-800">{item.offerCount}</span></td><td className="px-4 py-3">{item.needsReview ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 font-bold text-amber-700"><AlertTriangle size={10} /> Revisar</span> : <span className="rounded-full bg-emerald-50 px-2 py-1 font-bold text-emerald-700">Completo</span>}</td></tr>)}</tbody></table>{!catalog.isLoading && items.length === 0 && <div className="p-10 text-center text-sm text-slate-500">Nenhum produto encontrado.</div>}</div><div className="flex items-center justify-between border-t border-slate-200 p-4 text-xs text-slate-500"><span>{total.toLocaleString("pt-BR")} produtos</span><div className="flex gap-2"><button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))} className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold disabled:opacity-40">Anterior</button><button disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold disabled:opacity-40">Próxima</button></div></div></section></>}

      {tab === "precos" && <section className="grid gap-4 lg:grid-cols-3"><div className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2"><h2 className="m-0 text-lg font-black text-slate-900">Fonte única de custo</h2><p className="mt-2 text-sm leading-6 text-slate-600">O fluxo canônico usa <strong>product_supplier_offers</strong>. Alterações registram histórico e o menor preço é espelhado temporariamente no campo legado para os consumidores antigos.</p><button onClick={() => changeTab("catalogo")} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-blue-950 px-4 py-2 text-xs font-bold text-white">Abrir catálogo <ChevronRight size={14} /></button></div><div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><div className="text-xs font-black uppercase tracking-wider text-emerald-800">Manutenção autônoma</div><p className="mt-2 text-sm text-emerald-900">Reconciliação local periódica mantém writers legados e ofertas canônicas consistentes sem cron externo.</p></div></section>}

      {tab === "qualidade" && <div className="space-y-4"><section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"><button onClick={() => applyQuality("incomplete")} className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm"><Sparkles className="text-blue-700" /><h3 className="mb-1 mt-4 text-sm font-black text-slate-900">Dados técnicos</h3><p className="m-0 text-xs leading-5 text-slate-500">Filtrar incompletos.</p></button><Link href="/imagens" className="rounded-2xl border border-slate-200 bg-white p-5 no-underline shadow-sm"><Image className="text-blue-700" /><h3 className="mb-1 mt-4 text-sm font-black text-slate-900">Imagens</h3><p className="m-0 text-xs leading-5 text-slate-500">Vinculação e revisão visual.</p></Link><Link href="/reclassificacao" className="rounded-2xl border border-slate-200 bg-white p-5 no-underline shadow-sm"><Tags className="text-blue-700" /><h3 className="mb-1 mt-4 text-sm font-black text-slate-900">Reclassificação</h3><p className="m-0 text-xs leading-5 text-slate-500">Classificação assistida.</p></Link><Link href="/enriquecimento" className="rounded-2xl border border-slate-200 bg-white p-5 no-underline shadow-sm"><Sparkles className="text-blue-700" /><h3 className="mb-1 mt-4 text-sm font-black text-slate-900">Enriquecimento IA</h3><p className="m-0 text-xs leading-5 text-slate-500">Completar ficha técnica.</p></Link><Link href="/produtos/legado" className="rounded-2xl border border-slate-200 bg-white p-5 no-underline shadow-sm"><GitMerge className="text-blue-700" /><h3 className="mb-1 mt-4 text-sm font-black text-slate-900">Duplicados</h3><p className="m-0 text-xs leading-5 text-slate-500">{duplicateStats.data?.totalDuplicateGroups ?? 0} grupo(s) detectado(s).</p></Link></section><section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 p-4"><h2 className="m-0 text-sm font-black text-slate-900">Histórico de merges reversíveis</h2><p className="mb-0 mt-1 text-xs text-slate-500">Consolidações ficam auditadas e podem ser restauradas sem acesso direto ao banco.</p></div><div className="divide-y divide-slate-100">{(mergeHistory.data ?? []).map((event: any) => <div key={event.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"><div><div className="text-xs font-black text-slate-900">Merge #{event.id} → produto mestre #{event.masterProductId}</div><div className="mt-1 text-[10px] text-slate-500">Duplicados: {Array.isArray(event.duplicateProductIds) ? event.duplicateProductIds.join(", ") : String(event.duplicateProductIds ?? "—")} · {dateTime(event.createdAt)}</div></div><div className="flex items-center gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-black ${event.status === "applied" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>{event.status === "applied" ? "Aplicado" : "Desfeito"}</span>{canEdit && event.status === "applied" && <button disabled={undoMerge.isPending} onClick={() => { if (window.confirm(`Desfazer o merge #${event.id}?`)) undoMerge.mutate({ eventId: Number(event.id) }); }} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-bold text-slate-700"><RotateCcw size={11} /> Desfazer</button>}</div></div>)}{!mergeHistory.isLoading && (mergeHistory.data?.length ?? 0) === 0 && <div className="p-6 text-center text-xs text-slate-400">Nenhum merge registrado.</div>}</div></section></div>}

      {tab === "importar" && <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><Link href="/importar" className="rounded-2xl border border-slate-200 bg-white p-5 no-underline shadow-sm"><FileUp className="text-blue-700" /><h3 className="mb-1 mt-4 text-sm font-black text-slate-900">Planilha / CSV</h3><p className="m-0 text-xs leading-5 text-slate-500">Importação com identidade canônica e revisão.</p></Link><Link href="/importar-nfe" className="rounded-2xl border border-slate-200 bg-white p-5 no-underline shadow-sm"><FileUp className="text-blue-700" /><h3 className="mb-1 mt-4 text-sm font-black text-slate-900">NF-e</h3><p className="m-0 text-xs leading-5 text-slate-500">Captura itens e ofertas sem duplicar produto.</p></Link><Link href="/categorias" className="rounded-2xl border border-slate-200 bg-white p-5 no-underline shadow-sm"><Tags className="text-blue-700" /><h3 className="mb-1 mt-4 text-sm font-black text-slate-900">Categorias</h3><p className="m-0 text-xs leading-5 text-slate-500">Taxonomia do catálogo.</p></Link></section>}

      {selectedProductId != null && <ProductDrawer productId={selectedProductId} canEdit={canEdit} onClose={() => setSelectedProductId(null)} onChanged={() => void refresh()} />}
      {showCreate && <NewProductModal onClose={() => setShowCreate(false)} onCreated={(productId) => { setShowCreate(false); setSelectedProductId(productId); void refresh(); }} />}
    </div>
  );
}
