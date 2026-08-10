-- Catálogo canônico + Compêndio de Equivalências
-- Migração aditiva e reversível: não remove estruturas legadas.

CREATE TABLE IF NOT EXISTS `equivalence_compendium_entries` (
  `id` int AUTO_INCREMENT NOT NULL,
  `canonicalName` varchar(512) NOT NULL,
  `catalogType` varchar(64) NOT NULL DEFAULT 'geral',
  `activeIngredient` varchar(512),
  `concentration` varchar(128),
  `pharmaceuticalForm` varchar(128),
  `presentation` varchar(256),
  `manufacturer` varchar(256),
  `therapeuticClass` varchar(256),
  `targetSpecies` varchar(512),
  `administrationRoute` varchar(128),
  `regulatoryType` varchar(32),
  `regulatoryNumber` varchar(128),
  `catmatCode` varchar(32),
  `catmasCode` varchar(32),
  `ncm` varchar(16),
  `aliases` json,
  `technicalProfile` json,
  `equivalenceCriteria` json,
  `sourceSummary` text,
  `confidence` decimal(5,2) NOT NULL DEFAULT '0.00',
  `validationStatus` enum('draft','ai_review','human_validated','rejected') NOT NULL DEFAULT 'draft',
  `validatedByUserId` int,
  `validatedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `equivalence_compendium_entries_id` PRIMARY KEY (`id`),
  INDEX `idx_ece_name` (`canonicalName`(191)),
  INDEX `idx_ece_active_ingredient` (`activeIngredient`(191)),
  INDEX `idx_ece_catalog_type` (`catalogType`),
  INDEX `idx_ece_regulatory` (`regulatoryType`,`regulatoryNumber`),
  INDEX `idx_ece_catmat` (`catmatCode`),
  INDEX `idx_ece_catmas` (`catmasCode`),
  INDEX `idx_ece_status` (`validationStatus`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `equivalence_compendium_members` (
  `id` int AUTO_INCREMENT NOT NULL,
  `entryId` int NOT NULL,
  `productId` int NOT NULL,
  `relationType` enum('reference','equivalent','alternative','similar','incompatible') NOT NULL DEFAULT 'equivalent',
  `technicalScore` decimal(5,2),
  `commercialScore` decimal(5,2),
  `evidence` json,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `equivalence_compendium_members_id` PRIMARY KEY (`id`),
  CONSTRAINT `uq_ecm_entry_product` UNIQUE (`entryId`,`productId`),
  INDEX `idx_ecm_product` (`productId`),
  INDEX `idx_ecm_relation` (`relationType`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `equivalence_compendium_feedback` (
  `id` int AUTO_INCREMENT NOT NULL,
  `queryText` text,
  `referenceProductId` int,
  `candidateProductId` int NOT NULL,
  `entryId` int,
  `decision` enum('approved','rejected','needs_review') NOT NULL,
  `reason` text,
  `scoreSnapshot` json,
  `createdByUserId` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_ecf_reference` (`referenceProductId`),
  INDEX `idx_ecf_candidate` (`candidateProductId`),
  INDEX `idx_ecf_entry` (`entryId`),
  INDEX `idx_ecf_decision` (`decision`),
  CONSTRAINT `equivalence_compendium_feedback_id` PRIMARY KEY (`id`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `product_field_provenance` (
  `id` int AUTO_INCREMENT NOT NULL,
  `productId` int NOT NULL,
  `fieldName` varchar(128) NOT NULL,
  `fieldValueHash` varchar(64),
  `sourceType` varchar(64) NOT NULL,
  `sourceReference` varchar(512),
  `confidence` decimal(5,2),
  `validatedByUserId` int,
  `validatedAt` timestamp NULL,
  `metadata` json,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `product_field_provenance_id` PRIMARY KEY (`id`),
  INDEX `idx_pfp_product` (`productId`),
  INDEX `idx_pfp_field` (`fieldName`),
  INDEX `idx_pfp_source` (`sourceType`)
);
