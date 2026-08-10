ALTER TABLE `email_quotations` MODIFY COLUMN `sourceType` enum('spreadsheet','pdf','docx','image','body','manual') NOT NULL DEFAULT 'body';--> statement-breakpoint
ALTER TABLE `portal_credentials` ADD `sessaoCookies` text;--> statement-breakpoint
ALTER TABLE `portal_credentials` ADD `sessaoExpiraEm` timestamp;--> statement-breakpoint
ALTER TABLE `proposals` ADD `emailQuotationId` int;--> statement-breakpoint
ALTER TABLE `proposals` ADD CONSTRAINT `proposals_emailQuotationId_email_quotations_id_fk` FOREIGN KEY (`emailQuotationId`) REFERENCES `email_quotations`(`id`) ON DELETE set null ON UPDATE no action;