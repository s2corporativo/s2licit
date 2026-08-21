import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CircleDollarSign,
  FileClock,
  FileWarning,
  PackageCheck,
  RefreshCw,
  ShieldAlert,
  Workflow,
} from "lucide-react";
import { Link } from "wouter";

type Priority = "critical" | "warning" | "info";

type PendingItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
  priority: Priority;
  group: "Prazos" | "Documentos" | "Entregas" | "Financeiro" | "Sistema";
};

const FINAL_STAGES = new Set(["perdida", "cancelada", "encerrada"]);

function dateValue(value: unknown): Date | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysUntil(value: unknown): number | null {
  const date = dateValue(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
}

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function priorityLabel(priority: Priority): string {
  if (priority === "critical") return "Crítico";
  if (priority === "warning") return "Atenção";
  return "Informativo";
}

function priorityClasses(priority: Priority): string {
  if (priority === "critical") return "border-red-200 bg-red-50 text-red-800";
  if (priority === "warning") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-blue-200 bg-blue-50 text-blue-800";
}

export default function CentralPendencias() {
  const funil = trpc.funil.kanban.useQuery(undefined, { refetchInterval: 60_000 });
  const governance = trpc.operationalGovernance.summary.useQuery(undefined, { refetchInterval: 60_000 });
  const certidoes = trpc.certidoes.alertas.useQuery({ diasAlerta: 30 }, { refetchInterval: 300_000 });
  const entregas = trpc.posVenda.entregas.useQuery(undefined, { refetchInterval: 60_000 });
  const notas = trpc.posVenda.notas.useQuery(undefined, { refetchInterval: 60_000 });
  const contas = trpc.posVenda.contasPagar.useQuery(undefined, { refetchInterval: 60_000 });

  const loading = funil.isLoading || governance.isLoading || certidoes.isLoading || entregas.isLoading || notas.isLoading || contas.isLoading;

  const pending: PendingItem[] = [];

  if (funil.data) {
    for (const etapa of funil.data.etapas) {
      if (FINAL_STAGES.has(etapa)) continue;
      for (const card of funil.data.colunas[etapa] ?? []) {
        if (card.diasPrazo == null || card.diasPrazo > 3) continue;
        pending.push({
          id: `funil-${card.id}`,
          title: card.diasPrazo < 0 ? `Prazo vencido — ${card.titulo}` : card.diasPrazo === 0 ? `Vence hoje — ${card.titulo}` : `Prazo em ${card.diasPrazo} dia(s) — ${card.titulo}`,
          detail: [card.orgao, card.numeroProcesso ? `Proc. ${card.numeroProcesso}` : null].filter(Boolean).join(" · ") || "Oportunidade em andamento",
          href: `/oportunidades/${card.id}/dossie`,
          priority: card.diasPrazo <= 0 ? "critical" : "warning",
          group: "Prazos",
        });
      }
    }
  }

  for (const row of (certidoes.data?.vencidas ?? []) as any[]) {
    pending.push({
      id: `cert-vencida-${row.id}`,
      title: `Certidão vencida — ${row.tipo}`,
      detail: row.orgaoEmissor ? `Órgão emissor: ${row.orgaoEmissor}` : "Documento da empresa precisa ser renovado",
      href: "/certidoes",
      priority: "critical",
      group: "Documentos",
    });
  }

  for (const row of (certidoes.data?.vencendo ?? []) as any[]) {
    const days = daysUntil(row.dataValidade);
    pending.push({
      id: `cert-vencendo-${row.id}`,
      title: `${row.tipo} vence${days != null ? ` em ${Math.max(days, 0)} dia(s)` : " em breve"}`,
      detail: row.orgaoEmissor ? `Órgão emissor: ${row.orgaoEmissor}` : "Renovação documental recomendada",
      href: "/certidoes",
      priority: days != null && days <= 7 ? "critical" : "warning",
      group: "Documentos",
    });
  }

  for (const row of (entregas.data ?? []) as any[]) {
    if (["entregue", "devolvida"].includes(String(row.status))) continue;
    const days = daysUntil(row.previsao);
    if (row.status === "atrasada" || (days != null && days < 0)) {
      pending.push({
        id: `entrega-${row.id}`,
        title: `Entrega atrasada — ${row.descricao}`,
        detail: [row.transportadora, row.rastreio ? `Rastreio ${row.rastreio}` : null].filter(Boolean).join(" · ") || "Verificar logística e órgão recebedor",
        href: row.funilId ? `/oportunidades/${row.funilId}/dossie` : "/pos-venda",
        priority: "critical",
        group: "Entregas",
      });
    } else if (days != null && days <= 2) {
      pending.push({
        id: `entrega-proxima-${row.id}`,
        title: `Entrega próxima — ${row.descricao}`,
        detail: days === 0 ? "Previsão para hoje" : `Previsão em ${days} dia(s)`,
        href: row.funilId ? `/oportunidades/${row.funilId}/dossie` : "/pos-venda",
        priority: "warning",
        group: "Entregas",
      });
    }
  }

  let overdueReceivables = 0;
  for (const row of (notas.data ?? []) as any[]) {
    if (["paga", "cancelada"].includes(String(row.status)) || row.recebidoEm) continue;
    const days = daysUntil(row.vencimento);
    if (days != null && days < 0) {
      const net = Number(row.valorBruto ?? 0) - Number(row.retencoes ?? 0);
      overdueReceivables += Number.isFinite(net) ? net : 0;
      pending.push({
        id: `nota-${row.id}`,
        title: `Recebimento em atraso — NF ${row.numero}`,
        detail: `${row.orgao ?? "Órgão não informado"} · ${brl(Math.max(net, 0))}`,
        href: row.funilId ? `/oportunidades/${row.funilId}/dossie` : "/financeiro",
        priority: "critical",
        group: "Financeiro",
      });
    }
  }

  let overduePayables = 0;
  for (const row of (contas.data ?? []) as any[]) {
    if (row.pagoEm) continue;
    const days = daysUntil(row.vencimento);
    if (days != null && days < 0) {
      const amount = Number(row.valor ?? 0);
      overduePayables += Number.isFinite(amount) ? amount : 0;
      pending.push({
        id: `conta-${row.id}`,
        title: `Conta vencida — ${row.descricao}`,
        detail: `${row.credor ?? "Credor não informado"} · ${brl(Math.max(amount, 0))}`,
        href: "/financeiro",
        priority: "critical",
        group: "Financeiro",
      });
    }
  }

  for (const [index, blocker] of (governance.data?.blockers ?? []).entries()) {
    pending.push({
      id: `blocker-${index}`,
      title: blocker,
      detail: "Bloqueio identificado pela governança operacional do S2 Licit",
      href: "/centro-operacional?tab=prontidao",
      priority: blocker.toLowerCase().includes("contrato") ? "warning" : "info",
      group: "Sistema",
    });
  }

  const critical = pending.filter((item) => item.priority === "critical").length;
  const warnings = pending.filter((item) => item.priority === "warning").length;
  const opportunityCount = funil.data
    ? funil.data.etapas.reduce((sum, etapa) => sum + (FINAL_STAGES.has(etapa) ? 0 : (funil.data?.colunas[etapa]?.length ?? 0)), 0)
    : 0;

  const groups: Array<PendingItem["group"]> = ["Prazos", "Documentos", "Entregas", "Financeiro", "Sistema"];

  const refreshAll = () => {
    void Promise.all([
      funil.refetch(),
      governance.refetch(),
      certidoes.refetch(),
      entregas.refetch(),
      notas.refetch(),
      contas.refetch(),
    ]);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Workflow className="h-7 w-7 text-blue-800" />
            <div>
              <h1 className="text-2xl font-black text-slate-950">Central de Pendências</h1>
              <p className="text-sm text-slate-500">Uma fila única para prazos, documentos, entregas, financeiro e bloqueios operacionais.</p>
            </div>
          </div>
        </div>
        <button onClick={refreshAll} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric icon={ShieldAlert} label="Críticas" value={critical} danger={critical > 0} />
        <Metric icon={AlertTriangle} label="Atenção" value={warnings} warning={warnings > 0} />
        <Metric icon={Workflow} label="Oportunidades abertas" value={opportunityCount} />
        <Metric icon={CircleDollarSign} label="A receber vencido" value={brl(overdueReceivables)} danger={overdueReceivables > 0} />
        <Metric icon={FileClock} label="A pagar vencido" value={brl(overduePayables)} danger={overduePayables > 0} />
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <QuickAction href="/cotacoes-recebidas" icon={FileWarning} title="Entrada" text="E-mails, cotações e documentos recebidos" />
        <QuickAction href="/funil" icon={Workflow} title="Oportunidades" text="Triagem e acompanhamento ponta a ponta" />
        <QuickAction href="/busca-global" icon={BadgeCheck} title="Produtos e match" text="Equivalências, preços e fornecedores" />
        <QuickAction href="/propostas" icon={PackageCheck} title="Propostas" text="Preço, margem, aprovação e envio" />
      </section>

      {loading && pending.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Consolidando as pendências do S2 Licit…</div>
      ) : pending.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <BadgeCheck className="mx-auto h-8 w-8 text-emerald-700" />
          <h2 className="mt-2 font-black text-emerald-950">Nenhuma pendência crítica identificada</h2>
          <p className="mt-1 text-sm text-emerald-800">Os motores consultados não retornaram prazos, documentos, entregas ou valores vencidos.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => {
            const rows = pending.filter((item) => item.group === group).sort((a, b) => (a.priority === b.priority ? a.title.localeCompare(b.title) : a.priority === "critical" ? -1 : b.priority === "critical" ? 1 : a.priority === "warning" ? -1 : 1));
            if (rows.length === 0) return null;
            return (
              <section key={group} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <h2 className="text-sm font-black text-slate-900">{group}</h2>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{rows.length}</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {rows.map((item) => (
                    <Link key={item.id} href={item.href} className="flex items-center gap-3 px-4 py-3 no-underline hover:bg-slate-50">
                      <span className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-black uppercase ${priorityClasses(item.priority)}`}>{priorityLabel(item.priority)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-900">{item.title}</p>
                        <p className="truncate text-xs text-slate-500">{item.detail}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value, danger, warning }: { icon: React.ElementType; label: string; value: number | string; danger?: boolean; warning?: boolean }) {
  return (
    <div className={`rounded-xl border bg-white p-4 ${danger ? "border-red-200" : warning ? "border-amber-200" : "border-slate-200"}`}>
      <div className="flex items-center gap-2 text-xs font-bold text-slate-500"><Icon className={`h-4 w-4 ${danger ? "text-red-600" : warning ? "text-amber-600" : "text-blue-800"}`} />{label}</div>
      <div className={`mt-2 text-xl font-black ${danger ? "text-red-800" : warning ? "text-amber-800" : "text-slate-950"}`}>{value}</div>
    </div>
  );
}

function QuickAction({ href, icon: Icon, title, text }: { href: string; icon: React.ElementType; title: string; text: string }) {
  return (
    <Link href={href} className="group rounded-xl border border-slate-200 bg-white p-4 no-underline hover:border-blue-300 hover:shadow-sm">
      <div className="flex items-center justify-between">
        <Icon className="h-5 w-5 text-blue-800" />
        <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-blue-700" />
      </div>
      <h3 className="mt-3 text-sm font-black text-slate-900">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-slate-500">{text}</p>
    </Link>
  );
}
