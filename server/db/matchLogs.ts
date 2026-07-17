import { getDb } from "./_client";

export async function createMatchLog(data: {
  editalItem: string; editalAnalysisId?: number | null;
  produtoSugeridoId?: number | null; produtoSugeridoNome?: string | null;
  score?: number | null; decisao?: string | null; tempoExecucaoMs?: number | null;
}) {
  const db = await getDb();
  if (!db) return;
  const { matchLogs } = await import("../../drizzle/schema");
  await db.insert(matchLogs).values({ ...data, createdAt: new Date() } as any);
}

export async function getMatchLogsByAnalysis(analysisId: number) {
  const db = await getDb();
  if (!db) return [];
  const { matchLogs } = await import("../../drizzle/schema");
  const { eq, desc } = await import("drizzle-orm");
  return db.select().from(matchLogs).where(eq(matchLogs.editalAnalysisId, analysisId)).orderBy(desc(matchLogs.createdAt));
}

export async function createMatchFeedbackV2(data: {
  analysisId: number; itemDescription: string; matchedProductId: number;
  feedback: string; userId?: number | null;
}) {
  return createMatchLog({ editalItem: data.itemDescription, editalAnalysisId: data.analysisId, produtoSugeridoId: data.matchedProductId, decisao: data.feedback });
}

export async function listAllProductsForMatching() {
  const db = await getDb();
  if (!db) return [];
  const { products } = await import("../../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  return db.select({
    id: products.id,
    name: products.name,
    fichaTecnica: products.fichaTecnica,
    principioAtivo: (products as any).principioAtivo,
    categoryId: products.categoryId,
  }).from(products).where(eq(products.isActive, "yes")).limit(5000);
}
