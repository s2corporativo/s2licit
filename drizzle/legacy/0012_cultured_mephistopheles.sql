CREATE TABLE `synonyms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`term` varchar(256) NOT NULL,
	`canonical` varchar(256) NOT NULL,
	`category` varchar(64) DEFAULT 'geral',
	`isActive` enum('yes','no') NOT NULL DEFAULT 'yes',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `synonyms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_synonym_term` ON `synonyms` (`term`);--> statement-breakpoint
CREATE INDEX `idx_synonym_canonical` ON `synonyms` (`canonical`);