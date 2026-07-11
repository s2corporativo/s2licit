CREATE TABLE `master_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ean` varchar(64),
	`codigoMapa` varchar(64),
	`name` varchar(512) NOT NULL,
	`activeIngredient` varchar(512),
	`manufacturer` varchar(256),
	`concentration` varchar(128),
	`presentation` varchar(256),
	`unit` varchar(64),
	`description` text,
	`categoryName` varchar(256),
	`categoryId` int,
	`imageUrl` text,
	`productUrl` text,
	`isActive` enum('yes','no') NOT NULL DEFAULT 'yes',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `master_products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `master_products` ADD CONSTRAINT `master_products_categoryId_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_master_name` ON `master_products` (`name`);--> statement-breakpoint
CREATE INDEX `idx_master_ean` ON `master_products` (`ean`);--> statement-breakpoint
CREATE INDEX `idx_master_mapa` ON `master_products` (`codigoMapa`);--> statement-breakpoint
CREATE INDEX `idx_master_ingredient` ON `master_products` (`activeIngredient`);