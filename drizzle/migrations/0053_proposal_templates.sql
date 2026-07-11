-- Tabela: proposal_templates
CREATE TABLE IF NOT EXISTS `proposal_templates` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` varchar(128) NOT NULL,
  `orgType` enum('prefeitura','estado','federal','privado','outro') NOT NULL DEFAULT 'outro',
  `icmsPercent` decimal(5,2) DEFAULT '0.00',
  `stPercent` decimal(5,2) DEFAULT '0.00',
  `ipiPercent` decimal(5,2) DEFAULT '0.00',
  `otherTaxPercent` decimal(5,2) DEFAULT '0.00',
  `freightType` enum('cif','fob','none') DEFAULT 'cif',
  `freightPercent` decimal(5,2) DEFAULT '0.00',
  `validityDays` int DEFAULT 30,
  `declarations` text,
  `paymentTerms` varchar(256),
  `deliveryDays` int DEFAULT 15,
  `notes` text,
  `isDefault` enum('yes','no') NOT NULL DEFAULT 'no',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_ptpl_orgtype` (`orgType`),
  KEY `idx_ptpl_default` (`isDefault`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
