-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0021 — Sanções de Fornecedores (Lei 14.133/21, art. 155)
-- ─────────────────────────────────────────────────────────────────────────────
-- Permite registrar sanções administrativas por fornecedor e bloquear/alertar
-- cotações e propostas que envolvam produtos de fornecedores com penalidade
-- ativa e vigente. Idempotente (CREATE TABLE IF NOT EXISTS).
-- Downgrade (executar somente com a tabela vazia):
--   DROP TABLE IF EXISTS `supplier_sanctions`;
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `supplier_sanctions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierId` int NOT NULL,
	`orgao` varchar(256) NOT NULL,
	`processo` varchar(128),
	`penalidade` varchar(32) NOT NULL DEFAULT 'advertencia',
	`dataInicio` date NOT NULL,
	`dataFim` date,
	`referenciaLegal` varchar(512),
	`observacoes` text,
	`criadoPor` varchar(256),
	`status` varchar(16) NOT NULL DEFAULT 'ativa',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supplier_sanctions_id` PRIMARY KEY(`id`),
	CONSTRAINT `fk_supplier_sanctions_supplier` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX `idx_supplier_sanctions_supplier` ON `supplier_sanctions` (`supplierId`);
--> statement-breakpoint
CREATE INDEX `idx_supplier_sanctions_status_fim` ON `supplier_sanctions` (`status`, `dataFim`);
