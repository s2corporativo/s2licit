CREATE TABLE `contrato_reajustes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contratoId` int NOT NULL,
	`fator` decimal(8,6) NOT NULL,
	`dataBase` timestamp NOT NULL,
	`aplicadoEm` timestamp NOT NULL DEFAULT (now()),
	`notes` text,
	CONSTRAINT `contrato_reajustes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contratos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`proposalId` int,
	`indice` varchar(64) NOT NULL DEFAULT 'IPCA',
	`periodicidadeMeses` int DEFAULT 12,
	`dataBase` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contratos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `declaration_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(256) NOT NULL,
	`content` text NOT NULL,
	`isActive` enum('yes','no') NOT NULL DEFAULT 'yes',
	`sortOrder` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `declaration_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `estoque` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`quantidade` decimal(12,3) NOT NULL DEFAULT '0',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `estoque_id` PRIMARY KEY(`id`),
	CONSTRAINT `estoque_productId_unique` UNIQUE(`productId`)
);
--> statement-breakpoint
CREATE TABLE `estoque_reservas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`proposalId` int NOT NULL,
	`productId` int NOT NULL,
	`quantidade` decimal(12,3) NOT NULL,
	`status` enum('reservado','liberado','consumido') NOT NULL DEFAULT 'reservado',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `estoque_reservas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `licitacao_resultados` (
	`id` int AUTO_INCREMENT NOT NULL,
	`proposalId` int NOT NULL,
	`statusFinal` enum('ganhou','perdeu','desclassificado') NOT NULL,
	`suaColocacao` int,
	`vencedorNome` varchar(256),
	`vencedorTotal` decimal(14,2),
	`diferencaPercent` decimal(8,2),
	`encerradaEm` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `licitacao_resultados_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `product_images` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`url` text NOT NULL,
	`fileHash` varchar(64),
	`source` enum('import_url','manual_upload') NOT NULL DEFAULT 'manual_upload',
	`isPrimary` enum('yes','no') NOT NULL DEFAULT 'no',
	`status` enum('pending','success','failed') NOT NULL DEFAULT 'success',
	`importBatchId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_images_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `proposal_declarations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`proposalId` int NOT NULL,
	`templateId` int,
	`title` varchar(256) NOT NULL,
	`content` text NOT NULL,
	`sortOrder` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `proposal_declarations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `regras_tributarias` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tipoCliente` varchar(128) NOT NULL,
	`icmsPercent` decimal(6,2) DEFAULT '0',
	`stPercent` decimal(6,2) DEFAULT '0',
	`retencoes` int DEFAULT 0,
	`isActive` enum('yes','no') NOT NULL DEFAULT 'yes',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `regras_tributarias_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `products` MODIFY COLUMN `categoryId` int;--> statement-breakpoint
ALTER TABLE `products` MODIFY COLUMN `mapa` varchar(128);--> statement-breakpoint
ALTER TABLE `products` ADD `pharmaceuticalForm` varchar(128);--> statement-breakpoint
ALTER TABLE `products` ADD `gtin` varchar(64);--> statement-breakpoint
ALTER TABLE `products` ADD `codigoFornecedor` varchar(128);--> statement-breakpoint
ALTER TABLE `products` ADD `informacaoTecnica` text;--> statement-breakpoint
ALTER TABLE `proposal_items` ADD `costPrice` decimal(12,2);--> statement-breakpoint
ALTER TABLE `proposal_items` ADD `editalRefPrice` decimal(12,2);--> statement-breakpoint
ALTER TABLE `proposal_items` ADD `suggestedPrice` decimal(12,2);--> statement-breakpoint
ALTER TABLE `proposal_items` ADD `registroMapa` varchar(128);--> statement-breakpoint
ALTER TABLE `proposals` ADD `notesHtml` text;--> statement-breakpoint
ALTER TABLE `proposals` ADD `regrasTributariasId` int;--> statement-breakpoint
ALTER TABLE `contrato_reajustes` ADD CONSTRAINT `contrato_reajustes_contratoId_contratos_id_fk` FOREIGN KEY (`contratoId`) REFERENCES `contratos`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contratos` ADD CONSTRAINT `contratos_proposalId_proposals_id_fk` FOREIGN KEY (`proposalId`) REFERENCES `proposals`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `estoque` ADD CONSTRAINT `estoque_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `estoque_reservas` ADD CONSTRAINT `estoque_reservas_proposalId_proposals_id_fk` FOREIGN KEY (`proposalId`) REFERENCES `proposals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `estoque_reservas` ADD CONSTRAINT `estoque_reservas_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `licitacao_resultados` ADD CONSTRAINT `licitacao_resultados_proposalId_proposals_id_fk` FOREIGN KEY (`proposalId`) REFERENCES `proposals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_images` ADD CONSTRAINT `product_images_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposal_declarations` ADD CONSTRAINT `proposal_declarations_proposalId_proposals_id_fk` FOREIGN KEY (`proposalId`) REFERENCES `proposals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_creajuste_contrato` ON `contrato_reajustes` (`contratoId`);--> statement-breakpoint
CREATE INDEX `idx_contrato_proposal` ON `contratos` (`proposalId`);--> statement-breakpoint
CREATE INDEX `idx_estoque_product` ON `estoque` (`productId`);--> statement-breakpoint
CREATE INDEX `idx_ereserva_proposal` ON `estoque_reservas` (`proposalId`);--> statement-breakpoint
CREATE INDEX `idx_ereserva_product` ON `estoque_reservas` (`productId`);--> statement-breakpoint
CREATE INDEX `idx_licit_proposal` ON `licitacao_resultados` (`proposalId`);--> statement-breakpoint
CREATE INDEX `idx_pimg_product` ON `product_images` (`productId`);--> statement-breakpoint
CREATE INDEX `idx_pimg_hash` ON `product_images` (`fileHash`);--> statement-breakpoint
CREATE INDEX `idx_pdecl_proposal` ON `proposal_declarations` (`proposalId`);