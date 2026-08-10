import { and, asc, eq, inArray } from "drizzle-orm";
import { categories, duplicateExceptions, products, suppliers } from "../../drizzle/schema";
import { combinedStringSimilarity, normalizeText } from "../matching/productMatcher";
import { getDb } from "./_client";

export type DuplicateGroup = {
  groupId: number;
  reason: "exact_identifier" | "same_active_ingredient_and_name" | "name_similar";
  similarity: number;
  products: Array<{
    id: number;
    name: string;
    activeIngredient: string | null;
    concentration: string | null;
    presentation: string | null;
    price: string | null;
    supplierId: number | null;
    supplierName: string | null;
    categoryId: number | null;
    categoryName: string | null;
    isActive: "yes" | "no";
    imageUrl: string | null;
  }>;
};

function canonical(value?: string | null) {
  return normalizeText(value ?? "").replace(/\s+/g, " ").trim();
}

function identifier(value?: string | null) {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 6 ? digits : canonical(raw);
}

function pairKey(a: number, b: number) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function addBlock(map: Map<string, number[]>, key: string | null | undefined, id: number) {
  if (!key) return;
  const bucket = map.get(key) ?? [];
  bucket.push(id);
  map.set(key, bucket);
}

function addPairs(bucket: number[], output: Set<string>, maxBucket = 120) {
  if (bucket.length < 2 || bucket.length > maxBucket) return;
  for (let i = 0; i < bucket.length; i++) {
    for (let j = i + 1; j < bucket.length; j++) output.add(pairKey(bucket[i], bucket[j]));
  }
}

