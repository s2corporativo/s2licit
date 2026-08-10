import { and, asc, desc, eq, gte, like, lte, sql, type SQL } from "drizzle-orm";
import {
  proposalItems,
  proposalStatusHistory,
  proposals,
  type InsertProposal,
  type InsertProposalItem,
} from "../../drizzle/schema";
import { getDb } from "./_client";

export type ProposalStatus = typeof proposals.$inferSelect["status"];
const PROPOSAL_STATUSES = new Set<ProposalStatus>([
  "draft",
  "sent",
  "order",
  "in_transit",
  "delivered",
  "cancelled",
]);

function getInsertId(result: unknown): number {
  if (Array.isArray(result)) {
    const first = result[0];
    if (first && typeof first === "object" && "insertId" in first) {
      return Number((first as { insertId?: number }).insertId ?? 0);
    }
  }
  return 0;
}

function getAffectedRows(result: unknown): number {
  if (Array.isArray(result)) {
    const first = result[0];
    if (first && typeof first === "object" && "affectedRows" in first) {
      return Number((first as { affectedRows?: number }).affectedRows ?? 0);
    }
  }
  return 0;
}

function escapeLikePrefix(value: string): string {
  return `${value.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

export async function listProposals(limit = 500) {
  const db = await getDb();
  if (!db) return [];
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 1000));
  return db
    .select({
      id: proposals.id,
      processNumber: proposals.processNumber,
      orgId: proposals.orgId,
      orgName: proposals.orgName,
      title: proposals.title,
      status: proposals.status,
      validityDays: proposals.validityDays,
      paymentTerms: proposals.paymentTerms,
      deliveryTerms: proposals.deliveryTerms,
      notes: proposals.notes,
      createdAt: proposals.createdAt,
      updatedAt: proposals.updatedAt,
    })
    .from(proposals)
    .orderBy(desc(proposals.createdAt), desc(proposals.id))
    .limit(safeLimit);
}

export async function getProposalWithItems(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, id)).limit(1);
  if (!proposal) return null;
  const items = await db
    .select()
    .from(proposalItems)
    .where(eq(proposalItems.proposalId, id))
    .orderBy(asc(proposalItems.sortOrder), asc(proposalItems.itemNumber));
  return { ...proposal, items };
}

export async function createProposal(data: InsertProposal) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(proposals).values(data);
  const id = getInsertId(result);
  if (!id) throw new Error("Proposal insert did not return an id");
  return id;
}

export async function updateProposal(id: number, data: Partial<InsertProposal>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(proposals).set(data).where(eq(proposals.id, id));
}

export async function deleteProposal(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(proposals).where(eq(proposals.id, id));
}

export async function recalcProposalTotal(proposalId: number) {
  const db = await getDb();
  if (!db) return;
  const [row] = await db
    .select({
      total: sql<number>`COALESCE(SUM(CAST(${proposalItems.totalPrice} AS DECIMAL(15,2))), 0)`,
    })
    .from(proposalItems)
    .where(eq(proposalItems.proposalId, proposalId));
  const total = Number(row?.total ?? 0);
  await db
    .update(proposals)
    .set({ totalValue: total.toFixed(2) })
    .where(eq(proposals.id, proposalId));
}

/**
 * Adição interativa de item. Serializa numeração por proposta e atualiza o
 * total incrementalmente no mesmo commit. Com índice (proposalId,itemNumber),
 * MAX passa a O(log n) e não há SUM completo a cada inserção.
 */
export async function addProposalItem(data: InsertProposalItem) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT ${proposals.id} FROM ${proposals} WHERE ${proposals.id} = ${data.proposalId} FOR UPDATE`,
    );
    const [existing] = await tx
      .select({ max: sql<number>`COALESCE(MAX(${proposalItems.itemNumber}), 0)` })
      .from(proposalItems)
      .where(eq(proposalItems.proposalId, data.proposalId));
    const nextNumber = Number(existing?.max ?? 0) + 1;
    const unitPrice = data.unitPrice == null ? null : Number(data.unitPrice);
    const quantity = Number(data.quantity ?? 1);
    const total =
      unitPrice != null && Number.isFinite(unitPrice) && Number.isFinite(quantity)
        ? (unitPrice * quantity).toFixed(2)
        : null;

    const result = await tx.insert(proposalItems).values({
      ...data,
      itemNumber: nextNumber,
      totalPrice: total,
      sortOrder: nextNumber,
    });
    const id = getInsertId(result);
    if (!id) throw new Error("Proposal item insert did not return an id");

    if (total != null) {
      await tx
        .update(proposals)
        .set({
          totalValue: sql`COALESCE(${proposals.totalValue}, 0) + ${total}`,
        })
        .where(eq(proposals.id, data.proposalId));
    }
    return id;
  });
}

