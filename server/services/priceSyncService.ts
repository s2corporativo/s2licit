import { getDb } from "../db";
import { products, suppliers } from "../../drizzle/schema";
import { inArray } from "drizzle-orm";

/**
 * Represents a price update for a product from a supplier
 */
export interface PriceUpdate {
  productId: number;
  productName: string;
  supplierId: number;
  supplierName: string;
  oldPrice: number | null;
  newPrice: number;
  priceChange: number | null; // percentage change
  isNewSupplier: boolean;
  isNewProduct: boolean;
}

/**
 * Represents synchronization statistics
 */
export interface SyncStats {
  totalProductsUpdated: number;
  totalPriceChanges: number;
  newSuppliersAdded: number;
  newProductsAdded: number;
  averagePriceChange: number;
  priceIncreases: number;
  priceDecreases: number;
  priceUpdates: PriceUpdate[];
  timestamp: Date;
}

/**
 * Detects new suppliers from a list of supplier IDs
 */
export async function detectNewSuppliers(
  supplierIds: number[]
): Promise<{ id: number; name: string; isNew: boolean }[]> {
  if (supplierIds.length === 0) return [];

  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const existingSuppliers = await db
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(inArray(suppliers.id, supplierIds));

  const existingIds = new Set(existingSuppliers.map((s: any) => s.id));

  return supplierIds.map((id) => ({
    id,
    name: existingSuppliers.find((s: any) => s.id === id)?.name || `Supplier ${id}`,
    isNew: !existingIds.has(id),
  }));
}

/**
 * Detects products that were updated with new prices
 */
export async function detectPriceUpdates(
  productIds: number[],
  beforeSnapshot: Map<number, Map<number, number>>
): Promise<PriceUpdate[]> {
  if (productIds.length === 0) return [];

  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const updates: PriceUpdate[] = [];

  // Get current products and their prices
  const currentProducts = await db
    .select({
      id: products.id,
      name: products.name,
      supplierId: products.supplierId,
      price: products.price,
    })
    .from(products)
    .where(inArray(products.id, productIds));

  for (const product of currentProducts) {
    const beforePrices = beforeSnapshot.get(product.id);
    if (!beforePrices) continue;

    // O driver mysql2 devolve decimais como string — normaliza para número
    // antes de comparar (comparar string com number marcava TODA linha como
    // alterada e produzia aritmética inválida).
    const oldPriceNum = beforePrices.has(product.supplierId || 0)
      ? Number(beforePrices.get(product.supplierId || 0))
      : null;
    const newPriceNum = product.price != null ? Number(product.price) : 0;

    if (oldPriceNum === null || oldPriceNum !== newPriceNum) {
      const priceChange =
        oldPriceNum !== null && oldPriceNum !== 0
          ? ((newPriceNum - oldPriceNum) / oldPriceNum) * 100
          : null;

      const supplierId = product.supplierId ? Number(product.supplierId) : 0;
      updates.push({
        productId: product.id,
        productName: product.name,
        supplierId,
        supplierName: "Unknown", // Will be filled from supplier data
        oldPrice: oldPriceNum,
        newPrice: newPriceNum,
        priceChange,
        isNewSupplier: oldPriceNum === null,
        isNewProduct: false,
      });
    }
  }

  return updates;
}

/**
 * Calculates synchronization statistics from price updates
 */
export function calculateSyncStats(updates: PriceUpdate[]): SyncStats {
  const uniqueProducts = new Set(updates.map((u) => u.productId));
  const newSuppliers = new Set(
    updates.filter((u) => u.isNewSupplier).map((u) => u.supplierId)
  );

  const priceIncreases = updates.filter(
    (u) => u.priceChange && u.priceChange > 0
  ).length;
  const priceDecreases = updates.filter(
    (u) => u.priceChange && u.priceChange < 0
  ).length;

  const validChanges = updates
    .filter((u) => u.priceChange !== null)
    .map((u) => u.priceChange as number);

  const averagePriceChange =
    validChanges.length > 0
      ? validChanges.reduce((a, b) => a + b, 0) / validChanges.length
      : 0;

  return {
    totalProductsUpdated: uniqueProducts.size,
    totalPriceChanges: updates.length,
    newSuppliersAdded: newSuppliers.size,
    newProductsAdded: 0, // Will be calculated separately
    averagePriceChange,
    priceIncreases,
    priceDecreases,
    priceUpdates: updates,
    timestamp: new Date(),
  };
}

/**
 * Gets the current price snapshot for a list of products
 */
export async function getPriceSnapshot(
  productIds: number[]
): Promise<Map<number, Map<number, number>>> {
  if (productIds.length === 0) return new Map();

  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const snapshot = new Map<number, Map<number, number>>();

  const productPrices = await db
    .select({
      id: products.id,
      supplierId: products.supplierId,
      price: products.price,
    })
    .from(products)
    .where(inArray(products.id, productIds));

  for (const product of productPrices) {
    if (!snapshot.has(product.id)) {
      snapshot.set(product.id, new Map());
    }

    const supplierMap = snapshot.get(product.id)!;
    const supplierId = (product.supplierId as number | null) || 0;
    // Decimal do mysql2 vem como string — normalizar para number antes de comparar
    const price = product.price === null ? 0 : Number(product.price);
    supplierMap.set(supplierId, price);
  }

  return snapshot;
}

