import { trpc } from "@/lib/trpc";
import { useConfirm } from "@/hooks/useConfirm";
import { AlertTriangle, Building2, Check, Pencil, Plus, ShieldAlert, X } from "lucide-react";
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

export default function Fornecedores() {
  const { confirm, confirmDialog } = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptyForm);

  const { data: suppliers, isLoading } = trpc.suppliers.list.useQuery({ activeOnly: false });
  const utils = trpc.useUtils();

  const createMutation = trpc.suppliers.create.useMutation({
    onSuccess: () => { utils.suppliers.list.invalidate(); resetForm(); },
  });
  const updateMutation = trpc.suppliers.update.useMutation({
    onSuccess: () => { utils.suppliers.list.invalidate(); resetForm(); },
  });
  const deleteMutation = trpc.suppliers.delete.useMutation({
    onSuccess: () => utils.suppliers.list.invalidate(),
  });
  const toggleActiveMutation = trpc.suppliers.update.useMutation({
    onSuccess: () => utils.suppliers.list.invalidate(),
  });

  // ─── Gestão de sanções do fornecedor selecionado ───────────────────────────
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [showSanctionForm, setShowSanctionForm] = useState(false);
  const [sanctionForm, setSanctionForm] = useState({
    orgao: "",
    processo: "",
    penalidade: "advertencia" as "advertencia" | "multa" | "impedimento" | "inidoneidade",
    dataInicio: "",
    dataFim: "",
    referenciaLegal: "",
    observacoes: "",
  });

  const sanctionsListQuery = trpc.sanctions.list.useQuery(
    { supplierId: selectedSupplierId ?? undefined },
    { enabled: selectedSupplierId != null },
  );
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

  const resetSanctionForm = () => {
    setShowSanctionForm(false);
    setSanctionForm({ orgao: "", processo: "", penalidade: "advertencia", dataInicio: "", dataFim: "", referenciaLegal: "", observacoes: "" });
  };

  const handleSubmitSanction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sanctionForm.orgao.trim() || !sanctionForm.dataInicio || !selectedSupplierId) return;
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

  const resetForm = () => {
    setShowForm(false);
    setEditId(null);
    setForm(emptyForm);
  };

  const handleEdit = (s: any) => {
    setEditId(s.id);
    setForm({
      name: s.name ?? "",
      code: s.code ?? "",
      contact: s.contact ?? "",
      email: s.email ?? "",
      phone: s.phone ?? "",
      notes: s.notes ?? "",
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (editId) {
      updateMutation.mutate({ id: editId, ...form });
    } else {
      createMutation.mutate(form);
    }
  };

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <span className="its-bar" />
          <h1 className="text-3xl font-black tracking-tight text-gray-900">
            Fornecedores
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Gerencie o cadastro de fornecedores do sistema.
          </p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setEditId(null); setForm(emptyForm); }}
          className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-800 transition-colors"
        >
          <Plus size={14} />
          Novo Fornecedor
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="border border-gray-900 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-black tracking-tight text-gray-900">
              {editId ? "Editar Fornecedor" : "Novo Fornecedor"}
            </h2>
            <button onClick={resetForm}>
              <X size={16} className="text-gray-400 hover:text-gray-900" />
            </button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="col-span-2">
                <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">
                  Nome *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                  className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
                  placeholder="Nome do fornecedor"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">
                  Código
                </label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
                  placeholder="Código interno"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">
                  Contato
                </label>
                <input
                  type="text"
                  value={form.contact}
                  onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
                  className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
                  placeholder="Nome do contato"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">
                  E-mail
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
                  placeholder="email@fornecedor.com"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">
                  Telefone
                </label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
                  placeholder="(00) 00000-0000"
                />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">
                  Observações
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-900 resize-none"
                  placeholder="Notas internas sobre este fornecedor"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 border border-gray-300 text-sm font-semibold text-gray-700 hover:border-gray-900 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="flex items-center gap-2 bg-gray-900 text-white px-5 py-2 text-sm font-semibold hover:bg-blue-800 transition-colors disabled:opacity-50"
              >
                <Check size={14} />
                {editId ? "Salvar alterações" : "Criar fornecedor"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Painel de sanções do fornecedor selecionado */}
      {selectedSupplierId != null && (() => {
        const sel = suppliers?.find((x) => x.id === selectedSupplierId);
        return (
          <div className="border border-gray-900 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-black tracking-tight text-gray-900 flex items-center gap-2">
                <ShieldAlert size={14} />
                Sanções — {sel?.name ?? "Fornecedor"} (Lei 14.133/21, art. 155)
              </h2>
              <button onClick={resetSanctionForm}>
                <X size={16} className="text-gray-400 hover:text-gray-900" />
              </button>
            </div>
            {sanctionsListQuery.isLoading ? (
              <p className="text-xs text-gray-400">Carregando sanções...</p>
            ) : sanctionsListQuery.data && sanctionsListQuery.data.length > 0 ? (
              <div className="mb-4 space-y-2">
                {sanctionsListQuery.data.map((s: any) => (
                  <div
                    key={s.id}
                    className={`border px-4 py-3 flex items-start justify-between gap-3 ${
                      s.status === "ativa" ? "border-blue-800 bg-blue-50" : "border-gray-200 bg-gray-50"
                    }`}
                  >
                    <div className="text-xs">
                      <div className="font-bold text-gray-900">
                        {s.penalidade.toUpperCase()}
                        {s.status !== "ativa" && (
                          <span className="ml-2 font-normal text-gray-400">({s.status})</span>
                        )}
                      </div>
                      <div className="text-gray-600 mt-1">
                        {s.orgao}
                        {s.processo ? ` · Processo ${s.processo}` : ""}
                        {s.referenciaLegal ? ` · ${s.referenciaLegal}` : ""}
                      </div>
                      <div className="text-gray-400 mt-1">
                        {new Date(s.dataInicio).toLocaleDateString("pt-BR")}
                        {s.dataFim ? ` → ${new Date(s.dataFim).toLocaleDateString("pt-BR")}` : " → sem prazo definido"}
                      </div>
                      {s.observacoes ? <div className="text-gray-500 italic mt-1">{s.observacoes}</div> : null}
                    </div>
                    {s.status === "ativa" && (
                      <button
                        onClick={async () => {
                          const ok = await confirm({
                            title: "Revogar esta sanção?",
                            description: "A sanção será marcada como revogada (mantida no histórico). Registre quem solicitou a revogação nas observações.",
                            confirmLabel: "Revogar",
                          });
                          if (ok) revokeSanctionMutation.mutate({ id: s.id });
                        }}
                        className="shrink-0 px-3 py-1 border border-gray-300 text-[10px] font-bold tracking-widest uppercase text-gray-600 hover:border-blue-800 hover:text-blue-800 transition-colors"
                      >
                        Revogar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 mb-4">
                Nenhuma sanção registrada para este fornecedor.
              </p>
            )}

            <button
              type="button"
              onClick={() => setShowSanctionForm((v) => !v)}
              className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-800 transition-colors mb-3"
            >
              <Plus size={14} />
              {showSanctionForm ? "Cancelar" : "Registrar sanção"}
            </button>

            {showSanctionForm && (
              <form onSubmit={handleSubmitSanction} className="border-t border-gray-200 pt-4">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">
                      Órgão sancionador *
                    </label>
                    <input
                      type="text"
                      value={sanctionForm.orgao}
                      onChange={(e) => setSanctionForm((f) => ({ ...f, orgao: e.target.value }))}
                      required
                      className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
                      placeholder="Ex.: Prefeitura Municipal de ..., DNIT, MAPA"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">
                      Processo
                    </label>
                    <input
                      type="text"
                      value={sanctionForm.processo}
                      onChange={(e) => setSanctionForm((f) => ({ ...f, processo: e.target.value }))}
                      className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
                      placeholder="Número do processo administrativo"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">
                      Penalidade *
                    </label>
                    <select
                      value={sanctionForm.penalidade}
                      onChange={(e) =>
                        setSanctionForm((f) => ({
                          ...f,
                          penalidade: e.target.value as typeof sanctionForm.penalidade,
                        }))
                      }
                      className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-900 bg-white"
                    >
                      <option value="advertencia">Advertência</option>
                      <option value="multa">Multa</option>
                      <option value="impedimento">Impedimento de licitar/contratar</option>
                      <option value="inidoneidade">Declaração de inidoneidade</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">
                      Data de início *
                    </label>
                    <input
                      type="date"
                      value={sanctionForm.dataInicio}
                      onChange={(e) => setSanctionForm((f) => ({ ...f, dataInicio: e.target.value }))}
                      required
                      className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">
                      Data de fim (opcional)
                    </label>
                    <input
                      type="date"
                      value={sanctionForm.dataFim}
                      onChange={(e) => setSanctionForm((f) => ({ ...f, dataFim: e.target.value }))}
                      className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Em branco = sem prazo definido (art. 156)</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">
                      Referência legal
                    </label>
                    <input
                      type="text"
                      value={sanctionForm.referenciaLegal}
                      onChange={(e) => setSanctionForm((f) => ({ ...f, referenciaLegal: e.target.value }))}
                      className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
                      placeholder="Ex.: Lei 14.133/21, art. 155, III"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">
                      Observações
                    </label>
                    <textarea
                      value={sanctionForm.observacoes}
                      onChange={(e) => setSanctionForm((f) => ({ ...f, observacoes: e.target.value }))}
                      rows={2}
                      className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-900 resize-none"
                      placeholder="Motivo, fontes (CEIS, CNEP) e responsável pelo registro"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={14} className="text-blue-800" />
                  <p className="text-xs text-gray-600">
                    Fornecedores com sanção ativa bloqueiam alertas em orçamentos que
                    incluam produtos deles. A decisão final de participar cabe ao cliente.
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={createSanctionMutation.isPending}
                  className="flex items-center gap-2 bg-blue-800 text-white px-5 py-2 text-sm font-semibold hover:bg-blue-900 transition-colors disabled:opacity-50"
                >
                  <Check size={14} />
                  Registrar sanção
                </button>
              </form>
            )}
          </div>
        );
      })()}

      {/* Suppliers list */}
      {isLoading ? (
        <div className="py-12 text-center">
          <div className="w-6 h-1 bg-gray-200 mx-auto mb-3 animate-pulse" />
          <p className="text-xs text-gray-400">Carregando...</p>
        </div>
      ) : suppliers && suppliers.length > 0 ? (
        <div className="border border-gray-200">
          <table className="its-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Código</th>
                <th>Contato</th>
                <th>E-mail</th>
                <th>Telefone</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="font-semibold text-xs text-gray-900">{s.name}</div>
                  </td>
                  <td>
                    <span className="inline-block px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700">
                      {s.isActive === "yes" ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="text-xs text-gray-500">
                    {new Date(s.createdAt).toLocaleDateString("pt-BR")}
                  </td>
                  <td>
                    <button
                      onClick={() => {
                        if (selectedSupplierId === s.id) {
                          setSelectedSupplierId(null);
                          setShowSanctionForm(false);
                          return;
                        }
                        setSelectedSupplierId(s.id);
                        setShowSanctionForm(false);
                      }}
                      className={`text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 border transition-colors flex items-center gap-1 ${
                        selectedSupplierId === s.id
                          ? "border-blue-800 text-blue-800 bg-blue-50"
                          : "border-gray-200 text-gray-500"
                      }`}
                      title="Sanções (Lei 14.133/21)"
                    >
                      <ShieldAlert size={10} />
                      Sanções
                    </button>
                    <button
                      onClick={() =>
                        toggleActiveMutation.mutate({
                          id: s.id,
                          isActive: s.isActive === "yes" ? "no" : "yes",
                        })
                      }
                      className={`text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 border transition-colors ${
                        s.isActive === "yes"
                          ? "border-green-300 text-green-700 bg-green-50"
                          : "border-gray-200 text-gray-400"
                      }`}
                    >
                      {s.isActive === "yes" ? "Ativo" : "Inativo"}
                    </button>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEdit(s)}
                        className="text-gray-300 hover:text-gray-900 transition-colors"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={async () => {
                          const ok = await confirm({
                            title: `Excluir fornecedor "${s.name}"?`,
                            description: "Todos os produtos deste fornecedor serão removidos do catálogo, junto com seus preços. Esta ação não pode ser desfeita.",
                            confirmLabel: "Excluir",
                          });
                          if (ok) deleteMutation.mutate({ id: s.id });
                        }}
                        className="text-gray-300 hover:text-blue-800 transition-colors"
                      >
                        <X size={12} />
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
          <Building2 size={24} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400">
            Nenhum fornecedor cadastrado. Clique em "Novo Fornecedor" para começar.
          </p>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
