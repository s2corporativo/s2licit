import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  categories,
  duplicateExceptions,
  equivalenceMembers,
  priceHistory,
  productSupplierOffers,
  products,
  proposalItems,
  suppliers,
} from "../../drizzle/schema";
import { combinedStringSimilarity, normalizeText } from "../matching/productMatcher";
import { ensureCatalogKnowledgeSchema } from "../services/catalogKnowledgeSchema";
import { syncCanonicalPriceMirrors } from "../services/catalogReconciliationService";
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

function asRows<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "object") return value as T;
  try { return JSON.parse(String(value)) as T; } catch { return fallback; }
}

/**
 * Detecção canônica de duplicatas com blocking. Não limita o catálogo aos
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

  const parent = new Map<number, number>();
  const involvedIds = new Set<number>();
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
    involvedIds.add(a);
    involvedIds.add(b);
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
  for (const id of involvedIds) {
    const root = find(id);
    const bucket = groupIds.get(root) ?? [];
    bucket.push(id);
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

type MergeSnapshot = {
  products: Array<{ id: number; isActive: "yes" | "no"; deletedAt: Date | string | null; mergedIntoId: number | null }>;
  proposalItems: Array<{ id: number; productId: number | null }>;
  priceHistory: Array<{ id: number; productId: number }>;
  equivalenceMembers: Array<{ groupId: number; productId: number }>;
  offers: Array<{
    productId: number;
    supplierId: number;
    price: string | null;
    supplierCode: string | null;
    supplierName: string | null;
    link: string | null;
    image: string | null;
    availability: string | null;
    promoPrice: string | null;
    stock: number | null;
  }>;
  compendiumMembers: Array<{ entryId: number; productId: number; relationType: string; technicalScore: string | null; commercialScore: string | null; notes: string | null }>;
  compendiumFeedback: Array<{ id: number; referenceProductId: number | null; candidateProductId: number }>;
};

async function buildMergeSnapshot(masterId: number, duplicateIds: number[]): Promise<MergeSnapshot> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await ensureCatalogKnowledgeSchema();
  const involved = [masterId, ...duplicateIds];
  const idsCsv = involved.join(",");

  const [productRows, proposalRows, historyRows, memberRows, offerRows] = await Promise.all([
    db.select({ id: products.id, isActive: products.isActive, deletedAt: products.deletedAt, mergedIntoId: products.mergedIntoId }).from(products).where(inArray(products.id, involved)),
    db.select({ id: proposalItems.id, productId: proposalItems.productId }).from(proposalItems).where(inArray(proposalItems.productId, duplicateIds)),
    db.select({ id: priceHistory.id, productId: priceHistory.productId }).from(priceHistory).where(inArray(priceHistory.productId, duplicateIds)),
    db.select({ groupId: equivalenceMembers.groupId, productId: equivalenceMembers.productId }).from(equivalenceMembers).where(inArray(equivalenceMembers.productId, involved)),
    db.select({
      productId: productSupplierOffers.productId,
      supplierId: productSupplierOffers.supplierId,
      price: productSupplierOffers.price,
      supplierCode: productSupplierOffers.supplierCode,
      supplierName: productSupplierOffers.supplierName,
      link: productSupplierOffers.link,
      image: productSupplierOffers.image,
      availability: productSupplierOffers.availability,
      promoPrice: productSupplierOffers.promoPrice,
      stock: productSupplierOffers.stock,
    }).from(productSupplierOffers).where(inArray(productSupplierOffers.productId, involved)),
  ]);

  const [compendiumMembersRaw] = await db.execute(sql.raw(`
    SELECT entryId, productId, relationType, technicalScore, commercialScore, notes
    FROM equivalence_compendium_members
    WHERE productId IN (${idsCsv})
  `));
  const [feedbackRaw] = await db.execute(sql.raw(`
    SELECT id, referenceProductId, candidateProductId
    FROM equivalence_compendium_feedback
    WHERE referenceProductId IN (${idsCsv}) OR candidateProductId IN (${idsCsv})
  `));

  return {
    products: productRows,
    proposalItems: proposalRows.map((row) => ({ id: row.id, productId: row.productId })),
    priceHistory: historyRows,
    equivalenceMembers: memberRows,
    offers: offerRows,
    compendiumMembers: asRows<MergeSnapshot["compendiumMembers"][number]>(compendiumMembersRaw),
    compendiumFeedback: asRows<MergeSnapshot["compendiumFeedback"][number]>(feedbackRaw),
  };
}

/**
 * Funde duplicatas em transação e registra snapshot reversível no mesmo commit.
 */
