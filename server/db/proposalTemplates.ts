import { asc, eq, ne } from "drizzle-orm";
import { proposalTemplates, type ProposalTemplate, type InsertProposalTemplate } from "../../drizzle/schema";
import { getDb } from "./_client";

export async function listProposalTemplates(): Promise<ProposalTemplate[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(proposalTemplates).orderBy(asc(proposalTemplates.name));
  } catch (error) {
    console.error("[listProposalTemplates] Error:", error);
    return [];
  }
}

export async function getProposalTemplate(id: number): Promise<ProposalTemplate | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const rows = await db.select().from(proposalTemplates).where(eq(proposalTemplates.id, id)).limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error("[getProposalTemplate] Error:", error);
    return null;
  }
}

export async function createProposalTemplate(data: InsertProposalTemplate): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Se isDefault=yes, desmarcar os outros
  if (data.isDefault === "yes") {
    await db.update(proposalTemplates).set({ isDefault: "no" } as any).where(eq(proposalTemplates.isDefault, "yes"));
  }
  const [result] = await db.insert(proposalTemplates).values(data);
  return (result as any).insertId as number;
}

export async function updateProposalTemplate(id: number, data: Partial<InsertProposalTemplate>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  if (data.isDefault === "yes") {
    await db.update(proposalTemplates).set({ isDefault: "no" } as any).where(ne(proposalTemplates.id, id));
  }
  await db.update(proposalTemplates).set({ ...data, updatedAt: new Date() } as any).where(eq(proposalTemplates.id, id));
}

export async function deleteProposalTemplate(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(proposalTemplates).where(eq(proposalTemplates.id, id));
}

export async function getDefaultProposalTemplate(): Promise<ProposalTemplate | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const rows = await db.select().from(proposalTemplates).where(eq(proposalTemplates.isDefault, "yes")).limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error("[getDefaultProposalTemplate] Error:", error);
    return null;
  }
}
