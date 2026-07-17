import { eq } from "drizzle-orm";
import { companySettings, type InsertCompanySettings } from "../../drizzle/schema";
import { getDb } from "./_client";

export async function getCompanySettings() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(companySettings).limit(1);
  return rows[0] ?? null;
}

export async function upsertCompanySettings(data: Partial<InsertCompanySettings>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await getCompanySettings();
  if (existing) {
    await db.update(companySettings).set(data).where(eq(companySettings.id, existing.id));
    return existing.id;
  } else {
    const [result] = await db.insert(companySettings).values(data as InsertCompanySettings);
    return (result as any).insertId as number;
  }
}
