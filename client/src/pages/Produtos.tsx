import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  Download,
  Edit2,
  FileSpreadsheet,
  Upload,
  ExternalLink,
  Filter,
  GitMerge,
  Image as ImageIcon,
  Layers,
  LayoutList,
  Loader2,
  Minus,
  Package,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Square,
  Trash2,
  X,
  FlaskConical,
  Brain,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

// ─── Score de Qualidade do Produto ──────────────────────────────────────────
const QUALITY_FIELDS: { key: string; label: string }[] = [
  { key: "name", label: "Produto" },
  { key: "activeIngredient", label: "Princípio Ativo / Composição" },
  { key: "concentration", label: "Concentração" },
  { key: "presentation", label: "Apresentação" },
  { key: "manufacturer", label: "Fabricante / Laboratório" },
  { key: "unit", label: "Unidade" },
  { key: "imageUrl", label: "URL da Imagem" },
  { key: "barcode", label: "EAN / GTIN / Código de Barras" },
];

function calcQualityScore(p: Record<string, unknown>): { score: number; total: number; missing: string[] } {
  const missing: string[] = [];
  let score = 0;
  for (const f of QUALITY_FIELDS) {
    const val = p[f.key];
    if (val && String(val).trim() !== "") {
      score++;
    } else {
      missing.push(f.label);
    }
  }
  return { score, total: QUALITY_FIELDS.length, missing };
}

function QualityBadge({ product }: { product: Record<string, unknown> }) {
  const { score, total, missing } = calcQualityScore(product);
  const pct = score / total;
  const color = pct >= 0.86 ? "#16a34a" : pct >= 0.57 ? "#d97706" : "#dc2626";
  const bgColor = pct >= 0.86 ? "#f0fdf4" : pct >= 0.57 ? "#fffbeb" : "#fef2f2";
  const title = missing.length === 0
    ? "✅ Produto completo!"
    : `Faltando: ${missing.join(", ")}`;
  return (
    <div title={title} className="flex items-center gap-0.5 cursor-help">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="rounded-full flex-shrink-0"
          style={{ width: 5, height: 5, backgroundColor: i < score ? color : "#e5e7eb" }}
        />
      ))}
      <span
        className="ml-1 text-[9px] font-bold px-1 py-0.5 rounded-sm"
        style={{ backgroundColor: bgColor, color }}
      >
        {score}/{total}
      </span>
    </div>
  );
}

type SortField = "name" | "price" | "mapa" | "manufacturer" | "createdAt";
type SortDir = "asc" | "desc";
type SearchField = "all" | "name" | "code" | "activeIngredient" | "manufacturer" | "barcode" | "concentration" | "presentation";

const SEARCH_FIELD_LABELS: Record<SearchField, string> = {
  all: "Todos os campos",
  name: "Nome do produto",
  code: "Código interno",
  activeIngredient: "Princípio ativo",
  manufacturer: "Fabricante",
  barcode: "Código de barras (EAN)",
  concentration: "Concentração",
  presentation: "Apresentação",
};

