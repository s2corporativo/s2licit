import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { ensureCatalogKnowledgeSchema } from "./catalogKnowledgeSchema";
import { reconcileLegacyCatalog } from "./catalogReconciliationService";

function firstRow(value: unknown): Record<string, unknown> {
  return Array.isArray(value) && value.length
    ? (value[0] as Record<string, unknown>)
    : {};
}

export async function getCatalogIntegrityHealth() {
  const db = await getDb();
  if (!db) {
    return {
      healthy: false,
      database: false,
      checkedAt: new Date(),
      issues: ["Banco indisponível"],
    };
  }

  await ensureCatalogKnowledgeSchema();

  const [metricsRows] = await db.execute(sql.raw(`
    SELECT
      (SELECT COUNT(*) FROM products WHERE isActive = 'yes' AND deletedAt IS NULL) AS activeProducts,
      (SELECT COUNT(*) FROM product_supplier_offers) AS canonicalOffers,
      (
        SELECT COUNT(*)
        FROM products p
        LEFT JOIN product_supplier_offers o
          ON o.productId = p.id AND o.supplierId = p.supplierId
        WHERE p.supplierId IS NOT NULL
          AND o.id IS NULL
      ) AS missingOfferBridges,
      (
        SELECT COUNT(*)
        FROM products p
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
        WHERE NOT (p.price <=> best.bestPrice)
      ) AS priceMirrorMismatches,
      (
        SELECT COUNT(*)
        FROM products p
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
        WHERE NOT (p.supplierId <=> best.supplierId)
      ) AS supplierMirrorMismatches,
      (SELECT COUNT(*) FROM equivalence_compendium_entries) AS compendiumEntries,
      (SELECT COUNT(*) FROM equivalence_compendium_entries WHERE validationStatus = 'human_validated') AS humanValidatedEntries,
      (SELECT COUNT(*) FROM product_merge_events WHERE status = 'applied') AS activeMergeEvents
  `));

  const [fkRows] = await db.execute(sql`
    SELECT rc.DELETE_RULE AS deleteRule, c.IS_NULLABLE AS nullable
    FROM information_schema.KEY_COLUMN_USAGE kcu
    JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
      ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
     AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
     AND rc.TABLE_NAME = kcu.TABLE_NAME
    JOIN information_schema.COLUMNS c
      ON c.TABLE_SCHEMA = kcu.TABLE_SCHEMA
     AND c.TABLE_NAME = kcu.TABLE_NAME
     AND c.COLUMN_NAME = kcu.COLUMN_NAME
    WHERE kcu.TABLE_SCHEMA = DATABASE()
      AND kcu.TABLE_NAME = 'products'
      AND kcu.COLUMN_NAME = 'supplierId'
      AND kcu.REFERENCED_TABLE_NAME = 'suppliers'
    LIMIT 1
  `);

  const metrics = firstRow(metricsRows);
  const fk = firstRow(fkRows);
  const missingOfferBridges = Number(metrics.missingOfferBridges ?? 0);
  const priceMirrorMismatches = Number(metrics.priceMirrorMismatches ?? 0);
  const supplierMirrorMismatches = Number(metrics.supplierMirrorMismatches ?? 0);
  const hasSupplierFk = Object.keys(fk).length > 0;
  const deleteRule = String(fk.deleteRule ?? "MISSING").toUpperCase();
  const nullable = String(fk.nullable ?? "UNKNOWN").toUpperCase();

  const issues: string[] = [];
  if (missingOfferBridges > 0) {
    issues.push(
      `${missingOfferBridges} produto(s) com fornecedor legado sem oferta canônica correspondente`,
    );
  }
  if (priceMirrorMismatches > 0) {
    issues.push(`${priceMirrorMismatches} produto(s) com cache de preço divergente da melhor oferta`);
  }
  if (supplierMirrorMismatches > 0) {
    issues.push(`${supplierMirrorMismatches} produto(s) com cache de fornecedor divergente da melhor oferta`);
  }
  if (!hasSupplierFk) issues.push("FK products.supplierId → suppliers.id ausente");
  if (deleteRule === "CASCADE") {
    issues.push("FK products.supplierId ainda usa ON DELETE CASCADE");
  }
  if (hasSupplierFk && deleteRule !== "SET NULL") {
    issues.push(`FK products.supplierId usa regra ${deleteRule}, esperado SET NULL`);
  }
  if (nullable === "NO") issues.push("products.supplierId ainda é obrigatório no banco");

  return {
    healthy: issues.length === 0,
    database: true,
    checkedAt: new Date(),
    metrics: {
      activeProducts: Number(metrics.activeProducts ?? 0),
      canonicalOffers: Number(metrics.canonicalOffers ?? 0),
      missingOfferBridges,
      priceMirrorMismatches,
      supplierMirrorMismatches,
      compendiumEntries: Number(metrics.compendiumEntries ?? 0),
      humanValidatedEntries: Number(metrics.humanValidatedEntries ?? 0),
      activeMergeEvents: Number(metrics.activeMergeEvents ?? 0),
    },
    supplierCompatibility: { hasSupplierFk, deleteRule, nullable },
    issues,
  };
}

export async function repairCatalogConsistency() {
  await ensureCatalogKnowledgeSchema();
  const reconciliation = await reconcileLegacyCatalog();
  const health = await getCatalogIntegrityHealth();
  return { ...reconciliation, health };
}
