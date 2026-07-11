-- Credenciais dos portais de licitação (senha criptografada).
CREATE TABLE IF NOT EXISTS `portal_credentials` (
  `id` int AUTO_INCREMENT NOT NULL,
  `portal` varchar(32) NOT NULL,
  `apelido` varchar(128),
  `loginUrl` text,
  `usuario` varchar(256) NOT NULL,
  `senhaCriptografada` text NOT NULL,
  `cnpj` varchar(18),
  `ativo` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `portal_credentials_id` PRIMARY KEY(`id`)
);
CREATE INDEX `idx_portal_credentials_portal` ON `portal_credentials` (`portal`);
CREATE INDEX `idx_portal_credentials_ativo` ON `portal_credentials` (`ativo`);
