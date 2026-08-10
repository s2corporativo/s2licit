import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import {
  certidoes,
  contractAlerts,
  deliveries,
  emailQuotations,
  funilEventos,
  funilOportunidades,
  payables,
  postAwardContracts,
  proposals,
  purchaseOrders,
  salesInvoices,
  type EtapaFunil,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { logger } from "../_core/logger";
import {
  ENTRY_STAGES,
  FINAL_STAGES,
  MACRO_ETAPAS,
  STAGE_RANK,
  macroEtapa,
  nextActionForStage,
  transitionOpportunityAtomic,
  type MacroEtapa,
} from "./opportunityStateService";

export {
  MACRO_ETAPAS,
  macroEtapa,
  nextActionForStage,
  type MacroEtapa,
} from "./opportunityStateService";

const RECONCILIATION_LOCK = "s2licit:canonical-workflow:v1";
const RECONCILIATION_BATCH_SIZE = 250;
const LIST_PAGE_MAX = 200;
const DETAIL_HISTORY_LIMIT = 200;
const DETAIL_RELATED_LIMIT = 100;

export type ReconciliationResult = {
  updated: number;
  checked: number;
  skippedBecauseLocked?: boolean;
};

let reconciliationInFlight: Promise<ReconciliationResult> | null = null;

function proposalTarget(status: string, hasLoss: boolean): EtapaFunil | null {
  switch (status) {
    case "draft":
      return "proposta";
    case "sent":
      return "enviada";
    case "order":
      return "contrato";
    case "in_transit":
      return "entrega";
    case "delivered":
      return "faturamento";
    case "cancelled":
      return hasLoss ? "perdida" : "cancelada";
    default:
      return null;
  }
}

function canAutoAdvance(current: EtapaFunil, target: EtapaFunil): boolean {
  if (FINAL_STAGES.has(current) || current === target) return false;
  if (target !== "perdida" && target !== "cancelada" && STAGE_RANK[target] <= STAGE_RANK[current]) return false;
  if (ENTRY_STAGES.has(current) && target !== "perdida" && target !== "cancelada" && STAGE_RANK[target] > STAGE_RANK.analise) {
    return false;
  }
  return true;
}

async function advanceFromEvidence(
  opportunityId: number,
  current: EtapaFunil,
  target: EtapaFunil,
  reason: string,
): Promise<boolean> {
  if (!canAutoAdvance(current, target)) return false;
  return transitionOpportunityAtomic({
    opportunityId,
    from: current,
    to: target,
    reason,
    actor: "orquestrador",
  });
}

async function withDistributedReconciliationLock<T>(work: () => Promise<T>): Promise<{ acquired: boolean; value?: T }> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return { acquired: false };

  const connection = await mysql.createConnection(databaseUrl);
  let acquired = false;
  try {
    const [rows] = await connection.query<RowDataPacket[]>(
      "SELECT GET_LOCK(?, 0) AS acquired",
      [RECONCILIATION_LOCK],
    );
    acquired = Number(rows[0]?.acquired ?? 0) === 1;
    if (!acquired) return { acquired: false };
    return { acquired: true, value: await work() };
  } finally {
    if (acquired) {
      await connection.query("SELECT RELEASE_LOCK(?)", [RECONCILIATION_LOCK]).catch((error: unknown) => {
        logger.error("[CanonicalWorkflow] Falha ao liberar lock distribuído", error);
      });
    }
    await connection.end().catch(() => undefined);
  }
}

type OpportunitySnapshot = {
  id: number;
  etapa: EtapaFunil;
};

function registerUniqueMatch(
  matches: Map<number, OpportunitySnapshot | null>,
  sourceId: number,
  opportunity: OpportunitySnapshot,
): void {
  const current = matches.get(sourceId);
  if (current === undefined) {
    matches.set(sourceId, opportunity);
    return;
  }
  if (current && current.id !== opportunity.id) {
    matches.set(sourceId, null);
  }
}

