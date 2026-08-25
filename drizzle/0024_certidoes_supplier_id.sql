-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0024 — Vínculo opcional certidão → fornecedor (Ressalva 2, Módulo 06)
-- ─────────────────────────────────────────────────────────────────────────────
-- `certidoes` era uma tabela puramente institucional. Adiciona `supplierId`
-- nullable para permitir vincular certidões (CND, FGTS, Trabalhista etc.) a um
-- fornecedor específico, sem afetar as certidões institucionais existentes
-- (permanecem válidas com supplierId NULL). Idempotente: o runner de produção
-- (scripts/migrate-production.mjs) ignora erro 1060 (coluna já existe).
-- Downgrade (somente se a coluna estiver vazia em produção):
--   ALTER TABLE `certidoes` DROP FOREIGN KEY `certidoes_supplierId_suppliers_id_fk`;
--   ALTER TABLE `certidoes` DROP COLUMN `supplierId`;
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE `certidoes` ADD COLUMN `supplierId` int;
--> statement-breakpoint
ALTER TABLE `certidoes` ADD CONSTRAINT `certidoes_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint
CREATE INDEX `idx_certidoes_supplier` ON `certidoes` (`supplierId`);
