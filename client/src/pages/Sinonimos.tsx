import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useConfirm } from "@/hooks/useConfirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Plus, Pencil, Trash2, Upload, RefreshCw, CheckCircle, XCircle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ToggleLeft, ToggleRight, X as XIcon } from "lucide-react";

// ─── Sinônimos pré-cadastrados ────────────────────────────────────────────────
const PRESET_SYNONYMS: Array<{ term: string; canonical: string; category: string }> = [
  // Veterinária — antiparasitários
  { term: "ivermec", canonical: "ivermectina", category: "vet" },
  { term: "ivermectina 1%", canonical: "ivermectina", category: "vet" },
  { term: "ivomec", canonical: "ivermectina", category: "vet" },
  { term: "doramec", canonical: "doramectina", category: "vet" },
  { term: "dectomax", canonical: "doramectina", category: "vet" },
  { term: "albendazol", canonical: "albendazol", category: "vet" },
  { term: "albend", canonical: "albendazol", category: "vet" },
  { term: "ricobendazol", canonical: "ricobendazol", category: "vet" },
  { term: "closantel", canonical: "closantel", category: "vet" },
  { term: "levamisol", canonical: "levamisol", category: "vet" },
  { term: "levamis", canonical: "levamisol", category: "vet" },
  { term: "oxitetraciclina", canonical: "oxitetraciclina", category: "vet" },
  { term: "oxitet", canonical: "oxitetraciclina", category: "vet" },
  { term: "terramicina", canonical: "oxitetraciclina", category: "vet" },
  { term: "enrofloxacina", canonical: "enrofloxacina", category: "vet" },
  { term: "enroflox", canonical: "enrofloxacina", category: "vet" },
  { term: "baytril", canonical: "enrofloxacina", category: "vet" },
  { term: "florfenicol", canonical: "florfenicol", category: "vet" },
  { term: "nuflor", canonical: "florfenicol", category: "vet" },
  { term: "dexametasona", canonical: "dexametasona", category: "vet" },
  { term: "dexametaz", canonical: "dexametasona", category: "vet" },
  { term: "dexa", canonical: "dexametasona", category: "vet" },
  { term: "pentabiotico", canonical: "penicilina benzatina", category: "vet" },
  { term: "pen strep", canonical: "penicilina estreptomicina", category: "vet" },
  { term: "amoxicilina", canonical: "amoxicilina", category: "vet" },
  { term: "amox", canonical: "amoxicilina", category: "vet" },
  { term: "ampicilina", canonical: "ampicilina", category: "vet" },
  { term: "ampic", canonical: "ampicilina", category: "vet" },
  { term: "gentamicina", canonical: "gentamicina", category: "vet" },
  { term: "gentam", canonical: "gentamicina", category: "vet" },
  { term: "tilosina", canonical: "tilosina", category: "vet" },
  { term: "tylan", canonical: "tilosina", category: "vet" },
  { term: "lincomicina", canonical: "lincomicina", category: "vet" },
  { term: "linco", canonical: "lincomicina", category: "vet" },
  { term: "ceftiofur", canonical: "ceftiofur", category: "vet" },
  { term: "excenel", canonical: "ceftiofur", category: "vet" },
  { term: "firocoxibe", canonical: "firocoxibe", category: "vet" },
  { term: "previcox", canonical: "firocoxibe", category: "vet" },
  { term: "meloxicam", canonical: "meloxicam", category: "vet" },
  { term: "melox", canonical: "meloxicam", category: "vet" },
  { term: "flunixin", canonical: "flunixina meglumina", category: "vet" },
  { term: "banamine", canonical: "flunixina meglumina", category: "vet" },
  { term: "dipirona", canonical: "dipirona sodica", category: "vet" },
  { term: "metamizol", canonical: "dipirona sodica", category: "vet" },
  { term: "butafosfan", canonical: "butafosfan", category: "vet" },
  { term: "catosal", canonical: "butafosfan", category: "vet" },
  { term: "vitamina b12", canonical: "cianocobalamina", category: "vet" },
  { term: "cianocobalamina", canonical: "cianocobalamina", category: "vet" },
  { term: "complexo b", canonical: "complexo vitaminas b", category: "vet" },
  { term: "vitaminas b", canonical: "complexo vitaminas b", category: "vet" },
  { term: "ad3e", canonical: "vitamina a d3 e", category: "vet" },
  { term: "vitamina ad3e", canonical: "vitamina a d3 e", category: "vet" },
  { term: "vitamina e selênio", canonical: "vitamina e selenio", category: "vet" },
  { term: "vit e se", canonical: "vitamina e selenio", category: "vet" },
  { term: "propileno glicol", canonical: "propilenoglicol", category: "vet" },
  { term: "propileno", canonical: "propilenoglicol", category: "vet" },
  { term: "cálcio", canonical: "calcio", category: "vet" },
  { term: "gluconato calcio", canonical: "calcio", category: "vet" },
  { term: "borogluconate", canonical: "calcio", category: "vet" },
  { term: "progesterona", canonical: "progesterona", category: "vet" },
  { term: "gnrh", canonical: "gonadorelina", category: "vet" },
  { term: "gonadorelina", canonical: "gonadorelina", category: "vet" },
  { term: "cloprostenol", canonical: "cloprostenol", category: "vet" },
  { term: "sincrocio", canonical: "cloprostenol", category: "vet" },
  { term: "dinoprost", canonical: "dinoprost trometamina", category: "vet" },
  { term: "lutalyse", canonical: "dinoprost trometamina", category: "vet" },
  { term: "oxitocina", canonical: "oxitocina", category: "vet" },
  { term: "ocitocina", canonical: "oxitocina", category: "vet" },
  { term: "somatotropina", canonical: "somatotropina bovina", category: "vet" },
  { term: "bst", canonical: "somatotropina bovina", category: "vet" },
  { term: "rbst", canonical: "somatotropina bovina", category: "vet" },
  // Medicamentos humanos
  { term: "amox", canonical: "amoxicilina", category: "humano" },
  { term: "amoxil", canonical: "amoxicilina", category: "humano" },
  { term: "ampic", canonical: "ampicilina", category: "humano" },
  { term: "azitro", canonical: "azitromicina", category: "humano" },
  { term: "azitromicina", canonical: "azitromicina", category: "humano" },
  { term: "zitromax", canonical: "azitromicina", category: "humano" },
  { term: "claritro", canonical: "claritromicina", category: "humano" },
  { term: "claritromicina", canonical: "claritromicina", category: "humano" },
  { term: "cipro", canonical: "ciprofloxacino", category: "humano" },
  { term: "ciproflox", canonical: "ciprofloxacino", category: "humano" },
  { term: "ciprofloxacino", canonical: "ciprofloxacino", category: "humano" },
  { term: "metronidazol", canonical: "metronidazol", category: "humano" },
  { term: "flagyl", canonical: "metronidazol", category: "humano" },
  { term: "omeprazol", canonical: "omeprazol", category: "humano" },
  { term: "omepraz", canonical: "omeprazol", category: "humano" },
  { term: "pantoprazol", canonical: "pantoprazol", category: "humano" },
  { term: "pantop", canonical: "pantoprazol", category: "humano" },
  { term: "ibuprofeno", canonical: "ibuprofeno", category: "humano" },
  { term: "ibuprof", canonical: "ibuprofeno", category: "humano" },
  { term: "paracetamol", canonical: "paracetamol", category: "humano" },
  { term: "acetaminofeno", canonical: "paracetamol", category: "humano" },
  { term: "dipirona", canonical: "dipirona sodica", category: "humano" },
  { term: "novalgina", canonical: "dipirona sodica", category: "humano" },
  { term: "dexametasona", canonical: "dexametasona", category: "humano" },
  { term: "decadron", canonical: "dexametasona", category: "humano" },
  { term: "prednisona", canonical: "prednisona", category: "humano" },
  { term: "prednisolona", canonical: "prednisolona", category: "humano" },
  { term: "hidrocortisona", canonical: "hidrocortisona", category: "humano" },
  { term: "soro fisiologico", canonical: "cloreto sodio 0,9%", category: "humano" },
  { term: "sf 0,9%", canonical: "cloreto sodio 0,9%", category: "humano" },
  { term: "soro glicosado", canonical: "glicose 5%", category: "humano" },
  { term: "sg 5%", canonical: "glicose 5%", category: "humano" },
  { term: "ringer lactato", canonical: "ringer lactato", category: "humano" },
  { term: "rl", canonical: "ringer lactato", category: "humano" },
  { term: "metformina", canonical: "metformina", category: "humano" },
  { term: "glifage", canonical: "metformina", category: "humano" },
  { term: "insulina", canonical: "insulina", category: "humano" },
  { term: "losartana", canonical: "losartana potassica", category: "humano" },
  { term: "losartan", canonical: "losartana potassica", category: "humano" },
  { term: "enalapril", canonical: "enalapril", category: "humano" },
  { term: "captopril", canonical: "captopril", category: "humano" },
  { term: "atorvastatina", canonical: "atorvastatina", category: "humano" },
  { term: "sinvastatina", canonical: "sinvastatina", category: "humano" },
  { term: "amlodipino", canonical: "amlodipino", category: "humano" },
  { term: "nifedipino", canonical: "nifedipino", category: "humano" },
  { term: "propranolol", canonical: "propranolol", category: "humano" },
  { term: "atenolol", canonical: "atenolol", category: "humano" },
  { term: "furosemida", canonical: "furosemida", category: "humano" },
  { term: "espironolactona", canonical: "espironolactona", category: "humano" },
  { term: "clonazepam", canonical: "clonazepam", category: "humano" },
  { term: "rivotril", canonical: "clonazepam", category: "humano" },
  { term: "diazepam", canonical: "diazepam", category: "humano" },
  { term: "valium", canonical: "diazepam", category: "humano" },
  { term: "tramadol", canonical: "tramadol", category: "humano" },
  { term: "morfina", canonical: "morfina", category: "humano" },
  { term: "fentanil", canonical: "fentanila", category: "humano" },
  { term: "midazolam", canonical: "midazolam", category: "humano" },
  { term: "cetamina", canonical: "cetamina", category: "humano" },
  { term: "ketamina", canonical: "cetamina", category: "humano" },
  { term: "propofol", canonical: "propofol", category: "humano" },
  // Construção / Materiais
  { term: "cimento cp2", canonical: "cimento portland cp2", category: "construcao" },
  { term: "cimento cp3", canonical: "cimento portland cp3", category: "construcao" },
  { term: "cimento cp4", canonical: "cimento portland cp4", category: "construcao" },
  { term: "cimento cp5", canonical: "cimento portland cp5", category: "construcao" },
  { term: "cimento portland", canonical: "cimento portland", category: "construcao" },
  { term: "areia media", canonical: "areia media lavada", category: "construcao" },
  { term: "areia grossa", canonical: "areia grossa lavada", category: "construcao" },
  { term: "brita 1", canonical: "brita numero 1", category: "construcao" },
  { term: "brita 0", canonical: "brita numero 0", category: "construcao" },
  { term: "pvc 100mm", canonical: "tubo pvc 100mm", category: "construcao" },
  { term: "pvc 50mm", canonical: "tubo pvc 50mm", category: "construcao" },
  { term: "pvc 25mm", canonical: "tubo pvc 25mm", category: "construcao" },
  { term: "cabo pp", canonical: "cabo paralelo pp", category: "construcao" },
  { term: "fio 2,5mm", canonical: "fio eletrico 2,5mm", category: "construcao" },
  { term: "fio 4mm", canonical: "fio eletrico 4mm", category: "construcao" },
  { term: "fio 6mm", canonical: "fio eletrico 6mm", category: "construcao" },
  { term: "disjuntor", canonical: "disjuntor termomagnético", category: "construcao" },
  { term: "dps", canonical: "dispositivo protecao surto", category: "construcao" },
  { term: "dr", canonical: "disjuntor diferencial residual", category: "construcao" },
  // Laboratório / Hospitalar
  { term: "luva latex", canonical: "luva latex descartavel", category: "laboratorio" },
  { term: "luva nitrilo", canonical: "luva nitrilo descartavel", category: "laboratorio" },
  { term: "luva vinil", canonical: "luva vinil descartavel", category: "laboratorio" },
  { term: "mascara n95", canonical: "mascara pff2 n95", category: "laboratorio" },
  { term: "mascara cirurgica", canonical: "mascara cirurgica descartavel", category: "laboratorio" },
  { term: "seringa 1ml", canonical: "seringa descartavel 1ml", category: "laboratorio" },
  { term: "seringa 3ml", canonical: "seringa descartavel 3ml", category: "laboratorio" },
  { term: "seringa 5ml", canonical: "seringa descartavel 5ml", category: "laboratorio" },
  { term: "seringa 10ml", canonical: "seringa descartavel 10ml", category: "laboratorio" },
  { term: "seringa 20ml", canonical: "seringa descartavel 20ml", category: "laboratorio" },
  { term: "agulha 40x12", canonical: "agulha hipodermica 40x12", category: "laboratorio" },
  { term: "agulha 25x8", canonical: "agulha hipodermica 25x8", category: "laboratorio" },
  { term: "agulha 25x7", canonical: "agulha hipodermica 25x7", category: "laboratorio" },
  { term: "equipo macro", canonical: "equipo macrogota", category: "laboratorio" },
  { term: "equipo micro", canonical: "equipo microgota", category: "laboratorio" },
  { term: "cateter iv", canonical: "cateter intravenoso", category: "laboratorio" },
  { term: "jelco", canonical: "cateter intravenoso", category: "laboratorio" },
  { term: "scalp", canonical: "agulha scalp", category: "laboratorio" },
  { term: "abaixador lingua", canonical: "abaixador de lingua", category: "laboratorio" },
  { term: "esparadrapo", canonical: "fita adesiva cirurgica", category: "laboratorio" },
  { term: "micropore", canonical: "fita microporosa", category: "laboratorio" },
  { term: "atadura", canonical: "atadura crepe", category: "laboratorio" },
  { term: "gaze", canonical: "gaze esteril", category: "laboratorio" },
  { term: "algodao", canonical: "algodao hidrofilo", category: "laboratorio" },
  { term: "alcool 70%", canonical: "alcool etilico 70%", category: "laboratorio" },
  { term: "alcool 96%", canonical: "alcool etilico 96%", category: "laboratorio" },
  { term: "clorexidina", canonical: "clorexidina gluconato", category: "laboratorio" },
  { term: "pvpi", canonical: "povidona iodada", category: "laboratorio" },
  { term: "iodopovidona", canonical: "povidona iodada", category: "laboratorio" },
  { term: "agua oxigenada", canonical: "peroxido hidrogenio 10v", category: "laboratorio" },
  { term: "h2o2", canonical: "peroxido hidrogenio 10v", category: "laboratorio" },
  { term: "formol", canonical: "formaldeido 10%", category: "laboratorio" },
  { term: "formaldeido", canonical: "formaldeido 10%", category: "laboratorio" },
];

