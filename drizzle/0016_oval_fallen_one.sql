CREATE TABLE `gov_licitation_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`govLicitationId` int NOT NULL,
	`descricaoItem` text NOT NULL,
	`quantidade` decimal(12,3) DEFAULT '1',
	`unidade` varchar(64),
	`valorEstimado` decimal(14,4),
	`activeIngredient` varchar(256),
	`concentration` varchar(128),
	`presentation` varchar(128),
	`matchedProductId` int,
	`matchScore` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gov_licitation_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gov_licitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`source` varchar(64) NOT NULL DEFAULT 'comprasgov',
	`externalId` varchar(256) NOT NULL,
	`uasg` varchar(64),
	`numeroAviso` varchar(128),
	`objeto` text NOT NULL,
	`dataPublicacao` timestamp,
	`dataAbertura` timestamp,
	`rawJson` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gov_licitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `gov_licitations_externalId_unique` UNIQUE(`externalId`)
);
--> statement-breakpoint
ALTER TABLE `gov_licitation_items` ADD CONSTRAINT `gov_licitation_items_govLicitationId_gov_licitations_id_fk` FOREIGN KEY (`govLicitationId`) REFERENCES `gov_licitations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gov_licitation_items` ADD CONSTRAINT `gov_licitation_items_matchedProductId_products_id_fk` FOREIGN KEY (`matchedProductId`) REFERENCES `products`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_govitem_licid` ON `gov_licitation_items` (`govLicitationId`);--> statement-breakpoint
CREATE INDEX `idx_govitem_product` ON `gov_licitation_items` (`matchedProductId`);--> statement-breakpoint
CREATE INDEX `idx_govlic_extid` ON `gov_licitations` (`externalId`);--> statement-breakpoint
CREATE INDEX `idx_govlic_datapub` ON `gov_licitations` (`dataPublicacao`);--> statement-breakpoint
CREATE INDEX `idx_govlic_uasg` ON `gov_licitations` (`uasg`);