import { getDb } from "./_client";

export async function listEditalAnalyses() {
  const db = await getDb();
  if (!db) return [];
  const { editalAnalyses } = await import("../../drizzle/schema");
  const { desc } = await import("drizzle-orm");
  return db.select().from(editalAnalyses).orderBy(desc(editalAnalyses.createdAt));
}

export async function createEditalAnalysis(data: {
  fileName: string; fileUrl: string; fileKey?: string | null; licitacaoId?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const { editalAnalyses } = await import("../../drizzle/schema");
  const [res] = await db.insert(editalAnalyses).values({ ...data, status: "pendente", createdAt: new Date() } as any);
  return (res as any).insertId as number;
}

export async function getEditalAnalysis(id: number) {
  const db = await getDb();
  if (!db) return null;
  const { editalAnalyses } = await import("../../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const rows = await db.select().from(editalAnalyses).where(eq(editalAnalyses.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateEditalAnalysis(id: number, data: Partial<{ status: string; errorMessage: string | null; itensExtraidos: any; proposalId: number | null; prazosEntrega: string | null; condicoesPagamento: string | null; documentosExigidos: any; orgaoComprador: string | null; numeroEdital: string | null; processedAt: Date | null }>) {
  const db = await getDb();
  if (!db) return;
  const { editalAnalyses } = await import("../../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  await db.update(editalAnalyses).set(data as any).where(eq(editalAnalyses.id, id));
}
