import { and, eq, gte, lte } from "drizzle-orm";
import {
  priceHistory,
  products,
  productSupplierOffers,
  suppliers,
} from "../../drizzle/schema";
import { getDb } from "../db";

export interface PriceVariation {
  supplierId: number;
  supplierName: string;
  productCount: number;
  averagePrice: number;
  minPrice: number;
  maxPrice: number;
  priceRange: number;
  variationPercent: number;
  trend: "up" | "down" | "stable";
}

export interface PriceHistoryPoint {
  date: string;
  supplierId: number;
  supplierName: string;
  averagePrice: number;
  productCount: number;
}

export interface SupplierComparison {
  supplierId: number;
  supplierName: string;
  totalProducts: number;
  averagePrice: number;
  pricePercentile: {
    p25: number;
    p50: number;
    p75: number;
  };
  competitiveness: "very_competitive" | "competitive" | "average" | "expensive";
}

function effectivePrice(regular: unknown, promo: unknown): number | null {
  const regularPrice = regular == null ? null : Number(regular);
  const promoPrice = promo == null ? null : Number(promo);
  const validRegular = regularPrice != null && Number.isFinite(regularPrice) && regularPrice > 0
    ? regularPrice
    : null;
  const validPromo = promoPrice != null && Number.isFinite(promoPrice) && promoPrice > 0
    ? promoPrice
    : null;
  if (validPromo != null && (validRegular == null || validPromo < validRegular)) return validPromo;
  return validRegular;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function percentile(sorted: number[], ratio: number) {
  if (!sorted.length) return 0;
  return sorted[Math.min(Math.floor(sorted.length * ratio), sorted.length - 1)];
}

/**
 * Estatística do preço atual por fornecedor.
 * A fonte é a oferta canônica; `products.price` não participa do cálculo.
 */
export async function getPriceVariationsBySupplier(
  startDate?: Date,
  endDate?: Date,
): Promise<PriceVariation[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const dateCondition = startDate && endDate
    ? and(
        gte(productSupplierOffers.updatedAt, startDate),
        lte(productSupplierOffers.updatedAt, endDate),
      )
    : undefined;

  const rows = await db
    .select({
      supplierId: productSupplierOffers.supplierId,
      supplierName: suppliers.name,
      productId: productSupplierOffers.productId,
      price: productSupplierOffers.price,
      promoPrice: productSupplierOffers.promoPrice,
    })
    .from(productSupplierOffers)
    .innerJoin(suppliers, eq(suppliers.id, productSupplierOffers.supplierId))
    .where(dateCondition);

  const grouped = new Map<number, { name: string; productIds: Set<number>; prices: number[] }>();
  for (const row of rows) {
    const price = effectivePrice(row.price, row.promoPrice);
    if (price == null) continue;
    const group = grouped.get(row.supplierId) ?? {
      name: row.supplierName,
      productIds: new Set<number>(),
      prices: [],
    };
    group.productIds.add(row.productId);
    group.prices.push(price);
    grouped.set(row.supplierId, group);
  }

  return [...grouped.entries()]
    .map(([supplierId, group]) => {
      const averagePrice = group.prices.reduce((sum, value) => sum + value, 0) / group.prices.length;
      const minPrice = Math.min(...group.prices);
      const maxPrice = Math.max(...group.prices);
      const priceRange = maxPrice - minPrice;
      return {
        supplierId,
        supplierName: group.name,
        productCount: group.productIds.size,
        averagePrice: roundMoney(averagePrice),
        minPrice: roundMoney(minPrice),
        maxPrice: roundMoney(maxPrice),
        priceRange: roundMoney(priceRange),
        variationPercent: averagePrice > 0 ? roundMoney((priceRange / averagePrice) * 100) : 0,
        trend: "stable" as const,
      };
    })
    .sort((a, b) => b.productCount - a.productCount);
}

/**
 * Série histórica real a partir de `price_history`, sem inferir histórico por
 * `products.updatedAt`.
 */
export async function getPriceHistory(
  supplierId?: number,
  daysBack = 30,
): Promise<PriceHistoryPoint[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const where = supplierId
    ? and(gte(priceHistory.recordedAt, cutoffDate), eq(priceHistory.supplierId, supplierId))
    : gte(priceHistory.recordedAt, cutoffDate);

  const rows = await db
    .select({
      recordedAt: priceHistory.recordedAt,
      supplierId: priceHistory.supplierId,
      supplierName: suppliers.name,
      productId: priceHistory.productId,
      price: priceHistory.price,
    })
    .from(priceHistory)
    .innerJoin(suppliers, eq(suppliers.id, priceHistory.supplierId))
    .where(where);

  const grouped = new Map<string, { supplierId: number; supplierName: string; prices: number[]; productIds: Set<number> }>();
  for (const row of rows) {
    const price = row.price == null ? null : Number(row.price);
    if (price == null || !Number.isFinite(price) || price <= 0) continue;
    const date = new Date(row.recordedAt).toISOString().slice(0, 10);
    const key = `${date}:${row.supplierId}`;
    const group = grouped.get(key) ?? {
      supplierId: row.supplierId,
      supplierName: row.supplierName,
      prices: [],
      productIds: new Set<number>(),
    };
    group.prices.push(price);
    group.productIds.add(row.productId);
    grouped.set(key, group);
  }

  return [...grouped.entries()]
    .map(([key, group]) => ({
      date: key.slice(0, 10),
      supplierId: group.supplierId,
      supplierName: group.supplierName,
      averagePrice: roundMoney(group.prices.reduce((sum, value) => sum + value, 0) / group.prices.length),
      productCount: group.productIds.size,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Compara fornecedores pelo posicionamento das ofertas dentro da categoria do
 * produto, reduzindo o viés do mix comercial de cada fornecedor.
 */
export async function getSupplierComparison(): Promise<SupplierComparison[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const rows = await db
    .select({
      supplierId: productSupplierOffers.supplierId,
      supplierName: suppliers.name,
      productId: productSupplierOffers.productId,
      categoryId: products.categoryId,
      price: productSupplierOffers.price,
      promoPrice: productSupplierOffers.promoPrice,
    })
    .from(productSupplierOffers)
    .innerJoin(suppliers, eq(suppliers.id, productSupplierOffers.supplierId))
    .innerJoin(products, eq(products.id, productSupplierOffers.productId));

  const categoryPrices = new Map<number, number[]>();
  for (const row of rows) {
    const price = effectivePrice(row.price, row.promoPrice);
    if (price == null || row.categoryId == null) continue;
    const list = categoryPrices.get(row.categoryId) ?? [];
    list.push(price);
    categoryPrices.set(row.categoryId, list);
  }
  const categoryMedian = new Map<number, number>();
  for (const [categoryId, prices] of categoryPrices) {
    prices.sort((a, b) => a - b);
    categoryMedian.set(categoryId, percentile(prices, 0.5));
  }

  const grouped = new Map<number, {
    name: string;
    productIds: Set<number>;
    prices: number[];
    comparable: number;
    atOrBelowMedian: number;
  }>();
  for (const row of rows) {
    const price = effectivePrice(row.price, row.promoPrice);
    if (price == null) continue;
    const group = grouped.get(row.supplierId) ?? {
      name: row.supplierName,
      productIds: new Set<number>(),
      prices: [],
      comparable: 0,
      atOrBelowMedian: 0,
    };
    group.productIds.add(row.productId);
    group.prices.push(price);
    const median = row.categoryId == null ? undefined : categoryMedian.get(row.categoryId);
    if (median != null) {
      group.comparable += 1;
      if (price <= median) group.atOrBelowMedian += 1;
    }
    grouped.set(row.supplierId, group);
  }

  const result: SupplierComparison[] = [...grouped.entries()].map(([supplierId, group]) => {
    const prices = [...group.prices].sort((a, b) => a - b);
    const fraction = group.comparable > 0 ? group.atOrBelowMedian / group.comparable : 0.5;
    const competitiveness: SupplierComparison["competitiveness"] =
      fraction >= 0.65 ? "very_competitive" :
      fraction >= 0.5 ? "competitive" :
      fraction >= 0.35 ? "average" : "expensive";
    return {
      supplierId,
      supplierName: group.name,
      totalProducts: group.productIds.size,
      averagePrice: roundMoney(prices.reduce((sum, value) => sum + value, 0) / prices.length),
      pricePercentile: {
        p25: roundMoney(percentile(prices, 0.25)),
        p50: roundMoney(percentile(prices, 0.5)),
        p75: roundMoney(percentile(prices, 0.75)),
      },
      competitiveness,
    };
  });

  const order: Record<SupplierComparison["competitiveness"], number> = {
    very_competitive: 0,
    competitive: 1,
    average: 2,
    expensive: 3,
  };
  return result.sort((a, b) => order[a.competitiveness] - order[b.competitiveness]);
}

/**
 * Maiores variações históricas por par produto/fornecedor.
 */
export async function getTopPriceVariations(
  limit = 10,
): Promise<Array<{
  productId: number;
  productName: string;
  supplierId: number;
  supplierName: string;
  price: number;
  variation: number;
}>> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const rows = await db
    .select({
      productId: priceHistory.productId,
      productName: products.name,
      supplierId: priceHistory.supplierId,
      supplierName: suppliers.name,
      historicalPrice: priceHistory.price,
      currentPrice: productSupplierOffers.price,
      currentPromoPrice: productSupplierOffers.promoPrice,
    })
    .from(priceHistory)
    .innerJoin(products, eq(products.id, priceHistory.productId))
    .innerJoin(suppliers, eq(suppliers.id, priceHistory.supplierId))
    .leftJoin(
      productSupplierOffers,
      and(
        eq(productSupplierOffers.productId, priceHistory.productId),
        eq(productSupplierOffers.supplierId, priceHistory.supplierId),
      ),
    );

  const ranges = new Map<string, {
    productId: number;
    productName: string;
    supplierId: number;
    supplierName: string;
    min: number;
    max: number;
    count: number;
    currentPrice: number | null;
  }>();
  for (const row of rows) {
    const historical = row.historicalPrice == null ? null : Number(row.historicalPrice);
    if (historical == null || !Number.isFinite(historical) || historical <= 0) continue;
    const key = `${row.productId}:${row.supplierId}`;
    const group = ranges.get(key) ?? {
      productId: row.productId,
      productName: row.productName,
      supplierId: row.supplierId,
      supplierName: row.supplierName,
      min: historical,
      max: historical,
      count: 0,
      currentPrice: effectivePrice(row.currentPrice, row.currentPromoPrice),
    };
    group.min = Math.min(group.min, historical);
    group.max = Math.max(group.max, historical);
    group.count += 1;
    ranges.set(key, group);
  }

  return [...ranges.values()]
    .map((group) => ({
      productId: group.productId,
      productName: group.productName,
      supplierId: group.supplierId,
      supplierName: group.supplierName,
      price: group.currentPrice ?? group.max,
      variation: group.count >= 2 && group.min > 0
        ? roundMoney(((group.max - group.min) / group.min) * 100)
        : 0,
    }))
    .sort((a, b) => b.variation - a.variation)
    .slice(0, Math.max(1, limit));
}
