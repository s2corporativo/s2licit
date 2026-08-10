import { createHash } from "crypto";
import { and, asc, desc, eq, isNull, like, or, sql } from "drizzle-orm";
import { categories, products } from "../../drizzle/schema";
import { getDb } from "../db";
import { getPriceHistory, getProductSupplierPrices, upsertProductSupplierPrice } from "../db/supplierPrices";
import { ensureCatalogKnowledgeSchema } from "./catalogKnowledgeSchema";

export type CatalogQualityFilter = "all" | "incomplete" | "without_offer" | "stale_price" | "without_image";

export type CatalogListInput = {
  search?: string;
  categoryId?: number;
  isActive?: "yes" | "no" | "all";
  quality?: CatalogQualityFilter;
  limit?: number;
  offset?: number;
  sort?: "name" | "updatedAt";
  sortDir?: "asc" | "desc";
};

export type ProductMasterPatch = Partial<{
  code: string | null;
  name: string;
  description: string | null;
  activeIngredient: string | null;
  manufacturer: string | null;
  unit: string | null;
  concentration: string | null;
  presentation: string | null;
  pharmaceuticalForm: string | null;
  stock: string | null;
  barcode: string | null;
  gtin: string | null;
  ean: string | null;
  mapa: string | null;
  registroRegulatorio: "MAPA" | "ANVISA" | "FORN" | null;
  catmasCode: string | null;
  catmatCode: string | null;
  informacaoTecnica: string | null;
  fichaTecnica: string | null;
  subcategoria: string | null;
  ncm: string | null;
  laboratorio: string | null;
  especieAnimal: string | null;
  viaAdministracao: string | null;
  validadeMeses: number | null;
  classeTerapeutica: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  categoryId: number | null;
  isActive: "yes" | "no";
}>;

export type CreateCanonicalProductInput = ProductMasterPatch & {
  name: string;
  supplierId?: number | null;
  initialPrice?: string | null;
  supplierCode?: string | null;
  supplierLink?: string | null;
};

function qualityConditions(filter: CatalogQualityFilter | undefined) {
  switch (filter) {
    case "incomplete":
      return or(
        isNull(products.activeIngredient),
        eq(products.activeIngredient, ""),
        isNull(products.concentration),
        eq(products.concentration, ""),
        isNull(products.presentation),
        eq(products.presentation, ""),
        isNull(products.manufacturer),
        eq(products.manufacturer, ""),
        isNull(products.fichaTecnica),
        eq(products.fichaTecnica, ""),
      );
    case "without_image":
      return or(isNull(products.imageUrl), eq(products.imageUrl, ""));
    case "without_offer":
      return sql`NOT EXISTS (
        SELECT 1 FROM product_supplier_offers pso
        WHERE pso.productId = ${products.id} AND pso.price IS NOT NULL
      )`;
    case "stale_price":
      return sql`EXISTS (
        SELECT 1 FROM product_supplier_offers pso
        WHERE pso.productId = ${products.id}
          AND pso.price IS NOT NULL
          AND pso.updatedAt < DATE_SUB(NOW(), INTERVAL 48 HOUR)
      )`;
    default:
      return undefined;
  }
}

function normalizeOffer(offer: any) {
  const regular = offer?.price != null ? Number(offer.price) : null;
  const promo = offer?.promoPrice != null ? Number(offer.promoPrice) : null;
  const effectivePrice = promo != null && promo > 0 && (regular == null || promo < regular) ? promo : regular;
  return { ...offer, effectivePrice };
}

function selectBestOffer(offers: any[]) {
  return offers
    .map(normalizeOffer)
    .filter((offer) => offer.effectivePrice != null && offer.effectivePrice > 0)
    .sort((a, b) => a.effectivePrice - b.effectivePrice)[0] ?? null;
}

