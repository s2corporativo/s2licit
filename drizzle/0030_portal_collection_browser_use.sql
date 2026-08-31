-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0030 — coletor browser-use para portais de licitação sem API
-- ─────────────────────────────────────────────────────────────────────────────
-- Escrita à mão (não gerada por `drizzle-kit generate`): o meta/snapshot do
-- drizzle-kit neste repo está parado em 0019 (migrations 0020-0029 já tinham
-- sido aplicadas sem gerar snapshot correspondente), então `generate` calcula
-- o diff contra uma base desatualizada — tentativa nesta mudança produziu um
-- arquivo que recriava tabelas já existentes (agenticseek_buscas,
-- supplier_sanctions etc.) e reusava o número 0029. Descartado; ver nota no
-- corpo do PR sobre reconstruir a cadeia de snapshots (fora do escopo aqui,
-- mesmo padrão de risco documentado no CLAUDE.md de outros repos da S2).
--
-- portalCollectionTargets: registro de conformidade + config por portal
-- (legalidade/custo/educação — PROMPT 2). enabled=false por padrão: portal
-- sem termos verificados fica desabilitado, nunca presume permissão.
--
-- browserUseExecutions: log de execução por alvo (custo estimado, páginas
-- visitadas, resultados válidos) — base para o alerta de taxa de sucesso
-- (fragilidade) e para o teto de gasto por execução (custo).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE `portalCollectionTargets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(64) NOT NULL,
	`name` varchar(256) NOT NULL,
	`url` text NOT NULL,
	`agentTask` text NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`termsVerifiedAt` timestamp,
	`termsVerifiedBy` varchar(256),
	`termsUrl` text,
	`maxUsdPerExecution` decimal(8,4) NOT NULL DEFAULT '1.0000',
	`minIntervalSeconds` int NOT NULL DEFAULT 3600,
	`requiredFields` json NOT NULL,
	`minSuccessRate` decimal(4,3) NOT NULL DEFAULT '0.500',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `portalCollectionTargets_id` PRIMARY KEY(`id`),
	CONSTRAINT `portalCollectionTargets_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `browserUseExecutions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`targetId` int NOT NULL,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`finishedAt` timestamp,
	`status` enum('running','success','error','timeout','cost_capped','compliance_blocked') NOT NULL DEFAULT 'running',
	`pagesVisited` int NOT NULL DEFAULT 0,
	`estimatedCostUsd` decimal(8,4) NOT NULL DEFAULT '0.0000',
	`resultsFound` int NOT NULL DEFAULT 0,
	`resultsValid` int NOT NULL DEFAULT 0,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `browserUseExecutions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `browserUseExecutions` ADD CONSTRAINT `browserUseExecutions_targetId_portalCollectionTargets_id_fk` FOREIGN KEY (`targetId`) REFERENCES `portalCollectionTargets`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `idx_pct_enabled` ON `portalCollectionTargets` (`enabled`);
--> statement-breakpoint
CREATE INDEX `idx_bue_target` ON `browserUseExecutions` (`targetId`);
--> statement-breakpoint
CREATE INDEX `idx_bue_status` ON `browserUseExecutions` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_bue_started` ON `browserUseExecutions` (`startedAt`);
