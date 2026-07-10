import { trpc } from "@/lib/trpc";
import { Building2, Check, Pencil, Plus, X } from "lucide-react";
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
                        onClick={() => {
                          if (confirm(`Excluir fornecedor "${s.name}"? Todos os produtos serão removidos.`))
                            deleteMutation.mutate({ id: s.id });
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
    </div>
  );
}
