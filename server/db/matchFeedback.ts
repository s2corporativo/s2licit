import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { matchFeedback, type MatchFeedback } from "../../drizzle/schema";
import { getDb } from "./_client";

/** Normaliza um termo do edital para uso como chave de lookup */
export function normalizeEditalTerm(term: string): string {
  return term
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9\s]/g, " ")    // remove pontuação
    .replace(/\s+/g, " ")
    .trim();
}

/** Carrega o mapa de feedback: editalTerm → { productId, productName, useCount } */
export async function loadFeedbackMap(): Promise<Map<string, { productId: number; productName: string; useCount: number }>> {
  const db = await getDb();
  if (!db) return new Map();
  const rows = await db
    .select({
      editalTerm: matchFeedback.editalTerm,
      productId: matchFeedback.productId,
      productName: matchFeedback.productName,
      useCount: matchFeedback.useCount,
    })
    .from(matchFeedback)
    .orderBy(desc(matchFeedback.useCount));
  const map = new Map<string, { productId: number; productName: string; useCount: number }>();
  for (const row of rows) {
    // Mantém apenas o par com maior useCount por termo
    if (!map.has(row.editalTerm)) {
      map.set(row.editalTerm, {
        productId: row.productId,
        productName: row.productName,
        useCount: row.useCount,
      });
    }
  }
  return map;
}

/** Registra ou incrementa um par aprendido (editalTerm → productId) */
export async function recordFeedback(editalTerm: string, productId: number, productName: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const normalizedTerm = normalizeEditalTerm(editalTerm);
  if (!normalizedTerm) return;
  // Verificar se já existe
  const existing = await db
    .select({ id: matchFeedback.id, useCount: matchFeedback.useCount })
    .from(matchFeedback)
    .where(and(eq(matchFeedback.editalTerm, normalizedTerm), eq(matchFeedback.productId, productId)))
    .limit(1);
  if (existing.length > 0) {
    // Incrementar useCount e atualizar lastUsedAt
    await db
      .update(matchFeedback)
      .set({
        useCount: (existing[0].useCount ?? 1) + 1,
        lastUsedAt: new Date(),
        productName, // atualiza o nome caso tenha mudado
      })
      .where(eq(matchFeedback.id, existing[0].id));
  } else {
    // Inserir novo par
    await db.insert(matchFeedback).values({
      editalTerm: normalizedTerm,
      productId,
      productName,
      useCount: 1,
      confirmedAt: new Date(),
      lastUsedAt: new Date(),
    });
  }
}

/** Lista feedbacks com paginação e busca */
export async function listFeedbacks(opts: {
  page?: number;
  pageSize?: number;
  search?: string;
}): Promise<{ items: MatchFeedback[]; total: number }> {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const { page = 1, pageSize = 50, search } = opts;
  const offset = (page - 1) * pageSize;

  const whereClause = search
    ? or(
        like(matchFeedback.editalTerm, `%${search}%`),
        like(matchFeedback.productName, `%${search}%`)
      )
    : undefined;

  const [items, countRows] = await Promise.all([
    db
      .select()
      .from(matchFeedback)
      .where(whereClause)
      .orderBy(desc(matchFeedback.useCount), desc(matchFeedback.lastUsedAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(matchFeedback)
      .where(whereClause),
  ]);

  return { items, total: Number(countRows[0]?.count ?? 0) };
}

/** Remove um feedback pelo ID */
export async function deleteFeedback(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(matchFeedback).where(eq(matchFeedback.id, id));
}

/** Remove múltiplos feedbacks por IDs */
export async function bulkDeleteFeedback(ids: number[]): Promise<void> {
  const db = await getDb();
  if (!db || ids.length === 0) return;
  await db.delete(matchFeedback).where(inArray(matchFeedback.id, ids));
}
