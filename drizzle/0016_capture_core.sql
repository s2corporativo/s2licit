CREATE TABLE `capture_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scraperConfigId` int NOT NULL,
	`supplierId` int NOT NULL,
	`activeKey` varchar(96),
	`mode` enum('search','refresh','full') NOT NULL DEFAULT 'full',
	`trigger` enum('manual','scheduled','bulk','proposal','api') NOT NULL DEFAULT 'manual',
	`status` enum('queued','running','success','partial','failed','quarantine','cancelled') NOT NULL DEFAULT 'queued',
	`priority` int NOT NULL DEFAULT 50,
	`query` varchar(512),
	`progressStage` varchar(64),
	`progressMessage` text,
	`expectedItems` int,
	`capturedItems` int NOT NULL DEFAULT 0,
	`matchedItems` int NOT NULL DEFAULT 0,
	`changedItems` int NOT NULL DEFAULT 0,
	`createdItems` int NOT NULL DEFAULT 0,
	`reviewItems` int NOT NULL DEFAULT 0,
	`errorItems` int NOT NULL DEFAULT 0,
	`qualityScore` decimal(6,2),
	`attempts` int NOT NULL DEFAULT 0,
	`maxAttempts` int NOT NULL DEFAULT 3,
	`runAfter` timestamp NOT NULL DEFAULT (now()),
	`workerId` varchar(128),
	`heartbeatAt` timestamp,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`errorMessage` text,
	`evidenceUrl` text,
	`meta` json,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `capture_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_capture_jobs_active_key` UNIQUE(`activeKey`),
	CONSTRAINT `capture_jobs_scraper_fk` FOREIGN KEY (`scraperConfigId`) REFERENCES `scraper_configs`(`id`) ON DELETE cascade,
	CONSTRAINT `capture_jobs_supplier_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE cascade,
	CONSTRAINT `capture_jobs_user_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_capture_jobs_queue` ON `capture_jobs` (`status`,`runAfter`,`priority`);
--> statement-breakpoint
CREATE INDEX `idx_capture_jobs_config` ON `capture_jobs` (`scraperConfigId`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `idx_capture_jobs_supplier` ON `capture_jobs` (`supplierId`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `idx_capture_jobs_heartbeat` ON `capture_jobs` (`status`,`heartbeatAt`);
--> statement-breakpoint
CREATE TRIGGER `capture_jobs_bi_active_key`
BEFORE INSERT ON `capture_jobs`
FOR EACH ROW
SET NEW.`activeKey` = IF(NEW.`status` IN ('queued','running'), CONCAT('scraper:', NEW.`scraperConfigId`), NULL);
--> statement-breakpoint
CREATE TRIGGER `capture_jobs_bu_active_key`
BEFORE UPDATE ON `capture_jobs`
FOR EACH ROW
SET NEW.`activeKey` = IF(NEW.`status` IN ('queued','running'), CONCAT('scraper:', NEW.`scraperConfigId`), NULL);
--> statement-breakpoint
CREATE TABLE `supplier_product_observations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`captureJobId` int NOT NULL,
	`scraperConfigId` int NOT NULL,
	`supplierId` int NOT NULL,
	`productId` int,
	`supplierSku` varchar(128),
	`ean` varchar(64),
	`rawName` varchar(512) NOT NULL,
	`normalizedName` varchar(512) NOT NULL,
	`rawPrice` varchar(128),
	`price` decimal(14,4),
	`normalPrice` decimal(14,4),
	`promoPrice` decimal(14,4),
	`stock` int,
	`availability` enum('in_stock','out_of_stock','limited','backorder','unknown') NOT NULL DEFAULT 'unknown',
	`productUrl` text,
	`imageUrl` text,
	`sourceType` enum('api','http','browser','structured') NOT NULL DEFAULT 'browser',
	`sourceUrl` text,
	`contentHash` varchar(64) NOT NULL,
	`confidence` decimal(5,2) NOT NULL DEFAULT '0',
	`action` enum('no_change','update','create','review','blocked') NOT NULL DEFAULT 'review',
	`reason` text,
	`rawPayload` json,
	`reviewStatus` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`reviewedAt` timestamp,
	`reviewedByUserId` int,
	`capturedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supplier_product_observations_id` PRIMARY KEY(`id`),
	CONSTRAINT `observations_job_fk` FOREIGN KEY (`captureJobId`) REFERENCES `capture_jobs`(`id`) ON DELETE cascade,
	CONSTRAINT `observations_scraper_fk` FOREIGN KEY (`scraperConfigId`) REFERENCES `scraper_configs`(`id`) ON DELETE cascade,
	CONSTRAINT `observations_supplier_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE cascade,
	CONSTRAINT `observations_product_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE set null,
	CONSTRAINT `observations_reviewer_fk` FOREIGN KEY (`reviewedByUserId`) REFERENCES `users`(`id`) ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_observations_job` ON `supplier_product_observations` (`captureJobId`);
--> statement-breakpoint
CREATE INDEX `idx_observations_supplier_sku` ON `supplier_product_observations` (`supplierId`,`supplierSku`);
--> statement-breakpoint
CREATE INDEX `idx_observations_ean` ON `supplier_product_observations` (`ean`);
--> statement-breakpoint
CREATE INDEX `idx_observations_product` ON `supplier_product_observations` (`productId`,`capturedAt`);
--> statement-breakpoint
CREATE INDEX `idx_observations_hash` ON `supplier_product_observations` (`supplierId`,`contentHash`);
--> statement-breakpoint
CREATE INDEX `idx_observations_review_queue` ON `supplier_product_observations` (`reviewStatus`,`action`,`capturedAt`);
--> statement-breakpoint
CREATE TABLE `capture_job_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`captureJobId` int NOT NULL,
	`level` enum('info','warning','error') NOT NULL DEFAULT 'info',
	`stage` varchar(64),
	`message` text NOT NULL,
	`data` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `capture_job_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `capture_events_job_fk` FOREIGN KEY (`captureJobId`) REFERENCES `capture_jobs`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_capture_job_events_job` ON `capture_job_events` (`captureJobId`,`createdAt`);
