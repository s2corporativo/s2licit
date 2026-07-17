import { desc, eq, sql } from "drizzle-orm";
import { financialEntries, proposals, type InsertFinancialEntry } from "../../drizzle/schema";
import { getDb } from "./_client";

export async function listFinancialEntries(filters?: {
  type?: "income" | "expense";
  isPaid?: "yes" | "no";
  dateFrom?: Date;
  dateTo?: Date;
  proposalId?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(financialEntries)
    .orderBy(desc(financialEntries.createdAt));

  let result = rows;
  if (filters?.type) result = result.filter((r) => r.type === filters.type);
  if (filters?.isPaid) result = result.filter((r) => r.isPaid === filters.isPaid);
  if (filters?.proposalId) result = result.filter((r) => r.proposalId === filters.proposalId);
  if (filters?.dateFrom) result = result.filter((r) => new Date(r.createdAt) >= filters.dateFrom!);
  if (filters?.dateTo) result = result.filter((r) => new Date(r.createdAt) <= filters.dateTo!);
  return result;
}

export async function createFinancialEntry(data: InsertFinancialEntry) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(financialEntries).values(data);
  return (result as any).insertId as number;
}

export async function updateFinancialEntry(id: number, data: Partial<InsertFinancialEntry>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(financialEntries).set(data).where(eq(financialEntries.id, id));
}

export async function deleteFinancialEntry(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(financialEntries).where(eq(financialEntries.id, id));
}

export async function getFinancialSummary(dateFrom?: Date, dateTo?: Date) {
  const db = await getDb();
  if (!db) return { totalIncome: 0, totalExpense: 0, balance: 0, paidIncome: 0, paidExpense: 0, pendingIncome: 0, pendingExpense: 0 };

  const rows = await db.select().from(financialEntries);
  let filtered = rows;
  if (dateFrom) filtered = filtered.filter((r) => new Date(r.createdAt) >= dateFrom);
  if (dateTo) filtered = filtered.filter((r) => new Date(r.createdAt) <= dateTo);

  const totalIncome = filtered.filter((r) => r.type === "income").reduce((s, r) => s + parseFloat(String(r.amount ?? 0)), 0);
  const totalExpense = filtered.filter((r) => r.type === "expense").reduce((s, r) => s + parseFloat(String(r.amount ?? 0)), 0);
  const paidIncome = filtered.filter((r) => r.type === "income" && r.isPaid === "yes").reduce((s, r) => s + parseFloat(String(r.amount ?? 0)), 0);
  const paidExpense = filtered.filter((r) => r.type === "expense" && r.isPaid === "yes").reduce((s, r) => s + parseFloat(String(r.amount ?? 0)), 0);

  return {
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
    paidIncome,
    paidExpense,
    pendingIncome: totalIncome - paidIncome,
    pendingExpense: totalExpense - paidExpense,
  };
}

export async function getProposalFinancialStats() {
  const db = await getDb();
  if (!db) return { byStatus: [] };
  const rows = await db.select().from(proposals);
  const statusGroups: Record<string, { count: number; total: number }> = {};
  for (const row of rows) {
    const s = row.status ?? "draft";
    if (!statusGroups[s]) statusGroups[s] = { count: 0, total: 0 };
    statusGroups[s].count++;
    statusGroups[s].total += parseFloat(String(row.totalValue ?? 0));
  }
  return {
    byStatus: Object.entries(statusGroups).map(([status, data]) => ({ status, ...data })),
  };
}

// ─── Freight Report ───────────────────────────────────────────────────────────
export async function getFreightReport(dateFrom?: Date, dateTo?: Date) {
  const db = await getDb();
  if (!db) return { byCarrier: [], total: 0, totalPaid: 0 };
  const rows = await db
    .select({
      id: proposals.id,
      title: proposals.title,
      freightValue: proposals.freightValue,
      freightCarrier: proposals.freightCarrier,
      freightTrackingCode: proposals.freightTrackingCode,
      freightPaidAt: proposals.freightPaidAt,
      deliveredAt: proposals.deliveredAt,
      status: proposals.status,
    })
    .from(proposals)
    .where(sql`${proposals.freightValue} IS NOT NULL AND CAST(${proposals.freightValue} AS DECIMAL) > 0`);

  let filtered = rows;
  if (dateFrom) filtered = filtered.filter((r) => r.deliveredAt && new Date(r.deliveredAt) >= dateFrom);
  if (dateTo) filtered = filtered.filter((r) => r.deliveredAt && new Date(r.deliveredAt) <= dateTo);

  // Group by carrier
  const byCarrier: Record<string, { carrier: string; count: number; total: number; paid: number; items: typeof filtered }> = {};
  for (const row of filtered) {
    const carrier = row.freightCarrier ?? "Sem transportadora";
    if (!byCarrier[carrier]) byCarrier[carrier] = { carrier, count: 0, total: 0, paid: 0, items: [] };
    const val = parseFloat(String(row.freightValue ?? 0));
    byCarrier[carrier].count++;
    byCarrier[carrier].total += val;
    if (row.freightPaidAt) byCarrier[carrier].paid += val;
    byCarrier[carrier].items.push(row);
  }

  const total = filtered.reduce((s, r) => s + parseFloat(String(r.freightValue ?? 0)), 0);
  const totalPaid = filtered.filter((r) => r.freightPaidAt).reduce((s, r) => s + parseFloat(String(r.freightValue ?? 0)), 0);

  return {
    byCarrier: Object.values(byCarrier).sort((a, b) => b.total - a.total),
    total,
    totalPaid,
    items: filtered,
  };
}