/**
 * Detecção canônica de duplicatas com blocking. Não limita mais o catálogo aos
 * primeiros 5.000 registros e evita comparar todos contra todos.
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
  const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 1000);
  const conditions: any[] = [eq(products.isActive, "yes")];
  if (opts?.supplierId) conditions.push(eq(products.supplierId, opts.supplierId));
  if (opts?.categoryId) conditions.push(eq(products.categoryId, opts.categoryId));

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      activeIngredient: products.activeIngredient,
      concentration: products.concentration,
      presentation: products.presentation,
      pharmaceuticalForm: products.pharmaceuticalForm,
      price: products.price,
      supplierId: products.supplierId,
      supplierName: suppliers.name,
      categoryId: products.categoryId,
      categoryName: categories.name,
      isActive: products.isActive,
      imageUrl: products.imageUrl,
      ean: products.ean,
      gtin: products.gtin,
      barcode: products.barcode,
      mapa: products.mapa,
      catmatCode: products.catmatCode,
      catmasCode: products.catmasCode,
    })
    .from(products)
    .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(asc(products.name));

  const byId = new Map(rows.map((row) => [row.id, row]));
  const exactBlocks = new Map<string, number[]>();
  const fuzzyBlocks = new Map<string, number[]>();

  for (const row of rows) {
    const ids = new Set([identifier(row.ean), identifier(row.gtin), identifier(row.barcode)].filter(Boolean) as string[]);
    for (const idValue of ids) addBlock(exactBlocks, `ean:${idValue}`, row.id);
    addBlock(exactBlocks, row.mapa ? `reg:${canonical(row.mapa)}` : null, row.id);
    addBlock(exactBlocks, row.catmatCode ? `catmat:${canonical(row.catmatCode)}` : null, row.id);
    addBlock(exactBlocks, row.catmasCode ? `catmas:${canonical(row.catmasCode)}` : null, row.id);

    const ai = canonical(row.activeIngredient);
    const conc = canonical(row.concentration);
    const name = canonical(row.name);
    const firstToken = name.split(" ").find((token) => token.length >= 3) ?? name.slice(0, 8);
    if (ai) {
      addBlock(fuzzyBlocks, `ai:${ai}|conc:${conc || "-"}|token:${firstToken}`, row.id);
      if (conc) addBlock(fuzzyBlocks, `ai-conc:${ai}|${conc}`, row.id);
    } else if (firstToken) {
      addBlock(fuzzyBlocks, `name:${firstToken}|prefix:${name.slice(0, 16)}`, row.id);
    }
  }

  const exactPairs = new Set<string>();
  const candidatePairs = new Set<string>();
  for (const bucket of exactBlocks.values()) {
    addPairs(bucket, exactPairs, 500);
    addPairs(bucket, candidatePairs, 500);
  }
  for (const bucket of fuzzyBlocks.values()) addPairs(bucket, candidatePairs, 120);

  const exceptionRows = await db
    .select({ productId1: duplicateExceptions.productId1, productId2: duplicateExceptions.productId2 })
    .from(duplicateExceptions);
  const exceptions = new Set(exceptionRows.map((row) => pairKey(row.productId1, row.productId2)));

  // Union-find agrupa relações transitivas sem depender da ordem da lista.
  const parent = new Map<number, number>();
  const find = (id: number): number => {
    const current = parent.get(id) ?? id;
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  const acceptedPairs = new Map<string, { similarity: number; reason: DuplicateGroup["reason"] }>();
  for (const key of candidatePairs) {
    if (exceptions.has(key)) continue;
    const [leftId, rightId] = key.split(":").map(Number);
    const left = byId.get(leftId);
    const right = byId.get(rightId);
    if (!left || !right) continue;

    if (exactPairs.has(key)) {
      acceptedPairs.set(key, { similarity: 1, reason: "exact_identifier" });
      union(leftId, rightId);
      continue;
    }

    const nameSimilarity = combinedStringSimilarity(left.name, right.name);
    const sameAI = Boolean(
      left.activeIngredient && right.activeIngredient &&
      canonical(left.activeIngredient) === canonical(right.activeIngredient),
    );
    const sameConcentration = Boolean(
      left.concentration && right.concentration &&
      canonical(left.concentration) === canonical(right.concentration),
    );

    const accepted = nameSimilarity >= threshold || (sameAI && sameConcentration && nameSimilarity >= 0.58) || (sameAI && nameSimilarity >= 0.68);
    if (!accepted) continue;
    const reason: DuplicateGroup["reason"] = sameAI ? "same_active_ingredient_and_name" : "name_similar";
    acceptedPairs.set(key, { similarity: nameSimilarity, reason });
    union(leftId, rightId);
  }

  const groupIds = new Map<number, number[]>();
  for (const row of rows) {
    if (!parent.has(row.id) && ![...acceptedPairs.keys()].some((key) => key.startsWith(`${row.id}:`) || key.endsWith(`:${row.id}`))) continue;
    const root = find(row.id);
    const bucket = groupIds.get(root) ?? [];
    bucket.push(row.id);
    groupIds.set(root, bucket);
  }

  const groups: DuplicateGroup[] = [];
  let sequence = 1;
  for (const ids of groupIds.values()) {
    if (ids.length < 2) continue;
    const pairInfos: Array<{ similarity: number; reason: DuplicateGroup["reason"] }> = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const info = acceptedPairs.get(pairKey(ids[i], ids[j]));
        if (info) pairInfos.push(info);
      }
    }
    if (!pairInfos.length) continue;
    const reason = pairInfos.some((info) => info.reason === "exact_identifier")
      ? "exact_identifier"
      : pairInfos.some((info) => info.reason === "same_active_ingredient_and_name")
        ? "same_active_ingredient_and_name"
        : "name_similar";
    const similarity = pairInfos.reduce((sum, info) => sum + info.similarity, 0) / pairInfos.length;
    groups.push({
      groupId: sequence++,
      reason,
      similarity: Math.round(similarity * 100) / 100,
      products: ids.map((id) => {
        const row = byId.get(id)!;
        return {
          id: row.id,
          name: row.name,
          activeIngredient: row.activeIngredient,
          concentration: row.concentration,
          presentation: row.presentation,
          price: row.price,
          supplierId: row.supplierId,
          supplierName: row.supplierName,
          categoryId: row.categoryId,
          categoryName: row.categoryName,
          isActive: row.isActive,
          imageUrl: row.imageUrl,
        };
      }),
    });
    if (groups.length >= limit) break;
  }

  return groups.sort((a, b) => b.similarity - a.similarity || b.products.length - a.products.length);
}

/**
 * Funde um grupo de duplicatas: mantém o produto mestre (masterId),
 * redireciona TODAS as referências principais para o mestre em transação e
 * desativa (soft delete) os demais.
 */
