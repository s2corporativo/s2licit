import { asc, desc, eq, sql } from "drizzle-orm";
import { quotationItems, quotations, type InsertQuotation, type InsertQuotationItem } from "../../drizzle/schema";
import { getDb } from "./_client";

export async function createQuotation(data: InsertQuotation): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(quotations).values(data);
  return (result[0] as any).insertId as number;
}

export async function listQuotations(): Promise<
  { id: number; title: string; clientName: string | null; status: string; createdAt: Date; updatedAt: Date; itemCount: number }[]
> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: quotations.id,
      title: quotations.title,
      clientName: quotations.clientName,
      status: quotations.status,
      createdAt: quotations.createdAt,
      updatedAt: quotations.updatedAt,
      itemCount: sql<number>`count(${quotationItems.id})`,
    })
    .from(quotations)
    .leftJoin(quotationItems, eq(quotationItems.quotationId, quotations.id))
    .groupBy(quotations.id, quotations.title, quotations.clientName, quotations.status, quotations.createdAt, quotations.updatedAt)
    .orderBy(desc(quotations.createdAt));
  return rows;
}

export async function getQuotationWithItems(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [quotation] = await db.select().from(quotations).where(eq(quotations.id, id)).limit(1);
  if (!quotation) return null;
  const items = await db
    .select()
    .from(quotationItems)
    .where(eq(quotationItems.quotationId, id))
    .orderBy(asc(quotationItems.sortOrder), asc(quotationItems.id));
  return { ...quotation, items };
}

export async function updateQuotation(
  id: number,
  data: Partial<InsertQuotation>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(quotations).set(data).where(eq(quotations.id, id));
}

export async function deleteQuotation(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(quotations).where(eq(quotations.id, id));
}

export async function addQuotationItem(data: InsertQuotationItem): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(quotationItems).values(data);
  return (result[0] as any).insertId as number;
}

export async function updateQuotationItem(
  id: number,
  data: Partial<InsertQuotationItem>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(quotationItems).set(data).where(eq(quotationItems.id, id));
}

export async function removeQuotationItem(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(quotationItems).where(eq(quotationItems.id, id));
}
