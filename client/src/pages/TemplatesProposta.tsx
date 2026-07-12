import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Plus, Pencil, Trash2, Star, FileText } from "lucide-react";

const ORG_TYPE_LABELS: Record<string, string> = {
  prefeitura: "Prefeitura",
  estado: "Estado",
  federal: "Federal",
  privado: "Privado",
  outro: "Outro",
};

const ORG_TYPE_COLORS: Record<string, string> = {
  prefeitura: "bg-blue-100 text-blue-800",
  estado: "bg-purple-100 text-purple-800",
  federal: "bg-green-100 text-green-800",
  privado: "bg-orange-100 text-orange-800",
  outro: "bg-gray-100 text-gray-700",
};

const FREIGHT_LABELS: Record<string, string> = {
  cif: "CIF (frete incluso)",
  fob: "FOB (frete por conta do comprador)",
  none: "Sem frete",
};

type TemplateForm = {
  name: string;
  orgType: "prefeitura" | "estado" | "federal" | "privado" | "outro";
  icmsPercent: number;
  stPercent: number;
  ipiPercent: number;
  otherTaxPercent: number;
  freightType: "cif" | "fob" | "none";
  freightPercent: number;
  validityDays: number;
  declarations: string;
  paymentTerms: string;
  deliveryDays: number;
  notes: string;
  isDefault: "yes" | "no";
};

const EMPTY_FORM: TemplateForm = {
  name: "",
  orgType: "outro",
  icmsPercent: 0,
  stPercent: 0,
  ipiPercent: 0,
  otherTaxPercent: 0,
  freightType: "cif",
  freightPercent: 0,
  validityDays: 30,
  declarations: "",
  paymentTerms: "30 dias após entrega",
  deliveryDays: 15,
  notes: "",
  isDefault: "no",
};

// Templates pré-definidos para agilizar o cadastro
const PRESET_TEMPLATES: Array<Partial<TemplateForm> & { name: string }> = [
  {
    name: "Prefeitura Municipal — Padrão",
    orgType: "prefeitura",
    icmsPercent: 12,
    stPercent: 0,
    ipiPercent: 0,
    otherTaxPercent: 0,
    freightType: "cif",
    freightPercent: 0,
    validityDays: 60,
    paymentTerms: "30 dias após entrega",
    deliveryDays: 15,
    declarations: "Declaramos que os produtos ofertados atendem às especificações do edital e às normas vigentes da ANVISA.",
  },
  {
    name: "Governo Estadual — Padrão",
    orgType: "estado",
    icmsPercent: 12,
    stPercent: 2,
    ipiPercent: 0,
    otherTaxPercent: 0,
    freightType: "cif",
    freightPercent: 0,
    validityDays: 60,
    paymentTerms: "30 dias após entrega",
    deliveryDays: 20,
    declarations: "Declaramos que os produtos ofertados atendem às especificações do edital e às normas vigentes da ANVISA.",
  },
  {
    name: "Federal (Ministério/Autarquia)",
    orgType: "federal",
    icmsPercent: 0,
    stPercent: 0,
    ipiPercent: 0,
    otherTaxPercent: 0,
    freightType: "cif",
    freightPercent: 0,
    validityDays: 90,
    paymentTerms: "30 dias após entrega",
    deliveryDays: 30,
    declarations: "Declaramos que os produtos ofertados atendem às especificações do edital, às normas vigentes da ANVISA e ao Decreto nº 7.892/2013.",
  },
  {
    name: "Cliente Privado",
    orgType: "privado",
    icmsPercent: 12,
    stPercent: 0,
    ipiPercent: 0,
    otherTaxPercent: 0,
    freightType: "cif",
    freightPercent: 3,
    validityDays: 30,
    paymentTerms: "À vista ou 30 dias",
    deliveryDays: 10,
    declarations: "",
  },
];

