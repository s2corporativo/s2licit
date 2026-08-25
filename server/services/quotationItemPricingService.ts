import { inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import { quotationItemPricing } from "../../drizzle/schema";

// Model consolidado no drizzle/schema.ts (definição canônica única);
// comentário movido para o schema, que passa a ser a fonte da verdade.

export async function setQuotationItemSalePrice(itemId: number, salePrice: number | null): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  if (salePrice == null) {
    await db.delete(quotationItemPricing).where(sql`${quotationItemPricing.itemId} = ${itemId}`);
    return;
  }

  if (!Number.isFinite(salePrice) || salePrice <= 0) {
    throw new Error("O preço de venda deve ser maior que zero.");
  }

  await db.execute(sql`
    INSERT INTO quotation_item_pricing (itemId, salePrice)
    VALUES (${itemId}, ${salePrice})
    ON DUPLICATE KEY UPDATE salePrice = VALUES(salePrice), updatedAt = CURRENT_TIMESTAMP
  `);
}

export async function getQuotationItemSalePrices(itemIds: number[]): Promise<Map<number, string | null>> {
  const result = new Map<number, string | null>();
  if (itemIds.length === 0) return result;

  const db = await getDb();
  if (!db) return result;
  const rows = await db
    .select({ itemId: quotationItemPricing.itemId, salePrice: quotationItemPricing.salePrice })
    .from(quotationItemPricing)
    .where(inArray(quotationItemPricing.itemId, itemIds));

  for (const row of rows) result.set(row.itemId, row.salePrice ?? null);
  return result;
}
