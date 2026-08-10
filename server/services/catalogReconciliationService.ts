import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { logger } from "../_core/logger";

let reconciliationRun: Promise<{ offersBackfilled: number; aliasesNormalized: number; supplierFkChanged: boolean }> | null = null;
let maintenanceStarted = false;
let maintenanceRunning = false;
const DEFAULT_MAINTENANCE_MS = 5 * 60 * 1000;

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

/**
 * Espelha o menor custo canônico para `products.price` somente por
 * compatibilidade com consumidores legados. A verdade permanece nas ofertas.
 */
export async function syncCanonicalPriceMirrors(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [result] = await db.execute(sql.raw(`
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
    WHERE NOT (p.price <=> x.bestPrice)
  `));
  return Number((result as any)?.affectedRows ?? 0);
}

async function runCatalogMaintenanceCycle(): Promise<void> {
  if (maintenanceRunning) return;
  maintenanceRunning = true;
  try {
    const offersBackfilled = await backfillMissingCanonicalOffers();
    const pricesMirrored = await syncCanonicalPriceMirrors();
    if (offersBackfilled || pricesMirrored) {
      logger.info(`[CatalogMaintenance] ${offersBackfilled} ofertas reconciliadas; ${pricesMirrored} espelhos de preço atualizados.`);
    }
  } catch (error) {
    logger.error("[CatalogMaintenance] Ciclo de manutenção falhou:", error);
  } finally {
    maintenanceRunning = false;
  }
}

/**
 * Loop autônomo, local ao processo Node. Não depende de GitHub Actions, cron do
 * SO ou operador. `unref()` impede que o timer segure o processo no shutdown.
 */
export function startCatalogMaintenanceLoop(intervalMs?: number): void {
  if (maintenanceStarted || process.env.CATALOG_MAINTENANCE_ENABLED === "false") return;
  maintenanceStarted = true;
  const configured = Number(process.env.CATALOG_MAINTENANCE_INTERVAL_MS);
  const everyMs = Math.max(60_000, intervalMs ?? (Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAINTENANCE_MS));
  const timer = setInterval(() => void runCatalogMaintenanceCycle(), everyMs);
  timer.unref?.();
  logger.info(`[CatalogMaintenance] Loop autônomo ativo a cada ${Math.round(everyMs / 1000)}s.`);
}

/**
 * Reconciliação idempotente do catálogo legado.
 * - cria ofertas canônicas faltantes a partir de products.price + supplierId;
 * - sincroniza o menor custo canônico para consumidores legados;
 * - normaliza aliases EAN/GTIN/barcode apenas quando o destino está vazio;
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
    await syncCanonicalPriceMirrors();

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

    startCatalogMaintenanceLoop();
    logger.info(`[CatalogReconcile] Concluído: ${offersBackfilled} ofertas, ${aliasesNormalized} aliases, FK=${supplierFkChanged ? "migrada" : "ok"}`);
    return { offersBackfilled, aliasesNormalized, supplierFkChanged };
  })().catch((error) => {
    reconciliationRun = null;
    throw error;
  });

  return reconciliationRun;
}
