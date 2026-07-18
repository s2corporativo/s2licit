import { trpc } from "@/lib/trpc";
import { formatBRL } from "@/lib/format";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  GitMerge,
  Loader2,
  Package,
  Plus,
  Search,
  ShoppingCart,
  Sparkles,
  Upload,
  X,
  Brain,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type Processo = {
  numero: string;
  modalidade: string;
  orgao: string;
  objeto: string;
};

type ItemEdital = {
  numero: number;
  descricao: string;
  unidade: string;
  quantidade: number;
  precoUnitario?: number | null;
  precoTotal?: number | null;
};

type MatchedItem = {
  itemNumero: number;
  itemDescricao: string;
  itemUnidade: string;
  itemQuantidade: number;
  productId: number | null;
  productName: string | null;
  productPrice: string | null;
  productSupplier: string | null;
  productUnit: string | null;
  productConcentration: string | null;
  productPresentation: string | null;
  productActiveIngredient: string | null;
  productImageUrl: string | null;
  productUrl: string | null;
  confidence: "high" | "medium" | "low" | "none";
  usedFeedback?: boolean;
  itemPrecoUnitario?: number | null;
  itemPrecoTotal?: number | null;
};

// ─── Modal de Cadastro Rápido ─────────────────────────────────────────────────
function CadastroRapidoModal({
  initialName,
  onClose,
  onCreated,
}: {
  initialName: string;
  onClose: () => void;
  onCreated: (product: any) => void;
}) {
  const { data: suppliers = [] } = trpc.suppliers.list.useQuery({});
  const { data: categories = [] } = trpc.categories.list.useQuery();
  const createMutation = trpc.products.create.useMutation();

  const [form, setForm] = useState({
    name: initialName,
    manufacturer: "",
    supplierId: "",
    categoryId: "",
    price: "",
    unit: "",
    activeIngredient: "",
    productUrl: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplierId || !form.categoryId) {
      toast.error("Selecione fornecedor e categoria.");
      return;
    }
    try {
      const result = await createMutation.mutateAsync({
        name: form.name,
        manufacturer: form.manufacturer || null,
        supplierId: Number(form.supplierId),
        categoryId: Number(form.categoryId),
        price: form.price || null,
        unit: form.unit || null,
        activeIngredient: form.activeIngredient || null,
        productUrl: form.productUrl || null,
        isActive: "yes",
      });
      toast.success("Produto cadastrado com sucesso!");
      onCreated(result);
    } catch (err: any) {
      toast.error("Erro ao cadastrar: " + (err?.message ?? "Erro desconhecido"));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white border border-gray-200 shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-blue-900">
          <div className="flex items-center gap-2">
            <Plus size={14} className="text-white" />
            <span className="text-sm font-black text-white uppercase tracking-widest">Cadastro Rápido de Produto</span>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Nome do Produto *</label>
            <input
              className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Fabricante</label>
              <input
                className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                value={form.manufacturer}
                onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Unidade</label>
              <input
                className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                placeholder="ex: UN, CX, FR"
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Fornecedor *</label>
              <select
                className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                value={form.supplierId}
                onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}
                required
              >
                <option value="">Selecione...</option>
                {(suppliers as any[]).map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Categoria *</label>
              <select
                className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                value={form.categoryId}
                onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                required
              >
                <option value="">Selecione...</option>
                {(categories as any[]).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Preço de Custo (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                placeholder="0,00"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Princípio Ativo</label>
              <input
                className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                value={form.activeIngredient}
                onChange={(e) => setForm((f) => ({ ...f, activeIngredient: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Link de Compra (URL)</label>
            <input
              type="url"
              className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              placeholder="https://..."
              value={form.productUrl}
              onChange={(e) => setForm((f) => ({ ...f, productUrl: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-400"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex items-center gap-2 bg-blue-900 text-white px-5 py-2 text-sm font-bold hover:bg-blue-800 disabled:opacity-50"
            >
              {createMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Cadastrar e Selecionar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Busca Manual Panel ───────────────────────────────────────────────────────
function BuscaManualPanel({
  itemDescricao,
  onSelect,
}: {
  itemDescricao: string;
  onSelect: (product: any) => void;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showCadastro, setShowCadastro] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(val), 400);
  };

  const { data: results = [], isFetching } = trpc.products.quickSearch.useQuery(
    { query: debouncedQuery, limit: 10 },
    { enabled: debouncedQuery.length >= 2 }
  );

  return (
    <div className="bg-amber-50 border border-amber-200 p-3 space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <Search size={12} className="text-amber-700" />
        <span className="text-[10px] font-black text-amber-900 uppercase tracking-widest">Busca Manual no Catálogo</span>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full border border-gray-300 pl-7 pr-3 py-1.5 text-xs focus:outline-none focus:border-blue-500 bg-white"
            placeholder="Digite nome, fabricante ou princípio ativo..."
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
          />
        </div>
        <button
          onClick={() => setShowCadastro(true)}
          className="flex items-center gap-1 bg-green-700 text-white px-3 py-1.5 text-xs font-bold hover:bg-green-800 whitespace-nowrap"
        >
          <Plus size={11} /> Cadastrar Novo
        </button>
      </div>

      {isFetching && (
        <div className="flex items-center gap-2 text-xs text-gray-400 py-1">
          <Loader2 size={11} className="animate-spin" /> Buscando...
        </div>
      )}

      {!isFetching && debouncedQuery.length >= 2 && (results as any[]).length === 0 && (
        <p className="text-xs text-gray-400 py-1">Nenhum produto encontrado para "{debouncedQuery}".</p>
      )}

      {(results as any[]).length > 0 && (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {(results as any[]).map((r: any) => (
            <div
              key={r.id}
              className="flex items-center gap-2 bg-white border border-gray-200 px-3 py-2 hover:border-blue-400 cursor-pointer transition-colors"
              onClick={() => {
                onSelect(r);
                setQuery("");
                setDebouncedQuery("");
              }}
            >
              {r.imageUrl && (
                <img
                  src={r.imageUrl}
                  alt={r.name}
                  className="w-8 h-8 object-contain border border-gray-100 flex-shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-900 truncate">{r.name}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {r.manufacturer && <span className="text-[10px] text-gray-500">Fab.: {r.manufacturer}</span>}
                  {r.supplierName && <span className="text-[10px] text-gray-400">| {r.supplierName}</span>}
                  {r.activeIngredient && <span className="text-[10px] text-teal-600">| P.A.: {r.activeIngredient}</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                {r.price && (
                  <p className="text-xs font-bold text-blue-900">
                    R$ {parseFloat(String(r.price)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </p>
                )}
                {r.productUrl && (
                  <a
                    href={r.productUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[10px] text-blue-600 hover:underline inline-flex items-center gap-0.5"
                  >
                    <ShoppingCart size={9} /> Comprar
                  </a>
                )}
              </div>
              <button
                className="ml-2 bg-blue-900 text-white px-2 py-1 text-[10px] font-bold hover:bg-blue-800 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(r);
                  setQuery("");
                  setDebouncedQuery("");
                }}
              >
                Selecionar
              </button>
            </div>
          ))}
        </div>
      )}

      {showCadastro && (
        <CadastroRapidoModal
          initialName={itemDescricao}
          onClose={() => setShowCadastro(false)}
          onCreated={(product) => {
            setShowCadastro(false);
            onSelect(product);
          }}
        />
      )}
    </div>
  );
}

// ─── Similares Panel ─────────────────────────────────────────────────────────────
function SimilaresPanel({
  activeIngredient,
  currentProductId,
  currentPrice,
  marginPercent,
  onSelect,
}: {
  activeIngredient: string;
  currentProductId: number | null;
  currentPrice: number | null;
  marginPercent: number;
  onSelect: (product: any) => void;
}) {
  const { data: similares = [], isLoading } = trpc.products.compareByActiveIngredient.useQuery(
    { activeIngredient },
    { enabled: !!activeIngredient }
  );
  if (isLoading) return <p className="text-xs text-gray-400 py-2">Buscando similares...</p>;
  if ((similares as any[]).length === 0) return <p className="text-xs text-gray-400 py-2">Nenhum similar encontrado no catálogo.</p>;
  return (
    <div className="grid grid-cols-2 gap-2 mt-2">
      {(similares as any[]).map((s) => {
        const sPrice = s.price ? parseFloat(String(s.price)) : null;
        const salePrice = sPrice ? sPrice / (1 - Math.min(marginPercent, 99.99) / 100) : null;
        const isCheaper = sPrice !== null && currentPrice !== null && sPrice < currentPrice;
        const diffPct = sPrice && currentPrice ? ((currentPrice - sPrice) / currentPrice * 100).toFixed(1) : null;
        const isCurrent = s.id === currentProductId;
        return (
          <div
            key={s.id}
            className={`flex items-start gap-2 bg-white border p-2 cursor-pointer hover:border-teal-400 transition-colors ${
              isCurrent ? "border-teal-400 ring-1 ring-teal-300" : "border-gray-200"
            }`}
            onClick={() => !isCurrent && onSelect(s)}
          >
            {s.imageUrl && (
              <img src={s.imageUrl} alt={s.name} className="w-10 h-10 object-contain border border-gray-100 flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }} />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-900 truncate">{s.name}</p>
              {s.manufacturer && <p className="text-[10px] text-gray-500">Fab.: {s.manufacturer}</p>}
              {s.concentration && <p className="text-[10px] text-gray-400">{s.concentration}{s.presentation ? ` — ${s.presentation}` : ""}</p>}
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {sPrice !== null && (
                  <span className={`text-xs font-bold ${isCheaper ? "text-green-700" : "text-gray-700"}`}>
                    {formatBRL(sPrice)} {salePrice ? `→ ${formatBRL(salePrice)}` : ""}
                  </span>
                )}
                {isCheaper && diffPct && (
                  <span className="text-[10px] bg-green-100 text-green-800 px-1 font-bold">{diffPct}% mais barato</span>
                )}
                {isCurrent && (
                  <span className="text-[10px] bg-teal-100 text-teal-800 px-1 font-bold">SELECIONADO</span>
                )}
                {s.productUrl && (
                  <a href={s.productUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[10px] text-blue-700 hover:underline inline-flex items-center gap-0.5">
                    <ShoppingCart size={9} /> Comprar
                  </a>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
// ─── Confidence Badge ─────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: MatchedItem["confidence"] }) {
  const map = {
    high: { label: "Alta", cls: "bg-green-100 text-green-800 border-green-300" },
    medium: { label: "Média", cls: "bg-yellow-100 text-yellow-800 border-yellow-300" },
    low: { label: "Baixa", cls: "bg-orange-100 text-orange-800 border-orange-300" },
    none: { label: "Sem match", cls: "bg-gray-100 text-gray-500 border-gray-300" },
  };
  const { label, cls } = map[confidence];
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold border ${cls}`}>
      {label}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ImportarEdital() {
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State machine: idle → extracting → matching → ready → creating → done
  const [stage, setStage] = useState<"idle" | "extracting" | "matching" | "ready" | "creating" | "done">("idle");
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [processo, setProcesso] = useState<Processo | null>(null);
  const [itens, setItens] = useState<ItemEdital[]>([]);
  const [matches, setMatches] = useState<MatchedItem[]>([]);
  const [marginPercent, setMarginPercent] = useState(30);
  const [expandedItem, setExpandedItem] = useState<number | null>(null);
  const [createdProposalId, setCreatedProposalId] = useState<number | null>(null);
  const [createdItemCount, setCreatedItemCount] = useState(0);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [truncated, setTruncated] = useState(false);

  const extractMutation = trpc.edital.extract.useMutation();
  const matchMutation = trpc.edital.matchCatalog.useMutation();
  const validateItemsMutation = trpc.edital.validateItems.useMutation();
  const createProposalMutation = trpc.edital.createProposal.useMutation();
  const [validationWarnings, setValidationWarnings] = useState<Array<{itemNumero: number; tipo: string; descricao: string; valorAnterior?: string; valorAtual?: string;}>>([]);
  const [showValidationWarnings, setShowValidationWarnings] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | undefined>(undefined);
   const { data: proposalTemplates = [] } = trpc.proposalTemplates.list.useQuery();

  // ─── Gov Edital Pre-fill (from Compras.gov.br / PNCP) ─────────────────────
  useEffect(() => {
    const raw = sessionStorage.getItem("govEditalImport");
    if (!raw) return;
    sessionStorage.removeItem("govEditalImport");
    try {
      const govData = JSON.parse(raw) as {
        licitacao: { id: number; objeto: string; uasg: string | null; numeroAviso: string | null; dataAbertura: string | null };
        editalLines: Array<{
          rawText: string;
          quantity: number;
          unit: string;
          unitPrice: number | null;
          activeIngredient: string | null;
          concentration: string | null;
          presentation: string | null;
          matchedProductId: number | null;
          matchedProductName: string | null;
          matchScore: number | null;
        }>;
        totalItems: number;
        matchedCount: number;
      };
      if (!govData.licitacao || !govData.editalLines?.length) return;
      const orgaoLabel = (govData.licitacao as any).razaoSocial
        ? `${(govData.licitacao as any).razaoSocial}${(govData.licitacao as any).ufSigla ? ` (${(govData.licitacao as any).ufSigla})` : ""}`
        : (govData.licitacao.uasg ?? "Órgão Público");
      const proc: Processo = {
        numero: govData.licitacao.numeroAviso ?? String(govData.licitacao.id),
        modalidade: "Pregão Eletrônico (PNCP)",
        orgao: orgaoLabel,
        objeto: govData.licitacao.objeto ?? "",
      };
      const editalItens: ItemEdital[] = govData.editalLines.map((line, idx) => ({
        numero: idx + 1,
        descricao: line.rawText,
        unidade: line.unit,
        quantidade: line.quantity,
        precoUnitario: line.unitPrice ?? null,
        precoTotal: line.unitPrice != null ? line.unitPrice * line.quantity : null,
      }));
      const preMatches: MatchedItem[] = govData.editalLines.map((line, idx) => ({
        itemNumero: idx + 1,
        itemDescricao: line.rawText,
        itemUnidade: line.unit,
        itemQuantidade: line.quantity,
        itemPrecoUnitario: line.unitPrice ?? null,
        itemPrecoTotal: line.unitPrice != null ? line.unitPrice * line.quantity : null,
        productId: line.matchedProductId ?? null,
        productName: line.matchedProductName ?? null,
        productPrice: null,
        productSupplier: null,
        productUnit: line.unit,
        productConcentration: line.concentration ?? null,
        productPresentation: line.presentation ?? null,
        productActiveIngredient: line.activeIngredient ?? null,
        productImageUrl: null,
        productUrl: null,
        confidence: (line.matchScore ?? 0) >= 80 ? "high" : (line.matchScore ?? 0) >= 50 ? "medium" : line.matchedProductId ? "low" : "none",
        usedFeedback: false,
      }));
      setFileName(`Licitação PNCP #${govData.licitacao.id}`);
      setProcesso(proc);
      setItens(editalItens);
      setMatches(preMatches);
      setReviewConfirmed(false);
      setStage("ready");
      toast.success(`Licitação importada!`, {
        description: `${govData.totalItems} itens carregados, ${govData.matchedCount} vinculados ao catálogo.`,
      });
    } catch (e) {
      console.error("[govEditalImport] Erro ao parsear dados:", e);
    }
  }, []);

  // ─── File Processing ───────────────────────────────────────────────────────

  const processFile = useCallback(async (file: File) => {
    const MAX_MB = 20;
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`Arquivo muito grande. Limite: ${MAX_MB}MB`);
      return;
    }
    const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    const ext = file.name.toLowerCase();
    if (!allowed.includes(file.type) && !ext.endsWith(".pdf") && !ext.endsWith(".docx")) {
      toast.error("Formato não suportado. Use PDF ou DOCX.");
      return;
    }

    setFileName(file.name);
    setStage("extracting");
    setProcesso(null);
    setItens([]);
    setMatches([]);
    setReviewConfirmed(false);
    setCreatedItemCount(0);

    try {
      // Convert to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]); // strip data URL prefix
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Step 1: Extract items from document
      const extracted = await extractMutation.mutateAsync({
        fileBase64: base64,
        fileName: file.name,
        mimeType: file.type || (ext.endsWith(".pdf") ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      });

      setProcesso(extracted.processo);
      setItens(extracted.itens);
      setTruncated(extracted.truncated);

      if (extracted.itens.length === 0) {
        toast.warning("Nenhum item encontrado no edital. Verifique se o arquivo contém uma lista de itens.");
        setStage("idle");
        return;
      }

      toast.success(`${extracted.itens.length} itens extraídos do edital`);

      // Step 2: Match items to catalog
      setStage("matching");
      const matched = await matchMutation.mutateAsync({ itens: extracted.itens.map((i) => ({ ...i, precoUnitario: i.precoUnitario ?? null, precoTotal: i.precoTotal ?? null })) });
      setMatches(matched.matches);
      setReviewConfirmed(false);

      const withMatch = matched.matches.filter((m) => m.productId !== null).length;
      toast.success(`${withMatch} de ${matched.matches.length} itens vinculados ao catálogo`);
      setStage("ready");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Erro ao processar arquivo: " + msg);
      setStage("idle");
    }
  }, [extractMutation, matchMutation]);

  // ─── Drag & Drop ───────────────────────────────────────────────────────────

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  // ─── Create Proposal ──────────────────────────────────────────────────────

  const handleCreateProposal = async (skipValidation = false) => {
    if (!processo || matches.length === 0) return;

    const incompleteItems = matches.filter((item) => {
      const cost = Number(item.productPrice);
      return item.productId == null || !Number.isFinite(cost) || cost <= 0;
    });
    if (incompleteItems.length > 0) {
      toast.error(
        `Proposta bloqueada: resolva o match e o custo de ${incompleteItems.length} item(ns).`,
      );
      return;
    }
    if (!reviewConfirmed) {
      toast.error("Confirme a revisão humana dos matches, quantidades e custos.");
      return;
    }

    // Validação de integridade (a menos que o usuário já confirmou os avisos)
    if (!skipValidation) {
      try {
        const validation = await validateItemsMutation.mutateAsync({
          itens: matches.map((m) => ({
            itemNumero: m.itemNumero,
            itemDescricao: m.itemDescricao,
            productId: m.productId,
            productName: m.productName,
            productPrice: m.productPrice,
          })),
        });
        if (validation.divergencias && validation.divergencias.length > 0) {
          setValidationWarnings(validation.divergencias);
          setShowValidationWarnings(true);
          return;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "falha desconhecida";
        toast.error(`Não foi possível validar os itens: ${message}`);
        return;
      }
    }

    setShowValidationWarnings(false);
    setValidationWarnings([]);
    setStage("creating");

    try {
      const result = await createProposalMutation.mutateAsync({
        processo,
        itens: matches.map((m) => ({
          itemNumero: m.itemNumero,
          itemDescricao: m.itemDescricao,
          itemUnidade: m.itemUnidade,
          itemQuantidade: m.itemQuantidade,
          productId: m.productId,
          productName: m.productName,
          productPrice: m.productPrice,
          productSupplier: m.productSupplier,
          productConcentration: m.productConcentration,
          productPresentation: m.productPresentation,
          itemPrecoUnitario: m.itemPrecoUnitario ?? null,
          itemPrecoTotal: m.itemPrecoTotal ?? null,
        })),
        marginPercent,
        reviewConfirmed: true,
        templateId: selectedTemplateId,
      });
      if (result.addedCount !== matches.length) {
        throw new Error(
          `A criação foi interrompida: o servidor confirmou ${result.addedCount} de ${matches.length} itens.`,
        );
      }
      setCreatedProposalId(result.proposalId);
      setCreatedItemCount(result.addedCount);
      setStage("done");
      toast.success(`Proposta criada com ${result.addedCount} itens.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Erro ao criar proposta: " + msg);
      setStage("ready");
    }
  };

  // ─── Derived ──────────────────────────────────────────────────────────────

  const matchedCount = matches.filter((m) => m.productId !== null).length;
  const incompleteCount = matches.filter((m) => {
    const cost = Number(m.productPrice);
    return m.productId == null || !Number.isFinite(cost) || cost <= 0;
  }).length;
  const allItemsReady = matches.length > 0 && incompleteCount === 0;
  const noMatchCount = matches.filter((m) => m.confidence === "none").length;
  const feedbackCount = matches.filter((m) => m.usedFeedback).length;
  const totalValue = matches.reduce((sum, m) => {
    if (!m.productPrice) return sum;
    const salePrice = parseFloat(m.productPrice) / (1 - Math.min(marginPercent, 99.99) / 100);
    return sum + salePrice * m.itemQuantidade;
  }, 0);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
          <FileText size={20} className="text-blue-700" />
          Importar Edital
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Envie um edital de licitação (PDF ou DOCX) e a IA extrai os itens automaticamente.
        </p>
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
          dragOver ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-blue-400 bg-white"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx"
          className="hidden"
          onChange={handleFileChange}
        />
        {stage === "idle" ? (
          <>
            <Upload size={24} className="mx-auto text-gray-400 mb-2" />
            <p className="text-sm font-semibold text-gray-700">Arraste o edital aqui ou clique para selecionar</p>
            <p className="text-xs text-gray-400 mt-1">PDF ou DOCX — máximo 20MB</p>
          </>
        ) : stage === "extracting" ? (
          <div className="flex items-center justify-center gap-3">
            <Loader2 size={20} className="animate-spin text-blue-600" />
            <div className="text-left">
              <p className="text-sm font-bold text-gray-800">Extraindo itens do edital...</p>
              <p className="text-xs text-gray-500">{fileName}</p>
            </div>
          </div>
        ) : stage === "matching" ? (
          <div className="flex items-center justify-center gap-3">
            <Loader2 size={20} className="animate-spin text-teal-600" />
            <div className="text-left">
              <p className="text-sm font-bold text-gray-800">Vinculando itens ao catálogo...</p>
              <p className="text-xs text-gray-500">{itens.length} itens extraídos</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-3">
            <CheckCircle2 size={20} className="text-green-600" />
            <div className="text-left">
              <p className="text-sm font-bold text-gray-800">{fileName}</p>
              <p className="text-xs text-gray-500">
                {matchedCount}/{matches.length} itens vinculados
                {feedbackCount > 0 && (
                  <span className="ml-2 text-purple-700 font-semibold inline-flex items-center gap-0.5">
                    <Brain size={10} />
                    {feedbackCount} via aprendizado
                  </span>
                )}
                {noMatchCount > 0 && (
                  <span className="ml-2 text-amber-600 font-semibold">{noMatchCount} sem match — use busca manual abaixo</span>
                )}
              </p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setStage("idle"); setMatches([]); setReviewConfirmed(false); setFileName(null); }}
              className="ml-4 text-gray-400 hover:text-gray-600"
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Banner de origem PNCP */}
      {processo?.modalidade === "Pregão Eletrônico (PNCP)" && stage === "ready" && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-300 px-4 py-2.5 rounded text-sm">
          <CheckCircle2 size={16} className="text-green-600 shrink-0" />
          <div className="flex-1">
            <span className="font-bold text-green-800">Dados importados do PNCP (Compras.gov.br)</span>
            <span className="text-green-700 ml-2">— Itens e vinculações ao catálogo já estão pré-preenchidos.</span>
          </div>
          <Link
            href="/radar-pncp"
            className="text-xs text-green-700 underline hover:text-green-900 shrink-0"
          >
            Voltar ao Radar de licitações
          </Link>
        </div>
      )}
      {/* Processo Info */}
      {processo && (
        <div className="bg-blue-50 border border-blue-200 px-5 py-3 text-xs space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <Package size={13} className="text-blue-700" />
            <span className="font-black text-blue-900 uppercase tracking-widest text-[10px]">Processo Identificado</span>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            {processo.numero && <p><span className="font-bold text-blue-800">Número:</span> {processo.numero}</p>}
            {processo.modalidade && <p><span className="font-bold text-blue-800">Modalidade:</span> {processo.modalidade}</p>}
            {processo.orgao && <p><span className="font-bold text-blue-800">Órgão:</span> {processo.orgao}</p>}
            {processo.objeto && <p className="col-span-2"><span className="font-bold text-blue-800">Objeto:</span> {processo.objeto}</p>}
          </div>
          {truncated && (
            <p className="text-amber-700 font-semibold mt-1">
              ⚠ Documento muito extenso — apenas uma parte foi processada. Considere dividir o edital em partes menores.
            </p>
          )}
        </div>
      )}

      {/* Validation Warnings */}
      {showValidationWarnings && validationWarnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle size={16} className="text-amber-700" />
            <span className="text-sm font-black text-amber-900">Avisos de Validação ({validationWarnings.length})</span>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto mb-3">
            {validationWarnings.map((w, i) => (
              <div key={i} className="text-xs text-amber-800">
                <span className="font-bold">Item {w.itemNumero}:</span> {w.descricao}
                {w.valorAnterior && w.valorAtual && (
                  <span className="text-amber-600"> ({w.valorAnterior} → {w.valorAtual})</span>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => handleCreateProposal(true)}
              className="flex items-center gap-2 bg-amber-700 text-white px-4 py-2 text-sm font-bold hover:bg-amber-800"
            >
              <ArrowRight size={14} /> Criar mesmo assim (usar dados atualizados)
            </button>
            <button
              onClick={() => { setShowValidationWarnings(false); setValidationWarnings([]); }}
              className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Markup + Create Button */}
      {(stage === "ready" || stage === "creating") && (
        <div className="bg-white border border-gray-200 p-4 flex items-center gap-6">
          <div className="flex items-center gap-3">
            <label className="text-xs font-bold text-gray-700 uppercase tracking-widest whitespace-nowrap">
              Margem s/ venda (%)
            </label>
            <input
              type="number"
              min={0}
              max={99}
              step={5}
              value={marginPercent}
              onChange={(e) => {
                setMarginPercent(Number(e.target.value));
                setReviewConfirmed(false);
              }}
              className="w-20 border border-gray-300 px-2 py-1.5 text-sm font-bold text-center focus:outline-none focus:border-blue-500"
            />
            <span className="text-xs text-gray-500">
              Preço = custo ÷ (1 − margem); não confundir com markup
            </span>
          </div>
          {/* Seletor de Template */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-gray-700 uppercase tracking-widest whitespace-nowrap">
              Template
            </label>
            <select
              value={selectedTemplateId ?? ""}
              onChange={(e) => setSelectedTemplateId(e.target.value ? Number(e.target.value) : undefined)}
              className="border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500 min-w-[160px]"
            >
              <option value="">Sem template</option>
              {(proposalTemplates as any[]).map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.isDefault === "yes" ? "★" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1" />
          <label className="flex items-center gap-2 max-w-[250px] text-[11px] font-semibold text-gray-700">
            <input
              type="checkbox"
              checked={reviewConfirmed}
              onChange={(e) => setReviewConfirmed(e.target.checked)}
              disabled={!allItemsReady || stage === "creating"}
              className="accent-blue-900"
            />
            Revisei matches, quantidades e custos de todos os itens
          </label>
          <button
            onClick={() => handleCreateProposal(false)}
            disabled={stage === "creating" || !allItemsReady || !reviewConfirmed}
            className="flex items-center gap-2 bg-blue-900 text-white px-5 py-2.5 text-sm font-black hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {stage === "creating" ? (
              <><Loader2 size={14} className="animate-spin" /> Criando proposta...</>
            ) : (
              <><ArrowRight size={14} /> Criar Proposta ({matches.length} itens)</>
            )}
          </button>
        </div>
      )}

      {/* Done Banner */}
      {stage === "done" && createdProposalId && (
        <div className="bg-green-50 border border-green-300 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={20} className="text-green-600" />
            <div>
              <p className="text-sm font-black text-green-900">Proposta criada com sucesso!</p>
              <p className="text-xs text-green-700">{createdItemCount} itens adicionados com margem de {marginPercent}% sobre a venda</p>
            </div>
          </div>
          <button
            onClick={() => navigate(`/propostas/${createdProposalId}`)}
            className="flex items-center gap-2 bg-green-700 text-white px-4 py-2 text-sm font-bold hover:bg-green-800 transition-colors"
          >
            Abrir Proposta <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* Items Table */}
      {matches.length > 0 && (
        <div className="bg-white border border-gray-200">
          <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-black text-gray-900">
              Itens do Edital
            </h2>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 inline-block" /> Alta confiança
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-yellow-400 inline-block" /> Média
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-orange-400 inline-block" /> Baixa
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-gray-300 inline-block" /> Sem match
              </span>
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {matches.map((m, idx) => {
              // Usar chave composta para garantir unicidade: itemNumero + productId + índice
              const isExpanded = expandedItem === m.itemNumero;
              const salePrice = m.productPrice
                ? parseFloat(m.productPrice) / (1 - Math.min(marginPercent, 99.99) / 100)
                : null;
              const lineTotal = salePrice ? salePrice * m.itemQuantidade : null;

              const rowBg =
                m.confidence === "high" ? "border-l-4 border-l-green-500" :
                m.confidence === "medium" ? "border-l-4 border-l-yellow-400" :
                m.confidence === "low" ? "border-l-4 border-l-orange-400" :
                "border-l-4 border-l-gray-200";

              return (
                <div key={`${m.itemNumero}-${m.productId ?? 'none'}-${idx}`} className={`${rowBg}`}>
                  <div
                    className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setExpandedItem(isExpanded ? null : m.itemNumero)}
                  >
                    {/* Item number */}
                    <div className="w-8 h-8 bg-gray-100 flex items-center justify-center shrink-0">
                      <span className="text-xs font-black text-gray-600">{m.itemNumero}</span>
                    </div>

                    {/* Description */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{m.itemDescricao}</p>
                      <p className="text-xs text-gray-500">
                        {m.itemQuantidade} {m.itemUnidade}
                      </p>
                    </div>

                    {/* Match info */}
                    <div className="flex items-center gap-4 shrink-0">
                      {m.productId ? (
                        <div className="text-right">
                          <p className="text-xs font-bold text-gray-800 max-w-[180px] truncate">{m.productName}</p>
                          <p className="text-[10px] text-gray-500">{m.productSupplier}</p>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-xs text-amber-600">
                          <AlertTriangle size={12} />
                          <span>Clique para buscar</span>
                        </div>
                      )}

                      <ConfidenceBadge confidence={m.confidence} />
                      {m.usedFeedback && (
                        <span
                          title="Match baseado em aprendizado anterior"
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold border bg-purple-100 text-purple-800 border-purple-300"
                        >
                          <Brain size={9} />
                          Aprendido
                        </span>
                      )}

                      {/* Ref. Edital */}
                      {m.itemPrecoUnitario != null && (
                        <div className="text-right w-28">
                          <p className="text-[10px] text-gray-400 uppercase tracking-widest">Ref. Edital</p>
                          <p className="text-xs font-bold text-amber-700">
                            R$ {m.itemPrecoUnitario.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                      )}

                      {lineTotal !== null ? (
                        <div className="text-right w-28">
                          <p className="text-sm font-black text-blue-900">
                            R$ {lineTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            {m.itemQuantidade} × R$ {salePrice!.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                      ) : (
                        <div className="w-28 text-right">
                          <span className="text-xs text-gray-400">—</span>
                        </div>
                      )}

                      {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-16 pb-4 bg-gray-50 border-t border-gray-100">
                      <div className="grid grid-cols-2 gap-6 pt-3 text-xs">
                        <div>
                          <p className="font-bold text-gray-500 uppercase tracking-widest text-[10px] mb-1">Item do Edital</p>
                          <p className="text-gray-800">{m.itemDescricao}</p>
                          <p className="text-gray-500 mt-1">Qtd: {m.itemQuantidade} {m.itemUnidade}</p>
                          {m.itemPrecoUnitario != null && (
                            <p className="text-amber-700 font-semibold mt-1">
                              Ref. Edital: R$ {m.itemPrecoUnitario.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </p>
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-gray-500 uppercase tracking-widest text-[10px] mb-1">Produto do Catálogo</p>
                          {m.productId ? (
                            <>
                              <p className="text-gray-800 font-semibold">{m.productName}</p>
                              {m.productConcentration && <p className="text-gray-500">Conc.: {m.productConcentration}</p>}
                              {m.productPresentation && <p className="text-gray-500">Apres.: {m.productPresentation}</p>}
                              <p className="text-gray-500">Fornecedor: {m.productSupplier ?? "—"}</p>
                              <p className="text-gray-500">
                                Custo: R$ {parseFloat(m.productPrice!).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} →
                                Venda: R$ {salePrice!.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                {" "}(margem {marginPercent}% sobre a venda)
                              </p>
                              {m.productUrl && (
                                <a
                                  href={m.productUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-blue-700 hover:underline mt-1"
                                >
                                  <ExternalLink size={11} /> Link de compra
                                </a>
                              )}
                            </>
                          ) : (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-amber-600">
                                <AlertCircle size={14} />
                                <span className="text-xs font-semibold">Nenhum produto vinculado.</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Busca Manual para itens sem match */}
                      {m.confidence === "none" && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <BuscaManualPanel
                            itemDescricao={m.itemDescricao}
                            onSelect={(s) => {
                              setReviewConfirmed(false);
                              setMatches((prev) => prev.map((item) =>
                                item.itemNumero === m.itemNumero
                                  ? {
                                      ...item,
                                      productId: s.id,
                                      productName: s.name,
                                      productPrice: s.price ? String(s.price) : item.productPrice,
                                      productSupplier: s.supplierName ?? item.productSupplier,
                                      productUnit: s.unit ?? item.productUnit,
                                      productConcentration: s.concentration ?? null,
                                      productPresentation: s.presentation ?? null,
                                      productActiveIngredient: s.activeIngredient ?? null,
                                      productImageUrl: s.imageUrl ?? null,
                                      productUrl: s.productUrl ?? null,
                                      confidence: "medium",
                                    }
                                  : item
                              ));
                              toast.success(`Produto vinculado: ${s.name}`);
                            }}
                          />
                        </div>
                      )}

                      {/* Painel de similares (quando tem match) */}
                      {m.productActiveIngredient && m.confidence !== "none" && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <div className="flex items-center gap-2 mb-2">
                            <GitMerge size={13} className="text-teal-700" />
                            <span className="text-[10px] font-black text-teal-900 uppercase tracking-widest">Similares por P.A.: {m.productActiveIngredient}</span>
                            <span className="text-[10px] text-teal-600">— clique para substituir</span>
                          </div>
                          <SimilaresPanel
                            activeIngredient={m.productActiveIngredient}
                            currentProductId={m.productId}
                            currentPrice={m.productPrice ? parseFloat(m.productPrice) : null}
                            marginPercent={marginPercent}
                            onSelect={(s) => {
                              setReviewConfirmed(false);
                              setMatches((prev) => prev.map((item) =>
                                item.itemNumero === m.itemNumero
                                  ? {
                                      ...item,
                                      productId: s.id,
                                      productName: s.name,
                                      productPrice: s.price ? String(s.price) : item.productPrice,
                                      productSupplier: s.supplierName ?? item.productSupplier,
                                      productUnit: s.unit ?? item.productUnit,
                                      productConcentration: s.concentration ?? null,
                                      productPresentation: s.presentation ?? null,
                                      productActiveIngredient: s.activeIngredient ?? item.productActiveIngredient,
                                      productImageUrl: s.imageUrl ?? null,
                                      productUrl: s.productUrl ?? null,
                                      confidence: "high",
                                    }
                                  : item
                              ));
                              toast.success(`Produto substituído por ${s.name}`);
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

          </div>

          {/* Footer totals */}
          {matches.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
              <span className="text-xs text-gray-500">
                {matchedCount}/{matches.length} itens vinculados ao catálogo
                {noMatchCount > 0 && (
                  <span className="ml-3 text-amber-600 font-semibold">
                    {noMatchCount} sem match — expanda o item para buscar manualmente
                  </span>
                )}
              </span>
              {totalValue > 0 && (
                <div className="text-right">
                  <span className="text-[10px] text-gray-400 uppercase tracking-widest">Valor total estimado</span>
                  <p className="text-lg font-black text-blue-900">
                    R$ {totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Help text when idle */}
      {stage === "idle" && (
        <div className="grid grid-cols-3 gap-4">
          {[
            {
              icon: Upload,
              title: "1. Envie o edital",
              desc: "Arraste ou selecione o arquivo PDF ou DOCX do edital de licitação.",
            },
            {
              icon: Sparkles,
              title: "2. IA extrai os itens",
              desc: "A inteligência artificial lê o documento e identifica todos os itens, quantidades e unidades.",
            },
            {
              icon: ArrowRight,
              title: "3. Proposta em 1 clique",
              desc: "Os itens são vinculados ao catálogo e uma proposta comercial é criada automaticamente.",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-white border border-gray-200 p-5">
              <div className="w-8 h-8 bg-blue-50 flex items-center justify-center mb-3">
                <Icon size={16} className="text-blue-700" />
              </div>
              <p className="text-sm font-black text-gray-900 mb-1">{title}</p>
              <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
