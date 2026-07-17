import { and, asc, eq, like } from "drizzle-orm";
import { requestingOrgs, type InsertRequestingOrg } from "../../drizzle/schema";
import { getDb } from "./_client";

export async function listRequestingOrgs(search?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions = search ? [like(requestingOrgs.name, `%${search}%`)] : [];
  return db
    .select()
    .from(requestingOrgs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(requestingOrgs.name));
}

export async function getRequestingOrgById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(requestingOrgs).where(eq(requestingOrgs.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function upsertRequestingOrg(data: InsertRequestingOrg) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Check if org with same name exists
  const existing = await db
    .select()
    .from(requestingOrgs)
    .where(eq(requestingOrgs.name, data.name))
    .limit(1);
  if (existing[0]) {
    await db.update(requestingOrgs).set(data).where(eq(requestingOrgs.id, existing[0].id));
    return existing[0].id;
  }
  const [result] = await db.insert(requestingOrgs).values(data);
  return (result as any).insertId as number;
}

export async function updateRequestingOrg(id: number, data: Partial<InsertRequestingOrg>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(requestingOrgs).set(data).where(eq(requestingOrgs.id, id));
}

export async function deleteRequestingOrg(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(requestingOrgs).where(eq(requestingOrgs.id, id));
}
