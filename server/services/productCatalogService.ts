import { createHash } from "crypto";
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNull,
  like,
  or,
  sql,
} from "drizzle-orm";
import {
  categories,
  productSupplierOffers,
  products,
  suppliers,
} from "../../drizzle/schema";
import { getDb } from "../db";
import {
  deleteProductSupplierPrice,
  getPriceHistory,
  getProductSupplierPrices,
  upsertProductSupplierPrice,
} from "../db/supplierPrices";

export type CatalogQualityFilter =
  | "all"
  | "incomplete"
  | "without_offer"
  | "stale_price"
  | "without_image";

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

type OfferRow = {
  id: number;
  productId: number;
  supplierId: number;
  price: string | null;
  codigoFornecedor: string | null;
  linkProduto: string | null;
  updatedAt: Date | null;
  supplierName: string | null;
  promoPrice: string | null;
  stock: number | null;
  availability: string | null;
};

function isBlank(value: unknown): boolean {
  return value == null || String(value).trim() === "";
}

function technicalIncompleteCondition() {
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
}

function qualityConditions(filter: CatalogQualityFilter | undefined) {
  switch (filter) {
    case "incomplete":
      return technicalIncompleteCondition();
    case "without_image":
      return or(isNull(products.imageUrl), eq(products.imageUrl, ""));
    case "without_offer":
      return sql`NOT EXISTS (
        SELECT 1
        FROM product_supplier_offers pso
        WHERE pso.productId = ${products.id}
          AND pso.price IS NOT NULL
          AND pso.price > 0
      )`;
    case "stale_price":
      return and(
        sql`EXISTS (
          SELECT 1
          FROM product_supplier_offers pso
          WHERE pso.productId = ${products.id}
            AND pso.price IS NOT NULL
            AND pso.price > 0
        )`,
        sql`NOT EXISTS (
          SELECT 1
          FROM product_supplier_offers pso
          WHERE pso.productId = ${products.id}
            AND pso.price IS NOT NULL
            AND pso.price > 0
            AND pso.updatedAt >= DATE_SUB(NOW(), INTERVAL 48 HOUR)
        )`,
      );
    default:
      return undefined;
  }
}

function normalizeOffer(offer: OfferRow) {
  const regular = offer.price != null ? Number(offer.price) : null;
  const promo = offer.promoPrice != null ? Number(offer.promoPrice) : null;
  const effectivePrice =
    promo != null && promo > 0 && (regular == null || promo < regular)
      ? promo
      : regular;
  return { ...offer, effectivePrice };
}

function selectBestOffer(offers: OfferRow[]) {
  let best: ReturnType<typeof normalizeOffer> | null = null;
  for (const row of offers) {
    const offer = normalizeOffer(row);
    if (offer.effectivePrice == null || offer.effectivePrice <= 0) continue;
    if (best == null || offer.effectivePrice < best.effectivePrice!) best = offer;
  }
  return best;
}

function sanitizeMasterPatch(patch: ProductMasterPatch): ProductMasterPatch {
  const sanitized: ProductMasterPatch = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (typeof value === "string" && key !== "isActive") {
      const trimmed = value.trim();
      if (key === "name") {
        if (!trimmed) throw new Error("Nome do produto é obrigatório");
        (sanitized as Record<string, unknown>)[key] = trimmed;
      } else {
        (sanitized as Record<string, unknown>)[key] = trimmed || null;
      }
      continue;
    }
    (sanitized as Record<string, unknown>)[key] = value;
  }
  return sanitized;
}

async function recordFieldProvenance(
  productId: number,
  patch: ProductMasterPatch,
  userId?: number,
  sourceType = "manual",
): Promise<void> {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return;

  const db = await getDb();
  if (!db) throw new Error("Banco indisponível ao registrar proveniência");

  const valueRows = entries.map(([fieldName, value]) => {
    const serialized = value == null ? "null" : String(value);
    const hash = createHash("sha256").update(serialized).digest("hex");
    return sql`(
      ${productId},
      ${fieldName},
      ${hash},
      ${sourceType},
      100,
      ${userId ?? null},
      NOW(),
      ${JSON.stringify({ value })}
    )`;
  });

  await db.execute(sql`
    INSERT INTO product_field_provenance
      (productId, fieldName, fieldValueHash, sourceType, confidence, validatedByUserId, validatedAt, metadata)
    VALUES ${sql.join(valueRows, sql`, `)}
  `);
}

