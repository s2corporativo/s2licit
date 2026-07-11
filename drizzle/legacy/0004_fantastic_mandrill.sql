CREATE TABLE `company_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL DEFAULT '',
	`cnpj` varchar(18),
	`address` text,
	`city` varchar(128),
	`state` varchar(2),
	`zipCode` varchar(10),
	`phone` varchar(32),
	`email` varchar(320),
	`website` varchar(256),
	`logoUrl` text,
	`bankInfo` text,
	`notes` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `company_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `proposal_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`proposalId` int NOT NULL,
	`productId` int,
	`itemNumber` int DEFAULT 0,
	`productName` varchar(512) NOT NULL,
	`activeIngredient` varchar(512),
	`manufacturer` varchar(256),
	`concentration` varchar(128),
	`presentation` varchar(256),
	`unit` varchar(64),
	`supplierName` varchar(256),
	`unitPrice` decimal(12,2),
	`quantity` int NOT NULL DEFAULT 1,
	`totalPrice` decimal(14,2),
	`notes` text,
	`sortOrder` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `proposal_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processNumber` varchar(128),
	`orgId` int,
	`orgName` varchar(256),
	`title` varchar(256) NOT NULL,
	`status` enum('draft','finalized','sent') NOT NULL DEFAULT 'draft',
	`validityDays` int DEFAULT 30,
	`paymentTerms` varchar(256),
	`deliveryTerms` varchar(256),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `proposals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `requesting_orgs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`cnpj` varchar(18),
	`address` text,
	`city` varchar(128),
	`state` varchar(2),
	`phone` varchar(32),
	`email` varchar(320),
	`contactPerson` varchar(256),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `requesting_orgs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `proposal_items` ADD CONSTRAINT `proposal_items_proposalId_proposals_id_fk` FOREIGN KEY (`proposalId`) REFERENCES `proposals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposal_items` ADD CONSTRAINT `proposal_items_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposals` ADD CONSTRAINT `proposals_orgId_requesting_orgs_id_fk` FOREIGN KEY (`orgId`) REFERENCES `requesting_orgs`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_pitems_proposal` ON `proposal_items` (`proposalId`);