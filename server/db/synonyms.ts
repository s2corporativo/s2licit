import { and, asc, eq, inArray, like, or, sql } from "drizzle-orm";
import { synonyms, type Synonym, type InsertSynonym } from "../../drizzle/schema";
import { getDb } from "./_client";

export async function listSynonyms(opts?: {
  category?: string;
  search?: string;
  activeOnly?: boolean;
}): Promise<Synonym[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const conditions = [];
    if (opts?.activeOnly !== false) conditions.push(eq(synonyms.isActive, "yes"));
    if (opts?.category && opts.category !== "all") conditions.push(eq(synonyms.category as any, opts.category));
    if (opts?.search) {
      conditions.push(
        or(
          like(synonyms.term, `%${opts.search}%`),
          like(synonyms.canonical, `%${opts.search}%`)
        )!
      );
    }
    const rows = await db
      .select()
      .from(synonyms)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(synonyms.canonical), asc(synonyms.term));
    return rows as Synonym[];
  } catch (error) {
    console.error("[listSynonyms] Error:", error);
    return [];
  }
}

export async function createSynonym(data: InsertSynonym): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(synonyms).values(data);
  return (result as any).insertId as number;
}

export async function updateSynonym(id: number, data: Partial<InsertSynonym>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(synonyms).set(data as any).where(eq(synonyms.id, id));
}

export async function deleteSynonym(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(synonyms).where(eq(synonyms.id, id));
}

export async function bulkCreateSynonyms(data: InsertSynonym[]): Promise<number> {
  const db = await getDb();
  if (!db || data.length === 0) return 0;
  // Insert in batches of 100
  let count = 0;
  for (let i = 0; i < data.length; i += 100) {
    const batch = data.slice(i, i + 100);
    await db.insert(synonyms).values(batch).onDuplicateKeyUpdate({ set: { updatedAt: sql`now()` } });
    count += batch.length;
  }
  return count;
}

/**
 * Carrega todos os sinônimos ativos e retorna um Map: term_normalizado → [canonical_normalizado, ...]
 * Usado pelo algoritmo de matching para expandir termos de busca.
 */
export async function loadSynonymMap(): Promise<Map<string, string[]>> {
  const db = await getDb();
  if (!db) return new Map();
  try {
    const rows = await db
      .select({ term: synonyms.term, canonical: synonyms.canonical })
      .from(synonyms)
      .where(eq(synonyms.isActive, "yes"));
    const map = new Map<string, string[]>();
    const norm = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "").trim();
    for (const row of rows) {
      const t = norm(row.term);
      const c = norm(row.canonical);
      if (!t || !c) continue;
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(c);
      // Também mapeia o canônico para si mesmo (para busca direta)
      if (!map.has(c)) map.set(c, []);
      if (!map.get(c)!.includes(c)) map.get(c)!.push(c);
    }
    return map;
  } catch (error) {
    console.error("[loadSynonymMap] Error:", error);
    return new Map();
  }
}

// Bulk toggle sinônimos (ativar/desativar em lote)
export async function bulkToggleSynonyms(ids: number[], isActive: "yes" | "no"): Promise<number> {
  const db = await getDb();
  if (!db || ids.length === 0) return 0;
  await db
    .update(synonyms)
    .set({ isActive, updatedAt: new Date() } as any)
    .where(inArray(synonyms.id, ids));
  return ids.length;
}

// Bulk delete sinônimos
export async function bulkDeleteSynonyms(ids: number[]): Promise<number> {
  const db = await getDb();
  if (!db || ids.length === 0) return 0;
  await db.delete(synonyms).where(inArray(synonyms.id, ids));
  return ids.length;
}