export default function TemplatesProposta() {
  const utils = trpc.useUtils();
  const { data: templates = [], isLoading } = trpc.proposalTemplates.list.useQuery();

  const createMutation = trpc.proposalTemplates.create.useMutation({
    onSuccess: () => {
      utils.proposalTemplates.list.invalidate();
      utils.proposalTemplates.getDefault.invalidate();
      toast.success("Template criado com sucesso");
      setModalOpen(false);
    },
    onError: (e) => toast.error("Erro ao criar template: " + e.message),
  });

  const updateMutation = trpc.proposalTemplates.update.useMutation({
    onSuccess: () => {
      utils.proposalTemplates.list.invalidate();
      utils.proposalTemplates.getDefault.invalidate();
      toast.success("Template atualizado");
      setModalOpen(false);
    },
    onError: (e) => toast.error("Erro ao atualizar: " + e.message),
  });

  const deleteMutation = trpc.proposalTemplates.delete.useMutation({
    onSuccess: () => {
      utils.proposalTemplates.list.invalidate();
      toast.success("Template excluído");
    },
    onError: (e) => toast.error("Erro ao excluir: " + e.message),
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<TemplateForm>(EMPTY_FORM);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  const seedMutation = trpc.proposalTemplates.seedDefaults.useMutation({
    onSuccess: (data) => {
      utils.proposalTemplates.list.invalidate();
      utils.proposalTemplates.getDefault.invalidate();
      toast.success(`${data.created} templates padrão importados com sucesso!`);
      setShowPresets(false);
    },
    onError: (e) => toast.error("Erro ao importar templates: " + e.message),
  });

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(t: typeof templates[0]) {
    setEditingId(t.id);
    setForm({
      name: t.name,
      orgType: t.orgType as TemplateForm["orgType"],
      icmsPercent: Number(t.icmsPercent ?? 0),
      stPercent: Number(t.stPercent ?? 0),
      ipiPercent: Number(t.ipiPercent ?? 0),
      otherTaxPercent: Number(t.otherTaxPercent ?? 0),
      freightType: (t.freightType ?? "cif") as TemplateForm["freightType"],
      freightPercent: Number(t.freightPercent ?? 0),
      validityDays: t.validityDays ?? 30,
      declarations: t.declarations ?? "",
      paymentTerms: t.paymentTerms ?? "",
      deliveryDays: t.deliveryDays ?? 15,
      notes: t.notes ?? "",
      isDefault: t.isDefault as "yes" | "no",
    });
    setModalOpen(true);
  }

  function applyPreset(preset: Partial<TemplateForm> & { name: string }) {
    setForm({ ...EMPTY_FORM, ...preset });
    setShowPresets(false);
    setModalOpen(true);
  }

  function handleSubmit() {
    if (!form.name.trim()) {
      toast.error("Nome do template é obrigatório");
      return;
    }
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, ...form });
    } else {
      createMutation.mutate(form);
    }
  }

  const totalTax = useMemo(
    () => form.icmsPercent + form.stPercent + form.ipiPercent + form.otherTaxPercent,
    [form.icmsPercent, form.stPercent, form.ipiPercent, form.otherTaxPercent]
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            Templates de Proposta
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configurações reutilizáveis de impostos, frete e declarações por tipo de órgão.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowPresets(true)}>
            <Star className="w-4 h-4 mr-2" />
            Usar Modelo Pronto
          </Button>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Template
          </Button>
        </div>
      </div>

      {/* Lista de templates */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando templates...</div>
      ) : templates.length === 0 ? (
        <div className="border rounded-lg p-12 text-center space-y-3">
          <FileText className="w-12 h-12 mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground">Nenhum template cadastrado ainda.</p>
          <p className="text-sm text-muted-foreground">
            Crie templates para preencher automaticamente impostos, frete e declarações ao criar propostas.
          </p>
          <Button onClick={() => setShowPresets(true)} className="mt-2">
            <Star className="w-4 h-4 mr-2" />
            Começar com Modelos Prontos
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">ICMS</TableHead>
                <TableHead className="text-right">ST</TableHead>
                <TableHead className="text-right">IPI</TableHead>
                <TableHead className="text-right">Outros</TableHead>
                <TableHead>Frete</TableHead>
                <TableHead className="text-right">Validade</TableHead>
                <TableHead className="text-right">Entrega</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id} className={t.isDefault === "yes" ? "bg-primary/5" : ""}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {t.isDefault === "yes" && (
                        <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500 shrink-0" />
                      )}
                      <span className="font-medium">{t.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ORG_TYPE_COLORS[t.orgType]}`}>
                      {ORG_TYPE_LABELS[t.orgType]}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm">{Number(t.icmsPercent ?? 0).toFixed(1)}%</TableCell>
                  <TableCell className="text-right text-sm">{Number(t.stPercent ?? 0).toFixed(1)}%</TableCell>
                  <TableCell className="text-right text-sm">{Number(t.ipiPercent ?? 0).toFixed(1)}%</TableCell>
                  <TableCell className="text-right text-sm">{Number(t.otherTaxPercent ?? 0).toFixed(1)}%</TableCell>
                  <TableCell className="text-sm">
                    {t.freightType === "cif"
                      ? `CIF ${Number(t.freightPercent ?? 0) > 0 ? `(+${Number(t.freightPercent).toFixed(1)}%)` : "(incluso)"}`
                      : t.freightType === "fob"
                      ? "FOB"
                      : "Sem frete"}
                  </TableCell>
                  <TableCell className="text-right text-sm">{t.validityDays ?? 30}d</TableCell>
                  <TableCell className="text-right text-sm">{t.deliveryDays ?? 15}d</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(t)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteConfirmId(t.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Modal de criação/edição */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId !== null ? "Editar Template" : "Novo Template de Proposta"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Nome e tipo */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Nome do Template *</Label>
                <Input
                  placeholder="ex: Prefeitura Municipal — Padrão"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de Órgão</Label>
                <Select
                  value={form.orgType}
                  onValueChange={(v) => setForm((f) => ({ ...f, orgType: v as TemplateForm["orgType"] }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ORG_TYPE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Template Padrão</Label>
                <Select
                  value={form.isDefault}
                  onValueChange={(v) => setForm((f) => ({ ...f, isDefault: v as "yes" | "no" }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">Não (uso manual)</SelectItem>
                    <SelectItem value="yes">Sim (preenche automaticamente)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Impostos */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-base font-semibold">Impostos</Label>
                {totalTax > 0 && (
                  <span className="text-xs text-muted-foreground">Total: {totalTax.toFixed(2)}%</span>
                )}
              </div>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { key: "icmsPercent", label: "ICMS (%)" },
                  { key: "stPercent", label: "ST (%)" },
                  { key: "ipiPercent", label: "IPI (%)" },
                  { key: "otherTaxPercent", label: "Outros (%)" },
                ].map(({ key, label }) => (
                  <div key={key} className="space-y-1.5">
                    <Label className="text-xs">{label}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={form[key as keyof TemplateForm] as number}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, [key]: parseFloat(e.target.value) || 0 }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Frete */}
            <div>
              <Label className="text-base font-semibold mb-2 block">Frete</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Tipo de Frete</Label>
                  <Select
                    value={form.freightType}
                    onValueChange={(v) => setForm((f) => ({ ...f, freightType: v as TemplateForm["freightType"] }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(FREIGHT_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">% Frete (se CIF com custo)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={form.freightPercent}
                    onChange={(e) => setForm((f) => ({ ...f, freightPercent: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
              </div>
            </div>

            {/* Prazos */}
            <div>
              <Label className="text-base font-semibold mb-2 block">Prazos e Condições</Label>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Validade da Proposta (dias)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.validityDays}
                    onChange={(e) => setForm((f) => ({ ...f, validityDays: parseInt(e.target.value) || 30 }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Prazo de Entrega (dias)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.deliveryDays}
                    onChange={(e) => setForm((f) => ({ ...f, deliveryDays: parseInt(e.target.value) || 15 }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Condições de Pagamento</Label>
                  <Input
                    placeholder="ex: 30 dias após entrega"
                    value={form.paymentTerms}
                    onChange={(e) => setForm((f) => ({ ...f, paymentTerms: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Declarações */}
            <div className="space-y-1.5">
              <Label className="text-base font-semibold">Declarações / Observações Padrão</Label>
              <Textarea
                rows={4}
                placeholder="Texto que aparecerá automaticamente no campo de declarações da proposta..."
                value={form.declarations}
                onChange={(e) => setForm((f) => ({ ...f, declarations: e.target.value }))}
              />
            </div>

            {/* Notas internas */}
            <div className="space-y-1.5">
              <Label>Notas Internas (não aparecem na proposta)</Label>
              <Textarea
                rows={2}
                placeholder="Observações internas sobre quando usar este template..."
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editingId !== null ? "Salvar Alterações" : "Criar Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de modelos prontos */}
      <Dialog open={showPresets} onOpenChange={setShowPresets}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Modelos Prontos</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Selecione um modelo para pré-preencher o formulário. Você poderá ajustar os valores antes de salvar.
          </p>
          <div className="space-y-2 mt-2">
            {PRESET_TEMPLATES.map((preset) => (
              <button
                key={preset.name}
                className="w-full text-left border rounded-lg p-3 hover:bg-accent transition-colors"
                onClick={() => applyPreset(preset)}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ORG_TYPE_COLORS[preset.orgType ?? "outro"]}`}>
                    {ORG_TYPE_LABELS[preset.orgType ?? "outro"]}
                  </span>
                  <span className="font-medium text-sm">{preset.name}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  ICMS {preset.icmsPercent ?? 0}% · ST {preset.stPercent ?? 0}% · Frete {preset.freightType?.toUpperCase() ?? "CIF"} · Validade {preset.validityDays ?? 30}d
                </p>
              </button>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t">
            <Button
              className="w-full gap-2"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
            >
              <Star className="w-4 h-4" />
              {seedMutation.isPending ? "Importando..." : "Importar Todos os Modelos de Uma Vez"}
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-1.5">
              Cria os 4 templates padrão (Federal, Estadual, Municipal e Venda Direta) diretamente no banco.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPresets(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Confirmação de exclusão */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir Template</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir este template? Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteConfirmId !== null) {
                  deleteMutation.mutate({ id: deleteConfirmId });
                  setDeleteConfirmId(null);
                }
              }}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
