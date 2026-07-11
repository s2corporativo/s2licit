CREATE TABLE `categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`slug` varchar(128) NOT NULL,
	`description` text,
	`color` varchar(32) DEFAULT '#DC2626',
	`sortOrder` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `categories_name_unique` UNIQUE(`name`),
	CONSTRAINT `categories_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `equivalence_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`activeIngredient` varchar(512) NOT NULL,
	`categoryId` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `equivalence_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `equivalence_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`productId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `equivalence_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_equiv_member` UNIQUE(`groupId`,`productId`)
);
--> statement-breakpoint
CREATE TABLE `import_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierId` int,
	`categoryId` int,
	`fileName` varchar(512) NOT NULL,
	`fileUrl` text,
	`totalRows` int DEFAULT 0,
	`importedRows` int DEFAULT 0,
	`errorRows` int DEFAULT 0,
	`status` enum('pending','processing','done','error') NOT NULL DEFAULT 'pending',
	`errorMessage` text,
	`columnMapping` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `import_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierId` int NOT NULL,
	`categoryId` int NOT NULL,
	`code` varchar(128),
	`name` varchar(512) NOT NULL,
	`description` text,
	`activeIngredient` varchar(512),
	`manufacturer` varchar(256),
	`unit` varchar(64),
	`concentration` varchar(128),
	`presentation` varchar(256),
	`price` decimal(12,2),
	`priceUnit` varchar(64),
	`stock` varchar(64),
	`importBatchId` int,
	`isActive` enum('yes','no') NOT NULL DEFAULT 'yes',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`code` varchar(64),
	`contact` varchar(256),
	`email` varchar(320),
	`phone` varchar(32),
	`notes` text,
	`isActive` enum('yes','no') NOT NULL DEFAULT 'yes',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `suppliers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `equivalence_groups` ADD CONSTRAINT `equivalence_groups_categoryId_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `equivalence_members` ADD CONSTRAINT `equivalence_members_groupId_equivalence_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `equivalence_groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `equivalence_members` ADD CONSTRAINT `equivalence_members_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `import_logs` ADD CONSTRAINT `import_logs_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `import_logs` ADD CONSTRAINT `import_logs_categoryId_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_categoryId_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_equiv_product` ON `equivalence_members` (`productId`);--> statement-breakpoint
CREATE INDEX `idx_products_supplier` ON `products` (`supplierId`);--> statement-breakpoint
CREATE INDEX `idx_products_category` ON `products` (`categoryId`);--> statement-breakpoint
CREATE INDEX `idx_products_active_ingredient` ON `products` (`activeIngredient`);--> statement-breakpoint
CREATE INDEX `idx_products_name` ON `products` (`name`);