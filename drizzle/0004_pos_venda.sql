CREATE TABLE `deliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int,
	`funilId` int,
	`descricao` varchar(512) NOT NULL,
	`transportadora` varchar(128),
	`rastreio` varchar(128),
	`previsao` date,
	`entregueEm` date,
	`recebedor` varchar(128),
	`status` enum('preparando','transito','entregue','atrasada','devolvida') NOT NULL DEFAULT 'preparando',
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `deliveries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payables` (
	`id` int AUTO_INCREMENT NOT NULL,
	`descricao` varchar(512) NOT NULL,
	`credor` varchar(256),
	`categoria` enum('fornecedor','frete','imposto','taxa','despesa') NOT NULL DEFAULT 'fornecedor',
	`valor` decimal(15,2) NOT NULL,
	`vencimento` date NOT NULL,
	`pagoEm` date,
	`orderId` int,
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payables_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`descricao` varchar(512) NOT NULL,
	`quantidade` decimal(15,4) NOT NULL,
	`precoUnit` decimal(15,4) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `purchase_order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`funilId` int,
	`supplierId` int,
	`fornecedorNome` varchar(256) NOT NULL,
	`descricao` varchar(512) NOT NULL,
	`valorTotal` decimal(15,2) NOT NULL,
	`prazoEntrega` date,
	`vinculo` varchar(256),
	`status` enum('solicitado','confirmado','faturado','enviado','recebido','divergente','cancelado') NOT NULL DEFAULT 'solicitado',
	`observacoes` text,
	`criadoPor` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `purchase_orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales_invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`funilId` int,
	`numero` varchar(64) NOT NULL,
	`orgao` varchar(256) NOT NULL,
	`valorBruto` decimal(15,2) NOT NULL,
	`retencoes` decimal(15,2) NOT NULL DEFAULT '0.00',
	`dataEmissao` date NOT NULL,
	`vencimento` date,
	`recebidoEm` date,
	`status` enum('emitida','atestada','liquidada','paga','cancelada') NOT NULL DEFAULT 'emitida',
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sales_invoices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `purchase_order_items` ADD CONSTRAINT `purchase_order_items_orderId_purchase_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `purchase_orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_del_status` ON `deliveries` (`status`);--> statement-breakpoint
CREATE INDEX `idx_del_previsao` ON `deliveries` (`previsao`);--> statement-breakpoint
CREATE INDEX `idx_pay_vencimento` ON `payables` (`vencimento`);--> statement-breakpoint
CREATE INDEX `idx_pay_pago` ON `payables` (`pagoEm`);--> statement-breakpoint
CREATE INDEX `idx_poi_order` ON `purchase_order_items` (`orderId`);--> statement-breakpoint
CREATE INDEX `idx_po_status` ON `purchase_orders` (`status`);--> statement-breakpoint
CREATE INDEX `idx_po_funil` ON `purchase_orders` (`funilId`);--> statement-breakpoint
CREATE INDEX `idx_si_status` ON `sales_invoices` (`status`);--> statement-breakpoint
CREATE INDEX `idx_si_vencimento` ON `sales_invoices` (`vencimento`);--> statement-breakpoint
CREATE INDEX `idx_si_funil` ON `sales_invoices` (`funilId`);