async function recordFieldProvenance(
  productId: number,
  patch: ProductMasterPatch,
  userId?: number,
  sourceType = "manual",
) {
  const db = await getDb();
  if (!db) return;
  await ensureCatalogKnowledgeSchema();
  for (const [fieldName, value] of Object.entries(patch)) {
    const serialized = value == null ? "null" : String(value);
    const hash = createHash("sha256").update(serialized).digest("hex");
    await db.execute(sql`
      INSERT INTO product_field_provenance
        (productId, fieldName, fieldValueHash, sourceType, confidence, validatedByUserId, validatedAt, metadata)
      VALUES
        (${productId}, ${fieldName}, ${hash}, ${sourceType}, 100, ${userId ?? null}, NOW(), ${JSON.stringify({ value })})
    `);
  }
}

export async function createCanonicalProduct(input: CreateCanonicalProductInput, userId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  await ensureCatalogKnowledgeSchema();

  const { supplierId, initialPrice, supplierCode, supplierLink, ...masterInput } = input;
  const masterFields = Object.fromEntries(
    Object.entries(masterInput).filter(([, value]) => value !== undefined),
  );

  const [result] = await db.insert(products).values({
    ...masterFields,
    name: input.name.trim(),
    supplierId: supplierId ?? null,
    price: null,
    isActive: input.isActive ?? "yes",
  } as any);
  const productId = Number((result as any)?.insertId ?? 0);
  if (!productId) throw new Error("Produto criado, mas o banco não retornou o identificador");

  await recordFieldProvenance(productId, masterFields as ProductMasterPatch, userId, "manual_create");
  if (supplierId) {
    await upsertProductSupplierPrice(productId, supplierId, initialPrice ?? null, {
      codigoFornecedor: supplierCode ?? undefined,
      linkProduto: supplierLink ?? undefined,
      origem: "canonical_product_create",
    });
  }

  return { productId };
}

export async function listCanonicalCatalog(input: CatalogListInput) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };

  const conditions: any[] = [];
  const active = input.isActive ?? "yes";
  if (active !== "all") conditions.push(eq(products.isActive, active));
  if (active !== "no") conditions.push(isNull(products.deletedAt));
  if (input.categoryId) conditions.push(eq(products.categoryId, input.categoryId));
  if (input.search?.trim()) {
    const term = `%${input.search.trim()}%`;
    conditions.push(or(
      like(products.name, term),
      like(products.activeIngredient, term),
      like(products.manufacturer, term),
      like(products.barcode, term),
      like(products.gtin, term),
      like(products.ean, term),
      like(products.mapa, term),
      like(products.catmatCode, term),
      like(products.catmasCode, term),
    ));
  }
  const quality = qualityConditions(input.quality);
  if (quality) conditions.push(quality);
  const where = conditions.length ? and(...conditions) : undefined;
  const sortDirection = input.sortDir === "desc" ? desc : asc;
  const orderBy = input.sort === "updatedAt" ? sortDirection(products.updatedAt) : sortDirection(products.name);
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);

  const [rows, countRows, categoryRows] = await Promise.all([
    db.select().from(products).where(where).orderBy(orderBy).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(products).where(where),
    db.select({ id: categories.id, name: categories.name, color: categories.color }).from(categories),
  ]);
  const categoryMap = new Map(categoryRows.map((category) => [category.id, category]));

  const items = await Promise.all(rows.map(async (product) => {
    const offers = (await getProductSupplierPrices(product.id)).map(normalizeOffer);
    const bestOffer = selectBestOffer(offers);
    const category = product.categoryId ? categoryMap.get(product.categoryId) ?? null : null;
    return {
      ...product,
      categoryName: category?.name ?? null,
      categoryColor: category?.color ?? null,
      offerCount: offers.length,
      bestOffer,
      bestPrice: bestOffer?.effectivePrice ?? (product.price != null ? Number(product.price) : null),
      priceSource: bestOffer ? "supplier_offer" : product.price != null ? "legacy_product_price" : "none",
      needsReview: [product.activeIngredient, product.concentration, product.presentation, product.manufacturer, product.fichaTecnica]
        .some((value) => value == null || String(value).trim() === ""),
    };
  }));

  return { items, total: Number(countRows[0]?.count ?? 0) };
}

