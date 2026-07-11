CREATE TABLE `financial_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('income','expense') NOT NULL,
	`category` varchar(128),
	`description` varchar(512) NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`dueDate` timestamp,
	`paidAt` timestamp,
	`isPaid` enum('yes','no') NOT NULL DEFAULT 'no',
	`proposalId` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `financial_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `proposal_status_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`proposalId` int NOT NULL,
	`fromStatus` varchar(32),
	`toStatus` varchar(32) NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `proposal_status_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `proposals` MODIFY COLUMN `status` enum('draft','sent','order','in_transit','delivered','cancelled') NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE `proposals` ADD `freightValue` decimal(12,2);--> statement-breakpoint
ALTER TABLE `proposals` ADD `freightCarrier` varchar(256);--> statement-breakpoint
ALTER TABLE `proposals` ADD `freightTrackingCode` varchar(128);--> statement-breakpoint
ALTER TABLE `proposals` ADD `freightPaidAt` timestamp;--> statement-breakpoint
ALTER TABLE `proposals` ADD `sentAt` timestamp;--> statement-breakpoint
ALTER TABLE `proposals` ADD `orderedAt` timestamp;--> statement-breakpoint
ALTER TABLE `proposals` ADD `shippedAt` timestamp;--> statement-breakpoint
ALTER TABLE `proposals` ADD `deliveredAt` timestamp;--> statement-breakpoint
ALTER TABLE `proposals` ADD `cancelledAt` timestamp;--> statement-breakpoint
ALTER TABLE `proposals` ADD `totalValue` decimal(14,2);--> statement-breakpoint
ALTER TABLE `financial_entries` ADD CONSTRAINT `financial_entries_proposalId_proposals_id_fk` FOREIGN KEY (`proposalId`) REFERENCES `proposals`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposal_status_history` ADD CONSTRAINT `proposal_status_history_proposalId_proposals_id_fk` FOREIGN KEY (`proposalId`) REFERENCES `proposals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_fentries_type` ON `financial_entries` (`type`);--> statement-breakpoint
CREATE INDEX `idx_fentries_proposal` ON `financial_entries` (`proposalId`);--> statement-breakpoint
CREATE INDEX `idx_fentries_paid` ON `financial_entries` (`isPaid`);--> statement-breakpoint
CREATE INDEX `idx_psh_proposal` ON `proposal_status_history` (`proposalId`);