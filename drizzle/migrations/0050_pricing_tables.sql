-- Migração: Tabelas de Precificação por Categoria e Histórico de Aplicações em Massa
-- Criado em: 2026-04-06

-- ─── Regras de Precificação por Categoria ──────────────────────────────────
CREATE TABLE IF NOT EXISTS `category_pricing_rules` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `categoryId` int NOT NULL,
  `icmsPercentage` decimal(5,2) DEFAULT '0',
  `ipPercentage` decimal(5,2) DEFAULT '0',
  `pisPercentage` decimal(5,2) DEFAULT '0',
  `cofinsPercentage` decimal(5,2) DEFAULT '0',
  `freightType` enum('fixed','percentage') DEFAULT 'fixed',
  `freightValue` decimal(12,2) DEFAULT '0',
  `marginPercentage` decimal(5,2) NOT NULL,
  `minPrice` decimal(12,2),
  `maxPrice` decimal(12,2),
  `roundingMethod` enum('round','ceil','floor') DEFAULT 'round',
  `isActive` enum('yes','no') NOT NULL DEFAULT 'yes',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `category_pricing_rules_categoryId_categories_id_fk`
    FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE CASCADE
);

-- ─── Aplicações em Massa de Precificação ──────────────────────────────────
CREATE TABLE IF NOT EXISTS `bulk_pricing_applications` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `categoryId` int,
  `totalProducts` int NOT NULL,
  `updatedCount` int NOT NULL,
  `skippedCount` int DEFAULT 0,
  `errorCount` int DEFAULT 0,
  `marginPercentage` decimal(5,2) NOT NULL,
  `icmsPercentage` decimal(5,2) DEFAULT '0',
  `ipPercentage` decimal(5,2) DEFAULT '0',
  `pisPercentage` decimal(5,2) DEFAULT '0',
  `cofinsPercentage` decimal(5,2) DEFAULT '0',
  `freightType` enum('fixed','percentage') DEFAULT 'fixed',
  `freightValue` decimal(12,2) DEFAULT '0',
  `averagePriceIncrease` decimal(12,2) DEFAULT '0',
  `minNewPrice` decimal(12,2) DEFAULT '0',
  `maxNewPrice` decimal(12,2) DEFAULT '0',
  `appliedBy` int,
  `appliedAt` timestamp NOT NULL DEFAULT (now()),
  `status` enum('pending','completed','failed','reverted') DEFAULT 'completed',
  `errorMessage` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `bulk_pricing_applications_categoryId_categories_id_fk`
    FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE SET NULL,
  CONSTRAINT `bulk_pricing_applications_appliedBy_users_id_fk`
    FOREIGN KEY (`appliedBy`) REFERENCES `users`(`id`) ON DELETE SET NULL
);

-- ─── Detalhes de Aplicação em Massa ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `bulk_pricing_application_details` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `applicationId` int NOT NULL,
  `productId` int NOT NULL,
  `oldPrice` decimal(12,2) NOT NULL,
  `newPrice` decimal(12,2) NOT NULL,
  `priceIncrease` decimal(12,2) NOT NULL,
  `status` enum('success','skipped','error') DEFAULT 'success',
  `errorMessage` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `bulk_pricing_application_details_applicationId_fk`
    FOREIGN KEY (`applicationId`) REFERENCES `bulk_pricing_applications`(`id`) ON DELETE CASCADE,
  CONSTRAINT `bulk_pricing_application_details_productId_fk`
    FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE
);
