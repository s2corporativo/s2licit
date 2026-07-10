CREATE TABLE IF NOT EXISTS `duplicate_detection_runs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `triggeredByUserId` int,
  `status` enum('running','completed','failed') NOT NULL DEFAULT 'running',
  `scope` json,
  `totalCandidates` int NOT NULL DEFAULT 0,
  `confirmedCount` int NOT NULL DEFAULT 0,
  `probableCount` int NOT NULL DEFAULT 0,
  `reviewCount` int NOT NULL DEFAULT 0,
  `ignoredCount` int NOT NULL DEFAULT 0,
  `notes` text,
  `finishedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `duplicate_detection_runs_id` PRIMARY KEY(`id`),
  CONSTRAINT `duplicate_detection_runs_triggeredByUserId_users_id_fk` FOREIGN KEY (`triggeredByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
CREATE INDEX `idx_duplicate_runs_status` ON `duplicate_detection_runs` (`status`);
CREATE INDEX `idx_duplicate_runs_user` ON `duplicate_detection_runs` (`triggeredByUserId`);
CREATE INDEX `idx_duplicate_runs_created` ON `duplicate_detection_runs` (`createdAt`);

CREATE TABLE IF NOT EXISTS `duplicate_detection_results` (
  `id` int AUTO_INCREMENT NOT NULL,
  `runId` int NOT NULL,
  `primaryProductId` int NOT NULL,
  `secondaryProductId` int NOT NULL,
  `score` decimal(5,2) NOT NULL DEFAULT '0.00',
  `classification` enum('confirmed','probable','review','distinct','ignored','merged') NOT NULL DEFAULT 'review',
  `rationale` text,
  `matchedFields` json,
  `reviewedByUserId` int,
  `reviewedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `duplicate_detection_results_id` PRIMARY KEY(`id`),
  CONSTRAINT `fk_dup_results_run` FOREIGN KEY (`runId`) REFERENCES `duplicate_detection_runs`(`id`) ON DELETE CASCADE,
  CONSTRAINT `duplicate_detection_results_primaryProductId_products_id_fk` FOREIGN KEY (`primaryProductId`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  CONSTRAINT `duplicate_detection_results_secondaryProductId_products_id_fk` FOREIGN KEY (`secondaryProductId`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  CONSTRAINT `duplicate_detection_results_reviewedByUserId_users_id_fk` FOREIGN KEY (`reviewedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
CREATE INDEX `idx_duplicate_results_run` ON `duplicate_detection_results` (`runId`);
CREATE INDEX `idx_duplicate_results_primary` ON `duplicate_detection_results` (`primaryProductId`);
CREATE INDEX `idx_duplicate_results_secondary` ON `duplicate_detection_results` (`secondaryProductId`);
CREATE INDEX `idx_duplicate_results_classification` ON `duplicate_detection_results` (`classification`);
CREATE INDEX `idx_duplicate_results_score` ON `duplicate_detection_results` (`score`);

CREATE TABLE IF NOT EXISTS `duplicate_merge_history` (
  `id` int AUTO_INCREMENT NOT NULL,
  `resultId` int,
  `primaryProductId` int NOT NULL,
  `secondaryProductId` int NOT NULL,
  `action` enum('merge','replace','ignore','mark_distinct') NOT NULL,
  `performedByUserId` int,
  `notes` text,
  `snapshot` json,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `duplicate_merge_history_id` PRIMARY KEY(`id`),
  CONSTRAINT `fk_dup_merge_result` FOREIGN KEY (`resultId`) REFERENCES `duplicate_detection_results`(`id`) ON DELETE SET NULL,
  CONSTRAINT `duplicate_merge_history_primaryProductId_products_id_fk` FOREIGN KEY (`primaryProductId`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  CONSTRAINT `duplicate_merge_history_secondaryProductId_products_id_fk` FOREIGN KEY (`secondaryProductId`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  CONSTRAINT `duplicate_merge_history_performedByUserId_users_id_fk` FOREIGN KEY (`performedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
CREATE INDEX `idx_duplicate_history_result` ON `duplicate_merge_history` (`resultId`);
CREATE INDEX `idx_duplicate_history_primary` ON `duplicate_merge_history` (`primaryProductId`);
CREATE INDEX `idx_duplicate_history_secondary` ON `duplicate_merge_history` (`secondaryProductId`);
CREATE INDEX `idx_duplicate_history_action` ON `duplicate_merge_history` (`action`);

CREATE TABLE IF NOT EXISTS `executive_decisions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `proposalId` int,
  `orgId` int,
  `recommendation` enum('vale_entrar','entrar_com_cautela','nao_vale_entrar') NOT NULL,
  `totalScore` int NOT NULL DEFAULT 0,
  `adherenceScore` int NOT NULL DEFAULT 0,
  `marginScore` int NOT NULL DEFAULT 0,
  `documentalRiskScore` int NOT NULL DEFAULT 0,
  `technicalRiskScore` int NOT NULL DEFAULT 0,
  `operationalRiskScore` int NOT NULL DEFAULT 0,
  `historyScore` int NOT NULL DEFAULT 0,
  `marginEstimate` decimal(10,2) DEFAULT '0.00',
  `justification` text,
  `nextStep` text,
  `riskSummary` text,
  `createdByUserId` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `executive_decisions_id` PRIMARY KEY(`id`),
  CONSTRAINT `executive_decisions_proposalId_proposals_id_fk` FOREIGN KEY (`proposalId`) REFERENCES `proposals`(`id`) ON DELETE SET NULL,
  CONSTRAINT `executive_decisions_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
CREATE INDEX `idx_exec_decisions_proposal` ON `executive_decisions` (`proposalId`);
CREATE INDEX `idx_exec_decisions_org` ON `executive_decisions` (`orgId`);
CREATE INDEX `idx_exec_decisions_recommendation` ON `executive_decisions` (`recommendation`);
CREATE INDEX `idx_exec_decisions_score` ON `executive_decisions` (`totalScore`);

CREATE TABLE IF NOT EXISTS `executive_decision_factors` (
  `id` int AUTO_INCREMENT NOT NULL,
  `decisionId` int NOT NULL,
  `factorKey` varchar(64) NOT NULL,
  `factorLabel` varchar(128) NOT NULL,
  `score` int NOT NULL DEFAULT 0,
  `weight` int NOT NULL DEFAULT 0,
  `impact` enum('positive','neutral','negative') NOT NULL DEFAULT 'neutral',
  `details` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `executive_decision_factors_id` PRIMARY KEY(`id`),
  CONSTRAINT `fk_exec_factor_decision` FOREIGN KEY (`decisionId`) REFERENCES `executive_decisions`(`id`) ON DELETE CASCADE
);
CREATE INDEX `idx_exec_factors_decision` ON `executive_decision_factors` (`decisionId`);
CREATE INDEX `idx_exec_factors_key` ON `executive_decision_factors` (`factorKey`);
CREATE INDEX `idx_exec_factors_impact` ON `executive_decision_factors` (`impact`);

CREATE TABLE IF NOT EXISTS `post_award_contracts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `proposalId` int,
  `orgId` int,
  `contractNumber` varchar(128) NOT NULL,
  `processNumber` varchar(128),
  `editalNumber` varchar(128),
  `objectDescription` text,
  `startDate` date,
  `endDate` date,
  `baseDate` date,
  `valueGlobal` decimal(14,2) NOT NULL DEFAULT '0.00',
  `saldoInicial` decimal(14,2) NOT NULL DEFAULT '0.00',
  `saldoAtual` decimal(14,2) NOT NULL DEFAULT '0.00',
  `reajusteIndex` varchar(64),
  `gestor` varchar(256),
  `fiscal` varchar(256),
  `status` enum('draft','active','suspended','expired','closed') NOT NULL DEFAULT 'draft',
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `post_award_contracts_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_post_award_contract_number` UNIQUE(`contractNumber`),
  CONSTRAINT `post_award_contracts_proposalId_proposals_id_fk` FOREIGN KEY (`proposalId`) REFERENCES `proposals`(`id`) ON DELETE SET NULL
);
CREATE INDEX `idx_post_award_contract_proposal` ON `post_award_contracts` (`proposalId`);
CREATE INDEX `idx_post_award_contract_org` ON `post_award_contracts` (`orgId`);
CREATE INDEX `idx_post_award_contract_status` ON `post_award_contracts` (`status`);
CREATE INDEX `idx_post_award_contract_end_date` ON `post_award_contracts` (`endDate`);

CREATE TABLE IF NOT EXISTS `contract_balance_movements` (
  `id` int AUTO_INCREMENT NOT NULL,
  `contractId` int NOT NULL,
  `movementType` enum('empenho','faturamento','consumo','reforco','glosa','outro') NOT NULL,
  `amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `movementDate` date NOT NULL,
  `description` text,
  `referenceNumber` varchar(128),
  `createdByUserId` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `contract_balance_movements_id` PRIMARY KEY(`id`),
  CONSTRAINT `fk_contract_balance_contract` FOREIGN KEY (`contractId`) REFERENCES `post_award_contracts`(`id`) ON DELETE CASCADE,
  CONSTRAINT `contract_balance_movements_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
CREATE INDEX `idx_contract_balance_contract` ON `contract_balance_movements` (`contractId`);
CREATE INDEX `idx_contract_balance_type` ON `contract_balance_movements` (`movementType`);
CREATE INDEX `idx_contract_balance_date` ON `contract_balance_movements` (`movementDate`);

CREATE TABLE IF NOT EXISTS `contract_reajustes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `contractId` int NOT NULL,
  `reajusteDate` date NOT NULL,
  `indexName` varchar(64),
  `indexPercent` decimal(8,4) DEFAULT '0.0000',
  `previousValue` decimal(14,2) DEFAULT '0.00',
  `updatedValue` decimal(14,2) DEFAULT '0.00',
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `contract_reajustes_id` PRIMARY KEY(`id`),
  CONSTRAINT `contract_reajustes_contractId_post_award_contracts_id_fk` FOREIGN KEY (`contractId`) REFERENCES `post_award_contracts`(`id`) ON DELETE CASCADE
);
CREATE INDEX `idx_contract_reajuste_contract` ON `contract_reajustes` (`contractId`);
CREATE INDEX `idx_contract_reajuste_date` ON `contract_reajustes` (`reajusteDate`);

CREATE TABLE IF NOT EXISTS `contract_extensions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `contractId` int NOT NULL,
  `extensionType` enum('prazo','quantitativo','ambos') NOT NULL DEFAULT 'prazo',
  `previousEndDate` date,
  `newEndDate` date,
  `addedDays` int NOT NULL DEFAULT 0,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `contract_extensions_id` PRIMARY KEY(`id`),
  CONSTRAINT `contract_extensions_contractId_post_award_contracts_id_fk` FOREIGN KEY (`contractId`) REFERENCES `post_award_contracts`(`id`) ON DELETE CASCADE
);
CREATE INDEX `idx_contract_extensions_contract` ON `contract_extensions` (`contractId`);
CREATE INDEX `idx_contract_extensions_new_end` ON `contract_extensions` (`newEndDate`);

CREATE TABLE IF NOT EXISTS `contract_alerts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `contractId` int NOT NULL,
  `alertType` enum('vencimento','reajuste','saldo','pendencia','prorrogacao') NOT NULL,
  `severity` enum('info','warning','critical') NOT NULL DEFAULT 'warning',
  `title` varchar(256) NOT NULL,
  `description` text,
  `dueDate` date,
  `status` enum('open','resolved') NOT NULL DEFAULT 'open',
  `resolvedByUserId` int,
  `resolvedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `contract_alerts_id` PRIMARY KEY(`id`),
  CONSTRAINT `contract_alerts_contractId_post_award_contracts_id_fk` FOREIGN KEY (`contractId`) REFERENCES `post_award_contracts`(`id`) ON DELETE CASCADE,
  CONSTRAINT `contract_alerts_resolvedByUserId_users_id_fk` FOREIGN KEY (`resolvedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
CREATE INDEX `idx_contract_alerts_contract` ON `contract_alerts` (`contractId`);
CREATE INDEX `idx_contract_alerts_type` ON `contract_alerts` (`alertType`);
CREATE INDEX `idx_contract_alerts_status` ON `contract_alerts` (`status`);
CREATE INDEX `idx_contract_alerts_due` ON `contract_alerts` (`dueDate`);

CREATE TABLE IF NOT EXISTS `captured_product_batches` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sourceType` enum('url','html','pdf','spreadsheet','xml','docx','text') NOT NULL,
  `sourceLabel` varchar(256),
  `sourceReference` varchar(512),
  `status` enum('processing','review','approved','rejected','applied','failed') NOT NULL DEFAULT 'processing',
  `totalCaptured` int NOT NULL DEFAULT 0,
  `totalApproved` int NOT NULL DEFAULT 0,
  `totalRejected` int NOT NULL DEFAULT 0,
  `createdByUserId` int,
  `meta` json,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `captured_product_batches_id` PRIMARY KEY(`id`),
  CONSTRAINT `captured_product_batches_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
CREATE INDEX `idx_captured_batches_source_type` ON `captured_product_batches` (`sourceType`);
CREATE INDEX `idx_captured_batches_status` ON `captured_product_batches` (`status`);
CREATE INDEX `idx_captured_batches_created` ON `captured_product_batches` (`createdAt`);

CREATE TABLE IF NOT EXISTS `captured_products` (
  `id` int AUTO_INCREMENT NOT NULL,
  `batchId` int NOT NULL,
  `matchedProductId` int,
  `actionSuggestion` enum('create','update','review','ignore') NOT NULL DEFAULT 'review',
  `duplicateSignal` enum('none','possible','probable','confirmed') NOT NULL DEFAULT 'none',
  `name` varchar(256) NOT NULL,
  `brand` varchar(128),
  `manufacturer` varchar(128),
  `description` text,
  `presentation` varchar(128),
  `barcode` varchar(64),
  `sku` varchar(128),
  `price` decimal(12,2),
  `unit` varchar(64),
  `category` varchar(128),
  `imageUrl` text,
  `productUrl` text,
  `regulatoryData` json,
  `rawPayload` json,
  `status` enum('pending','approved','rejected','applied') NOT NULL DEFAULT 'pending',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `captured_products_id` PRIMARY KEY(`id`),
  CONSTRAINT `captured_products_batchId_captured_product_batches_id_fk` FOREIGN KEY (`batchId`) REFERENCES `captured_product_batches`(`id`) ON DELETE CASCADE,
  CONSTRAINT `captured_products_matchedProductId_products_id_fk` FOREIGN KEY (`matchedProductId`) REFERENCES `products`(`id`) ON DELETE SET NULL
);
CREATE INDEX `idx_captured_products_batch` ON `captured_products` (`batchId`);
CREATE INDEX `idx_captured_products_match` ON `captured_products` (`matchedProductId`);
CREATE INDEX `idx_captured_products_status` ON `captured_products` (`status`);
CREATE INDEX `idx_captured_products_action` ON `captured_products` (`actionSuggestion`);
CREATE INDEX `idx_captured_products_duplicate` ON `captured_products` (`duplicateSignal`);

CREATE TABLE IF NOT EXISTS `captured_product_field_confidence` (
  `id` int AUTO_INCREMENT NOT NULL,
  `capturedProductId` int NOT NULL,
  `fieldName` varchar(128) NOT NULL,
  `confidenceScore` decimal(5,2) NOT NULL DEFAULT '0.00',
  `extractionMethod` varchar(64),
  `sourceSnippet` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `captured_product_field_confidence_id` PRIMARY KEY(`id`),
  CONSTRAINT `fk_cap_conf_product` FOREIGN KEY (`capturedProductId`) REFERENCES `captured_products`(`id`) ON DELETE CASCADE
);
CREATE INDEX `idx_captured_confidence_product` ON `captured_product_field_confidence` (`capturedProductId`);
CREATE INDEX `idx_captured_confidence_field` ON `captured_product_field_confidence` (`fieldName`);

CREATE TABLE IF NOT EXISTS `captured_product_source_logs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `batchId` int NOT NULL,
  `capturedProductId` int,
  `sourceType` enum('url','html','pdf','spreadsheet','xml','docx','text') NOT NULL,
  `sourceReference` varchar(512),
  `logLevel` enum('info','warning','error') NOT NULL DEFAULT 'info',
  `message` text NOT NULL,
  `payload` json,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `captured_product_source_logs_id` PRIMARY KEY(`id`),
  CONSTRAINT `fk_cap_logs_batch` FOREIGN KEY (`batchId`) REFERENCES `captured_product_batches`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cap_logs_product` FOREIGN KEY (`capturedProductId`) REFERENCES `captured_products`(`id`) ON DELETE SET NULL
);
CREATE INDEX `idx_captured_logs_batch` ON `captured_product_source_logs` (`batchId`);
CREATE INDEX `idx_captured_logs_product` ON `captured_product_source_logs` (`capturedProductId`);
CREATE INDEX `idx_captured_logs_level` ON `captured_product_source_logs` (`logLevel`);