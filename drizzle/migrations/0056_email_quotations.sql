-- Cotações recebidas por e-mail e seus itens (com matching contra o catálogo).
CREATE TABLE IF NOT EXISTS `email_quotations` (
  `id` int AUTO_INCREMENT NOT NULL,
  `messageId` varchar(512) NOT NULL,
  `fromAddress` varchar(320),
  `fromName` varchar(256),
  `subject` varchar(512),
  `orgao` varchar(256),
  `bodyText` text,
  `receivedAt` timestamp NULL,
  `sourceType` enum('spreadsheet','pdf','docx','body','manual') NOT NULL DEFAULT 'body',
  `sourceFilename` varchar(512),
  `status` enum('nova','processando','revisao','respondida','descartada','erro') NOT NULL DEFAULT 'nova',
  `totalItems` int NOT NULL DEFAULT 0,
  `matchedItems` int NOT NULL DEFAULT 0,
  `errorMessage` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `email_quotations_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_email_quotations_message` UNIQUE(`messageId`)
);
CREATE INDEX `idx_email_quotations_status` ON `email_quotations` (`status`);
CREATE INDEX `idx_email_quotations_received` ON `email_quotations` (`receivedAt`);
CREATE INDEX `idx_email_quotations_from` ON `email_quotations` (`fromAddress`);

CREATE TABLE IF NOT EXISTS `email_quotation_items` (
  `id` int AUTO_INCREMENT NOT NULL,
  `quotationId` int NOT NULL,
  `numeroItem` int,
  `descricao` text NOT NULL,
  `quantidade` decimal(15,4),
  `unidade` varchar(64),
  `codigoCatalogo` varchar(64),
  `produtoMatchId` int,
  `matchScore` decimal(5,4),
  `matchMethod` enum('catmas','catmat','nome','manual','nenhum') NOT NULL DEFAULT 'nenhum',
  `matchConfirmado` boolean NOT NULL DEFAULT false,
  `precoSugerido` decimal(15,4),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `email_quotation_items_id` PRIMARY KEY(`id`),
  CONSTRAINT `fk_email_quotation_items_quotation` FOREIGN KEY (`quotationId`) REFERENCES `email_quotations`(`id`) ON DELETE CASCADE
);
CREATE INDEX `idx_email_quotation_items_quotation` ON `email_quotation_items` (`quotationId`);
CREATE INDEX `idx_email_quotation_items_produto` ON `email_quotation_items` (`produtoMatchId`);
CREATE INDEX `idx_email_quotation_items_catalogo` ON `email_quotation_items` (`codigoCatalogo`);
