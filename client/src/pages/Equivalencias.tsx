import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  GitMerge,
  Layers,
  Loader2,
  Plus,
  Search,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
type AutoEquivGroup = {
  activeIngredient: string;
  members: {
    id: number;
    name: string;
    supplierId: number;
    supplierName: string | null;
    categoryId: number;
    categoryName: string | null;
    price: string | null;
    concentration: string | null;
    presentation: string | null;
  }[];
  existingGroupId: number | null;
  crossCategory: boolean;
};

// ─── Tab: Grupos Existentes ───────────────────────────────────────────────────
function TabGrupos({ onSwitchToAuto }: { onSwitchToAuto?: () => void }) {
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [filterCategory, setFilterCategory] = useState<number | undefined>();
  const [showCreate, setShowCreate] = useState(false);
  const [newAI, setNewAI] = useState("");
  const [newCategoryId, setNewCategoryId] = useState<number | "">("");
  const [newNotes, setNewNotes] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);

  const { data: categories } = trpc.categories.list.useQuery();
  const { data: groups, isLoading } = trpc.equivalences.list.useQuery({ categoryId: filterCategory });
  const { data: selectedGroup } = trpc.equivalences.get.useQuery(
    { id: selectedGroupId! },
    { enabled: !!selectedGroupId }
  );
  const { data: productSearch_results } = trpc.products.smartSearch.useQuery(
    { query: productSearch },
    { enabled: productSearch.length >= 2 }
  );
  const { data: stats } = trpc.equivalences.stats.useQuery();

  const utils = trpc.useUtils();
  const createGroup = trpc.equivalences.create.useMutation({
    onSuccess: () => {
      utils.equivalences.list.invalidate();
      utils.equivalences.stats.invalidate();
      setShowCreate(false);
      setNewAI(""); setNewCategoryId(""); setNewNotes(""); setSelectedProductIds([]);
      toast.success("Grupo criado com sucesso!");
    },
  });
  const deleteGroup = trpc.equivalences.delete.useMutation({
    onSuccess: () => {
      utils.equivalences.list.invalidate();
      utils.equivalences.stats.invalidate();
      if (selectedGroupId) setSelectedGroupId(null);
      toast.success("Grupo excluído.");
    },
  });
  const generateAllMutation = trpc.equivalences.generateAndApplyAll.useMutation({
    onSuccess: (result) => {
      utils.equivalences.list.invalidate();
      utils.equivalences.stats.invalidate();
      if (result.created > 0) {
        toast.success(`${result.created} grupo${result.created !== 1 ? "s" : ""} criado${result.created !== 1 ? "s" : ""} automaticamente! (${result.total} princípios ativos analisados)`);
      } else {
        toast.success(`Nenhum grupo novo encontrado. ${result.total} princípios ativos já estão cobertos.`);
      }
    },
    onError: (e) => toast.error("Erro na geração: " + e.message),
  });
  const removeMember = trpc.equivalences.removeMember.useMutation({
    onSuccess: () => utils.equivalences.get.invalidate({ id: selectedGroupId! }),
  });
  const addMember = trpc.equivalences.addMember.useMutation({
    onSuccess: () => utils.equivalences.get.invalidate({ id: selectedGroupId! }),
  });

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAI.trim() || selectedProductIds.length === 0) return;
    createGroup.mutate({
      activeIngredient: newAI.trim(),
      categoryId: newCategoryId ? Number(newCategoryId) : undefined,
      notes: newNotes || undefined,
      productIds: selectedProductIds,
    });
  };

  const toggleProduct = (id: number) => {
    setSelectedProductIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  return (
    <div>
      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Grupos Totais", value: stats.totalGroups, color: "text-gray-900" },
            { label: "Produtos Vinculados", value: stats.totalMembers, color: "text-blue-700" },
            { label: "Cruzam Vet/Humano", value: stats.crossCategoryGroups, color: "text-purple-700" },
          ].map((s) => (
            <div key={s.label} className="border border-gray-200 p-4">
              <div className={`text-2xl font-black font-mono ${s.color}`}>{s.value}</div>
              <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Banner de geração inicial quando não há grupos */}
      {stats && stats.totalGroups === 0 && !isLoading && (
        <div className="border border-purple-200 bg-purple-50 p-5 mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-bold text-purple-900 mb-1">Nenhum grupo de equivalência ainda</div>
            <p className="text-xs text-purple-700">
              Clique em <strong>Gerar Agora</strong> para criar automaticamente grupos por princípio ativo, incluindo cruzamentos Vet/Humano.
            </p>
          </div>
          <button
            onClick={() => generateAllMutation.mutate({})}
            disabled={generateAllMutation.isPending}
            className="flex-shrink-0 flex items-center gap-2 bg-purple-700 text-white px-5 py-2.5 text-sm font-bold hover:bg-purple-800 transition-colors disabled:opacity-50"
          >
            {generateAllMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
            {generateAllMutation.isPending ? "Gerando..." : "Gerar Agora"}
          </button>
        </div>
      )}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-800 transition-colors"
          >
            <Plus size={14} />Novo Grupo Manual
          </button>
          <button
            onClick={() => generateAllMutation.mutate({})}
            disabled={generateAllMutation.isPending}
            className="flex items-center gap-2 border border-purple-300 text-purple-700 px-4 py-2 text-sm font-semibold hover:bg-purple-50 transition-colors disabled:opacity-50"
          >
            {generateAllMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
            {generateAllMutation.isPending ? "Gerando..." : "Gerar Automático"}
          </button>
        </div>
        <select
          value={filterCategory ?? ""}
          onChange={(e) => setFilterCategory(e.target.value ? Number(e.target.value) : undefined)}
          className="text-xs border border-gray-300 px-2 py-1.5 focus:outline-none"
        >
          <option value="">Todas as categorias</option>
          {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="border border-gray-900 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-black text-gray-900">Criar Grupo Manual</h2>
            <button onClick={() => setShowCreate(false)}><X size={16} className="text-gray-400" /></button>
          </div>
          <form onSubmit={handleCreateGroup}>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="col-span-2">
                <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">Princípio Ativo *</label>
                <input type="text" value={newAI} onChange={(e) => setNewAI(e.target.value)} required
                  className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
                  placeholder="Ex: Amoxicilina, Ivermectina..." />
              </div>
              <div>
                <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">Categoria</label>
                <select value={newCategoryId} onChange={(e) => setNewCategoryId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-900">
                  <option value="">Todas</option>
                  {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">Observações</label>
                <input type="text" value={newNotes} onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
                  placeholder="Notas opcionais" />
              </div>
            </div>
            <div className="mb-4">
              <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-2">Produtos *</label>
              <div className="flex items-center gap-2 border border-gray-300 px-3 py-1.5 mb-2">
                <Search size={12} className="text-gray-400" />
                <input type="text" value={productSearch} onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Buscar produto..." className="text-sm outline-none flex-1 bg-transparent" />
              </div>
              {productSearch_results && productSearch_results.length > 0 && (
                <div className="border border-gray-200 max-h-40 overflow-y-auto">
                  {productSearch_results.slice(0, 20).map((p) => (
                    <button key={p.id} type="button" onClick={() => toggleProduct(p.id)}
                      className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-gray-50 ${selectedProductIds.includes(p.id) ? "bg-blue-50" : ""}`}>
                      <div className={`w-3 h-3 border flex-shrink-0 flex items-center justify-center ${selectedProductIds.includes(p.id) ? "bg-blue-800 border-blue-800" : "border-gray-300"}`}>
                        {selectedProductIds.includes(p.id) && <span className="text-white text-[8px]">✓</span>}
                      </div>
                      <span className="font-medium text-gray-900">{p.name}</span>
                      <span className="text-gray-400">{p.supplierName}</span>
                    </button>
                  ))}
                </div>
              )}
              {selectedProductIds.length > 0 && (
                <div className="mt-2 text-[10px] font-bold text-blue-800 tracking-widest uppercase">
                  {selectedProductIds.length} produto{selectedProductIds.length !== 1 ? "s" : ""} selecionado{selectedProductIds.length !== 1 ? "s" : ""}
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-gray-300 text-sm font-semibold text-gray-700 hover:border-gray-900">Cancelar</button>
              <button type="submit" disabled={createGroup.isPending || !newAI.trim() || selectedProductIds.length === 0}
                className="flex items-center gap-2 bg-gray-900 text-white px-5 py-2 text-sm font-semibold hover:bg-blue-800 transition-colors disabled:opacity-50">
                {createGroup.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                Criar Grupo
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Groups list */}
        <div className="lg:col-span-1">
          {isLoading ? (
            <div className="py-8 text-center"><div className="w-4 h-1 bg-gray-200 mx-auto animate-pulse" /></div>
          ) : groups && groups.length > 0 ? (
            <div className="border border-gray-200 overflow-hidden">
              {groups.map((g) => (
                <div key={g.id} role="button" tabIndex={0}
                  onClick={() => setSelectedGroupId(g.id === selectedGroupId ? null : g.id)}
                  onKeyDown={(e) => e.key === "Enter" && setSelectedGroupId(g.id === selectedGroupId ? null : g.id)}
                  className={`w-full text-left px-3 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors flex items-center justify-between gap-2 cursor-pointer ${selectedGroupId === g.id ? "bg-gray-50 border-l-2 border-l-red-600" : ""}`}>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-gray-900 truncate">{g.activeIngredient}</div>
                    {g.notes && <div className="text-[10px] text-gray-400 truncate">{g.notes}</div>}
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); if (confirm("Excluir este grupo?")) deleteGroup.mutate({ id: g.id }); }}
                    className="text-gray-200 hover:text-blue-800 transition-colors flex-shrink-0">
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center border border-dashed border-gray-200">
              <GitMerge size={20} className="text-gray-200 mx-auto mb-2" />
              <p className="text-xs text-gray-400">Nenhum grupo criado.</p>
            </div>
          )}
        </div>

        {/* Group detail */}
        <div className="lg:col-span-2">
          {selectedGroup ? (
            <div>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400">Princípio Ativo</div>
                  <h2 className="text-xl font-black text-gray-900">{selectedGroup.activeIngredient}</h2>
                  {selectedGroup.notes && <p className="text-xs text-gray-500 mt-1">{selectedGroup.notes}</p>}
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400">Produtos</div>
                  <div className="text-2xl font-black font-mono text-gray-900">{selectedGroup.members?.length ?? 0}</div>
                </div>
              </div>

              {/* Add product */}
              <div className="mb-4 p-3 bg-gray-50 border border-gray-200">
                <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-2">Adicionar produto</div>
                <div className="flex items-center gap-2 border border-gray-300 px-2 py-1 bg-white">
                  <Search size={11} className="text-gray-400" />
                  <input type="text" value={productSearch} onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Buscar produto..." className="text-xs outline-none flex-1 bg-transparent" />
                </div>
                {productSearch_results && productSearch_results.length > 0 && productSearch.length >= 2 && (
                  <div className="border border-gray-200 max-h-32 overflow-y-auto mt-1 bg-white">
                    {productSearch_results.slice(0, 10).map((p) => {
                      const alreadyMember = selectedGroup.members?.some((m) => m.productId === p.id);
                      return (
                        <button key={p.id} type="button" disabled={alreadyMember || addMember.isPending}
                          onClick={() => { addMember.mutate({ groupId: selectedGroup.id, productId: p.id }); setProductSearch(""); }}
                          className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-gray-50 ${alreadyMember ? "opacity-40" : ""}`}>
                          <div><span className="font-medium">{p.name}</span><span className="text-gray-400 ml-2">{p.supplierName}</span></div>
                          {alreadyMember ? <span className="text-[10px] text-gray-400">já no grupo</span> : <span className="text-[10px] text-blue-800 font-bold">+ adicionar</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Members table */}
              {selectedGroup.members && selectedGroup.members.length > 0 ? (
                <div className="overflow-x-auto border border-gray-200">
                  <table className="its-table">
                    <thead><tr><th>#</th><th>Produto</th><th>Fabricante</th><th>Concentração</th><th>Categoria</th><th>Fornecedor</th><th className="text-right">Preço</th><th></th></tr></thead>
                    <tbody>
                      {selectedGroup.members.map((m, idx) => {
                        const prices = selectedGroup.members!.filter((x) => x.price).map((x) => parseFloat(x.price!));
                        const minP = prices.length > 0 ? Math.min(...prices) : null;
                        const isBest = m.price && minP !== null && parseFloat(m.price) === minP;
                        return (
                          <tr key={m.memberId ?? `${m.productId}-${idx}`}>
                            <td className="font-mono text-[10px] text-gray-400">{idx + 1}</td>
                            <td>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-gray-900">{m.productName}</span>
                                {isBest && <span className="text-[9px] font-bold tracking-widest uppercase bg-blue-800 text-white px-1 py-0.5">Menor</span>}
                              </div>
                            </td>
                            <td className="text-xs text-gray-600">{m.manufacturer ?? "—"}</td>
                            <td className="text-xs text-gray-600">{m.concentration ?? "—"}</td>
                            <td className="text-xs text-gray-500">{m.categoryName ?? "—"}</td>
                            <td className="text-xs font-medium text-gray-900">{m.supplierName}</td>
                            <td className="text-right">
                              {m.price ? (
                                <span className={`text-sm font-mono ${isBest ? "text-blue-800 font-bold" : "text-gray-900"}`}>
                                  R$ {parseFloat(m.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                </span>
                              ) : <span className="text-xs text-gray-400">—</span>}
                            </td>
                            <td>
                              <button onClick={() => removeMember.mutate({ groupId: selectedGroup.id, productId: m.productId! })}
                                className="text-gray-200 hover:text-blue-800 transition-colors"><X size={11} /></button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="border border-gray-200 py-8 text-center">
                  <p className="text-xs text-gray-400">Nenhum produto neste grupo.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="py-16 text-center">
              <div className="w-8 h-8 border-2 border-gray-200 flex items-center justify-center mx-auto mb-4">
                <GitMerge size={16} className="text-gray-300" />
              </div>
              <p className="text-sm text-gray-400">Selecione um grupo para ver os produtos equivalentes</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Preset de cruzamentos rápidos
const CROSS_PRESETS = [
  { label: "Vet × Humano", colorA: "bg-green-100 text-green-800", colorB: "bg-blue-100 text-blue-800", keywords: { a: ["veterin", "animal", "vet"], b: ["human", "humano"] } },
  { label: "Antibióticos", colorA: "bg-orange-100 text-orange-800", colorB: "", keywords: { a: ["antibio", "antibiót"], b: [] } },
  { label: "Anti-inflamatórios", colorA: "bg-blue-100 text-blue-800", colorB: "", keywords: { a: ["anti-inflamat", "antiinflamat", "aine"], b: [] } },
];

// ─── Tab: Geração Automática ──────────────────────────────────────────────────
function TabAutoGerar({ initialBatchId }: { initialBatchId?: number }) {
  const [batchId, setBatchId] = useState<string>(initialBatchId ? String(initialBatchId) : "");
  const [previewData, setPreviewData] = useState<AutoEquivGroup[] | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [filterCross, setFilterCross] = useState(false);
  const [filterNew, setFilterNew] = useState(false);
  const [applied, setApplied] = useState(false);

  // Filtros de categoria A e B
  const [categoryIdsA, setCategoryIdsA] = useState<number[]>([]);
  const [categoryIdsB, setCategoryIdsB] = useState<number[]>([]);
  const [crossMode, setCrossMode] = useState<"all" | "cross">("all");

  const { data: categories } = trpc.categories.list.useQuery();
  const utils = trpc.useUtils();

  const previewMutation = trpc.equivalences.preview.useMutation({
    onSuccess: (data) => {
      setPreviewData(data as AutoEquivGroup[]);
      // Pre-seleciona todos os grupos novos
      const preSelected = new Set(
        (data as AutoEquivGroup[])
          .filter((g) => g.existingGroupId === null)
          .map((g) => g.activeIngredient)
      );
      setSelectedKeys(preSelected);
      setApplied(false);
      toast.success(`${data.length} grupo${data.length !== 1 ? "s" : ""} identificado${data.length !== 1 ? "s" : ""}!`);
    },
    onError: (e) => toast.error("Erro ao analisar: " + e.message),
  });

  const applyMutation = trpc.equivalences.applyAuto.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.created} grupo${result.created !== 1 ? "s" : ""} criado${result.created !== 1 ? "s" : ""}, ${result.updated} atualizado${result.updated !== 1 ? "s" : ""}.`);
      utils.equivalences.list.invalidate();
      utils.equivalences.stats.invalidate();
      setApplied(true);
    },
    onError: (e) => toast.error("Erro ao aplicar: " + e.message),
  });

  // Auto-trigger se veio da importação
  useEffect(() => {
    if (initialBatchId) {
      previewMutation.mutate({ batchId: initialBatchId });
    }
  }, [initialBatchId]);

  const handleAnalyze = () => {
    previewMutation.mutate({
      batchId: batchId ? Number(batchId) : undefined,
      categoryIdsA: crossMode === "cross" && categoryIdsA.length > 0 ? categoryIdsA : undefined,
      categoryIdsB: crossMode === "cross" && categoryIdsB.length > 0 ? categoryIdsB : undefined,
    });
  };

  const handleApply = () => {
    if (!previewData) return;
    const toApply = previewData
      .filter((g) => selectedKeys.has(g.activeIngredient))
      .map((g) => ({
        activeIngredient: g.activeIngredient,
        productIds: g.members.map((m) => m.id),
        existingGroupId: g.existingGroupId,
      }));
    if (toApply.length === 0) { toast.error("Nenhum grupo selecionado."); return; }
    applyMutation.mutate({ groups: toApply });
  };

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Aplica preset de cruzamento por palavra-chave nos nomes de categoria
  const applyPreset = (keywordsA: string[], keywordsB: string[]) => {
    if (!categories) return;
    const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const matchCat = (cat: { name: string }, kws: string[]) =>
      kws.length === 0 || kws.some((kw) => normalize(cat.name).includes(normalize(kw)));
    const idsA = categories.filter((c) => matchCat(c, keywordsA)).map((c) => c.id);
    const idsB = keywordsB.length > 0
      ? categories.filter((c) => matchCat(c, keywordsB)).map((c) => c.id)
      : [];
    setCategoryIdsA(idsA);
    setCategoryIdsB(idsB);
    setCrossMode("cross");
  };

  const toggleCatA = (id: number) =>
    setCategoryIdsA((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const toggleCatB = (id: number) =>
    setCategoryIdsB((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const filtered = previewData?.filter((g) => {
    if (filterCross && !g.crossCategory) return false;
    if (filterNew && g.existingGroupId !== null) return false;
    return true;
  }) ?? [];

  const crossCount = previewData?.filter((g) => g.crossCategory).length ?? 0;
  const newCount = previewData?.filter((g) => g.existingGroupId === null).length ?? 0;
  const existingCount = previewData?.filter((g) => g.existingGroupId !== null).length ?? 0;
  const selectedCount = filtered.filter((g) => selectedKeys.has(g.activeIngredient)).length;

  return (
    <div>
      {/* Info box */}
      <div className="border border-blue-100 bg-blue-50 p-4 mb-6 text-xs text-blue-800 leading-relaxed">
        <div className="font-bold mb-1">Como funciona a Geração Automática</div>
        O sistema agrupa todos os produtos ativos pelo campo <strong>Princípio Ativo</strong> (composição), normalizando acentos e capitalização. Use o modo <strong>Cruzamento de Categorias</strong> para focar apenas em grupos que conectam categorias específicas (ex: Medicamentos Veterinários × Medicamentos Humanos). Grupos que cruzam categorias são marcados com <span className="bg-purple-100 text-purple-700 px-1 font-bold">Vet/Humano</span>.
      </div>

      {/* Trigger */}
      <div className="border border-gray-200 p-5 mb-6 bg-white">
        {/* Modo de análise */}
        <div className="mb-5">
          <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-2">Modo de Análise</div>
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setCrossMode("all")}
              className={`px-4 py-2 text-xs font-bold border transition-colors ${crossMode === "all" ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 text-gray-600 hover:border-gray-900"}`}
            >
              Todos os Produtos
            </button>
            <button
              onClick={() => setCrossMode("cross")}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold border transition-colors ${crossMode === "cross" ? "bg-purple-700 text-white border-purple-700" : "border-gray-300 text-gray-600 hover:border-gray-900"}`}
            >
              <GitMerge size={12} />
              Cruzamento de Categorias
            </button>
          </div>

          {/* Atalhos de preset */}
          {crossMode === "cross" && (
            <div className="mb-4">
              <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-2">Atalhos Rápidos</div>
              <div className="flex flex-wrap gap-2">
                {CROSS_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => applyPreset(preset.keywords.a, preset.keywords.b)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold border border-purple-200 bg-purple-50 text-purple-800 hover:bg-purple-100 transition-colors"
                  >
                    <GitMerge size={10} />
                    {preset.label}
                  </button>
                ))}
                <button
                  onClick={() => { setCategoryIdsA([]); setCategoryIdsB([]); }}
                  className="px-3 py-1.5 text-[10px] font-bold border border-gray-200 text-gray-500 hover:border-gray-900 transition-colors"
                >
                  Limpar
                </button>
              </div>
            </div>
          )}

          {/* Seletores de categorias A e B */}
          {crossMode === "cross" && categories && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Categoria A */}
              <div className="border border-gray-200 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400">
                    Grupo A
                    {categoryIdsA.length > 0 && (
                      <span className="ml-2 text-green-700 bg-green-100 px-1.5 py-0.5">{categoryIdsA.length} selecionada{categoryIdsA.length !== 1 ? "s" : ""}</span>
                    )}
                  </div>
                  {categoryIdsA.length > 0 && (
                    <button onClick={() => setCategoryIdsA([])} className="text-[10px] text-gray-400 hover:text-gray-900"><X size={10} /></button>
                  )}
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {categories.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-1 py-0.5">
                      <input
                        type="checkbox"
                        checked={categoryIdsA.includes(c.id)}
                        onChange={() => toggleCatA(c.id)}
                        className="w-3 h-3"
                      />
                      <span className="text-xs text-gray-700">{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Categoria B */}
              <div className="border border-gray-200 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400">
                    Grupo B
                    {categoryIdsB.length > 0 && (
                      <span className="ml-2 text-blue-700 bg-blue-100 px-1.5 py-0.5">{categoryIdsB.length} selecionada{categoryIdsB.length !== 1 ? "s" : ""}</span>
                    )}
                  </div>
                  {categoryIdsB.length > 0 && (
                    <button onClick={() => setCategoryIdsB([])} className="text-[10px] text-gray-400 hover:text-gray-900"><X size={10} /></button>
                  )}
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {categories.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-1 py-0.5">
                      <input
                        type="checkbox"
                        checked={categoryIdsB.includes(c.id)}
                        onChange={() => toggleCatB(c.id)}
                        className="w-3 h-3"
                      />
                      <span className="text-xs text-gray-700">{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Aviso de cruzamento configurado */}
          {crossMode === "cross" && categoryIdsA.length > 0 && categoryIdsB.length > 0 && (
            <div className="mt-3 p-2.5 bg-purple-50 border border-purple-200 text-xs text-purple-800 flex items-center gap-2">
              <GitMerge size={12} className="flex-shrink-0" />
              <span>
                Buscando produtos com mesmo princípio ativo que estejam em
                <strong> {categoryIdsA.length} categoria{categoryIdsA.length !== 1 ? "s" : ""} (Grupo A)</strong> e
                <strong> {categoryIdsB.length} categoria{categoryIdsB.length !== 1 ? "s" : ""} (Grupo B)</strong>.
              </span>
            </div>
          )}
          {crossMode === "cross" && categoryIdsA.length > 0 && categoryIdsB.length === 0 && (
            <div className="mt-3 p-2.5 bg-yellow-50 border border-yellow-200 text-xs text-yellow-800 flex items-center gap-2">
              <AlertCircle size={12} className="flex-shrink-0" />
              <span>Selecione ao menos uma categoria no Grupo B para ativar o cruzamento. Ou deixe o Grupo B vazio para filtrar apenas produtos das categorias do Grupo A.</span>
            </div>
          )}
        </div>

        {/* Lote de importação */}
        <div className="flex items-end gap-4 pt-4 border-t border-gray-100">
          <div className="flex-1">
            <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1.5">
              Filtrar por Lote de Importação (opcional)
            </label>
            <input
              type="number"
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              placeholder="ID do lote (deixe vazio para analisar todos os produtos)"
              className="w-full border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-gray-900 transition-colors"
            />
            <div className="text-[10px] text-gray-400 mt-1">
              O ID do lote é exibido após a importação. Se vazio, analisa todos os produtos ativos.
            </div>
          </div>
          <button
            onClick={handleAnalyze}
            disabled={previewMutation.isPending}
            className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {previewMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
            {previewMutation.isPending ? "Analisando..." : "Analisar Produtos"}
          </button>
        </div>
      </div>

      {/* Results */}
      {previewData && (
        <div>
          {/* Summary */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex items-center gap-1.5 bg-gray-100 border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700">
              <Layers size={12} />{previewData.length} grupo{previewData.length !== 1 ? "s" : ""} identificado{previewData.length !== 1 ? "s" : ""}
            </div>
            {newCount > 0 && (
              <div className="flex items-center gap-1.5 bg-green-100 border border-green-200 px-3 py-1.5 text-xs font-bold text-green-700">
                <Plus size={12} />{newCount} novo{newCount !== 1 ? "s" : ""}
              </div>
            )}
            {existingCount > 0 && (
              <div className="flex items-center gap-1.5 bg-yellow-100 border border-yellow-200 px-3 py-1.5 text-xs font-bold text-yellow-700">
                <CheckCircle2 size={12} />{existingCount} já existente{existingCount !== 1 ? "s" : ""}
              </div>
            )}
            {crossCount > 0 && (
              <div className="flex items-center gap-1.5 bg-purple-100 border border-purple-200 px-3 py-1.5 text-xs font-bold text-purple-700">
                <GitMerge size={12} />{crossCount} cruzam vet/humano
              </div>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setFilterCross(!filterCross)}
                className={`text-[10px] font-bold px-2 py-1 border transition-colors ${filterCross ? "bg-purple-700 text-white border-purple-700" : "border-gray-300 text-gray-600 hover:border-gray-900"}`}
              >
                Só Vet/Humano
              </button>
              <button
                onClick={() => setFilterNew(!filterNew)}
                className={`text-[10px] font-bold px-2 py-1 border transition-colors ${filterNew ? "bg-green-700 text-white border-green-700" : "border-gray-300 text-gray-600 hover:border-gray-900"}`}
              >
                Só Novos
              </button>
            </div>
          </div>

          {/* Select all */}
          <div className="flex items-center gap-3 mb-3 px-1">
            <input
              type="checkbox"
              checked={selectedCount === filtered.length && filtered.length > 0}
              onChange={(e) => {
                if (e.target.checked) setSelectedKeys(new Set(filtered.map((g) => g.activeIngredient)));
                else setSelectedKeys(new Set());
              }}
              className="w-3.5 h-3.5"
            />
            <span className="text-xs text-gray-600">
              {selectedCount} de {filtered.length} selecionado{selectedCount !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Groups list */}
          {filtered.length === 0 ? (
            <div className="border border-dashed border-gray-200 py-12 text-center">
              <AlertCircle size={24} className="text-gray-300 mx-auto mb-2" />
              <div className="text-sm text-gray-500">Nenhum grupo corresponde aos filtros aplicados.</div>
            </div>
          ) : (
            <div className="space-y-1 mb-6">
              {filtered.map((g) => {
                const isSelected = selectedKeys.has(g.activeIngredient);
                const isExpanded = expandedKeys.has(g.activeIngredient);
                const uniqueCategories = Array.from(new Set(g.members.map((m) => m.categoryName).filter(Boolean)));
                const uniqueSuppliers = Array.from(new Set(g.members.map((m) => m.supplierName).filter(Boolean)));

                return (
                  <div key={g.activeIngredient} className={`border ${isSelected ? "border-gray-400" : "border-gray-200"} ${g.crossCategory ? "border-l-4 border-l-purple-500" : ""}`}>
                    {/* Header row */}
                    <div className={`flex items-center gap-3 px-4 py-3 ${isSelected ? "bg-gray-50" : "bg-white"}`}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleKey(g.activeIngredient)} className="w-3.5 h-3.5 flex-shrink-0" />
                      <button onClick={() => toggleExpand(g.activeIngredient)} className="flex items-center gap-2 flex-1 text-left min-w-0">
                        {isExpanded ? <ChevronDown size={13} className="text-gray-400 flex-shrink-0" /> : <ChevronRight size={13} className="text-gray-400 flex-shrink-0" />}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-gray-900">{g.activeIngredient}</span>
                            {g.crossCategory && (
                              <span className="text-[9px] font-bold tracking-widest uppercase bg-purple-100 text-purple-700 px-1.5 py-0.5">Vet/Humano</span>
                            )}
                            {g.existingGroupId ? (
                              <span className="text-[9px] font-bold tracking-widest uppercase bg-yellow-100 text-yellow-700 px-1.5 py-0.5">Atualizar</span>
                            ) : (
                              <span className="text-[9px] font-bold tracking-widest uppercase bg-green-100 text-green-700 px-1.5 py-0.5">Novo</span>
                            )}
                          </div>
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            {g.members.length} produto{g.members.length !== 1 ? "s" : ""} · {uniqueSuppliers.length} fornecedor{uniqueSuppliers.length !== 1 ? "es" : ""} · {uniqueCategories.join(", ")}
                          </div>
                        </div>
                      </button>
                      <div className="text-xs font-mono font-bold text-gray-700 flex-shrink-0">
                        {g.members.length}
                      </div>
                    </div>

                    {/* Expanded: members table */}
                    {isExpanded && (
                      <div className="border-t border-gray-100 overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-1.5 text-left font-bold uppercase tracking-widest text-[9px] text-gray-400">Produto</th>
                              <th className="px-3 py-1.5 text-left font-bold uppercase tracking-widest text-[9px] text-gray-400">Concentração</th>
                              <th className="px-3 py-1.5 text-left font-bold uppercase tracking-widest text-[9px] text-gray-400">Categoria</th>
                              <th className="px-3 py-1.5 text-left font-bold uppercase tracking-widest text-[9px] text-gray-400">Fornecedor</th>
                              <th className="px-3 py-1.5 text-right font-bold uppercase tracking-widest text-[9px] text-gray-400">Preço</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.members.map((m) => {
                              const prices = g.members.filter((x) => x.price).map((x) => parseFloat(x.price!));
                              const minP = prices.length > 0 ? Math.min(...prices) : null;
                              const isBest = m.price && minP !== null && parseFloat(m.price) === minP;
                              return (
                                <tr key={m.id} className="border-t border-gray-100 hover:bg-gray-50">
                                  <td className="px-3 py-2">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-semibold text-gray-900">{m.name}</span>
                                      {isBest && <span className="text-[8px] font-bold bg-blue-800 text-white px-1">Menor</span>}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-gray-500">{m.concentration ?? "—"}</td>
                                  <td className="px-3 py-2">
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 ${m.categoryName?.toLowerCase().includes("humano") || m.categoryName?.toLowerCase().includes("human") ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                                      {m.categoryName ?? "—"}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-gray-600">{m.supplierName ?? "—"}</td>
                                  <td className="px-3 py-2 text-right font-mono">
                                    {m.price ? (
                                      <span className={isBest ? "text-blue-800 font-bold" : "text-gray-900"}>
                                        R$ {parseFloat(m.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                      </span>
                                    ) : <span className="text-gray-400">—</span>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Apply button */}
          {!applied && selectedCount > 0 && (
            <div className="p-4 border border-gray-200 bg-gray-50 flex items-center justify-between sticky bottom-4">
              <div className="text-sm text-gray-700">
                Criar/atualizar <strong>{selectedCount} grupo{selectedCount !== 1 ? "s" : ""}</strong> de equivalência
              </div>
              <button
                onClick={handleApply}
                disabled={applyMutation.isPending}
                className="flex items-center gap-2 px-6 py-2 bg-gray-900 text-white text-sm font-bold hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {applyMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                {applyMutation.isPending ? "Aplicando..." : `Aplicar ${selectedCount} Grupo${selectedCount !== 1 ? "s" : ""}`}
              </button>
            </div>
          )}

          {applied && (
            <div className="p-4 border border-green-200 bg-green-50 flex items-center gap-3">
              <CheckCircle2 size={16} className="text-green-600" />
              <div className="text-sm font-semibold text-green-800">Grupos de equivalência criados/atualizados com sucesso!</div>
              <button onClick={() => { setPreviewData(null); setApplied(false); }} className="ml-auto text-xs text-green-700 underline hover:no-underline">
                Analisar novamente
              </button>
            </div>
          )}
        </div>
      )}

      {!previewData && !previewMutation.isPending && (
        <div className="border-2 border-dashed border-gray-200 p-12 text-center">
          <Wand2 size={32} className="text-gray-200 mx-auto mb-3" />
          <div className="text-sm font-semibold text-gray-500 mb-1">Geração Automática de Equivalências</div>
          <div className="text-xs text-gray-400 max-w-md mx-auto leading-relaxed">
            Clique em "Analisar Produtos" para o sistema identificar automaticamente grupos de equivalência com base no princípio ativo. Produtos veterinários e humanos com o mesmo princípio ativo serão cruzados.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Equivalencias() {
  const [location] = useLocation();
  const [activeTab, setActiveTab] = useState<"grupos" | "auto">("grupos");

  // Detecta se veio da importação com autoPreview
  const searchParams = new URLSearchParams(location.split("?")[1] ?? "");
  const autoPreview = searchParams.get("autoPreview") === "1";
  const batchId = searchParams.get("batchId") ? Number(searchParams.get("batchId")) : undefined;

  useEffect(() => {
    if (autoPreview) setActiveTab("auto");
  }, [autoPreview]);

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <div className="w-6 h-1 bg-blue-800 mb-3" />
        <h1 className="text-3xl font-black tracking-tight text-gray-900">Equivalências</h1>
        <p className="text-sm text-gray-500 mt-1">
          Vincule produtos de diferentes fornecedores com o mesmo princípio ativo. Cruze medicamentos veterinários e humanos automaticamente.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab("grupos")}
          className={`px-5 py-2.5 text-sm font-bold border-b-2 transition-colors ${activeTab === "grupos" ? "border-gray-900 text-gray-900" : "border-transparent text-gray-400 hover:text-gray-700"}`}
        >
          <GitMerge size={13} className="inline mr-1.5 -mt-0.5" />
          Grupos Existentes
        </button>
        <button
          onClick={() => setActiveTab("auto")}
          className={`px-5 py-2.5 text-sm font-bold border-b-2 transition-colors ${activeTab === "auto" ? "border-gray-900 text-gray-900" : "border-transparent text-gray-400 hover:text-gray-700"}`}
        >
          <Wand2 size={13} className="inline mr-1.5 -mt-0.5" />
          Gerar Automaticamente
          {autoPreview && <span className="ml-2 text-[9px] font-bold bg-blue-600 text-white px-1.5 py-0.5">NOVO</span>}
        </button>
      </div>

      {activeTab === "grupos" ? <TabGrupos onSwitchToAuto={() => setActiveTab("auto")} /> : <TabAutoGerar initialBatchId={batchId} />}
    </div>
  );
}
