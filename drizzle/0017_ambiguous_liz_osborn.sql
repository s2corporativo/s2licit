CREATE TABLE `gov_participation_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`govLicitationId` int NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'participou',
	`result` varchar(32) DEFAULT 'pendente',
	`proposalId` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gov_participation_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `gov_participation_history` ADD CONSTRAINT `gov_participation_history_govLicitationId_gov_licitations_id_fk` FOREIGN KEY (`govLicitationId`) REFERENCES `gov_licitations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gov_participation_history` ADD CONSTRAINT `gov_participation_history_proposalId_proposals_id_fk` FOREIGN KEY (`proposalId`) REFERENCES `proposals`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_govpart_licid` ON `gov_participation_history` (`govLicitationId`);--> statement-breakpoint
CREATE INDEX `idx_govpart_status` ON `gov_participation_history` (`status`);