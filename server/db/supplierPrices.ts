import { getDb } from "./_client";

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
  const existing = await db.select({ id: productSupplierPrices.id })
    .from(productSupplierPrices)
    .where(and(eq(productSupplierPrices.productId, productId), eq(productSupplierPrices.supplierId, supplierId)))
    .limit(1);
  const now = new Date();
  if (existing.length > 0) {
    await db.update(productSupplierPrices)
      .set({ price, codigoFornecedor: extra?.codigoFornecedor ?? null, linkProduto: extra?.linkProduto ?? null, updatedAt: now })
      .where(and(eq(productSupplierPrices.productId, productId), eq(productSupplierPrices.supplierId, supplierId)));
  } else {
    await db.insert(productSupplierPrices).values({ productId, supplierId, price, codigoFornecedor: extra?.codigoFornecedor ?? null, linkProduto: extra?.linkProduto ?? null, updatedAt: now });
  }
}

export async function getPriceHistory(productId: number, supplierId?: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  const { productSupplierPrices } = await import("../../drizzle/schema");
  const { and, eq, desc } = await import("drizzle-orm");
  const conditions = supplierId
    ? and(eq(productSupplierPrices.productId, productId), eq(productSupplierPrices.supplierId, supplierId))
    : eq(productSupplierPrices.productId, productId);
  return db.select().from(productSupplierPrices).where(conditions).orderBy(desc(productSupplierPrices.updatedAt)).limit(limit);
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
