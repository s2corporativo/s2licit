import { and, asc, eq, inArray } from "drizzle-orm";
import { categories, products, suppliers } from "../../drizzle/schema";
import { normalizeName, similarity } from "./_helpers";
import { getDb } from "./_client";

/** Normaliza string para comparação fuzzy */


export type DuplicateGroup = {
  groupId: number;
  reason: "name_similar" | "same_active_ingredient_and_name";
  similarity: number;
  products: Array<{
    id: number;
    name: string;
    activeIngredient: string | null;
    concentration: string | null;
    presentation: string | null;
    price: string | null;
    supplierId: number;
    supplierName: string;
    categoryId: number | null;
    categoryName: string | null;
    isActive: "yes" | "no";
    imageUrl: string | null;
  }>;
};

/**
 * Analisa todos os produtos ativos e retorna grupos de possíveis duplicatas.
 * Critérios:
 *  1. Nomes com similaridade >= threshold (padrão 0.82)
 *  2. Mesmo princípio ativo + nome com similaridade >= 0.65
 * Limita a 200 grupos para não sobrecarregar.
 */
export async function findDuplicateGroups(opts?: {
  threshold?: number;
  supplierId?: number;
  categoryId?: number;
  limit?: number;
}): Promise<DuplicateGroup[]> {
  const db = await getDb();
  if (!db) return [];

  const threshold = opts?.threshold ?? 0.82;
  const limit = opts?.limit ?? 200;

  const conditions: ReturnType<typeof eq>[] = [eq(products.isActive, "yes") as any];
  if (opts?.supplierId) conditions.push(eq(products.supplierId, opts.supplierId) as any);
  if (opts?.categoryId) conditions.push(eq(products.categoryId, opts.categoryId) as any);

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      activeIngredient: products.activeIngredient,
      concentration: products.concentration,
      presentation: products.presentation,
      price: products.price,
      supplierId: products.supplierId,
      supplierName: suppliers.name,
      categoryId: products.categoryId,
      categoryName: categories.name,
      isActive: products.isActive,
      imageUrl: products.imageUrl,
    })
    .from(products)
    .innerJoin(suppliers, eq(products.supplierId, suppliers.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(conditions.length > 0 ? and(...(conditions as any[])) : undefined)
    .orderBy(asc(products.name))
    .limit(5000); // máximo 5000 produtos para análise

  // Indexar por nome normalizado
  const normalized = rows.map(r => ({ ...r, norm: normalizeName(r.name) }));

  const groups: DuplicateGroup[] = [];
  const usedIds = new Set<number>();
  let groupId = 1;

  for (let i = 0; i < normalized.length && groups.length < limit; i++) {
    if (usedIds.has(normalized[i].id)) continue;
    const a = normalized[i];
    const groupMembers = [a];

    for (let j = i + 1; j < normalized.length; j++) {
      if (usedIds.has(normalized[j].id)) continue;
      const b = normalized[j];

      // Critério 1: alta similaridade de nome
      const nameSim = similarity(a.norm, b.norm);
      if (nameSim >= threshold) {
        groupMembers.push(b);
        continue;
      }

      // Critério 2: mesmo princípio ativo + nome similar
      if (
        a.activeIngredient &&
        b.activeIngredient &&
        normalizeName(a.activeIngredient) === normalizeName(b.activeIngredient) &&
        nameSim >= 0.65
      ) {
        groupMembers.push(b);
      }
    }

    if (groupMembers.length >= 2) {
      // Calcular similaridade média do grupo
      let totalSim = 0, count = 0;
      for (let x = 0; x < groupMembers.length; x++) {
        for (let y = x + 1; y < groupMembers.length; y++) {
          totalSim += similarity(groupMembers[x].norm, groupMembers[y].norm);
          count++;
        }
      }
      const avgSim = count > 0 ? totalSim / count : 1;

      const hasCommonAI = groupMembers.every(m =>
        m.activeIngredient &&
        normalizeName(m.activeIngredient) === normalizeName(groupMembers[0].activeIngredient ?? "")
      );

      groups.push({
        groupId: groupId++,
        reason: hasCommonAI ? "same_active_ingredient_and_name" : "name_similar",
        similarity: Math.round(avgSim * 100) / 100,
        products: groupMembers.map(({ norm: _norm, ...p }) => p as any),
      });

      groupMembers.slice(1).forEach(m => usedIds.add(m.id));
      usedIds.add(a.id);
    }
  }

  return groups;
}

/**
 * Funde um grupo de duplicatas: mantém o produto mestre (masterId),
 * redireciona todas as referências de proposal_items para o mestre,
 * e desativa (soft delete) os demais.
 */
export async function mergeProductGroup(
  masterId: number,
  duplicateIds: number[]
): Promise<{ merged: number; redirected: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  if (duplicateIds.length === 0) return { merged: 0, redirected: 0 };

  // Buscar dados do mestre para enriquecer campos vazios com dados dos duplicados
  const [master] = await db.select().from(products).where(eq(products.id, masterId)).limit(1);
  if (!master) throw new Error("Produto mestre não encontrado");

  // Buscar duplicatas para enriquecer campos vazios do mestre
  const dupes = await db.select().from(products).where(inArray(products.id, duplicateIds));

  // Enriquecer mestre com campos dos duplicados (preencher campos vazios)
  const enriched: Partial<typeof master> = {};
  const fillFields = [
    "activeIngredient", "concentration", "presentation", "pharmaceuticalForm",
    "manufacturer", "barcode", "gtin", "mapa", "imageUrl", "productUrl",
    "informacaoTecnica", "description"
  ] as const;

  for (const field of fillFields) {
    if (!master[field]) {
      const donor = dupes.find(d => d[field]);
      if (donor) (enriched as any)[field] = donor[field];
    }
  }

  // Atualizar mestre com campos enriquecidos
  if (Object.keys(enriched).length > 0) {
    await db.update(products).set(enriched as any).where(eq(products.id, masterId));
  }

  // Redirecionar proposal_items para o mestre
  const { proposalItems } = await import("../../drizzle/schema");
  const redirectResult = await db
    .update(proposalItems)
    .set({ productId: masterId })
    .where(inArray(proposalItems.productId, duplicateIds));
  const redirected = (redirectResult as any)[0]?.affectedRows ?? 0;

  // Desativar duplicatas (soft delete)
  await db
    .update(products)
    .set({ isActive: "no" })
    .where(inArray(products.id, duplicateIds));

  return { merged: duplicateIds.length, redirected };
}
