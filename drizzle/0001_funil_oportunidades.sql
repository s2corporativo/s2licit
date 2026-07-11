CREATE TABLE `funil_eventos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`oportunidadeId` int NOT NULL,
	`deEtapa` varchar(32),
	`paraEtapa` varchar(32) NOT NULL,
	`justificativa` text,
	`usuario` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `funil_eventos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `funil_oportunidades` (
	`id` int AUTO_INCREMENT NOT NULL,
	`titulo` varchar(512) NOT NULL,
	`orgao` varchar(256),
	`modalidade` varchar(128),
	`numeroProcesso` varchar(128),
	`objeto` text,
	`origemTipo` enum('manual','pncp','email','edital') NOT NULL DEFAULT 'manual',
	`origemId` int,
	`etapa` enum('nova','triagem','analise','cotacao','precificacao','proposta','enviada','disputa','habilitacao','vencida','perdida','cancelada','contrato','entrega','faturamento','recebimento','encerrada') NOT NULL DEFAULT 'nova',
	`valorEstimado` decimal(15,2),
	`dataAbertura` timestamp,
	`prazoEnvio` date,
	`risco` enum('baixo','medio','alto') NOT NULL DEFAULT 'medio',
	`responsavel` varchar(128),
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `funil_oportunidades_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `funil_eventos` ADD CONSTRAINT `funil_eventos_oportunidadeId_funil_oportunidades_id_fk` FOREIGN KEY (`oportunidadeId`) REFERENCES `funil_oportunidades`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_funil_eventos_oportunidade` ON `funil_eventos` (`oportunidadeId`);--> statement-breakpoint
CREATE INDEX `idx_funil_etapa` ON `funil_oportunidades` (`etapa`);--> statement-breakpoint
CREATE INDEX `idx_funil_prazo` ON `funil_oportunidades` (`prazoEnvio`);--> statement-breakpoint
CREATE INDEX `idx_funil_orgao` ON `funil_oportunidades` (`orgao`);--> statement-breakpoint
CREATE INDEX `idx_funil_origem` ON `funil_oportunidades` (`origemTipo`,`origemId`);