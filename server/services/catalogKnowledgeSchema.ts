import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { logger } from "../_core/logger";
import { reconcileLegacyCatalog } from "./catalogReconciliationService";

let ensured = false;
let ensuring: Promise<void> | null = null;

/**
 * Garante as tabelas do catálogo/compêndio sem depender exclusivamente do
 * journal do Drizzle. É idempotente e executa uma única vez por processo.
 */
export async function ensureCatalogKnowledgeSchema(): Promise<void> {
  if (ensured) return;
  if (ensuring) return ensuring;

  ensuring = (async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco indisponível ao preparar o compêndio");

    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS equivalence_compendium_entries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        canonicalName VARCHAR(512) NOT NULL,
        catalogType VARCHAR(64) NOT NULL DEFAULT 'geral',
        activeIngredient VARCHAR(512) NULL,
        concentration VARCHAR(128) NULL,
        pharmaceuticalForm VARCHAR(128) NULL,
        presentation VARCHAR(256) NULL,
        manufacturer VARCHAR(256) NULL,
        therapeuticClass VARCHAR(256) NULL,
        targetSpecies VARCHAR(512) NULL,
        administrationRoute VARCHAR(128) NULL,
        regulatoryType VARCHAR(32) NULL,
        regulatoryNumber VARCHAR(128) NULL,
        catmatCode VARCHAR(32) NULL,
        catmasCode VARCHAR(32) NULL,
        ncm VARCHAR(16) NULL,
        aliases JSON NULL,
        technicalProfile JSON NULL,
        equivalenceCriteria JSON NULL,
        sourceSummary TEXT NULL,
        confidence DECIMAL(5,2) NOT NULL DEFAULT 0.00,
        validationStatus ENUM('draft','ai_review','human_validated','rejected') NOT NULL DEFAULT 'draft',
        validatedByUserId INT NULL,
        validatedAt TIMESTAMP NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_ece_name (canonicalName(191)),
        INDEX idx_ece_active_ingredient (activeIngredient(191)),
        INDEX idx_ece_catalog_type (catalogType),
        INDEX idx_ece_regulatory (regulatoryType, regulatoryNumber),
        INDEX idx_ece_catmat (catmatCode),
        INDEX idx_ece_catmas (catmasCode),
        INDEX idx_ece_status (validationStatus)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `));

    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS equivalence_compendium_members (
        id INT AUTO_INCREMENT PRIMARY KEY,
        entryId INT NOT NULL,
        productId INT NOT NULL,
        relationType ENUM('reference','equivalent','alternative','similar','incompatible') NOT NULL DEFAULT 'equivalent',
        technicalScore DECIMAL(5,2) NULL,
        commercialScore DECIMAL(5,2) NULL,
        evidence JSON NULL,
        notes TEXT NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_ecm_entry_product (entryId, productId),
        INDEX idx_ecm_product (productId),
        INDEX idx_ecm_relation (relationType)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `));

    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS equivalence_compendium_feedback (
        id INT AUTO_INCREMENT PRIMARY KEY,
        queryText TEXT NULL,
        referenceProductId INT NULL,
        candidateProductId INT NOT NULL,
        entryId INT NULL,
        decision ENUM('approved','rejected','needs_review') NOT NULL,
        reason TEXT NULL,
        scoreSnapshot JSON NULL,
        createdByUserId INT NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ecf_reference (referenceProductId),
        INDEX idx_ecf_candidate (candidateProductId),
        INDEX idx_ecf_entry (entryId),
        INDEX idx_ecf_decision (decision)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `));

    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS product_field_provenance (
        id INT AUTO_INCREMENT PRIMARY KEY,
        productId INT NOT NULL,
        fieldName VARCHAR(128) NOT NULL,
        fieldValueHash VARCHAR(64) NULL,
        sourceType VARCHAR(64) NOT NULL,
        sourceReference VARCHAR(512) NULL,
        confidence DECIMAL(5,2) NULL,
        validatedByUserId INT NULL,
        validatedAt TIMESTAMP NULL,
        metadata JSON NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_pfp_product (productId),
        INDEX idx_pfp_field (fieldName),
        INDEX idx_pfp_source (sourceType)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `));

    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS product_merge_events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        masterProductId INT NOT NULL,
        duplicateProductIds JSON NOT NULL,
        snapshot JSON NOT NULL,
        status ENUM('applied','reverted') NOT NULL DEFAULT 'applied',
        createdByUserId INT NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        revertedAt TIMESTAMP NULL,
        revertedByUserId INT NULL,
        INDEX idx_pme_master (masterProductId),
        INDEX idx_pme_status (status),
        INDEX idx_pme_created (createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `));

    ensured = true;
    await reconcileLegacyCatalog();
    logger.info("[CatalogKnowledge] Estruturas do compêndio verificadas e catálogo reconciliado.");
  })().catch((error) => {
    ensuring = null;
    ensured = false;
    logger.error("[CatalogKnowledge] Falha ao garantir schema:", error);
    throw error;
  });

  return ensuring;
}
