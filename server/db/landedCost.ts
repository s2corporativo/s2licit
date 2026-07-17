import { and, asc, desc, eq, like } from "drizzle-orm";
import { products, suppliers } from "../../drizzle/schema";
import { getDb } from "./_client";

import {
  priceHistory,
  type PriceHistory,
} from "../../drizzle/schema";

/**
 * Calcula o Landed Cost (custo real) de um produto:
 * landedCost = price + freightValue + taxValue
 */
export function calcLandedCost(
  price: string | null | undefined,
  freightValue: string | null | undefined,
  taxValue: string | null | undefined
): number | null {
  const p = price ? parseFloat(price) : null;
  if (p === null || isNaN(p)) return null;
  const f = freightValue ? parseFloat(freightValue) : 0;
  const t = taxValue ? parseFloat(taxValue) : 0;
  return p + (isNaN(f) ? 0 : f) + (isNaN(t) ? 0 : t);
}

/**
 * Registra um novo preço no histórico e detecta inflação >5%.
 * Retorna o registro criado com o flag priceAlert.
 */
export async function recordPriceHistory(data: {
  productId: number;
  supplierId: number;
  price: string | null;
  freightValue?: string | null;
  taxValue?: string | null;
  importBatchId?: number | null;
}): Promise<{ priceAlert: boolean; alertPercent: number | null; landedCost: number | null }> {
  const db = await getDb();
  if (!db) return { priceAlert: false, alertPercent: null, landedCost: null };

  const landedCost = calcLandedCost(data.price, data.freightValue, data.taxValue);

  // Busca o registro mais recente para este produto/fornecedor
  const [lastRecord] = await db
    .select()
    .from(priceHistory)
    .where(
      and(
        eq(priceHistory.productId, data.productId),
        eq(priceHistory.supplierId, data.supplierId)
      )
    )
    .orderBy(desc(priceHistory.recordedAt))
    .limit(1);

  let priceAlert = false;
  let alertPercent: number | null = null;

  if (lastRecord && lastRecord.price && data.price) {
    const lastPrice = parseFloat(lastRecord.price);
    const newPrice = parseFloat(data.price);
    if (lastPrice > 0 && newPrice > lastPrice) {
      const pctChange = ((newPrice - lastPrice) / lastPrice) * 100;
      if (pctChange > 5) {
        priceAlert = true;
        alertPercent = Math.round(pctChange * 100) / 100;
      }
    }
  }

  await db.insert(priceHistory).values({
    productId: data.productId,
    supplierId: data.supplierId,
    price: data.price ?? null,
    freightValue: data.freightValue ?? null,
    taxValue: data.taxValue ?? null,
    landedCost: landedCost !== null ? String(landedCost) : null,
    priceAlert: priceAlert ? "yes" : "no",
    alertPercent: alertPercent !== null ? String(alertPercent) : null,
    importBatchId: data.importBatchId ?? null,
  });

  return { priceAlert, alertPercent, landedCost };
}

/**
 * Retorna o histórico de preços de um produto com evolução temporal.
 */
export async function getProductPriceHistory(productId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(priceHistory)
    .where(eq(priceHistory.productId, productId))
    .orderBy(desc(priceHistory.recordedAt))
    .limit(24);
}

/**
 * Retorna todos os produtos com alerta de inflação ativo (>5% desde última cotação).
 */
export async function getProductsWithPriceAlert() {
  const db = await getDb();
  if (!db) return [];

  // Subconsulta: último registro de cada produto com alerta
  return db
    .select({
      productId: priceHistory.productId,
      productName: products.name,
      supplierId: priceHistory.supplierId,
      supplierName: suppliers.name,
      currentPrice: priceHistory.price,
      landedCost: priceHistory.landedCost,
      alertPercent: priceHistory.alertPercent,
      recordedAt: priceHistory.recordedAt,
    })
    .from(priceHistory)
    .innerJoin(products, eq(priceHistory.productId, products.id))
    .innerJoin(suppliers, eq(priceHistory.supplierId, suppliers.id))
    .where(eq(priceHistory.priceAlert, "yes"))
    .orderBy(desc(priceHistory.recordedAt))
    .limit(50);
}

/**
 * Retorna produtos com Landed Cost calculado, ordenados pelo mais barato.
 * Inclui flag de alerta de inflação do último registro.
 */
export async function listProductsWithLandedCost(filters?: {
  categoryId?: number;
  supplierId?: number;
  search?: string;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(products.isActive, "yes")];
  if (filters?.categoryId) conditions.push(eq(products.categoryId, filters.categoryId));
  if (filters?.supplierId) conditions.push(eq(products.supplierId, filters.supplierId));
  if (filters?.search) conditions.push(like(products.name, `%${filters.search}%`));

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      activeIngredient: products.activeIngredient,
      manufacturer: products.manufacturer,
      concentration: products.concentration,
      presentation: products.presentation,
      price: products.price,
      priceUnit: products.priceUnit,
      supplierId: products.supplierId,
      supplierName: suppliers.name,
      categoryId: products.categoryId,
      imageUrl: products.imageUrl,
      productUrl: products.productUrl,
    })
    .from(products)
    .innerJoin(suppliers, eq(products.supplierId, suppliers.id))
    .where(and(...conditions))
    .orderBy(asc(products.price))
    .limit(filters?.limit ?? 100);

  // Busca o último registro de histórico para cada produto (alerta + landedCost)
  const productIds = rows.map((r) => r.id);
  const historyMap = new Map<number, PriceHistory>();

  if (productIds.length > 0) {
    for (const pid of productIds) {
      const [last] = await db
        .select()
        .from(priceHistory)
        .where(eq(priceHistory.productId, pid))
        .orderBy(desc(priceHistory.recordedAt))
        .limit(1);
      if (last) historyMap.set(pid, last);
    }
  }

  return rows.map((r) => {
    const hist = historyMap.get(r.id);
    const landedCost = hist?.landedCost
      ? parseFloat(hist.landedCost)
      : r.price
      ? parseFloat(r.price)
      : null;
    return {
      ...r,
      landedCost,
      freightValue: hist?.freightValue ?? null,
      taxValue: hist?.taxValue ?? null,
      priceAlert: hist?.priceAlert === "yes",
      alertPercent: hist?.alertPercent ? parseFloat(hist.alertPercent) : null,
    };
  });
}
