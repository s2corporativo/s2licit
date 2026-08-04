ALTER TABLE `proposals` ADD `competitorValue` decimal(15,2);--> statement-breakpoint
ALTER TABLE `proposals` ADD `lossReason` text;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `proposalId` int;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_proposalId_proposals_id_fk` FOREIGN KEY (`proposalId`) REFERENCES `proposals`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_po_proposal` ON `purchase_orders` (`proposalId`);