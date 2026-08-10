import { getDb } from "./_client";
import { logger } from "../_core/logger";

/**
 * Fachada canônica de custo por fornecedor.
 *
 * A fonte operacional é `product_supplier_offers`. A tabela
 * `product_supplier_prices` e `products.price` recebem espelhamento temporário
 * apenas para manter consumidores legados consistentes durante a migração.
 */
export async function getProductSupplierPrices(productId: number) {
  const db = await getDb();
  if (!db) return [];
  const { productSupplierOffers, suppliers } = await import("../../drizzle/schema");
  const { eq, asc } = await import("drizzle-orm");
  return db
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
    .where(eq(productSupplierOffers.productId, productId))
    .orderBy(asc(productSupplierOffers.supplierId));
}

async function syncLegacyBestPrice(productId: number) {
  const db = await getDb();
  if (!db) return;
  const { productSupplierOffers, products } = await import("../../drizzle/schema");
  const { eq, sql } = await import("drizzle-orm");

  const rows = await db
    .select({
      bestPrice: sql<string | null>`MIN(CASE
        WHEN ${productSupplierOffers.promoPrice} IS NOT NULL
          AND ${productSupplierOffers.promoPrice} > 0
          AND (${productSupplierOffers.price} IS NULL OR ${productSupplierOffers.promoPrice} < ${productSupplierOffers.price})
          THEN ${productSupplierOffers.promoPrice}
        ELSE ${productSupplierOffers.price}
      END)`,
    })
    .from(productSupplierOffers)
    .where(eq(productSupplierOffers.productId, productId));

  const best = rows[0]?.bestPrice ?? null;
  await db.update(products).set({ price: best }).where(eq(products.id, productId));
}

export async function upsertProductSupplierPrice(
  productId: number,
  supplierId: number,
  price: string | null,
  extra?: { codigoFornecedor?: string; linkProduto?: string; origem?: string },
) {
  const db = await getDb();
  if (!db) return;
  const { productSupplierOffers, productSupplierPrices } = await import("../../drizzle/schema");
  const { and, eq } = await import("drizzle-orm");

  const offerWhere = and(
    eq(productSupplierOffers.productId, productId),
    eq(productSupplierOffers.supplierId, supplierId),
  );
  const legacyWhere = and(
    eq(productSupplierPrices.productId, productId),
    eq(productSupplierPrices.supplierId, supplierId),
  );

  const existingOffer = await db
    .select({ id: productSupplierOffers.id, price: productSupplierOffers.price })
    .from(productSupplierOffers)
    .where(offerWhere)
    .limit(1);

  const now = new Date();
  await db.transaction(async (tx) => {
    if (existingOffer.length > 0) {
      await tx
        .update(productSupplierOffers)
        .set({
          price,
          supplierCode: extra?.codigoFornecedor ?? undefined,
          link: extra?.linkProduto ?? undefined,
          updatedAt: now,
        })
        .where(offerWhere);
    } else {
      await tx.insert(productSupplierOffers).values({
        productId,
        supplierId,
        price,
        supplierCode: extra?.codigoFornecedor ?? null,
        link: extra?.linkProduto ?? null,
        updatedAt: now,
      });
    }

    const existingLegacy = await tx
      .select({ id: productSupplierPrices.id })
      .from(productSupplierPrices)
      .where(legacyWhere)
      .limit(1);
    if (existingLegacy.length > 0) {
      await tx
        .update(productSupplierPrices)
        .set({
          price,
          codigoFornecedor: extra?.codigoFornecedor ?? undefined,
          linkProduto: extra?.linkProduto ?? undefined,
          updatedAt: now,
        })
        .where(legacyWhere);
    } else {
      await tx.insert(productSupplierPrices).values({
        productId,
        supplierId,
        price,
        codigoFornecedor: extra?.codigoFornecedor ?? null,
        linkProduto: extra?.linkProduto ?? null,
        updatedAt: now,
      });
    }
  });

  await syncLegacyBestPrice(productId);

  const previousPrice = existingOffer[0]?.price != null ? Number(existingOffer[0].price) : null;
  const nextPrice = price != null ? Number(price) : null;
  if (nextPrice !== null && nextPrice !== previousPrice) {
    try {
      const { recordPriceHistory } = await import("./landedCost");
      await recordPriceHistory({
        productId,
        supplierId,
        price,
        origem: extra?.origem ?? "canonical_offer",
      });
    } catch (err) {
      logger.warn(
        "[supplierPrices] Falha ao registrar histórico de preço:",
        (err as Error).message,
      );
    }
  }
}

export async function getPriceHistory(productId: number, supplierId?: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  const { priceHistory } = await import("../../drizzle/schema");
  const { and, eq, desc } = await import("drizzle-orm");
  const conditions = supplierId
    ? and(eq(priceHistory.productId, productId), eq(priceHistory.supplierId, supplierId))
    : eq(priceHistory.productId, productId);
  return db
    .select()
    .from(priceHistory)
    .where(conditions)
    .orderBy(desc(priceHistory.recordedAt))
    .limit(limit);
}

export async function findProductByEan(ean: string) {
  const db = await getDb();
  if (!db) return null;
  const { products } = await import("../../drizzle/schema");
  const { eq, or } = await import("drizzle-orm");
  const normalized = ean.trim();
  if (!normalized) return null;
  const rows = await db
    .select()
    .from(products)
    .where(or(eq(products.ean, normalized), eq(products.gtin, normalized), eq(products.barcode, normalized)))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteProductSupplierPrice(productId: number, supplierId: number) {
  const db = await getDb();
  if (!db) return;
  const { productSupplierOffers, productSupplierPrices } = await import("../../drizzle/schema");
  const { and, eq } = await import("drizzle-orm");

  await db.transaction(async (tx) => {
    await tx
      .delete(productSupplierOffers)
      .where(and(eq(productSupplierOffers.productId, productId), eq(productSupplierOffers.supplierId, supplierId)));
    await tx
      .delete(productSupplierPrices)
      .where(and(eq(productSupplierPrices.productId, productId), eq(productSupplierPrices.supplierId, supplierId)));
  });
  await syncLegacyBestPrice(productId);
}

export async function batchUpsertSupplierPrices(
  entries: Array<{
    productId: number;
    supplierId: number;
    price: string | null;
    codigoFornecedor?: string;
    linkProduto?: string;
    origem?: string;
  }>,
) {
  for (const entry of entries) {
    await upsertProductSupplierPrice(entry.productId, entry.supplierId, entry.price, {
      codigoFornecedor: entry.codigoFornecedor,
      linkProduto: entry.linkProduto,
      origem: entry.origem ?? "import",
    });
  }
}