/**
 * Compares two price snapshots and returns differences
 */
export function comparePriceSnapshots(
  before: Map<number, Map<number, number>>,
  after: Map<number, Map<number, number>>
): PriceUpdate[] {
  const updates: PriceUpdate[] = [];

  // Check all products in the after snapshot
  const afterEntries = Array.from(after.entries());
  for (const [productId, afterSuppliers] of afterEntries) {
    const beforeSuppliers = before.get(productId);

    const supplierEntries = Array.from(afterSuppliers.entries());
    for (const [supplierId, newPrice] of supplierEntries) {
      const oldPrice = beforeSuppliers?.get(supplierId) || null;

      if (oldPrice === null || oldPrice !== newPrice) {
        const priceChange =
          oldPrice !== null ? ((newPrice - oldPrice) / oldPrice) * 100 : null;

        updates.push({
          productId,
          productName: `Product ${productId}`, // Will be filled from product data
          supplierId,
          supplierName: `Supplier ${supplierId}`, // Will be filled from supplier data
          oldPrice,
          newPrice,
          priceChange,
          isNewSupplier: oldPrice === null,
          isNewProduct: beforeSuppliers === undefined,
        });
      }
    }
  }

  return updates;
}

/**
 * Enriches price updates with product and supplier names
 */
export async function enrichPriceUpdates(
  updates: PriceUpdate[]
): Promise<PriceUpdate[]> {
  if (updates.length === 0) return [];

  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // Get unique product IDs and supplier IDs
  const productIds = Array.from(new Set(updates.map((u) => u.productId)));
  const supplierIds = Array.from(new Set(updates.map((u) => u.supplierId)));

  // Fetch product names
  const productData = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(inArray(products.id, productIds));

  const productMap = new Map(productData.map((p: any) => [p.id, p.name]));

  // Fetch supplier names
  const supplierData = await db
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(inArray(suppliers.id, supplierIds));

  const supplierMap = new Map(supplierData.map((s: any) => [s.id, s.name]));

  // Enrich updates
  return updates.map((update) => {
    const enrichedUpdate: PriceUpdate = {
      ...update,
      productName: (productMap.get(update.productId) as string) || update.productName,
      supplierName: (supplierMap.get(update.supplierId) as string) || update.supplierName,
    };
    return enrichedUpdate;
  });
}

/**
 * Gets products that were affected by the price sync
 */
export async function getAffectedProducts(
  updates: PriceUpdate[]
): Promise<
  {
    id: number;
    name: string;
    oldPrice: number | null;
    newPrice: number;
    supplierCount: number;
  }[]
> {
  if (updates.length === 0) return [];

  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const uniqueProductIds = Array.from(
    new Set(updates.map((u) => u.productId))
  );

  const productData = (await db!
    .select({
      id: products.id,
      name: products.name,
      price: products.price,
    })
    .from(products)
    .where(inArray(products.id, uniqueProductIds))) as any[];

  // Count suppliers per product
  const supplierCounts = new Map<number, number>();
  for (const update of updates) {
    supplierCounts.set(
      update.productId,
      (supplierCounts.get(update.productId) || 0) + 1
    );
  }

  return productData.map((p: any) => {
    const productUpdates = updates.filter((u) => u.productId === p.id);
    const oldPrice =
      productUpdates.length > 0 ? productUpdates[0].oldPrice : null;
    const newPrice = (p.price as number) || 0;

    return {
      id: p.id,
      name: p.name,
      oldPrice,
      newPrice,
      supplierCount: supplierCounts.get(p.id) || 1,
    };
  });
}

/**
 * Generates a summary message for sync results
 */
export function generateSyncSummary(stats: SyncStats): string {
  const lines = [
    `📊 Sincronização de Preços Concluída`,
    ``,
    `✅ ${stats.totalProductsUpdated} produtos atualizados`,
    `💰 ${stats.totalPriceChanges} mudanças de preço detectadas`,
    `🆕 ${stats.newSuppliersAdded} novos fornecedores adicionados`,
  ];

  if (stats.priceIncreases > 0) {
    lines.push(`📈 ${stats.priceIncreases} aumentos de preço`);
  }

  if (stats.priceDecreases > 0) {
    lines.push(`📉 ${stats.priceDecreases} reduções de preço`);
  }

  if (stats.averagePriceChange !== 0) {
    const direction = stats.averagePriceChange > 0 ? "↑" : "↓";
    lines.push(
      `${direction} Variação média: ${Math.abs(stats.averagePriceChange).toFixed(2)}%`
    );
  }

  return lines.join("\n");
}
