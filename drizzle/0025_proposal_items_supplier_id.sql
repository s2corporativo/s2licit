-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0025 — Rastreabilidade do fornecedor no item de proposta
-- ─────────────────────────────────────────────────────────────────────────────
-- `proposal_items.supplierName` é texto livre, sem FK. Duas grafias do mesmo
-- fornecedor ("Tambasa" / "TAMBASA LTDA") viram dois fornecedores diferentes
-- para qualquer agregação, e não há como responder de quantas licitações um
-- fornecedor participou de fato — que é a Ressalva 4 do Módulo 06.
--
-- Etapa de curto prazo do plano: coluna `supplierId` NULLABLE ao lado do texto,
-- sem remover `supplierName`. O texto continua sendo a fonte do que foi
-- efetivamente digitado/importado; a FK passa a ser a chave de agregação.
--
-- ON DELETE SET NULL: excluir um fornecedor não pode apagar o item da proposta,
-- que é registro comercial. O item perde o vínculo, não o conteúdo.
--
-- BACKFILL: casa por nome normalizado (TRIM + LOWER). Deliberadamente NÃO cria
-- fornecedor a partir de texto livre — nome que não casa fica NULL. Criar
-- fornecedor automaticamente a partir de campo digitado povoaria o cadastro
-- com erros de digitação, que é o problema que esta migration existe para
-- resolver, não para amplificar.
--
-- Downgrade:
--   ALTER TABLE `proposal_items` DROP FOREIGN KEY `fk_proposal_items_supplier`;
--   DROP INDEX `idx_proposal_items_supplier` ON `proposal_items`;
--   ALTER TABLE `proposal_items` DROP COLUMN `supplierId`;
-- Sem perda: `supplierName` permanece intacto o tempo todo.
-- ─────────────────────────────────────────────────────────────────────────────

SET @col_existe := (
	SELECT COUNT(*) FROM information_schema.COLUMNS
	WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proposal_items' AND COLUMN_NAME = 'supplierId'
);
--> statement-breakpoint
SET @sql := IF(@col_existe = 0,
	'ALTER TABLE `proposal_items` ADD COLUMN `supplierId` int NULL',
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
	WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proposal_items' AND INDEX_NAME = 'idx_proposal_items_supplier'
);
--> statement-breakpoint
SET @sql := IF(@idx_existe = 0,
	'CREATE INDEX `idx_proposal_items_supplier` ON `proposal_items` (`supplierId`)',
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
	WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proposal_items'
	  AND CONSTRAINT_NAME = 'fk_proposal_items_supplier'
);
--> statement-breakpoint
SET @sql := IF(@fk_existe = 0,
	'ALTER TABLE `proposal_items` ADD CONSTRAINT `fk_proposal_items_supplier` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE SET NULL',
	'SELECT 1');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint

-- Backfill idempotente: só preenche o que ainda está NULL e só quando o nome
-- normalizado casa exatamente um fornecedor existente.
UPDATE `proposal_items` pi
JOIN `suppliers` s ON LOWER(TRIM(s.`name`)) = LOWER(TRIM(pi.`supplierName`))
SET pi.`supplierId` = s.`id`
WHERE pi.`supplierId` IS NULL
  AND pi.`supplierName` IS NOT NULL
  AND TRIM(pi.`supplierName`) <> '';