// ─── Price History Section ───────────────────────────────────────────────────
function PriceHistorySection({ productId, suppliers }: { productId: number; suppliers: any[] }) {
  const { data: history } = trpc.products.priceHistoryByProduct.useQuery({ productId });
  const [expanded, setExpanded] = useState(false);
  if (!history || history.length === 0) return null;
  const shown = expanded ? history : history.slice(0, 5);
  return (
    <div className="mt-6 pt-4 border-t border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400">Histórico de Preços</div>
        {history.length > 5 && (
          <button type="button" onClick={() => setExpanded(e => !e)} className="text-[10px] text-blue-600 hover:underline">
            {expanded ? "Ver menos" : `Ver todos (${history.length})`}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-2 py-1 text-gray-500 font-semibold border-b border-gray-200">Data</th>
              <th className="text-left px-2 py-1 text-gray-500 font-semibold border-b border-gray-200">Fornecedor</th>
              <th className="text-right px-2 py-1 text-gray-500 font-semibold border-b border-gray-200">Preço Anterior</th>
              <th className="text-right px-2 py-1 text-gray-500 font-semibold border-b border-gray-200">Preço Novo</th>
              <th className="text-left px-2 py-1 text-gray-500 font-semibold border-b border-gray-200">Origem</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((h: any, i: number) => {
              const sup = suppliers.find((s: any) => s.id === h.supplierId);
              const prev = h.precoAnterior ? parseFloat(h.precoAnterior) : null;
              const curr = h.precoNovo ? parseFloat(h.precoNovo) : (h.price ? parseFloat(h.price) : null);
              const changed = prev !== null && curr !== null && prev !== curr;
              return (
                <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-2 py-1 text-gray-500">{h.recordedAt ? new Date(h.recordedAt).toLocaleDateString('pt-BR') : '-'}</td>
                  <td className="px-2 py-1 text-gray-700">{sup?.name ?? `#${h.supplierId}`}</td>
                  <td className="px-2 py-1 text-right text-gray-400">{prev !== null ? `R$ ${prev.toFixed(2)}` : '-'}</td>
                  <td className={`px-2 py-1 text-right font-semibold ${changed ? (curr! > prev! ? 'text-red-600' : 'text-green-600') : 'text-gray-700'}`}>
                    {curr !== null ? `R$ ${curr.toFixed(2)}` : '-'}
                    {changed && <span className="ml-1">{curr! > prev! ? '↑' : '↓'}</span>}
                  </td>
                  <td className="px-2 py-1 text-gray-400">{h.origem ?? 'manual'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function EditModal({
  product,
  categories,
  suppliers,
  onClose,
  onSaved,
}: {
  product: any;
  categories: any[];
  suppliers: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    code: product.code ?? "",
    name: product.name ?? "",
    description: product.description ?? "",
    activeIngredient: product.activeIngredient ?? "",
    manufacturer: product.manufacturer ?? "",
    unit: product.unit ?? "",
    concentration: product.concentration ?? "",
    presentation: product.presentation ?? "",
    pharmaceuticalForm: product.pharmaceuticalForm ?? "",
    price: product.price ?? "",
    priceUnit: product.priceUnit ?? "",
    stock: product.stock ?? "",
    barcode: product.barcode ?? "",
    gtin: (product as any).gtin ?? "",
    codigoFornecedor: (product as any).codigoFornecedor ?? "",
    informacaoTecnica: (product as any).informacaoTecnica ?? "",
    fichaTecnica: (product as any).fichaTecnica ?? "",
    subcategoria: (product as any).subcategoria ?? "",
    mapa: product.mapa ?? "",
    freightValue: product.freightValue ?? "",
    taxValue: product.taxValue ?? "",
    imageUrl: product.imageUrl ?? "",
    productUrl: product.productUrl ?? "",
    isActive: product.isActive ?? "yes",
    supplierId: String(product.supplierId ?? ""),
    categoryId: String(product.categoryId ?? ""),
    registroRegulatorio: (product as any).registroRegulatorio ?? "",
    ean: (product as any).ean ?? (product as any).gtin ?? product.barcode ?? "",
  });
  const [imgError, setImgError] = useState(false);
  // Preços por fornecedor
  const { data: supplierPrices, refetch: refetchPrices } = trpc.products.getSupplierPrices.useQuery({ productId: product.id });
  const upsertPriceMutation = trpc.products.upsertSupplierPrice.useMutation({ onSuccess: () => refetchPrices() });
  const deletePriceMutation = trpc.products.deleteSupplierPrice.useMutation({ onSuccess: () => refetchPrices() });
  const [editingPrice, setEditingPrice] = useState<{ supplierId: number; value: string } | null>(null);

  const utils = trpc.useUtils();
  const updateProduct = trpc.products.update.useMutation({
    onSuccess: () => {
      utils.products.list.invalidate();
      toast.success("Produto atualizado com sucesso!");
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });

  const set = (field: string, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (field === "imageUrl") setImgError(false);
  };
  // (Bloco de "extração de atributos via IA" removido: dependia de um
  // router equivalencia.getAttributes/extractAttributes que nunca existiu
  // no backend. O enriquecimento real de ficha técnica está logo abaixo.)
  // Estado para sugestão de ficha técnica via IA (extractFichaTecnica individual)
  const [fichaIaSugestao, setFichaIaSugestao] = useState<string | null>(null);
  const extractFichaMutation = trpc.enrichment.extractFichaTecnica.useMutation({
    onSuccess: (res: { fichaTecnica: string }) => setFichaIaSugestao(res.fichaTecnica),
    onError: (e: any) => toast.error("IA: " + e.message),
  });
  const enrichSingleMutation = trpc.enrichment.enrichFichaTecnica.useMutation({
    onSuccess: (res) => {
      if (res.updated > 0) {
        toast.success("Ficha técnica enriquecida com sucesso!");
        onSaved();
      } else {
        toast.error("Não foi possível extrair a ficha técnica deste produto.");
      }
    },
    onError: (e: any) => toast.error(e.message),
  });
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProduct.mutate({
      id: product.id,
      code: form.code || null,
      name: form.name,
      description: form.description || null,
      activeIngredient: form.activeIngredient || null,
      manufacturer: form.manufacturer || null,
      unit: form.unit || null,
      concentration: form.concentration || null,
      presentation: form.presentation || null,
      pharmaceuticalForm: form.pharmaceuticalForm || null,
      price: form.price || null,
      priceUnit: form.priceUnit || null,
      stock: form.stock || null,
      barcode: form.barcode || null,
      gtin: (form as any).ean || (form as any).gtin || null,
      ean: (form as any).ean || (form as any).gtin || null,
      registroRegulatorio: (form as any).registroRegulatorio || null,
      codigoFornecedor: (form as any).codigoFornecedor || null,
      informacaoTecnica: (form as any).informacaoTecnica || null,
      fichaTecnica: (form as any).fichaTecnica || null,
      subcategoria: (form as any).subcategoria || null,
      mapa: form.mapa || null,
      freightValue: form.freightValue || null,
      taxValue: form.taxValue || null,
      imageUrl: form.imageUrl || null,
      productUrl: form.productUrl || null,
      isActive: form.isActive as "yes" | "no",
      supplierId: form.supplierId ? Number(form.supplierId) : undefined,
      categoryId: form.categoryId ? Number(form.categoryId) : undefined,
    });
  };

  const Field = ({
    label,
    field,
    type = "text",
    placeholder,
    wide,
    hint,
  }: {
    label: string;
    field: string;
    type?: string;
    placeholder?: string;
    wide?: boolean;
    hint?: string;
  }) => (
    <div className={wide ? "col-span-2" : ""}>
      <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">
        {label}
      </label>
      <input
        type={type}
        value={(form as any)[field]}
        onChange={(e) => set(field, e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:border-gray-900 transition-colors"
      />
      {hint && <div className="text-[10px] text-gray-400 mt-0.5">{hint}</div>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-gray-900 z-10">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-800" />
              <h2 className="text-base font-black tracking-tight text-gray-900">Editar Produto</h2>
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5">#{product.id} — {product.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 p-1">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {/* Image preview */}
          {form.imageUrl && !imgError && (
            <div className="mb-5 flex items-start gap-4 p-3 bg-gray-50 border border-gray-200">
              <img
                src={form.imageUrl}
                alt={form.name}
                className="w-20 h-20 object-contain border border-gray-200 bg-white flex-shrink-0"
                onError={() => setImgError(true)}
              />
              <div className="text-xs text-gray-500 min-w-0">
                <div className="font-semibold text-gray-700 mb-1">Pré-visualização</div>
                <div className="truncate text-gray-400 text-[10px]">{form.imageUrl}</div>
              </div>
            </div>
          )}

          {/* Painel de Ficha Técnica */}
          {(() => {
            const ft = (form as any).fichaTecnica as string | undefined;
            if (!ft) {
              return (
                <div className="mb-4 flex items-center justify-between p-3 bg-amber-50 border border-amber-200">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Ficha Técnica</span>
                    <span className="text-[10px] bg-amber-200 text-amber-800 px-2 py-0.5 font-bold">SEM FICHA TÉCNICA</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => enrichSingleMutation.mutate({ scope: "selected", productIds: [product.id], overwrite: false })}
                    disabled={enrichSingleMutation.isPending}
                    className="flex items-center gap-1 text-[10px] font-bold text-amber-800 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-2 py-1 transition-colors"
                  >
                    <Sparkles size={10} /> Enriquecer com IA
                  </button>
                </div>
              );
            }
            // Parsear a ficha técnica: pode ser JSON ou texto livre
            let parsed: Record<string, string> | null = null;
            try { parsed = JSON.parse(ft); } catch {}
            if (parsed && typeof parsed === "object") {
              const fields = [
                { key: "principioAtivo", label: "Princípio Ativo" },
                { key: "concentracao", label: "Concentração" },
                { key: "formaFarmaceutica", label: "Forma Farmacêutica" },
                { key: "classeTerapeutica", label: "Classe Terapêutica" },
                { key: "especieAlvo", label: "Espécie-Alvo" },
                { key: "indicacoes", label: "Indicações" },
              ].filter((f) => parsed![f.key]);
              return (
                <div className="mb-4 p-3 bg-purple-50 border border-purple-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-purple-700">Ficha Técnica (IA)</span>
                    <span className="text-[10px] bg-purple-200 text-purple-800 px-2 py-0.5 font-bold">{fields.length} campos</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {fields.map((f) => (
                      <div key={f.key} className="flex flex-col">
                        <span className="text-[9px] font-bold uppercase text-purple-500 tracking-wider">{f.label}</span>
                        <span className="text-xs text-gray-800 font-medium">{parsed![f.key]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            // Texto livre
            return (
              <div className="mb-4 p-3 bg-purple-50 border border-purple-200">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-purple-700">Ficha Técnica</div>
                </div>
                <p className="text-xs text-gray-700 leading-relaxed">{ft}</p>
              </div>
            );
          })()}
          <div className="grid grid-cols-2 gap-4">
            {/* Identificação — mesma ordem do mapeamento de importação */}
            <div className="col-span-2">
              <div className="its-rule mb-1" />
              <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400">Produto</div>
            </div>
            <Field label="Produto *" field="name" wide placeholder="Nome completo do produto" />
            {/* Categoria selecionada abaixo via select */}
            <Field label="Princípio Ativo / Composição" field="activeIngredient" placeholder="Ex: Amoxicilina" />
            <Field label="Concentração" field="concentration" placeholder="Ex: 500mg, 10%" />
            <Field label="Apresentação" field="presentation" placeholder="Ex: Comprimido, Frasco 100ml" />
            <Field label="Fabricante / Laboratório" field="manufacturer" placeholder="Nome do fabricante ou laboratório" />
            <Field label="Unidade" field="unit" placeholder="Ex: cx, fr, amp, kg" />

            {/* Preço e Registros */}
            <div className="col-span-2 mt-2">
              <div className="its-rule mb-1" />
              <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400">Preço e Registros</div>
            </div>
            <Field label="Preço (R$)" field="price" type="number" placeholder="0.00" />
            <Field label="Unidade de Preço" field="priceUnit" placeholder="Ex: cx, unid, kg" />
            <Field
              label="MAPA / ANVISA"
              field="mapa"
              type="text"
              placeholder="Ex: PA 0012345/2019"
              wide
              hint="Número de registro do produto no Ministério da Agricultura (MAPA) ou ANVISA"
            />
            {/* Landed Cost */}
            <div className="col-span-2 mt-1 p-3 bg-blue-50 border border-blue-100">
              <div className="text-[10px] font-bold tracking-widest uppercase text-blue-600 mb-2">Custos Adicionais (Landed Cost)</div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Frete (R$)" field="freightValue" type="number" placeholder="0.00" hint="Custo de frete por unidade" />
                <Field label="Impostos / ST (R$)" field="taxValue" type="number" placeholder="0.00" hint="ICMS-ST, IPI ou outros impostos" />
              </div>
              {form.price && (form.freightValue || form.taxValue) && (
                <div className="mt-2 text-xs font-bold text-blue-800">
                  Preço Final (Landed): R$ {(
                    parseFloat(form.price || "0") +
                    parseFloat(form.freightValue || "0") +
                    parseFloat(form.taxValue || "0")
                  ).toFixed(2)}
                </div>
              )}
            </div>

            {/* EAN/GTIN, Código Fornecedor e Informação Técnica */}
            <Field label="EAN / GTIN / Código de Barras" field="ean" placeholder="Ex: 7891234567890" hint="Código GTIN, EAN-13 ou EAN-8" />
            <Field label="Código Fornecedor" field="codigoFornecedor" placeholder="Ex: F-00123" hint="Código interno do fornecedor para este produto" />
            <div>
              <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">Registro Regulatório</label>
              <select
                value={(form as any).registroRegulatorio}
                onChange={(e) => set("registroRegulatorio", e.target.value)}
                className="w-full border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:border-gray-900"
              >
                <option value="">Não informado</option>
                <option value="MAPA">MAPA</option>
                <option value="ANVISA">ANVISA</option>
                <option value="FORN">FORN (Fornecedor)</option>
              </select>
              <div className="text-[10px] text-gray-400 mt-0.5">Tipo de registro regulatório do produto</div>
            </div>
            <Field label="Subcategoria" field="subcategoria" placeholder="Ex: Antiparasitários, Antibióticos, Vacinas" hint="Subcategoria do produto (preenchida automaticamente pela IA)" />
            <Field label="Informação Técnica" field="informacaoTecnica" wide placeholder="Descrição técnica, bula resumida, indicações..." hint="Informação técnica / bula resumida do produto" />
            {/* Ficha Técnica com botão Extrair via IA */}
            <div className="col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400">Ficha Técnica</label>
                <button
                  type="button"
                  disabled={extractFichaMutation.isPending}
                  onClick={() => extractFichaMutation.mutate({
                    productId: product.id,
                    name: form.name,
                    manufacturer: form.manufacturer || undefined,
                    concentration: form.concentration || undefined,
                    presentation: form.presentation || undefined,
                  })}
                  className="flex items-center gap-1 text-[10px] font-bold text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2 py-0.5 transition-colors disabled:opacity-50"
                >
                  {extractFichaMutation.isPending ? <Loader2 size={9} className="animate-spin" /> : <Sparkles size={9} />}
                  {extractFichaMutation.isPending ? "Consultando IA..." : "Extrair via IA"}
                </button>
              </div>
              <textarea
                value={(form as any).fichaTecnica}
                onChange={(e) => set("fichaTecnica", e.target.value)}
                placeholder="Resumo técnico: indicação, mecanismo de ação, espécies-alvo..."
                rows={3}
                className="w-full border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:border-gray-900 transition-colors resize-y"
              />
              {fichaIaSugestao && (
                <div className="mt-1 p-2 bg-purple-50 border border-purple-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-bold uppercase text-purple-600 tracking-wider">Sugestão da IA</span>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => { set("fichaTecnica", fichaIaSugestao); setFichaIaSugestao(null); toast.success("Ficha técnica aplicada!"); }} className="text-[9px] font-bold text-white bg-purple-600 hover:bg-purple-700 px-2 py-0.5 transition-colors">Aplicar</button>
                      <button type="button" onClick={() => setFichaIaSugestao(null)} className="text-[9px] font-bold text-purple-600 hover:text-purple-900 bg-purple-100 px-2 py-0.5 transition-colors">Descartar</button>
                    </div>
                  </div>
                  <p className="text-[10px] text-purple-800 whitespace-pre-wrap">{fichaIaSugestao}</p>
                </div>
              )}
              <div className="text-[10px] text-gray-400 mt-0.5">Ficha técnica / bula resumida (gerada pela IA na migração V2)</div>
            </div>

            {/* Imagem e Link */}
            <div className="col-span-2 mt-2">
              <div className="its-rule mb-1" />
              <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400">Imagem e Link</div>
            </div>
            <Field label="URL da Imagem" field="imageUrl" wide placeholder="https://exemplo.com/imagem.jpg" hint="Cole a URL da imagem do produto para exibição" />
            <Field label="Link do Produto" field="productUrl" wide placeholder="https://fornecedor.com/produto/123" hint="Link direto para a página do produto no site do fornecedor" />

            {/* Outros */}
            <div className="col-span-2 mt-2">
              <div className="its-rule mb-1" />
              <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400">Outros</div>
            </div>
            <div>
              <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">Categoria</label>
              <select
                value={form.categoryId}
                onChange={(e) => set("categoryId", e.target.value)}
                className="w-full border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:border-gray-900"
              >
                <option value="">Selecionar...</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">Fornecedor</label>
              <select
                value={form.supplierId}
                onChange={(e) => set("supplierId", e.target.value)}
                className="w-full border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:border-gray-900"
              >
                <option value="">Selecionar...</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <Field label="Código Interno" field="code" placeholder="Ex: MED-001" hint="Código interno do sistema" />
            <Field label="Estoque / Disponibilidade" field="stock" placeholder="Ex: disponível, sob consulta, 50 un" />
            <div>
              <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">Status</label>
              <select
                value={form.isActive}
                onChange={(e) => set("isActive", e.target.value)}
                className="w-full border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:border-gray-900"
              >
                <option value="yes">Ativo</option>
                <option value="no">Inativo</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">Descrição Adicional</label>
              <textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                rows={2}
                placeholder="Informações adicionais sobre o produto..."
                className="w-full border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:border-gray-900 resize-none"
              />
            </div>
          </div>

          {/* Preços por Fornecedor */}
          {/* Histórico de Preços */}
          <PriceHistorySection productId={product.id} suppliers={suppliers} />
          {/* Preços por Fornecedor */}
          <div className="mt-6 pt-4 border-t border-gray-100">
            <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-3">Preços por Fornecedor</div>
            <div className="space-y-2">
              {suppliers.map((s) => {
                const existing = supplierPrices?.find((sp: any) => sp.supplierId === s.id);
                const isEditing = editingPrice?.supplierId === s.id;
                return (
                  <div key={s.id} className="flex items-center gap-2 text-xs">
                    <span className="w-40 text-gray-600 truncate" title={s.name}>{s.name}</span>
                    {isEditing ? (
                      <>
                        <input
                          type="number"
                          step="0.01"
                          value={editingPrice!.value}
                          onChange={(e) => setEditingPrice({ supplierId: s.id, value: e.target.value })}
                          className="w-24 border border-blue-400 px-2 py-0.5 text-xs focus:outline-none"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              upsertPriceMutation.mutate({ productId: product.id, supplierId: s.id, price: editingPrice!.value || null });
                              setEditingPrice(null);
                            }
                            if (e.key === "Escape") setEditingPrice(null);
                          }}
                        />
                        <button type="button" onClick={() => { upsertPriceMutation.mutate({ productId: product.id, supplierId: s.id, price: editingPrice!.value || null }); setEditingPrice(null); }} className="text-green-600 hover:text-green-800 text-[10px] font-bold">OK</button>
                        <button type="button" onClick={() => setEditingPrice(null)} className="text-gray-400 hover:text-gray-700 text-[10px]">X</button>
                      </>
                    ) : (
                      <>
                        <span
                          className="w-24 border border-gray-200 px-2 py-0.5 cursor-pointer hover:border-blue-400 text-gray-700"
                          onClick={() => setEditingPrice({ supplierId: s.id, value: existing?.price ?? "" })}
                          title="Clique para editar"
                        >
                          {existing?.price ? `R$ ${parseFloat(existing.price).toFixed(2)}` : <span className="text-gray-300 italic">-</span>}
                        </span>
                        {existing && (
                          <button type="button" onClick={() => deletePriceMutation.mutate({ productId: product.id, supplierId: s.id })} className="text-red-300 hover:text-red-600 text-[10px]">excluir</button>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="text-[9px] text-gray-400 mt-2">Clique no valor para editar. Pressione Enter para salvar.</div>
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 text-sm font-semibold text-gray-700 hover:border-gray-900 transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={updateProduct.isPending || !form.name}
              className="px-6 py-2 bg-gray-900 text-white text-sm font-semibold hover:bg-blue-800 transition-colors disabled:opacity-50"
            >
              {updateProduct.isPending ? "Salvando..." : "Salvar Alterações"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Bulk Edit Panel ──────────────────────────────────────────────────────────
function BulkEditPanel({
  selectedIds,
  categories,
  suppliers,
  onClose,
  onDone,
}: {
  selectedIds: number[];
  categories: any[];
  suppliers: any[];
  onClose: () => void;
  onDone: () => void;
}) {
  // Identification
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [barcode, setBarcode] = useState("");
  // Composition
  const [activeIngredient, setActiveIngredient] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [concentration, setConcentration] = useState("");
  const [presentation, setPresentation] = useState("");
  const [pharmaceuticalForm, setPharmaceuticalForm] = useState("");
  const [unit, setUnit] = useState("");
  const [description, setDescription] = useState("");
  // Pricing
  const [price, setPrice] = useState("");
  const [priceUnit, setPriceUnit] = useState("");
  const [mapa, setMapa] = useState("");
  const [priceAdjust, setPriceAdjust] = useState("");
  // Media & Links
  const [imageUrl, setImageUrl] = useState("");
  const [productUrl, setProductUrl] = useState("");
  // Extra
  const [codigoFornecedor, setCodigoFornecedor] = useState("");
  const [informacaoTecnica, setInformacaoTecnica] = useState("");
  const [freightValue, setFreightValue] = useState("");
  const [taxValue, setTaxValue] = useState("");
  // Classification
  const [supplierId, setSupplierId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [isActive, setIsActive] = useState("");
  const [stock, setStock] = useState("");

  const utils = trpc.useUtils();
  const bulkUpdate = trpc.products.bulkUpdate.useMutation({
    onSuccess: (count) => {
      utils.products.list.invalidate();
      toast.success(`${count} produto(s) atualizado(s) com sucesso!`);
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleApply = () => {
    const data: any = { ids: selectedIds };
    if (name.trim()) data.name = name.trim();
    if (code.trim()) data.code = code.trim();
    if (barcode.trim()) data.barcode = barcode.trim();
    if (activeIngredient.trim()) data.activeIngredient = activeIngredient.trim();
    if (manufacturer.trim()) data.manufacturer = manufacturer.trim();
    if (concentration.trim()) data.concentration = concentration.trim();
    if (presentation.trim()) data.presentation = presentation.trim();
    if (pharmaceuticalForm.trim()) data.pharmaceuticalForm = pharmaceuticalForm.trim();
    if (unit.trim()) data.unit = unit.trim();
    if (description.trim()) data.description = description.trim();
    if (price.trim()) data.price = price.trim();
    if (priceUnit.trim()) data.priceUnit = priceUnit.trim();
    if (mapa.trim()) data.mapa = mapa.trim();
    if (priceAdjust && priceAdjust !== "0") data.priceAdjustPercent = parseFloat(priceAdjust);
    if (imageUrl.trim()) data.imageUrl = imageUrl.trim();
    if (productUrl.trim()) data.productUrl = productUrl.trim();
    if (supplierId) data.supplierId = Number(supplierId);
    if (categoryId) data.categoryId = Number(categoryId);
    if (isActive) data.isActive = isActive;
    if (stock.trim()) data.stock = stock.trim();
    if (codigoFornecedor.trim()) data.codigoFornecedor = codigoFornecedor.trim();
    if (informacaoTecnica.trim()) data.informacaoTecnica = informacaoTecnica.trim();
    if (freightValue.trim()) data.freightValue = freightValue.trim();
    if (taxValue.trim()) data.taxValue = taxValue.trim();
    if (Object.keys(data).length === 1) {
      toast.error("Preencha ao menos um campo para alterar.");
      return;
    }
    bulkUpdate.mutate(data);
  };

  const fieldClass = "w-full border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:border-gray-900 bg-white";
  const labelClass = "text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1";

  return (
    <div className="border-2 border-gray-900 bg-white p-5 mb-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 bg-gray-900 flex items-center justify-center flex-shrink-0">
            <Layers size={11} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-black text-gray-900">Edição em Lote</div>
            <div className="text-[10px] text-gray-400">
              {selectedIds.length} produto{selectedIds.length !== 1 ? "s" : ""} selecionado{selectedIds.length !== 1 ? "s" : ""} — apenas os campos preenchidos serão alterados
            </div>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-300 hover:text-gray-900 p-1">
          <X size={14} />
        </button>
      </div>

      {/* Section: Identificação */}
      <div className="mb-4">
        <div className="text-[9px] font-black tracking-widest uppercase text-blue-800 border-b border-blue-100 pb-1 mb-3">Identificação</div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <div>
            <label className={labelClass}>Produto</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Não alterar" className={fieldClass} />
          </div>
          <div>
            <label className={labelClass}>Código Interno</label>
            <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Não alterar" className={fieldClass} />
          </div>
          <div>
            <label className={labelClass}>EAN / GTIN / Código de Barras</label>
            <input type="text" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Não alterar" className={fieldClass} />
          </div>
          <div>
            <label className={labelClass}>Estoque</label>
            <input type="text" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="Não alterar" className={fieldClass} />
          </div>
        </div>
      </div>

      {/* Section: Composição */}
      <div className="mb-4">
        <div className="text-[9px] font-black tracking-widest uppercase text-blue-800 border-b border-blue-100 pb-1 mb-3">Composição</div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-2">
            <label className={labelClass}>Princípio Ativo / Composição</label>
            <input type="text" value={activeIngredient} onChange={(e) => setActiveIngredient(e.target.value)} placeholder="Não alterar" className={fieldClass} />
          </div>
          <div>
            <label className={labelClass}>Fabricante / Laboratório</label>
            <input type="text" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="Não alterar" className={fieldClass} />
          </div>
          <div>
            <label className={labelClass}>Concentração</label>
            <input type="text" value={concentration} onChange={(e) => setConcentration(e.target.value)} placeholder="Não alterar" className={fieldClass} />
          </div>
           <div>
            <label className={labelClass}>Apresentação</label>
            <input type="text" value={presentation} onChange={(e) => setPresentation(e.target.value)} placeholder="Não alterar" className={fieldClass} />
          </div>
          <div>
            <label className={labelClass}>Forma Farmacêutica</label>
            <input type="text" value={pharmaceuticalForm} onChange={(e) => setPharmaceuticalForm(e.target.value)} placeholder="Não alterar" className={fieldClass} />
          </div>
        </div>
        <div className="mt-3">
          <label className={labelClass}>Descrição / Informações Adicionais</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Não alterar" rows={2} className={`${fieldClass} resize-none`} />
        </div>
      </div>
      {/* Section: Preços */}
      <div className="mb-4">
        <div className="text-[9px] font-black tracking-widest uppercase text-blue-800 border-b border-blue-100 pb-1 mb-3">Preços</div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <div>
            <label className={labelClass}>Preço Unitário (R$)</label>
            <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Não alterar" className={fieldClass} />
          </div>
          <div>
            <label className={labelClass}>Unidade do Preço</label>
            <input type="text" value={priceUnit} onChange={(e) => setPriceUnit(e.target.value)} placeholder="Não alterar" className={fieldClass} />
          </div>
          <div>
            <label className={labelClass}>Unidade</label>
            <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Não alterar" className={fieldClass} />
          </div>
          <div>
            <label className={labelClass}>MAPA / ANVISA</label>
            <input type="text" value={mapa} onChange={(e) => setMapa(e.target.value)} placeholder="Não alterar" className={fieldClass} />
          </div>
          <div>
            <label className={labelClass}>Ajuste de Preço (%)</label>
            <div className="flex items-center border border-gray-200 focus-within:border-gray-900">
              <button type="button" onClick={() => setPriceAdjust((v) => String((parseFloat(v || "0") - 1).toFixed(1)))} className="px-2 py-1.5 text-gray-400 hover:text-gray-900">
                <Minus size={10} />
              </button>
              <input type="number" value={priceAdjust} onChange={(e) => setPriceAdjust(e.target.value)} placeholder="0" className="flex-1 text-xs text-center outline-none py-1.5 min-w-0" />
              <button type="button" onClick={() => setPriceAdjust((v) => String((parseFloat(v || "0") + 1).toFixed(1)))} className="px-2 py-1.5 text-gray-400 hover:text-gray-900">
                <Plus size={10} />
              </button>
            </div>
            <div className="text-[9px] text-gray-400 mt-0.5">negativo = redução de preço</div>
          </div>
        </div>
      </div>

      {/* Section: Fornecedor / Custos */}
      <div className="mb-4">
        <div className="text-[9px] font-black tracking-widest uppercase text-blue-800 border-b border-blue-100 pb-1 mb-3">Fornecedor e Custos</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className={labelClass}>Código Fornecedor</label>
            <input type="text" value={codigoFornecedor} onChange={(e) => setCodigoFornecedor(e.target.value)} placeholder="Não alterar" className={fieldClass} />
          </div>
          <div>
            <label className={labelClass}>Frete por Unidade (R$)</label>
            <input type="number" value={freightValue} onChange={(e) => setFreightValue(e.target.value)} placeholder="Não alterar" className={fieldClass} />
          </div>
          <div>
            <label className={labelClass}>Impostos / ST (R$)</label>
            <input type="number" value={taxValue} onChange={(e) => setTaxValue(e.target.value)} placeholder="Não alterar" className={fieldClass} />
          </div>
          <div className="md:col-span-1">
            <label className={labelClass}>Informação Técnica</label>
            <input type="text" value={informacaoTecnica} onChange={(e) => setInformacaoTecnica(e.target.value)} placeholder="Não alterar" className={fieldClass} />
          </div>
        </div>
      </div>
      {/* Section: Imagem e Link */}
      <div className="mb-4">
        <div className="text-[9px] font-black tracking-widest uppercase text-blue-800 border-b border-blue-100 pb-1 mb-3">Imagem e Link</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>URL da Imagem</label>
            <input type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://... (não alterar se vazio)" className={fieldClass} />
            {imageUrl && (
              <img src={imageUrl} alt="" className="mt-1 h-10 object-contain border border-gray-100" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            )}
          </div>
          <div>
            <label className={labelClass}>Link do Produto</label>
            <input type="url" value={productUrl} onChange={(e) => setProductUrl(e.target.value)} placeholder="https://... (não alterar se vazio)" className={fieldClass} />
          </div>
        </div>
      </div>

      {/* Section: Classificação */}
      <div className="mb-4">
        <div className="text-[9px] font-black tracking-widest uppercase text-blue-800 border-b border-blue-100 pb-1 mb-3">Classificação</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Fornecedor</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={fieldClass}>
              <option value="">Não alterar</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Categoria</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={fieldClass}>
              <option value="">Não alterar</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Status</label>
            <select value={isActive} onChange={(e) => setIsActive(e.target.value)} className={fieldClass}>
              <option value="">Não alterar</option>
              <option value="yes">Ativar todos</option>
              <option value="no">Desativar todos</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-gray-100">
        <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 text-xs font-semibold text-gray-600 hover:border-gray-900 transition-colors">
          Cancelar
        </button>
        <button
          onClick={handleApply}
          disabled={bulkUpdate.isPending}
          className="flex items-center gap-2 px-4 py-1.5 bg-gray-900 text-white text-xs font-bold hover:bg-blue-800 transition-colors disabled:opacity-50"
        >
          <Layers size={11} />
          {bulkUpdate.isPending ? "Aplicando..." : `Aplicar em ${selectedIds.length} produto${selectedIds.length !== 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Produtos() {
  const [location] = useLocation();
  // Read categoryId from query string (e.g. /produtos?categoryId=3)
  const initialCategoryId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const val = params.get("categoryId");
    return val ? Number(val) : undefined;
  }, [location]);
  const [activeCategoryId, setActiveCategoryId] = useState<number | undefined>(initialCategoryId);
  const [extraCategoryIds, setExtraCategoryIds] = useState<number[]>([]);

  // Sync when navigating from Dashboard with a pre-selected category
  useEffect(() => {
    if (initialCategoryId !== undefined) {
      setActiveCategoryId(initialCategoryId);
    }
  }, [initialCategoryId]);
  // Abrir modal de reclassificação se URL contiver openReclassify=1
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("openReclassify") === "1") {
      setShowReclassifyModal(true);
      setReclassifyResult(null);
      setReclassifyScope("uncategorized");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [location]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchField, setSearchField] = useState<SearchField>("all");
  const [filterSupplier, setFilterSupplier] = useState<number | undefined>();
  const [filterManufacturer, setFilterManufacturer] = useState("");
  const [filterIsActive, setFilterIsActive] = useState<"yes" | "no" | "all">("yes");
  const [filterPriceMin, setFilterPriceMin] = useState("");
  const [filterPriceMax, setFilterPriceMax] = useState("");
  const [filterHasImage, setFilterHasImage] = useState(false);
  const [filterHasLink, setFilterHasLink] = useState(false);
  const [filterIncomplete, setFilterIncomplete] = useState(false);
  const [filterWithoutFichaTecnica, setFilterWithoutFichaTecnica] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [editProduct, setEditProduct] = useState<any | null>(null);
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  // Agrupamento
  type GroupBy = "none" | "category" | "supplier" | "manufacturer";
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) => setCollapsedGroups((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  // Edição inline
  type InlineEdit = { id: number; field: string; value: string } | null;
  const [inlineEdit, setInlineEdit] = useState<InlineEdit>(null);
  const inlineUpdateMutation = trpc.products.update.useMutation({
    onSuccess: () => { utils.products.list.invalidate(); setInlineEdit(null); },
    onError: (e) => { toast.error(e.message); setInlineEdit(null); },
  });
  const startInline = (id: number, field: string, value: string) => {
    setInlineEdit({ id, field, value });
  };
  const commitInline = () => {
    if (!inlineEdit) return;
    const { id, field, value } = inlineEdit;
    inlineUpdateMutation.mutate({ id, [field]: value || null } as any);
  };
  const limit = pageSize;

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(0); setSelectedIds(new Set()); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: categories } = trpc.categories.list.useQuery();
  const { data: suppliers } = trpc.suppliers.list.useQuery({});

  // Memoizar queryInput para evitar re-fetches desnecessários a cada render
  const queryInput = useMemo(() => ({
    categoryId: extraCategoryIds.length > 0 ? undefined : activeCategoryId,
    categoryIds: extraCategoryIds.length > 0 ? [activeCategoryId, ...extraCategoryIds].filter(Boolean) as number[] : undefined,
    supplierId: filterSupplier,
    search: debouncedSearch || undefined,
    searchField: searchField !== "all" ? searchField : undefined,
    manufacturer: filterManufacturer || undefined,
    isActive: filterIsActive,
    priceMin: filterPriceMin ? parseFloat(filterPriceMin) : undefined,
    priceMax: filterPriceMax ? parseFloat(filterPriceMax) : undefined,
    hasImage: filterHasImage || undefined,
    hasProductUrl: filterHasLink || undefined,
    withoutFichaTecnica: filterWithoutFichaTecnica || undefined,
    sortBy: sortField,
    sortDir,
    limit,
    offset: page * limit,
  }), [activeCategoryId, extraCategoryIds, filterSupplier, debouncedSearch, searchField, filterManufacturer, filterIsActive, filterPriceMin, filterPriceMax, filterHasImage, filterHasLink, filterWithoutFichaTecnica, sortField, sortDir, limit, page]);

  const { data, isLoading } = trpc.products.list.useQuery(queryInput as any);

  const utils = trpc.useUtils();
  const deleteProduct = trpc.products.delete.useMutation({
    onSuccess: () => { utils.products.list.invalidate(); toast.success("Produto excluído."); },
    onError: (e) => toast.error(e.message),
  });

  const createProductMutation = trpc.products.create.useMutation({
    onSuccess: () => {
      utils.products.list.invalidate();
      toast.success("Produto criado com sucesso!");
      setShowNewProduct(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkDeleteMutation = trpc.products.bulkDelete.useMutation({
    onSuccess: (res) => {
      utils.products.list.invalidate();
      setSelectedIds(new Set());
      toast.success(`${res.deleted} produto${res.deleted !== 1 ? "s" : ""} excluído${res.deleted !== 1 ? "s" : ""}.`);
    },
    onError: (e) => toast.error(e.message),
  });
  // Enriquecimento de Ficha Técnica com IA — suporte a 30k produtos via loop paginado
  const [showEnrichModal, setShowEnrichModal] = useState(false);
  const [enrichScope, setEnrichScope] = useState<"withoutFicha" | "selected" | "all">("withoutFicha");
  const [enrichOverwrite, setEnrichOverwrite] = useState(false);
  const [enrichResult, setEnrichResult] = useState<{ updated: number; skipped: number; errors: number; total: number } | null>(null);
  const [enrichProgress, setEnrichProgress] = useState<{ processed: number; total: number; updated: number; errors: number } | null>(null);
  const [enrichRunning, setEnrichRunning] = useState(false);
  const enrichMutation = trpc.enrichment.enrichFichaTecnica.useMutation({
    onError: (e) => { toast.error(e.message); setEnrichRunning(false); },
  });
  const startEnrichLoop = async (scope: "withoutFicha" | "selected" | "all", overwrite: boolean, productIds?: number[]) => {
    setEnrichRunning(true);
    setEnrichProgress(null);
    let offset = 0, totalUpdated = 0, totalSkipped = 0, totalErrors = 0, grandTotal = 0;
    try {
      while (true) {
        const res = await enrichMutation.mutateAsync({ scope, productIds: scope === "selected" ? productIds : undefined, overwrite, offset, pageSize: 150 });
        grandTotal = res.total;
        totalUpdated += res.updated;
        totalSkipped += res.skipped;
        totalErrors += res.errors;
        offset = res.nextOffset;
        setEnrichProgress({ processed: offset, total: grandTotal, updated: totalUpdated, errors: totalErrors });
        if (!res.hasMore) break;
      }
      setEnrichResult({ updated: totalUpdated, skipped: totalSkipped, errors: totalErrors, total: grandTotal });
      utils.products.list.invalidate();
      toast.success(`Ficha técnica enriquecida: ${totalUpdated} produtos atualizados.`);
    } catch (_) { /* tratado pelo onError */ } finally { setEnrichRunning(false); }
  };

  // Reclassificação em lote com IA — suporte a 30k produtos via loop paginado
  const [showReclassifyModal, setShowReclassifyModal] = useState(false);
  const [reclassifyScope, setReclassifyScope] = useState<"selected" | "uncategorized" | "all">("uncategorized");
  const [reclassifyIncludeExisting, setReclassifyIncludeExisting] = useState(false);
  const [reclassifyResult, setReclassifyResult] = useState<{ updated: number; skipped: number; errors: number; total: number } | null>(null);
  const [reclassifyProgress, setReclassifyProgress] = useState<{ processed: number; total: number; updated: number; errors: number } | null>(null);
  const [reclassifyRunning, setReclassifyRunning] = useState(false);
  const bulkReclassifyMutation = trpc.enrichment.bulkReclassifySelected.useMutation({
    onError: (e) => { toast.error(e.message); setReclassifyRunning(false); },
  });
  const startReclassifyLoop = async (productIds?: number[], includeAlreadyCategorized?: boolean) => {
    setReclassifyRunning(true);
    setReclassifyProgress(null);
    let offset = 0, totalUpdated = 0, totalSkipped = 0, totalErrors = 0, grandTotal = 0;
    try {
      while (true) {
        const res = await bulkReclassifyMutation.mutateAsync({ productIds, includeAlreadyCategorized: includeAlreadyCategorized ?? false, offset, pageSize: 200, batchSize: 50 });
        grandTotal = res.total;
        totalUpdated += res.updated;
        totalSkipped += res.skipped;
        totalErrors += res.errors;
        offset = res.nextOffset;
        setReclassifyProgress({ processed: offset, total: grandTotal, updated: totalUpdated, errors: totalErrors });
        if (!res.hasMore) break;
      }
      setReclassifyResult({ updated: totalUpdated, skipped: totalSkipped, errors: totalErrors, total: grandTotal });
      utils.products.list.invalidate();
      toast.success(`Reclassificação concluída: ${totalUpdated} produtos categorizados.`);
    } catch (_) { /* tratado pelo onError */ } finally { setReclassifyRunning(false); }
  };

  const handleBulkDelete = () => {
    const count = selectedIds.size;
    if (!window.confirm(`Excluir ${count} produto${count !== 1 ? "s" : ""} selecionado${count !== 1 ? "s" : ""}? Esta ação não pode ser desfeita.`)) return;
    bulkDeleteMutation.mutate({ ids: Array.from(selectedIds) });
  };

  const rawItems = data?.items ?? [];
  // Filtro client-side de produtos incompletos (score < 7)
  const items = filterIncomplete
    ? rawItems.filter((p) => calcQualityScore(p as unknown as Record<string, unknown>).score < QUALITY_FIELDS.length)
    : rawItems;
  const total = filterIncomplete ? items.length : (data?.total ?? 0);
  const totalPages = Math.ceil(total / limit);

  const allPageIds = items.map((p) => p.id);
  const allSelected = allPageIds.length > 0 && allPageIds.every((id) => selectedIds.has(id));
  const someSelected = allPageIds.some((id) => selectedIds.has(id));

  const toggleAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) allPageIds.forEach((id) => next.delete(id));
      else allPageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const toggleOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
    setPage(0);
  };

  const SortIcon = ({ field }: { field: SortField }) =>
    sortField === field ? (sortDir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />) : null;

  const clearAllFilters = () => {
    setSearch(""); setDebouncedSearch(""); setSearchField("all");
    setFilterSupplier(undefined); setFilterManufacturer("");
    setFilterIsActive("yes"); setFilterPriceMin(""); setFilterPriceMax("");
     setFilterHasImage(false); setFilterHasLink(false); setFilterIncomplete(false); setFilterWithoutFichaTecnica(false);
    setActiveCategoryId(undefined); setExtraCategoryIds([]); setPage(0);
  };
  const hasActiveFilters = debouncedSearch || filterSupplier || filterManufacturer ||
    filterIsActive !== "yes" || filterPriceMin || filterPriceMax || filterHasImage || filterHasLink || filterIncomplete || filterWithoutFichaTecnica;

  // ─── Exportação Excel completa ─────────────────────────────────────────────
  const [showExcelModal, setShowExcelModal] = useState(false);
  const [excelExportScope, setExcelExportScope] = useState<"current" | "all" | "filtered">("filtered");
  const [excelExporting, setExcelExporting] = useState(false);

  const exportExcel = async (scope: "current" | "all" | "filtered") => {
    setExcelExporting(true);
    try {
      const params = new URLSearchParams();
      if (scope === "current") {
        params.set("withoutFichaTecnica", "true");
      } else if (scope === "filtered") {
        if (filterSupplier) params.set("supplierId", String(filterSupplier));
        if (activeCategoryId) params.set("categoryId", String(activeCategoryId));
        if (filterIsActive !== "all") params.set("isActive", filterIsActive);
        if (filterWithoutFichaTecnica) params.set("withoutFichaTecnica", "true");
        if (debouncedSearch) params.set("search", debouncedSearch);
      } else {
        params.set("isActive", "all");
      }
      const url = `/api/products/export-excel?${params.toString()}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(await resp.text());
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `catalogo-produtos-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Catálogo exportado com sucesso!");
      setShowExcelModal(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao exportar Excel");
    } finally {
      setExcelExporting(false);
    }
  };

  // ─── Importação Excel para atualização em massa ───────────────────────────
  const [showImportExcelModal, setShowImportExcelModal] = useState(false);
  const [importExcelFile, setImportExcelFile] = useState<File | null>(null);
  const [importExcelLoading, setImportExcelLoading] = useState(false);
  const [importExcelResult, setImportExcelResult] = useState<{
    updated: number; skipped: number; errors: number; notFound: number;
    details: Array<{ row: number; id?: number; name?: string; status: string; message?: string }>;
  } | null>(null);

  const handleImportExcel = async () => {
    if (!importExcelFile) return;
    setImportExcelLoading(true);
    setImportExcelResult(null);
    try {
      const formData = new FormData();
      formData.append("file", importExcelFile);
      const resp = await fetch("/api/products/import-excel-update", { method: "POST", body: formData });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result?.error ?? "Erro ao importar");
      setImportExcelResult(result);
      utils.products.list.invalidate();
      toast.success(`Importação concluída: ${result.updated} produto${result.updated !== 1 ? "s" : ""} atualizado${result.updated !== 1 ? "s" : ""}.`);
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao importar Excel");
    } finally {
      setImportExcelLoading(false);
    }
  };

  const exportCSV = () => {
    if (!items.length) return;
    const headers = ["Produto","Categoria","Princípio Ativo / Composição","Concentração","Apresentação","Fabricante / Laboratório","Unidade","Preço","MAPA / ANVISA","EAN / GTIN / Código de Barras","Código Fornecedor","Informação Técnica","URL da Imagem","Link do Produto","ID","Código Interno","Un. Preço","Estoque","Fornecedor","Status"];
    const rows = items.map((p) => [
      p.name,
      p.categoryName ?? "",
      p.activeIngredient ?? "",
      p.concentration ?? "",
      p.presentation ?? "",
      p.manufacturer ?? "",
      p.unit ?? "",
      p.price ? parseFloat(p.price).toFixed(2) : "",
      p.mapa ?? "",
      p.barcode ?? "",
      (p as any).codigoFornecedor ?? "",
      (p as any).informacaoTecnica ?? "",
      p.imageUrl ?? "",
      p.productUrl ?? "",
      p.id,
      p.code ?? "",
      p.priceUnit ?? "",
      p.stock ?? "",
      p.supplierName ?? "",
      p.isActive === "yes" ? "Ativo" : "Inativo",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `produtos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <span className="its-bar" />
          <h1 className="text-3xl font-black tracking-tight text-gray-900">Produtos</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isLoading ? "Carregando..." : `${total.toLocaleString("pt-BR")} produto${total !== 1 ? "s" : ""}`}
            {selectedIds.size > 0 && (
              <span className="ml-2 font-semibold text-blue-800">· {selectedIds.size} selecionado{selectedIds.size !== 1 ? "s" : ""}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {selectedIds.size > 0 && (
            <>
              <button
                onClick={() => setShowBulkEdit(true)}
                className="flex items-center gap-2 border-2 border-gray-900 px-3 py-2 text-xs font-bold hover:bg-gray-900 hover:text-white transition-colors"
              >
                <Layers size={12} />
                Editar em Lote ({selectedIds.size})
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleteMutation.isPending}
                className="flex items-center gap-2 border-2 border-blue-800 text-blue-800 px-3 py-2 text-xs font-bold hover:bg-blue-800 hover:text-white transition-colors disabled:opacity-50"
              >
                <Trash2 size={12} />
                {bulkDeleteMutation.isPending ? "Excluindo..." : `Excluir (${selectedIds.size})`}
              </button>
            </>
          )}
          <button
            onClick={() => setShowNewProduct(true)}
            className="flex items-center gap-2 bg-blue-800 text-white px-3 py-2 text-xs font-bold hover:bg-gray-900 transition-colors"
          >
            <Plus size={12} />
            Novo Produto
          </button>
          <button
            onClick={() => { setShowEnrichModal(true); setEnrichResult(null); }}
            className="flex items-center gap-2 border border-purple-300 text-purple-700 px-3 py-2 text-xs font-semibold hover:bg-purple-50 hover:border-purple-500 transition-colors"
          >
            <Sparkles size={12} />
            Enriquecer Ficha Técnica
          </button>
          <button
            onClick={() => { setShowReclassifyModal(true); setReclassifyResult(null); }}
            className="flex items-center gap-2 border border-indigo-300 text-indigo-700 px-3 py-2 text-xs font-semibold hover:bg-indigo-50 hover:border-indigo-500 transition-colors"
          >
            <Sparkles size={12} />
            Reclassificar com IA
          </button>
          <button
            onClick={() => setShowDuplicates(true)}
            className="flex items-center gap-2 border border-orange-300 text-orange-700 px-3 py-2 text-xs font-semibold hover:bg-orange-50 hover:border-orange-500 transition-colors"
          >
            <Copy size={12} />
            Detectar Duplicatas
          </button>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600 hover:border-gray-900 transition-colors"
          >
            <Download size={12} />
            Exportar CSV
          </button>
          <button
            onClick={() => { setExcelExportScope("filtered"); setShowExcelModal(true); }}
            className="flex items-center gap-2 border border-green-300 px-3 py-2 text-xs font-semibold text-green-700 hover:bg-green-50 hover:border-green-500 transition-colors"
          >
            <FileSpreadsheet size={12} />
            Exportar Excel
          </button>
          <button
            onClick={() => { setImportExcelFile(null); setImportExcelResult(null); setShowImportExcelModal(true); }}
            className="flex items-center gap-2 border border-blue-300 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 hover:border-blue-500 transition-colors"
          >
            <Upload size={12} />
            Atualizar por Excel
          </button>
        </div>
      </div>

      {/* Bulk edit panel */}
      {showBulkEdit && selectedIds.size > 0 && (
        <BulkEditPanel
          selectedIds={Array.from(selectedIds)}
          categories={categories ?? []}
          suppliers={suppliers ?? []}
          onClose={() => setShowBulkEdit(false)}
          onDone={() => { setShowBulkEdit(false); setSelectedIds(new Set()); }}
        />
      )}

      <div className="mb-6 grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <div className="border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400">Resumo Operacional</div>
              <p className="mt-1 text-sm text-gray-600">Visão rápida para operação real do catálogo, com foco em qualidade, revisão e risco de inconsistência.</p>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-semibold text-gray-500">
              {hasActiveFilters ? <span className="border border-blue-200 bg-blue-50 px-2 py-1 text-blue-700">Filtros ativos</span> : <span className="border border-gray-200 px-2 py-1">Sem filtros extras</span>}
              {filterIncomplete ? <span className="border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">Modo revisão</span> : null}
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="border border-gray-200 bg-gray-50 p-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Produtos exibidos</div>
              <div className="mt-2 text-2xl font-black text-gray-900">{items.length}</div>
              <div className="mt-1 text-xs text-gray-500">Da consulta corrente</div>
            </div>
            <div className="border border-gray-200 bg-gray-50 p-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Total catalogado</div>
              <div className="mt-2 text-2xl font-black text-gray-900">{total.toLocaleString("pt-BR")}</div>
              <div className="mt-1 text-xs text-gray-500">Base principal do catálogo</div>
            </div>
            <div className="border border-gray-200 bg-gray-50 p-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Pendentes de ficha</div>
              <div className="mt-2 text-2xl font-black text-amber-700">{items.filter((p) => calcQualityScore(p as unknown as Record<string, unknown>).score < QUALITY_FIELDS.length).length}</div>
              <div className="mt-1 text-xs text-gray-500">Produtos com enriquecimento incompleto</div>
            </div>
            <div className="border border-gray-200 bg-gray-50 p-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Fornecedores visíveis</div>
              <div className="mt-2 text-2xl font-black text-gray-900">{new Set(items.map((p: any) => p.supplierId).filter(Boolean)).size}</div>
              <div className="mt-1 text-xs text-gray-500">Na seleção atual</div>
            </div>
          </div>
        </div>

        <div className="border border-gray-200 bg-white p-4">
          <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400">Ações Rápidas</div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button onClick={() => setShowNewProduct(true)} className="flex items-center justify-between border border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-700 hover:border-gray-900 transition-colors">
              <span>Cadastrar item</span>
              <Plus size={12} />
            </button>
            <button onClick={() => setShowDuplicates(true)} className="flex items-center justify-between border border-orange-200 px-3 py-2 text-left text-xs font-semibold text-orange-700 hover:border-orange-400 transition-colors">
              <span>Revisar duplicidades</span>
              <Copy size={12} />
            </button>
            <button onClick={() => { setShowEnrichModal(true); setEnrichResult(null); }} className="flex items-center justify-between border border-purple-200 px-3 py-2 text-left text-xs font-semibold text-purple-700 hover:border-purple-400 transition-colors">
              <span>Enriquecer ficha</span>
              <Sparkles size={12} />
            </button>
            <button onClick={() => { setImportExcelFile(null); setImportExcelResult(null); setShowImportExcelModal(true); }} className="flex items-center justify-between border border-blue-200 px-3 py-2 text-left text-xs font-semibold text-blue-700 hover:border-blue-400 transition-colors">
              <span>Atualizar por Excel</span>
              <Upload size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-0 mb-4 border-b border-gray-200 overflow-x-auto">
        {[{ id: undefined, name: "Todas" }, ...(categories ?? [])].map((c) => (
          <button
            key={c.id ?? "all"}
            onClick={() => { setActiveCategoryId(c.id as any); setPage(0); }}
            className={`px-4 py-2.5 text-xs font-bold tracking-wide whitespace-nowrap border-b-2 transition-colors ${
              activeCategoryId === c.id
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-400 hover:text-gray-700"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div className="flex items-stretch gap-2 mb-3">
        {/* Search field selector */}
        <select
          value={searchField}
          onChange={(e) => { setSearchField(e.target.value as SearchField); setPage(0); }}
          className="border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:border-gray-900 bg-white flex-shrink-0"
        >
          {(Object.entries(SEARCH_FIELD_LABELS) as [SearchField, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        {/* Search input */}
        <div className="flex items-center gap-2 border border-gray-200 px-3 py-1.5 flex-1 focus-within:border-gray-900 transition-colors">
          <Search size={12} className="text-gray-400 flex-shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Buscar por ${SEARCH_FIELD_LABELS[searchField].toLowerCase()}...`}
            className="text-sm outline-none flex-1 bg-transparent"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-gray-300 hover:text-gray-900">
              <X size={11} />
            </button>
          )}
        </div>

        {/* Group by selector */}
        <select
          value={groupBy}
          onChange={(e) => { setGroupBy(e.target.value as GroupBy); setCollapsedGroups(new Set()); }}
          className="border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:border-gray-900 bg-white flex-shrink-0"
          title="Agrupar por"
        >
          <option value="none">Sem agrupamento</option>
          <option value="category">Agrupar por Categoria</option>
          <option value="supplier">Agrupar por Fornecedor</option>
          <option value="manufacturer">Agrupar por Fabricante</option>
        </select>
        {/* Toggle advanced filters */}
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className={`flex items-center gap-2 border px-3 py-1.5 text-xs font-semibold transition-colors flex-shrink-0 ${
            showAdvanced || hasActiveFilters
              ? "border-gray-900 bg-gray-900 text-white"
              : "border-gray-200 text-gray-600 hover:border-gray-900"
          }`}
        >
          <Filter size={12} />
          Filtros
          {hasActiveFilters && (
            <span className="w-4 h-4 bg-blue-800 text-white text-[9px] font-black flex items-center justify-center rounded-full">
              !
            </span>
          )}
        </button>
      </div>

      {/* Advanced filters panel */}
      {showAdvanced && (
        <div className="border border-gray-200 p-4 mb-4 bg-gray-50">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {activeCategoryId !== undefined && (
              <div className="col-span-2 md:col-span-3 lg:col-span-4">
                <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">Categorias Adicionais (multi-seleção)</label>
                <div className="flex flex-wrap gap-1.5">
                  {(categories ?? []).filter((c) => c.id !== activeCategoryId).map((c) => {
                    const sel = extraCategoryIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setExtraCategoryIds((prev) =>
                            sel ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                          );
                          setPage(0);
                        }}
                        className={`flex items-center gap-1 px-2 py-1 text-[10px] font-bold border transition-colors ${
                          sel
                            ? "bg-gray-900 text-white border-gray-900"
                            : "border-gray-200 text-gray-600 hover:border-gray-900"
                        }`}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: c.color ?? "#DC2626" }}
                        />
                        {c.name}
                      </button>
                    );
                  })}
                </div>
                {extraCategoryIds.length > 0 && (
                  <p className="text-[10px] text-gray-400 mt-1">
                    Exibindo produtos de {1 + extraCategoryIds.length} categorias simultaneamente.
                  </p>
                )}
              </div>
            )}
            <div>
              <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">Fornecedor</label>
              <select
                value={filterSupplier ?? ""}
                onChange={(e) => { setFilterSupplier(e.target.value ? Number(e.target.value) : undefined); setPage(0); }}
                className="w-full border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:border-gray-900 bg-white"
              >
                <option value="">Todos</option>
                {suppliers?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">Fabricante</label>
              <input
                type="text"
                value={filterManufacturer}
                onChange={(e) => { setFilterManufacturer(e.target.value); setPage(0); }}
                placeholder="Filtrar por fabricante..."
                className="w-full border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:border-gray-900"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">Status</label>
              <select
                value={filterIsActive}
                onChange={(e) => { setFilterIsActive(e.target.value as any); setPage(0); }}
                className="w-full border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:border-gray-900 bg-white"
              >
                <option value="yes">Somente ativos</option>
                <option value="no">Somente inativos</option>
                <option value="all">Todos (ativos + inativos)</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">Faixa de Preço (R$)</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={filterPriceMin}
                  onChange={(e) => { setFilterPriceMin(e.target.value); setPage(0); }}
                  placeholder="Mín"
                  className="w-full border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:border-gray-900"
                />
                <span className="text-gray-300 text-xs">—</span>
                <input
                  type="number"
                  value={filterPriceMax}
                  onChange={(e) => { setFilterPriceMax(e.target.value); setPage(0); }}
                  placeholder="Máx"
                  className="w-full border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:border-gray-900"
                />
              </div>
            </div>
            <div className="flex items-end gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterHasImage}
                  onChange={(e) => { setFilterHasImage(e.target.checked); setPage(0); }}
                  className="accent-gray-900"
                />
                <span className="text-xs text-gray-700">Com imagem</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterHasLink}
                  onChange={(e) => { setFilterHasLink(e.target.checked); setPage(0); }}
                  className="accent-gray-900"
                />
                <span className="text-xs text-gray-700">Com link</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer" title="Exibir apenas produtos com campos incompletos (PA, concentração, forma farm., fabricante, imagem ou EAN faltando)">
                <input
                  type="checkbox"
                  checked={filterIncomplete}
                  onChange={(e) => { setFilterIncomplete(e.target.checked); setPage(0); }}
                  className="accent-red-600"
                />
                <span className="text-xs text-red-700 font-semibold">Incompletos</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer" title="Exibir apenas produtos sem ficha técnica (princípio ativo / composição)">
                <input
                  type="checkbox"
                  checked={filterWithoutFichaTecnica}
                  onChange={(e) => { setFilterWithoutFichaTecnica(e.target.checked); setPage(0); }}
                  className="accent-purple-600"
                />
                <span className="text-xs text-purple-700 font-semibold">Sem Ficha Técnica</span>
              </label>
            </div>
          </div>
          {hasActiveFilters && (
            <div className="mt-3 pt-3 border-t border-gray-200 flex justify-end">
              <button onClick={clearAllFilters} className="flex items-center gap-1.5 text-xs text-blue-800 font-semibold hover:underline">
                <X size={11} /> Limpar todos os filtros
              </button>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="py-12 text-center">
          <div className="w-6 h-1 bg-gray-200 mx-auto mb-3 animate-pulse" />
          <p className="text-xs text-gray-400">Carregando produtos...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="border border-gray-200 py-16 text-center">
          <Package size={24} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400">Nenhum produto encontrado com os filtros aplicados.</p>
          {hasActiveFilters && (
            <button onClick={clearAllFilters} className="mt-3 text-xs text-blue-800 font-semibold hover:underline">
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200">
          <table className="its-table">
            <thead>
              <tr>
                <th className="w-8 text-center">
                  <button onClick={toggleAll} className="text-gray-400 hover:text-gray-900">
                    {allSelected ? <CheckSquare size={13} className="text-blue-800" /> : someSelected ? <CheckSquare size={13} className="text-gray-300" /> : <Square size={13} />}
                  </button>
                </th>
                <th className="w-10 text-center">Img</th>
                <th className="cursor-pointer" onClick={() => handleSort("name")}>
                  <span className="flex items-center gap-1">Produto <SortIcon field="name" /></span>
                </th>
                <th>Categoria</th>
                <th>Ficha Técnica</th>
                <th>Apresentação</th>
                <th className="cursor-pointer" onClick={() => handleSort("manufacturer")}>
                  <span className="flex items-center gap-1">Fabricante <SortIcon field="manufacturer" /></span>
                </th>
                <th className="cursor-pointer" onClick={() => handleSort("price")}>
                  <span className="flex items-center gap-1">Preço <SortIcon field="price" /></span>
                </th>
                <th className="cursor-pointer" onClick={() => handleSort("mapa")}>
                  <span className="flex items-center gap-1">MAPA/ANVISA/FORN <SortIcon field="mapa" /></span>
                </th>
                <th>EAN / GTIN</th>
                <th>Cód. Fornecedor</th>
                <th>Link</th>
                <th>URL Imagem</th>
                <th title="Score de qualidade do produto (campos preenchidos)">Qual.</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                // Helper: render a single product row with inline editing
                const renderRow = (p: typeof items[0]) => {
                  const isEditing = (field: string) => inlineEdit?.id === p.id && inlineEdit?.field === field;
                  const cellClass = "group cursor-text";
                  const inlineInput = (field: string, type = "text") => (
                    isEditing(field) ? (
                      <input
                        autoFocus
                        type={type}
                        value={inlineEdit!.value}
                        onChange={(e) => setInlineEdit((prev) => prev ? { ...prev, value: e.target.value } : prev)}
                        onBlur={commitInline}
                        onKeyDown={(e) => { if (e.key === "Enter") commitInline(); if (e.key === "Escape") setInlineEdit(null); }}
                        className="w-full border border-blue-400 px-1 py-0.5 text-xs outline-none bg-blue-50 min-w-0"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : null
                  );
                  return (
                    <tr key={p.id} className={selectedIds.has(p.id) ? "bg-blue-50/60" : ""}>
                  <td className="text-center">
                    <button onClick={() => toggleOne(p.id)} className="text-gray-400 hover:text-gray-900">
                      {selectedIds.has(p.id) ? <CheckSquare size={13} className="text-blue-800" /> : <Square size={13} />}
                    </button>
                  </td>
                  {/* Image thumbnail */}
                  <td className="text-center">
                    {p.imageUrl ? (
                      <div className="group relative inline-block">
                        <img
                          src={p.imageUrl}
                          alt=""
                          className="w-8 h-8 object-contain border border-gray-100 cursor-pointer"
                          onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.2"; }}
                        />
                        {/* Hover popup */}
                        <div className="absolute left-10 top-0 z-30 hidden group-hover:block bg-white border border-gray-900 shadow-xl p-2 w-40">
                          <img src={p.imageUrl} alt={p.name} className="w-full object-contain max-h-36" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          <div className="text-[9px] text-gray-400 mt-1 truncate">{p.name}</div>
                        </div>
                      </div>
                    ) : (
                      <ImageIcon size={12} className="text-gray-200 mx-auto" />
                    )}
                  </td>
                  {/* Produto (Nome) */}
                  <td className={cellClass} onDoubleClick={() => startInline(p.id, "name", p.name ?? "")} title="Clique duplo para editar">
                    {isEditing("name") ? inlineInput("name") : (
                      <div className="max-w-44 flex items-start gap-1">
                        <div>
                          <div className="text-xs font-semibold text-gray-900 leading-tight">{p.name}</div>
                          {(p as any).subcategoria && <div className="text-[9px] text-blue-600">{(p as any).subcategoria}</div>}
                        </div>
                        <Pencil size={9} className="text-gray-200 group-hover:text-gray-400 flex-shrink-0 mt-0.5" />
                      </div>
                    )}
                  </td>
                  {/* Categoria */}
                  <td>
                    {p.categoryName ? (
                      <span className="category-badge" style={{ color: p.categoryColor ?? "#374151" }}>
                        {p.categoryName}
                      </span>
                    ) : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  {/* Ficha Técnica */}
                  <td className={`${cellClass} max-w-32`} onDoubleClick={() => startInline(p.id, "fichaTecnica", (p as any).fichaTecnica ?? "")} title="Clique duplo para editar ficha técnica">
                    {isEditing("fichaTecnica") ? inlineInput("fichaTecnica") : (() => {
                      const ft = (p as any).fichaTecnica as string | undefined;
                      if (!ft) return (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-gray-300">sem ficha</span>
                          <Pencil size={9} className="text-gray-200 group-hover:text-gray-400 flex-shrink-0" />
                        </div>
                      );
                      let parsed: Record<string, string> | null = null;
                      try { parsed = JSON.parse(ft); } catch {}
                      const ftFields = parsed && typeof parsed === "object" ? [
                        { key: "principioAtivo", label: "Princípio Ativo" },
                        { key: "concentracao", label: "Concentração" },
                        { key: "formaFarmaceutica", label: "Forma Farmacêutica" },
                        { key: "classeTerapeutica", label: "Classe Terapêutica" },
                        { key: "especieAlvo", label: "Espécie-Alvo" },
                        { key: "indicacoes", label: "Indicações" },
                      ].filter((f) => parsed![f.key]) : [];
                      return (
                        <div className="group/ft relative flex items-center gap-1 cursor-default">
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0" title="Ficha técnica disponível" />
                            <span className="text-xs text-purple-700 truncate max-w-24">
                              {parsed ? `${ftFields.length} campos` : ft.substring(0, 20) + (ft.length > 20 ? "..." : "")}
                            </span>
                            <Pencil size={9} className="text-gray-200 group-hover:text-gray-400 flex-shrink-0" />
                          </div>
                          {/* Popover ao hover */}
                          <div className="absolute left-0 top-full mt-1 z-50 hidden group-hover/ft:block bg-white border border-purple-200 shadow-xl p-3 w-64 pointer-events-none">
                            <div className="text-[9px] font-bold uppercase tracking-widest text-purple-600 mb-2">Ficha Técnica</div>
                            {parsed && ftFields.length > 0 ? (
                              <div className="space-y-1.5">
                                {ftFields.map((f) => (
                                  <div key={f.key}>
                                    <div className="text-[9px] font-bold uppercase text-purple-400 tracking-wider">{f.label}</div>
                                    <div className="text-xs text-gray-800">{parsed![f.key]}</div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-gray-600 leading-relaxed">{ft}</p>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  {/* Apresentação */}
                  <td className={`${cellClass} max-w-24`} onDoubleClick={() => startInline(p.id, "presentation", p.presentation ?? "")} title="Clique duplo para editar apresentação">
                    {isEditing("presentation") ? inlineInput("presentation") : (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-600 truncate">{p.presentation ?? "—"}</span>
                        <Pencil size={9} className="text-gray-200 group-hover:text-gray-400 flex-shrink-0" />
                      </div>
                    )}
                  </td>
                  {/* Fabricante */}
                  <td className={`${cellClass} max-w-28`} onDoubleClick={() => startInline(p.id, "manufacturer", (p as any).manufacturer ?? "")} title="Clique duplo para editar fabricante">
                    {isEditing("manufacturer") ? inlineInput("manufacturer") : (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-600 truncate">{(p as any).manufacturer ?? "—"}</span>
                        <Pencil size={9} className="text-gray-200 group-hover:text-gray-400 flex-shrink-0" />
                      </div>
                    )}
                  </td>
                  {/* Preço */}
                  <td className={cellClass} onDoubleClick={() => startInline(p.id, "price", p.price ?? "")} title="Clique duplo para editar preço">
                    {isEditing("price") ? inlineInput("price", "number") : (
                      <div className="flex items-start gap-1">
                        <div>
                          {p.price ? (
                            <>
                              <span className="price-display text-sm font-bold text-gray-900">
                                R$ {parseFloat(p.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </span>
                              {p.priceUnit && <div className="text-[9px] text-gray-400">/{p.priceUnit}</div>}
                            </>
                          ) : <span className="text-xs text-gray-300">—</span>}
                        </div>
                        <Pencil size={9} className="text-gray-200 group-hover:text-gray-400 flex-shrink-0 mt-1" />
                      </div>
                    )}
                  </td>
                  {/* MAPA / ANVISA / FORN */}
                  <td className={cellClass} onDoubleClick={() => startInline(p.id, "mapa", p.mapa ?? "")} title="Clique duplo para editar MAPA/ANVISA/FORN">
                    {isEditing("mapa") ? inlineInput("mapa") : (
                      <div className="flex items-center gap-1">
                        {p.mapa ? <span className="font-mono text-xs text-gray-600">{p.mapa}</span> : <span className="text-xs text-gray-300">—</span>}
                        <Pencil size={9} className="text-gray-200 group-hover:text-gray-400 flex-shrink-0" />
                      </div>
                    )}
                  </td>
                  {/* EAN / GTIN */}
                  <td className={cellClass} onDoubleClick={() => startInline(p.id, "barcode", p.barcode ?? "")} title="Clique duplo para editar EAN">
                    {isEditing("barcode") ? inlineInput("barcode") : (
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-[10px] text-gray-600">{p.barcode ?? (p as any).gtin ?? "—"}</span>
                        <Pencil size={9} className="text-gray-200 group-hover:text-gray-400 flex-shrink-0" />
                      </div>
                    )}
                  </td>
                  {/* Código Fornecedor */}
                  <td className={cellClass} onDoubleClick={() => startInline(p.id, "codigoFornecedor", (p as any).codigoFornecedor ?? "")} title="Clique duplo para editar código fornecedor">
                    {isEditing("codigoFornecedor") ? inlineInput("codigoFornecedor") : (
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-[10px] text-gray-600">{(p as any).codigoFornecedor ?? "—"}</span>
                        <Pencil size={9} className="text-gray-200 group-hover:text-gray-400 flex-shrink-0" />
                      </div>
                    )}
                  </td>
                  {/* Link do Produto */}
                  <td>
                    {p.productUrl ? (
                      <a href={p.productUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[10px] font-bold text-blue-800 hover:underline whitespace-nowrap"
                        title={p.productUrl}
                      >
                        <ExternalLink size={10} /> Ver
                      </a>
                    ) : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  {/* URL da Imagem */}
                  <td className={cellClass} onDoubleClick={() => startInline(p.id, "imageUrl", p.imageUrl ?? "")} title="Clique duplo para editar URL da imagem">
                    {isEditing("imageUrl") ? inlineInput("imageUrl") : (
                      <div className="flex items-center gap-1">
                        {p.imageUrl ? (
                          <a href={p.imageUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 truncate max-w-20 hover:underline" title={p.imageUrl}>
                            <ImageIcon size={10} className="inline mr-0.5" />URL
                          </a>
                        ) : <span className="text-xs text-gray-300">—</span>}
                        <Pencil size={9} className="text-gray-200 group-hover:text-gray-400 flex-shrink-0" />
                      </div>
                    )}
                  </td>
                  {/* Qualidade */}
                  <td>
                    <QualityBadge product={p as unknown as Record<string, unknown>} />
                  </td>
                  {/* Status */}
                  <td>
                    <span className={`text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 ${p.isActive === "yes" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                      {p.isActive === "yes" ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditProduct(p)} className="text-gray-300 hover:text-gray-900 transition-colors p-1" title="Editar">
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={() => { if (confirm(`Excluir "${p.name}"?`)) deleteProduct.mutate({ id: p.id }); }}
                        className="text-gray-200 hover:text-blue-800 transition-colors p-1" title="Excluir"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                    </tr>
                  );
                };
                // Render with or without grouping
                if (groupBy === "none") {
                  return items.map((p) => renderRow(p));
                }
                // Group items
                const groupKey = (p: typeof items[0]): string => {
                  if (groupBy === "category") return p.categoryName ?? "(sem categoria)";
                  if (groupBy === "supplier") return p.supplierName ?? "(sem fornecedor)";
                  if (groupBy === "manufacturer") return (p as any).manufacturer ?? "(sem fabricante)";
                  return "";
                };
                const grouped = new Map<string, typeof items>();
                for (const p of items) {
                  const k = groupKey(p);
                  if (!grouped.has(k)) grouped.set(k, []);
                  grouped.get(k)!.push(p);
                }
                const sortedKeys = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b, "pt-BR"));
                return sortedKeys.flatMap((key) => {
                  const group = grouped.get(key)!;
                  const collapsed = collapsedGroups.has(key);
                  return [
                    <tr key={`group-${key}`} className="bg-gray-100 border-t-2 border-gray-300">
                      <td colSpan={16} className="py-1.5 px-3">
                        <button
                          onClick={() => toggleGroup(key)}
                          className="flex items-center gap-2 text-xs font-bold text-gray-700 hover:text-gray-900 w-full text-left"
                        >
                          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                          <LayoutList size={12} className="text-gray-400" />
                          <span>{key}</span>
                          <span className="ml-1 text-[10px] font-normal text-gray-400">({group.length} produto{group.length !== 1 ? "s" : ""})</span>
                        </button>
                      </td>
                    </tr>,
                    ...(collapsed ? [] : group.map((p) => renderRow(p))),
                  ];
                });
              })()}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">
              {total.toLocaleString("pt-BR")} produtos{totalPages > 1 ? ` · Página ${page + 1} de ${totalPages}` : ""}
            </span>
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-400">Exibir:</span>
              {[25, 50, 100, 200].map((size) => (
                <button
                  key={size}
                  onClick={() => { setPageSize(size); setPage(0); setSelectedIds(new Set()); }}
                  className={`px-2 py-1 text-xs border transition-colors ${
                    pageSize === size
                      ? "border-gray-900 bg-gray-900 text-white font-semibold"
                      : "border-gray-200 hover:border-gray-500 text-gray-600"
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(0)} disabled={page === 0} className="px-2 py-1.5 border border-gray-200 text-xs disabled:opacity-40 hover:border-gray-900 transition-colors">«</button>
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1.5 border border-gray-200 text-xs font-semibold disabled:opacity-40 hover:border-gray-900 transition-colors">Anterior</button>
              <span className="px-3 py-1.5 text-xs text-gray-500 border border-gray-100">{page + 1}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 py-1.5 border border-gray-200 text-xs font-semibold disabled:opacity-40 hover:border-gray-900 transition-colors">Próxima</button>
              <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} className="px-2 py-1.5 border border-gray-200 text-xs disabled:opacity-40 hover:border-gray-900 transition-colors">»</button>
            </div>
          )}
        </div>
      )}

      {/* Edit modal */}
      {editProduct && (
        <EditModal
          product={editProduct}
          categories={categories ?? []}
          suppliers={suppliers ?? []}
          onClose={() => setEditProduct(null)}
          onSaved={() => setEditProduct(null)}
        />
      )}

      {/* New product modal */}
      {showNewProduct && (
        <NewProductModal
          categories={categories ?? []}
          suppliers={suppliers ?? []}
          onClose={() => setShowNewProduct(false)}
          onCreate={(data) => createProductMutation.mutate(data as any)}
          isPending={createProductMutation.isPending}
        />
      )}
      {/* Duplicates modal */}
      {showDuplicates && (
        <DuplicatesModal
          onClose={() => setShowDuplicates(false)}
          onMerged={() => { utils.products.list.invalidate(); }}
        />
      )}

      {/* Modal Enriquecer Ficha Técnica */}
      {showEnrichModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md shadow-2xl border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-purple-50">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-purple-600" />
                <span className="text-sm font-black text-gray-900">Enriquecer Ficha Técnica com IA</span>
              </div>
              <button onClick={() => { setShowEnrichModal(false); setEnrichResult(null); }} className="text-gray-400 hover:text-gray-700"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              {!enrichResult ? (
                <>
                  <div>
                    <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Escopo do Enriquecimento</div>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="enrichScope" value="withoutFicha" checked={enrichScope === "withoutFicha"} onChange={() => setEnrichScope("withoutFicha")} className="accent-purple-600" />
                        <span className="text-sm text-gray-700">Apenas produtos <strong>sem ficha técnica</strong></span>
                      </label>
                      {selectedIds.size > 0 && (
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="enrichScope" value="selected" checked={enrichScope === "selected"} onChange={() => setEnrichScope("selected")} className="accent-purple-600" />
                          <span className="text-sm text-gray-700">Apenas os <strong>{selectedIds.size} produtos selecionados</strong></span>
                        </label>
                      )}
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="enrichScope" value="all" checked={enrichScope === "all"} onChange={() => { setEnrichScope("all"); setEnrichOverwrite(true); }} className="accent-purple-600" />
                        <span className="text-sm text-gray-700">Todos os produtos <span className="text-red-600 font-semibold">(sobrescreve fichas existentes)</span></span>
                      </label>
                    </div>
                  </div>
                  {enrichScope !== "all" && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={enrichOverwrite} onChange={(e) => setEnrichOverwrite(e.target.checked)} className="accent-purple-600" />
                      <span className="text-sm text-gray-700">Sobrescrever fichas já preenchidas</span>
                    </label>
                  )}
                  <div className="bg-purple-50 border border-purple-200 p-3 text-[11px] text-purple-800">
                    <strong>Como funciona:</strong> A IA analisa o nome de cada produto e extrai: princípio ativo / composição, concentração, forma farmacêutica e classe terapêutica. Processado em lotes de 30 produtos.
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => { setShowEnrichModal(false); setEnrichResult(null); }}
                      className="flex-1 px-4 py-2 border border-gray-300 text-sm font-semibold text-gray-700 hover:border-gray-900 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => startEnrichLoop(enrichScope, enrichOverwrite, enrichScope === "selected" ? Array.from(selectedIds) : undefined)}
                      disabled={enrichRunning}
                      className="flex-1 flex items-center justify-center gap-2 bg-purple-600 text-white px-4 py-2 text-sm font-bold hover:bg-purple-700 transition-colors disabled:opacity-50"
                    >
                      {enrichRunning ? (
                        <><Loader2 size={14} className="animate-spin" /> Enriquecendo...</>
                      ) : (
                        <><Sparkles size={14} /> Iniciar Enriquecimento</>
                      )}
                    </button>
                    {enrichRunning && enrichProgress && (
                      <div className="w-full mt-2">
                        <div className="flex justify-between text-[10px] text-purple-700 font-semibold mb-1">
                          <span>{enrichProgress.processed.toLocaleString()} / {enrichProgress.total.toLocaleString()} produtos</span>
                          <span>{enrichProgress.total > 0 ? Math.round(enrichProgress.processed / enrichProgress.total * 100) : 0}%</span>
                        </div>
                        <div className="w-full bg-purple-100 rounded-full h-2">
                          <div className="bg-purple-600 h-2 rounded-full transition-all duration-300" style={{ width: `${enrichProgress.total > 0 ? (enrichProgress.processed / enrichProgress.total * 100) : 0}%` }} />
                        </div>
                        <div className="text-[10px] text-gray-500 mt-1">{enrichProgress.updated} atualizados &bull; {enrichProgress.errors} erros</div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col items-center gap-3 py-4">
                    <CheckCircle2 size={40} className="text-emerald-500" />
                    <div className="text-base font-black text-gray-900">Enriquecimento concluído!</div>
                    <div className="grid grid-cols-3 gap-3 w-full mt-2">
                      <div className="text-center p-3 bg-emerald-50 border border-emerald-200">
                        <div className="text-2xl font-black text-emerald-700">{enrichResult.updated}</div>
                        <div className="text-[10px] font-bold text-emerald-600 uppercase">Atualizados</div>
                      </div>
                      <div className="text-center p-3 bg-gray-50 border border-gray-200">
                        <div className="text-2xl font-black text-gray-700">{enrichResult.skipped}</div>
                        <div className="text-[10px] font-bold text-gray-500 uppercase">Ignorados</div>
                      </div>
                      <div className="text-center p-3 bg-red-50 border border-red-200">
                        <div className="text-2xl font-black text-red-700">{enrichResult.errors}</div>
                        <div className="text-[10px] font-bold text-red-500 uppercase">Erros</div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">{enrichResult.total} produto(s) processado(s) no total</div>
                  </div>
                  <button
                    onClick={() => { setShowEnrichModal(false); setEnrichResult(null); }}
                    className="w-full px-4 py-2 bg-gray-900 text-white text-sm font-bold hover:bg-purple-700 transition-colors"
                  >
                    Fechar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showReclassifyModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">          <div className="bg-white w-full max-w-md mx-4 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-indigo-50">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-indigo-600" />
                <span className="text-sm font-black text-gray-900">Reclassificar Categorias com IA</span>
              </div>
              <button onClick={() => { setShowReclassifyModal(false); setReclassifyResult(null); }} className="text-gray-400 hover:text-gray-700"><X size={16} /></button>
            </div>

            <div className="p-5 space-y-4">
              {!reclassifyResult ? (
                <>
                  {/* Escopo */}
                  <div>
                    <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Escopo da Reclassificação</div>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="scope" value="uncategorized" checked={reclassifyScope === "uncategorized"} onChange={() => setReclassifyScope("uncategorized")} className="accent-indigo-600" />
                        <span className="text-sm text-gray-700">Apenas produtos <strong>sem categoria</strong></span>
                      </label>
                      {selectedIds.size > 0 && (
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="scope" value="selected" checked={reclassifyScope === "selected"} onChange={() => setReclassifyScope("selected")} className="accent-indigo-600" />
                          <span className="text-sm text-gray-700">Apenas os <strong>{selectedIds.size} produtos selecionados</strong></span>
                        </label>
                      )}
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="scope" value="all" checked={reclassifyScope === "all"} onChange={() => { setReclassifyScope("all"); setReclassifyIncludeExisting(true); }} className="accent-indigo-600" />
                        <span className="text-sm text-gray-700">Todos os produtos do catálogo <span className="text-red-600 font-semibold">(sobrescreve categorias existentes)</span></span>
                      </label>
                    </div>
                  </div>

                  {reclassifyScope !== "all" && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={reclassifyIncludeExisting} onChange={(e) => setReclassifyIncludeExisting(e.target.checked)} className="accent-indigo-600" />
                      <span className="text-sm text-gray-700">Incluir produtos já categorizados (sobrescrever)</span>
                    </label>
                  )}

                  <div className="bg-indigo-50 border border-indigo-200 p-3 text-[11px] text-indigo-800">
                    <strong>Como funciona:</strong> A IA analisa o nome, princípio ativo, fabricante e apresentação de cada produto e atribui a categoria e subcategoria mais adequada do catálogo. Processado em lotes de 50 produtos.
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => { setShowReclassifyModal(false); setReclassifyResult(null); }}
                      className="flex-1 px-4 py-2 border border-gray-300 text-sm font-semibold text-gray-700 hover:border-gray-900 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => startReclassifyLoop(reclassifyScope === "selected" ? Array.from(selectedIds) : undefined, reclassifyScope === "all" ? true : reclassifyIncludeExisting)}
                      disabled={reclassifyRunning}
                      className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2 text-sm font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
                    >
                      {reclassifyRunning ? (
                        <><Loader2 size={14} className="animate-spin" /> Classificando...</>
                      ) : (
                        <><Sparkles size={14} /> Iniciar Reclassificação</>
                      )}
                    </button>
                    {reclassifyRunning && reclassifyProgress && (
                      <div className="w-full mt-2">
                        <div className="flex justify-between text-[10px] text-indigo-700 font-semibold mb-1">
                          <span>{reclassifyProgress.processed.toLocaleString()} / {reclassifyProgress.total.toLocaleString()} produtos</span>
                          <span>{reclassifyProgress.total > 0 ? Math.round(reclassifyProgress.processed / reclassifyProgress.total * 100) : 0}%</span>
                        </div>
                        <div className="w-full bg-indigo-100 rounded-full h-2">
                          <div className="bg-indigo-600 h-2 rounded-full transition-all duration-300" style={{ width: `${reclassifyProgress.total > 0 ? (reclassifyProgress.processed / reclassifyProgress.total * 100) : 0}%` }} />
                        </div>
                        <div className="text-[10px] text-gray-500 mt-1">{reclassifyProgress.updated} categorizados &bull; {reclassifyProgress.errors} erros</div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* Resultado */
                <>
                  <div className="flex flex-col items-center gap-3 py-4">
                    <CheckCircle2 size={40} className="text-emerald-500" />
                    <div className="text-base font-black text-gray-900">Reclassificação concluída!</div>
                    <div className="grid grid-cols-3 gap-3 w-full mt-2">
                      <div className="text-center p-3 bg-emerald-50 border border-emerald-200">
                        <div className="text-2xl font-black text-emerald-700">{reclassifyResult.updated}</div>
                        <div className="text-[10px] font-bold text-emerald-600 uppercase">Atualizados</div>
                      </div>
                      <div className="text-center p-3 bg-gray-50 border border-gray-200">
                        <div className="text-2xl font-black text-gray-700">{reclassifyResult.skipped}</div>
                        <div className="text-[10px] font-bold text-gray-500 uppercase">Ignorados</div>
                      </div>
                      <div className="text-center p-3 bg-red-50 border border-red-200">
                        <div className="text-2xl font-black text-red-700">{reclassifyResult.errors}</div>
                        <div className="text-[10px] font-bold text-red-500 uppercase">Erros</div>
                      </div>
                    </div>
                    {reclassifyResult.total === 0 ? (
                      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 text-center">
                        Nenhum produto encontrado no escopo selecionado. Todos os produtos já estão categorizados, ou nenhum produto foi selecionado.
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500">{reclassifyResult.total.toLocaleString()} produto(s) processado(s) no total</div>
                    )}
                  </div>
                  <button
                    onClick={() => { setShowReclassifyModal(false); setReclassifyResult(null); }}
                    className="w-full px-4 py-2 bg-gray-900 text-white text-sm font-bold hover:bg-indigo-700 transition-colors"
                  >
                    Fechar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal Exportar Excel ─────────────────────────────────────────────── */}
      {showExcelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white w-full max-w-md mx-4 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={18} className="text-green-600" />
                <h2 className="text-base font-bold text-gray-900">Exportar Catálogo em Excel</h2>
              </div>
              <button onClick={() => setShowExcelModal(false)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-gray-600">Escolha o escopo da exportação:</p>
              <div className="space-y-2">
                {([
                  { value: "filtered", label: "Produtos com filtros atuais", desc: "Exporta apenas os produtos visíveis com os filtros aplicados" },
                  { value: "all", label: "Todos os produtos (catálogo completo)", desc: "Exporta todos os produtos ativos e inativos — ideal para backup" },
                  { value: "current", label: "Apenas produtos SEM ficha técnica", desc: "Exporta apenas produtos sem ficha técnica para correção manual" },
                ] as const).map(opt => (
                  <label key={opt.value} className={`flex items-start gap-3 p-3 border cursor-pointer transition-colors ${
                    excelExportScope === opt.value ? "border-green-500 bg-green-50" : "border-gray-200 hover:border-gray-400"
                  }`}>
                    <input type="radio" name="excelScope" value={opt.value}
                      checked={excelExportScope === opt.value}
                      onChange={() => setExcelExportScope(opt.value)}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{opt.label}</p>
                      <p className="text-xs text-gray-500">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
              <div className="space-y-2 text-xs text-gray-500">
                <p>💡 <strong>Dica:</strong> Use "Apenas produtos SEM ficha técnica" para exportar os 8.612 produtos que precisam de enriquecimento via IA.</p>
                <p>O arquivo Excel exportado pode ser editado e reimportado para atualizar os produtos em massa.</p>
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={() => setShowExcelModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button
                onClick={() => exportExcel(excelExportScope)}
                disabled={excelExporting}
                className="flex-1 px-4 py-2 bg-green-600 text-white text-sm font-bold hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {excelExporting ? <><Loader2 size={14} className="animate-spin" /> Exportando...</> : <><FileSpreadsheet size={14} /> Exportar Excel</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal Importar Excel para atualização em massa ─────────────────── */}
      {showImportExcelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white w-full max-w-lg mx-4 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <Upload size={18} className="text-blue-600" />
                <h2 className="text-base font-bold text-gray-900">Atualizar Produtos por Excel</h2>
              </div>
              <button onClick={() => { setShowImportExcelModal(false); setImportExcelFile(null); setImportExcelResult(null); }} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {!importExcelResult ? (
                <>
                  <div className="bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800 space-y-1">
                    <p className="font-bold">Como funciona:</p>
                    <p>1. Exporte o catálogo em Excel, edite os campos desejados e salve.</p>
                    <p>2. Importe o arquivo aqui — o sistema atualiza os produtos pelo <strong>ID</strong> ou <strong>EAN/Código de Barras</strong>.</p>
                    <p>3. Campos em branco na planilha serão ignorados (não apagam o valor existente).</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Selecionar arquivo Excel (.xlsx)</label>
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={(e) => setImportExcelFile(e.target.files?.[0] ?? null)}
                      className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:border file:border-gray-300 file:text-sm file:font-semibold file:bg-gray-50 hover:file:bg-gray-100 cursor-pointer"
                    />
                    {importExcelFile && (
                      <p className="text-xs text-gray-500 mt-1">{importExcelFile.name} ({(importExcelFile.size / 1024).toFixed(0)} KB)</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={20} className="text-green-500" />
                    <p className="text-base font-bold text-gray-900">Importação concluída!</p>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { label: "Atualizados", value: importExcelResult.updated, color: "text-green-600 bg-green-50 border-green-200" },
                      { label: "Ignorados", value: importExcelResult.skipped, color: "text-gray-600 bg-gray-50 border-gray-200" },
                      { label: "Não encontr.", value: importExcelResult.notFound, color: "text-orange-600 bg-orange-50 border-orange-200" },
                      { label: "Erros", value: importExcelResult.errors, color: "text-red-600 bg-red-50 border-red-200" },
                    ].map(s => (
                      <div key={s.label} className={`border p-2 text-center ${s.color}`}>
                        <p className="text-xl font-black">{s.value}</p>
                        <p className="text-xs font-semibold uppercase tracking-wide">{s.label}</p>
                      </div>
                    ))}
                  </div>
                  {importExcelResult.details.filter(d => d.status !== "updated").length > 0 && (
                    <div className="max-h-40 overflow-y-auto border border-gray-200 text-xs">
                      <table className="w-full">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-2 py-1 text-left font-semibold">Linha</th>
                            <th className="px-2 py-1 text-left font-semibold">Produto</th>
                            <th className="px-2 py-1 text-left font-semibold">Status</th>
                            <th className="px-2 py-1 text-left font-semibold">Detalhe</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importExcelResult.details.filter(d => d.status !== "updated").map((d, i) => (
                            <tr key={i} className="border-t border-gray-100">
                              <td className="px-2 py-1">{d.row}</td>
                              <td className="px-2 py-1 max-w-[120px] truncate">{d.name ?? "-"}</td>
                              <td className="px-2 py-1">
                                <span className={`px-1 py-0.5 text-xs font-semibold ${
                                  d.status === "not_found" ? "bg-orange-100 text-orange-700" :
                                  d.status === "error" ? "bg-red-100 text-red-700" :
                                  "bg-gray-100 text-gray-600"
                                }`}>{d.status === "not_found" ? "Não encontrado" : d.status === "error" ? "Erro" : "Ignorado"}</span>
                              </td>
                              <td className="px-2 py-1 text-gray-500 max-w-[160px] truncate">{d.message ?? ""}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="px-6 pb-5 flex gap-3">
              {!importExcelResult ? (
                <>
                  <button onClick={() => { setShowImportExcelModal(false); setImportExcelFile(null); }}
                    className="flex-1 px-4 py-2 border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                    Cancelar
                  </button>
                  <button
                    onClick={handleImportExcel}
                    disabled={!importExcelFile || importExcelLoading}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    {importExcelLoading ? <><Loader2 size={14} className="animate-spin" /> Importando...</> : <><Upload size={14} /> Importar e Atualizar</>}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => { setShowImportExcelModal(false); setImportExcelFile(null); setImportExcelResult(null); }}
                  className="w-full px-4 py-2 bg-gray-900 text-white text-sm font-bold hover:bg-indigo-700 transition-colors"
                >
                  Fechar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── New Product Modal ────────────────────────────────────────────────────────
function NewProductModal({
  categories,
  suppliers,
  onClose,
  onCreate,
  isPending,
}: {
  categories: any[];
  suppliers: any[];
  onClose: () => void;
  onCreate: (data: any) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    name: "",
    code: "",
    barcode: "",
    activeIngredient: "",
    manufacturer: "",
    concentration: "",
    presentation: "",
    pharmaceuticalForm: "",
    unit: "",
    price: "",
    priceUnit: "",
    mapa: "",
    imageUrl: "",
    productUrl: "",
    stock: "",
    description: "",
    isActive: "yes" as "yes" | "no",
    supplierId: "",
    categoryId: "",
  });
   const [imgError, setImgError] = useState(false);
  const set = (field: string, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (field === "imageUrl") setImgError(false);
  };
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (!form.supplierId) { alert("Selecione um fornecedor."); return; }
    if (!form.categoryId) { alert("Selecione uma categoria."); return; }
    onCreate({
      name: form.name.trim(),
      supplierId: Number(form.supplierId),
      categoryId: Number(form.categoryId),
      code: form.code || null,
      description: form.description || null,
      activeIngredient: form.activeIngredient || null,
      manufacturer: form.manufacturer || null,
      unit: form.unit || null,
      concentration: form.concentration || null,
      presentation: form.presentation || null,
      pharmaceuticalForm: form.pharmaceuticalForm || null,
      price: form.price || null,
      priceUnit: form.priceUnit || null,
      stock: form.stock || null,
      barcode: form.barcode || null,
      mapa: form.mapa || null,
      imageUrl: form.imageUrl || null,
      productUrl: form.productUrl || null,
      isActive: form.isActive,
    });
  };

  const fieldClass = "w-full border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:border-gray-900 bg-white";
  const labelClass = "text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8 px-4">
      <div className="bg-white w-full max-w-3xl border-2 border-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b-2 border-gray-900">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 bg-blue-800 flex items-center justify-center">
              <Plus size={11} className="text-white" />
            </div>
            <div>
              <div className="text-sm font-black text-gray-900">Novo Produto</div>
              <div className="text-[10px] text-gray-400">Cadastro manual de produto</div>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-900 p-1">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Classificação */}
          <div>
            <div className="text-[9px] font-black tracking-widest uppercase text-blue-800 border-b border-blue-100 pb-1 mb-3">Classificação *</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Fornecedor *</label>
                <select required value={form.supplierId} onChange={(e) => set("supplierId", e.target.value)} className={fieldClass}>
                  <option value="">Selecione...</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Categoria *</label>
                <select required value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)} className={fieldClass}>
                  <option value="">Selecione...</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Identificação */}
          <div>
            <div className="text-[9px] font-black tracking-widest uppercase text-blue-800 border-b border-blue-100 pb-1 mb-3">Identificação</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className={labelClass}>Produto *</label>
                <input required type="text" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex: Amoxicilina 500mg" className={fieldClass} />
              </div>
              <div>
                <label className={labelClass}>Status</label>
                <select value={form.isActive} onChange={(e) => set("isActive", e.target.value)} className={fieldClass}>
                  <option value="yes">Ativo</option>
                  <option value="no">Inativo</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Código Interno</label>
                <input type="text" value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="Ex: MED-001" className={fieldClass} />
              </div>
              <div>
                <label className={labelClass}>EAN / GTIN / Código de Barras</label>
                <input type="text" value={form.barcode} onChange={(e) => set("barcode", e.target.value)} placeholder="Ex: 7891234567890" className={fieldClass} />
              </div>
              <div>
                <label className={labelClass}>Estoque</label>
                <input type="text" value={form.stock} onChange={(e) => set("stock", e.target.value)} placeholder="Ex: 100 un" className={fieldClass} />
              </div>
            </div>
          </div>

          {/* Composição */}
          <div>
            <div className="text-[9px] font-black tracking-widest uppercase text-blue-800 border-b border-blue-100 pb-1 mb-3">Composição</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className={labelClass}>Princípio Ativo / Composição</label>
                <input type="text" value={form.activeIngredient} onChange={(e) => set("activeIngredient", e.target.value)} placeholder="Ex: Amoxicilina" className={fieldClass} />
              </div>
              <div>
                <label className={labelClass}>Fabricante / Laboratório</label>
                <input type="text" value={form.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} placeholder="Ex: Eurofarma" className={fieldClass} />
              </div>
              <div>
                <label className={labelClass}>Concentração</label>
                <input type="text" value={form.concentration} onChange={(e) => set("concentration", e.target.value)} placeholder="Ex: 500mg" className={fieldClass} />
              </div>
              <div>
                <label className={labelClass}>Apresentação</label>
                <input type="text" value={form.presentation} onChange={(e) => set("presentation", e.target.value)} placeholder="Ex: Cápsula" className={fieldClass} />
              </div>
              <div>
                <label className={labelClass}>Unidade</label>
                <input type="text" value={form.unit} onChange={(e) => set("unit", e.target.value)} placeholder="Ex: cx c/30" className={fieldClass} />
              </div>
            </div>
          </div>

          {/* Preços */}
          <div>
            <div className="text-[9px] font-black tracking-widest uppercase text-blue-800 border-b border-blue-100 pb-1 mb-3">Preços</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Preço Unitário (R$)</label>
                <input type="number" step="0.01" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="Ex: 25.90" className={fieldClass} />
              </div>
              <div>
                <label className={labelClass}>Unidade do Preço</label>
                <input type="text" value={form.priceUnit} onChange={(e) => set("priceUnit", e.target.value)} placeholder="Ex: por caixa" className={fieldClass} />
              </div>
              <div>
                <label className={labelClass}>MAPA / ANVISA</label>
                <input type="text" value={form.mapa} onChange={(e) => set("mapa", e.target.value)} placeholder="Ex: PA 0012345/2019" className={fieldClass} />
              </div>
            </div>
          </div>

          {/* Imagem e Link */}
          <div>
            <div className="text-[9px] font-black tracking-widest uppercase text-blue-800 border-b border-blue-100 pb-1 mb-3">Imagem e Link</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>URL da Imagem</label>
                <input type="url" value={form.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} placeholder="https://..." className={fieldClass} />
                {form.imageUrl && !imgError && (
                  <img src={form.imageUrl} alt="" className="mt-1 h-12 object-contain border border-gray-100" onError={() => setImgError(true)} />
                )}
              </div>
              <div>
                <label className={labelClass}>Link do Produto</label>
                <input type="url" value={form.productUrl} onChange={(e) => set("productUrl", e.target.value)} placeholder="https://..." className={fieldClass} />
              </div>
            </div>
          </div>

          {/* Descrição */}
          <div>
            <label className={labelClass}>Descrição / Observações Adicionais</label>
            <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="Informações adicionais sobre o produto..." className={`${fieldClass} resize-none`} />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-200 text-xs font-semibold text-gray-600 hover:border-gray-900 transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex items-center gap-2 px-5 py-2 bg-blue-800 text-white text-xs font-bold hover:bg-gray-900 transition-colors disabled:opacity-50"
            >
              <Plus size={11} />
              {isPending ? "Salvando..." : "Criar Produto"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Duplicates Modal ─────────────────────────────────────────────────────────
function DuplicatesModal({
  onClose,
  onMerged,
}: {
  onClose: () => void;
  onMerged: () => void;
}) {
  const [threshold, setThreshold] = useState(0.82);
  const [enabled, setEnabled] = useState(false);
  const [masterIds, setMasterIds] = useState<Record<number, number>>({});
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  const { data: groups, isLoading, refetch } = trpc.products.findDuplicates.useQuery(
    { threshold },
    { enabled }
  );

  const utils = trpc.useUtils();
  const mergeMutation = trpc.products.mergeDuplicates.useMutation({
    onSuccess: (res, vars) => {
      toast.success(`${res.merged} produto${res.merged !== 1 ? "s" : ""} fundido${res.merged !== 1 ? "s" : ""}. ${res.redirected} referência${res.redirected !== 1 ? "s" : ""} redirecionada${res.redirected !== 1 ? "s" : ""}.`);
      setDismissed((prev) => new Set(Array.from(prev).concat([vars.masterId, ...vars.duplicateIds])));
      utils.products.list.invalidate();
      onMerged();
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleScan = () => {
    setEnabled(true);
    refetch();
  };

  const handleMerge = (groupId: number, products: any[]) => {
    const masterId = masterIds[groupId] ?? products[0].id;
    const duplicateIds = products.filter((p) => p.id !== masterId).map((p) => p.id);
    if (duplicateIds.length === 0) { toast.error("Selecione um produto mestre diferente dos duplicados."); return; }
    if (!window.confirm(`Fundir ${duplicateIds.length} produto${duplicateIds.length !== 1 ? "s" : ""} no mestre "${products.find(p => p.id === masterId)?.name}"?\n\nOs duplicados serão desativados e suas referências em propostas serão redirecionadas para o produto mestre.`)) return;
    mergeMutation.mutate({ masterId, duplicateIds });
  };

  const visibleGroups = (groups ?? []).filter((g) => !g.products.some((p) => dismissed.has(p.id)));

  const reasonLabel = (r: string) =>
    r === "same_active_ingredient_and_name" ? "Mesmo princípio ativo + nome similar" : "Nome muito similar";

  const simColor = (s: number) =>
    s >= 0.95 ? "text-red-700 bg-red-50" : s >= 0.85 ? "text-orange-700 bg-orange-50" : "text-yellow-700 bg-yellow-50";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto py-8 px-4">
      <div className="bg-white w-full max-w-4xl border-2 border-gray-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b-2 border-gray-900">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 bg-orange-600 flex items-center justify-center">
              <Copy size={11} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight text-gray-900">Detectar Produtos Duplicados</h2>
              <p className="text-[10px] text-gray-400 mt-0.5">Análise por similaridade de nome e princípio ativo</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 p-1"><X size={16} /></button>
        </div>

        {/* Controls */}
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <div className="flex items-end gap-4 flex-wrap">
            <div>
              <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">
                Sensibilidade ({Math.round(threshold * 100)}%)
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400">50%</span>
                <input
                  type="range"
                  min={0.5}
                  max={0.99}
                  step={0.01}
                  value={threshold}
                  onChange={(e) => setThreshold(parseFloat(e.target.value))}
                  className="w-32 accent-orange-600"
                />
                <span className="text-[10px] text-gray-400">99%</span>
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                {threshold >= 0.9 ? "Alta precisão — apenas nomes quase idênticos" :
                 threshold >= 0.75 ? "Moderada — captura variações de escrita" :
                 "Baixa — pode gerar falsos positivos"}
              </div>
            </div>
            <button
              onClick={handleScan}
              disabled={isLoading}
              className="flex items-center gap-2 bg-orange-600 text-white px-4 py-2 text-xs font-bold hover:bg-orange-700 transition-colors disabled:opacity-50"
            >
              <Search size={12} />
              {isLoading ? "Analisando..." : "Analisar Produtos"}
            </button>
            {groups && (
              <div className="text-xs text-gray-500">
                <span className="font-bold text-gray-900">{visibleGroups.length}</span> grupo{visibleGroups.length !== 1 ? "s" : ""} suspeito{visibleGroups.length !== 1 ? "s" : ""} encontrado{visibleGroups.length !== 1 ? "s" : ""}
              </div>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
          {!enabled && (
            <div className="text-center py-12 text-gray-400">
              <Copy size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-semibold">Clique em "Analisar Produtos" para detectar duplicatas</p>
              <p className="text-xs mt-1">A análise compara nomes e princípios ativos de todos os produtos ativos</p>
            </div>
          )}
          {isLoading && (
            <div className="text-center py-12 text-gray-400">
              <div className="animate-spin w-8 h-8 border-2 border-orange-600 border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-sm">Analisando similaridade entre produtos...</p>
            </div>
          )}
          {!isLoading && enabled && visibleGroups.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Package size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-semibold">Nenhuma duplicata encontrada</p>
              <p className="text-xs mt-1">Tente reduzir a sensibilidade para capturar mais variações</p>
            </div>
          )}
          {visibleGroups.map((group) => {
            const masterId = masterIds[group.groupId] ?? group.products[0].id;
            return (
              <div key={group.groupId} className="mb-4 border border-gray-200 hover:border-orange-300 transition-colors">
                {/* Group header */}
                <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={12} className="text-orange-600" />
                    <span className="text-xs font-semibold text-gray-700">{reasonLabel(group.reason)}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm ${simColor(group.similarity)}`}>
                      {Math.round(group.similarity * 100)}% similar
                    </span>
                    <span className="text-[10px] text-gray-400">{group.products.length} produtos</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setDismissed((prev) => new Set(Array.from(prev).concat(group.products.map(p => p.id))))}
                      className="text-[10px] text-gray-400 hover:text-gray-700 px-2 py-1 border border-gray-200 hover:border-gray-400 transition-colors"
                    >
                      Ignorar
                    </button>
                    <button
                      onClick={() => handleMerge(group.groupId, group.products)}
                      disabled={mergeMutation.isPending}
                      className="flex items-center gap-1.5 text-[10px] font-bold text-white bg-orange-600 hover:bg-orange-700 px-3 py-1 transition-colors disabled:opacity-50"
                    >
                      <GitMerge size={10} />
                      Fundir
                    </button>
                  </div>
                </div>
                {/* Products list */}
                <div className="divide-y divide-gray-100">
                  {group.products.map((p) => (
                    <div
                      key={p.id}
                      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                        p.id === masterId ? "bg-blue-50 border-l-2 border-blue-800" : "hover:bg-gray-50"
                      }`}
                      onClick={() => setMasterIds((prev) => ({ ...prev, [group.groupId]: p.id }))}
                    >
                      <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${
                        p.id === masterId ? "border-blue-800 bg-blue-800" : "border-gray-300"
                      }`} />
                      {p.imageUrl && (
                        <img src={p.imageUrl} alt="" className="w-8 h-8 object-contain border border-gray-100 flex-shrink-0"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-gray-900 truncate">{p.name}</div>
                        <div className="text-[10px] text-gray-400 flex items-center gap-2 flex-wrap">
                          {p.activeIngredient && <span>PA: {p.activeIngredient}</span>}
                          {p.concentration && <span>· {p.concentration}</span>}
                          {p.presentation && <span>· {p.presentation}</span>}
                          <span className="text-gray-300">·</span>
                          <span>{p.supplierName}</span>
                          {p.categoryName && <span>· {p.categoryName}</span>}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {p.price && <div className="text-xs font-bold text-gray-900">R$ {p.price}</div>}
                        <div className={`text-[9px] font-bold px-1 py-0.5 ${p.id === masterId ? "text-blue-800 bg-blue-100" : "text-gray-400 bg-gray-100"}`}>
                          {p.id === masterId ? "MESTRE" : `#${p.id}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-1.5 bg-gray-50 border-t border-gray-100">
                  <p className="text-[10px] text-gray-400">
                    Clique em um produto para definir como <strong>mestre</strong>. Os demais serão desativados e suas referências em propostas redirecionadas.
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 flex justify-between items-center">
          <p className="text-[10px] text-gray-400">
            A fusão desativa os duplicados e redireciona referências em propostas para o produto mestre.
          </p>
          <button onClick={onClose} className="px-4 py-2 border border-gray-200 text-xs font-semibold text-gray-600 hover:border-gray-900 transition-colors">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