export async function mergeProductGroup(
  masterId: number,
  duplicateIds: number[],
  userId?: number,
): Promise<{ merged: number; redirected: number; mergeEventId: number | null }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await ensureCatalogKnowledgeSchema();

  const cleanDuplicateIds = Array.from(new Set(duplicateIds.filter((id) => Number.isInteger(id) && id > 0 && id !== masterId)));
  if (cleanDuplicateIds.length === 0) return { merged: 0, redirected: 0, mergeEventId: null };

  const [master] = await db.select().from(products).where(eq(products.id, masterId)).limit(1);
  if (!master) throw new Error("Produto mestre não encontrado");
  const dupes = await db.select().from(products).where(inArray(products.id, cleanDuplicateIds));
  if (dupes.length !== cleanDuplicateIds.length) throw new Error("Um ou mais produtos duplicados não foram encontrados");

  const snapshot = await buildMergeSnapshot(masterId, cleanDuplicateIds);
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

  let redirected = 0;
  let mergeEventId: number | null = null;
  const idsCsv = cleanDuplicateIds.join(",");
  await db.transaction(async (tx) => {
    const [eventInsert] = await tx.execute(sql`
      INSERT INTO product_merge_events
        (masterProductId, duplicateProductIds, snapshot, status, createdByUserId)
      VALUES
        (${masterId}, ${JSON.stringify(cleanDuplicateIds)}, ${JSON.stringify(snapshot)}, 'applied', ${userId ?? null})
    `);
    mergeEventId = Number((eventInsert as any)?.insertId ?? 0) || null;

    if (Object.keys(enriched).length > 0) await tx.update(products).set(enriched as any).where(eq(products.id, masterId));

    const redirectResult = await tx.update(proposalItems).set({ productId: masterId }).where(inArray(proposalItems.productId, cleanDuplicateIds));
    redirected = Number((redirectResult as any)?.affectedRows ?? (redirectResult as any)?.[0]?.affectedRows ?? 0);
    await tx.update(priceHistory).set({ productId: masterId }).where(inArray(priceHistory.productId, cleanDuplicateIds));

    const masterGroups = await tx.select({ groupId: equivalenceMembers.groupId }).from(equivalenceMembers).where(eq(equivalenceMembers.productId, masterId));
    const masterGroupIds = masterGroups.map((group) => group.groupId);
    if (masterGroupIds.length > 0) {
      await tx.delete(equivalenceMembers).where(and(inArray(equivalenceMembers.productId, cleanDuplicateIds), inArray(equivalenceMembers.groupId, masterGroupIds)));
    }
    await tx.update(equivalenceMembers).set({ productId: masterId }).where(inArray(equivalenceMembers.productId, cleanDuplicateIds));

    const masterSupplierRows = await tx.select({ supplierId: productSupplierOffers.supplierId }).from(productSupplierOffers).where(eq(productSupplierOffers.productId, masterId));
    const masterSupplierIds = masterSupplierRows.map((row) => row.supplierId);
    if (masterSupplierIds.length > 0) {
      await tx.delete(productSupplierOffers).where(and(inArray(productSupplierOffers.productId, cleanDuplicateIds), inArray(productSupplierOffers.supplierId, masterSupplierIds)));
    }
    await tx.update(productSupplierOffers).set({ productId: masterId }).where(inArray(productSupplierOffers.productId, cleanDuplicateIds));

    // Tabela de compatibilidade de preço é reconciliada pela fachada canônica;
    // durante o merge removemos as linhas antigas para não manter identidades órfãs.
    const { productSupplierPrices } = await import("../../drizzle/schema");
    await tx.delete(productSupplierPrices).where(inArray(productSupplierPrices.productId, cleanDuplicateIds));

    await tx.execute(sql.raw(`
      DELETE m FROM equivalence_compendium_members m
      JOIN equivalence_compendium_members master
        ON master.entryId = m.entryId AND master.productId = ${masterId}
      WHERE m.productId IN (${idsCsv})
    `));
    await tx.execute(sql.raw(`UPDATE equivalence_compendium_members SET productId = ${masterId} WHERE productId IN (${idsCsv})`));
    await tx.execute(sql.raw(`UPDATE equivalence_compendium_feedback SET candidateProductId = ${masterId} WHERE candidateProductId IN (${idsCsv})`));
    await tx.execute(sql.raw(`UPDATE equivalence_compendium_feedback SET referenceProductId = ${masterId} WHERE referenceProductId IN (${idsCsv})`));

    await tx.update(products).set({ isActive: "no", deletedAt: new Date(), mergedIntoId: masterId }).where(inArray(products.id, cleanDuplicateIds));
  });

  await syncCanonicalPriceMirrors();
  return { merged: cleanDuplicateIds.length, redirected, mergeEventId };
}

