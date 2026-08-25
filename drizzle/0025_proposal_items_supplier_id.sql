-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0025 — Vínculo opcional item de proposta → fornecedor (Ressalva 4, Módulo 06, curto prazo)
-- ─────────────────────────────────────────────────────────────────────────────
-- `proposal_items.supplierName` é texto livre, sem FK — risco de divergência de
-- nomenclatura e sem rastreabilidade de participação por fornecedor. Adiciona
-- `supplierId` nullable como FK rastreável, mantida a coluna `supplierName`
-- existente por compatibilidade (nem todo item tem correspondência exata em
-- `suppliers` — o backfill preenche o que casar por nome, o restante permanece
-- NULL). Idempotente: o runner de produção (scripts/migrate-production.mjs)
-- ignora erro 1060 (coluna já existe).
-- Downgrade (somente se a coluna estiver vazia em produção):
--   ALTER TABLE `proposal_items` DROP FOREIGN KEY `proposal_items_supplierId_suppliers_id_fk`;
--   ALTER TABLE `proposal_items` DROP COLUMN `supplierId`;
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE `proposal_items` ADD COLUMN `supplierId` int;
--> statement-breakpoint
ALTER TABLE `proposal_items` ADD CONSTRAINT `proposal_items_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint
CREATE INDEX `idx_pitems_supplier` ON `proposal_items` (`supplierId`);