async function assertProductWritable(productId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const [product] = await db
    .select({
      id: products.id,
      isActive: products.isActive,
      deletedAt: products.deletedAt,
      mergedIntoId: products.mergedIntoId,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!product) throw new Error("Produto não encontrado");
  if (product.mergedIntoId != null) {
    throw new Error(
      `Produto consolidado no produto #${product.mergedIntoId}; use o histórico de merges para desfazer a consolidação`,
    );
  }
  return product;
}

export async function createCanonicalProduct(
  input: CreateCanonicalProductInput,
  userId?: number,
) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");

  const { supplierId, initialPrice, supplierCode, supplierLink, ...rawMasterInput } = input;
  const masterInput = sanitizeMasterPatch(rawMasterInput);

  const [result] = await db.insert(products).values({
    ...masterInput,
    name: input.name.trim(),
    supplierId: supplierId ?? null,
    price: null,
    isActive: input.isActive ?? "yes",
  } as any);

  const productId = Number((result as any)?.insertId ?? 0);
  if (!productId) {
    throw new Error("Produto criado, mas o banco não retornou o identificador");
  }

  await recordFieldProvenance(productId, masterInput, userId, "manual_create");

  if (supplierId && initialPrice != null) {
    await upsertProductSupplierPrice(productId, supplierId, initialPrice, {
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

  const conditions = [];
  const active = input.isActive ?? "yes";
  if (active !== "all") conditions.push(eq(products.isActive, active));
  if (active !== "no") conditions.push(isNull(products.deletedAt));
  if (input.categoryId) conditions.push(eq(products.categoryId, input.categoryId));

  if (input.search?.trim()) {
    const term = `%${input.search.trim()}%`;
    conditions.push(
      or(
        like(products.name, term),
        like(products.activeIngredient, term),
        like(products.manufacturer, term),
        like(products.barcode, term),
        like(products.gtin, term),
        like(products.ean, term),
        like(products.mapa, term),
        like(products.catmatCode, term),
        like(products.catmasCode, term),
      )!,
    );
  }

  const quality = qualityConditions(input.quality);
  if (quality) conditions.push(quality);

  const where = conditions.length ? and(...conditions) : undefined;
  const sortDirection = input.sortDir === "desc" ? desc : asc;
  const orderBy =
    input.sort === "updatedAt"
      ? sortDirection(products.updatedAt)
      : sortDirection(products.name);
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);

  const productColumns = getTableColumns(products);
  const [rows, countRows] = await Promise.all([
    db
      .select({
        ...productColumns,
        categoryName: categories.name,
        categoryColor: categories.color,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(where)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(products).where(where),
  ]);

  const productIds = rows.map((row) => row.id);
  const offerRows: OfferRow[] =
    productIds.length === 0
      ? []
      : await db
          .select({
            id: productSupplierOffers.id,
            productId: productSupplierOffers.productId,
            supplierId: productSupplierOffers.supplierId,
            price: productSupplierOffers.price,
            codigoFornecedor: productSupplierOffers.supplierCode,
            linkProduto: productSupplierOffers.link,
            updatedAt: productSupplierOffers.updatedAt,
            supplierName: suppliers.name,
            promoPrice: productSupplierOffers.promoPrice,
            stock: productSupplierOffers.stock,
            availability: productSupplierOffers.availability,
          })
          .from(productSupplierOffers)
          .leftJoin(suppliers, eq(productSupplierOffers.supplierId, suppliers.id))
          .where(inArray(productSupplierOffers.productId, productIds));

  const offersByProduct = new Map<number, OfferRow[]>();
  for (const offer of offerRows) {
    const bucket = offersByProduct.get(offer.productId);
    if (bucket) bucket.push(offer);
    else offersByProduct.set(offer.productId, [offer]);
  }

  const items = rows.map((product) => {
    const offers = offersByProduct.get(product.id) ?? [];
    const bestOffer = selectBestOffer(offers);
    return {
      ...product,
      offerCount: offers.length,
      bestOffer,
      bestPrice:
        bestOffer?.effectivePrice ??
        (product.price != null ? Number(product.price) : null),
      priceSource: bestOffer
        ? ("supplier_offer" as const)
        : product.price != null
          ? ("legacy_product_price" as const)
          : ("none" as const),
      needsReview: [
        product.activeIngredient,
        product.concentration,
        product.presentation,
        product.manufacturer,
        product.fichaTecnica,
      ].some(isBlank),
    };
  });

  return { items, total: Number(countRows[0]?.count ?? 0) };
}

export async function getCanonicalProductDetail(productId: number) {
  const db = await getDb();
  if (!db) return null;

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product) return null;

  const [offers, history, provenanceResult] = await Promise.all([
    getProductSupplierPrices(productId),
    getPriceHistory(productId, undefined, 100),
    db.execute(sql`
      SELECT id, fieldName, sourceType, sourceReference, confidence,
             validatedByUserId, validatedAt, metadata, createdAt
      FROM product_field_provenance
      WHERE productId = ${productId}
      ORDER BY createdAt DESC
      LIMIT 200
    `),
  ]);

  const provenanceRows = Array.isArray(provenanceResult[0])
    ? provenanceResult[0]
    : [];

  return {
    product,
    offers: offers.map((offer) => normalizeOffer(offer as OfferRow)),
    bestOffer: selectBestOffer(offers as OfferRow[]),
    priceHistory: history,
    provenance: provenanceRows,
  };
}

export async function updateCanonicalProduct(
  productId: number,
  patch: ProductMasterPatch,
  userId?: number,
) {
  await assertProductWritable(productId);
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");

  const allowed = sanitizeMasterPatch(patch);
  if (Object.keys(allowed).length === 0) return { updated: false, fields: [] };

  await db.update(products).set(allowed as any).where(eq(products.id, productId));
  await recordFieldProvenance(productId, allowed, userId, "manual");
  return { updated: true, fields: Object.keys(allowed) };
}

export async function softDeleteCanonicalProduct(productId: number) {
  const product = await assertProductWritable(productId);
  if (product.isActive === "no" && product.deletedAt != null) return { deleted: false };

  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  await db
    .update(products)
    .set({ isActive: "no", deletedAt: new Date() })
    .where(eq(products.id, productId));
  return { deleted: true };
}

export async function restoreCanonicalProduct(productId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");

  const [product] = await db
    .select({ id: products.id, mergedIntoId: products.mergedIntoId })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product) throw new Error("Produto não encontrado");
  if (product.mergedIntoId != null) {
    throw new Error(
      `Produto foi consolidado no produto #${product.mergedIntoId}; restaure pelo histórico de merges`,
    );
  }

  await db
    .update(products)
    .set({ isActive: "yes", deletedAt: null })
    .where(eq(products.id, productId));
  return { restored: true };
}

export async function saveCanonicalOffer(input: {
  productId: number;
  supplierId: number;
  price: string;
  supplierCode?: string;
  link?: string;
  origin?: string;
}) {
  await assertProductWritable(input.productId);
  await upsertProductSupplierPrice(input.productId, input.supplierId, input.price, {
    codigoFornecedor: input.supplierCode,
    linkProduto: input.link,
    origem: input.origin ?? "catalog_central",
  });
  return { ok: true };
}

export async function deleteCanonicalOffer(
  productId: number,
  supplierId: number,
) {
  await assertProductWritable(productId);
  await deleteProductSupplierPrice(productId, supplierId);
  return { ok: true };
}

export async function catalogQualitySummary() {
  const db = await getDb();
  if (!db) {
    return {
      total: 0,
      incomplete: 0,
      withoutImage: 0,
      withoutOffer: 0,
      stalePrice: 0,
      withValidatedTechnicalData: 0,
    };
  }

  const [rows] = await db.execute(sql.raw(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN
        activeIngredient IS NULL OR activeIngredient = '' OR
        concentration IS NULL OR concentration = '' OR
        presentation IS NULL OR presentation = '' OR
        manufacturer IS NULL OR manufacturer = '' OR
        fichaTecnica IS NULL OR fichaTecnica = ''
        THEN 1 ELSE 0 END) AS incomplete,
      SUM(CASE WHEN imageUrl IS NULL OR imageUrl = '' THEN 1 ELSE 0 END) AS withoutImage,
      SUM(CASE WHEN statusConfiabilidade = 'completo_validado' THEN 1 ELSE 0 END) AS withValidatedTechnicalData,
      SUM(CASE WHEN NOT EXISTS (
        SELECT 1 FROM product_supplier_offers pso
        WHERE pso.productId = products.id
          AND pso.price IS NOT NULL
          AND pso.price > 0
      ) THEN 1 ELSE 0 END) AS withoutOffer,
      SUM(CASE WHEN
        EXISTS (
          SELECT 1 FROM product_supplier_offers pso
          WHERE pso.productId = products.id
            AND pso.price IS NOT NULL
            AND pso.price > 0
        )
        AND NOT EXISTS (
          SELECT 1 FROM product_supplier_offers pso
          WHERE pso.productId = products.id
            AND pso.price IS NOT NULL
            AND pso.price > 0
            AND pso.updatedAt >= DATE_SUB(NOW(), INTERVAL 48 HOUR)
        )
        THEN 1 ELSE 0 END) AS stalePrice
    FROM products
    WHERE isActive = 'yes' AND deletedAt IS NULL
  `));

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
