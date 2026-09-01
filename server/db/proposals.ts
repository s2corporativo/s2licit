import { asc, desc, eq, sql } from "drizzle-orm";
import { proposalItems, proposalStatusHistory, proposals, suppliers, type InsertProposal, type InsertProposalItem } from "../../drizzle/schema";
import { parseProposalQuantity } from "../services/proposalQuantity";
import { getDb } from "./_client";

/**
 * Resolve o fornecedor pelo nome (texto livre histórico em `supplierName`)
 * para preencher a FK `supplierId` (Ressalva 4, Módulo 06) sem exigir que os
 * ~49 pontos de criação de item de proposta sejam reescritos. Casamento
 * exato por nome (case-insensitive); nomes divergentes ficam NULL — o
 * vínculo é oportunista, não obrigatório.
 */
async function resolveSupplierIdByName(name: string | null | undefined): Promise<number | null> {
  if (!name?.trim()) return null;
  const db = await getDb();
  if (!db) return null;
  const [match] = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(sql`LOWER(${suppliers.name}) = LOWER(${name.trim()})`)
    .limit(1);
  return match?.id ?? null;
}

export async function listProposals() {
  const db = await getDb();
  if (!db) return [];
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
    .orderBy(desc(proposals.createdAt));
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
  const [result] = await db.insert(proposals).values(data);
  return (result as any).insertId as number;
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

/**
 * Recalcula e persiste proposals.totalValue a partir da soma dos itens.
 * Sem isto, o total ficava sempre nulo e o faturamento (que depende de
 * `if (proposal.totalValue)`) nunca era gerado ao entregar.
 */
export async function recalcProposalTotal(proposalId: number) {
  const db = await getDb();
  if (!db) return;
  const [row] = await db
    .select({ total: sql<number>`COALESCE(SUM(CAST(${proposalItems.totalPrice} AS DECIMAL(15,2))), 0)` })
    .from(proposalItems)
    .where(eq(proposalItems.proposalId, proposalId));
  const total = Number(row?.total ?? 0);
  await db.update(proposals).set({ totalValue: total.toFixed(2) as any }).where(eq(proposals.id, proposalId));
}

export async function addProposalItem(data: InsertProposalItem) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await db
    .select({ max: sql<number>`MAX(${proposalItems.itemNumber})` })
    .from(proposalItems)
    .where(eq(proposalItems.proposalId, data.proposalId));
  const nextNum = (existing[0]?.max ?? 0) + 1;
  const quantity = parseProposalQuantity(data.quantity ?? 1);
  const total = data.unitPrice
    ? (parseFloat(String(data.unitPrice)) * quantity).toFixed(2)
    : null;
  const supplierId = data.supplierId ?? (await resolveSupplierIdByName(data.supplierName));
  const [result] = await db.insert(proposalItems).values({
    ...data,
    quantity: quantity as any,
    supplierId,
    itemNumber: nextNum,
    totalPrice: total as any,
    sortOrder: nextNum,
  });
  await recalcProposalTotal(data.proposalId);
  return (result as any).insertId as number;
}

export async function updateProposalItem(id: number, data: Partial<InsertProposalItem>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (data.suggestedPrice !== undefined || data.unitPrice !== undefined || data.quantity !== undefined) {
    const [existing] = await db.select().from(proposalItems).where(eq(proposalItems.id, id)).limit(1);
    if (existing) {
      const suggestedP = data.suggestedPrice !== undefined ? parseFloat(String(data.suggestedPrice)) : (existing.suggestedPrice ? parseFloat(String(existing.suggestedPrice)) : null);
      const unitP = data.unitPrice !== undefined ? parseFloat(String(data.unitPrice)) : parseFloat(String(existing.unitPrice ?? 0));
      const price = suggestedP !== null ? suggestedP : unitP;
      const qty = parseProposalQuantity(data.quantity !== undefined ? data.quantity : existing.quantity);
      if (data.quantity !== undefined) data.quantity = qty as any;
      data.totalPrice = (price * qty).toFixed(2) as any;
    }
  }
  if (data.supplierName !== undefined && data.supplierId === undefined) {
    data.supplierId = await resolveSupplierIdByName(data.supplierName);
  }
  await db.update(proposalItems).set(data).where(eq(proposalItems.id, id));
  const [it] = await db.select({ proposalId: proposalItems.proposalId }).from(proposalItems).where(eq(proposalItems.id, id)).limit(1);
  if (it) await recalcProposalTotal(it.proposalId);
}

