/**
 * Relações entre produtos — camada de dados (Fonte Única).
 *
 * Gerencia o registro auditável de relações decididas entre dois produtos:
 * duplicidade, equivalência, compatibilidade, substituto, similaridade.
 *
 * Convenções canônicas (spec §3 — Mapa da Verdade):
 * - O par é armazenado com productIdA < productIdB (unicidade simples).
 * - Toda relação sugerida por motor nasce com status "pending" e
 *   decidedBy = "system"; decisão humana converte para "confirmed" ou
 *   "rejected" com auditoria (confirmedBy / confirmedAt).
 * - A evidência segue o formato { reason, matchingFields, conflictingFields }.
 */
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { products, productRelations } from "../../drizzle/schema";
import { getDb } from "./_client";

export type RelationType =
  | "EXACT_DUPLICATE"
  | "SAME_PRODUCT_DIFFERENT_SOURCE"
  | "EQUIVALENT"
  | "COMPATIBLE"
  | "SUBSTITUTE"
  | "SIMILAR"
  | "NOT_EQUIVALENT";

export type RelationStatus = "pending" | "confirmed" | "rejected";

export const VALID_RELATION_TYPES: ReadonlyArray<RelationType> = [
  "EXACT_DUPLICATE",
  "SAME_PRODUCT_DIFFERENT_SOURCE",
  "EQUIVALENT",
  "COMPATIBLE",
  "SUBSTITUTE",
  "SIMILAR",
  "NOT_EQUIVALENT",
] as const;

export function isAllowedRelationType(value: string): value is RelationType {
  return (VALID_RELATION_TYPES as readonly string[]).includes(value);
}

export type RelationEvidence = {
  reason?: string;
  matchingFields?: Record<string, string>;
  conflictingFields?: Record<string, { a: string; b: string }>;
  [k: string]: unknown;
};

export type UpsertRelationInput = {
  productIdA: number;
  productIdB: number;
  relationType: RelationType;
  score?: number | null;
  evidence?: RelationEvidence;
};

/** Ordena o par para a convenção canônica productIdA < productIdB. */
export function canonicalPair(productIdA: number, productIdB: number): {
  productIdA: number;
  productIdB: number;
} {
  if (!Number.isInteger(productIdA) || !Number.isInteger(productIdB) || productIdA === productIdB) {
    throw new Error(`Par de produtos inválido: ${productIdA}, ${productIdB}`);
  }
  return productIdA < productIdB
    ? { productIdA, productIdB }
    : { productIdA: productIdB, productIdB: productIdA };
}

/**
 * Registra ou atualiza uma relação entre dois produtos.
 * - Decisão manual (decidedBy = "user"): já nasce "confirmed" e preenche
 *   confirmedBy/confirmedAt (o usuário confirmado é o createdBy).
 * - Sugerida por motor (decidedBy = "system"): nasce "pending" com score.
 */
export async function upsertRelation(
  input: UpsertRelationInput,
  opts: { decidedBy: "user" | "system"; userId?: number | null } = { decidedBy: "system" }
): Promise<{ id: number; status: RelationStatus }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (!VALID_RELATION_TYPES.includes(input.relationType)) {
    throw new Error(`relationType inválido: ${input.relationType}`);
  }
  const pair = canonicalPair(input.productIdA, input.productIdB);
  const status: RelationStatus = opts.decidedBy === "user" ? "confirmed" : "pending";
  const now = new Date();

  await db
    .insert(productRelations)
    .values({
      productIdA: pair.productIdA,
      productIdB: pair.productIdB,
      relationType: input.relationType,
      status,
      score: input.score != null ? input.score.toFixed(4) : null,
      evidence: input.evidence ?? null,
      decidedBy: opts.decidedBy,
      createdBy: opts.decidedBy === "user" ? (opts.userId ?? null) : null,
      confirmedBy: opts.decidedBy === "user" ? (opts.userId ?? null) : null,
      confirmedAt: opts.decidedBy === "user" ? now : null,
    })
    .onDuplicateKeyUpdate({
      set: {
        relationType: input.relationType,
        status,
        score: input.score != null ? input.score.toFixed(4) : null,
        evidence: input.evidence ?? null,
        decidedBy: opts.decidedBy,
        confirmedBy: opts.decidedBy === "user" ? (opts.userId ?? null) : undefined,
        confirmedAt: opts.decidedBy === "user" ? now : undefined,
      },
    });

  const [row] = await db
    .select({ id: productRelations.id, status: productRelations.status })
    .from(productRelations)
    .where(and(eq(productRelations.productIdA, pair.productIdA), eq(productRelations.productIdB, pair.productIdB)))
    .limit(1);
  return { id: row.id, status: row.status as RelationStatus };
}

