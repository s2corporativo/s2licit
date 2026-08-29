-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0030 — formaliza os filtros de seleção de e-mail
-- ─────────────────────────────────────────────────────────────────────────────
-- `senderFilter` e `subjectKeywordFilter` já existiam em drizzle/schema.ts, mas
-- nenhuma migration os criava. Em qualquer banco montado pela cadeia versionada
-- toda consulta a `email_settings` falhava (o SELECT do Drizzle lista as colunas
-- explicitamente), derrubando com HTTP 500 as telas de Configuração,
-- Integrações e Propostas, além da sincronização IMAP de cotações.
--
-- O runner de produção trata ER_DUP_FIELDNAME (1060) como idempotência: bancos
-- que já receberam as colunas por outro caminho seguem sem erro.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE `email_settings` ADD COLUMN `senderFilter` TEXT NULL AFTER `smtpFrom`;
--> statement-breakpoint
ALTER TABLE `email_settings` ADD COLUMN `subjectKeywordFilter` TEXT NULL AFTER `senderFilter`;