export async function mergeProductGroup(
  masterId: number,
  duplicateIds: number[],
): Promise<{ merged: number; redirected: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const cleanDuplicateIds = Array.from(new Set(duplicateIds.filter((id) => id !== masterId)));
  if (cleanDuplicateIds.length === 0) return { merged: 0, redirected: 0 };

  const [master] = await db.select().from(products).where(eq(products.id, masterId)).limit(1);
  if (!master) throw new Error("Produto mestre não encontrado");
  const dupes = await db.select().from(products).where(inArray(products.id, cleanDuplicateIds));
  if (dupes.length !== cleanDuplicateIds.length) throw new Error("Um ou mais produtos duplicados não foram encontrados");

  const enriched: Partial<typeof master> = {};
  const fillFields = [
    "activeIngredient", "concentration", "presentation", "pharmaceuticalForm",
    "manufacturer", "barcode", "gtin", "ean", "mapa", "catmatCode", "catmasCode",
    "imageUrl", "productUrl", "informacaoTecnica", "fichaTecnica", "description",
    "ncm", "laboratorio", "especieAnimal", "viaAdministracao", "classeTerapeutica",
  ] as const;
  for (const field of fillFields) {
    if (!master[field]) {
      const donor = dupes.find((dupe) => dupe[field]);
      if (donor) (enriched as any)[field] = donor[field];
    }
  }

  const {
    proposalItems,
    equivalenceMembers,
    productSupplierPrices,
    productSupplierOffers,
    priceHistory,
  } = await import("../../drizzle/schema");

  let redirected = 0;
  await db.transaction(async (tx) => {
    if (Object.keys(enriched).length > 0) await tx.update(products).set(enriched as any).where(eq(products.id, masterId));

    const redirectResult = await tx.update(proposalItems).set({ productId: masterId }).where(inArray(proposalItems.productId, cleanDuplicateIds));
    redirected = (redirectResult as any)[0]?.affectedRows ?? (redirectResult as any)?.affectedRows ?? 0;
    await tx.update(priceHistory).set({ productId: masterId }).where(inArray(priceHistory.productId, cleanDuplicateIds));

    const masterGroups = await tx.select({ groupId: equivalenceMembers.groupId }).from(equivalenceMembers).where(eq(equivalenceMembers.productId, masterId));
    const masterGroupIds = masterGroups.map((group) => group.groupId);
    if (masterGroupIds.length > 0) {
      await tx.delete(equivalenceMembers).where(and(inArray(equivalenceMembers.productId, cleanDuplicateIds), inArray(equivalenceMembers.groupId, masterGroupIds)));
    }
    await tx.update(equivalenceMembers).set({ productId: masterId }).where(inArray(equivalenceMembers.productId, cleanDuplicateIds));

    for (const table of [productSupplierPrices, productSupplierOffers] as const) {
      const masterOffers = await tx.select({ supplierId: table.supplierId }).from(table).where(eq(table.productId, masterId));
      const masterSupplierIds = masterOffers.map((offer) => offer.supplierId);
      if (masterSupplierIds.length > 0) {
        await tx.delete(table).where(and(inArray(table.productId, cleanDuplicateIds), inArray(table.supplierId, masterSupplierIds)));
      }
      await tx.update(table).set({ productId: masterId }).where(inArray(table.productId, cleanDuplicateIds));
    }

    // Compêndio novo usa tabelas autônomas para não depender do schema Drizzle.
    // Remove colisões antes de reapontar vínculos e feedback.
    await tx.execute({ sql: `DELETE m FROM equivalence_compendium_members m JOIN equivalence_compendium_members mm ON mm.entryId = m.entryId AND mm.productId = ? WHERE m.productId IN (${cleanDuplicateIds.map(() => "?").join(",")})`, params: [masterId, ...cleanDuplicateIds] } as any).catch(() => undefined);
    await tx.execute({ sql: `UPDATE equivalence_compendium_members SET productId = ? WHERE productId IN (${cleanDuplicateIds.map(() => "?").join(",")})`, params: [masterId, ...cleanDuplicateIds] } as any).catch(() => undefined);
    await tx.execute({ sql: `UPDATE equivalence_compendium_feedback SET candidateProductId = ? WHERE candidateProductId IN (${cleanDuplicateIds.map(() => "?").join(",")})`, params: [masterId, ...cleanDuplicateIds] } as any).catch(() => undefined);
    await tx.execute({ sql: `UPDATE equivalence_compendium_feedback SET referenceProductId = ? WHERE referenceProductId IN (${cleanDuplicateIds.map(() => "?").join(",")})`, params: [masterId, ...cleanDuplicateIds] } as any).catch(() => undefined);

    await tx.update(products).set({ isActive: "no", deletedAt: new Date(), mergedIntoId: masterId }).where(inArray(products.id, cleanDuplicateIds));
  });

  try {
    const { getProductSupplierPrices } = await import("./supplierPrices");
    const offers = await getProductSupplierPrices(masterId);
    const best = offers
      .map((offer: any) => Number(offer.promoPrice && Number(offer.promoPrice) > 0 && (!offer.price || Number(offer.promoPrice) < Number(offer.price)) ? offer.promoPrice : offer.price))
      .filter((value: number) => Number.isFinite(value) && value > 0)
      .sort((a: number, b: number) => a - b)[0];
    if (best !== undefined) await db.update(products).set({ price: String(best) }).where(eq(products.id, masterId));
  } catch {
    // Merge principal já foi concluído; a reconciliação de catálogo corrige o espelho posteriormente.
  }

  return { merged: cleanDuplicateIds.length, redirected };
}
