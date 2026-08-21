import { usePermission } from "@/components/RequireAuth";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Boxes,
  CalendarClock,
  CircleDollarSign,
  FileCheck2,
  FileSearch,
  FileText,
  History,
  Loader2,
  PackageCheck,
  ReceiptText,
  Search,
  Send,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Workflow,
} from "lucide-react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";

const STAGE_LABEL: Record<string, string> = {
  nova: "Nova",
  triagem: "Triagem",
  analise: "Análise",
  cotacao: "Cotação",
  precificacao: "Precificação",
  proposta: "Proposta",
  enviada: "Enviada",
  disputa: "Disputa",
  habilitacao: "Habilitação",
  vencida: "Vencida",
  perdida: "Perdida",
  cancelada: "Cancelada",
  contrato: "Contrato",
  entrega: "Entrega",
  faturamento: "Faturamento",
  recebimento: "Recebimento",
  encerrada: "Encerrada",
};

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateBR(value: unknown): string {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR");
}

function sameProcess(a: unknown, b: unknown): boolean {
  const left = String(a ?? "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const right = String(b ?? "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return left.length >= 3 && left === right;
}

export default function DossieOportunidade() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const validId = Number.isInteger(id) && id > 0;
  const canEdit = usePermission("editor");
  const utils = trpc.useUtils();

  const detalhe = trpc.funil.detalhe.useQuery({ id }, { enabled: validId });
  const propostas = trpc.proposals.list.useQuery(undefined, { enabled: validId });
  const pedidos = trpc.posVenda.pedidos.useQuery(undefined, { enabled: validId });
  const entregas = trpc.posVenda.entregas.useQuery(undefined, { enabled: validId });
  const notas = trpc.posVenda.notas.useQuery(undefined, { enabled: validId });
  const contas = trpc.posVenda.contasPagar.useQuery(undefined, { enabled: validId });
  const contratos = trpc.operationalGovernance.listContracts.useQuery(undefined, { enabled: validId });

  const mover = trpc.funil.mover.useMutation({
    onSuccess: async () => {
      toast.success("Etapa atualizada no dossiê.");
      await Promise.all([utils.funil.detalhe.invalidate({ id }), utils.funil.kanban.invalidate()]);
    },
    onError: (error) => toast.error(error.message),
  });

  if (!validId) {
    return <State title="Oportunidade inválida" text="O identificador informado não é válido." />;
  }

  if (detalhe.isLoading || !detalhe.data) {
    if (detalhe.error) return <State title="Não foi possível abrir o dossiê" text={detalhe.error.message} />;
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-800" /></div>;
  }

  const opportunity = detalhe.data as any;
  const relatedOrders = ((pedidos.data ?? []) as any[]).filter((row) => Number(row.funilId) === id);
  const orderIds = new Set(relatedOrders.map((row) => Number(row.id)));
  const relatedDeliveries = ((entregas.data ?? []) as any[]).filter((row) => Number(row.funilId) === id || orderIds.has(Number(row.orderId)));
  const relatedInvoices = ((notas.data ?? []) as any[]).filter((row) => Number(row.funilId) === id);
  const relatedPayables = ((contas.data ?? []) as any[]).filter((row) => orderIds.has(Number(row.orderId)));
  const relatedContracts = ((contratos.data ?? []) as any[]).filter((row) => Number(row.funilId) === id);
  const relatedProposals = ((propostas.data ?? []) as any[]).filter((row) => sameProcess(row.processNumber, opportunity.numeroProcesso));

  const sold = relatedInvoices
    .filter((row) => row.status !== "cancelada")
    .reduce((sum, row) => sum + Math.max(0, Number(row.valorBruto ?? 0) - Number(row.retencoes ?? 0)), 0);
  const purchaseCost = relatedOrders
    .filter((row) => row.status !== "cancelado")
    .reduce((sum, row) => sum + Number(row.valorTotal ?? 0), 0);
  const extraCosts = relatedPayables
    .filter((row) => String(row.categoria) !== "fornecedor")
    .reduce((sum, row) => sum + Number(row.valor ?? 0), 0);
  const projectedProfit = sold - purchaseCost - extraCosts;
  const margin = sold > 0 ? (projectedProfit / sold) * 100 : null;
  const deadline = opportunity.prazoEnvio ? new Date(opportunity.prazoEnvio) : null;
  const days = deadline && !Number.isNaN(deadline.getTime()) ? Math.ceil((deadline.getTime() - Date.now()) / 86_400_000) : null;

  const sourceLabel = opportunity.origemTipo === "cotacao" ? "Cotação recebida" : opportunity.origemTipo === "licitacao" ? "Edital/Licitação" : opportunity.origemTipo === "radar" ? "Radar" : "Cadastro manual";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <Link href="/funil" className="mb-3 inline-flex items-center gap-1 text-xs font-bold text-slate-500 no-underline hover:text-blue-800"><ArrowLeft className="h-4 w-4" /> Voltar ao funil</Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-blue-950 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white">Dossiê #{id}</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-700">{STAGE_LABEL[opportunity.etapa] ?? opportunity.etapa}</span>
              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-violet-800">{sourceLabel}</span>
            </div>
            <h1 className="mt-2 text-2xl font-black text-slate-950">{opportunity.titulo}</h1>
            <p className="mt-1 text-sm text-slate-500">{[opportunity.orgao, opportunity.numeroProcesso ? `Processo ${opportunity.numeroProcesso}` : null, opportunity.modalidade].filter(Boolean).join(" · ") || "Oportunidade sem identificação complementar"}</p>
          </div>
          <Link href={`/agente?prompt=${encodeURIComponent(`Analise o dossiê da oportunidade ${id}: ${opportunity.titulo}. Identifique pendências, riscos e próxima ação.`)}`} className="flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-xs font-black text-white no-underline hover:bg-violet-800">
            <Search className="h-4 w-4" /> Analisar com IA
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Valor estimado" value={opportunity.valorEstimado ? brl(Number(opportunity.valorEstimado)) : "—"} icon={CircleDollarSign} />
        <Metric label="Prazo" value={days == null ? "—" : days < 0 ? `Vencido há ${Math.abs(days)}d` : days === 0 ? "Hoje" : `${days} dia(s)`} icon={CalendarClock} danger={days != null && days <= 0} warning={days != null && days > 0 && days <= 3} />
        <Metric label="Venda líquida registrada" value={brl(sold)} icon={ReceiptText} />
        <Metric label="Resultado projetado" value={sold > 0 ? `${brl(projectedProfit)}${margin != null ? ` · ${margin.toFixed(1)}%` : ""}` : "Aguardando faturamento"} icon={Banknote} danger={sold > 0 && projectedProfit < 0} />
      </div>

      {opportunity.objeto && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-2 flex items-center gap-2"><FileSearch className="h-5 w-5 text-blue-800" /><h2 className="text-sm font-black text-slate-900">Objeto / escopo identificado</h2></div>
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{opportunity.objeto}</p>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-black text-slate-900">Próxima ação do fluxo</h2>
            <p className="mt-1 text-xs text-slate-500">A movimentação fica registrada no histórico auditável da oportunidade.</p>
          </div>
          {canEdit && opportunity.proximasEtapas?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {opportunity.proximasEtapas.map((stage: string) => (
                <button key={stage} disabled={mover.isPending} onClick={() => mover.mutate({ id, paraEtapa: stage as any })} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-900 hover:bg-blue-100 disabled:opacity-50">
                  {STAGE_LABEL[stage] ?? stage} <ArrowRight className="ml-1 inline h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <ModuleCard icon={FileText} title="1. Entrada e documentos" description="E-mails, cotações, editais e anexos entram pelo mesmo fluxo de captura e análise." actions={[
          { label: "Cotações recebidas", href: "/cotacoes-recebidas" },
          { label: "Analisar edital/TR", href: `/edital?funilId=${id}` },
          { label: "Captura inteligente", href: "/captura-inteligente" },
        ]} />
        <ModuleCard icon={Boxes} title="2. Produtos, equivalências e custos" description="Catálogo, matching, fornecedores, preços, frete e custo total para tomada de decisão." actions={[
          { label: "Produtos e preços", href: "/produtos" },
          { label: "Buscar equivalentes", href: `/busca-global?oportunidade=${id}` },
          { label: "Fornecedores", href: "/fornecedores" },
        ]} />
        <ModuleCard icon={Send} title="3. Propostas" description={`${relatedProposals.length} proposta(s) relacionada(s) pelo número do processo.`} actions={[
          { label: "Central de propostas", href: "/propostas" },
          { label: "Montar/revisar proposta", href: `/edital?funilId=${id}` },
          ...relatedProposals.slice(0, 1).map((row) => ({ label: `Abrir proposta #${row.id}`, href: `/propostas/${row.id}` })),
        ]} />
        <ModuleCard icon={ShieldCheck} title="4. Habilitação e documentos da empresa" description="Certidões, SICAF, declarações, atestados e documentos de habilitação ficam acessíveis no mesmo dossiê." actions={[
          { label: "Documentos de habilitação", href: "/documentos-habilitacao" },
          { label: "Certidões e vencimentos", href: "/certidoes" },
          { label: "Diligências e recursos", href: "/diligencias" },
        ]} />
        <ModuleCard icon={PackageCheck} title="5. Contratos e fornecimento" description={`${relatedContracts.length} contrato(s), ${relatedOrders.length} pedido(s) de compra e ${relatedDeliveries.length} entrega(s) vinculada(s).`} actions={[
          { label: "Contratos", href: "/centro-operacional?tab=contratos" },
          { label: "Compras e entregas", href: `/pos-venda?funilId=${id}` },
          { label: "Central operacional", href: "/centro-operacional" },
        ]} />
        <ModuleCard icon={CircleDollarSign} title="6. Financeiro e resultado real" description={`${relatedInvoices.length} NF(s) e ${relatedPayables.length} conta(s) vinculada(s) à operação.`} actions={[
          { label: "Controle financeiro", href: `/financeiro?funilId=${id}` },
          { label: "Pós-venda", href: `/pos-venda?funilId=${id}` },
        ]} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-blue-800" /><h2 className="text-sm font-black text-slate-900">Execução vinculada</h2></div>
          <div className="space-y-3">
            {relatedOrders.length === 0 && relatedDeliveries.length === 0 && relatedContracts.length === 0 ? <Empty text="Nenhum contrato, pedido ou entrega vinculado ao funil ainda." /> : null}
            {relatedContracts.map((row) => <Row key={`contract-${row.id}`} icon={FileCheck2} title={`Contrato ${row.numeroContrato}`} detail={`${row.orgao} · ${brl(Number(row.valorContratado ?? 0))} · vigência até ${dateBR(row.fimVigencia)}`} />)}
            {relatedOrders.map((row) => <Row key={`order-${row.id}`} icon={ShoppingCart} title={`Compra #${row.id} — ${row.fornecedorNome}`} detail={`${row.status} · ${brl(Number(row.valorTotal ?? 0))} · ${row.descricao}`} />)}
            {relatedDeliveries.map((row) => <Row key={`delivery-${row.id}`} icon={Truck} title={`Entrega #${row.id} — ${row.descricao}`} detail={`${row.status} · previsão ${dateBR(row.previsao)}${row.rastreio ? ` · ${row.rastreio}` : ""}`} />)}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2"><CircleDollarSign className="h-5 w-5 text-blue-800" /><h2 className="text-sm font-black text-slate-900">Faturamento e custos</h2></div>
          <div className="space-y-3">
            {relatedInvoices.length === 0 && relatedPayables.length === 0 ? <Empty text="Nenhuma nota fiscal ou despesa vinculada à operação ainda." /> : null}
            {relatedInvoices.map((row) => <Row key={`invoice-${row.id}`} icon={ReceiptText} title={`NF ${row.numero} — ${row.orgao}`} detail={`${row.status} · líquido ${brl(Math.max(0, Number(row.valorBruto ?? 0) - Number(row.retencoes ?? 0)))} · vencimento ${dateBR(row.vencimento)}`} />)}
            {relatedPayables.map((row) => <Row key={`payable-${row.id}`} icon={Banknote} title={`${row.categoria ?? "Despesa"} — ${row.descricao}`} detail={`${row.credor ?? "Credor não informado"} · ${brl(Number(row.valor ?? 0))} · vencimento ${dateBR(row.vencimento)}`} />)}
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2"><History className="h-5 w-5 text-blue-800" /><h2 className="text-sm font-black text-slate-900">Histórico auditável</h2></div>
        <div className="space-y-2">
          {(opportunity.eventos ?? []).map((event: any) => (
            <div key={event.id} className="grid gap-1 border-b border-slate-100 pb-2 text-xs sm:grid-cols-[150px_1fr]">
              <span className="text-slate-400">{new Date(event.createdAt).toLocaleString("pt-BR")}</span>
              <div className="text-slate-700"><span className="font-bold">{event.deEtapa ? `${STAGE_LABEL[event.deEtapa] ?? event.deEtapa} → ` : ""}{STAGE_LABEL[event.paraEtapa] ?? event.paraEtapa}</span>{event.justificativa ? ` — ${event.justificativa}` : ""}{event.usuario ? <span className="text-slate-400"> · {event.usuario}</span> : null}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, icon: Icon, danger, warning }: { label: string; value: string; icon: React.ElementType; danger?: boolean; warning?: boolean }) {
  return (
    <div className={`rounded-xl border bg-white p-4 ${danger ? "border-red-200" : warning ? "border-amber-200" : "border-slate-200"}`}>
      <div className="flex items-center gap-2 text-xs font-bold text-slate-500"><Icon className={`h-4 w-4 ${danger ? "text-red-600" : warning ? "text-amber-600" : "text-blue-800"}`} />{label}</div>
      <div className={`mt-2 text-lg font-black ${danger ? "text-red-800" : warning ? "text-amber-800" : "text-slate-950"}`}>{value}</div>
    </div>
  );
}

function ModuleCard({ icon: Icon, title, description, actions }: { icon: React.ElementType; title: string; description: string; actions: Array<{ label: string; href: string }> }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2"><Icon className="h-5 w-5 text-blue-800" /><h2 className="text-sm font-black text-slate-900">{title}</h2></div>
      <p className="mt-2 min-h-10 text-xs leading-5 text-slate-500">{description}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {actions.map((action) => <Link key={`${action.href}-${action.label}`} href={action.href} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 no-underline hover:border-blue-300 hover:bg-blue-50 hover:text-blue-900">{action.label}<ArrowRight className="h-3 w-3" /></Link>)}
      </div>
    </section>
  );
}

function Row({ icon: Icon, title, detail }: { icon: React.ElementType; title: string; detail: string }) {
  return <div className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-blue-800" /><div className="min-w-0"><p className="truncate text-xs font-black text-slate-900">{title}</p><p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{detail}</p></div></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">{text}</div>;
}

function State({ title, text }: { title: string; text: string }) {
  return <div className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-8 text-center"><Workflow className="mx-auto h-8 w-8 text-slate-300" /><h1 className="mt-3 font-black text-slate-900">{title}</h1><p className="mt-1 text-sm text-slate-500">{text}</p><Link href="/funil" className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-blue-800 no-underline"><ArrowLeft className="h-4 w-4" /> Voltar ao funil</Link></div>;
}