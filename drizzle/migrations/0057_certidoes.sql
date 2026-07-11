-- Certidões e documentos de habilitação da empresa, com controle de validade.
CREATE TABLE IF NOT EXISTS `certidoes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tipo` varchar(128) NOT NULL,
  `orgaoEmissor` varchar(256),
  `numero` varchar(128),
  `dataEmissao` date,
  `dataValidade` date NOT NULL,
  `arquivoUrl` text,
  `observacoes` text,
  `ativa` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `certidoes_id` PRIMARY KEY(`id`)
);
CREATE INDEX `idx_certidoes_validade` ON `certidoes` (`dataValidade`);
CREATE INDEX `idx_certidoes_tipo` ON `certidoes` (`tipo`);
CREATE INDEX `idx_certidoes_ativa` ON `certidoes` (`ativa`);
