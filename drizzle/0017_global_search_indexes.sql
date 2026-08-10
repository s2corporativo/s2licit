CREATE FULLTEXT INDEX `ft_products_name` ON `products` (`name`);--> statement-breakpoint
CREATE FULLTEXT INDEX `ft_suppliers_name` ON `suppliers` (`name`);--> statement-breakpoint
CREATE FULLTEXT INDEX `ft_funil_text` ON `funil_oportunidades` (`titulo`, `orgao`);--> statement-breakpoint
CREATE FULLTEXT INDEX `ft_email_quotations_text` ON `email_quotations` (`orgao`, `subject`);--> statement-breakpoint
CREATE FULLTEXT INDEX `ft_proposals_text` ON `proposals` (`title`, `orgName`);--> statement-breakpoint
CREATE FULLTEXT INDEX `ft_sales_invoices_orgao` ON `sales_invoices` (`orgao`);--> statement-breakpoint
CREATE FULLTEXT INDEX `ft_purchase_orders_text` ON `purchase_orders` (`descricao`, `fornecedorNome`);--> statement-breakpoint
CREATE FULLTEXT INDEX `ft_certidoes_text` ON `certidoes` (`tipo`, `orgaoEmissor`);--> statement-breakpoint
CREATE INDEX `idx_sales_invoices_numero` ON `sales_invoices` (`numero`);--> statement-breakpoint
CREATE INDEX `idx_purchase_orders_vinculo` ON `purchase_orders` (`vinculo`);--> statement-breakpoint
CREATE INDEX `idx_certidoes_numero` ON `certidoes` (`numero`);