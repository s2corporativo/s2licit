-- Create scraper_configs table
CREATE TABLE IF NOT EXISTS `scraper_configs` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `supplierId` int NOT NULL,
  `scraperType` varchar(64) NOT NULL,
  `enabled` enum('yes','no') NOT NULL DEFAULT 'yes',
  `email` text NOT NULL,
  `passwordHash` text NOT NULL,
  `scheduleTime` varchar(8) DEFAULT '02:00',
  `lastRunAt` timestamp NULL,
  `nextRunAt` timestamp NULL,
  `lastRunStatus` enum('success','failed','pending') DEFAULT 'pending',
  `lastRunErrorMessage` text,
  `productsScrapedCount` int DEFAULT 0,
  `productsMatchedCount` int DEFAULT 0,
  `productsUpdatedCount` int DEFAULT 0,
  `productsCreatedCount` int DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `unique_supplier_scraper` (`supplierId`, `scraperType`)
);

-- Create scraper_logs table
CREATE TABLE IF NOT EXISTS `scraper_logs` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `scraperConfigId` int NOT NULL,
  `status` enum('success','failed','running') NOT NULL,
  `startedAt` timestamp NOT NULL,
  `completedAt` timestamp NULL,
  `durationMs` int,
  `productsScraped` int DEFAULT 0,
  `productsMatched` int DEFAULT 0,
  `productsUpdated` int DEFAULT 0,
  `productsCreated` int DEFAULT 0,
  `errorMessage` text,
  `errorStack` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`scraperConfigId`) REFERENCES `scraper_configs`(`id`) ON DELETE CASCADE,
  INDEX `idx_scraper_config_id` (`scraperConfigId`),
  INDEX `idx_created_at` (`createdAt`)
);