async function reconcileProposals(): Promise<ReconciliationResult> {
  const db = await getDb();
  if (!db) return { updated: 0, checked: 0 };

  let updated = 0;
  let checked = 0;
  let lastProposalId = 0;

  for (;;) {
    const batch = await db
      .select({
        id: proposals.id,
        radarOpportunityId: proposals.radarOpportunityId,
        processNumber: proposals.processNumber,
        orgName: proposals.orgName,
        status: proposals.status,
        lossReason: proposals.lossReason,
        competitorValue: proposals.competitorValue,
      })
      .from(proposals)
      .where(gt(proposals.id, lastProposalId))
      .orderBy(asc(proposals.id))
      .limit(RECONCILIATION_BATCH_SIZE);

    if (batch.length === 0) break;
    lastProposalId = batch[batch.length - 1].id;
    checked += batch.length;

    const matches = new Map<number, OpportunitySnapshot | null>();
    const radarIds = [...new Set(batch.map((row) => row.radarOpportunityId).filter((id): id is number => id != null))];
    if (radarIds.length > 0) {
      const radarOpportunities = await db
        .select({ id: funilOportunidades.id, etapa: funilOportunidades.etapa, origemId: funilOportunidades.origemId })
        .from(funilOportunidades)
        .where(
          and(
            eq(funilOportunidades.origemTipo, "pncp"),
            inArray(funilOportunidades.origemId, radarIds),
          ),
        );
      const sourceByRadarId = new Map<number, number[]>();
      for (const proposal of batch) {
        if (proposal.radarOpportunityId == null) continue;
        const ids = sourceByRadarId.get(proposal.radarOpportunityId) ?? [];
        ids.push(proposal.id);
        sourceByRadarId.set(proposal.radarOpportunityId, ids);
      }
      for (const opportunity of radarOpportunities) {
        if (opportunity.origemId == null) continue;
        for (const proposalId of sourceByRadarId.get(opportunity.origemId) ?? []) {
          registerUniqueMatch(matches, proposalId, { id: opportunity.id, etapa: opportunity.etapa });
        }
      }
    }

    const processRows = batch.filter((row) => row.processNumber?.trim() && row.orgName?.trim());
    if (processRows.length > 0) {
      const conditions = processRows.map((row) =>
        and(
          eq(funilOportunidades.numeroProcesso, row.processNumber!.trim()),
          eq(funilOportunidades.orgao, row.orgName!.trim()),
        ),
      );
      const processOpportunities = await db
        .select({
          id: funilOportunidades.id,
          etapa: funilOportunidades.etapa,
          numeroProcesso: funilOportunidades.numeroProcesso,
          orgao: funilOportunidades.orgao,
        })
        .from(funilOportunidades)
        .where(or(...conditions));

      const proposalsByKey = new Map<string, number[]>();
      for (const proposal of processRows) {
        const key = `${proposal.processNumber!.trim()}\u0000${proposal.orgName!.trim()}`;
        const ids = proposalsByKey.get(key) ?? [];
        ids.push(proposal.id);
        proposalsByKey.set(key, ids);
      }
      for (const opportunity of processOpportunities) {
        if (!opportunity.numeroProcesso || !opportunity.orgao) continue;
        const key = `${opportunity.numeroProcesso.trim()}\u0000${opportunity.orgao.trim()}`;
        for (const proposalId of proposalsByKey.get(key) ?? []) {
          registerUniqueMatch(matches, proposalId, { id: opportunity.id, etapa: opportunity.etapa });
        }
      }
    }

    const opportunityStageCache = new Map<number, EtapaFunil>();
    for (const proposal of batch) {
      const matched = matches.get(proposal.id);
      if (matched === null) {
        logger.warn(`[CanonicalWorkflow] Proposta #${proposal.id} possui vínculo ambíguo; reconciliação ignorada.`);
        continue;
      }
      if (!matched) continue;

      const current = opportunityStageCache.get(matched.id) ?? matched.etapa;
      const target = proposalTarget(
        proposal.status,
        Boolean(proposal.lossReason?.trim()) || proposal.competitorValue != null,
      );
      if (!target) continue;

      const changed = await advanceFromEvidence(
        matched.id,
        current,
        target,
        `[SYNC:PROPOSTA #${proposal.id}] status ${proposal.status}`,
      );
      if (changed) {
        opportunityStageCache.set(matched.id, target);
        updated++;
      }
    }
  }

  return { updated, checked };
}

