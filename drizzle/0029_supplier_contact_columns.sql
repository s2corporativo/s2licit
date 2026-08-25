-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0029 — formaliza os campos de contato de suppliers
-- ─────────────────────────────────────────────────────────────────────────────
-- Estes campos eram criados sob demanda por server/db/suppliers.ts. Isso fazia
-- o schema de produção depender de qual rota já havia sido usada. A partir desta
-- migration, DDL fica exclusivamente na cadeia versionada do Drizzle.
--
-- O runner de produção já trata ER_DUP_FIELDNAME (1060) como idempotência para
-- bancos que receberam essas colunas pelo fallback legado.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE `suppliers` ADD COLUMN `code` VARCHAR(128) NULL AFTER `name`;
--> statement-breakpoint
ALTER TABLE `suppliers` ADD COLUMN `contact` VARCHAR(256) NULL AFTER `code`;
--> statement-breakpoint
ALTER TABLE `suppliers` ADD COLUMN `email` VARCHAR(320) NULL AFTER `contact`;
--> statement-breakpoint
ALTER TABLE `suppliers` ADD COLUMN `phone` VARCHAR(64) NULL AFTER `email`;
--> statement-breakpoint
ALTER TABLE `suppliers` ADD COLUMN `notes` TEXT NULL AFTER `phone`;
