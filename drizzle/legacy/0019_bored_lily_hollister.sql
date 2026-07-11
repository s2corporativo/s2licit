CREATE TABLE `cnpj_alert_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cnpj` varchar(18) NOT NULL,
	`label` varchar(128) NOT NULL DEFAULT 'Minha Empresa',
	`active` boolean NOT NULL DEFAULT true,
	`frequency` varchar(16) NOT NULL DEFAULT 'daily',
	`lastCheckedAt` timestamp,
	`lastPublicationDate` varchar(10),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cnpj_alert_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cnpj_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`configId` int NOT NULL,
	`pncpId` varchar(128) NOT NULL,
	`tipo` varchar(32) NOT NULL DEFAULT 'contrato',
	`cnpjFornecedor` varchar(18) NOT NULL,
	`nomeFornecedor` varchar(256),
	`cnpjOrgao` varchar(18),
	`nomeOrgao` varchar(256),
	`objeto` text,
	`valorInicial` decimal(14,2),
	`dataAssinatura` varchar(10),
	`dataPublicacao` varchar(10),
	`urlPncp` varchar(512),
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cnpj_alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `cnpj_alerts` ADD CONSTRAINT `cnpj_alerts_configId_cnpj_alert_config_id_fk` FOREIGN KEY (`configId`) REFERENCES `cnpj_alert_config`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_cnpjalert_config` ON `cnpj_alerts` (`configId`);--> statement-breakpoint
CREATE INDEX `idx_cnpjalert_pncpid` ON `cnpj_alerts` (`pncpId`);--> statement-breakpoint
CREATE INDEX `idx_cnpjalert_read` ON `cnpj_alerts` (`readAt`);