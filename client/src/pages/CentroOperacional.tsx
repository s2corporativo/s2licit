import { useState } from "react";
import { usePermission } from "@/components/RequireAuth";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardCheck,
  Gauge,
  Loader2,
  PackageSearch,
  Plus,
  RefreshCw,
  Save,
  Scale,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

type Tab = "prontidao" | "certificacoes" | "ranking" | "contratos" | "decisao";
type ChecklistItem = { key: string; label: string; passed: boolean; details?: string };
type RiskChoice = "low" | "medium" | "high";
type ContractStatus = "draft" | "active" | "suspended" | "expired" | "closed" | "cancelled";
type DecisionMetrics = {
  marginPercent: number;
  supplierCoveragePercent: number;
  documentationReadinessPercent: number;
  deliveryConfidencePercent: number;
  workingCapitalCoveragePercent: number;
  competitionLevel: RiskChoice;
  legalRisk: RiskChoice;
  taxRisk: RiskChoice;
  operationalRisk: RiskChoice;
};
type DecisionResult = {
  recommendation: "go" | "caution" | "no_go";
  score: number;
  blockers: string[];
  reasons: string[];
  actions: string[];
};

const INPUT = "w-full border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500";

const DEFAULT_CHECKLISTS: Record<"supplier" | "portal", ChecklistItem[]> = {
  supplier: [
    { key: "login", label: "Login e sessão validados", passed: false },
    { key: "catalog", label: "Catálogo completo e paginação testados", passed: false },
    { key: "price", label: "Preço normal e promocional conferidos", passed: false },
    { key: "stock", label: "Estoque e disponibilidade conferidos", passed: false },
    { key: "identity", label: "Código, EAN, unidade e embalagem conferidos", passed: false },
    { key: "images", label: "Imagens e links de origem conferidos", passed: false },
    { key: "idempotency", label: "Nova captura não cria duplicidades", passed: false },
    { key: "evidence", label: "Falhas geram evidência e alerta", passed: false },
  ],
  portal: [
    { key: "login", label: "Login, sessão e permissões validados", passed: false },
    { key: "captcha", label: "CAPTCHA/2FA interrompe para ação humana", passed: false },
    { key: "fields", label: "Campos e unidades da proposta mapeados", passed: false },
    { key: "values", label: "Valores unitário e total conferidos", passed: false },
    { key: "terms", label: "Frete, validade e prazo de entrega conferidos", passed: false },
    { key: "attachments", label: "Anexos obrigatórios conferidos", passed: false },
    { key: "confirmation", label: "Envio exige confirmação humana", passed: false },
    { key: "protocol", label: "Protocolo e evidência final registrados", passed: false },
  ],
};

function initialTab(): Tab {
  const value = new URLSearchParams(window.location.search).get("tab");
  return ["prontidao", "certificacoes", "ranking", "contratos", "decisao"].includes(value ?? "")
    ? value as Tab
    : "prontidao";
}

function formatBRL(value: number | string | null | undefined): string {
  return Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: unknown): string {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("pt-BR");
}

function StatusBadge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold ${ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      {children}
    </span>
  );
}

export default function CentroOperacional() {
  const isAdmin = usePermission("admin");
  const [tab, setTab] = useState<Tab>(initialTab);
  const tabs: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
    { id: "prontidao", label: "Prontidão", icon: Gauge },
    { id: "certificacoes", label: "Certificações", icon: BadgeCheck },
    { id: "ranking", label: "Ranking", icon: BarChart3 },
    { id: "contratos", label: "Contratos", icon: BriefcaseBusiness },
    { id: "decisao", label: "Decisão executiva", icon: Scale },
  ];

  const changeTab = (next: Tab) => {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState({}, "", url);
  };

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-5 flex items-start gap-3">
        <Activity className="mt-0.5 h-7 w-7 text-blue-700" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Central Operacional</h1>
          <p className="text-sm text-gray-500">Prontidão, certificações, custos, contratos e decisão GO/NO-GO em um único fluxo.</p>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2 border-b border-gray-200 pb-3">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => changeTab(id)} className={`flex items-center gap-2 rounded px-3 py-2 text-sm font-semibold ${tab === id ? "bg-blue-700 text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "prontidao" && <ReadinessTab isAdmin={isAdmin} />}
      {tab === "certificacoes" && <CertificationsTab />}
      {tab === "ranking" && <RankingTab />}
      {tab === "contratos" && <ContractsTab />}
      {tab === "decisao" && <DecisionTab />}
    </div>
  );
}

