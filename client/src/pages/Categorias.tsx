import { trpc } from "@/lib/trpc";
import {
  ChevronRight,
  Edit2,
  FolderOpen,
  Loader2,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Category = {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  color?: string | null;
  sortOrder?: number | null;
  parentId?: number | null;
};

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899",
  "#6b7280", "#0ea5e9",
];

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function Categorias() {
  const utils = trpc.useUtils();
  const { data: categories = [], isLoading } = trpc.categories.list.useQuery();
  const createMutation = trpc.categories.create.useMutation({
    onSuccess: () => { utils.categories.list.invalidate(); toast.success("Categoria criada!"); setShowForm(false); resetForm(); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const updateMutation = trpc.categories.update.useMutation({
    onSuccess: () => { utils.categories.list.invalidate(); toast.success("Categoria atualizada!"); setEditId(null); resetForm(); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const deleteMutation = trpc.categories.delete.useMutation({
    onSuccess: () => { utils.categories.list.invalidate(); toast.success("Categoria excluída!"); },
    onError: (e) => toast.error("Erro ao excluir: " + e.message),
  });

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[5]);
  const [parentId, setParentId] = useState<number | null>(null);
  const [sortOrder, setSortOrder] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  function resetForm() {
    setName(""); setDescription(""); setColor(PRESET_COLORS[5]); setParentId(null); setSortOrder(0);
  }

  function startEdit(cat: Category) {
    setEditId(cat.id);
    setName(cat.name);
    setDescription(cat.description ?? "");
    setColor(cat.color ?? PRESET_COLORS[5]);
    setParentId(cat.parentId ?? null);
    setSortOrder(cat.sortOrder ?? 0);
    setShowForm(false);
  }

  function handleSubmit() {
    if (!name.trim()) { toast.error("Nome é obrigatório"); return; }
    const payload = {
      name: name.trim(),
      slug: slugify(name.trim()),
      description: description || undefined,
      color: color || undefined,
      parentId: parentId ?? undefined,
      sortOrder: sortOrder,
    };
    if (editId !== null) {
      updateMutation.mutate({ id: editId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  // Group: top-level and sub-categories
  const topLevel = (categories as Category[]).filter((c) => !c.parentId);
  const subOf = (parentId: number) => (categories as Category[]).filter((c) => c.parentId === parentId);

  const isBusy = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-900 flex items-center justify-center">
              <FolderOpen size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black text-gray-900">Categorias</h1>
              <p className="text-xs text-gray-500">Gerencie categorias e subcategorias de produtos</p>
            </div>
          </div>
          <button
            onClick={() => { setShowForm(true); setEditId(null); resetForm(); }}
            className="flex items-center gap-2 bg-blue-900 text-white px-4 py-2 text-sm font-bold hover:bg-blue-800 transition-colors"
          >
            <Plus size={14} /> Nova Categoria
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-4">

        {/* Form: create or edit */}
        {(showForm || editId !== null) && (
          <div className="bg-white border border-blue-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-black text-gray-900">
                {editId !== null ? "Editar Categoria" : "Nova Categoria"}
              </h2>
              <button onClick={() => { setShowForm(false); setEditId(null); resetForm(); }} className="text-gray-400 hover:text-gray-700">
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1 block">Nome *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Antiparasitários"
                  className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1 block">Categoria Pai (opcional)</label>
                <select
                  value={parentId ?? ""}
                  onChange={(e) => setParentId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white"
                >
                  <option value="">— Nenhuma (categoria raiz) —</option>
                  {topLevel.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1 block">Descrição</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descrição opcional"
                  className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1 block">Ordem de exibição</label>
                <input
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(Number(e.target.value))}
                  className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2 block">Cor</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${color === c ? "border-gray-900 scale-110" : "border-transparent"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-7 h-7 rounded cursor-pointer border border-gray-300"
                    title="Cor personalizada"
                  />
                  <span className="text-xs text-gray-400 ml-1">{color}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-100">
              <button
                onClick={handleSubmit}
                disabled={isBusy}
                className="flex items-center gap-2 bg-blue-900 text-white px-4 py-2 text-sm font-bold hover:bg-blue-800 disabled:opacity-50 transition-colors"
              >
                {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {editId !== null ? "Salvar Alterações" : "Criar Categoria"}
              </button>
              <button
                onClick={() => { setShowForm(false); setEditId(null); resetForm(); }}
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Category list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-blue-600" />
          </div>
        ) : topLevel.length === 0 ? (
          <div className="bg-white border border-gray-200 p-10 text-center">
            <FolderOpen size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-gray-500">Nenhuma categoria cadastrada</p>
            <p className="text-xs text-gray-400 mt-1">Clique em "Nova Categoria" para começar</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 divide-y divide-gray-100">
            {topLevel
              .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
              .map((cat) => {
                const subs = subOf(cat.id).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
                return (
                  <div key={cat.id}>
                    {/* Top-level row */}
                    <div className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 group">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: cat.color ?? "#6b7280" }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900">{cat.name}</p>
                        {cat.description && (
                          <p className="text-xs text-gray-500 truncate">{cat.description}</p>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-400 font-mono">{subs.length} sub</span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => startEdit(cat)}
                          className="p-1.5 text-gray-400 hover:text-blue-700 hover:bg-blue-50 rounded"
                          title="Editar"
                        >
                          <Edit2 size={13} />
                        </button>
                        {deleteConfirm === cat.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => { deleteMutation.mutate({ id: cat.id }); setDeleteConfirm(null); }}
                              className="px-2 py-1 text-[10px] font-bold bg-red-600 text-white hover:bg-red-700 rounded"
                            >
                              Confirmar
                            </button>
                            <button onClick={() => setDeleteConfirm(null)} className="px-2 py-1 text-[10px] text-gray-500 hover:text-gray-700">
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(cat.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                            title="Excluir"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Sub-categories */}
                    {subs.map((sub) => (
                      <div key={sub.id} className="flex items-center gap-3 px-5 py-2.5 pl-10 bg-gray-50/50 hover:bg-gray-100/60 group border-t border-gray-50">
                        <ChevronRight size={12} className="text-gray-300 shrink-0" />
                        <div
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: sub.color ?? cat.color ?? "#6b7280" }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-800">{sub.name}</p>
                          {sub.description && (
                            <p className="text-[10px] text-gray-400 truncate">{sub.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => startEdit(sub)}
                            className="p-1.5 text-gray-400 hover:text-blue-700 hover:bg-blue-50 rounded"
                            title="Editar"
                          >
                            <Edit2 size={12} />
                          </button>
                          {deleteConfirm === sub.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => { deleteMutation.mutate({ id: sub.id }); setDeleteConfirm(null); }}
                                className="px-2 py-1 text-[10px] font-bold bg-red-600 text-white hover:bg-red-700 rounded"
                              >
                                Confirmar
                              </button>
                              <button onClick={() => setDeleteConfirm(null)} className="px-2 py-1 text-[10px] text-gray-500 hover:text-gray-700">
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirm(sub.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                              title="Excluir"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
          </div>
        )}

        {/* Stats */}
        {!isLoading && (categories as Category[]).length > 0 && (
          <div className="text-xs text-gray-400 text-right">
            {topLevel.length} categoria{topLevel.length !== 1 ? "s" : ""} raiz ·{" "}
            {(categories as Category[]).length - topLevel.length} subcategoria{(categories as Category[]).length - topLevel.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>
    </div>
  );
}
