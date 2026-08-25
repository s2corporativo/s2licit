import { trpc } from "@/lib/trpc";
import { useConfirm } from "@/hooks/useConfirm";
import { useAuth } from "@/_core/hooks/useAuth";
import { hasMinimumRole } from "@/lib/access";
import { AlertTriangle, Building2, Check, FileCheck, Pencil, Plus, ShieldAlert, X } from "lucide-react";
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
  abrangencia: "" | "municipal" | "estadual" | "federal" | "nacional";
  arquivoUrl: string;
};

const emptySanctionForm: SanctionForm = {
  orgao: "",
  processo: "",
  penalidade: "advertencia",
  dataInicio: "",
  dataFim: "",
  referenciaLegal: "",
  observacoes: "",
  abrangencia: "",
  arquivoUrl: "",
};

type CertidaoForm = {
  tipo: string;
  orgaoEmissor: string;
  numero: string;
  dataValidade: string;
};

const emptyCertidaoForm: CertidaoForm = {
  tipo: "",
  orgaoEmissor: "",
  numero: "",
  dataValidade: "",
};

function diasAte(dataValidade: string): number {
  const ms = new Date(dataValidade).getTime() - Date.now();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export default function Fornecedores() {
  const { confirm, confirmDialog } = useConfirm();
  const { user } = useAuth();
  // certidoes.create/remove são adminProcedure — sem isso, editor vê os
  // controles e recebe FORBIDDEN garantido ao usar.
  const isAdmin = hasMinimumRole(user?.role, "admin");
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [showSanctionForm, setShowSanctionForm] = useState(false);
  const [sanctionForm, setSanctionForm] = useState<SanctionForm>(emptySanctionForm);
  const [showCertidaoForm, setShowCertidaoForm] = useState(false);
  const [certidaoForm, setCertidaoForm] = useState<CertidaoForm>(emptyCertidaoForm);

  const { data: suppliers, isLoading } = trpc.suppliers.list.useQuery({ activeOnly: false });
  const sanctionsListQuery = trpc.sanctions.list.useQuery(
    { supplierId: selectedSupplierId ?? undefined },
    { enabled: selectedSupplierId != null },
  );
  const certidoesQuery = trpc.certidoes.bySupplier.useQuery(
    { supplierId: selectedSupplierId ?? 0 },
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
  const createCertidaoMutation = trpc.certidoes.create.useMutation({
    onSuccess: () => {
      utils.certidoes.bySupplier.invalidate();
      utils.certidoes.alertas.invalidate();
      setShowCertidaoForm(false);
      setCertidaoForm(emptyCertidaoForm);
    },
    onError: (e) => alert(e.message),
  });
  const removeCertidaoMutation = trpc.certidoes.remove.useMutation({
    onSuccess: () => {
      utils.certidoes.bySupplier.invalidate();
      utils.certidoes.alertas.invalidate();
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
      abrangencia: sanctionForm.abrangencia || null,
      arquivoUrl: sanctionForm.arquivoUrl.trim() || null,
    });
  };

  const handleSubmitCertidao = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId || !certidaoForm.tipo.trim() || !certidaoForm.dataValidade) return;
    createCertidaoMutation.mutate({
      supplierId: selectedSupplierId,
      tipo: certidaoForm.tipo.trim(),
      orgaoEmissor: certidaoForm.orgaoEmissor.trim() || null,
      numero: certidaoForm.numero.trim() || null,
      dataValidade: certidaoForm.dataValidade,
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
            Contatos, situação cadastral, sanções e regularidade fiscal dos fornecedores usados nas cotações.
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
                      {sanction.abrangencia ? ` · Abrangência: ${String(sanction.abrangencia).toUpperCase()}` : ""}
                    </div>
                    <div className="mt-1 text-gray-400">
                      {new Date(sanction.dataInicio).toLocaleDateString("pt-BR")}
                      {sanction.dataFim ? ` → ${new Date(sanction.dataFim).toLocaleDateString("pt-BR")}` : " → sem prazo definido"}
                    </div>
                    {sanction.observacoes && <div className="mt-1 italic text-gray-500">{sanction.observacoes}</div>}
                    {sanction.arquivoUrl && (
                      <div className="mt-1">
                        <a
                          href={sanction.arquivoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-800 underline"
                        >
                          Documento comprobatório
                        </a>
                      </div>
                    )}
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
                <Field label="Abrangência">
                  <select
                    value={sanctionForm.abrangencia}
                    onChange={(e) => setSanctionForm((current) => ({ ...current, abrangencia: e.target.value as SanctionForm["abrangencia"] }))}
                    className="w-full border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                  >
                    <option value="">Não informada</option>
                    <option value="municipal">Municipal</option>
                    <option value="estadual">Estadual</option>
                    <option value="federal">Federal</option>
                    <option value="nacional">Nacional (toda a Administração Pública)</option>
                  </select>
                </Field>
                <Field label="Documento comprobatório (URL)">
                  <input
                    value={sanctionForm.arquivoUrl}
                    onChange={(e) => setSanctionForm((current) => ({ ...current, arquivoUrl: e.target.value }))}
                    className="w-full border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                    placeholder="https://..."
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

      {selectedSupplierId != null && (
        <div className="mb-6 border border-gray-900 p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-black text-gray-900">
              <FileCheck size={15} /> Regularidade Fiscal — {selectedSupplier?.name ?? "Fornecedor"}
            </h2>
          </div>

          {certidoesQuery.isLoading ? (
            <p className="text-xs text-gray-400">Carregando certidões...</p>
          ) : certidoesQuery.data?.length ? (
            <div className="mb-4 space-y-2">
              {certidoesQuery.data.map((certidao) => {
                const dias = diasAte(certidao.dataValidade as unknown as string);
                const situacao = dias < 0
                  ? { label: "Vencida", boxCls: "border-red-200 bg-red-50", textCls: "text-red-700" }
                  : dias <= 30
                    ? { label: `Vence em ${dias}d`, boxCls: "border-amber-200 bg-amber-50", textCls: "text-amber-700" }
                    : { label: "Válida", boxCls: "border-green-200 bg-green-50", textCls: "text-green-700" };
                return (
                  <div
                    key={certidao.id}
                    className={`flex items-start justify-between gap-3 border px-4 py-3 ${situacao.boxCls}`}
                  >
                    <div className="text-xs">
                      <div className="font-bold text-gray-900">{certidao.tipo}</div>
                      <div className="mt-1 text-gray-600">
                        {certidao.orgaoEmissor || "—"}{certidao.numero ? ` · Nº ${certidao.numero}` : ""}
                      </div>
                      <div className={`mt-1 font-semibold ${situacao.textCls}`}>
                        {situacao.label} ({new Date(certidao.dataValidade).toLocaleDateString("pt-BR")})
                      </div>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={async () => {
                          const ok = await confirm({
                            title: "Remover esta certidão?",
                            description: "A certidão será desativada e sairá da lista de regularidade fiscal do fornecedor.",
                            confirmLabel: "Remover",
                          });
                          if (ok) removeCertidaoMutation.mutate({ id: certidao.id });
                        }}
                        className="shrink-0 text-gray-400 hover:text-red-600"
                        aria-label={`Remover certidão ${certidao.tipo}`}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mb-4 text-xs text-gray-400">Nenhuma certidão cadastrada para este fornecedor.</p>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowCertidaoForm((value) => !value)}
              className="mb-3 flex items-center gap-2 bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
            >
              <Plus size={14} /> {showCertidaoForm ? "Cancelar" : "Adicionar certidão"}
            </button>
          )}

          {isAdmin && showCertidaoForm && (
            <form onSubmit={handleSubmitCertidao} className="border-t border-gray-200 pt-4">
              <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Tipo *" className="md:col-span-2">
                  <input
                    value={certidaoForm.tipo}
                    onChange={(e) => setCertidaoForm((current) => ({ ...current, tipo: e.target.value }))}
                    placeholder="Ex: CND Federal, FGTS, Trabalhista"
                    required
                    className="w-full border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                  />
                </Field>
                <Field label="Órgão emissor">
                  <input
                    value={certidaoForm.orgaoEmissor}
                    onChange={(e) => setCertidaoForm((current) => ({ ...current, orgaoEmissor: e.target.value }))}
                    className="w-full border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                  />
                </Field>
                <Field label="Número">
                  <input
                    value={certidaoForm.numero}
                    onChange={(e) => setCertidaoForm((current) => ({ ...current, numero: e.target.value }))}
                    className="w-full border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                  />
                </Field>
                <Field label="Data de validade *">
                  <input
                    type="date"
                    value={certidaoForm.dataValidade}
                    onChange={(e) => setCertidaoForm((current) => ({ ...current, dataValidade: e.target.value }))}
                    required
                    className="w-full border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                  />
                </Field>
              </div>
              <button
                type="submit"
                disabled={createCertidaoMutation.isPending}
                className="flex items-center gap-2 bg-blue-800 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-900 disabled:opacity-50"
              >
                <Check size={14} /> Adicionar certidão
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
                        setShowCertidaoForm(false);
                        setCertidaoForm(emptyCertidaoForm);
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