/**
 * Marca uma relação pendente como confirmada ou rejeitada (decisão humana).
 */
export async function decideRelation(
  relationId: number,
  decision: "confirmed" | "rejected",
  userId?: number | null
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const affected = await db
    .update(productRelations)
    .set({
      status: decision,
      confirmedBy: userId ?? null,
      confirmedAt: new Date(),
    })
    .where(eq(productRelations.id, relationId));
  return (affected as any).changedRows > 0;
}

/** Remove uma relação pelo id (usado pela tela quando o usuário discorda do match). */
export async function removeRelation(relationId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const affected = await db.delete(productRelations).where(eq(productRelations.id, relationId));
  return (affected as any).changedRows > 0;
}

/** Lista todas as relações de um produto (qualquer posição do par). */
export async function listRelationsByProduct(productId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(productRelations)
    .where(or(eq(productRelations.productIdA, productId), eq(productRelations.productIdB, productId)))
    .orderBy(desc(productRelations.confirmedAt), desc(productRelations.createdAt));
}

/** Lista relações pendentes (aguardando revisão), com dados dos produtos. */
export async function listPendingRelations(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      relation: productRelations,
      productA: products,
      productB: products,
    })
    .from(productRelations)
    .leftJoin(products, eq(productRelations.productIdA, products.id))
    .innerJoin(products, eq(productRelations.productIdB, products.id))
    .where(eq(productRelations.status, "pending"))
    .orderBy(desc(productRelations.score as any))
    .limit(limit);
}

/**
 * Lista relações confirmadas entre conjuntos de produtos (usado por
 * dashboards e pelos módulos de cotação/equivalência).
 */
export async function listConfirmedRelations(productIds: number[]) {
  const db = await getDb();
  if (!db || productIds.length === 0) return [];
  const pairs: { productIdA: number; productIdB: number }[] = [];
  for (let i = 0; i < productIds.length; i++) {
    for (let j = i + 1; j < productIds.length; j++) {
      pairs.push(canonicalPair(productIds[i], productIds[j]));
    }
  }
  return db
    .select()
    .from(productRelations)
    .where(
      and(
        or(...pairs.map((p) => and(eq(productRelations.productIdA, p.productIdA), eq(productRelations.productIdB, p.productIdB)))),
        eq(productRelations.status, "confirmed")
      )
    )
    .orderBy(desc(productRelations.confirmedAt));
}

/** Confirma automaticamente relações do sistema acima de um limiar de score (auto-audit). */
export async function autoConfirmAboveThreshold(threshold: number, limit = 200): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ id: productRelations.id })
    .from(productRelations)
    .where(
      and(
        eq(productRelations.status, "pending"),
        eq(productRelations.decidedBy, "system"),
        sql`${productRelations.score} >= ${threshold.toFixed(4)}`
      )
    )
    .limit(limit);
  if (rows.length === 0) return 0;
  await db
    .update(productRelations)
    .set({ status: "confirmed", confirmedAt: new Date() })
    .where(inArray(productRelations.id, rows.map((r) => r.id)));
  return rows.length;
}

/** Estatísticas de relações (pendentes por tipo e total). */
export async function getRelationStats(): Promise<{
  total: number;
  pending: number;
  confirmed: number;
  rejected: number;
}> {
  const db = await getDb();
  if (!db) return { total: 0, pending: 0, confirmed: 0, rejected: 0 };
  const rows = await db
    .select({ status: productRelations.status, count: sql<number>`count(*)` })
    .from(productRelations)
    .groupBy(productRelations.status);
  const stats = { total: 0, pending: 0, confirmed: 0, rejected: 0 };
  for (const row of rows) {
    stats.total += Number(row.count);
    const key = row.status as keyof typeof stats;
    if (key in stats) stats[key] = Number(row.count);
  }
  return stats;
}