function ReadinessTab({ isAdmin }: { isAdmin: boolean }) {
  const utils = trpc.useUtils();
  const summary = trpc.operationalGovernance.summary.useQuery(undefined, { refetchInterval: 60_000 });
  const pricing = trpc.operationalGovernance.pricingIntegrity.useQuery(undefined, { enabled: isAdmin });
  const reconcile = trpc.operationalGovernance.reconcileCanonicalOffers.useMutation({
    onSuccess: async ({ affectedRows }) => {
      toast.success(`Reconciliação concluída: ${affectedRows} registro(s) afetado(s).`);
      await Promise.all([
        utils.operationalGovernance.pricingIntegrity.invalidate(),
        utils.operationalGovernance.summary.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });

  if (summary.isLoading) return <Loading />;
  if (summary.error || !summary.data) return <ErrorState message={summary.error?.message ?? "Não foi possível avaliar a prontidão."} />;
  const { metrics, integrations, blockers, ready } = summary.data;
  const cards = [
    ["Fornecedores ativos", metrics.activeSuppliers],
    ["Capturas configuradas", metrics.configuredScrapers],
    ["Custos canônicos", metrics.productsWithCanonicalCost],
    ["Portais com credencial", metrics.activePortalCredentials],
    ["Certificações aprovadas", metrics.approvedCertifications],
    ["Contratos ativos", metrics.activeContracts],
  ] as const;

  return (
    <div className="space-y-5">
      <section className={`border p-5 ${ready ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
        <div className="flex items-center gap-3">
          {ready ? <CheckCircle2 className="h-7 w-7 text-emerald-700" /> : <ShieldAlert className="h-7 w-7 text-amber-700" />}
          <div><h2 className="font-bold text-gray-900">{ready ? "Sistema operacionalmente pronto" : "Existem bloqueios de prontidão"}</h2><p className="text-sm text-gray-600">Atualizado em {new Date(summary.data.checkedAt).toLocaleString("pt-BR")}.</p></div>
        </div>
        {blockers.length > 0 && <ul className="mt-4 grid gap-2 md:grid-cols-2">{blockers.map((blocker) => <li key={blocker} className="flex items-start gap-2 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{blocker}</li>)}</ul>}
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{cards.map(([label, value]) => <Metric key={label} label={label} value={value} />)}</div>

      <section className="border border-gray-200 bg-white p-5">
        <h2 className="mb-3 font-bold text-gray-900">Integrações essenciais</h2>
        <div className="flex flex-wrap gap-2">
          <StatusBadge ok={integrations.ai}>Inteligência artificial</StatusBadge>
          <StatusBadge ok={integrations.email}>E-mail</StatusBadge>
          <StatusBadge ok={integrations.whatsapp}>WhatsApp</StatusBadge>
          <StatusBadge ok={integrations.secureCookies}>Cookies seguros</StatusBadge>
          <StatusBadge ok={metrics.tosPending === 0}>Termos dos fornecedores</StatusBadge>
          <StatusBadge ok={metrics.failedScrapers === 0}>Capturas sem falha</StatusBadge>
          <StatusBadge ok={metrics.pendingCertifications === 0}>Certificações válidas</StatusBadge>
          <StatusBadge ok={metrics.contractsExpiring === 0}>Contratos sem vencimento próximo</StatusBadge>
        </div>
      </section>

      {isAdmin && (
        <section className="border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-bold text-gray-900">Integridade das fontes de custo</h2><p className="text-sm text-gray-500">Fonte canônica: ofertas por fornecedor; tabela anterior em dual-write transitório.</p></div>
            <button onClick={() => reconcile.mutate()} disabled={reconcile.isPending} className="flex items-center gap-2 bg-blue-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {reconcile.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Reconciliar agora
            </button>
          </div>
          {pricing.data && <div className="mt-4 grid gap-3 sm:grid-cols-4"><Metric label="Registros legados" value={pricing.data.legacyRows} /><Metric label="Somente no legado" value={pricing.data.legacyOnly} danger={pricing.data.legacyOnly > 0} /><Metric label="Divergentes" value={pricing.data.divergent} danger={pricing.data.divergent > 0} /><Metric label="Somente nas ofertas" value={pricing.data.offersOnly} /></div>}
        </section>
      )}
    </div>
  );
}

function CertificationsTab() {
  const utils = trpc.useUtils();
  const certifications = trpc.operationalGovernance.listCertifications.useQuery();
  const [entityType, setEntityType] = useState<"supplier" | "portal">("supplier");
  const [entityName, setEntityName] = useState("");
  const [status, setStatus] = useState<"pending" | "approved" | "failed" | "expired">("pending");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [checklist, setChecklist] = useState<ChecklistItem[]>(DEFAULT_CHECKLISTS.supplier);
  const allPassed = checklist.every((item) => item.passed);

  const save = trpc.operationalGovernance.saveCertification.useMutation({
    onSuccess: async () => {
      toast.success("Certificação registrada.");
      setEntityName(""); setStatus("pending"); setValidUntil(""); setNotes("");
      setChecklist(DEFAULT_CHECKLISTS[entityType].map((item) => ({ ...item, passed: false })));
      await Promise.all([utils.operationalGovernance.listCertifications.invalidate(), utils.operationalGovernance.summary.invalidate()]);
    },
    onError: (error) => toast.error(error.message),
  });

  const changeType = (value: "supplier" | "portal") => {
    setEntityType(value);
    setChecklist(DEFAULT_CHECKLISTS[value].map((item) => ({ ...item })));
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
      <section className="border border-gray-200 bg-white p-5">
        <h2 className="mb-4 font-bold text-gray-900">Nova certificação operacional</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tipo"><select value={entityType} onChange={(event) => changeType(event.target.value as "supplier" | "portal")} className={INPUT}><option value="supplier">Fornecedor</option><option value="portal">Portal de licitação</option></select></Field>
          <Field label="Status"><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className={INPUT}><option value="pending">Pendente</option><option value="approved">Aprovado</option><option value="failed">Falhou</option><option value="expired">Expirado</option></select></Field>
        </div>
        <Field label="Nome"><input value={entityName} onChange={(event) => setEntityName(event.target.value)} className={INPUT} placeholder="Ex.: Tambasa ou Compras MG" /></Field>
        <Field label="Válida até"><input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} className={INPUT} /></Field>
        <div className="my-4 space-y-2">{checklist.map((item, index) => <label key={item.key} className="flex cursor-pointer items-start gap-3 border border-gray-100 p-2.5 hover:bg-gray-50"><input type="checkbox" checked={item.passed} onChange={(event) => setChecklist((current) => current.map((entry, currentIndex) => currentIndex === index ? { ...entry, passed: event.target.checked } : entry))} className="mt-0.5" /><span className="text-sm text-gray-700">{item.label}</span></label>)}</div>
        <Field label="Observações"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} className={`${INPUT} min-h-20`} /></Field>
        {status === "approved" && !allPassed && <p className="mb-3 flex items-center gap-2 text-xs text-amber-700"><AlertTriangle className="h-4 w-4" />Aprovação exige todos os itens conferidos.</p>}
        <button onClick={() => save.mutate({ entityType, entityName: entityName.trim(), status, checklist, validUntil: validUntil || undefined, notes: notes || undefined })} disabled={save.isPending || entityName.trim().length < 2 || (status === "approved" && !allPassed)} className="flex items-center gap-2 bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar certificação</button>
      </section>

      <section className="border border-gray-200 bg-white p-5">
        <h2 className="mb-4 font-bold text-gray-900">Certificações registradas</h2>
        {certifications.isLoading ? <Loading /> : certifications.data?.length ? <div className="space-y-3">{certifications.data.map((certification) => {
          const items = Array.isArray(certification.checklist) ? certification.checklist as ChecklistItem[] : [];
          const passed = items.filter((item) => item.passed).length;
          return <div key={certification.id} className="border border-gray-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-semibold text-gray-900">{String(certification.entityName)}</div><div className="text-xs text-gray-500">{certification.entityType === "supplier" ? "Fornecedor" : "Portal"} · {passed}/{items.length} verificações</div></div><StatusBadge ok={certification.status === "approved"}>{String(certification.status)}</StatusBadge></div><div className="mt-2 text-xs text-gray-500">Último teste: {formatDate(certification.lastTestedAt)} · validade: {formatDate(certification.validUntil)}</div></div>;
        })}</div> : <EmptyState text="Nenhuma integração certificada." />}
      </section>
    </div>
  );
}

function RankingTab() {
  const [productId, setProductId] = useState("");
  const numericId = Number(productId);
  const ranking = trpc.operationalGovernance.rankSuppliers.useQuery({ productId: numericId }, { enabled: Number.isInteger(numericId) && numericId > 0 });
  return (
    <section className="border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-start gap-3"><PackageSearch className="h-6 w-6 text-blue-700" /><div><h2 className="font-bold text-gray-900">Ranking de fornecedores por produto</h2><p className="text-sm text-gray-500">Preço, estoque, atualização e confiabilidade avaliados em conjunto.</p></div></div>
      <Field label="ID do produto"><input type="number" min="1" value={productId} onChange={(event) => setProductId(event.target.value)} className={`${INPUT} max-w-xs`} /></Field>
      {ranking.isLoading && <Loading />}{ranking.error && <ErrorState message={ranking.error.message} />}
      {ranking.data?.length ? <div className="overflow-x-auto"><table className="w-full border-collapse text-sm"><thead><tr className="border-b text-left text-xs uppercase text-gray-500"><th className="p-2">Posição</th><th className="p-2">Fornecedor</th><th className="p-2">Custo</th><th className="p-2">Score</th><th className="p-2">Alertas</th></tr></thead><tbody>{ranking.data.map((entry) => <tr key={entry.offerId} className="border-b border-gray-100"><td className="p-2 font-black text-blue-700">#{entry.rank}</td><td className="p-2 font-semibold">{entry.supplierName}</td><td className="p-2">{entry.effectivePrice == null ? "—" : formatBRL(entry.effectivePrice)}</td><td className="p-2">{entry.score.toFixed(2)}</td><td className="p-2 text-xs text-amber-700">{entry.warnings.join(" · ") || "Sem alertas"}</td></tr>)}</tbody></table></div> : numericId > 0 && !ranking.isLoading ? <EmptyState text="Nenhuma oferta encontrada." /> : null}
    </section>
  );
}

function ContractsTab() {
  const utils = trpc.useUtils();
  const contracts = trpc.operationalGovernance.listContracts.useQuery();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{ orgao: string; numeroContrato: string; objeto: string; valorContratado: string; saldoContratual: string; inicioVigencia: string; fimVigencia: string; dataBaseReajuste: string; indiceReajuste: string; garantiaVencimento: string; status: ContractStatus }>({ orgao: "", numeroContrato: "", objeto: "", valorContratado: "", saldoContratual: "", inicioVigencia: "", fimVigencia: "", dataBaseReajuste: "", indiceReajuste: "", garantiaVencimento: "", status: "draft" });
  const save = trpc.operationalGovernance.saveContract.useMutation({
    onSuccess: async () => {
      toast.success("Contrato salvo."); setShowForm(false);
      setForm({ orgao: "", numeroContrato: "", objeto: "", valorContratado: "", saldoContratual: "", inicioVigencia: "", fimVigencia: "", dataBaseReajuste: "", indiceReajuste: "", garantiaVencimento: "", status: "draft" });
      await Promise.all([utils.operationalGovernance.listContracts.invalidate(), utils.operationalGovernance.summary.invalidate()]);
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="space-y-5">
      <div className="flex justify-end"><button onClick={() => setShowForm((value) => !value)} className="flex items-center gap-2 bg-blue-700 px-4 py-2 text-sm font-semibold text-white">{showForm ? <XCircle className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{showForm ? "Fechar" : "Novo contrato"}</button></div>
      {showForm && <section className="border border-gray-200 bg-white p-5"><h2 className="mb-4 font-bold">Cadastrar contrato</h2><div className="grid gap-3 md:grid-cols-2">
        <Field label="Órgão"><input value={form.orgao} onChange={(event) => setForm({ ...form, orgao: event.target.value })} className={INPUT} /></Field><Field label="Número"><input value={form.numeroContrato} onChange={(event) => setForm({ ...form, numeroContrato: event.target.value })} className={INPUT} /></Field>
        <Field label="Valor contratado"><input type="number" step="0.01" value={form.valorContratado} onChange={(event) => setForm({ ...form, valorContratado: event.target.value })} className={INPUT} /></Field><Field label="Saldo"><input type="number" step="0.01" value={form.saldoContratual} onChange={(event) => setForm({ ...form, saldoContratual: event.target.value })} className={INPUT} /></Field>
        <Field label="Início"><input type="date" value={form.inicioVigencia} onChange={(event) => setForm({ ...form, inicioVigencia: event.target.value })} className={INPUT} /></Field><Field label="Fim"><input type="date" value={form.fimVigencia} onChange={(event) => setForm({ ...form, fimVigencia: event.target.value })} className={INPUT} /></Field>
        <Field label="Data-base do reajuste"><input type="date" value={form.dataBaseReajuste} onChange={(event) => setForm({ ...form, dataBaseReajuste: event.target.value })} className={INPUT} /></Field><Field label="Índice"><input value={form.indiceReajuste} onChange={(event) => setForm({ ...form, indiceReajuste: event.target.value })} className={INPUT} /></Field>
        <Field label="Garantia até"><input type="date" value={form.garantiaVencimento} onChange={(event) => setForm({ ...form, garantiaVencimento: event.target.value })} className={INPUT} /></Field><Field label="Status"><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ContractStatus })} className={INPUT}><option value="draft">Rascunho</option><option value="active">Ativo</option><option value="suspended">Suspenso</option><option value="expired">Vencido</option><option value="closed">Encerrado</option><option value="cancelled">Cancelado</option></select></Field>
      </div><Field label="Objeto"><textarea value={form.objeto} onChange={(event) => setForm({ ...form, objeto: event.target.value })} className={`${INPUT} min-h-20`} /></Field>
      <button onClick={() => save.mutate({ orgao: form.orgao.trim(), numeroContrato: form.numeroContrato.trim(), objeto: form.objeto || undefined, valorContratado: Number(form.valorContratado || 0), saldoContratual: Number(form.saldoContratual || 0), inicioVigencia: form.inicioVigencia || undefined, fimVigencia: form.fimVigencia || undefined, dataBaseReajuste: form.dataBaseReajuste || undefined, indiceReajuste: form.indiceReajuste || undefined, garantiaVencimento: form.garantiaVencimento || undefined, status: form.status })} disabled={save.isPending || form.orgao.trim().length < 2 || !form.numeroContrato.trim()} className="flex items-center gap-2 bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar contrato</button></section>}
      <section className="border border-gray-200 bg-white p-5"><h2 className="mb-4 font-bold">Ciclo contratual</h2>{contracts.isLoading ? <Loading /> : contracts.data?.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs uppercase text-gray-500"><th className="p-2">Contrato</th><th className="p-2">Órgão</th><th className="p-2">Valor</th><th className="p-2">Saldo</th><th className="p-2">Vigência</th><th className="p-2">Status</th></tr></thead><tbody>{contracts.data.map((contract) => <tr key={contract.id} className="border-b border-gray-100"><td className="p-2 font-semibold">{String(contract.numeroContrato)}</td><td className="p-2">{String(contract.orgao)}</td><td className="p-2">{formatBRL(contract.valorContratado)}</td><td className="p-2">{formatBRL(contract.saldoContratual)}</td><td className="p-2">{formatDate(contract.inicioVigencia)} a {formatDate(contract.fimVigencia)}{contract.daysToExpire != null && Number(contract.daysToExpire) <= 45 ? <div className="text-xs font-semibold text-amber-700">{Number(contract.daysToExpire)} dia(s)</div> : null}</td><td className="p-2"><StatusBadge ok={contract.status === "active"}>{String(contract.status)}</StatusBadge></td></tr>)}</tbody></table></div> : <EmptyState text="Nenhum contrato cadastrado." />}</section>
    </div>
  );
}

function DecisionTab() {
  const [opportunityId, setOpportunityId] = useState("");
  const [metrics, setMetrics] = useState<DecisionMetrics>({ marginPercent: 15, supplierCoveragePercent: 80, documentationReadinessPercent: 80, deliveryConfidencePercent: 80, workingCapitalCoveragePercent: 80, competitionLevel: "medium", legalRisk: "medium", taxRisk: "medium", operationalRisk: "medium" });
  const [result, setResult] = useState<DecisionResult | null>(null);
  const numericId = Number(opportunityId);
  const evaluate = trpc.operationalGovernance.evaluateOpportunity.useMutation({ onSuccess: (data) => { setResult(data); toast.success("Avaliação executiva registrada."); }, onError: (error) => toast.error(error.message) });
  const history = trpc.operationalGovernance.assessmentHistory.useQuery({ opportunityId: numericId }, { enabled: Number.isInteger(numericId) && numericId > 0 });

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="border border-gray-200 bg-white p-5"><h2 className="mb-1 font-bold">Avaliar oportunidade</h2><p className="mb-4 text-sm text-gray-500">A recomendação é explicável e não substitui a decisão humana no Funil.</p><Field label="ID da oportunidade"><input type="number" min="1" value={opportunityId} onChange={(event) => setOpportunityId(event.target.value)} className={INPUT} /></Field><div className="grid gap-3 sm:grid-cols-2">
        <NumberField label="Margem projetada (%)" value={metrics.marginPercent} onChange={(value) => setMetrics({ ...metrics, marginPercent: value })} /><NumberField label="Cobertura de fornecedores (%)" value={metrics.supplierCoveragePercent} onChange={(value) => setMetrics({ ...metrics, supplierCoveragePercent: value })} /><NumberField label="Documentação pronta (%)" value={metrics.documentationReadinessPercent} onChange={(value) => setMetrics({ ...metrics, documentationReadinessPercent: value })} /><NumberField label="Confiança na entrega (%)" value={metrics.deliveryConfidencePercent} onChange={(value) => setMetrics({ ...metrics, deliveryConfidencePercent: value })} /><NumberField label="Capital de giro coberto (%)" value={metrics.workingCapitalCoveragePercent} onChange={(value) => setMetrics({ ...metrics, workingCapitalCoveragePercent: value })} />
        <SelectRisk label="Concorrência" value={metrics.competitionLevel} onChange={(value) => setMetrics({ ...metrics, competitionLevel: value })} /><SelectRisk label="Risco jurídico" value={metrics.legalRisk} onChange={(value) => setMetrics({ ...metrics, legalRisk: value })} /><SelectRisk label="Risco tributário" value={metrics.taxRisk} onChange={(value) => setMetrics({ ...metrics, taxRisk: value })} /><SelectRisk label="Risco operacional" value={metrics.operationalRisk} onChange={(value) => setMetrics({ ...metrics, operationalRisk: value })} />
      </div><button onClick={() => evaluate.mutate({ opportunityId: numericId, metrics })} disabled={evaluate.isPending || !Number.isInteger(numericId) || numericId <= 0} className="mt-3 flex items-center gap-2 bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{evaluate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}Avaliar e registrar</button></section>
      <section className="border border-gray-200 bg-white p-5"><h2 className="mb-4 font-bold">Resultado</h2>{result ? <div className="space-y-4"><div className={`border p-4 ${result.recommendation === "go" ? "border-emerald-200 bg-emerald-50" : result.recommendation === "caution" ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"}`}><div className="text-xs uppercase text-gray-500">Recomendação</div><div className="text-2xl font-black uppercase">{result.recommendation.replace("_", "-")}</div><div className="text-sm">Score: {result.score.toFixed(2)}/100</div></div><ResultList title="Bloqueios" items={result.blockers} tone="red" /><ResultList title="Fundamentos" items={result.reasons} tone="green" /><ResultList title="Ações" items={result.actions} tone="amber" /></div> : history.data?.length ? <div className="space-y-2">{history.data.map((entry) => <div key={entry.id} className="border border-gray-100 p-3"><div className="flex justify-between"><span className="font-semibold uppercase">{String(entry.recommendation).replace("_", "-")}</span><span className="font-black">{Number(entry.score).toFixed(2)}</span></div><div className="text-xs text-gray-500">{formatDate(entry.createdAt)} · {String(entry.createdBy ?? "sistema")}</div></div>)}</div> : <EmptyState text="Informe a oportunidade e execute a avaliação." />}</section>
    </div>
  );
}

function Loading() { return <div className="p-8 text-center text-gray-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>; }
function ErrorState({ message }: { message: string }) { return <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-700">{message}</div>; }
function EmptyState({ text }: { text: string }) { return <div className="border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">{text}</div>; }
function Metric({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) { return <div className={`border p-3 ${danger ? "border-red-200 bg-red-50" : "border-gray-200 bg-white"}`}><div className="text-xs text-gray-500">{label}</div><div className={`text-xl font-black ${danger ? "text-red-700" : "text-gray-900"}`}>{value}</div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="mb-3 block"><span className="mb-1 block text-xs font-semibold text-gray-600">{label}</span>{children}</label>; }
function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <Field label={label}><input type="number" step="0.01" min="0" max="100" value={value} onChange={(event) => onChange(Number(event.target.value))} className={INPUT} /></Field>; }
function SelectRisk({ label, value, onChange }: { label: string; value: RiskChoice; onChange: (value: RiskChoice) => void }) { return <Field label={label}><select value={value} onChange={(event) => onChange(event.target.value as RiskChoice)} className={INPUT}><option value="low">Baixo</option><option value="medium">Médio</option><option value="high">Alto</option></select></Field>; }
function ResultList({ title, items, tone }: { title: string; items: string[]; tone: "red" | "green" | "amber" }) { const classes = tone === "red" ? "border-red-200 bg-red-50 text-red-800" : tone === "green" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"; return items.length ? <div className={`border p-3 ${classes}`}><div className="mb-1 text-xs font-bold uppercase">{title}</div><ul className="space-y-1 text-sm">{items.map((item) => <li key={item}>• {item}</li>)}</ul></div> : null; }
