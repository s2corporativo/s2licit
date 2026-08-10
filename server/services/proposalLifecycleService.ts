import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import {
  financialEntries,
  funilOportunidades,
  proposalItems,
  proposalStatusHistory,
  proposals,
  type EtapaFunil,
} from "../../drizzle/schema";
import { getDb } from "../db";
import {
  canEvidenceAdvance,
  transitionOpportunityInTransaction,
} from "./opportunityStateService";

export type ProposalLifecycleStatus = typeof proposals.$inferSelect["status"];

const ALLOWED_PROPOSAL_TRANSITIONS: Readonly<
  Record<ProposalLifecycleStatus, readonly ProposalLifecycleStatus[]>
> = Object.freeze({
  draft: ["sent", "order", "cancelled"],
  sent: ["order", "cancelled"],
  order: ["in_transit", "delivered", "cancelled"],
  in_transit: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
});

const PRICING_REQUIRED_STATUSES = new Set<ProposalLifecycleStatus>([
  "sent",
  "order",
  "in_transit",
  "delivered",
]);

export type AdvanceProposalLifecycleInput = {
  id: number;
  newStatus: ProposalLifecycleStatus;
  notes?: string | null;
  installments?: number;
  firstDueDate?: Date;
  lossReason?: string | null;
  competitorValue?: number;
  actor: string;
};

export type AdvanceProposalLifecycleResult = {
  success: true;
  unchanged: boolean;
  financialEntriesCreated: number;
  opportunityId: number | null;
};

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

function affectedRows(result: unknown): number {
  if (Array.isArray(result)) {
    const first = result[0];
    if (first && typeof first === "object" && "affectedRows" in first) {
      return Number((first as { affectedRows?: number }).affectedRows ?? 0);
    }
  }
  return 0;
}

