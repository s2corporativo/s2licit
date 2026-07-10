import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock,
  FileSpreadsheet,
  FlaskConical,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useLocation } from "wouter";
import { toast } from "sonner";

// ─── Draft key ────────────────────────────────────────────────────────────────

const DRAFT_KEY = "proposta-rapida-draft";

interface DraftData {
  step: "input" | "suggest" | "confirm";
  inputMode: "text" | "file";
  textInput: string;
  fileName: string | null;
  items: SuggestedItem[];
  proposalTitle: string;
  orgName: string;
  savedAt: number; // UTC ms
}

function loadDraft(): DraftData | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DraftData;
  } catch {
    return null;
  }
}

function saveDraft(data: DraftData) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
  } catch {
    // quota exceeded — ignore
  }
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

function formatDraftAge(savedAt: number): string {
  const diffMs = Date.now() - savedAt;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "agora mesmo";
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `há ${diffD} dia${diffD > 1 ? "s" : ""}`;
}

// ─── Componente de imagem com fallback ───────────────────────────────────────

function ProductImage({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SuggestedItem {
  inputName: string;
  matchedProduct: {
    id: number;
    name: string;
    activeIngredient: string | null;
    manufacturer: string | null;
    concentration: string | null;
    presentation: string | null;
    price: string | null;
    priceUnit: string | null;
    unit: string | null;
    supplierId: number | null;
    supplierName: string | null;
    categoryName: string | null;
    imageUrl: string | null;
    productUrl: string | null;
  } | null;
  alternatives: Array<{
    id: number;
    name: string;
    price: string | null;
    supplierName: string | null;
    activeIngredient: string | null;
    concentration: string | null;
    imageUrl: string | null;
  }>;
  similarity: number;
  selected: boolean;
  quantity: number;
  overrideProductId?: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseTextList(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((l) => l.trim().replace(/^\d+[\.\)\-\s]+/, "").trim())
    .filter((l) => l.length > 1);
}

function parseSpreadsheet(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
        const names: string[] = [];
        for (const row of rows) {
          if (!Array.isArray(row)) continue;
          for (const cell of row) {
            if (typeof cell === "string" && cell.trim().length > 2) {
              names.push(cell.trim());
              break;
            }
          }
        }
        resolve(names.filter(Boolean));
      } catch (err: any) {
        reject(new Error("Não foi possível ler o arquivo: " + err.message));
      }
    };
    reader.onerror = () => reject(new Error("Erro ao ler o arquivo."));
    reader.readAsArrayBuffer(file);
  });
}

// ─── Similarity bar ───────────────────────────────────────────────────────────

function SimilarityBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[10px] font-bold ${pct >= 70 ? "text-green-700" : pct >= 40 ? "text-yellow-600" : "text-blue-800"}`}>
        {pct}%
      </span>
    </div>
  );
}

// ─── Suggestion row ───────────────────────────────────────────────────────────

function SuggestionRow({
  item,
  index,
  onChange,
  onRemove,
}: {
  item: SuggestedItem;
  index: number;
  onChange: (idx: number, patch: Partial<SuggestedItem>) => void;
  onRemove: (idx: number) => void;
}) {
  const [showAlts, setShowAlts] = useState(false);
  const [showEquiv, setShowEquiv] = useState(false);
  const product = item.overrideProductId
    ? item.alternatives.find((a) => a.id === item.overrideProductId) ?? item.matchedProduct
    : item.matchedProduct;

  // Painel de equivalências por ficha técnica
  const productId = item.matchedProduct?.id;
  const { data: equivData, isFetching: equivLoading } = trpc.products.suggestEquivalentsByFichaTecnica.useQuery(
    { productId: productId! },
    { enabled: showEquiv && !!productId }
  );

  return (
    <div className={`border-b border-gray-100 last:border-b-0 ${item.selected ? "" : "opacity-50"}`}>
      <div className="flex items-start gap-3 px-4 py-3">
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={item.selected}
          onChange={(e) => onChange(index, { selected: e.target.checked })}
          className="mt-1 w-3.5 h-3.5 flex-shrink-0"
        />

        {/* Imagem */}
        <div className="w-10 h-10 border border-gray-100 bg-gray-50 flex-shrink-0 overflow-hidden">
          {product?.imageUrl ? (
            <ProductImage src={product.imageUrl} alt={product.name} className="w-full h-full object-contain" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-200">
              <ClipboardList size={16} />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] text-gray-400 truncate mb-0.5">
                Solicitado: <span className="font-semibold text-gray-600">{item.inputName}</span>
              </div>
              {product ? (
                <>
                  <div className="text-xs font-bold text-gray-900 truncate">{product.name}</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    {product.activeIngredient && (
                      <span className="text-[10px] text-gray-500">{product.activeIngredient}</span>
                    )}
                    {product.concentration && (
                      <span className="text-[10px] text-gray-400">{product.concentration}</span>
                    )}
                    {product.supplierName && (
                      <span className="text-[10px] font-semibold text-blue-800">{product.supplierName}</span>
                    )}
                    {product.price && (
                      <span className="text-[10px] font-bold text-gray-900">
                        R$ {parseFloat(product.price).toFixed(2)}
                        {(product as any).priceUnit && (
                          <span className="font-normal text-gray-400"> /{(product as any).priceUnit}</span>
                        )}
                      </span>
                    )}
                  </div>
                  <SimilarityBar value={item.similarity} />
                </>
              ) : (
                <div className="flex items-center gap-1 mt-1">
                  <AlertCircle size={11} className="text-orange-500" />
                  <span className="text-[10px] text-orange-600 font-semibold">Produto não encontrado na base</span>
                </div>
              )}
            </div>

            {/* Quantidade */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => onChange(index, { quantity: Math.max(1, item.quantity - 1) })}
                className="w-5 h-5 border border-gray-200 flex items-center justify-center hover:bg-gray-50 text-gray-500"
              >
                <span className="text-xs font-bold leading-none">-</span>
              </button>
              <span className="w-8 text-center text-xs font-bold text-gray-900">{item.quantity}</span>
              <button
                onClick={() => onChange(index, { quantity: item.quantity + 1 })}
                className="w-5 h-5 border border-gray-200 flex items-center justify-center hover:bg-gray-50 text-gray-500"
              >
                <span className="text-xs font-bold leading-none">+</span>
              </button>
              <button
                onClick={() => onRemove(index)}
                className="ml-2 text-gray-200 hover:text-blue-700 transition-colors"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>

          {/* Alternativas */}
          {item.alternatives.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setShowAlts(!showAlts)}
                className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-700 transition-colors"
              >
                {showAlts ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                {item.alternatives.length} alternativa{item.alternatives.length > 1 ? "s" : ""} mais barata{item.alternatives.length > 1 ? "s" : ""}
              </button>
              {showAlts && (
                <div className="mt-1.5 space-y-1">
                  {item.alternatives.map((alt) => (
                    <button
                      key={alt.id}
                      onClick={() =>
                        onChange(index, {
                          overrideProductId: item.overrideProductId === alt.id ? null : alt.id,
                        })
                      }
                      className={`w-full text-left flex items-center gap-2 px-2 py-1.5 border transition-colors ${
                        item.overrideProductId === alt.id
                          ? "border-blue-300 bg-blue-50"
                          : "border-gray-100 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <div className="w-6 h-6 border border-gray-100 bg-gray-50 flex-shrink-0 overflow-hidden">
                        {alt.imageUrl ? (
                          <ProductImage src={alt.imageUrl} alt={alt.name} className="w-full h-full object-contain" />
                        ) : null}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-semibold text-gray-800 truncate">{alt.name}</div>
                        <div className="text-[10px] text-gray-400">{alt.supplierName}</div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {alt.price && (
                          <span className="text-[10px] font-bold text-green-700">
                            R$ {parseFloat(alt.price).toFixed(2)}
                          </span>
                        )}
                        {product?.price && alt.price && (
                          <span className="inline-block bg-green-600 text-white text-[9px] font-bold px-1.5 py-0.5">
                            −{Math.round(((parseFloat(product.price) - parseFloat(alt.price)) / parseFloat(product.price)) * 100)}%
                          </span>
                        )}
                      </div>
                      {item.overrideProductId === alt.id && (
                        <CheckCircle2 size={12} className="text-blue-800 flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Equivalências por Ficha Técnica */}
          {product && (
            <div className="mt-1.5">
              <button
                onClick={() => setShowEquiv(!showEquiv)}
                className="flex items-center gap-1 text-[10px] text-indigo-500 hover:text-indigo-700 transition-colors"
              >
                <FlaskConical size={10} />
                {showEquiv ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                Equivalências por ficha técnica
                {equivLoading && <span className="text-[9px] text-gray-400 ml-1">buscando...</span>}
              </button>
              {showEquiv && (
                <div className="mt-1.5">
                  {equivLoading ? (
                    <div className="flex items-center gap-1 px-2 py-1.5 text-[10px] text-gray-400">
                      <Brain size={10} className="animate-pulse" /> Analisando ficha técnica...
                    </div>
                  ) : equivData && equivData.equivalents.length > 0 ? (
                    <div className="space-y-1">
                      {equivData.product && (
                        <div className="px-2 py-1 bg-indigo-50 border border-indigo-100 text-[9px] text-indigo-700">
                          <span className="font-semibold">Referência:</span>{" "}
                          {equivData.product.activeIngredient && <span>{equivData.product.activeIngredient}</span>}
                          {equivData.product.concentration && <span className="ml-1">{equivData.product.concentration}</span>}
                          {equivData.product.presentation && (
                            <span className="ml-1 text-indigo-500">{equivData.product.presentation}</span>
                          )}
                        </div>
                      )}
                      {equivData.equivalents.slice(0, 5).map((eq) => (
                        <button
                          key={eq.id}
                          onClick={() =>
                            onChange(index, {
                              overrideProductId: item.overrideProductId === eq.id ? null : eq.id,
                            })
                          }
                          className={`w-full text-left flex items-center gap-2 px-2 py-1.5 border transition-colors ${
                            item.overrideProductId === eq.id
                              ? "border-indigo-300 bg-indigo-50"
                              : "border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/40"
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] font-semibold text-gray-800 truncate">{eq.name}</div>
                            <div className="flex gap-2 flex-wrap">
                              {eq.supplierName && <span className="text-[9px] text-blue-700">{eq.supplierName}</span>}
                              {eq.activeIngredient && <span className="text-[9px] text-gray-400">{eq.activeIngredient}</span>}
                              {eq.concentration && <span className="text-[9px] text-gray-400">{eq.concentration}</span>}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                            {eq.price && (
                              <span className="text-[10px] font-bold text-green-700">
                                R$ {parseFloat(eq.price).toFixed(2)}
                              </span>
                            )}
                            <span className={`text-[9px] font-semibold px-1 ${
                              (eq as any).score >= 90 ? "text-green-700 bg-green-50" :
                              (eq as any).score >= 70 ? "text-yellow-700 bg-yellow-50" :
                              "text-orange-700 bg-orange-50"
                            }`}>
                              {(eq as any).score ?? 0}%
                            </span>
                          </div>
                          {item.overrideProductId === eq.id && (
                            <CheckCircle2 size={12} className="text-indigo-700 flex-shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  ) : equivData ? (
                    <div className="px-2 py-1.5 text-[10px] text-gray-400 italic">Nenhum equivalente encontrado pela ficha técnica.</div>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PropostaRapida() {
  const [, navigate] = useLocation();

  // ── State ──────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<"input" | "suggest" | "confirm">("input");
  const [inputMode, setInputMode] = useState<"text" | "file">("text");
  const [textInput, setTextInput] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [items, setItems] = useState<SuggestedItem[]>([]);
  const [proposalTitle, setProposalTitle] = useState("");
  const [orgName, setOrgName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | undefined>(undefined);
  const { data: proposalTemplates = [] } = trpc.proposalTemplates.list.useQuery();
  const [parseError, setParseError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Draft state ────────────────────────────────────────────────────────────
  const [pendingDraft, setPendingDraft] = useState<DraftData | null>(null);
  const [draftDismissed, setDraftDismissed] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  // Prevent auto-save from firing during restore
  const isRestoringRef = useRef(false);

  // On mount: check for saved draft
  useEffect(() => {
    const draft = loadDraft();
    if (draft && (draft.textInput.trim() || draft.items.length > 0)) {
      setPendingDraft(draft);
    }
  }, []);

  // Auto-save whenever relevant state changes (debounced via useEffect)
  useEffect(() => {
    if (isRestoringRef.current) return;
    // Don't auto-save empty initial state
    if (!textInput.trim() && items.length === 0 && !proposalTitle.trim()) return;

    const timer = setTimeout(() => {
      const draft: DraftData = {
        step,
        inputMode,
        textInput,
        fileName,
        items,
        proposalTitle,
        orgName,
        savedAt: Date.now(),
      };
      saveDraft(draft);
      setLastSavedAt(draft.savedAt);
    }, 800);

    return () => clearTimeout(timer);
  }, [step, inputMode, textInput, fileName, items, proposalTitle, orgName]);

  // ── Draft actions ──────────────────────────────────────────────────────────

  const handleRestoreDraft = () => {
    if (!pendingDraft) return;
    isRestoringRef.current = true;
    setStep(pendingDraft.step);
    setInputMode(pendingDraft.inputMode);
    setTextInput(pendingDraft.textInput);
    setFileName(pendingDraft.fileName);
    setItems(pendingDraft.items);
    setProposalTitle(pendingDraft.proposalTitle);
    setOrgName(pendingDraft.orgName);
    setLastSavedAt(pendingDraft.savedAt);
    setPendingDraft(null);
    setDraftDismissed(false);
    toast.success("Rascunho restaurado com sucesso.");
    // Allow auto-save again after next tick
    setTimeout(() => { isRestoringRef.current = false; }, 100);
  };

  const handleDiscardDraft = () => {
    clearDraft();
    setPendingDraft(null);
    setDraftDismissed(true);
    setLastSavedAt(null);
    toast("Rascunho descartado.");
  };

  const handleManualSave = () => {
    const draft: DraftData = {
      step,
      inputMode,
      textInput,
      fileName,
      items,
      proposalTitle,
      orgName,
      savedAt: Date.now(),
    };
    saveDraft(draft);
    setLastSavedAt(draft.savedAt);
    toast.success("Rascunho salvo!");
  };

  // ── tRPC ───────────────────────────────────────────────────────────────────
  const suggestMutation = trpc.proposals.suggestFromList.useMutation();
  const createProposal = trpc.proposals.create.useMutation();
  const addItem = trpc.proposals.addItem.useMutation();

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleFileUpload = useCallback(async (file: File) => {
    setParseError(null);
    try {
      const names = await parseSpreadsheet(file);
      if (names.length === 0) {
        setParseError("Nenhum produto encontrado no arquivo. Verifique se a primeira coluna contém os nomes.");
        return;
      }
      setFileName(file.name);
      setTextInput(names.join("\n"));
      toast.success(`${names.length} produtos lidos do arquivo.`);
    } catch (err: any) {
      setParseError(err.message);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFileUpload(file);
    },
    [handleFileUpload]
  );

  const handleAnalyze = async () => {
    const names = parseTextList(textInput);
    if (names.length === 0) {
      setParseError("Nenhum produto identificado. Cole os nomes, um por linha.");
      return;
    }
    setParseError(null);
    try {
      const suggestions = await suggestMutation.mutateAsync({ productNames: names });
      setItems(
        suggestions.map((s) => ({
          ...s,
          selected: s.matchedProduct !== null,
          quantity: 1,
          overrideProductId: null,
        }))
      );
      setStep("suggest");
    } catch (err: any) {
      setParseError("Erro ao buscar sugestões: " + (err?.message ?? "tente novamente."));
    }
  };

  const handleConfirm = async () => {
    const selected = items.filter((i) => i.selected);
    if (selected.length === 0) {
      toast.error("Selecione ao menos um produto.");
      return;
    }
    if (!proposalTitle.trim()) {
      toast.error("Informe o título da proposta.");
      return;
    }
    try {
      const proposalId = await createProposal.mutateAsync({
        title: proposalTitle.trim(),
        orgName: orgName.trim() || undefined,
        ...(selectedTemplateId && (() => {
          const tpl = (proposalTemplates as any[]).find((t: any) => t.id === selectedTemplateId);
          if (!tpl) return {};
          return {
            validityDays: tpl.validityDays ?? undefined,
            paymentTerms: tpl.paymentTerms ?? undefined,
            deliveryTerms: tpl.deliveryDays ? `${tpl.deliveryDays} dias` : undefined,
          };
        })()),
      });
      for (const item of selected) {
        const product =
          item.overrideProductId
            ? item.alternatives.find((a) => a.id === item.overrideProductId) ?? item.matchedProduct
            : item.matchedProduct;
        await addItem.mutateAsync({
          proposalId,
          productId: product?.id ?? undefined,
          productName: product?.name ?? item.inputName,
          activeIngredient: (product as any)?.activeIngredient ?? null,
          manufacturer: (product as any)?.manufacturer ?? null,
          concentration: product?.concentration ?? null,
          presentation: (product as any)?.presentation ?? null,
          unit: (product as any)?.unit ?? null,
          supplierName: product?.supplierName ?? null,
          unitPrice: (product as any)?.price ?? null,
          quantity: item.quantity,
          imageUrl: product?.imageUrl ?? null,
          productUrl: (product as any)?.productUrl ?? null,
          registroMapa: (product as any)?.mapa ?? null,
        });
      }
      // Clear draft after successful creation
      clearDraft();
      setLastSavedAt(null);
      toast.success("Proposta criada com sucesso!");
      navigate(`/propostas/${proposalId}`);
    } catch (err: any) {
      toast.error("Erro ao criar proposta: " + (err?.message ?? "tente novamente."));
    }
  };

  const updateItem = (idx: number, patch: Partial<SuggestedItem>) => {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const selectedCount = items.filter((i) => i.selected).length;
  const matchedCount = items.filter((i) => i.matchedProduct !== null).length;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <span className="its-bar" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-gray-900">
              Proposta Rápida
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Cole uma lista de produtos ou anexe uma planilha — o sistema sugere automaticamente os melhores preços e equivalências.
            </p>
          </div>
          {/* Auto-save indicator */}
          {lastSavedAt && !pendingDraft && (
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400 flex-shrink-0 mt-1">
              <Clock size={10} />
              <span>Rascunho salvo {formatDraftAge(lastSavedAt)}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Draft restore banner ── */}
      {pendingDraft && !draftDismissed && (
        <div className="mb-6 flex items-center justify-between gap-4 bg-amber-50 border border-amber-300 px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen size={14} className="text-amber-600 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-amber-900">
                Rascunho disponível — salvo {formatDraftAge(pendingDraft.savedAt)}
              </p>
              <p className="text-[10px] text-amber-700 mt-0.5">
                {pendingDraft.items.length > 0
                  ? `${pendingDraft.items.length} produto${pendingDraft.items.length > 1 ? "s" : ""} na etapa "${pendingDraft.step === "input" ? "Lista" : pendingDraft.step === "suggest" ? "Revisão" : "Confirmação"}"`
                  : `Lista com ${parseTextList(pendingDraft.textInput).length} produto${parseTextList(pendingDraft.textInput).length !== 1 ? "s" : ""}`}
                {pendingDraft.proposalTitle && ` · "${pendingDraft.proposalTitle}"`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleDiscardDraft}
              className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-semibold text-amber-700 border border-amber-300 hover:bg-amber-100 transition-colors"
            >
              <X size={10} />
              Descartar
            </button>
            <button
              onClick={handleRestoreDraft}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold bg-amber-600 text-white hover:bg-amber-700 transition-colors"
            >
              <BookOpen size={10} />
              Restaurar Rascunho
            </button>
          </div>
        </div>
      )}

      {/* Steps indicator */}
      <div className="flex items-center gap-2 mb-8">
        {(["input", "suggest", "confirm"] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-6 h-6 flex items-center justify-center text-[10px] font-bold ${step === s ? "bg-gray-900 text-white" : items.length > 0 && i < ["input", "suggest", "confirm"].indexOf(step) ? "bg-green-600 text-white" : "bg-gray-100 text-gray-400"}`}>
              {i + 1}
            </div>
            <span className={`text-xs font-semibold ${step === s ? "text-gray-900" : "text-gray-400"}`}>
              {s === "input" ? "Lista de Produtos" : s === "suggest" ? "Revisar Sugestões" : "Confirmar Proposta"}
            </span>
            {i < 2 && <ArrowRight size={12} className="text-gray-200" />}
          </div>
        ))}
      </div>

      {/* ── Step 1: Input ── */}
      {step === "input" && (
        <div className="space-y-6">
          {/* Mode tabs */}
          <div className="flex gap-1 border-b border-gray-200">
            <button
              onClick={() => setInputMode("text")}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors ${inputMode === "text" ? "border-gray-900 text-gray-900" : "border-transparent text-gray-400 hover:text-gray-700"}`}
            >
              <ClipboardList size={13} />
              Colar Texto
            </button>
            <button
              onClick={() => setInputMode("file")}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors ${inputMode === "file" ? "border-gray-900 text-gray-900" : "border-transparent text-gray-400 hover:text-gray-700"}`}
            >
              <FileSpreadsheet size={13} />
              Anexar Planilha
            </button>
          </div>

          {inputMode === "text" ? (
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-2">
                Lista de produtos (um por linha, ou separados por vírgula/ponto-e-vírgula)
              </label>
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={"Ivermectina 1%\nAmoxicilina 500mg\nDipirona Sódica\nFluconazol 150mg\n..."}
                rows={10}
                className="w-full border border-gray-200 p-3 text-sm font-mono text-gray-800 resize-y focus:outline-none focus:border-gray-400"
              />
              <p className="text-[10px] text-gray-400 mt-1">
                {parseTextList(textInput).length} produto{parseTextList(textInput).length !== 1 ? "s" : ""} identificado{parseTextList(textInput).length !== 1 ? "s" : ""}
              </p>
            </div>
          ) : (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed border-gray-200 p-12 text-center hover:border-gray-400 transition-colors cursor-pointer"
              onClick={() => fileRef.current?.click()}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv,.ods"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileUpload(f);
                }}
              />
              <Upload size={28} className="text-gray-300 mx-auto mb-3" />
              {fileName ? (
                <div>
                  <p className="text-sm font-bold text-gray-900">{fileName}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {parseTextList(textInput).length} produtos lidos
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm font-semibold text-gray-600">
                    Arraste um arquivo ou clique para selecionar
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Formatos aceitos: .xlsx, .xls, .csv, .ods
                  </p>
                </>
              )}
            </div>
          )}

          {parseError && (
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 px-3 py-2">
              <AlertCircle size={14} className="text-blue-700 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-800">{parseError}</p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleAnalyze}
              disabled={suggestMutation.isPending || parseTextList(textInput).length === 0}
              className="flex items-center gap-2 bg-gray-900 text-white px-6 py-3 text-sm font-bold hover:bg-blue-800 transition-colors disabled:opacity-40"
            >
              {suggestMutation.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              {suggestMutation.isPending ? "Analisando..." : "Analisar e Sugerir Produtos"}
            </button>
            {textInput.trim() && (
              <button
                onClick={handleManualSave}
                className="flex items-center gap-1.5 px-4 py-3 border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <Save size={12} />
                Salvar Rascunho
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Step 2: Suggestions ── */}
      {step === "suggest" && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="flex items-center justify-between bg-gray-50 border border-gray-200 px-4 py-3">
            <div className="flex items-center gap-4 text-xs">
              <span className="text-gray-500">
                <span className="font-bold text-gray-900">{items.length}</span> produtos analisados
              </span>
              <span className="text-green-700">
                <span className="font-bold">{matchedCount}</span> encontrados
              </span>
              <span className="text-orange-600">
                <span className="font-bold">{items.length - matchedCount}</span> sem match
              </span>
              <span className="text-gray-900">
                <span className="font-bold">{selectedCount}</span> selecionados
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setItems((prev) => prev.map((i) => ({ ...i, selected: i.matchedProduct !== null })))}
                className="text-[10px] font-semibold text-gray-500 hover:text-gray-900 underline"
              >
                Selecionar com match
              </button>
              <button
                onClick={() => setItems((prev) => prev.map((i) => ({ ...i, selected: true })))}
                className="text-[10px] font-semibold text-gray-500 hover:text-gray-900 underline"
              >
                Todos
              </button>
              <button
                onClick={() => setItems((prev) => prev.map((i) => ({ ...i, selected: false })))}
                className="text-[10px] font-semibold text-gray-500 hover:text-gray-900 underline"
              >
                Nenhum
              </button>
            </div>
          </div>

          {/* Items */}
          <div className="border border-gray-200">
            {items.map((item, idx) => (
              <SuggestionRow
                key={`${item.inputName}-${idx}`}
                item={item}
                index={idx}
                onChange={updateItem}
                onRemove={removeItem}
              />
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setStep("input")}
              className="px-4 py-2.5 border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Voltar
            </button>
            <button
              onClick={handleManualSave}
              className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Save size={12} />
              Salvar Rascunho
            </button>
            <button
              onClick={() => setStep("confirm")}
              disabled={selectedCount === 0}
              className="flex items-center gap-2 bg-gray-900 text-white px-6 py-2.5 text-sm font-bold hover:bg-blue-800 transition-colors disabled:opacity-40"
            >
              <Plus size={14} />
              Criar Proposta com {selectedCount} produto{selectedCount !== 1 ? "s" : ""}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Confirm ── */}
      {step === "confirm" && (
        <div className="space-y-6 max-w-lg">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Título da Proposta *
            </label>
            <input
              type="text"
              value={proposalTitle}
              onChange={(e) => setProposalTitle(e.target.value)}
              placeholder="Ex: Proposta Hospital Municipal – Fev/2026"
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Template de Proposta (opcional)
            </label>
            <select
              value={selectedTemplateId ?? ""}
              onChange={(e) => setSelectedTemplateId(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
            >
              <option value="">Sem template</option>
              {(proposalTemplates as any[]).map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.isDefault === "yes" ? "★" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Organização / Cliente (opcional)
            </label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Ex: Prefeitura de São Paulo"
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
            />
          </div>

          <div className="bg-gray-50 border border-gray-200 px-4 py-3">
            <p className="text-xs font-semibold text-gray-700 mb-2">Resumo</p>
            <div className="space-y-1">
              {items.filter((i) => i.selected).slice(0, 5).map((item, idx) => {
                const product =
                  item.overrideProductId
                    ? item.alternatives.find((a) => a.id === item.overrideProductId) ?? item.matchedProduct
                    : item.matchedProduct;
                return (
                  <div key={`confirm-${idx}`} className="flex items-center justify-between text-xs">
                    <span className="text-gray-700 truncate max-w-xs">
                      {item.quantity}× {product?.name ?? item.inputName}
                    </span>
                    <span className="text-gray-500 ml-2 flex-shrink-0">
                      {product?.price ? `R$ ${parseFloat(product.price).toFixed(2)}` : "—"}
                    </span>
                  </div>
                );
              })}
              {selectedCount > 5 && (
                <p className="text-[10px] text-gray-400">+ {selectedCount - 5} outros produtos</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setStep("suggest")}
              className="px-4 py-2.5 border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Voltar
            </button>
            <button
              onClick={handleManualSave}
              className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Save size={12} />
              Salvar Rascunho
            </button>
            <button
              onClick={handleConfirm}
              disabled={createProposal.isPending || addItem.isPending || !proposalTitle.trim()}
              className="flex items-center gap-2 bg-gray-900 text-white px-6 py-2.5 text-sm font-bold hover:bg-blue-800 transition-colors disabled:opacity-40"
            >
              {createProposal.isPending || addItem.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <CheckCircle2 size={14} />
              )}
              {createProposal.isPending || addItem.isPending ? "Criando..." : "Confirmar e Abrir Proposta"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
