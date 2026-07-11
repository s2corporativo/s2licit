CREATE TABLE `price_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`supplierId` int NOT NULL,
	`price` decimal(12,2),
	`freightValue` decimal(12,2),
	`taxValue` decimal(12,2),
	`landedCost` decimal(12,2),
	`priceAlert` enum('yes','no') NOT NULL DEFAULT 'no',
	`alertPercent` decimal(6,2),
	`importBatchId` int,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `price_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `master_products` MODIFY COLUMN `presentation` varchar(512);--> statement-breakpoint
ALTER TABLE `products` ADD `freightValue` decimal(12,2);--> statement-breakpoint
ALTER TABLE `products` ADD `taxValue` decimal(12,2);--> statement-breakpoint
ALTER TABLE `price_history` ADD CONSTRAINT `price_history_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `price_history` ADD CONSTRAINT `price_history_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_ph_product` ON `price_history` (`productId`);--> statement-breakpoint
CREATE INDEX `idx_ph_supplier` ON `price_history` (`supplierId`);--> statement-breakpoint
CREATE INDEX `idx_ph_recorded` ON `price_history` (`recordedAt`);