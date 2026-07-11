-- Tabela: requesting_orgs
CREATE TABLE IF NOT EXISTS `requesting_orgs` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` varchar(256) NOT NULL,
  `cnpj` varchar(18),
  `address` text,
  `city` varchar(128),
  `state` varchar(2),
  `phone` varchar(32),
  `email` varchar(320),
  `contactPerson` varchar(256),
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
