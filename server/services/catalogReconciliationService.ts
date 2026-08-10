import { sql } from "drizzle-orm";
import { getDb } from "../db";

/**
 * Migra para a fonte canônica ofertas que ainda existem apenas no legado.
 * Idempotente pela combinação productId + supplierId já existente.
 */
export async function backfillMissingCanonicalOffers(): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível para reconciliar ofertas");

  const [result] = await db.execute(sql.raw(`
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
      ON o.productId = p.id
     AND o.supplierId = p.supplierId
    WHERE p.supplierId IS NOT NULL
      AND p.price IS NOT NULL
      AND p.price > 0
      AND o.id IS NULL
  `));

  return Number((result as any)?.affectedRows ?? 0);
}

/**
 * Mantém products.price somente como espelho de compatibilidade. A fonte de
 * verdade permanece product_supplier_offers.
 */
export async function syncCanonicalPriceMirrors(): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível para sincronizar preços");

  const [result] = await db.execute(sql.raw(`
    UPDATE products p
    LEFT JOIN (
      SELECT
        productId,
        MIN(
          CASE
            WHEN promoPrice IS NOT NULL
              AND promoPrice > 0
              AND (price IS NULL OR promoPrice < price)
              THEN promoPrice
            WHEN price IS NOT NULL AND price > 0
              THEN price
            ELSE NULL
          END
        ) AS bestPrice
      FROM product_supplier_offers
      GROUP BY productId
    ) best ON best.productId = p.id
    SET p.price = best.bestPrice
    WHERE NOT (p.price <=> best.bestPrice)
  `));

  return Number((result as any)?.affectedRows ?? 0);
}

/**
 * Preenche aliases somente quando o destino está vazio. Não sobrescreve dado
 * informado ou validado por usuário/integração.
 */
export async function normalizeCatalogAliases(): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível para normalizar o catálogo");

  const [result] = await db.execute(sql.raw(`
    UPDATE products
    SET
      ean = COALESCE(NULLIF(TRIM(ean), ''), NULLIF(TRIM(gtin), ''), NULLIF(TRIM(barcode), '')),
      gtin = COALESCE(NULLIF(TRIM(gtin), ''), NULLIF(TRIM(ean), ''), NULLIF(TRIM(barcode), '')),
      barcode = COALESCE(NULLIF(TRIM(barcode), ''), NULLIF(TRIM(gtin), ''), NULLIF(TRIM(ean), '')),
      nomeProduto = COALESCE(NULLIF(TRIM(nomeProduto), ''), name),
      laboratorio = COALESCE(NULLIF(TRIM(laboratorio), ''), NULLIF(TRIM(manufacturer), '')),
      manufacturer = COALESCE(NULLIF(TRIM(manufacturer), ''), NULLIF(TRIM(laboratorio), ''))
    WHERE
      ean IS NULL OR TRIM(ean) = '' OR
      gtin IS NULL OR TRIM(gtin) = '' OR
      barcode IS NULL OR TRIM(barcode) = '' OR
      nomeProduto IS NULL OR TRIM(nomeProduto) = '' OR
      laboratorio IS NULL OR TRIM(laboratorio) = '' OR
      manufacturer IS NULL OR TRIM(manufacturer) = ''
  `));

  return Number((result as any)?.affectedRows ?? 0);
}

/**
 * Reconciliação manual/operacional. Não executa DDL e não cria timers por
 * processo; por isso é segura em topologias com múltiplas réplicas.
 */
export async function reconcileLegacyCatalog(): Promise<{
  offersBackfilled: number;
  pricesMirrored: number;
  aliasesNormalized: number;
}> {
  const offersBackfilled = await backfillMissingCanonicalOffers();
  const pricesMirrored = await syncCanonicalPriceMirrors();
  const aliasesNormalized = await normalizeCatalogAliases();
  return { offersBackfilled, pricesMirrored, aliasesNormalized };
}
