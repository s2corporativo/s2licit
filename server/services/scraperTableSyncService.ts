import { getDb } from "../db";
import { products, suppliers } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

export interface PriceChangeRecord {
  productId: string;
  supplierId: string;
  productName: string;
  supplierName: string;
  oldPrice: number;
  newPrice: number;
  changePercent: number;
  changeType: "increase" | "decrease" | "new";
}

export interface SyncResult {
  totalProducts: number;
  updatedProducts: number;
  newProducts: number;
  priceChanges: PriceChangeRecord[];
  averageChangePercent: number;
  totalValueChange: number;
}

/**
 * Sincroniza preços do scraper com a tabela de comparação
 * Detecta mudanças, calcula variações e registra histórico
 */
export async function syncScraperWithComparisonTable(
  supplierId: number,
  scrapedProducts: Array<{
    productName: string;
    price: number;
    ean?: string;
    code?: string;
  }>
): Promise<SyncResult> {
  const db = await getDb();

  if (!db) {
    throw new Error("Database connection failed");
  }

  const priceChanges: PriceChangeRecord[] = [];
  let updatedCount = 0;
  let newCount = 0;
  let totalValueChange = 0;

  // Obter informações do fornecedor
  const supplierResult = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .limit(1);

  if (!supplierResult || supplierResult.length === 0) {
    throw new Error(`Supplier ${supplierId} not found`);
  }

  const supplierName = supplierResult[0].name || "Unknown";

  // Processar cada produto do scraper
  for (const scrapedProduct of scrapedProducts) {
    // Tentar encontrar produto existente por EAN ou nome
    let existingProducts = [];
    if (scrapedProduct.ean) {
      existingProducts = await db
        .select()
        .from(products)
        .where(
          and(
            eq(products.supplierId, supplierId),
            eq(products.ean, scrapedProduct.ean)
          )
        )
        .limit(1);
    } else {
      existingProducts = await db
        .select()
        .from(products)
        .where(
          and(
            eq(products.supplierId, supplierId),
            eq(products.name, scrapedProduct.productName)
          )
        )
        .limit(1);
    }

    if (existingProducts && existingProducts.length > 0) {
      // Produto existe - verificar se preço mudou
      const existingProduct = existingProducts[0];
      const oldPrice = parseFloat(String(existingProduct.price || 0));
      const newPrice = scrapedProduct.price;

      if (oldPrice !== newPrice) {
        // Preço mudou - atualizar
        await db
          .update(products)
          .set({
            price: String(newPrice),
            updatedAt: new Date(),
          })
          .where(eq(products.id, existingProduct.id));

        updatedCount++;

        // Registrar mudança
        const changePercent = ((newPrice - oldPrice) / oldPrice) * 100;
        const changeType =
          newPrice > oldPrice ? ("increase" as const) : ("decrease" as const);
        const valueChange = newPrice - oldPrice;

        priceChanges.push({
          productId: String(existingProduct.id),
          supplierId: String(supplierId),
          productName: scrapedProduct.productName,
          supplierName,
          oldPrice,
          newPrice,
          changePercent: Math.round(changePercent * 100) / 100,
          changeType,
        });

        totalValueChange += valueChange;
      }
    } else {
      // Produto novo - criar
      const newProduct = {
        name: scrapedProduct.productName,
        ean: scrapedProduct.ean || null,
        code: scrapedProduct.code || null,
        price: String(scrapedProduct.price),
        supplierId,
      };

      await db.insert(products).values(newProduct);
      newCount++;

      // Registrar como novo
      const newProductId = `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      priceChanges.push({
        productId: newProductId,
        supplierId: String(supplierId),
        productName: scrapedProduct.productName,
        supplierName,
        oldPrice: 0,
        newPrice: scrapedProduct.price,
        changePercent: 100,
        changeType: "new",
      });

      totalValueChange += scrapedProduct.price;
    }
  }

  // Calcular média de variação
  const averageChangePercent =
    priceChanges.length > 0
      ? priceChanges.reduce((sum, change) => sum + change.changePercent, 0) /
        priceChanges.length
      : 0;

  return {
    totalProducts: scrapedProducts.length,
    updatedProducts: updatedCount,
    newProducts: newCount,
    priceChanges,
    averageChangePercent: Math.round(averageChangePercent * 100) / 100,
    totalValueChange: Math.round(totalValueChange * 100) / 100,
  };
}

/**
 * Obtém resumo de mudanças de preço para exibição na tabela
 */
export async function getTableSyncSummary(
  supplierId: number
): Promise<{
  newProducts: number;
  updatedProducts: number;
  averageChangePercent: number;
  maxIncrease: number;
  maxDecrease: number;
}> {
  const db = await getDb();

  if (!db) {
    throw new Error("Database connection failed");
  }

  // Obter produtos do fornecedor
  const supplierProducts = await db
    .select()
    .from(products)
    .where(eq(products.supplierId, supplierId));

  if (!supplierProducts || supplierProducts.length === 0) {
    return {
      newProducts: 0,
      updatedProducts: 0,
      averageChangePercent: 0,
      maxIncrease: 0,
      maxDecrease: 0,
    };
  }

  // Calcular estatísticas
  let newCount = 0;
  let updatedCount = 0;
  const changes: number[] = [];
  let maxIncrease = 0;
  let maxDecrease = 0;

  for (const product of supplierProducts) {
    // Verificar se é novo (criado nos últimos 24 horas)
    const createdAt = new Date(product.createdAt || 0);
    const now = new Date();
    const hoursDiff = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

    if (hoursDiff < 24) {
      newCount++;
    }

    // Verificar se foi atualizado recentemente
    const updatedAt = new Date(product.updatedAt || 0);
    const updateHoursDiff =
      (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60);

    if (updateHoursDiff < 24 && updateHoursDiff > 0) {
      updatedCount++;
    }
  }

  const averageChangePercent =
    changes.length > 0
      ? changes.reduce((a, b) => a + b, 0) / changes.length
      : 0;

  return {
    newProducts: newCount,
    updatedProducts: updatedCount,
    averageChangePercent: Math.round(averageChangePercent * 100) / 100,
    maxIncrease,
    maxDecrease,
  };
}

/**
 * Obtém lista de mudanças de preço para exibição com cores
 */
export async function getHighlightedPriceChanges(
  supplierId: number,
  hoursBack: number = 24
): Promise<PriceChangeRecord[]> {
  const db = await getDb();

  if (!db) {
    throw new Error("Database connection failed");
  }

  const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  const recentProducts = await db
    .select()
    .from(products)
    .where(eq(products.supplierId, supplierId));

  if (!recentProducts || recentProducts.length === 0) {
    return [];
  }

  const supplierResult = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .limit(1);

  const supplier = supplierResult?.[0];
  const supplierName = supplier?.name || "Unknown";

  const changes: PriceChangeRecord[] = [];

  for (const product of recentProducts) {
    const updatedAt = new Date(product.updatedAt || 0);
    if (updatedAt >= cutoffTime) {
      const price = parseFloat(String(product.price || 0));
      changes.push({
        productId: String(product.id),
        supplierId: String(supplierId),
        productName: product.name,
        supplierName,
        oldPrice: price,
        newPrice: price,
        changePercent: 0,
        changeType: "increase",
      });
    }
  }

  return changes;
}