export async function getCanonicalProductDetail(productId: number) {
  const db = await getDb();
  if (!db) return null;
  const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!product) return null;
  const [offers, history, provenanceRows] = await Promise.all([
    getProductSupplierPrices(productId),
    getPriceHistory(productId, undefined, 100),
    (async () => {
      try {
        await ensureCatalogKnowledgeSchema();
        const [rows] = await db.execute(sql`
          SELECT id, fieldName, sourceType, sourceReference, confidence, validatedByUserId, validatedAt, metadata, createdAt
          FROM product_field_provenance
          WHERE productId = ${productId}
          ORDER BY createdAt DESC
          LIMIT 200
        `);
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [];
      }
    })(),
  ]);
  return {
    product,
    offers: offers.map(normalizeOffer),
    bestOffer: selectBestOffer(offers),
    priceHistory: history,
    provenance: provenanceRows,
  };
}

export async function updateCanonicalProduct(productId: number, patch: ProductMasterPatch, userId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const allowed = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
  if (!Object.keys(allowed).length) return { updated: false };
  await db.update(products).set(allowed as any).where(eq(products.id, productId));
  await recordFieldProvenance(productId, allowed as ProductMasterPatch, userId, "manual");
  return { updated: true, fields: Object.keys(allowed) };
}

export async function softDeleteCanonicalProduct(productId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  await db.update(products).set({ isActive: "no", deletedAt: new Date() }).where(eq(products.id, productId));
  return { deleted: true };
}

export async function restoreCanonicalProduct(productId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  await db.update(products).set({ isActive: "yes", deletedAt: null, mergedIntoId: null }).where(eq(products.id, productId));
  return { restored: true };
}

export async function saveCanonicalOffer(input: {
  productId: number;
  supplierId: number;
  price: string | null;
  supplierCode?: string;
  link?: string;
  origin?: string;
}) {
  await upsertProductSupplierPrice(input.productId, input.supplierId, input.price, {
    codigoFornecedor: input.supplierCode,
    linkProduto: input.link,
    origem: input.origin ?? "catalog_central",
  });
  return { ok: true };
}

export async function catalogQualitySummary() {
  const db = await getDb();
  if (!db) return { total: 0, incomplete: 0, withoutImage: 0, withoutOffer: 0, stalePrice: 0, withValidatedTechnicalData: 0 };
  const [rows] = await db.execute(sql`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN activeIngredient IS NULL OR activeIngredient = '' OR concentration IS NULL OR concentration = '' OR presentation IS NULL OR presentation = '' OR manufacturer IS NULL OR manufacturer = '' OR fichaTecnica IS NULL OR fichaTecnica = '' THEN 1 ELSE 0 END) AS incomplete,
      SUM(CASE WHEN imageUrl IS NULL OR imageUrl = '' THEN 1 ELSE 0 END) AS withoutImage,
      SUM(CASE WHEN statusConfiabilidade = 'completo_validado' THEN 1 ELSE 0 END) AS withValidatedTechnicalData,
      SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM product_supplier_offers pso WHERE pso.productId = products.id AND pso.price IS NOT NULL) THEN 1 ELSE 0 END) AS withoutOffer,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM product_supplier_offers pso WHERE pso.productId = products.id AND pso.price IS NOT NULL AND pso.updatedAt < DATE_SUB(NOW(), INTERVAL 48 HOUR)) THEN 1 ELSE 0 END) AS stalePrice
    FROM products
    WHERE isActive = 'yes' AND deletedAt IS NULL
  `);
  const row = (Array.isArray(rows) ? rows[0] : {}) as Record<string, unknown>;
  return {
    total: Number(row.total ?? 0),
    incomplete: Number(row.incomplete ?? 0),
    withoutImage: Number(row.withoutImage ?? 0),
    withoutOffer: Number(row.withoutOffer ?? 0),
    stalePrice: Number(row.stalePrice ?? 0),
    withValidatedTechnicalData: Number(row.withValidatedTechnicalData ?? 0),
  };
}