import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Square,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const PAGE_SIZE = 50;

// ─── Types ───────────────────────────────────────────────────────────────────

type Suggestion = {
  activeIngredient: string;
  concentration: string;
  presentation: string;
  unit: string;
  manufacturer: string | null;
  description: string;
  confidence: number;
  error?: string;
};

type ProductRow = {
  id: number;
  name: string;
  code?: string | null;
  activeIngredient?: string | null;
  concentration?: string | null;
  presentation?: string | null;
  unit?: string | null;
  manufacturer?: string | null;
  categoryName?: string | null;
  fichaTecnica?: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-400" : "bg-red-400";
  const label = pct >= 80 ? "Alta" : pct >= 60 ? "Média" : "Baixa";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[10px] font-bold w-12 text-right ${pct >= 80 ? "text-emerald-600" : pct >= 60 ? "text-amber-600" : "text-red-500"}`}>
        {pct}% {label}
      </span>
    </div>
  );
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m${s > 0 ? ` ${s}s` : ""}`;
}

// ─── SuggestionCard ──────────────────────────────────────────────────────────

function SuggestionCard({
  product,
  suggestion,
  onApply,
  onDismiss,
}: {
  product: ProductRow;
  suggestion: Suggestion;
  onApply: (fields: Partial<ProductRow>) => void;
  onDismiss: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(["activeIngredient", "concentration", "presentation", "unit"])
  );

  const fields: { key: keyof Suggestion; label: string; current: string | null | undefined }[] = [
    { key: "activeIngredient", label: "Princípio Ativo", current: product.activeIngredient },
    { key: "concentration", label: "Concentração", current: product.concentration },
    { key: "presentation", label: "Apresentação", current: product.presentation },
    { key: "unit", label: "Unidade", current: product.unit },
    { key: "manufacturer", label: "Fabricante", current: product.manufacturer },
    { key: "description", label: "Descrição", current: null },
  ];

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleApply = () => {
    const patch: Record<string, string | null> = {};
    for (const f of fields) {
      if (selected.has(f.key)) {
        const val = suggestion[f.key as keyof Suggestion];
        patch[f.key] = typeof val === "string" ? val : null;
      }
    }
    onApply(patch);
  };

  const pct = Math.round(suggestion.confidence * 100);
  const borderColor = pct >= 80 ? "border-emerald-200" : pct >= 60 ? "border-amber-200" : "border-red-200";
  const bgColor = pct >= 80 ? "bg-emerald-50" : pct >= 60 ? "bg-amber-50" : "bg-red-50";

  return (
    <div className={`border ${borderColor} bg-white rounded-lg overflow-hidden shadow-sm`}>
      <div
        className={`flex items-center justify-between p-3 cursor-pointer hover:${bgColor} transition-colors`}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={12} className="text-emerald-500 flex-shrink-0" />
            <span className="text-xs font-bold text-gray-900 truncate">{product.name}</span>
            {product.code && <span className="text-[10px] text-gray-400 flex-shrink-0">{product.code}</span>}
          </div>
          <div className="mt-1.5 pr-4">
            <ConfidenceBar value={suggestion.confidence} />
          </div>
          {!expanded && (
            <div className="text-[10px] text-gray-500 mt-1 truncate">
              {suggestion.activeIngredient && <span className="font-medium">{suggestion.activeIngredient}</span>}
              {suggestion.concentration && <span> · {suggestion.concentration}</span>}
              {suggestion.presentation && <span> · {suggestion.presentation}</span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 ml-3 flex-shrink-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleApply(); }}
            className="flex items-center gap-1 bg-emerald-600 text-white text-[10px] font-bold px-2.5 py-1.5 rounded hover:bg-emerald-700 transition-colors"
          >
            <CheckCircle2 size={10} />
            Aplicar
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            className="text-gray-300 hover:text-red-500 transition-colors p-1"
          >
            <X size={13} />
          </button>
          {expanded ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 p-4 space-y-3 bg-gray-50">
          <p className="text-[10px] text-gray-400 font-medium uppercase tracking-widest">Selecione os campos para aplicar:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {fields.map((f) => {
              const val = suggestion[f.key as keyof Suggestion];
              const suggestedStr = typeof val === "string" ? val : (val === null ? "—" : "");
              const isSelected = selected.has(f.key);
              const hasChange = suggestedStr !== (f.current ?? "");
              return (
                <label
                  key={f.key}
                  className={`flex items-start gap-2 p-2.5 border rounded cursor-pointer transition-all ${
                    isSelected ? "border-blue-400 bg-blue-50 shadow-sm" : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(f.key)}
                    className="mt-0.5 accent-blue-600 flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{f.label}</div>
                    {f.current && (
                      <div className="text-[10px] text-gray-400 line-through truncate">{f.current}</div>
                    )}
                    <div className={`text-xs font-semibold truncate ${hasChange ? "text-blue-700" : "text-gray-500"}`}>
                      {suggestedStr || "—"}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
          {suggestion.description && (
            <div className="text-[10px] text-gray-600 bg-white p-2.5 border border-gray-200 rounded">
              <span className="font-bold text-gray-700">Descrição sugerida:</span> {suggestion.description}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ProgressPanel ───────────────────────────────────────────────────────────

function ProgressPanel({ onRefresh }: { onRefresh: () => void }) {
  const { data: progress, refetch } = trpc.products.getEnrichmentProgress.useQuery(undefined, {
    // Polling apenas enquanto o enriquecimento estiver em execução
    refetchInterval: (query) => (query.state.data?.status === "running" ? 3000 : false),
  });
  const startBatch = trpc.products.enrichFichaTecnicaBatch.useQuery(undefined, { enabled: false });

  const handleStart = async () => {
    toast.info("Iniciando enriquecimento automático em background...");
    await startBatch.refetch();
    setTimeout(() => { refetch(); onRefresh(); }, 2000);
  };

  if (!progress) return null;

  const isRunning = progress.status === "running";
  const isCompleted = progress.status === "completed";
  const isError = progress.status === "error";
  const isIdle = progress.status === "idle";

  return (
    <div className={`rounded-xl border p-4 ${isRunning ? "border-blue-300 bg-blue-50" : isCompleted ? "border-emerald-300 bg-emerald-50" : isError ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50"}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isRunning && <Loader2 size={14} className="animate-spin text-blue-600" />}
          {isCompleted && <CheckCircle2 size={14} className="text-emerald-600" />}
          {isError && <AlertTriangle size={14} className="text-red-600" />}
          {isIdle && <Sparkles size={14} className="text-gray-500" />}
          <span className="text-xs font-bold text-gray-800">
            {isRunning ? "Enriquecimento em andamento..." : isCompleted ? "Enriquecimento concluído" : isError ? "Erro no enriquecimento" : "Enriquecimento automático"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isRunning && (
            <button onClick={() => refetch()} className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-1">
              <RefreshCw size={10} /> Atualizar
            </button>
          )}
          {(isIdle || isCompleted || isError) && (
            <button
              onClick={handleStart}
              disabled={startBatch.isFetching}
              className="flex items-center gap-1.5 bg-blue-600 text-white text-[10px] font-bold px-3 py-1.5 rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {startBatch.isFetching ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
              {isCompleted ? "Reprocessar" : "Enriquecer Tudo Automaticamente"}
            </button>
          )}
        </div>
      </div>

      {(isRunning || isCompleted || isError) && progress.totalProducts > 0 && (
        <>
          {/* Barra de progresso */}
          <div className="w-full h-3 bg-white rounded-full overflow-hidden border border-gray-200 mb-3">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isCompleted ? "bg-emerald-500" : isError ? "bg-red-400" : "bg-blue-500"}`}
              style={{ width: `${progress.percentComplete}%` }}
            />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-lg p-2.5 border border-gray-200 text-center">
              <div className="text-lg font-black text-gray-900">{progress.processedProducts}</div>
              <div className="text-[10px] text-gray-500 font-medium">Processados</div>
            </div>
            <div className="bg-white rounded-lg p-2.5 border border-emerald-200 text-center">
              <div className="text-lg font-black text-emerald-700">{progress.successfulProducts}</div>
              <div className="text-[10px] text-emerald-600 font-medium">Sucesso</div>
            </div>
            <div className="bg-white rounded-lg p-2.5 border border-red-200 text-center">
              <div className="text-lg font-black text-red-600">{progress.failedProducts}</div>
              <div className="text-[10px] text-red-500 font-medium">Erros</div>
            </div>
            <div className="bg-white rounded-lg p-2.5 border border-gray-200 text-center">
              <div className="text-lg font-black text-gray-700">{progress.percentComplete}%</div>
              <div className="text-[10px] text-gray-500 font-medium">Completo</div>
            </div>
          </div>

          {isRunning && progress.estimatedTimeRemaining > 0 && (
            <div className="flex items-center gap-1.5 mt-2 text-[10px] text-blue-600">
              <Clock size={10} />
              Tempo restante estimado: <strong>{formatTime(progress.estimatedTimeRemaining)}</strong>
              {" · "}Lote {progress.currentBatch}/{progress.totalBatches}
            </div>
          )}

          {isError && progress.lastError && (
            <div className="mt-2 text-[10px] text-red-600 bg-red-50 border border-red-200 rounded p-2">
              <strong>Erro:</strong> {progress.lastError}
            </div>
          )}
        </>
      )}

      {isIdle && (
        <p className="text-[11px] text-gray-500">
          Processa automaticamente <strong>todos os produtos sem ficha técnica</strong> em lotes de 50, usando IA para extrair
          princípio ativo, concentração, forma farmacêutica, classe terapêutica, espécie-alvo e indicações.
        </p>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EnriquecimentoCatalogo() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [suggestions, setSuggestions] = useState<Map<number, Suggestion>>(new Map());
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [loadingIds, setLoadingIds] = useState<Set<number>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [applyingAll, setApplyingAll] = useState(false);
  const [offset, setOffset] = useState(0);
  const [onlySemFicha, setOnlySemFicha] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading, refetch: refetchProducts } = trpc.products.list.useQuery(
    {
      search: debouncedSearch || undefined,
      isActive: "yes",
      limit: PAGE_SIZE,
      offset,
      withoutFichaTecnica: onlySemFicha ? true : undefined,
    },
    { placeholderData: (prev) => prev }
  );

  const utils = trpc.useUtils();
  const suggestMutation = trpc.enrichment.suggestFields.useMutation();
  const updateProduct = trpc.products.update.useMutation({
    onSuccess: () => {
      utils.products.list.invalidate();
      refetchProducts();
    },
  });

  const items = (data?.items ?? []) as ProductRow[];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  // Limpar timer ao desmontar
  useEffect(() => {
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, []);

  const handleSearchChange = (v: string) => {
    setSearch(v);
    setOffset(0);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(v), 300);
  };

  const goToPage = (newOffset: number) => {
    setOffset(newOffset);
    setSelectedIds(new Set());
    setSuggestions(new Map());
    setDismissed(new Set());
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const suggestOne = async (product: ProductRow) => {
    setLoadingIds((prev) => { const n = new Set(Array.from(prev)); n.add(product.id); return n; });
    try {
      const result = await suggestMutation.mutateAsync({
        name: product.name,
        categoryName: product.categoryName ?? undefined,
      });
      if (result && !("error" in result)) {
        setSuggestions((prev) => new Map(prev).set(product.id, result as Suggestion));
      } else {
        toast.error(`Erro ao analisar "${product.name}": ${(result as any)?.error ?? "Sem resposta"}`);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao chamar IA");
    } finally {
      setLoadingIds((prev) => { const n = new Set(prev); n.delete(product.id); return n; });
    }
  };

  const suggestSelected = async () => {
    const toProcess = items.filter((p) => selectedIds.has(p.id) && !suggestions.has(p.id) && !dismissed.has(p.id));
    if (!toProcess.length) { toast.info("Todos os selecionados já têm sugestão ou foram descartados."); return; }
    toast.info(`Analisando ${toProcess.length} produto${toProcess.length !== 1 ? "s" : ""}...`);
    for (const p of toProcess) await suggestOne(p);
    toast.success(`Análise concluída para ${toProcess.length} produto${toProcess.length !== 1 ? "s" : ""}.`);
  };

  const applyAllSelected = async () => {
    const toApply = items.filter((p) => selectedIds.has(p.id) && suggestions.has(p.id) && !dismissed.has(p.id));
    if (!toApply.length) {
      toast.info("Nenhum produto selecionado com sugestão gerada. Analise primeiro.");
      return;
    }
    setApplyingAll(true);
    let applied = 0;
    let errors = 0;
    for (const p of toApply) {
      const sug = suggestions.get(p.id)!;
      try {
        await updateProduct.mutateAsync({
          id: p.id,
          activeIngredient: sug.activeIngredient || null,
          concentration: sug.concentration || null,
          presentation: sug.presentation || null,
          unit: sug.unit || null,
        } as any);
        setDismissed((prev) => { const n = new Set(Array.from(prev)); n.add(p.id); return n; });
        applied++;
      } catch {
        errors++;
      }
    }
    setApplyingAll(false);
    if (applied > 0) toast.success(`${applied} produto${applied !== 1 ? "s" : ""} atualizado${applied !== 1 ? "s" : ""}.`);
    if (errors > 0) toast.error(`${errors} produto${errors !== 1 ? "s" : ""} com erro.`);
  };

  const applyFields = async (product: ProductRow, fields: Partial<ProductRow>) => {
    try {
      await updateProduct.mutateAsync({ id: product.id, ...fields } as any);
      toast.success(`"${product.name}" atualizado.`);
      setDismissed((prev) => { const n = new Set(Array.from(prev)); n.add(product.id); return n; });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao atualizar produto");
    }
  };

  const pendingCount = items.filter((p) => !suggestions.has(p.id) && !dismissed.has(p.id)).length;
  const suggestedCount = Array.from(suggestions.keys()).filter((id) => !dismissed.has(id)).length;
  const readyToApply = items.filter((p) => selectedIds.has(p.id) && suggestions.has(p.id) && !dismissed.has(p.id)).length;
  const allSelected = items.length > 0 && items.every((p) => selectedIds.has(p.id));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-gray-900 flex items-center gap-2">
            <Sparkles size={22} className="text-blue-600" />
            Enriquecimento de Catálogo
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Use IA para completar fichas técnicas: princípio ativo, concentração, apresentação, fabricante e mais.
          </p>
        </div>
      </div>

      {/* ── Painel de Progresso do Job Automático ── */}
      <ProgressPanel onRefresh={() => { setRefreshKey((k) => k + 1); refetchProducts(); }} />

      {/* ── KPIs da Página ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border border-gray-200 rounded-lg p-3 bg-white">
          <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400">Sem ficha técnica</div>
          <div className="text-2xl font-black text-gray-900">{total.toLocaleString("pt-BR")}</div>
        </div>
        <div className="border border-gray-200 rounded-lg p-3 bg-white">
          <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400">Nesta página</div>
          <div className="text-2xl font-black text-gray-700">{items.length}</div>
        </div>
        <div className="border border-blue-200 rounded-lg p-3 bg-blue-50">
          <div className="text-[10px] font-bold tracking-widest uppercase text-blue-400">Sugestões geradas</div>
          <div className="text-2xl font-black text-blue-700">{suggestedCount}</div>
        </div>
        <div className="border border-amber-200 rounded-lg p-3 bg-amber-50">
          <div className="text-[10px] font-bold tracking-widest uppercase text-amber-500">Aguardando análise</div>
          <div className="text-2xl font-black text-amber-700">{pendingCount}</div>
        </div>
      </div>

      {/* ── Filtros e Busca ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 flex-1 min-w-[200px] focus-within:border-blue-400 transition-colors bg-white">
          <Search size={12} className="text-gray-400 flex-shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Buscar produto pelo nome..."
            className="text-sm outline-none flex-1 bg-transparent"
          />
          {search && (
            <button onClick={() => handleSearchChange("")} className="text-gray-300 hover:text-gray-700">
              <X size={11} />
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-xs font-semibold text-gray-600 cursor-pointer hover:border-blue-400 transition-colors select-none bg-white">
          <input
            type="checkbox"
            checked={onlySemFicha}
            onChange={(e) => { setOnlySemFicha(e.target.checked); setOffset(0); setSelectedIds(new Set()); setSuggestions(new Map()); setDismissed(new Set()); }}
            className="accent-blue-600"
          />
          Apenas sem ficha técnica
        </label>
        <button
          onClick={() => setSelectedIds(allSelected ? new Set() : new Set(items.map((p) => p.id)))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-xs font-semibold text-gray-600 hover:border-blue-400 transition-colors bg-white"
        >
          {allSelected ? (
            <span className="flex items-center gap-1"><Square size={11} /> Desmarcar todos</span>
          ) : (
            <span className="flex items-center gap-1"><CheckCircle2 size={11} /> Selecionar todos</span>
          )}
        </button>
      </div>

      {/* ── Barra de Ações em Lote ── */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap p-3 bg-blue-50 border border-blue-200 rounded-xl">
          <span className="text-xs font-bold text-blue-800">
            {selectedIds.size} produto{selectedIds.size !== 1 ? "s" : ""} selecionado{selectedIds.size !== 1 ? "s" : ""}
          </span>
          <div className="flex-1" />
          <button
            onClick={suggestSelected}
            disabled={suggestMutation.isPending || loadingIds.size > 0}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {(suggestMutation.isPending || loadingIds.size > 0) ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            Analisar {selectedIds.size} com IA
          </button>
          {readyToApply > 0 && (
            <button
              onClick={applyAllSelected}
              disabled={applyingAll}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {applyingAll ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
              Aplicar em {readyToApply} produto{readyToApply !== 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}

      {/* ── Lista de Produtos ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Carregando produtos...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-gray-200 rounded-xl">
          <CheckCircle2 size={32} className="mx-auto text-emerald-400 mb-3" />
          <p className="text-sm font-semibold text-gray-600">
            {onlySemFicha ? "Todos os produtos têm ficha técnica!" : "Nenhum produto encontrado."}
          </p>
          {onlySemFicha && (
            <button onClick={() => setOnlySemFicha(false)} className="mt-2 text-xs text-blue-600 underline">
              Mostrar todos os produtos
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((product) => {
            const suggestion = suggestions.get(product.id);
            const isLoadingItem = loadingIds.has(product.id);
            const isDismissed = dismissed.has(product.id);
            if (isDismissed) return null;

            return (
              <div key={product.id}>
                {suggestion ? (
                  <SuggestionCard
                    product={product}
                    suggestion={suggestion}
                    onApply={(fields) => applyFields(product, fields)}
                    onDismiss={() => setDismissed((prev) => { const n = new Set(Array.from(prev)); n.add(product.id); return n; })}
                  />
                ) : (
                  <div className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:border-blue-200 hover:bg-blue-50/30 transition-all bg-white">
                    <div className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(product.id)}
                        onChange={() => {
                          setSelectedIds((prev) => {
                            const n = new Set(prev);
                            if (n.has(product.id)) n.delete(product.id);
                            else n.add(product.id);
                            return n;
                          });
                        }}
                        className="accent-blue-600 flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-gray-900 truncate">{product.name}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
                          {product.categoryName && <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">{product.categoryName}</span>}
                          {product.activeIngredient ? (
                            <span className="text-emerald-600 flex items-center gap-0.5"><CheckCircle2 size={9} /> {product.activeIngredient}</span>
                          ) : (
                            <span className="text-amber-500 flex items-center gap-0.5"><AlertCircle size={9} /> Sem princípio ativo</span>
                          )}
                          {product.concentration && <span className="text-gray-500">{product.concentration}</span>}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => suggestOne(product)}
                      disabled={isLoadingItem}
                      className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 py-1.5 text-[10px] font-bold text-gray-600 hover:border-blue-400 hover:text-blue-700 hover:bg-blue-50 transition-all disabled:opacity-50 flex-shrink-0 ml-3"
                    >
                      {isLoadingItem ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                      {isLoadingItem ? "Analisando..." : "Analisar"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Paginação ── */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <span className="text-xs text-gray-500">
            Página <strong>{currentPage}</strong> de <strong>{totalPages}</strong> — {total.toLocaleString("pt-BR")} produto{total !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0}
              className="flex items-center gap-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-blue-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={12} /> Anterior
            </button>
            <button
              onClick={() => goToPage(offset + PAGE_SIZE)}
              disabled={offset + PAGE_SIZE >= total}
              className="flex items-center gap-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-blue-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Próxima <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}

      {/* ── Info Box ── */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <AlertCircle size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-blue-700 space-y-1">
          <p><strong>Enriquecimento Manual:</strong> Selecione produtos, clique em <strong>Analisar com IA</strong> para gerar sugestões e depois em <strong>Aplicar</strong> para salvar. Revise sempre produtos com confiança baixa (&lt;60%).</p>
          <p><strong>Enriquecimento Automático:</strong> Clique em <strong>Enriquecer Tudo Automaticamente</strong> para processar todos os produtos em background. O progresso é exibido em tempo real acima.</p>
        </div>
      </div>
    </div>
  );
}
