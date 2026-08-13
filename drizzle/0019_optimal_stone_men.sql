CREATE TABLE `product_relations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productIdA` int NOT NULL,
	`productIdB` int NOT NULL,
	`relationType` varchar(64) NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'pending',
	`score` decimal(5,4),
	`evidence` json,
	`decidedBy` varchar(32) NOT NULL DEFAULT 'system',
	`createdBy` int,
	`confirmedBy` int,
	`confirmedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `product_relations_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_relation_pair` UNIQUE(`productIdA`,`productIdB`)
);
--> statement-breakpoint
ALTER TABLE `equivalence_groups` ADD `relationType` varchar(64) DEFAULT 'EQUIVALENT' NOT NULL;--> statement-breakpoint
ALTER TABLE `equivalence_groups` ADD `reason` text;--> statement-breakpoint
ALTER TABLE `equivalence_groups` ADD `confidence` decimal(5,4);--> statement-breakpoint
ALTER TABLE `equivalence_groups` ADD `confirmedBy` int;--> statement-breakpoint
ALTER TABLE `equivalence_groups` ADD `confirmedAt` timestamp;--> statement-breakpoint
ALTER TABLE `product_relations` ADD CONSTRAINT `product_relations_productIdA_products_id_fk` FOREIGN KEY (`productIdA`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_relations` ADD CONSTRAINT `product_relations_productIdB_products_id_fk` FOREIGN KEY (`productIdB`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_relations` ADD CONSTRAINT `product_relations_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_relations` ADD CONSTRAINT `product_relations_confirmedBy_users_id_fk` FOREIGN KEY (`confirmedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_relations_product_a` ON `product_relations` (`productIdA`);--> statement-breakpoint
CREATE INDEX `idx_relations_product_b` ON `product_relations` (`productIdB`);--> statement-breakpoint
CREATE INDEX `idx_relations_type` ON `product_relations` (`relationType`);--> statement-breakpoint
CREATE INDEX `idx_relations_status` ON `product_relations` (`status`);--> statement-breakpoint
ALTER TABLE `equivalence_groups` ADD CONSTRAINT `equivalence_groups_confirmedBy_users_id_fk` FOREIGN KEY (`confirmedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;