import { sql } from "drizzle-orm";
import { getDb } from "../db";

/**
 * Ponte operacional para instalações antigas.
 *
 * Preserva a relação Produto × Fornecedor ainda visível nos campos legados,
 * mesmo quando não há preço. Depois da migração 0017, novas relações devem ser
 * escritas diretamente em product_supplier_offers.
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
      AND o.id IS NULL
  `));

  return Number((result as any)?.affectedRows ?? 0);
}

/**
 * Mantém os dois campos legados como um ÚNICO cache coerente da melhor oferta:
 * - products.price = menor custo efetivo atual;
 * - products.supplierId = fornecedor daquela mesma oferta.
 *
 * A fonte de verdade permanece product_supplier_offers. Produtos sem oferta com
 * preço válido ficam com ambos os caches NULL.
 */
export async function syncCanonicalPriceMirrors(): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível para sincronizar ofertas");

  const [result] = await db.execute(sql.raw(`
    UPDATE products p
    LEFT JOIN (
      SELECT ranked.productId, ranked.supplierId, ranked.bestPrice
      FROM (
        SELECT
          o.id,
          o.productId,
          o.supplierId,
          CASE
            WHEN o.promoPrice IS NOT NULL
              AND o.promoPrice > 0
              AND (o.price IS NULL OR o.promoPrice < o.price)
              THEN o.promoPrice
            WHEN o.price IS NOT NULL AND o.price > 0
              THEN o.price
            ELSE NULL
          END AS bestPrice,
          ROW_NUMBER() OVER (
            PARTITION BY o.productId
            ORDER BY
              CASE
                WHEN o.promoPrice IS NOT NULL
                  AND o.promoPrice > 0
                  AND (o.price IS NULL OR o.promoPrice < o.price)
                  THEN o.promoPrice
                WHEN o.price IS NOT NULL AND o.price > 0
                  THEN o.price
                ELSE NULL
              END ASC,
              o.updatedAt DESC,
              o.id ASC
          ) AS rn
        FROM product_supplier_offers o
        WHERE
          (o.promoPrice IS NOT NULL AND o.promoPrice > 0)
          OR (o.price IS NOT NULL AND o.price > 0)
      ) ranked
      WHERE ranked.rn = 1 AND ranked.bestPrice IS NOT NULL
    ) best ON best.productId = p.id
    SET
      p.price = best.bestPrice,
      p.supplierId = best.supplierId
    WHERE
      NOT (p.price <=> best.bestPrice)
      OR NOT (p.supplierId <=> best.supplierId)
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
 * Reconciliação explícita e sem DDL. Pode ser acionada pela Central sem timer,
 * cron ou privilégio de alteração de schema no processo web.
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
