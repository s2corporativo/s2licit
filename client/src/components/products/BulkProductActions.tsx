import { trpc } from "@/lib/trpc";
import {
  Archive,
  CheckCircle2,
  Edit3,
  GitMerge,
  Loader2,
  RotateCcw,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

type ActiveState = "yes" | "no";
type FieldMode = "keep" | "set" | "clear";

type Props = {
  selected: Set<number>;
  setSelected: Dispatch<SetStateAction<Set<number>>>;
  total: number;
  filters: {
    search?: string;
    categoryId?: number;
    incomplete?: boolean;
    isActive: ActiveState;
  };
  activeState: ActiveState;
  onActiveStateChange: (state: ActiveState) => void;
  categories: any[];
  suppliers: any[];
  onRefresh: () => Promise<void> | void;
  disabled?: boolean;
};

const editableFields = [
  ["manufacturer", "Fabricante", true],
  ["activeIngredient", "Princípio ativo / composição", true],
  ["concentration", "Concentração / dimensão", true],
  ["presentation", "Apresentação", true],
  ["unit", "Unidade", true],
  ["price", "Preço de aquisição", true],
  ["priceUnit", "Unidade do preço", true],
  ["informacaoTecnica", "Informação técnica", true],
  ["freightValue", "Frete por unidade", true],
  ["taxValue", "Impostos / ST", true],
] as const;

function ModalShell({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm">
    <div className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
        <div><h2 className="m-0 text-lg font-black text-slate-950">{title}</h2>{subtitle && <p className="mb-0 mt-1 text-xs text-slate-500">{subtitle}</p>}</div>
        <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500"><X size={16}/></button>
      </div>
      {children}
    </div>
  </div>;
}

function BulkEditModal({ ids, categories, suppliers, onClose, onDone }: { ids: number[]; categories: any[]; suppliers: any[]; onClose: () => void; onDone: () => Promise<void> | void }) {
  const [modes, setModes] = useState<Record<string, FieldMode>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const update = trpc.products.bulkUpdate.useMutation({
    onSuccess: async (count) => {
      toast.success(`${count} produto(s) atualizado(s) em lote.`);
      await onDone();
      onClose();
    },
    onError: (error) => toast.error("Falha na edição em lote.", { description: error.message }),
  });

  const setMode = (field: string, mode: FieldMode) => setModes((prev) => ({ ...prev, [field]: mode }));
  const setValue = (field: string, value: string) => setValues((prev) => ({ ...prev, [field]: value }));

  const apply = () => {
    const payload: any = { ids };
    const enabledFields: string[] = [];
    const clearFields: string[] = [];

    for (const [field] of editableFields) {
      const mode = modes[field] ?? "keep";
      if (mode === "set") {
        const value = (values[field] ?? "").trim();
        if (!value) return toast.error(`Informe um valor para ${field}.`);
        payload[field] = value;
        enabledFields.push(field);
      } else if (mode === "clear") {
        clearFields.push(field);
      }
    }

    for (const field of ["categoryId", "supplierId", "priceAdjustPercent"] as const) {
      if ((modes[field] ?? "keep") !== "set") continue;
      const raw = (values[field] ?? "").trim();
      if (!raw) return toast.error(`Informe um valor para ${field}.`);
      payload[field] = field === "priceAdjustPercent" ? Number(raw) : Number(raw);
      if (!Number.isFinite(payload[field])) return toast.error(`Valor inválido para ${field}.`);
      enabledFields.push(field);
    }

    if (enabledFields.length === 0 && clearFields.length === 0) {
      return toast.error("Marque ao menos um campo como alterar ou limpar.");
    }
    payload.enabledFields = enabledFields;
    payload.clearFields = clearFields;
    update.mutate(payload);
  };

  const modeSelect = (field: string, clearable = true) => <select value={modes[field] ?? "keep"} onChange={(e) => setMode(field, e.target.value as FieldMode)} className="rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold">
    <option value="keep">Não alterar</option><option value="set">Alterar</option>{clearable && <option value="clear">Limpar</option>}
  </select>;

  return <ModalShell title="Editar produtos em lote" subtitle={`${ids.length} produto(s) selecionado(s). Nada muda sem marcação explícita.`} onClose={onClose}>
    <div className="space-y-5 p-5">
      <div className="grid gap-3 md:grid-cols-2">
        {editableFields.map(([field, label, clearable]) => <div key={field} className="rounded-2xl border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between gap-2"><label className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</label>{modeSelect(field, clearable)}</div>
          <input disabled={(modes[field] ?? "keep") !== "set"} value={values[field] ?? ""} onChange={(e) => setValue(field, e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-300" placeholder={(modes[field] ?? "keep") === "clear" ? "Será limpo" : "Novo valor"}/>
        </div>)}
        <div className="rounded-2xl border border-slate-200 p-3"><div className="mb-2 flex items-center justify-between"><label className="text-[10px] font-black uppercase text-slate-500">Categoria</label>{modeSelect("categoryId", false)}</div><select disabled={(modes.categoryId ?? "keep") !== "set"} value={values.categoryId ?? ""} onChange={(e) => setValue("categoryId", e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"><option value="">Selecione</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="rounded-2xl border border-slate-200 p-3"><div className="mb-2 flex items-center justify-between"><label className="text-[10px] font-black uppercase text-slate-500">Fornecedor</label>{modeSelect("supplierId", false)}</div><select disabled={(modes.supplierId ?? "keep") !== "set"} value={values.supplierId ?? ""} onChange={(e) => setValue("supplierId", e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"><option value="">Selecione</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 md:col-span-2"><div className="mb-2 flex items-center justify-between"><label className="text-[10px] font-black uppercase text-blue-700">Ajuste percentual de preço</label>{modeSelect("priceAdjustPercent", false)}</div><input disabled={(modes.priceAdjustPercent ?? "keep") !== "set"} type="number" step="0.01" value={values.priceAdjustPercent ?? ""} onChange={(e) => setValue("priceAdjustPercent", e.target.value)} placeholder="Ex.: 5 para aumentar 5%; -3 para reduzir 3%" className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm disabled:bg-blue-50"/></div>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4"><button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">Cancelar</button><button disabled={update.isPending} onClick={apply} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-50">{update.isPending && <Loader2 size={14} className="animate-spin"/>}Aplicar alterações</button></div>
    </div>
  </ModalShell>;
}

function DuplicateModal({ ids, onClose, onDone }: { ids: number[]; onClose: () => void; onDone: () => Promise<void> | void }) {
  const plan = trpc.productBulk.duplicatePlan.useQuery({ selectedIds: ids, minSimilarity: 0.78 });
  const merge = trpc.productBulk.mergeDuplicateGroups.useMutation({
    onSuccess: async (result) => {
      toast.success(`${result.merged} produto(s) duplicado(s) mesclado(s).`);
      await onDone();
      onClose();
    },
    onError: (error) => toast.error("Não foi possível mesclar os grupos.", { description: error.message }),
  });
  const [masters, setMasters] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!plan.data) return;
    setMasters(Object.fromEntries(plan.data.actionable.map((group) => [group.groupId, group.recommendedMasterId])));
  }, [plan.data]);

  const apply = () => {
    const groups = (plan.data?.actionable ?? []).map((group) => {
      const masterId = masters[group.groupId] ?? group.recommendedMasterId;
      return { masterId, duplicateIds: group.products.filter((p) => p.id !== masterId).map((p) => p.id) };
    }).filter((group) => group.duplicateIds.length > 0);
    if (!groups.length) return toast.error("Nenhum grupo completo de duplicidades foi selecionado.");
    if (!window.confirm(`Mesclar ${groups.length} grupo(s)? Os duplicados serão arquivados e as referências redirecionadas para o mestre escolhido.`)) return;
    merge.mutate({ groups });
  };

  return <ModalShell title="Central de duplicidades" subtitle="Escolha o produto mestre de cada grupo. Grupos incompletos são apenas avisados e nunca mesclados." onClose={onClose}>
    <div className="space-y-4 p-5">
      {plan.isLoading && <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-700"/></div>}
      {plan.error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{plan.error.message}</div>}
      {(plan.data?.skippedPartial.length ?? 0) > 0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><strong className="text-sm text-amber-900">{plan.data!.skippedPartial.length} grupo(s) incompleto(s) ignorado(s)</strong><p className="mb-0 mt-1 text-xs text-amber-700">Há produtos semelhantes fora da seleção. Eles não serão mesclados até que todo o grupo seja selecionado.</p>{plan.data!.skippedPartial.slice(0, 8).map((group) => <div key={group.groupId} className="mt-2 text-[11px] text-amber-800">{group.products.filter((p) => !p.selected).map((p) => p.name).join(" · ")}</div>)}</div>}
      {plan.data?.actionable.map((group) => <div key={group.groupId} className="rounded-2xl border border-slate-200 p-4"><div className="mb-3 flex items-center justify-between"><div><strong className="text-sm text-slate-950">Grupo com {group.products.length} produtos</strong><div className="text-[10px] text-slate-500">Similaridade média {Math.round(group.similarity * 100)}%</div></div><CheckCircle2 size={18} className="text-emerald-600"/></div><div className="space-y-2">{group.products.map((product) => <label key={product.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${masters[group.groupId] === product.id ? "border-blue-400 bg-blue-50" : "border-slate-200"}`}><input type="radio" name={group.groupId} checked={masters[group.groupId] === product.id} onChange={() => setMasters((prev) => ({ ...prev, [group.groupId]: product.id }))}/><span className="min-w-0 flex-1"><strong className="block text-xs text-slate-900">{product.name}</strong><span className="mt-1 block text-[10px] text-slate-500">{product.manufacturer ?? "Sem fabricante"} · {product.concentration ?? "Sem concentração"} · {product.presentation ?? "Sem apresentação"}</span></span>{group.recommendedMasterId === product.id && <span className="rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-black text-emerald-700">MESTRE SUGERIDO</span>}</label>)}</div></div>)}
      {plan.data && plan.data.actionable.length === 0 && <div className="rounded-2xl bg-emerald-50 p-5 text-center text-sm font-bold text-emerald-800">Nenhum grupo completo de duplicidades na seleção atual.</div>}
      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4"><button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">Cancelar</button><button disabled={merge.isPending || !(plan.data?.actionable.length)} onClick={apply} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-40">{merge.isPending ? <Loader2 size={14} className="animate-spin"/> : <GitMerge size={14}/>}Confirmar merges</button></div>
    </div>
  </ModalShell>;
}

export default function BulkProductActions({ selected, setSelected, total, filters, activeState, onActiveStateChange, categories, suppliers, onRefresh, disabled }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  const ids = useMemo(() => Array.from(selected), [selected]);
  const globalIds = trpc.productBulk.filteredIds.useQuery(filters, { enabled: false });
  const archive = trpc.products.bulkArchive.useMutation({
    onSuccess: async (result) => { toast.success(`${result.archived} produto(s) arquivado(s).`); setSelected(new Set()); await onRefresh(); },
    onError: (error) => toast.error("Falha ao arquivar.", { description: error.message }),
  });
  const reactivate = trpc.products.bulkReactivate.useMutation({
    onSuccess: async (result) => { toast.success(`${result.reactivated} produto(s) reativado(s).`); setSelected(new Set()); await onRefresh(); },
    onError: (error) => toast.error("Falha ao reativar.", { description: error.message }),
  });

  const selectAllFiltered = async () => {
    const result = await globalIds.refetch();
    if (!result.data) return toast.error("Não foi possível carregar a seleção filtrada.");
    setSelected(new Set(result.data.ids));
    toast.success(`${result.data.ids.length} resultado(s) filtrado(s) selecionado(s).`);
  };

  const archiveOrRestore = () => {
    if (!ids.length) return;
    if (activeState === "yes") {
      if (!window.confirm(`Arquivar ${ids.length} produto(s)? O histórico será preservado e a operação pode ser revertida.`)) return;
      archive.mutate({ ids });
    } else {
      reactivate.mutate({ ids });
    }
  };

  const done = async () => { setSelected(new Set()); await onRefresh(); };
  const busy = disabled || globalIds.isFetching || archive.isPending || reactivate.isPending;

  return <>
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
      <div className="mr-auto flex flex-wrap items-center gap-2"><SlidersHorizontal size={14} className="text-slate-500"/><select value={activeState} onChange={(e) => onActiveStateChange(e.target.value as ActiveState)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black"><option value="yes">Produtos ativos</option><option value="no">Arquivados</option></select><span className="text-[11px] text-slate-500">{selected.size} de {total} selecionado(s)</span></div>
      {total > 0 && selected.size < total && <button disabled={busy} onClick={() => void selectAllFiltered()} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">{globalIds.isFetching ? <Loader2 size={13} className="mr-1 inline animate-spin"/> : null}Selecionar todos os {total} filtrados</button>}
      {selected.size > 0 && <><button disabled={busy} onClick={() => setEditOpen(true)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black"><Edit3 size={13} className="mr-1 inline"/>Editar em lote</button>{activeState === "yes" && <button disabled={busy} onClick={() => setDuplicatesOpen(true)} className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-700"><GitMerge size={13} className="mr-1 inline"/>Resolver duplicados</button>}<button disabled={busy} onClick={archiveOrRestore} className={`rounded-xl px-3 py-2 text-xs font-black ${activeState === "yes" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{activeState === "yes" ? <Archive size={13} className="mr-1 inline"/> : <RotateCcw size={13} className="mr-1 inline"/>}{activeState === "yes" ? "Arquivar" : "Reativar"}</button><button onClick={() => setSelected(new Set())} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">Limpar seleção</button></>}
    </div>
    {editOpen && <BulkEditModal ids={ids} categories={categories} suppliers={suppliers} onClose={() => setEditOpen(false)} onDone={done}/>} 
    {duplicatesOpen && <DuplicateModal ids={ids} onClose={() => setDuplicatesOpen(false)} onDone={done}/>} 
  </>;
}
