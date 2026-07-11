CREATE TABLE `tax_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`descricao` varchar(256) NOT NULL,
	`tipo` enum('simples_efetiva','icms','difal','st','fcp','iss','outro') NOT NULL,
	`ufOrigem` varchar(2),
	`ufDestino` varchar(2),
	`percentual` decimal(6,3) NOT NULL,
	`vigenciaInicio` date NOT NULL,
	`vigenciaFim` date,
	`ativo` boolean NOT NULL DEFAULT true,
	`observacoes` text,
	`criadoPor` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tax_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_tax_rules_tipo` ON `tax_rules` (`tipo`);--> statement-breakpoint
CREATE INDEX `idx_tax_rules_uf` ON `tax_rules` (`ufDestino`);--> statement-breakpoint
CREATE INDEX `idx_tax_rules_ativo` ON `tax_rules` (`ativo`);