export async function removeProposalItem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [it] = await db.select({ proposalId: proposalItems.proposalId }).from(proposalItems).where(eq(proposalItems.id, id)).limit(1);
  await db.delete(proposalItems).where(eq(proposalItems.id, id));
  if (it) await recalcProposalTotal(it.proposalId);
}

// ─── Proposal Administration ─────────────────────────────────────────────────

export async function listProposalsAdmin(filters?: {
  status?: string;
  orgName?: string;
  dateFrom?: Date;
  dateTo?: Date;
}) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(proposals)
    .orderBy(desc(proposals.createdAt));

  let result = rows;
  if (filters?.status) result = result.filter((r) => r.status === filters.status);
  if (filters?.orgName) result = result.filter((r) => r.orgName?.toLowerCase().includes(filters.orgName!.toLowerCase()));
  if (filters?.dateFrom) result = result.filter((r) => new Date(r.createdAt) >= filters.dateFrom!);
  if (filters?.dateTo) result = result.filter((r) => new Date(r.createdAt) <= filters.dateTo!);
  return result;
}

export async function advanceProposalStatus(
  id: number,
  newStatus: string,
  notes?: string
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [current] = await db.select().from(proposals).where(eq(proposals.id, id)).limit(1);
  if (!current) throw new Error("Proposal not found");

  const now = new Date();
  const dateFields: Record<string, Date | null> = {};
  if (newStatus === "sent") dateFields.sentAt = now;
  if (newStatus === "order") dateFields.orderedAt = now;
  if (newStatus === "in_transit") dateFields.shippedAt = now;
  if (newStatus === "delivered") dateFields.deliveredAt = now;
  if (newStatus === "cancelled") dateFields.cancelledAt = now;

  await db.update(proposals).set({ status: newStatus as any, ...dateFields }).where(eq(proposals.id, id));

  await db.insert(proposalStatusHistory).values({
    proposalId: id,
    fromStatus: current.status,
    toStatus: newStatus,
    notes: notes ?? null,
  });

  return { success: true };
}

export async function updateProposalFreight(
  id: number,
  data: {
    freightValue?: string | null;
    freightCarrier?: string | null;
    freightTrackingCode?: string | null;
    freightPaidAt?: Date | null;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(proposals).set(data as any).where(eq(proposals.id, id));
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
    const [newResult] = await tx.insert(proposals).values({
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
    const newId = (newResult as any).insertId as number;
    if (items && items.length > 0) {
      for (const item of items) {
        await tx.insert(proposalItems).values({
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
          supplierId: item.supplierId,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          totalPrice: item.totalPrice,
          notes: item.notes,
          imageUrl: item.imageUrl,
          productUrl: item.productUrl,
          sortOrder: item.sortOrder,
        });
      }
    }
    return newId;
  });
}

export async function getExpiringProposals(daysAhead = 7) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: proposals.id,
      title: proposals.title,
      processNumber: proposals.processNumber,
      orgName: proposals.orgName,
      status: proposals.status,
      sentAt: proposals.sentAt,
      validityDays: proposals.validityDays,
      createdAt: proposals.createdAt,
    })
    .from(proposals)
    .where(eq(proposals.status, "sent"));

  const now = new Date();
  const cutoff = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  return rows
    .map((r) => {
      const base = r.sentAt ? new Date(r.sentAt) : new Date(r.createdAt);
      const expiresAt = new Date(base.getTime() + (r.validityDays ?? 30) * 24 * 60 * 60 * 1000);
      const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return { ...r, expiresAt, daysLeft };
    })
    .filter((r) => r.expiresAt <= cutoff)
    .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
}
