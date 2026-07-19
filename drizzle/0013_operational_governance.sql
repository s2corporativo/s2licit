-- Consolidação transitória das fontes de custo e governança operacional.
-- A tabela product_supplier_offers passa a ser a fonte canônica; a tabela
-- product_supplier_prices permanece somente para compatibilidade temporária.

INSERT INTO `product_supplier_offers`
  (`productId`, `supplierId`, `supplierCode`, `price`, `link`, `createdAt`, `updatedAt`)
SELECT
  psp.`productId`,
  psp.`supplierId`,
  psp.`codigoFornecedor`,
  psp.`price`,
  psp.`linkProduto`,
  COALESCE(psp.`dataAtualizacao`, psp.`updatedAt`, CURRENT_TIMESTAMP),
  COALESCE(psp.`updatedAt`, psp.`dataAtualizacao`, CURRENT_TIMESTAMP)
FROM `product_supplier_prices` psp
ON DUPLICATE KEY UPDATE
  `supplierCode` = COALESCE(VALUES(`supplierCode`), `product_supplier_offers`.`supplierCode`),
  `price` = COALESCE(VALUES(`price`), `product_supplier_offers`.`price`),
  `link` = COALESCE(VALUES(`link`), `product_supplier_offers`.`link`),
  `updatedAt` = GREATEST(VALUES(`updatedAt`), `product_supplier_offers`.`updatedAt`);

DROP VIEW IF EXISTS `canonical_product_costs`;
CREATE VIEW `canonical_product_costs` AS
SELECT
  o.`productId`,
  o.`supplierId`,
  s.`name` AS `supplierName`,
  o.`id` AS `offerId`,
  CASE
    WHEN o.`promoPrice` IS NOT NULL AND o.`promoPrice` > 0 THEN o.`promoPrice`
    ELSE o.`price`
  END AS `cost`,
  o.`price` AS `regularPrice`,
  o.`promoPrice`,
  o.`stock`,
  o.`availability`,
  o.`supplierCode`,
  o.`link`,
  o.`updatedAt` AS `quotedAt`
FROM `product_supplier_offers` o
JOIN `suppliers` s ON s.`id` = o.`supplierId`
JOIN (
  SELECT
    `productId`,
    MIN(CASE
      WHEN `promoPrice` IS NOT NULL AND `promoPrice` > 0 THEN `promoPrice`
      ELSE `price`
    END) AS `minCost`
  FROM `product_supplier_offers`
  WHERE (`price` IS NOT NULL AND `price` > 0)
     OR (`promoPrice` IS NOT NULL AND `promoPrice` > 0)
  GROUP BY `productId`
) best
  ON best.`productId` = o.`productId`
 AND best.`minCost` = CASE
   WHEN o.`promoPrice` IS NOT NULL AND o.`promoPrice` > 0 THEN o.`promoPrice`
   ELSE o.`price`
 END
WHERE s.`isActive` = 'yes';

CREATE TABLE `operational_certifications` (
  `id` int AUTO_INCREMENT NOT NULL,
  `entityType` enum('supplier','portal') NOT NULL,
  `entityId` int,
  `entityName` varchar(256) NOT NULL,
  `status` enum('pending','approved','failed','expired') NOT NULL DEFAULT 'pending',
  `checklist` json NOT NULL,
  `evidenceUrl` varchar(512),
  `notes` text,
  `validUntil` date,
  `lastTestedAt` timestamp NULL,
  `testedBy` varchar(320),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `operational_certifications_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_operational_certification_entity` UNIQUE(`entityType`, `entityName`),
  INDEX `idx_operational_certification_status` (`status`),
  INDEX `idx_operational_certification_type` (`entityType`)
);

CREATE TABLE `contract_lifecycle` (
  `id` int AUTO_INCREMENT NOT NULL,
  `funilId` int,
  `proposalId` int,
  `orgao` varchar(256) NOT NULL,
  `numeroContrato` varchar(128) NOT NULL,
  `objeto` text,
  `valorContratado` decimal(15,2) NOT NULL DEFAULT 0,
  `saldoContratual` decimal(15,2) NOT NULL DEFAULT 0,
  `inicioVigencia` date,
  `fimVigencia` date,
  `dataBaseReajuste` date,
  `indiceReajuste` varchar(64),
  `garantiaVencimento` date,
  `status` enum('draft','active','suspended','expired','closed','cancelled') NOT NULL DEFAULT 'draft',
  `alerts` json,
  `notes` text,
  `createdBy` varchar(320),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `contract_lifecycle_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_contract_number` UNIQUE(`numeroContrato`),
  INDEX `idx_contract_status` (`status`),
  INDEX `idx_contract_end_date` (`fimVigencia`),
  INDEX `idx_contract_funil` (`funilId`)
);

CREATE TABLE `contract_item_balances` (
  `id` int AUTO_INCREMENT NOT NULL,
  `contractId` int NOT NULL,
  `description` varchar(512) NOT NULL,
  `quantityContracted` decimal(15,4) NOT NULL DEFAULT 0,
  `quantityOrdered` decimal(15,4) NOT NULL DEFAULT 0,
  `quantityDelivered` decimal(15,4) NOT NULL DEFAULT 0,
  `quantityInvoiced` decimal(15,4) NOT NULL DEFAULT 0,
  `unitPrice` decimal(15,4) NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `contract_item_balances_id` PRIMARY KEY(`id`),
  CONSTRAINT `fk_contract_item_contract` FOREIGN KEY (`contractId`) REFERENCES `contract_lifecycle`(`id`) ON DELETE CASCADE,
  INDEX `idx_contract_item_contract` (`contractId`)
);

CREATE TABLE `executive_assessments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `opportunityId` int NOT NULL,
  `score` decimal(5,2) NOT NULL,
  `recommendation` enum('go','caution','no_go') NOT NULL,
  `metrics` json NOT NULL,
  `blockers` json NOT NULL,
  `reasons` json NOT NULL,
  `createdBy` varchar(320),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `executive_assessments_id` PRIMARY KEY(`id`),
  INDEX `idx_executive_assessment_opportunity` (`opportunityId`),
  INDEX `idx_executive_assessment_recommendation` (`recommendation`)
);
