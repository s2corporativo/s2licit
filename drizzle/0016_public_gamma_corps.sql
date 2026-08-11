ALTER TABLE `email_quotation_items` ADD `matchAuto` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `email_quotations` ADD `propostaPdfUrl` text;--> statement-breakpoint
ALTER TABLE `email_quotations` ADD `propostaGeradaEm` timestamp;--> statement-breakpoint
ALTER TABLE `email_quotations` ADD `propostaMargemPercent` decimal(5,2);