export async function updateProposalItem(id: number, data: Partial<InsertProposalItem>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const [existing] = await db.select().from(proposalItems).where(eq(proposalItems.id, id)).limit(1);
  if (!existing) throw new Error("Proposal item not found");

  if (
    data.suggestedPrice !== undefined ||
    data.unitPrice !== undefined ||
    data.quantity !== undefined
  ) {
    const suggestedPrice =
      data.suggestedPrice !== undefined
        ? data.suggestedPrice == null
          ? null
          : Number(data.suggestedPrice)
        : existing.suggestedPrice == null
          ? null
          : Number(existing.suggestedPrice);
    const unitPrice =
      data.unitPrice !== undefined
        ? data.unitPrice == null
          ? 0
          : Number(data.unitPrice)
        : Number(existing.unitPrice ?? 0);
    const price = suggestedPrice ?? unitPrice;
    const quantity = Number(data.quantity ?? existing.quantity);
    data.totalPrice = (price * quantity).toFixed(2);
  }

  await db.transaction(async (tx) => {
    await tx.update(proposalItems).set(data).where(eq(proposalItems.id, id));
    const [row] = await tx
      .select({ total: sql<number>`COALESCE(SUM(CAST(${proposalItems.totalPrice} AS DECIMAL(15,2))), 0)` })
      .from(proposalItems)
      .where(eq(proposalItems.proposalId, existing.proposalId));
    await tx
      .update(proposals)
      .set({ totalValue: Number(row?.total ?? 0).toFixed(2) })
      .where(eq(proposals.id, existing.proposalId));
  });
}

export async function removeProposalItem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [existing] = await db
    .select({ proposalId: proposalItems.proposalId })
    .from(proposalItems)
    .where(eq(proposalItems.id, id))
    .limit(1);
  if (!existing) return;

  await db.transaction(async (tx) => {
    await tx.delete(proposalItems).where(eq(proposalItems.id, id));
    const [row] = await tx
      .select({ total: sql<number>`COALESCE(SUM(CAST(${proposalItems.totalPrice} AS DECIMAL(15,2))), 0)` })
      .from(proposalItems)
      .where(eq(proposalItems.proposalId, existing.proposalId));
    await tx
      .update(proposals)
      .set({ totalValue: Number(row?.total ?? 0).toFixed(2) })
      .where(eq(proposals.id, existing.proposalId));
  });
}

export async function listProposalsAdmin(filters?: {
  status?: string;
  orgName?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions: SQL[] = [];
  if (filters?.status && PROPOSAL_STATUSES.has(filters.status as ProposalStatus)) {
    conditions.push(eq(proposals.status, filters.status as ProposalStatus));
  }
  if (filters?.orgName?.trim()) {
    conditions.push(like(proposals.orgName, escapeLikePrefix(filters.orgName.trim())));
  }
  if (filters?.dateFrom) conditions.push(gte(proposals.createdAt, filters.dateFrom));
  if (filters?.dateTo) conditions.push(lte(proposals.createdAt, filters.dateTo));
  const limit = Math.max(1, Math.min(filters?.limit ?? 300, 1000));

  return db
    .select()
    .from(proposals)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(proposals.createdAt), desc(proposals.id))
    .limit(limit);
}

