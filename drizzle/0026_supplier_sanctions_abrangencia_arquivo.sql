-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0026 — Abrangência e documento comprobatório da sanção (Ressalva 1
-- do Módulo 06, complemento — os demais campos já existiam desde a 0021)
-- ─────────────────────────────────────────────────────────────────────────────
-- `abrangencia` registra o âmbito federativo do efeito da sanção (Lei
-- 14.133/21, art. 156 §5º: impedimento de licitar/contratar produz efeito
-- perante o ente federativo que aplicou a sanção; a declaração de
-- inidoneidade produz efeito perante toda a Administração Pública). Nullable
-- e sem default: sanções já registradas continuam válidas sem essa
-- informação, a ser preenchida daqui em diante.
-- `arquivoUrl` guarda o documento comprobatório (mesmo padrão de
-- certidoes.arquivoUrl). Idempotente: o runner de produção
-- (scripts/migrate-production.mjs) ignora erro 1060 (coluna já existe).
-- Downgrade (somente se as colunas estiverem vazias em produção):
--   ALTER TABLE `supplier_sanctions` DROP COLUMN `abrangencia`;
--   ALTER TABLE `supplier_sanctions` DROP COLUMN `arquivoUrl`;
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE `supplier_sanctions` ADD COLUMN `abrangencia` varchar(16);
--> statement-breakpoint
ALTER TABLE `supplier_sanctions` ADD COLUMN `arquivoUrl` text;
