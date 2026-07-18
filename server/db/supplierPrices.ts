import { getDb } from "./_client";
import { logger } from "../_core/logger";

export async function getProductSupplierPrices(productId: number) {
  const db = await getDb();
  if (!db) return [];
  const { productSupplierPrices, suppliers } = await import("../../drizzle/schema");
  const { eq, asc } = await import("drizzle-orm");
  return db.select({
    id: productSupplierPrices.id,
    productId: productSupplierPrices.productId,
    supplierId: productSupplierPrices.supplierId,
    price: productSupplierPrices.price,
    codigoFornecedor: productSupplierPrices.codigoFornecedor,
    linkProduto: productSupplierPrices.linkProduto,
    updatedAt: productSupplierPrices.updatedAt,
    supplierName: suppliers.name,
  })
    .from(productSupplierPrices)
    .leftJoin(suppliers, eq(productSupplierPrices.supplierId, suppliers.id))
    .where(eq(productSupplierPrices.productId, productId))
    .orderBy(asc(productSupplierPrices.supplierId));
}

export async function upsertProductSupplierPrice(
  productId: number,
  supplierId: number,
  price: string | null,
  extra?: { codigoFornecedor?: string; linkProduto?: string; origem?: string }
) {
  const db = await getDb();
  if (!db) return;
  const { productSupplierPrices } = await import("../../drizzle/schema");
  const { and, eq } = await import("drizzle-orm");
  const existing = await db.select({ id: productSupplierPrices.id, price: productSupplierPrices.price })
    .from(productSupplierPrices)
    .where(and(eq(productSupplierPrices.productId, productId), eq(productSupplierPrices.supplierId, supplierId)))
    .limit(1);
  const now = new Date();
  if (existing.length > 0) {
    // `undefined` é omitido pelo Drizzle — código/link existentes são
    // preservados quando o chamador não os fornece (antes eram apagados).
    await db.update(productSupplierPrices)
      .set({ price, codigoFornecedor: extra?.codigoFornecedor ?? undefined, linkProduto: extra?.linkProduto ?? undefined, updatedAt: now })
      .where(and(eq(productSupplierPrices.productId, productId), eq(productSupplierPrices.supplierId, supplierId)));
  } else {
    await db.insert(productSupplierPrices).values({ productId, supplierId, price, codigoFornecedor: extra?.codigoFornecedor ?? null, linkProduto: extra?.linkProduto ?? null, updatedAt: now });
  }
  // Mudança de custo entra na trilha do price_history com a origem
  // (upserts sem alteração de preço não geram ruído no histórico).
  const previousPrice = existing[0]?.price != null ? Number(existing[0].price) : null;
  const nextPrice = price != null ? Number(price) : null;
  if (nextPrice !== null && nextPrice !== previousPrice) {
    try {
      const { recordPriceHistory } = await import("./landedCost");
      await recordPriceHistory({ productId, supplierId, price, origem: extra?.origem ?? null });
    } catch (err) {
      logger.warn("[supplierPrices] Falha ao registrar histórico de preço:", (err as Error).message);
    }
  }
}

export async function getPriceHistory(productId: number, supplierId?: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  // Histórico real vem da tabela price_history (a product_supplier_prices
  // guarda apenas o estado atual — 1 linha por par produto+fornecedor).
  const { priceHistory } = await import("../../drizzle/schema");
  const { and, eq, desc } = await import("drizzle-orm");
  const conditions = supplierId
    ? and(eq(priceHistory.productId, productId), eq(priceHistory.supplierId, supplierId))
    : eq(priceHistory.productId, productId);
  return db.select().from(priceHistory).where(conditions).orderBy(desc(priceHistory.recordedAt)).limit(limit);
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
  const { productSupplierPrices } = await import("../../drizzle/schema");
  const { and, eq } = await import("drizzle-orm");
  await db.delete(productSupplierPrices).where(and(eq(productSupplierPrices.productId, productId), eq(productSupplierPrices.supplierId, supplierId)));
}

export async function batchUpsertSupplierPrices(entries: Array<{ productId: number; supplierId: number; price: string | null; codigoFornecedor?: string; linkProduto?: string; origem?: string }>) {
  for (const entry of entries) {
    await upsertProductSupplierPrice(entry.productId, entry.supplierId, entry.price, {
      codigoFornecedor: entry.codigoFornecedor,
      linkProduto: entry.linkProduto,
      origem: entry.origem ?? "import",
    });
  }
}
