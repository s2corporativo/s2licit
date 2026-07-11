CREATE TABLE `proposal_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`orgType` enum('prefeitura','estado','federal','privado','outro') NOT NULL DEFAULT 'outro',
	`icmsPercent` decimal(5,2) DEFAULT '0',
	`stPercent` decimal(5,2) DEFAULT '0',
	`ipiPercent` decimal(5,2) DEFAULT '0',
	`otherTaxPercent` decimal(5,2) DEFAULT '0',
	`freightType` enum('cif','fob','none') DEFAULT 'cif',
	`freightPercent` decimal(5,2) DEFAULT '0',
	`validityDays` int DEFAULT 30,
	`declarations` text,
	`paymentTerms` varchar(256),
	`deliveryDays` int DEFAULT 15,
	`notes` text,
	`isDefault` enum('yes','no') NOT NULL DEFAULT 'no',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `proposal_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_ptpl_orgtype` ON `proposal_templates` (`orgType`);--> statement-breakpoint
CREATE INDEX `idx_ptpl_default` ON `proposal_templates` (`isDefault`);