export async function listProductMergeEvents(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  await ensureCatalogKnowledgeSchema();
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const [rows] = await db.execute(sql.raw(`
    SELECT id, masterProductId, duplicateProductIds, status, createdByUserId, createdAt, revertedAt, revertedByUserId
    FROM product_merge_events
    ORDER BY id DESC
    LIMIT ${safeLimit}
  `));
  return asRows<any>(rows);
}

/**
 * Desfaz um merge de forma conservadora: restaura produtos, referências e
 * ofertas do snapshot. Dados novos adicionados ao produto mestre depois do
 * merge não são apagados, evitando perda de edições posteriores.
 */
export async function undoProductMerge(eventId: number, userId?: number): Promise<{ restoredProducts: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await ensureCatalogKnowledgeSchema();

  const [eventRows] = await db.execute(sql`SELECT * FROM product_merge_events WHERE id = ${eventId} LIMIT 1`);
  const event = asRows<any>(eventRows)[0];
  if (!event) throw new Error("Evento de merge não encontrado");
  if (event.status !== "applied") throw new Error("Este merge já foi desfeito");

  const duplicateIds = parseJson<number[]>(event.duplicateProductIds, []).filter((id) => Number.isInteger(id) && id > 0);
  const snapshot = parseJson<MergeSnapshot>(event.snapshot, {
    products: [], proposalItems: [], priceHistory: [], equivalenceMembers: [], offers: [], compendiumMembers: [], compendiumFeedback: [],
  });
  if (!duplicateIds.length) throw new Error("Snapshot do merge não contém produtos restauráveis");

  const groupByProduct = <T extends { productId: number | null }>(rows: T[]) => {
    const map = new Map<number, number[]>();
    for (const row of rows) {
      if (row.productId == null || !("id" in row)) continue;
      const bucket = map.get(row.productId) ?? [];
      bucket.push(Number((row as any).id));
      map.set(row.productId, bucket);
    }
    return map;
  };

  await db.transaction(async (tx) => {
    for (const original of snapshot.products.filter((row) => duplicateIds.includes(row.id))) {
      await tx.update(products).set({
        isActive: original.isActive,
        deletedAt: original.deletedAt ? new Date(original.deletedAt) : null,
        mergedIntoId: original.mergedIntoId,
      }).where(eq(products.id, original.id));
    }

    for (const [productId, itemIds] of groupByProduct(snapshot.proposalItems).entries()) {
      if (itemIds.length) await tx.update(proposalItems).set({ productId }).where(inArray(proposalItems.id, itemIds));
    }
    for (const [productId, historyIds] of groupByProduct(snapshot.priceHistory).entries()) {
      if (historyIds.length) await tx.update(priceHistory).set({ productId }).where(inArray(priceHistory.id, historyIds));
    }

    const originalMasterGroups = new Set(
      snapshot.equivalenceMembers.filter((row) => row.productId === Number(event.masterProductId)).map((row) => row.groupId),
    );
    for (const member of snapshot.equivalenceMembers.filter((row) => duplicateIds.includes(row.productId))) {
      const existing = await tx.select({ groupId: equivalenceMembers.groupId }).from(equivalenceMembers)
        .where(and(eq(equivalenceMembers.groupId, member.groupId), eq(equivalenceMembers.productId, member.productId))).limit(1);
      if (!existing.length) await tx.insert(equivalenceMembers).values({ groupId: member.groupId, productId: member.productId });
      if (!originalMasterGroups.has(member.groupId)) {
        await tx.delete(equivalenceMembers).where(and(eq(equivalenceMembers.groupId, member.groupId), eq(equivalenceMembers.productId, Number(event.masterProductId))));
      }
    }

    for (const offer of snapshot.offers.filter((row) => duplicateIds.includes(row.productId))) {
      const existing = await tx.select({ id: productSupplierOffers.id }).from(productSupplierOffers)
        .where(and(eq(productSupplierOffers.productId, offer.productId), eq(productSupplierOffers.supplierId, offer.supplierId))).limit(1);
      const offerData = {
        price: offer.price,
        supplierCode: offer.supplierCode,
        supplierName: offer.supplierName,
        link: offer.link,
        image: offer.image,
        availability: offer.availability,
        promoPrice: offer.promoPrice,
        stock: offer.stock,
        updatedAt: new Date(),
      };
      if (existing.length) await tx.update(productSupplierOffers).set(offerData).where(eq(productSupplierOffers.id, existing[0].id));
      else await tx.insert(productSupplierOffers).values({ productId: offer.productId, supplierId: offer.supplierId, ...offerData, createdAt: new Date() });
    }

    for (const member of snapshot.compendiumMembers.filter((row) => duplicateIds.includes(Number(row.productId)))) {
      await tx.execute(sql`
        INSERT INTO equivalence_compendium_members
          (entryId, productId, relationType, technicalScore, commercialScore, notes)
        VALUES
          (${Number(member.entryId)}, ${Number(member.productId)}, ${member.relationType}, ${member.technicalScore}, ${member.commercialScore}, ${member.notes})
        ON DUPLICATE KEY UPDATE
          relationType = VALUES(relationType), technicalScore = VALUES(technicalScore), commercialScore = VALUES(commercialScore), notes = VALUES(notes)
      `);
    }

    for (const feedback of snapshot.compendiumFeedback) {
      await tx.execute(sql`
        UPDATE equivalence_compendium_feedback
        SET referenceProductId = ${feedback.referenceProductId}, candidateProductId = ${feedback.candidateProductId}
        WHERE id = ${feedback.id}
      `);
    }

    await tx.execute(sql`
      UPDATE product_merge_events
      SET status = 'reverted', revertedAt = NOW(), revertedByUserId = ${userId ?? null}
      WHERE id = ${eventId} AND status = 'applied'
    `);
  });

  // Recria a tabela de compatibilidade de ofertas e recalcula preços legados.
  const { backfillMissingCanonicalOffers } = await import("../services/catalogReconciliationService");
  await backfillMissingCanonicalOffers();
  await syncCanonicalPriceMirrors();
  return { restoredProducts: duplicateIds.length };
}
