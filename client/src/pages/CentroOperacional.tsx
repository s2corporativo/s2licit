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
} from "lucide-react";
import { toast } from "sonner";

type Tab = "prontidao" | "certificacoes" | "ranking" | "contratos" | "decisao";
type RiskChoice = "low" | "medium" | "high";
type CertificationStatus = "pending" | "approved" | "failed" | "expired";
type ContractStatus = "draft" | "active" | "suspended" | "expired" | "closed" | "cancelled";
type ChecklistItem = { key: string; label: string; passed: boolean; details?: string };

type CertificationRow = {
  id: number;
  entityId: number | null;
  entityType: "supplier" | "portal";
  entityName: string;
  status: CertificationStatus;
  checklist: ChecklistItem[];
  lastTestedAt: string | Date | null;
  validUntil: string | Date | null;
};

type ContractRow = {
  id: number;
  numeroContrato: string;
  orgao: string;
  valorContratado: number;
  saldoContratual: number;
  inicioVigencia: string | Date | null;
  fimVigencia: string | Date | null;
  daysToExpire: number | null;
  status: ContractStatus;
};

type AssessmentRow = {
  id: number;
  recommendation: "go" | "caution" | "no_go";
  score: number;
  createdAt: string | Date;
  createdBy: string | null;
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
        <div><h1 className="text-2xl font-bold">Central Operacional</h1><p className="text-sm text-gray-500">Prontidão, certificações, custos, contratos e decisão GO/NO-GO.</p></div>
      </div>
      <div className="mb-5 flex flex-wrap gap-2 border-b pb-3">
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => changeTab(id)} className={`flex items-center gap-2 rounded px-3 py-2 text-sm font-semibold ${tab === id ? "bg-blue-700 text-white" : "bg-white text-gray-600"}`}><Icon className="h-4 w-4" />{label}</button>)}
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
      toast.success(`Reconciliação concluída: ${affectedRows} registro(s).`);
      await Promise.all([utils.operationalGovernance.pricingIntegrity.invalidate(), utils.operationalGovernance.summary.invalidate()]);
    },
    onError: (error) => toast.error(error.message),
  });
  if (summary.isLoading) return <Loading />;
  if (!summary.data) return <ErrorState message={summary.error?.message ?? "Falha ao avaliar a prontidão."} />;
  const { metrics, integrations, blockers, ready } = summary.data;
  const cards = [
    ["Fornecedores ativos", metrics.activeSuppliers], ["Capturas configuradas", metrics.configuredScrapers],
    ["Custos canônicos", metrics.productsWithCanonicalCost], ["Portais com credencial", metrics.activePortalCredentials],
    ["Certificações aprovadas", metrics.approvedCertifications], ["Contratos ativos", metrics.activeContracts],
  ] as const;
  return <div className="space-y-5">
    <section className={`border p-5 ${ready ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex gap-3">{ready ? <CheckCircle2 className="h-7 w-7 text-emerald-700" /> : <ShieldAlert className="h-7 w-7 text-amber-700" />}<div><h2 className="font-bold">{ready ? "Sistema operacionalmente pronto" : "Existem bloqueios de prontidão"}</h2><p className="text-sm text-gray-600">Atualizado em {new Date(summary.data.checkedAt).toLocaleString("pt-BR")}.</p></div></div>
      {blockers.length > 0 && <ul className="mt-4 grid gap-2 md:grid-cols-2">{blockers.map((item) => <li key={item} className="flex gap-2 text-sm text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" />{item}</li>)}</ul>}
    </section>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{cards.map(([label, value]) => <Metric key={label} label={label} value={value} />)}</div>
    <section className="border bg-white p-5"><h2 className="mb-3 font-bold">Integrações essenciais</h2><div className="flex flex-wrap gap-2"><Status ok={integrations.ai}>IA</Status><Status ok={integrations.email}>E-mail</Status><Status ok={integrations.whatsapp}>WhatsApp</Status><Status ok={integrations.secureCookies}>Cookies seguros</Status><Status ok={metrics.tosPending === 0}>Termos aprovados</Status><Status ok={metrics.failedScrapers === 0}>Capturas sem falha</Status></div></section>
    {isAdmin && <section className="border bg-white p-5"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-bold">Integridade dos custos</h2><p className="text-sm text-gray-500">Fonte canônica: ofertas por fornecedor.</p></div><button onClick={() => reconcile.mutate()} disabled={reconcile.isPending} className="flex items-center gap-2 bg-blue-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{reconcile.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Reconciliar</button></div>{pricing.data && <div className="mt-4 grid gap-3 sm:grid-cols-4"><Metric label="Legado" value={pricing.data.legacyRows} /><Metric label="Somente legado" value={pricing.data.legacyOnly} danger={pricing.data.legacyOnly > 0} /><Metric label="Divergentes" value={pricing.data.divergent} danger={pricing.data.divergent > 0} /><Metric label="Somente ofertas" value={pricing.data.offersOnly} /></div>}</section>}
  </div>;
}

function CertificationsTab() {
  const utils = trpc.useUtils();
  const query = trpc.operationalGovernance.listCertifications.useQuery();
  const rows = (query.data ?? []) as CertificationRow[];
  const [entityType, setEntityType] = useState<"supplier" | "portal">("supplier");
  const [entityName, setEntityName] = useState("");
  const [status, setStatus] = useState<CertificationStatus>("pending");
  const [validUntil, setValidUntil] = useState("");
  const [checklist, setChecklist] = useState<ChecklistItem[]>(DEFAULT_CHECKLISTS.supplier);
  const save = trpc.operationalGovernance.saveCertification.useMutation({
    onSuccess: async () => { toast.success("Certificação registrada."); setEntityName(""); await Promise.all([utils.operationalGovernance.listCertifications.invalidate(), utils.operationalGovernance.summary.invalidate()]); },
    onError: (error) => toast.error(error.message),
  });
  const changeType = (value: "supplier" | "portal") => { setEntityType(value); setChecklist(DEFAULT_CHECKLISTS[value].map((item) => ({ ...item }))); };
  return <div className="grid gap-5 xl:grid-cols-2">
    <section className="border bg-white p-5"><h2 className="mb-4 font-bold">Nova certificação</h2><div className="grid gap-3 sm:grid-cols-2"><Field label="Tipo"><select value={entityType} onChange={(event) => changeType(event.target.value as "supplier" | "portal")} className={INPUT}><option value="supplier">Fornecedor</option><option value="portal">Portal</option></select></Field><Field label="Status"><select value={status} onChange={(event) => setStatus(event.target.value as CertificationStatus)} className={INPUT}><option value="pending">Pendente</option><option value="approved">Aprovado</option><option value="failed">Falhou</option><option value="expired">Expirado</option></select></Field></div><Field label="Nome"><input value={entityName} onChange={(event) => setEntityName(event.target.value)} className={INPUT} /></Field><Field label="Validade"><input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} className={INPUT} /></Field><div className="my-4 space-y-2">{checklist.map((item, index) => <label key={item.key} className="flex gap-3 border p-2 text-sm"><input type="checkbox" checked={item.passed} onChange={(event) => setChecklist((current) => current.map((entry, currentIndex) => currentIndex === index ? { ...entry, passed: event.target.checked } : entry))} />{item.label}</label>)}</div><button disabled={save.isPending || entityName.trim().length < 2 || (status === "approved" && !checklist.every((item) => item.passed))} onClick={() => save.mutate({ entityType, entityName: entityName.trim(), status, checklist, validUntil: validUntil || undefined })} className="flex items-center gap-2 bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />Salvar</button></section>
    <section className="border bg-white p-5"><h2 className="mb-4 font-bold">Certificações registradas</h2>{query.isLoading ? <Loading /> : rows.length ? <div className="space-y-3">{rows.map((row) => <div key={row.id} className="border p-3"><div className="flex justify-between gap-2"><div><div className="font-semibold">{row.entityName}</div><div className="text-xs text-gray-500">{row.entityType === "supplier" ? "Fornecedor" : "Portal"} · {row.checklist.filter((item) => item.passed).length}/{row.checklist.length}</div></div><Status ok={row.status === "approved"}>{row.status}</Status></div><div className="mt-2 text-xs text-gray-500">Teste: {formatDate(row.lastTestedAt)} · validade: {formatDate(row.validUntil)}</div></div>)}</div> : <Empty text="Nenhuma certificação registrada." />}</section>
  </div>;
}

function RankingTab() {
  const [productId, setProductId] = useState("");
  const id = Number(productId);
  const ranking = trpc.operationalGovernance.rankSuppliers.useQuery({ productId: id }, { enabled: Number.isInteger(id) && id > 0 });
  return <section className="border bg-white p-5"><div className="mb-4 flex gap-3"><PackageSearch className="h-6 w-6 text-blue-700" /><div><h2 className="font-bold">Ranking por produto</h2><p className="text-sm text-gray-500">Preço, estoque, atualização e confiabilidade.</p></div></div><Field label="ID do produto"><input type="number" min="1" value={productId} onChange={(event) => setProductId(event.target.value)} className={`${INPUT} max-w-xs`} /></Field>{ranking.isLoading && <Loading />}{ranking.data?.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Posição</th><th className="p-2">Fornecedor</th><th className="p-2">Custo</th><th className="p-2">Score</th><th className="p-2">Alertas</th></tr></thead><tbody>{ranking.data.map((row) => <tr key={row.offerId} className="border-b"><td className="p-2 font-bold text-blue-700">#{row.rank}</td><td className="p-2">{row.supplierName}</td><td className="p-2">{row.effectivePrice == null ? "—" : formatBRL(row.effectivePrice)}</td><td className="p-2">{row.score.toFixed(2)}</td><td className="p-2 text-xs text-amber-700">{row.warnings.join(" · ") || "Sem alertas"}</td></tr>)}</tbody></table></div> : id > 0 && !ranking.isLoading ? <Empty text="Nenhuma oferta encontrada." /> : null}</section>;
}

function ContractsTab() {
  const utils = trpc.useUtils();
  const query = trpc.operationalGovernance.listContracts.useQuery();
  const rows = (query.data ?? []) as ContractRow[];
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ orgao: "", numeroContrato: "", valorContratado: "", saldoContratual: "", inicioVigencia: "", fimVigencia: "", status: "draft" as ContractStatus });
  const save = trpc.operationalGovernance.saveContract.useMutation({ onSuccess: async () => { toast.success("Contrato salvo."); setShow(false); await Promise.all([utils.operationalGovernance.listContracts.invalidate(), utils.operationalGovernance.summary.invalidate()]); }, onError: (error) => toast.error(error.message) });
  return <div className="space-y-5"><div className="flex justify-end"><button onClick={() => setShow(!show)} className="flex items-center gap-2 bg-blue-700 px-4 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Novo contrato</button></div>{show && <section className="border bg-white p-5"><div className="grid gap-3 md:grid-cols-2"><Field label="Órgão"><input value={form.orgao} onChange={(event) => setForm({ ...form, orgao: event.target.value })} className={INPUT} /></Field><Field label="Número"><input value={form.numeroContrato} onChange={(event) => setForm({ ...form, numeroContrato: event.target.value })} className={INPUT} /></Field><Field label="Valor"><input type="number" value={form.valorContratado} onChange={(event) => setForm({ ...form, valorContratado: event.target.value })} className={INPUT} /></Field><Field label="Saldo"><input type="number" value={form.saldoContratual} onChange={(event) => setForm({ ...form, saldoContratual: event.target.value })} className={INPUT} /></Field><Field label="Início"><input type="date" value={form.inicioVigencia} onChange={(event) => setForm({ ...form, inicioVigencia: event.target.value })} className={INPUT} /></Field><Field label="Fim"><input type="date" value={form.fimVigencia} onChange={(event) => setForm({ ...form, fimVigencia: event.target.value })} className={INPUT} /></Field></div><button disabled={save.isPending || !form.orgao.trim() || !form.numeroContrato.trim()} onClick={() => save.mutate({ orgao: form.orgao.trim(), numeroContrato: form.numeroContrato.trim(), valorContratado: Number(form.valorContratado || 0), saldoContratual: Number(form.saldoContratual || 0), inicioVigencia: form.inicioVigencia || undefined, fimVigencia: form.fimVigencia || undefined, status: form.status })} className="flex items-center gap-2 bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />Salvar</button></section>}<section className="border bg-white p-5"><h2 className="mb-4 font-bold">Ciclo contratual</h2>{query.isLoading ? <Loading /> : rows.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Contrato</th><th className="p-2">Órgão</th><th className="p-2">Valor</th><th className="p-2">Saldo</th><th className="p-2">Vigência</th><th className="p-2">Status</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-b"><td className="p-2 font-semibold">{row.numeroContrato}</td><td className="p-2">{row.orgao}</td><td className="p-2">{formatBRL(row.valorContratado)}</td><td className="p-2">{formatBRL(row.saldoContratual)}</td><td className="p-2">{formatDate(row.inicioVigencia)} a {formatDate(row.fimVigencia)}{row.daysToExpire != null && row.daysToExpire <= 45 && <div className="text-xs text-amber-700">{row.daysToExpire} dia(s)</div>}</td><td className="p-2"><Status ok={row.status === "active"}>{row.status}</Status></td></tr>)}</tbody></table></div> : <Empty text="Nenhum contrato cadastrado." />}</section></div>;
}

function DecisionTab() {
  const [opportunityId, setOpportunityId] = useState("");
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [metrics, setMetrics] = useState({ marginPercent: 15, supplierCoveragePercent: 80, documentationReadinessPercent: 80, deliveryConfidencePercent: 80, workingCapitalCoveragePercent: 80, competitionLevel: "medium" as RiskChoice, legalRisk: "medium" as RiskChoice, taxRisk: "medium" as RiskChoice, operationalRisk: "medium" as RiskChoice });
  const id = Number(opportunityId);
  const historyQuery = trpc.operationalGovernance.assessmentHistory.useQuery({ opportunityId: id }, { enabled: Number.isInteger(id) && id > 0 });
  const history = (historyQuery.data ?? []) as AssessmentRow[];
  const evaluate = trpc.operationalGovernance.evaluateOpportunity.useMutation({ onSuccess: (data) => { setResult(data); toast.success("Avaliação registrada."); }, onError: (error) => toast.error(error.message) });
  return <div className="grid gap-5 xl:grid-cols-2"><section className="border bg-white p-5"><h2 className="mb-4 font-bold">Avaliar oportunidade</h2><Field label="ID"><input type="number" min="1" value={opportunityId} onChange={(event) => setOpportunityId(event.target.value)} className={INPUT} /></Field><div className="grid gap-3 sm:grid-cols-2"><NumberField label="Margem (%)" value={metrics.marginPercent} onChange={(value) => setMetrics({ ...metrics, marginPercent: value })} /><NumberField label="Fornecedores (%)" value={metrics.supplierCoveragePercent} onChange={(value) => setMetrics({ ...metrics, supplierCoveragePercent: value })} /><NumberField label="Documentação (%)" value={metrics.documentationReadinessPercent} onChange={(value) => setMetrics({ ...metrics, documentationReadinessPercent: value })} /><NumberField label="Entrega (%)" value={metrics.deliveryConfidencePercent} onChange={(value) => setMetrics({ ...metrics, deliveryConfidencePercent: value })} /><NumberField label="Capital de giro (%)" value={metrics.workingCapitalCoveragePercent} onChange={(value) => setMetrics({ ...metrics, workingCapitalCoveragePercent: value })} /><RiskField label="Concorrência" value={metrics.competitionLevel} onChange={(value) => setMetrics({ ...metrics, competitionLevel: value })} /><RiskField label="Risco jurídico" value={metrics.legalRisk} onChange={(value) => setMetrics({ ...metrics, legalRisk: value })} /><RiskField label="Risco tributário" value={metrics.taxRisk} onChange={(value) => setMetrics({ ...metrics, taxRisk: value })} /><RiskField label="Risco operacional" value={metrics.operationalRisk} onChange={(value) => setMetrics({ ...metrics, operationalRisk: value })} /></div><button disabled={evaluate.isPending || id <= 0} onClick={() => evaluate.mutate({ opportunityId: id, metrics })} className="flex items-center gap-2 bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><ClipboardCheck className="h-4 w-4" />Avaliar</button></section><section className="border bg-white p-5"><h2 className="mb-4 font-bold">Resultado</h2>{result ? <div className="space-y-3"><div className="border p-4"><div className="text-xs uppercase text-gray-500">Recomendação</div><div className="text-2xl font-black uppercase">{result.recommendation.replace("_", "-")}</div><div>Score: {result.score.toFixed(2)}</div></div><Result title="Bloqueios" items={result.blockers} /><Result title="Fundamentos" items={result.reasons} /><Result title="Ações" items={result.actions} /></div> : history.length ? <div className="space-y-2">{history.map((row) => <div key={row.id} className="border p-3"><div className="flex justify-between"><span className="font-semibold uppercase">{row.recommendation.replace("_", "-")}</span><span className="font-bold">{row.score.toFixed(2)}</span></div><div className="text-xs text-gray-500">{formatDate(row.createdAt)} · {row.createdBy ?? "sistema"}</div></div>)}</div> : <Empty text="Execute uma avaliação." />}</section></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="mb-3 block"><span className="mb-1 block text-xs font-semibold text-gray-600">{label}</span>{children}</label>; }
function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <Field label={label}><input type="number" min="0" max="100" value={value} onChange={(event) => onChange(Number(event.target.value))} className={INPUT} /></Field>; }
function RiskField({ label, value, onChange }: { label: string; value: RiskChoice; onChange: (value: RiskChoice) => void }) { return <Field label={label}><select value={value} onChange={(event) => onChange(event.target.value as RiskChoice)} className={INPUT}><option value="low">Baixo</option><option value="medium">Médio</option><option value="high">Alto</option></select></Field>; }
function Status({ ok, children }: { ok: boolean; children: React.ReactNode }) { return <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold ${ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}{children}</span>; }
function Metric({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) { return <div className={`border bg-white p-3 ${danger ? "border-red-200" : ""}`}><div className="text-xs text-gray-500">{label}</div><div className={`text-xl font-black ${danger ? "text-red-700" : ""}`}>{value}</div></div>; }
function Loading() { return <div className="p-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>; }
function Empty({ text }: { text: string }) { return <div className="border border-dashed p-8 text-center text-sm text-gray-400">{text}</div>; }
function ErrorState({ message }: { message: string }) { return <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-700">{message}</div>; }
function Result({ title, items }: { title: string; items: string[] }) { return items.length ? <div className="border p-3"><div className="mb-1 text-xs font-bold uppercase">{title}</div><ul className="space-y-1 text-sm">{items.map((item) => <li key={item}>• {item}</li>)}</ul></div> : null; }
function formatBRL(value: number) { return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function formatDate(value: string | Date | null) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("pt-BR"); }
