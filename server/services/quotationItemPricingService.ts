import { inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import { quotationItemPricing } from "../../drizzle/schema";

// Model consolidado no drizzle/schema.ts (definição canônica única);
// comentário movido para o schema, que passa a ser a fonte da verdade.

let tableEnsured = false;

/**
 * Garantia idempotente da tabela para deploys que ainda não aplicaram a
 * migration 0022. Quando o banco estiver em dia, o CREATE TABLE IF NOT EXISTS
 * não altera nada e esta camada pode ser removida num próximo ciclo de limpeza.
 */
async function ensureQuotationItemPricingTable(): Promise<void> {
  if (tableEnsured) return;
  const db = await getDb();
  if (!db) return;
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS quotation_item_pricing (
      itemId INT NOT NULL PRIMARY KEY,
      salePrice DECIMAL(15,4) NULL,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_quotation_item_pricing_item
        FOREIGN KEY (itemId) REFERENCES email_quotation_items(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `));
  tableEnsured = true;
}

export async function setQuotationItemSalePrice(itemId: number, salePrice: number | null): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await ensureQuotationItemPricingTable();

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
  await ensureQuotationItemPricingTable();

  const rows = await db
    .select({ itemId: quotationItemPricing.itemId, salePrice: quotationItemPricing.salePrice })
    .from(quotationItemPricing)
    .where(inArray(quotationItemPricing.itemId, itemIds));

  for (const row of rows) result.set(row.itemId, row.salePrice ?? null);
  return result;
}
