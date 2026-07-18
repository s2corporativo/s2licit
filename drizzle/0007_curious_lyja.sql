CREATE TABLE `ai_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tipo` varchar(64) NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'executando',
	`payload` json,
	`progresso` json,
	`errorMessages` json,
	`requestedBy` int,
	`iniciadoEm` timestamp NOT NULL DEFAULT (now()),
	`concluidoEm` timestamp,
	CONSTRAINT `ai_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_usage_daily` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dia` varchar(10) NOT NULL,
	`provider` varchar(32) NOT NULL,
	`model` varchar(128) NOT NULL,
	`chamadas` int NOT NULL DEFAULT 0,
	`promptTokens` int NOT NULL DEFAULT 0,
	`completionTokens` int NOT NULL DEFAULT 0,
	`custoUsd` decimal(12,6) NOT NULL DEFAULT '0',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_usage_daily_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_ai_usage_dia_prov_model` UNIQUE(`dia`,`provider`,`model`)
);
--> statement-breakpoint
ALTER TABLE `captured_product_batches` MODIFY COLUMN `sourceType` enum('url','html','pdf','spreadsheet','xml','docx','text','image') NOT NULL;--> statement-breakpoint
ALTER TABLE `captured_product_source_logs` MODIFY COLUMN `sourceType` enum('url','html','pdf','spreadsheet','xml','docx','text','image') NOT NULL;--> statement-breakpoint
ALTER TABLE `tax_rules` MODIFY COLUMN `tipo` enum('simples_efetiva','icms','difal','st','fcp','iss','ipi','pis','cofins','outro') NOT NULL;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `ipAddress` varchar(64);--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `userAgent` varchar(512);--> statement-breakpoint
ALTER TABLE `company_settings` ADD `priceValidityPreset` varchar(16) DEFAULT '24h';--> statement-breakpoint
ALTER TABLE `company_settings` ADD `priceValidityCustomHours` int;--> statement-breakpoint
ALTER TABLE `product_supplier_offers` ADD `promoPrice` decimal(12,2);--> statement-breakpoint
ALTER TABLE `product_supplier_offers` ADD `stock` int;--> statement-breakpoint
ALTER TABLE `scraper_logs` ADD `evidenceUrl` varchar(512);--> statement-breakpoint
ALTER TABLE `supplier_sessions` ADD `localStorage` text;--> statement-breakpoint
ALTER TABLE `users` ADD `failedLoginAttempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `lockedUntil` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `mfaEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `mfaSecret` text;--> statement-breakpoint
ALTER TABLE `users` ADD `disabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_ai_jobs_status` ON `ai_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_ai_jobs_tipo` ON `ai_jobs` (`tipo`);