const CATEGORIES = [
  { value: "all", label: "Todas" },
  { value: "vet", label: "Veterinária" },
  { value: "humano", label: "Humano" },
  { value: "construcao", label: "Construção" },
  { value: "laboratorio", label: "Laboratório" },
  { value: "geral", label: "Geral" },
];

const CATEGORY_COLORS: Record<string, string> = {
  vet: "bg-green-100 text-green-800 border-green-200",
  humano: "bg-blue-100 text-blue-800 border-blue-200",
  construcao: "bg-orange-100 text-orange-800 border-orange-200",
  laboratorio: "bg-purple-100 text-purple-800 border-purple-200",
  geral: "bg-gray-100 text-gray-700 border-gray-200",
};

interface SynonymForm {
  term: string;
  canonical: string;
  category: string;
}

const PAGE_SIZE = 50;

export default function Sinonimos() {
  const { confirm: confirmAction, confirmDialog } = useConfirm();
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<{ id: number } & SynonymForm | null>(null);
  const [form, setForm] = useState<SynonymForm>({ term: "", canonical: "", category: "geral" });
  const [loadingPreset, setLoadingPreset] = useState(false);

  const { data: synonymsList = [], refetch } = trpc.synonyms.list.useQuery(
    {
      search: search || undefined,
      category: filterCategory !== "all" ? filterCategory : undefined,
      activeOnly: false,
    },
    { placeholderData: (prev) => prev }
  );
  const { data: stats } = trpc.synonyms.stats.useQuery();

  const createMutation = trpc.synonyms.create.useMutation({
    onSuccess: () => { toast.success("Sinônimo criado!"); refetch(); setShowModal(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.synonyms.update.useMutation({
    onSuccess: () => { toast.success("Sinônimo atualizado!"); refetch(); setShowModal(false); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.synonyms.delete.useMutation({
    onSuccess: () => { toast.success("Sinônimo removido!"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const bulkToggleMutation = trpc.synonyms.bulkToggle.useMutation({
    onSuccess: (count) => {
      toast.success(`${count} sinônimo${count !== 1 ? "s" : ""} atualizados!`);
      refetch();
      setSelectedIds(new Set());
    },
    onError: (e) => toast.error(e.message),
  });
  const bulkDeleteMutation = trpc.synonyms.bulkDelete.useMutation({
    onSuccess: (count) => {
      toast.success(`${count} sinônimo${count !== 1 ? "s" : ""} removidos!`);
      refetch();
      setSelectedIds(new Set());
    },
    onError: (e) => toast.error(e.message),
  });
  const bulkCreateMutation = trpc.synonyms.bulkCreate.useMutation({
    onSuccess: (count) => {
      toast.success(`${count} sinônimos pré-cadastrados importados!`);
      refetch();
      setLoadingPreset(false);
    },
    onError: (e) => { toast.error(e.message); setLoadingPreset(false); },
  });

  const filteredList = useMemo(() => {
    let list = synonymsList;
    if (search || filterCategory !== "all") {
      list = synonymsList.filter((s) => {
        const matchSearch = !search ||
          s.term.toLowerCase().includes(search.toLowerCase()) ||
          s.canonical.toLowerCase().includes(search.toLowerCase());
        const matchCat = filterCategory === "all" || s.category === filterCategory;
        return matchSearch && matchCat;
      });
    }
    return list;
  }, [synonymsList, search, filterCategory]);

  const totalPages = Math.max(1, Math.ceil(filteredList.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedList = filteredList.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Reset para página 1 quando filtros mudam
  const handleSearchChange = (val: string) => { setSearch(val); setCurrentPage(1); setSelectedIds(new Set()); };
  const handleCategoryChange = (val: string) => { setFilterCategory(val); setCurrentPage(1); setSelectedIds(new Set()); };

  // Helpers de seleção
  const pageIds = pagedList.map((s) => s.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const somePageSelected = pageIds.some((id) => selectedIds.has(id));

  function toggleSelectAll() {
    if (allPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => new Set(Array.from(prev).concat(pageIds)));
    }
  }

  function toggleSelectOne(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleBulkActivate() {
    bulkToggleMutation.mutate({ ids: Array.from(selectedIds), isActive: "yes" });
  }

  function handleBulkDeactivate() {
    bulkToggleMutation.mutate({ ids: Array.from(selectedIds), isActive: "no" });
  }

  async function handleBulkDelete() {
    const ok = await confirmAction({
      title: `Remover ${selectedIds.size} sinônimo${selectedIds.size !== 1 ? "s" : ""}?`,
      description: `${selectedIds.size} sinônimo${selectedIds.size !== 1 ? "s" : ""} ser${selectedIds.size !== 1 ? "ão" : "á"} removido${selectedIds.size !== 1 ? "s" : ""} permanentemente e deixar${selectedIds.size !== 1 ? "ão" : "á"} de expandir buscas. Esta ação não pode ser desfeita.`,
      confirmLabel: "Remover",
    });
    if (!ok) return;
    bulkDeleteMutation.mutate({ ids: Array.from(selectedIds) });
  }

  function openCreate() {
    setEditItem(null);
    setForm({ term: "", canonical: "", category: "geral" });
    setShowModal(true);
  }

  function openEdit(s: typeof synonymsList[0]) {
    setEditItem({ id: s.id, term: s.term, canonical: s.canonical, category: s.category ?? "geral" });
    setForm({ term: s.term, canonical: s.canonical, category: s.category ?? "geral" });
    setShowModal(true);
  }

  function handleSave() {
    if (!form.term.trim() || !form.canonical.trim()) {
      toast.error("Preencha o termo e o canônico.");
      return;
    }
    if (editItem) {
      updateMutation.mutate({ id: editItem.id, ...form });
    } else {
      createMutation.mutate(form);
    }
  }

  function handleLoadPreset() {
    setLoadingPreset(true);
    bulkCreateMutation.mutate({ items: PRESET_SYNONYMS });
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sinônimos de Matching</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Mapeie abreviações e variações para termos canônicos usados no catálogo.
            O sistema expande automaticamente os termos ao importar editais.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleLoadPreset} disabled={loadingPreset}>
            <Upload className="w-4 h-4 mr-1" />
            {loadingPreset ? "Importando..." : "Carregar Pré-cadastrados"}
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1" />
            Novo Sinônimo
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          <div className="col-span-2 sm:col-span-1 bg-card border rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-primary">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Total ativos</div>
          </div>
          {stats.byCategory.map((c) => (
            <div key={c.category} className="bg-card border rounded-lg p-3 text-center">
              <div className="text-xl font-bold">{c.count}</div>
              <div className="text-xs text-muted-foreground capitalize">{c.category}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por termo ou canônico..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterCategory} onValueChange={handleCategoryChange}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={() => refetch()} title="Atualizar">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Barra de ação em massa */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-lg px-4 py-2.5">
          <span className="text-sm font-semibold text-primary">
            {selectedIds.size} selecionado{selectedIds.size !== 1 ? "s" : ""}
          </span>
          <div className="flex gap-2 ml-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 text-green-700 border-green-300 hover:bg-green-50"
              onClick={handleBulkActivate}
              disabled={bulkToggleMutation.isPending}
            >
              <ToggleRight className="w-3.5 h-3.5" />
              Ativar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 text-amber-700 border-amber-300 hover:bg-amber-50"
              onClick={handleBulkDeactivate}
              disabled={bulkToggleMutation.isPending}
            >
              <ToggleLeft className="w-3.5 h-3.5" />
              Desativar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/5"
              onClick={handleBulkDelete}
              disabled={bulkDeleteMutation.isPending}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Excluir
            </Button>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 ml-auto text-muted-foreground"
            onClick={() => setSelectedIds(new Set())}
            title="Limpar seleção"
          >
            <XIcon className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* Tabela */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 pl-4">
                <Checkbox
                  checked={allPageSelected}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Selecionar todos desta página"
                  className={somePageSelected && !allPageSelected ? "opacity-50" : ""}
                />
              </TableHead>
              <TableHead className="w-10 text-muted-foreground">#</TableHead>
              <TableHead>Termo / Abreviação</TableHead>
              <TableHead>Canônico</TableHead>
              <TableHead className="w-32">Categoria</TableHead>
              <TableHead className="w-20 text-center">Status</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  {synonymsList.length === 0
                    ? "Nenhum sinônimo cadastrado. Clique em \"Carregar Pré-cadastrados\" para começar."
                    : "Nenhum resultado para os filtros aplicados."}
                </TableCell>
              </TableRow>
            ) : (
              pagedList.map((s, i) => (
                <TableRow key={s.id} className="hover:bg-muted/30">
                  <TableCell className="pl-4">
                    <Checkbox
                      checked={selectedIds.has(s.id)}
                      onCheckedChange={() => toggleSelectOne(s.id)}
                      aria-label={`Selecionar ${s.term}`}
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{(safePage - 1) * PAGE_SIZE + i + 1}</TableCell>
                  <TableCell>
                    <span className="font-mono text-sm bg-muted px-2 py-0.5 rounded">{s.term}</span>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{s.canonical}</span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-xs ${CATEGORY_COLORS[s.category ?? "geral"] ?? CATEGORY_COLORS.geral}`}
                    >
                      {s.category ?? "geral"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {s.isActive === "yes" ? (
                      <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400 mx-auto" />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEdit(s)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={async () => {
                          const ok = await confirmAction({
                            title: `Remover sinônimo "${s.term}" → "${s.canonical}"?`,
                            description: "O sinônimo será removido permanentemente e deixará de expandir os resultados de busca. Esta ação não pode ser desfeita.",
                            confirmLabel: "Remover",
                          });
                          if (ok) deleteMutation.mutate({ id: s.id });
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {filteredList.length > 0 && (
        <div className="flex items-center justify-between gap-4">
          {/* Contador */}
          <p className="text-xs text-muted-foreground">
            Exibindo {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredList.length)} de {filteredList.length} sinônimo{filteredList.length !== 1 ? "s" : ""}
          </p>
          {/* Controles de paginação */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setCurrentPage(1)}
                disabled={safePage === 1}
                title="Primeira página"
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                title="Página anterior"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground px-2 min-w-[80px] text-center">
                Página {safePage} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                title="Próxima página"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setCurrentPage(totalPages)}
                disabled={safePage === totalPages}
                title="Última página"
              >
                <ChevronsRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Modal criar/editar */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editItem ? "Editar Sinônimo" : "Novo Sinônimo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Termo / Abreviação</label>
              <Input
                placeholder="Ex: ivermec, amox, sf 0,9%"
                value={form.term}
                onChange={(e) => setForm((f) => ({ ...f, term: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                O texto que aparece no edital (abreviação, nome popular, variação).
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Canônico</label>
              <Input
                placeholder="Ex: ivermectina, amoxicilina, cloreto sodio 0,9%"
                value={form.canonical}
                onChange={(e) => setForm((f) => ({ ...f, canonical: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                O termo padrão usado no catálogo de produtos.
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Categoria</label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.filter((c) => c.value !== "all").map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editItem ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  );
}
