import { getDb } from "./_client";
import { logger } from "../_core/logger";

/**
 * Fachada canônica de custo por fornecedor.
 *
 * A fonte operacional passa a ser `product_supplier_offers`. A tabela
 * `product_supplier_prices` continua recebendo dual-write temporário apenas
 * para compatibilidade com telas/rotinas antigas, mas nenhuma leitura desta
 * fachada depende mais dela. Isso evita que fluxos diferentes enxerguem custos
 * divergentes durante a migração gradual.
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

    // Dual-write de transição: mantém consumidores legados consistentes até a
    // remoção definitiva da tabela antiga em migração futura controlada.
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

  // Mudança de custo entra uma única vez na trilha relacional de histórico.
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
  const { eq } = await import("drizzle-orm");
  const rows = await db.select().from(products).where(eq((products as any).ean, ean)).limit(1);
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
      .where(
        and(
          eq(productSupplierOffers.productId, productId),
          eq(productSupplierOffers.supplierId, supplierId),
        ),
      );
    await tx
      .delete(productSupplierPrices)
      .where(
        and(
          eq(productSupplierPrices.productId, productId),
          eq(productSupplierPrices.supplierId, supplierId),
        ),
      );
  });
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
