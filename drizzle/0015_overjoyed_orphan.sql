CREATE TABLE `match_feedback` (
	`id` int AUTO_INCREMENT NOT NULL,
	`editalTerm` varchar(512) NOT NULL,
	`productId` int NOT NULL,
	`productName` varchar(512) NOT NULL,
	`useCount` int NOT NULL DEFAULT 1,
	`confirmedAt` timestamp NOT NULL DEFAULT (now()),
	`lastUsedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `match_feedback_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `match_feedback` ADD CONSTRAINT `match_feedback_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_mfb_term` ON `match_feedback` (`editalTerm`);--> statement-breakpoint
CREATE INDEX `idx_mfb_product` ON `match_feedback` (`productId`);