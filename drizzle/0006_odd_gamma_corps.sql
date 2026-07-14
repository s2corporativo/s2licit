CREATE TABLE `duplicate_exceptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId1` int NOT NULL,
	`productId2` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `duplicate_exceptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `duplicate_exceptions` ADD CONSTRAINT `duplicate_exceptions_productId1_products_id_fk` FOREIGN KEY (`productId1`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `duplicate_exceptions` ADD CONSTRAINT `duplicate_exceptions_productId2_products_id_fk` FOREIGN KEY (`productId2`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_duplicate_exceptions_pair` ON `duplicate_exceptions` (`productId1`,`productId2`);