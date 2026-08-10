import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { logger } from "../_core/logger";

let reconciliationRun: Promise<{ offersBackfilled: number; aliasesNormalized: number; supplierFkChanged: boolean }> | null = null;

function rowsOf(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

export async function backfillMissingCanonicalOffers(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [insertResult] = await db.execute(sql.raw(`
    INSERT INTO product_supplier_offers
      (productId, supplierId, price, supplierCode, link, updatedAt)
    SELECT
      p.id,
      p.supplierId,
      p.price,
      p.codigoFornecedor,
      p.productUrl,
      COALESCE(p.updatedAt, CURRENT_TIMESTAMP)
    FROM products p
    LEFT JOIN product_supplier_offers o
      ON o.productId = p.id AND o.supplierId = p.supplierId
    WHERE p.supplierId IS NOT NULL
      AND p.price IS NOT NULL
      AND o.id IS NULL
  `));
  return Number((insertResult as any)?.affectedRows ?? 0);
}

async function ensureOfferPriceMirrorTriggers(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    const [triggerRows] = await db.execute(sql`
      SELECT TRIGGER_NAME AS triggerName
      FROM information_schema.TRIGGERS
      WHERE TRIGGER_SCHEMA = DATABASE()
        AND EVENT_OBJECT_TABLE = 'product_supplier_offers'
    `);
    const existing = new Set(rowsOf(triggerRows).map((row) => String(row.triggerName)));

    const priceExpression = `(
      SELECT MIN(CASE
        WHEN o.promoPrice IS NOT NULL AND o.promoPrice > 0
          AND (o.price IS NULL OR o.promoPrice < o.price)
          THEN o.promoPrice
        ELSE o.price
      END)
      FROM product_supplier_offers o
      WHERE o.productId = `;

    if (!existing.has("trg_offer_price_ai")) {
      await db.execute(sql.raw(`
        CREATE TRIGGER trg_offer_price_ai
        AFTER INSERT ON product_supplier_offers
        FOR EACH ROW
        UPDATE products
        SET price = ${priceExpression}NEW.productId)
        WHERE id = NEW.productId
      `));
    }
    if (!existing.has("trg_offer_price_au")) {
      await db.execute(sql.raw(`
        CREATE TRIGGER trg_offer_price_au
        AFTER UPDATE ON product_supplier_offers
        FOR EACH ROW
        UPDATE products
        SET price = ${priceExpression}NEW.productId)
        WHERE id = NEW.productId
      `));
    }
    if (!existing.has("trg_offer_price_ad")) {
      await db.execute(sql.raw(`
        CREATE TRIGGER trg_offer_price_ad
        AFTER DELETE ON product_supplier_offers
        FOR EACH ROW
        UPDATE products
        SET price = ${priceExpression}OLD.productId)
        WHERE id = OLD.productId
      `));
    }

    // Reconcilia o espelho imediatamente para ofertas já existentes antes dos triggers.
    await db.execute(sql.raw(`
      UPDATE products p
      JOIN (
        SELECT productId,
          MIN(CASE
            WHEN promoPrice IS NOT NULL AND promoPrice > 0
              AND (price IS NULL OR promoPrice < price)
              THEN promoPrice
            ELSE price
          END) AS bestPrice
        FROM product_supplier_offers
        GROUP BY productId
      ) x ON x.productId = p.id
      SET p.price = x.bestPrice
    `));
  } catch (error) {
    // O serviço de aplicação já sincroniza o espelho; triggers são uma defesa
    // adicional para writers legados. Falha de privilégio não derruba o módulo.
    logger.warn("[CatalogReconcile] Triggers de espelho de preço não puderam ser garantidos:", (error as Error).message);
  }
}

/**
 * Reconciliação idempotente do catálogo legado.
 * - cria ofertas canônicas faltantes a partir de products.price + supplierId;
 * - normaliza aliases EAN/GTIN/barcode apenas quando o destino está vazio;
 * - protege o espelho de preço inclusive para writers legados;
 * - remove o risco de ON DELETE CASCADE do supplierId legado, tornando a FK
 *   nullable/SET NULL de forma dinâmica (o nome da constraint varia por banco).
 */
