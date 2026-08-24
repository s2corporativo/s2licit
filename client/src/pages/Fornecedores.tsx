import { trpc } from "@/lib/trpc";
import { useConfirm } from "@/hooks/useConfirm";
import { AlertTriangle, Building2, Check, FileCheck2, Pencil, Plus, ShieldAlert, X } from "lucide-react";
import { useState } from "react";

type SupplierForm = {
  name: string;
  code: string;
  contact: string;
  email: string;
  phone: string;
  notes: string;
};

const emptyForm: SupplierForm = {
  name: "",
  code: "",
  contact: "",
  email: "",
  phone: "",
  notes: "",
};

type SanctionForm = {
  orgao: string;
  processo: string;
  penalidade: "advertencia" | "multa" | "impedimento" | "inidoneidade";
  dataInicio: string;
  dataFim: string;
  referenciaLegal: string;
  observacoes: string;
};

const emptySanctionForm: SanctionForm = {
  orgao: "",
  processo: "",
  penalidade: "advertencia",
  dataInicio: "",
  dataFim: "",
  referenciaLegal: "",
  observacoes: "",
};

export default function Fornecedores() {
  const { confirm, confirmDialog } = useConfirm();
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [showSanctionForm, setShowSanctionForm] = useState(false);
  const [sanctionForm, setSanctionForm] = useState<SanctionForm>(emptySanctionForm);

  const { data: suppliers, isLoading } = trpc.suppliers.list.useQuery({ activeOnly: false });
  // Regularidade fiscal do fornecedor selecionado (Ressalva 2 do Módulo 06).
  const regularidadeQuery = trpc.certidoes.bySupplier.useQuery(
    { supplierId: selectedSupplierId ?? 0 },
    { enabled: selectedSupplierId != null },
  );
  const sanctionsListQuery = trpc.sanctions.list.useQuery(
    { supplierId: selectedSupplierId ?? undefined },
    { enabled: selectedSupplierId != null },
  );

  const resetForm = () => {
    setShowForm(false);
    setEditId(null);
    setForm(emptyForm);
  };

  const resetSanctionForm = () => {
    setShowSanctionForm(false);
    setSanctionForm(emptySanctionForm);
  };

  const createMutation = trpc.suppliers.create.useMutation({
    onSuccess: () => {
      utils.suppliers.list.invalidate();
      resetForm();
    },
  });
  const updateMutation = trpc.suppliers.update.useMutation({
    onSuccess: () => {
      utils.suppliers.list.invalidate();
      resetForm();
    },
  });
  const deleteMutation = trpc.suppliers.delete.useMutation({
    onSuccess: () => {
      utils.suppliers.list.invalidate();
      setSelectedSupplierId(null);
    },
  });
  const toggleActiveMutation = trpc.suppliers.update.useMutation({
    onSuccess: () => utils.suppliers.list.invalidate(),
  });
  const createSanctionMutation = trpc.sanctions.create.useMutation({
    onSuccess: () => {
      utils.sanctions.list.invalidate();
      utils.sanctions.active.invalidate();
      resetSanctionForm();
    },
    onError: (e) => alert(e.message),
  });
  const revokeSanctionMutation = trpc.sanctions.revoke.useMutation({
    onSuccess: () => {
      utils.sanctions.list.invalidate();
      utils.sanctions.active.invalidate();
    },
    onError: (e) => alert(e.message),
  });

  const handleEdit = (supplier: any) => {
    setEditId(supplier.id);
    setForm({
      name: supplier.name ?? "",
      code: supplier.code ?? "",
      contact: supplier.contact ?? "",
      email: supplier.email ?? "",
      phone: supplier.phone ?? "",
      notes: supplier.notes ?? "",
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (editId) updateMutation.mutate({ id: editId, ...form });
    else createMutation.mutate(form);
  };

  const handleSubmitSanction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId || !sanctionForm.orgao.trim() || !sanctionForm.dataInicio) return;
    createSanctionMutation.mutate({
      supplierId: selectedSupplierId,
      orgao: sanctionForm.orgao.trim(),
      processo: sanctionForm.processo.trim() || null,
      penalidade: sanctionForm.penalidade,
      dataInicio: sanctionForm.dataInicio,
      dataFim: sanctionForm.dataFim || null,
      referenciaLegal: sanctionForm.referenciaLegal.trim() || null,
      observacoes: sanctionForm.observacoes.trim() || null,
    });
  };

  const selectedSupplier = suppliers?.find((supplier) => supplier.id === selectedSupplierId);

  return (
    <div className="max-w-7xl p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <span className="its-bar" />
          <h1 className="text-3xl font-black tracking-tight text-gray-900">Fornecedores</h1>
          <p className="mt-1 text-sm text-gray-500">
            Contatos, situação cadastral e sanções dos fornecedores usados nas cotações.
          </p>
        </div>
        <button
          onClick={() => {
            setEditId(null);
            setForm(emptyForm);
            setShowForm((value) => !value);
          }}
          className="flex items-center gap-2 bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800"
        >
          <Plus size={14} /> Novo Fornecedor
        </button>
      </div>

      {showForm && (
        <div className="mb-6 border border-gray-900 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-black tracking-tight text-gray-900">
              {editId ? "Editar Fornecedor" : "Novo Fornecedor"}
            </h2>
            <button onClick={resetForm} aria-label="Fechar formulário">
              <X size={16} className="text-gray-400 hover:text-gray-900" />
            </button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Nome *" className="md:col-span-2">
                <input
                  value={form.name}
                  onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
                  required
                  className="w-full border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                  placeholder="Nome do fornecedor"
                />
              </Field>
              <Field label="Código">
                <input
                  value={form.code}
                  onChange={(e) => setForm((current) => ({ ...current, code: e.target.value }))}
                  className="w-full border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                  placeholder="Código interno"
                />
              </Field>
              <Field label="Contato">
                <input
                  value={form.contact}
                  onChange={(e) => setForm((current) => ({ ...current, contact: e.target.value }))}
                  className="w-full border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                  placeholder="Nome do contato"
                />
              </Field>
              <Field label="E-mail">
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
                  className="w-full border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                  placeholder="email@fornecedor.com"
                />
              </Field>
              <Field label="Telefone">
                <input
                  value={form.phone}
                  onChange={(e) => setForm((current) => ({ ...current, phone: e.target.value }))}
                  className="w-full border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                  placeholder="(00) 00000-0000"
                />
              </Field>
              <Field label="Observações" className="md:col-span-2">
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))}
                  rows={2}
                  className="w-full resize-none border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                />
              </Field>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={resetForm} className="border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:border-gray-900">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="flex items-center gap-2 bg-gray-900 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
              >
                <Check size={14} /> {editId ? "Salvar alterações" : "Criar fornecedor"}
              </button>
            </div>
          </form>
        </div>
      )}

      {selectedSupplierId != null && (
        <div className="mb-6 border border-gray-900 p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-black text-gray-900">
              <ShieldAlert size={15} /> Sanções — {selectedSupplier?.name ?? "Fornecedor"}
            </h2>
            <button
              onClick={() => {
                setSelectedSupplierId(null);
                resetSanctionForm();
              }}
              aria-label="Fechar sanções"
            >
              <X size={16} className="text-gray-400 hover:text-gray-900" />
            </button>
          </div>

          {sanctionsListQuery.isLoading ? (
            <p className="text-xs text-gray-400">Carregando sanções...</p>
          ) : sanctionsListQuery.data?.length ? (
            <div className="mb-4 space-y-2">
              {sanctionsListQuery.data.map((sanction: any) => (
                <div
                  key={sanction.id}
                  className={`flex items-start justify-between gap-3 border px-4 py-3 ${sanction.status === "ativa" ? "border-blue-800 bg-blue-50" : "border-gray-200 bg-gray-50"}`}
                >
                  <div className="text-xs">
                    <div className="font-bold text-gray-900">
                      {String(sanction.penalidade).toUpperCase()}
                      {sanction.status !== "ativa" && <span className="ml-2 font-normal text-gray-400">({sanction.status})</span>}
                    </div>
                    <div className="mt-1 text-gray-600">
                      {sanction.orgao}{sanction.processo ? ` · Processo ${sanction.processo}` : ""}{sanction.referenciaLegal ? ` · ${sanction.referenciaLegal}` : ""}
                    </div>
                    <div className="mt-1 text-gray-400">
                      {new Date(sanction.dataInicio).toLocaleDateString("pt-BR")}
                      {sanction.dataFim ? ` → ${new Date(sanction.dataFim).toLocaleDateString("pt-BR")}` : " → sem prazo definido"}
                    </div>
                    {sanction.observacoes && <div className="mt-1 italic text-gray-500">{sanction.observacoes}</div>}
                  </div>
                  {sanction.status === "ativa" && (
                    <button
                      onClick={async () => {
                        const ok = await confirm({
                          title: "Revogar esta sanção?",
                          description: "A sanção será mantida no histórico e marcada como revogada.",
                          confirmLabel: "Revogar",
                        });
                        if (ok) revokeSanctionMutation.mutate({ id: sanction.id });
                      }}
                      className="shrink-0 border border-gray-300 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-gray-600 hover:border-blue-800 hover:text-blue-800"
                    >
                      Revogar
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="mb-4 text-xs text-gray-400">Nenhuma sanção registrada para este fornecedor.</p>
          )}

          {/* Regularidade fiscal — certidões vinculadas a ESTE fornecedor.
              Antes a tabela de certidões era global e não sabia responder
              "este fornecedor está habilitado?", que é o que a licitação exige. */}
          <div className="mb-4 border-t border-gray-200 pt-4">
            <h3 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-gray-900">
              <FileCheck2 size={14} /> Regularidade fiscal
            </h3>
            {regularidadeQuery.isLoading ? (
              <p className="text-xs text-gray-400">Carregando certidões...</p>
            ) : !regularidadeQuery.data?.certidoes.length ? (
              <p className="text-xs text-gray-500">
                Nenhuma certidão vinculada. <strong>Sem certidão não há prova de regularidade</strong> — o
                fornecedor não se habilita.
              </p>
            ) : (
              <>
                <div
                  className={`mb-3 inline-block px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${
                    regularidadeQuery.data.regular
                      ? "bg-green-100 text-green-900"
                      : "bg-red-100 text-red-900"
                  }`}
                >
                  {regularidadeQuery.data.regular ? "Regular" : "Irregular"}
                  {regularidadeQuery.data.vencidas > 0 && ` · ${regularidadeQuery.data.vencidas} vencida(s)`}
                  {regularidadeQuery.data.vencendo > 0 && ` · ${regularidadeQuery.data.vencendo} vencendo`}
                </div>
                <div className="space-y-2">
                  {regularidadeQuery.data.certidoes.map((c: any) => (
                    <div
                      key={c.id}
                      className={`flex items-start justify-between gap-3 border px-4 py-2 text-xs ${
                        c.status === "vencida"
                          ? "border-red-300 bg-red-50"
                          : c.status === "vence_em_breve"
                            ? "border-amber-300 bg-amber-50"
                            : "border-gray-200 bg-gray-50"
                      }`}
                    >
                      <div>
                        <div className="font-bold text-gray-900">
                          {c.tipo}
                          {c.orgaoEmissor ? <span className="font-normal text-gray-500"> · {c.orgaoEmissor}</span> : null}
                        </div>
                        <div className="mt-1 text-gray-500">
                          Validade: {new Date(c.dataValidade).toLocaleDateString("pt-BR")}
                          {c.numero ? ` · nº ${c.numero}` : ""}
                        </div>
                      </div>
                      <span className="shrink-0 font-bold uppercase tracking-widest text-[10px] text-gray-600">
                        {c.status === "vence_em_breve" ? "vence em breve" : c.status}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowSanctionForm((value) => !value)}
            className="mb-3 flex items-center gap-2 bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
          >
            <Plus size={14} /> {showSanctionForm ? "Cancelar" : "Registrar sanção"}
          </button>

          {showSanctionForm && (
            <form onSubmit={handleSubmitSanction} className="border-t border-gray-200 pt-4">
              <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Órgão sancionador *" className="md:col-span-2">
                  <input
                    value={sanctionForm.orgao}
                    onChange={(e) => setSanctionForm((current) => ({ ...current, orgao: e.target.value }))}
                    required
                    className="w-full border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                  />
                </Field>
                <Field label="Processo">
                  <input
                    value={sanctionForm.processo}
                    onChange={(e) => setSanctionForm((current) => ({ ...current, processo: e.target.value }))}
                    className="w-full border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                  />
                </Field>
                <Field label="Penalidade *">
                  <select
                    value={sanctionForm.penalidade}
                    onChange={(e) => setSanctionForm((current) => ({ ...current, penalidade: e.target.value as SanctionForm["penalidade"] }))}
                    className="w-full border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                  >
                    <option value="advertencia">Advertência</option>
                    <option value="multa">Multa</option>
                    <option value="impedimento">Impedimento de licitar/contratar</option>
                    <option value="inidoneidade">Declaração de inidoneidade</option>
                  </select>
                </Field>
                <Field label="Data de início *">
                  <input
                    type="date"
                    value={sanctionForm.dataInicio}
                    onChange={(e) => setSanctionForm((current) => ({ ...current, dataInicio: e.target.value }))}
                    required
                    className="w-full border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                  />
                </Field>
                <Field label="Data de fim">
                  <input
                    type="date"
                    value={sanctionForm.dataFim}
                    onChange={(e) => setSanctionForm((current) => ({ ...current, dataFim: e.target.value }))}
                    className="w-full border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                  />
                </Field>
                <Field label="Referência legal">
                  <input
                    value={sanctionForm.referenciaLegal}
                    onChange={(e) => setSanctionForm((current) => ({ ...current, referenciaLegal: e.target.value }))}
                    className="w-full border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                    placeholder="Lei 14.133/21, art. 155..."
                  />
                </Field>
                <Field label="Observações" className="md:col-span-2">
                  <textarea
                    value={sanctionForm.observacoes}
                    onChange={(e) => setSanctionForm((current) => ({ ...current, observacoes: e.target.value }))}
                    rows={2}
                    className="w-full resize-none border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                  />
                </Field>
              </div>
              <div className="mb-3 flex items-center gap-2 text-xs text-gray-600">
                <AlertTriangle size={14} className="text-blue-800" />
                Sanções ativas geram bloqueio preventivo na geração de orçamento com produtos do fornecedor.
              </div>
              <button
                type="submit"
                disabled={createSanctionMutation.isPending}
                className="flex items-center gap-2 bg-blue-800 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-900 disabled:opacity-50"
              >
                <Check size={14} /> Registrar sanção
              </button>
            </form>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="py-12 text-center">
          <div className="mx-auto mb-3 h-1 w-6 animate-pulse bg-gray-200" />
          <p className="text-xs text-gray-400">Carregando...</p>
        </div>
      ) : suppliers?.length ? (
        <div className="overflow-x-auto border border-gray-200">
          <table className="its-table min-w-[1180px]">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Código</th>
                <th>Contato</th>
                <th>E-mail</th>
                <th>Telefone</th>
                <th>Status</th>
                <th>Sanções</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr key={supplier.id}>
                  <td><div className="font-semibold text-xs text-gray-900">{supplier.name}</div></td>
                  <td className="text-xs text-gray-600">{supplier.code || "—"}</td>
                  <td className="text-xs text-gray-600">{supplier.contact || "—"}</td>
                  <td className="text-xs text-gray-600">{supplier.email || "—"}</td>
                  <td className="text-xs text-gray-600">{supplier.phone || "—"}</td>
                  <td>
                    <button
                      onClick={() => toggleActiveMutation.mutate({ id: supplier.id, isActive: supplier.isActive === "yes" ? "no" : "yes" })}
                      className={`border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${supplier.isActive === "yes" ? "border-green-300 bg-green-50 text-green-700" : "border-gray-200 text-gray-400"}`}
                    >
                      {supplier.isActive === "yes" ? "Ativo" : "Inativo"}
                    </button>
                  </td>
                  <td>
                    <button
                      onClick={() => {
                        setSelectedSupplierId((current) => current === supplier.id ? null : supplier.id);
                        setShowSanctionForm(false);
                      }}
                      className={`flex items-center gap-1 border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${selectedSupplierId === supplier.id ? "border-blue-800 bg-blue-50 text-blue-800" : "border-gray-200 text-gray-500"}`}
                    >
                      <ShieldAlert size={10} /> Gerenciar
                    </button>
                  </td>
                  <td>
                    <div className="flex items-center gap-3">
                      <button onClick={() => handleEdit(supplier)} aria-label={`Editar ${supplier.name}`} className="text-gray-400 hover:text-gray-900">
                        <Pencil size={14} />
                      </button>
                      <button
                        aria-label={`Excluir ${supplier.name}`}
                        onClick={async () => {
                          const ok = await confirm({
                            title: `Excluir fornecedor "${supplier.name}"?`,
                            description: "Todos os produtos deste fornecedor serão removidos do catálogo, junto com seus preços. Esta ação não pode ser desfeita.",
                            confirmLabel: "Excluir",
                          });
                          if (ok) deleteMutation.mutate({ id: supplier.id });
                        }}
                        className="text-gray-400 hover:text-red-700"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border border-gray-200 py-16 text-center">
          <Building2 size={24} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-400">Nenhum fornecedor cadastrado. Clique em "Novo Fornecedor" para começar.</p>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</label>
      {children}
    </div>
  );
}
