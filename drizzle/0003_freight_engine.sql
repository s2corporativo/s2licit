CREATE TABLE `freight_quotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`descricao` varchar(256) NOT NULL,
	`tipo` enum('entrada','saida') NOT NULL,
	`transportadora` varchar(128),
	`origemCep` varchar(9),
	`destinoCep` varchar(9),
	`ufDestino` varchar(2),
	`pesoKg` decimal(10,3),
	`valorFrete` decimal(12,2) NOT NULL,
	`prazoDias` int,
	`validade` date,
	`funilId` int,
	`supplierId` int,
	`observacoes` text,
	`criadoPor` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `freight_quotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_freight_tipo` ON `freight_quotes` (`tipo`);--> statement-breakpoint
CREATE INDEX `idx_freight_uf` ON `freight_quotes` (`ufDestino`);--> statement-breakpoint
CREATE INDEX `idx_freight_funil` ON `freight_quotes` (`funilId`);