export async function reconcileLegacyCatalog(): Promise<{
  offersBackfilled: number;
  aliasesNormalized: number;
  supplierFkChanged: boolean;
}> {
  if (reconciliationRun) return reconciliationRun;

  reconciliationRun = (async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco indisponível para reconciliar catálogo");

    const offersBackfilled = await backfillMissingCanonicalOffers();
    await ensureOfferPriceMirrorTriggers();

    const [aliasResult] = await db.execute(sql.raw(`
      UPDATE products
      SET
        ean = COALESCE(NULLIF(ean, ''), NULLIF(gtin, ''), NULLIF(barcode, '')),
        gtin = COALESCE(NULLIF(gtin, ''), NULLIF(ean, ''), NULLIF(barcode, '')),
        barcode = COALESCE(NULLIF(barcode, ''), NULLIF(gtin, ''), NULLIF(ean, '')),
        nomeProduto = COALESCE(NULLIF(nomeProduto, ''), name),
        laboratorio = COALESCE(NULLIF(laboratorio, ''), manufacturer),
        manufacturer = COALESCE(NULLIF(manufacturer, ''), laboratorio)
      WHERE
        (ean IS NULL OR ean = '')
        OR (gtin IS NULL OR gtin = '')
        OR (barcode IS NULL OR barcode = '')
        OR (nomeProduto IS NULL OR nomeProduto = '')
        OR (laboratorio IS NULL OR laboratorio = '')
        OR (manufacturer IS NULL OR manufacturer = '')
    `));
    const aliasesNormalized = Number((aliasResult as any)?.affectedRows ?? 0);

    let supplierFkChanged = false;
    try {
      const [fkRows] = await db.execute(sql`
        SELECT kcu.CONSTRAINT_NAME AS constraintName, rc.DELETE_RULE AS deleteRule
        FROM information_schema.KEY_COLUMN_USAGE kcu
        JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
          ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
         AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
         AND rc.TABLE_NAME = kcu.TABLE_NAME
        WHERE kcu.TABLE_SCHEMA = DATABASE()
          AND kcu.TABLE_NAME = 'products'
          AND kcu.COLUMN_NAME = 'supplierId'
          AND kcu.REFERENCED_TABLE_NAME = 'suppliers'
        LIMIT 1
      `);
      const fk = rowsOf(fkRows)[0];
      const constraintName = fk?.constraintName ? String(fk.constraintName) : null;
      const deleteRule = fk?.deleteRule ? String(fk.deleteRule).toUpperCase() : null;

      const [colRows] = await db.execute(sql`
        SELECT IS_NULLABLE AS nullable
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'products'
          AND COLUMN_NAME = 'supplierId'
        LIMIT 1
      `);
      const isNullable = String(rowsOf(colRows)[0]?.nullable ?? "NO") === "YES";

      if (constraintName && (deleteRule !== "SET NULL" || !isNullable)) {
        const safeConstraint = constraintName.replace(/`/g, "``");
        await db.execute(sql.raw(`ALTER TABLE products DROP FOREIGN KEY \`${safeConstraint}\``));
        if (!isNullable) await db.execute(sql.raw("ALTER TABLE products MODIFY COLUMN supplierId INT NULL"));
        await db.execute(sql.raw(`ALTER TABLE products ADD CONSTRAINT fk_products_supplier_nullable FOREIGN KEY (supplierId) REFERENCES suppliers(id) ON DELETE SET NULL`));
        supplierFkChanged = true;
      } else if (!constraintName && !isNullable) {
        await db.execute(sql.raw("ALTER TABLE products MODIFY COLUMN supplierId INT NULL"));
        await db.execute(sql.raw(`ALTER TABLE products ADD CONSTRAINT fk_products_supplier_nullable FOREIGN KEY (supplierId) REFERENCES suppliers(id) ON DELETE SET NULL`));
        supplierFkChanged = true;
      }
    } catch (error) {
      logger.warn("[CatalogReconcile] Não foi possível migrar a FK de fornecedor automaticamente:", (error as Error).message);
    }

    logger.info(`[CatalogReconcile] Concluído: ${offersBackfilled} ofertas, ${aliasesNormalized} aliases, FK=${supplierFkChanged ? "migrada" : "ok"}`);
    return { offersBackfilled, aliasesNormalized, supplierFkChanged };
  })().catch((error) => {
    reconciliationRun = null;
    throw error;
  });

  return reconciliationRun;
}
