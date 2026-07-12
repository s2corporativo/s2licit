import { getDb } from "../db";
import { products, suppliers, priceHistory } from "../../drizzle/schema";
import { eq, and, inArray, desc } from "drizzle-orm";

/**
 * Represents a price change event
 */
export interface PriceChangeEvent {
  productId: number;
  productName: string;
  supplierId: number;
  supplierName: string;
  oldPrice: number;
  newPrice: number;
  changePercent: number;
  changeAmount: number;
  timestamp: Date;
  isIncrease: boolean;
}

/**
 * Represents price history for a product
 */
export interface ProductPriceHistory {
  productId: number;
  productName: string;
  supplierId: number;
  supplierName: string;
  currentPrice: number;
  previousPrice: number | null;
  changePercent: number | null;
  changeAmount: number | null;
  lastUpdated: Date;
  isHighlighted: boolean;
}

/**
 * Gets price history for a specific product and supplier
 */
export async function getPriceHistory(
  productId: number,
  supplierId: number,
  limit: number = 10
): Promise<PriceChangeEvent[]> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");

    // Get current product
    const product = await db
      .select({
        id: products.id,
        name: products.name,
        price: products.price,
      })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.supplierId, supplierId)))
      .limit(1);

    if (product.length === 0) return [];

    // Get supplier name
    const supplier = await db
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .where(eq(suppliers.id, supplierId))
      .limit(1);

    const supplierName = supplier[0]?.name || `Supplier ${supplierId}`;

    // Lê o histórico real da tabela price_history (antes era um stub que
    // devolvia um único evento com oldPrice==newPrice).
    const rows = await db
      .select({ price: priceHistory.price, recordedAt: priceHistory.recordedAt })
      .from(priceHistory)
      .where(and(eq(priceHistory.productId, productId), eq(priceHistory.supplierId, supplierId)))
      .orderBy(desc(priceHistory.recordedAt))
      .limit(limit + 1);

    if (rows.length === 0) return [];

    // Cada par consecutivo (mais novo → mais antigo) vira um evento de variação.
    const events: PriceChangeEvent[] = [];
    for (let i = 0; i < rows.length - 1; i++) {
      const newPrice = parseFloat(String(rows[i].price ?? "")) || 0;
      const oldPrice = parseFloat(String(rows[i + 1].price ?? "")) || 0;
      if (oldPrice === newPrice) continue;
      const changeAmount = newPrice - oldPrice;
      events.push({
        productId,
        productName: product[0].name,
        supplierId,
        supplierName,
        oldPrice,
        newPrice,
        changePercent: oldPrice > 0 ? (changeAmount / oldPrice) * 100 : 0,
        changeAmount,
        timestamp: rows[i].recordedAt ?? new Date(),
        isIncrease: changeAmount > 0,
      });
    }
    return events.slice(0, limit);
  } catch (error) {
    console.error("Error getting price history:", error);
    return [];
  }
}

/**
 * Compares two price snapshots and returns change events
 */
export function comparePriceHistories(
  before: Map<number, Map<number, number>>,
  after: Map<number, Map<number, number>>,
  productNames: Map<number, string>,
  supplierNames: Map<number, string>
): PriceChangeEvent[] {
  const events: PriceChangeEvent[] = [];

  const afterEntries = Array.from(after.entries());
  for (const [productId, afterSuppliers] of afterEntries) {
    const beforeSuppliers = before.get(productId);
    const productName = productNames.get(productId) || `Product ${productId}`;

    const supplierEntries = Array.from(afterSuppliers.entries());
    for (const [supplierId, newPrice] of supplierEntries) {
      const oldPrice = beforeSuppliers?.get(supplierId);

      if (oldPrice !== undefined && oldPrice !== newPrice) {
        const changeAmount = newPrice - oldPrice;
        const changePercent = (changeAmount / oldPrice) * 100;
        const supplierName =
          supplierNames.get(supplierId) || `Supplier ${supplierId}`;

        events.push({
          productId,
          productName,
          supplierId,
          supplierName,
          oldPrice,
          newPrice,
          changePercent,
          changeAmount,
          timestamp: new Date(),
          isIncrease: changeAmount > 0,
        });
      }
    }
  }

  return events;
}

/**
 * Gets products with price changes for highlighting
 */
export async function getProductsWithPriceChanges(
  productIds: number[],
  changeEvents: PriceChangeEvent[]
): Promise<ProductPriceHistory[]> {
  try {
    if (productIds.length === 0) return [];

    const db = await getDb();
    if (!db) throw new Error("Database connection failed");

    // Get all products
    const productData = await db
      .select({
        id: products.id,
        name: products.name,
        price: products.price,
        supplierId: products.supplierId,
      })
      .from(products)
      .where(inArray(products.id, productIds));

    // Build map of current prices
    const currentPrices = new Map<string, number>();
    for (const p of productData) {
      const key = `${p.id}-${p.supplierId}`;
      const price = (p.price as any) as number || 0;
      currentPrices.set(key, price);
    }

    // Get supplier names
    const supplierIds = Array.from(
      new Set(changeEvents.map((e) => e.supplierId))
    );
    const supplierData = await db
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .where(inArray(suppliers.id, supplierIds));

    const supplierMap = new Map(
      supplierData.map((s: any) => [s.id, (s.name as any) as string])
    );

    // Build product price history
    const history: ProductPriceHistory[] = [];

    for (const event of changeEvents) {
      const key = `${event.productId}-${event.supplierId}`;
      const currentPrice = currentPrices.get(key) || event.newPrice;

      history.push({
        productId: event.productId,
        productName: event.productName,
        supplierId: event.supplierId,
        supplierName:
          ((supplierMap.get(event.supplierId) as any) as string) ||
          event.supplierName,
        currentPrice,
        previousPrice: event.oldPrice,
        changePercent: event.changePercent,
        changeAmount: event.changeAmount,
        lastUpdated: event.timestamp,
        isHighlighted: true,
      });
    }

    return history;
  } catch (error) {
    console.error("Error getting products with price changes:", error);
    return [];
  }
}

/**
 * Determines highlight color based on price change
 */
export function getHighlightColor(
  changePercent: number | null
): "increase" | "decrease" | "neutral" {
  if (changePercent === null || changePercent === 0) return "neutral";
  return changePercent > 0 ? "increase" : "decrease";
}

/**
 * Formats price change for display
 */
export function formatPriceChange(
  changePercent: number | null,
  changeAmount: number | null
): string {
  if (changePercent === null || changeAmount === null) return "—";

  const sign = changePercent > 0 ? "+" : "";
  const arrow = changePercent > 0 ? "↑" : "↓";

  return `${arrow} ${sign}${changePercent.toFixed(2)}% (R$ ${sign}${changeAmount.toFixed(2)})`;
}

/**
 * Determines if a price change is significant
 */
export function isSignificantChange(
  changePercent: number | null,
  threshold: number = 5
): boolean {
  if (changePercent === null) return false;
  return Math.abs(changePercent) >= threshold;
}