type LinkedSourceRow = {
  id: number;
  funilId: number | null;
  status: string;
};

type LinkedBatchFetcher = (afterId: number, limit: number) => Promise<LinkedSourceRow[]>;

async function reconcileLinkedSource(
  fetchBatch: LinkedBatchFetcher,
  resolveTarget: (row: LinkedSourceRow) => EtapaFunil | null,
  eventLabel: (row: LinkedSourceRow) => string,
): Promise<ReconciliationResult> {
  const db = await getDb();
  if (!db) return { updated: 0, checked: 0 };

  let lastId = 0;
  let checked = 0;
  let updated = 0;

  for (;;) {
    const batch = await fetchBatch(lastId, RECONCILIATION_BATCH_SIZE);
    if (batch.length === 0) break;
    lastId = batch[batch.length - 1].id;
    checked += batch.length;

    const opportunityIds = [...new Set(batch.map((row) => row.funilId).filter((id): id is number => id != null))];
    if (opportunityIds.length === 0) continue;

    const opportunities = await db
      .select({ id: funilOportunidades.id, etapa: funilOportunidades.etapa })
      .from(funilOportunidades)
      .where(inArray(funilOportunidades.id, opportunityIds));
    const stageById = new Map(opportunities.map((row) => [row.id, row.etapa]));

    for (const row of batch) {
      if (!row.funilId) continue;
      const current = stageById.get(row.funilId);
      const target = resolveTarget(row);
      if (!current || !target) continue;
      const changed = await advanceFromEvidence(row.funilId, current, target, eventLabel(row));
      if (changed) {
        stageById.set(row.funilId, target);
        updated++;
      }
    }
  }

  return { updated, checked };
}

async function performReconciliation(): Promise<ReconciliationResult> {
  const db = await getDb();
  if (!db) return { updated: 0, checked: 0 };

  const proposalResult = await reconcileProposals();
  const orderResult = await reconcileLinkedSource(
    async (afterId, limit) =>
      db
        .select({ id: purchaseOrders.id, funilId: purchaseOrders.funilId, status: purchaseOrders.status })
        .from(purchaseOrders)
        .where(gt(purchaseOrders.id, afterId))
        .orderBy(asc(purchaseOrders.id))
        .limit(limit),
    (row) => (row.status === "cancelado" ? null : row.status === "recebido" ? "faturamento" : "entrega"),
    (row) => `[SYNC:PEDIDO #${row.id}] status ${row.status}`,
  );
  const deliveryResult = await reconcileLinkedSource(
    async (afterId, limit) =>
      db
        .select({ id: deliveries.id, funilId: deliveries.funilId, status: deliveries.status })
        .from(deliveries)
        .where(gt(deliveries.id, afterId))
        .orderBy(asc(deliveries.id))
        .limit(limit),
    (row) => (row.status === "entregue" ? "faturamento" : "entrega"),
    (row) => `[SYNC:ENTREGA #${row.id}] status ${row.status}`,
  );
  const invoiceResult = await reconcileLinkedSource(
    async (afterId, limit) =>
      db
        .select({ id: salesInvoices.id, funilId: salesInvoices.funilId, status: salesInvoices.status })
        .from(salesInvoices)
        .where(gt(salesInvoices.id, afterId))
        .orderBy(asc(salesInvoices.id))
        .limit(limit),
    (row) => (row.status === "cancelada" ? null : row.status === "paga" ? "recebimento" : "faturamento"),
    (row) => `[SYNC:NF #${row.id}] status ${row.status}`,
  );

  return {
    updated: proposalResult.updated + orderResult.updated + deliveryResult.updated + invoiceResult.updated,
    checked: proposalResult.checked + orderResult.checked + deliveryResult.checked + invoiceResult.checked,
  };
}

