-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0024 — Vínculo entre certidões e fornecedores
-- ─────────────────────────────────────────────────────────────────────────────
-- A tabela `certidoes` era global: servia como controle institucional do
-- escritório, sem saber a qual fornecedor cada CND/CRF/CRT pertence. Sem esse
-- vínculo não há como responder "este fornecedor está regular?" — que é o que
-- a habilitação em licitação exige.
--
-- `supplierId` é NULLABLE de propósito: as certidões institucionais já
-- cadastradas continuam válidas sem fornecedor, e a coluna nova não invalida
-- nenhuma consulta existente. Retrocompatível por construção.
--
-- ON DELETE SET NULL, não CASCADE: excluir um fornecedor não pode apagar o
-- documento fiscal, que tem valor probatório próprio e prazo de guarda.
--
-- Idempotente: o bloco PREPARE/EXECUTE consulta o information_schema antes de
-- alterar, porque MySQL não suporta `ADD COLUMN IF NOT EXISTS`.
--
-- Downgrade:
--   ALTER TABLE `certidoes` DROP FOREIGN KEY `fk_certidoes_supplier`;
--   DROP INDEX `idx_certidoes_supplier` ON `certidoes`;
--   ALTER TABLE `certidoes` DROP COLUMN `supplierId`;
-- Sem perda de dados: apenas o vínculo é descartado, as certidões permanecem.
-- ─────────────────────────────────────────────────────────────────────────────

SET @col_existe := (
	SELECT COUNT(*) FROM information_schema.COLUMNS
	WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'certidoes' AND COLUMN_NAME = 'supplierId'
);
--> statement-breakpoint
SET @sql := IF(@col_existe = 0,
	'ALTER TABLE `certidoes` ADD COLUMN `supplierId` int NULL',
	'SELECT 1');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

SET @idx_existe := (
	SELECT COUNT(*) FROM information_schema.STATISTICS
	WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'certidoes' AND INDEX_NAME = 'idx_certidoes_supplier'
);
--> statement-breakpoint
SET @sql := IF(@idx_existe = 0,
	'CREATE INDEX `idx_certidoes_supplier` ON `certidoes` (`supplierId`)',
	'SELECT 1');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

SET @fk_existe := (
	SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
	WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'certidoes'
	  AND CONSTRAINT_NAME = 'fk_certidoes_supplier'
);
--> statement-breakpoint
SET @sql := IF(@fk_existe = 0,
	'ALTER TABLE `certidoes` ADD CONSTRAINT `fk_certidoes_supplier` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE SET NULL',
	'SELECT 1');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
