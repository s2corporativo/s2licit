CREATE TABLE `quotation_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quotationId` int NOT NULL,
	`productId` int,
	`productName` varchar(512) NOT NULL,
	`supplierName` varchar(256),
	`activeIngredient` varchar(512),
	`manufacturer` varchar(256),
	`concentration` varchar(128),
	`presentation` varchar(256),
	`unit` varchar(64),
	`price` decimal(12,2),
	`priceUnit` varchar(64),
	`quantity` int NOT NULL DEFAULT 1,
	`sortOrder` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quotation_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quotations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(256) NOT NULL,
	`clientName` varchar(256),
	`clientContact` varchar(256),
	`notes` text,
	`status` enum('draft','finalized') NOT NULL DEFAULT 'draft',
	`validUntil` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quotations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `quotation_items` ADD CONSTRAINT `quotation_items_quotationId_quotations_id_fk` FOREIGN KEY (`quotationId`) REFERENCES `quotations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quotation_items` ADD CONSTRAINT `quotation_items_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_qitems_quotation` ON `quotation_items` (`quotationId`);