/**
 * Reconcilia fontes legadas com o fluxo canônico.
 * - serializa entre processos/pods com MySQL advisory lock;
 * - usa compare-and-set por transição, evitando eventos duplicados;
 * - percorre fontes por keyset, sem limite silencioso de 1.000 registros.
 */
export async function reconcileCanonicalWorkflow(): Promise<ReconciliationResult> {
  if (reconciliationInFlight) return reconciliationInFlight;

  reconciliationInFlight = (async () => {
    const locked = await withDistributedReconciliationLock(performReconciliation);
    if (!locked.acquired) return { updated: 0, checked: 0, skippedBecauseLocked: true };
    return locked.value ?? { updated: 0, checked: 0 };
  })();

  try {
    return await reconciliationInFlight;
  } finally {
    reconciliationInFlight = null;
  }
}

export type CanonicalOpportunity = typeof funilOportunidades.$inferSelect & {
  macroEtapa: MacroEtapa;
  proximaAcao: ReturnType<typeof nextActionForStage>;
};

export type CanonicalOpportunityPage = {
  items: CanonicalOpportunity[];
  nextCursor: number | null;
};

/** Keyset pagination pelo PK: O(log N + pageSize), sem OFFSET crescente. */
export async function listCanonicalOpportunityPage(input?: {
  limit?: number;
  cursor?: number;
}): Promise<CanonicalOpportunityPage> {
  const db = await getDb();
  if (!db) return { items: [], nextCursor: null };

  const limit = Math.max(1, Math.min(input?.limit ?? 100, LIST_PAGE_MAX));
  const rows = await db
    .select()
    .from(funilOportunidades)
    .where(input?.cursor ? sql`${funilOportunidades.id} < ${input.cursor}` : undefined)
    .orderBy(desc(funilOportunidades.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const visible = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: visible.map((row) => ({
      ...row,
      macroEtapa: macroEtapa(row.etapa),
      proximaAcao: nextActionForStage(row.etapa),
    })),
    nextCursor: hasMore ? visible[visible.length - 1]?.id ?? null : null,
  };
}

/** Compatibilidade interna: sempre com limite explícito e sem efeitos colaterais. */
export async function listCanonicalOpportunities(limit = 100): Promise<CanonicalOpportunity[]> {
  return (await listCanonicalOpportunityPage({ limit })).items;
}

export async function getCanonicalOpportunity(id: number) {
  const db = await getDb();
  if (!db) return null;

  const [opportunity] = await db
    .select()
    .from(funilOportunidades)
    .where(eq(funilOportunidades.id, id))
    .limit(1);
  if (!opportunity) return null;

  const [events, relatedOrders, deliveryRows, invoices] = await Promise.all([
    db
      .select()
      .from(funilEventos)
      .where(eq(funilEventos.oportunidadeId, id))
      .orderBy(desc(funilEventos.createdAt))
      .limit(DETAIL_HISTORY_LIMIT),
    db.select().from(purchaseOrders).where(eq(purchaseOrders.funilId, id)).limit(DETAIL_RELATED_LIMIT),
    db.select().from(deliveries).where(eq(deliveries.funilId, id)).limit(DETAIL_RELATED_LIMIT),
    db.select().from(salesInvoices).where(eq(salesInvoices.funilId, id)).limit(DETAIL_RELATED_LIMIT),
  ]);

  let relatedProposals: Array<typeof proposals.$inferSelect> = [];
  if (opportunity.origemTipo === "pncp" && opportunity.origemId) {
    relatedProposals = await db
      .select()
      .from(proposals)
      .where(eq(proposals.radarOpportunityId, opportunity.origemId))
      .limit(DETAIL_RELATED_LIMIT);
  }
  if (!relatedProposals.length && opportunity.numeroProcesso?.trim() && opportunity.orgao?.trim()) {
    relatedProposals = await db
      .select()
      .from(proposals)
      .where(
        and(
          eq(proposals.processNumber, opportunity.numeroProcesso.trim()),
          eq(proposals.orgName, opportunity.orgao.trim()),
        ),
      )
      .limit(DETAIL_RELATED_LIMIT);
  }

  return {
    opportunity: {
      ...opportunity,
      macroEtapa: macroEtapa(opportunity.etapa),
      proximaAcao: nextActionForStage(opportunity.etapa),
    },
    events,
    proposals: relatedProposals,
    orders: relatedOrders,
    deliveries: deliveryRows,
    invoices,
  };
}

export async function canonicalSummary() {
  const db = await getDb();
  const empty = {
    total: 0,
    abertas: 0,
    criticos: 0,
    porMacro: { entrada: 0, analise: 0, proposta: 0, execucao: 0, concluida: 0 } satisfies Record<MacroEtapa, number>,
  };
  if (!db) return empty;

  const [row] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      abertas: sql<number>`SUM(CASE WHEN ${funilOportunidades.etapa} NOT IN ('perdida','cancelada','encerrada') THEN 1 ELSE 0 END)`,
      criticos: sql<number>`SUM(CASE WHEN ${funilOportunidades.etapa} NOT IN ('perdida','cancelada','encerrada') AND ${funilOportunidades.prazoEnvio} IS NOT NULL AND DATEDIFF(${funilOportunidades.prazoEnvio}, CURRENT_DATE) <= 3 THEN 1 ELSE 0 END)`,
      entrada: sql<number>`SUM(CASE WHEN ${funilOportunidades.etapa} IN ('nova','triagem') THEN 1 ELSE 0 END)`,
      analise: sql<number>`SUM(CASE WHEN ${funilOportunidades.etapa} IN ('analise','cotacao','precificacao') THEN 1 ELSE 0 END)`,
      proposta: sql<number>`SUM(CASE WHEN ${funilOportunidades.etapa} IN ('proposta','enviada','disputa','habilitacao') THEN 1 ELSE 0 END)`,
      execucao: sql<number>`SUM(CASE WHEN ${funilOportunidades.etapa} IN ('vencida','contrato','entrega','faturamento','recebimento') THEN 1 ELSE 0 END)`,
      concluida: sql<number>`SUM(CASE WHEN ${funilOportunidades.etapa} IN ('encerrada','perdida','cancelada') THEN 1 ELSE 0 END)`,
    })
    .from(funilOportunidades);

  if (!row) return empty;
  return {
    total: Number(row.total ?? 0),
    abertas: Number(row.abertas ?? 0),
    criticos: Number(row.criticos ?? 0),
    porMacro: {
      entrada: Number(row.entrada ?? 0),
      analise: Number(row.analise ?? 0),
      proposta: Number(row.proposta ?? 0),
      execucao: Number(row.execucao ?? 0),
      concluida: Number(row.concluida ?? 0),
    },
  };
}