function assertLifecycleTransition(
  from: ProposalLifecycleStatus,
  to: ProposalLifecycleStatus,
): void {
  if (from === to) return;
  if (!ALLOWED_PROPOSAL_TRANSITIONS[from].includes(to)) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Transição de proposta inválida: ${from} → ${to}.`,
    });
  }
}

function centsFromDecimal(value: string | number | null): number {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Valor total da proposta é inválido.",
    });
  }
  return Math.round(numeric * 100);
}

function decimalFromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function addMonthsClamped(base: Date, months: number): Date {
  const result = new Date(base);
  const originalDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
    result.getHours(),
    result.getMinutes(),
    result.getSeconds(),
    result.getMilliseconds(),
  ).getDate();
  result.setDate(Math.min(originalDay, lastDay));
  return result;
}

function installmentAmounts(totalCents: number, count: number): number[] {
  if (count > totalCents) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Número de parcelas gera parcela de valor zero.",
    });
  }
  const base = Math.floor(totalCents / count);
  const remainder = totalCents % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

async function assertProposalPricingCompleteInTransaction(
  tx: Transaction,
  proposalId: number,
): Promise<void> {
  const [row] = await tx
    .select({
      itemCount: sql<number>`COUNT(*)`,
      missingSalePrice: sql<number>`COALESCE(SUM(CASE WHEN ${proposalItems.suggestedPrice} IS NULL OR CAST(${proposalItems.suggestedPrice} AS DECIMAL(15,2)) <= 0 THEN 1 ELSE 0 END), 0)`,
    })
    .from(proposalItems)
    .where(eq(proposalItems.proposalId, proposalId));

  const itemCount = Number(row?.itemCount ?? 0);
  const missing = Number(row?.missingSalePrice ?? 0);
  if (itemCount <= 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "A proposta não possui itens.",
    });
  }
  if (missing > 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `A proposta possui ${missing} item(ns) sem preço de venda explícito.`,
    });
  }
}

async function resolveOpportunityInTransaction(
  tx: Transaction,
  proposal: {
    radarOpportunityId: number | null;
    processNumber: string | null;
    orgName: string | null;
  },
): Promise<{ id: number; etapa: EtapaFunil } | null> {
  if (proposal.radarOpportunityId != null) {
    const rows = await tx
      .select({ id: funilOportunidades.id, etapa: funilOportunidades.etapa })
      .from(funilOportunidades)
      .where(
        and(
          eq(funilOportunidades.origemTipo, "pncp"),
          eq(funilOportunidades.origemId, proposal.radarOpportunityId),
        ),
      )
      .limit(2);
    if (rows.length === 1) return rows[0];
    if (rows.length > 1) return null;
  }

  if (proposal.processNumber?.trim() && proposal.orgName?.trim()) {
    const rows = await tx
      .select({ id: funilOportunidades.id, etapa: funilOportunidades.etapa })
      .from(funilOportunidades)
      .where(
        and(
          eq(funilOportunidades.numeroProcesso, proposal.processNumber.trim()),
          eq(funilOportunidades.orgao, proposal.orgName.trim()),
        ),
      )
      .limit(2);
    if (rows.length === 1) return rows[0];
  }
  return null;
}

function canonicalTarget(
  status: ProposalLifecycleStatus,
  isLoss: boolean,
): EtapaFunil | null {
  switch (status) {
    case "sent":
      return "enviada";
    case "order":
      return "contrato";
    case "in_transit":
      return "entrega";
    case "delivered":
      return "faturamento";
    case "cancelled":
      return isLoss ? "perdida" : "cancelada";
    case "draft":
      return null;
  }
}

async function createReceivablesInTransaction(
  tx: Transaction,
  proposal: {
    id: number;
    title: string;
    orgName: string | null;
    totalValue: string | null;
  },
  installments: number,
  firstDueDate: Date,
): Promise<number> {
  const totalCents = centsFromDecimal(proposal.totalValue);
  if (totalCents <= 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "A proposta não possui valor total positivo para gerar recebíveis.",
    });
  }

  const existing = await tx
    .select({ id: financialEntries.id })
    .from(financialEntries)
    .where(
      and(
        eq(financialEntries.proposalId, proposal.id),
        eq(financialEntries.type, "income"),
        eq(financialEntries.category, "Proposta"),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "A proposta já possui recebível financeiro; geração duplicada bloqueada.",
    });
  }

  const amounts = installmentAmounts(totalCents, installments);
  const values = amounts.map((amountCents, index) => ({
    type: "income" as const,
    category: "Proposta",
    description:
      installments > 1
        ? `${proposal.title} — Parcela ${index + 1}/${installments}${proposal.orgName ? ` (${proposal.orgName})` : ""}`
        : `${proposal.title}${proposal.orgName ? ` (${proposal.orgName})` : ""}`,
    amount: decimalFromCents(amountCents),
    dueDate: addMonthsClamped(firstDueDate, index),
    isPaid: "no" as const,
    proposalId: proposal.id,
  }));
  await tx.insert(financialEntries).values(values);
  return values.length;
}

export async function advanceProposalLifecycle(
  input: AdvanceProposalLifecycleInput,
): Promise<AdvanceProposalLifecycleResult> {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  }

  const installments = Math.max(1, Math.min(Math.trunc(input.installments ?? 1), 60));
  const firstDueDate = input.firstDueDate ? new Date(input.firstDueDate) : new Date();
  if (Number.isNaN(firstDueDate.getTime())) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Data de vencimento inválida." });
  }

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT ${proposals.id} FROM ${proposals} WHERE ${proposals.id} = ${input.id} FOR UPDATE`,
    );

    const [current] = await tx
      .select({
        id: proposals.id,
        title: proposals.title,
        orgName: proposals.orgName,
        processNumber: proposals.processNumber,
        radarOpportunityId: proposals.radarOpportunityId,
        status: proposals.status,
        totalValue: proposals.totalValue,
      })
      .from(proposals)
      .where(eq(proposals.id, input.id))
      .limit(1);
    if (!current) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Proposta não encontrada." });
    }
    if (current.status === input.newStatus) {
      return {
        success: true,
        unchanged: true,
        financialEntriesCreated: 0,
        opportunityId: null,
      };
    }

    assertLifecycleTransition(current.status, input.newStatus);
    if (input.newStatus !== "delivered" && (input.installments || input.firstDueDate)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Parcelamento financeiro só pode ser informado ao marcar a proposta como entregue.",
      });
    }
    if (input.newStatus !== "cancelled" && (input.lossReason || input.competitorValue != null)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Motivo/valor do concorrente só pode ser informado no cancelamento por perda.",
      });
    }
    if (PRICING_REQUIRED_STATUSES.has(input.newStatus)) {
      await assertProposalPricingCompleteInTransaction(tx, input.id);
      if (current.totalValue == null || centsFromDecimal(current.totalValue) <= 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "O total comercial da proposta ainda não está consolidado.",
        });
      }
    }

    const now = new Date();
    const update: Partial<typeof proposals.$inferInsert> = {
      status: input.newStatus,
      ...(input.newStatus === "sent" ? { sentAt: now } : {}),
      ...(input.newStatus === "order" ? { orderedAt: now } : {}),
      ...(input.newStatus === "in_transit" ? { shippedAt: now } : {}),
      ...(input.newStatus === "delivered" ? { deliveredAt: now } : {}),
      ...(input.newStatus === "cancelled"
        ? {
            cancelledAt: now,
            lossReason: input.lossReason?.trim() || null,
            competitorValue:
              input.competitorValue != null ? String(input.competitorValue) : null,
          }
        : {}),
    };

    const result = await tx
      .update(proposals)
      .set(update)
      .where(and(eq(proposals.id, input.id), eq(proposals.status, current.status)));
    if (affectedRows(result) !== 1) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "A proposta foi alterada por outro processo.",
      });
    }

    await tx.insert(proposalStatusHistory).values({
      proposalId: input.id,
      fromStatus: current.status,
      toStatus: input.newStatus,
      notes: input.notes?.trim() || null,
    });

    let financialEntriesCreated = 0;
    if (input.newStatus === "delivered") {
      financialEntriesCreated = await createReceivablesInTransaction(
        tx,
        current,
        installments,
        firstDueDate,
      );
    }

    const opportunity = await resolveOpportunityInTransaction(tx, current);
    const target = canonicalTarget(
      input.newStatus,
      input.newStatus === "cancelled" &&
        (Boolean(input.lossReason?.trim()) || input.competitorValue != null),
    );
    if (opportunity && target && canEvidenceAdvance(opportunity.etapa, target)) {
      await transitionOpportunityInTransaction(tx, {
        opportunityId: opportunity.id,
        from: opportunity.etapa,
        to: target,
        reason: `[PROPOSTA #${input.id}] status ${input.newStatus}`,
        actor: input.actor,
      });
    }

    return {
      success: true,
      unchanged: false,
      financialEntriesCreated,
      opportunityId: opportunity?.id ?? null,
    };
  });
}