export async function advanceProposalStatus(
  id: number,
  newStatus: string,
  notes?: string,
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (!PROPOSAL_STATUSES.has(newStatus as ProposalStatus)) {
    throw new Error(`Invalid proposal status: ${newStatus}`);
  }
  const target = newStatus as ProposalStatus;

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ status: proposals.status })
      .from(proposals)
      .where(eq(proposals.id, id))
      .limit(1);
    if (!current) throw new Error("Proposal not found");
    if (current.status === target) return { success: true, unchanged: true };

    const now = new Date();
    const dateFields: Partial<typeof proposals.$inferInsert> = {};
    if (target === "sent") dateFields.sentAt = now;
    if (target === "order") dateFields.orderedAt = now;
    if (target === "in_transit") dateFields.shippedAt = now;
    if (target === "delivered") dateFields.deliveredAt = now;
    if (target === "cancelled") dateFields.cancelledAt = now;

    const result = await tx
      .update(proposals)
      .set({ status: target, ...dateFields })
      .where(and(eq(proposals.id, id), eq(proposals.status, current.status)));
    if (getAffectedRows(result) !== 1) {
      throw new Error("Proposal status changed concurrently");
    }

    await tx.insert(proposalStatusHistory).values({
      proposalId: id,
      fromStatus: current.status,
      toStatus: target,
      notes: notes ?? null,
    });
    return { success: true, unchanged: false };
  });
}

export async function updateProposalFreight(
  id: number,
  data: {
    freightValue?: string | null;
    freightCarrier?: string | null;
    freightTrackingCode?: string | null;
    freightPaidAt?: Date | null;
  },
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(proposals).set(data).where(eq(proposals.id, id));
}

export async function getProposalStatusHistory(proposalId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(proposalStatusHistory)
    .where(eq(proposalStatusHistory.proposalId, proposalId))
    .orderBy(desc(proposalStatusHistory.createdAt));
}

export async function duplicateProposal(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const original = await getProposalWithItems(id);
  if (!original) throw new Error("Proposal not found");
  const { items, ...proposalData } = original;

  return db.transaction(async (tx) => {
    const result = await tx.insert(proposals).values({
      title: `Cópia de ${proposalData.title}`,
      processNumber: proposalData.processNumber,
      orgId: proposalData.orgId,
      orgName: proposalData.orgName,
      status: "draft",
      validityDays: proposalData.validityDays,
      paymentTerms: proposalData.paymentTerms,
      deliveryTerms: proposalData.deliveryTerms,
      notes: proposalData.notes,
    });
    const newId = getInsertId(result);
    if (!newId) throw new Error("Proposal copy insert did not return an id");

    if (items.length > 0) {
      await tx.insert(proposalItems).values(
        items.map((item) => ({
          proposalId: newId,
          productId: item.productId,
          itemNumber: item.itemNumber,
          productName: item.productName,
          activeIngredient: item.activeIngredient,
          manufacturer: item.manufacturer,
          concentration: item.concentration,
          presentation: item.presentation,
          unit: item.unit,
          supplierName: item.supplierName,
          unitPrice: item.unitPrice,
          costPrice: item.costPrice,
          editalRefPrice: item.editalRefPrice,
          suggestedPrice: item.suggestedPrice,
          quantity: item.quantity,
          totalPrice: item.totalPrice,
          notes: item.notes,
          imageUrl: item.imageUrl,
          productUrl: item.productUrl,
          registroMapa: item.registroMapa,
          sortOrder: item.sortOrder,
        })),
      );
    }
    await tx
      .update(proposals)
      .set({ totalValue: proposalData.totalValue })
      .where(eq(proposals.id, newId));
    return newId;
  });
}

export async function getExpiringProposals(daysAhead = 7) {
  const db = await getDb();
  if (!db) return [];
  const safeDays = Math.max(0, Math.min(Math.trunc(daysAhead), 365));
  const expiresAt = sql<Date>`DATE_ADD(COALESCE(${proposals.sentAt}, ${proposals.createdAt}), INTERVAL COALESCE(${proposals.validityDays}, 30) DAY)`;
  const daysLeft = sql<number>`DATEDIFF(${expiresAt}, CURRENT_DATE)`;

  return db
    .select({
      id: proposals.id,
      title: proposals.title,
      processNumber: proposals.processNumber,
      orgName: proposals.orgName,
      status: proposals.status,
      sentAt: proposals.sentAt,
      validityDays: proposals.validityDays,
      createdAt: proposals.createdAt,
      expiresAt,
      daysLeft,
    })
    .from(proposals)
    .where(
      and(
        eq(proposals.status, "sent"),
        sql`${expiresAt} <= DATE_ADD(CURRENT_DATE, INTERVAL ${safeDays} DAY)`,
      ),
    )
    .orderBy(asc(expiresAt));
}