export type CanonicalPerformance = {
  decided: number;
  won: number;
  lost: number;
  cancelled: number;
  winRate: number;
  byOrg: Array<{ orgao: string; won: number; lost: number; decided: number; winRate: number }>;
};

export async function canonicalPerformance(): Promise<CanonicalPerformance> {
  const db = await getDb();
  if (!db) return { decided: 0, won: 0, lost: 0, cancelled: 0, winRate: 0, byOrg: [] };

  const wonStages: EtapaFunil[] = ["vencida", "contrato", "entrega", "faturamento", "recebimento", "encerrada"];
  const [totals, grouped] = await Promise.all([
    db
      .select({
        won: sql<number>`SUM(CASE WHEN ${funilOportunidades.etapa} IN ('vencida','contrato','entrega','faturamento','recebimento','encerrada') THEN 1 ELSE 0 END)`,
        lost: sql<number>`SUM(CASE WHEN ${funilOportunidades.etapa} = 'perdida' THEN 1 ELSE 0 END)`,
        cancelled: sql<number>`SUM(CASE WHEN ${funilOportunidades.etapa} = 'cancelada' THEN 1 ELSE 0 END)`,
      })
      .from(funilOportunidades),
    db
      .select({
        orgao: funilOportunidades.orgao,
        won: sql<number>`SUM(CASE WHEN ${funilOportunidades.etapa} IN ('vencida','contrato','entrega','faturamento','recebimento','encerrada') THEN 1 ELSE 0 END)`,
        lost: sql<number>`SUM(CASE WHEN ${funilOportunidades.etapa} = 'perdida' THEN 1 ELSE 0 END)`,
      })
      .from(funilOportunidades)
      .where(inArray(funilOportunidades.etapa, [...wonStages, "perdida"]))
      .groupBy(funilOportunidades.orgao),
  ]);

  const won = Number(totals[0]?.won ?? 0);
  const lost = Number(totals[0]?.lost ?? 0);
  const cancelled = Number(totals[0]?.cancelled ?? 0);
  const decided = won + lost;
  const byOrg = grouped
    .map((row) => {
      const orgWon = Number(row.won ?? 0);
      const orgLost = Number(row.lost ?? 0);
      const orgDecided = orgWon + orgLost;
      return {
        orgao: row.orgao?.trim() || "Órgão não informado",
        won: orgWon,
        lost: orgLost,
        decided: orgDecided,
        winRate: orgDecided > 0 ? Math.round((orgWon / orgDecided) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.decided - a.decided || b.winRate - a.winRate || a.orgao.localeCompare(b.orgao, "pt-BR"));

  return {
    decided,
    won,
    lost,
    cancelled,
    winRate: decided > 0 ? Math.round((won / decided) * 1000) / 10 : 0,
    byOrg,
  };
}

export type UnifiedAgendaItem = {
  key: string;
  tipo: "oportunidade" | "sessao" | "cotacao" | "certidao" | "contrato" | "entrega" | "receber" | "pagar";
  titulo: string;
  detalhe: string;
  data: string;
  diasRestantes: number;
  urgencia: "vencido" | "hoje" | "urgente" | "proximo" | "futuro";
  link: string;
};

function daysUntil(value: Date | string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(value);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function urgency(days: number): UnifiedAgendaItem["urgencia"] {
  if (days < 0) return "vencido";
  if (days === 0) return "hoje";
  if (days <= 3) return "urgente";
  if (days <= 14) return "proximo";
  return "futuro";
}

export async function listUnifiedAgenda(): Promise<{
  itens: UnifiedAgendaItem[];
  resumo: { vencidos: number; hoje: number; semana: number };
}> {
  const db = await getDb();
  if (!db) return { itens: [], resumo: { vencidos: 0, hoje: 0, semana: 0 } };

  const itens: UnifiedAgendaItem[] = [];
  const upper120 = new Date(Date.now() + 120 * 86_400_000);
  const upper90 = new Date(Date.now() + 90 * 86_400_000);
  const upper60 = new Date(Date.now() + 60 * 86_400_000);

  const funnel = await db
    .select()
    .from(funilOportunidades)
    .where(
      and(
        isNotNull(funilOportunidades.prazoEnvio),
        lte(funilOportunidades.prazoEnvio, upper120),
      ),
    );
  const emailOrigins = new Set(
    funnel.filter((row) => row.origemTipo === "email" && row.origemId).map((row) => row.origemId!),
  );

  for (const row of funnel) {
    if (FINAL_STAGES.has(row.etapa) || !row.prazoEnvio) continue;
    const dias = daysUntil(row.prazoEnvio);
    itens.push({
      key: `oportunidade-prazo-${row.id}`,
      tipo: "oportunidade",
      titulo: nextActionForStage(row.etapa)?.label ?? row.titulo,
      detalhe: `${row.titulo}${row.orgao ? ` · ${row.orgao}` : ""}`,
      data: new Date(row.prazoEnvio).toISOString(),
      diasRestantes: dias,
      urgencia: urgency(dias),
      link: `/oportunidades?oportunidade=${row.id}`,
    });
  }

  const sessions = await db
    .select()
    .from(funilOportunidades)
    .where(
      and(
        isNotNull(funilOportunidades.dataAbertura),
        lte(funilOportunidades.dataAbertura, upper60),
      ),
    );
  for (const row of sessions) {
    if (FINAL_STAGES.has(row.etapa) || !row.dataAbertura) continue;
    const dias = daysUntil(row.dataAbertura);
    if (dias < -1) continue;
    itens.push({
      key: `sessao-${row.id}`,
      tipo: "sessao",
      titulo: `Sessão / abertura: ${row.titulo}`,
      detalhe: row.orgao ?? row.numeroProcesso ?? "",
      data: new Date(row.dataAbertura).toISOString(),
      diasRestantes: dias,
      urgencia: urgency(dias),
      link: `/oportunidades?oportunidade=${row.id}`,
    });
  }

  const optionalSources = await Promise.allSettled([
    db.select().from(emailQuotations).where(and(isNotNull(emailQuotations.prazoResposta), lte(emailQuotations.prazoResposta, upper120))),
    db.select().from(certidoes).where(and(eq(certidoes.ativa, true), lte(certidoes.dataValidade, upper90))),
    db.select().from(contractAlerts).where(eq(contractAlerts.status, "open")),
    db.select().from(postAwardContracts).where(and(isNotNull(postAwardContracts.endDate), ne(postAwardContracts.status, "closed"), lte(postAwardContracts.endDate, upper120))),
    db.select().from(deliveries).where(and(isNotNull(deliveries.previsao), lte(deliveries.previsao, upper120))),
    db.select().from(salesInvoices).where(and(isNull(salesInvoices.recebidoEm), isNotNull(salesInvoices.vencimento), lte(salesInvoices.vencimento, upper120))),
    db.select().from(payables).where(and(isNull(payables.pagoEm), lte(payables.vencimento, upper120))),
  ]);

  const [quotationResult, certificateResult, contractAlertResult, contractResult, deliveryResult, invoiceResult, payableResult] = optionalSources;

  if (quotationResult.status === "fulfilled") {
    for (const row of quotationResult.value) {
      if (!row.prazoResposta || row.status === "respondida" || row.status === "descartada" || emailOrigins.has(row.id)) continue;
      const dias = daysUntil(row.prazoResposta);
      itens.push({ key: `cotacao-${row.id}`, tipo: "cotacao", titulo: `Responder cotação: ${row.orgao ?? row.subject ?? `#${row.id}`}`, detalhe: `${row.matchedItems}/${row.totalItems} itens vinculados`, data: new Date(row.prazoResposta).toISOString(), diasRestantes: dias, urgencia: urgency(dias), link: `/oportunidades?origem=cotacoes&cotacao=${row.id}` });
    }
  } else logger.warn("[CanonicalAgenda] Cotações indisponíveis", quotationResult.reason);

  if (certificateResult.status === "fulfilled") {
    for (const row of certificateResult.value) {
      const dias = daysUntil(row.dataValidade);
      itens.push({ key: `certidao-${row.id}`, tipo: "certidao", titulo: `Renovar certidão: ${row.tipo}`, detalhe: row.orgaoEmissor ?? "", data: new Date(row.dataValidade).toISOString(), diasRestantes: dias, urgencia: urgency(dias), link: `/documentos-habilitacao?certidao=${row.id}` });
    }
  } else logger.warn("[CanonicalAgenda] Certidões indisponíveis", certificateResult.reason);

  if (contractAlertResult.status === "fulfilled") {
    for (const row of contractAlertResult.value) {
      if (!row.dueDate) continue;
      const dias = daysUntil(row.dueDate);
      itens.push({ key: `contrato-alerta-${row.id}`, tipo: "contrato", titulo: row.title, detalhe: row.description ?? "", data: new Date(row.dueDate).toISOString(), diasRestantes: dias, urgencia: urgency(dias), link: "/execucao?tab=contratos" });
    }
  } else logger.warn("[CanonicalAgenda] Alertas contratuais indisponíveis", contractAlertResult.reason);

  if (contractResult.status === "fulfilled") {
    for (const row of contractResult.value) {
      if (!row.endDate) continue;
      const dias = daysUntil(row.endDate);
      itens.push({ key: `contrato-fim-${row.id}`, tipo: "contrato", titulo: `Vigência contratual: ${row.contractNumber}`, detalhe: row.objectDescription ?? "", data: new Date(row.endDate).toISOString(), diasRestantes: dias, urgencia: urgency(dias), link: `/execucao?tab=contratos&contrato=${row.id}` });
    }
  } else logger.warn("[CanonicalAgenda] Contratos indisponíveis", contractResult.reason);

  if (deliveryResult.status === "fulfilled") {
    for (const row of deliveryResult.value) {
      if (!row.previsao || row.status === "entregue") continue;
      const dias = daysUntil(row.previsao);
      itens.push({ key: `entrega-${row.id}`, tipo: "entrega", titulo: `Entrega: ${row.descricao}`, detalhe: [row.transportadora, row.rastreio].filter(Boolean).join(" · "), data: new Date(row.previsao).toISOString(), diasRestantes: dias, urgencia: urgency(dias), link: `/execucao?tab=entregas&entrega=${row.id}` });
    }
  } else logger.warn("[CanonicalAgenda] Entregas indisponíveis", deliveryResult.reason);

  if (invoiceResult.status === "fulfilled") {
    for (const row of invoiceResult.value) {
      if (!row.vencimento || row.status === "cancelada") continue;
      const dias = daysUntil(row.vencimento);
      itens.push({ key: `receber-${row.id}`, tipo: "receber", titulo: `Receber NF ${row.numero}`, detalhe: row.orgao, data: new Date(row.vencimento).toISOString(), diasRestantes: dias, urgencia: urgency(dias), link: `/financeiro?nf=${row.id}` });
    }
  } else logger.warn("[CanonicalAgenda] Recebíveis indisponíveis", invoiceResult.reason);

  if (payableResult.status === "fulfilled") {
    for (const row of payableResult.value) {
      const dias = daysUntil(row.vencimento);
      itens.push({ key: `pagar-${row.id}`, tipo: "pagar", titulo: `Pagar: ${row.descricao}`, detalhe: row.credor ?? row.categoria, data: new Date(row.vencimento).toISOString(), diasRestantes: dias, urgencia: urgency(dias), link: `/financeiro?pagar=${row.id}` });
    }
  } else logger.warn("[CanonicalAgenda] Contas a pagar indisponíveis", payableResult.reason);

  itens.sort((a, b) => a.diasRestantes - b.diasRestantes || a.titulo.localeCompare(b.titulo, "pt-BR"));
  return {
    itens,
    resumo: {
      vencidos: itens.filter((item) => item.diasRestantes < 0).length,
      hoje: itens.filter((item) => item.diasRestantes === 0).length,
      semana: itens.filter((item) => item.diasRestantes >= 0 && item.diasRestantes <= 7).length,
    },
  };
}
