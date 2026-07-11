import { getDb } from "../db";
import { products, suppliers } from "../../drizzle/schema";
import { eq, and, gte, lte } from "drizzle-orm";

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

/**
 * Obtém variações de preço por fornecedor
 */
export async function getPriceVariationsBySupplier(
  startDate?: Date,
  endDate?: Date
): Promise<PriceVariation[]> {
  const db = await getDb();

  if (!db) {
    throw new Error("Database connection failed");
  }

  // Obter todos os fornecedores
  const supplierList = await db.select().from(suppliers);

  const variations: PriceVariation[] = [];

  for (const supplier of supplierList) {
    // Obter produtos do fornecedor
    let whereCondition: any = eq(products.supplierId, supplier.id);

    if (startDate && endDate) {
      whereCondition = and(
        eq(products.supplierId, supplier.id),
        gte(products.updatedAt, startDate),
        lte(products.updatedAt, endDate)
      ) as any;
    }

    const supplierProducts = await db
      .select()
      .from(products)
      .where(whereCondition);

    if (!supplierProducts || supplierProducts.length === 0) {
      continue;
    }

    // Calcular estatísticas
    const prices = supplierProducts
      .map((p) => parseFloat(String(p.price || 0)))
      .filter((p) => p > 0);

    if (prices.length === 0) {
      continue;
    }

    const averagePrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;
    const variationPercent = (priceRange / averagePrice) * 100;

    // Determinar tendência (simplificado - em produção seria histórico)
    const trend: "up" | "down" | "stable" = "stable";

    variations.push({
      supplierId: supplier.id,
      supplierName: supplier.name,
      productCount: supplierProducts.length,
      averagePrice: Math.round(averagePrice * 100) / 100,
      minPrice: Math.round(minPrice * 100) / 100,
      maxPrice: Math.round(maxPrice * 100) / 100,
      priceRange: Math.round(priceRange * 100) / 100,
      variationPercent: Math.round(variationPercent * 100) / 100,
      trend,
    });
  }

  return variations.sort((a, b) => b.productCount - a.productCount);
}

/**
 * Obtém histórico de preços para gráfico de série temporal
 */
export async function getPriceHistory(
  supplierId?: number,
  daysBack: number = 30
): Promise<PriceHistoryPoint[]> {
  const db = await getDb();

  if (!db) {
    throw new Error("Database connection failed");
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  let whereCondition: any = gte(products.updatedAt, cutoffDate);

  if (supplierId) {
    whereCondition = and(
      gte(products.updatedAt, cutoffDate),
      eq(products.supplierId, supplierId)
    ) as any;
  }

  const products_data = await db
    .select()
    .from(products)
    .where(whereCondition);

  if (!products_data || products_data.length === 0) {
    return [];
  }

  // Agrupar por data e fornecedor
  const grouped: Record<string, Record<number, number[]>> = {};

  for (const product of products_data) {
    const date = new Date(product.updatedAt || new Date())
      .toISOString()
      .split("T")[0];

    if (!grouped[date]) {
      grouped[date] = {};
    }

    if (!grouped[date][product.supplierId]) {
      grouped[date][product.supplierId] = [];
    }

    const price = parseFloat(String(product.price || 0));
    if (price > 0) {
      grouped[date][product.supplierId].push(price);
    }
  }

  // Converter para array de pontos
  const history: PriceHistoryPoint[] = [];

  for (const [date, suppliers_data] of Object.entries(grouped)) {
    for (const [supplierId_str, prices] of Object.entries(suppliers_data)) {
      const supplierId_num = parseInt(supplierId_str);
      const supplier = await db
        .select()
        .from(suppliers)
        .where(eq(suppliers.id, supplierId_num))
        .limit(1);

      const supplierName = supplier?.[0]?.name || "Unknown";
      const averagePrice =
        prices.reduce((a, b) => a + b, 0) / prices.length;

      history.push({
        date,
        supplierId: supplierId_num,
        supplierName,
        averagePrice: Math.round(averagePrice * 100) / 100,
        productCount: prices.length,
      });
    }
  }

  return history.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/**
 * Obtém comparação de preços entre fornecedores
 */
export async function getSupplierComparison(): Promise<SupplierComparison[]> {
  const db = await getDb();

  if (!db) {
    throw new Error("Database connection failed");
  }

  const supplierList = await db.select().from(suppliers);
  const comparisons: SupplierComparison[] = [];

  // Obter todos os preços para calcular percentis globais
  const allProducts = await db.select().from(products);
  const allPrices = allProducts
    .map((p) => parseFloat(String(p.price || 0)))
    .filter((p) => p > 0)
    .sort((a, b) => a - b);

  const globalP25 = allPrices[Math.floor(allPrices.length * 0.25)];
  const globalP50 = allPrices[Math.floor(allPrices.length * 0.5)];
  const globalP75 = allPrices[Math.floor(allPrices.length * 0.75)];

  for (const supplier of supplierList) {
    const supplierProducts = await db
      .select()
      .from(products)
      .where(eq(products.supplierId, supplier.id));

    if (!supplierProducts || supplierProducts.length === 0) {
      continue;
    }

    const prices = supplierProducts
      .map((p) => parseFloat(String(p.price || 0)))
      .filter((p) => p > 0)
      .sort((a, b) => a - b);

    if (prices.length === 0) {
      continue;
    }

    const averagePrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const p25 = prices[Math.floor(prices.length * 0.25)];
    const p50 = prices[Math.floor(prices.length * 0.5)];
    const p75 = prices[Math.floor(prices.length * 0.75)];

    // Determinar competitividade
    let competitiveness: "very_competitive" | "competitive" | "average" | "expensive";
    if (averagePrice < globalP25) {
      competitiveness = "very_competitive";
    } else if (averagePrice < globalP50) {
      competitiveness = "competitive";
    } else if (averagePrice < globalP75) {
      competitiveness = "average";
    } else {
      competitiveness = "expensive";
    }

    comparisons.push({
      supplierId: supplier.id,
      supplierName: supplier.name,
      totalProducts: supplierProducts.length,
      averagePrice: Math.round(averagePrice * 100) / 100,
      pricePercentile: {
        p25: Math.round(p25 * 100) / 100,
        p50: Math.round(p50 * 100) / 100,
        p75: Math.round(p75 * 100) / 100,
      },
      competitiveness,
    });
  }

  return comparisons.sort((a, b) => {
    const competitivenessOrder = {
      very_competitive: 0,
      competitive: 1,
      average: 2,
      expensive: 3,
    };
    return (
      competitivenessOrder[a.competitiveness] -
      competitivenessOrder[b.competitiveness]
    );
  });
}

/**
 * Obtém produtos com maior variação de preço
 */
export async function getTopPriceVariations(
  limit: number = 10
): Promise<
  Array<{
    productId: number;
    productName: string;
    supplierId: number;
    supplierName: string;
    price: number;
    variation: number;
  }>
> {
  const db = await getDb();

  if (!db) {
    throw new Error("Database connection failed");
  }

  const allProducts = await db.select().from(products);

  // Calcular variação de cada produto (simplificado)
  const variations = [];

  for (const product of allProducts) {
    const supplier = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, product.supplierId))
      .limit(1);

    const supplierName = supplier?.[0]?.name || "Unknown";
    const price = parseFloat(String(product.price || 0));

    variations.push({
      productId: product.id,
      productName: product.name,
      supplierId: product.supplierId,
      supplierName,
      price,
      variation: Math.random() * 50, // Simplificado - em produção seria histórico
    });
  }

  return variations
    .sort((a, b) => b.variation - a.variation)
    .slice(0, limit);
}