--> statement-breakpoint
CREATE TABLE `capture_ai_feedback` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierId` int,
	`observationId` int,
	`decision` enum('correct_match','wrong_match','approve_update','reject_update','correct_normalization','false_anomaly','true_anomaly') NOT NULL,
	`observedName` varchar(512),
	`expectedProductId` int,
	`expectedNormalizedName` varchar(512),
	`notes` text,
	`reusable` boolean NOT NULL DEFAULT true,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `capture_ai_feedback_id` PRIMARY KEY(`id`),
	CONSTRAINT `capture_feedback_supplier_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE cascade,
	CONSTRAINT `capture_feedback_observation_fk` FOREIGN KEY (`observationId`) REFERENCES `supplier_product_observations`(`id`) ON DELETE set null,
	CONSTRAINT `capture_feedback_product_fk` FOREIGN KEY (`expectedProductId`) REFERENCES `products`(`id`) ON DELETE set null,
	CONSTRAINT `capture_feedback_user_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_capture_ai_feedback_supplier` ON `capture_ai_feedback` (`supplierId`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `idx_capture_ai_feedback_observation` ON `capture_ai_feedback` (`observationId`);
--> statement-breakpoint
CREATE INDEX `idx_capture_ai_feedback_lookup` ON `capture_ai_feedback` (`supplierId`,`observedName`,`reusable`);
--> statement-breakpoint
CREATE TABLE `capture_connector_health` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scraperConfigId` int NOT NULL,
	`supplierId` int NOT NULL,
	`status` enum('healthy','attention','login_required','degraded','unknown') NOT NULL DEFAULT 'unknown',
	`score` decimal(5,2) NOT NULL DEFAULT '0',
	`baselineItems` int,
	`lastCapturedItems` int,
	`consecutiveFailures` int NOT NULL DEFAULT 0,
	`lastSuccessAt` timestamp,
	`lastFailureAt` timestamp,
	`lastError` text,
	`capabilities` json,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `capture_connector_health_id` PRIMARY KEY(`id`),
	CONSTRAINT `capture_health_scraper_fk` FOREIGN KEY (`scraperConfigId`) REFERENCES `scraper_configs`(`id`) ON DELETE cascade,
	CONSTRAINT `capture_health_supplier_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE cascade,
	CONSTRAINT `uq_capture_connector_health_config` UNIQUE(`scraperConfigId`)
);
--> statement-breakpoint
CREATE INDEX `idx_capture_connector_health_status` ON `capture_connector_health` (`status`,`score`);
