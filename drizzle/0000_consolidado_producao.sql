CREATE TABLE `apiLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`source` varchar(64) NOT NULL,
	`endpoint` varchar(512) NOT NULL,
	`requestUrl` text,
	`statusCode` int,
	`contentType` varchar(128),
	`errorMessage` text,
	`rawSample` text,
	`durationMs` int,
	`success` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `apiLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auditLog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`source` varchar(64) NOT NULL,
	`action` varchar(64) NOT NULL,
	`entityType` varchar(64),
	`entityId` varchar(128),
	`endpoint` text,
	`params` json,
	`status` enum('ok','error','partial','skipped') NOT NULL DEFAULT 'ok',
	`recordsAffected` int DEFAULT 0,
	`payloadHash` varchar(64),
	`evidenceUrl` text,
	`errorMessage` text,
	`durationMs` int,
	`userId` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditLog_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`action` varchar(128) NOT NULL,
	`entity` varchar(128) NOT NULL,
	`entityId` int,
	`origin` varchar(128) NOT NULL DEFAULT 'manual',
	`summary` text,
	`changes` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bulk_pricing_application_details` (
	`id` int AUTO_INCREMENT NOT NULL,
	`applicationId` int NOT NULL,
	`productId` int NOT NULL,
	`oldPrice` decimal(12,2) NOT NULL,
	`newPrice` decimal(12,2) NOT NULL,
	`priceIncrease` decimal(12,2) NOT NULL,
	`status` enum('success','skipped','error') DEFAULT 'success',
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bulk_pricing_application_details_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bulk_pricing_applications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`categoryId` int,
	`totalProducts` int NOT NULL,
	`updatedCount` int NOT NULL,
	`skippedCount` int DEFAULT 0,
	`errorCount` int DEFAULT 0,
	`marginPercentage` decimal(5,2) NOT NULL,
	`icmsPercentage` decimal(5,2) DEFAULT '0',
	`ipPercentage` decimal(5,2) DEFAULT '0',
	`pisPercentage` decimal(5,2) DEFAULT '0',
	`cofinsPercentage` decimal(5,2) DEFAULT '0',
	`freightType` enum('fixed','percentage') DEFAULT 'fixed',
	`freightValue` decimal(12,2) DEFAULT '0',
	`averagePriceIncrease` decimal(12,2) DEFAULT '0',
	`minNewPrice` decimal(12,2) DEFAULT '0',
	`maxNewPrice` decimal(12,2) DEFAULT '0',
	`appliedBy` int,
	`appliedAt` timestamp NOT NULL DEFAULT (now()),
	`status` enum('pending','completed','failed','reverted') DEFAULT 'completed',
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bulk_pricing_applications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `capture_errors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`captureLogId` int NOT NULL,
	`supplierId` int NOT NULL,
	`pageUrl` varchar(512),
	`pageNumber` int,
	`productName` varchar(256),
	`errorType` varchar(128) NOT NULL,
	`errorMessage` text NOT NULL,
	`failureStage` varchar(128),
	`htmlSnapshot` text,
	`stackTrace` text,
	`canReprocess` boolean DEFAULT true,
	`reprocessedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `capture_errors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `capture_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierId` int NOT NULL,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`durationSeconds` int,
	`totalPages` int DEFAULT 0,
	`totalProductsFound` int DEFAULT 0,
	`newProductsCreated` int DEFAULT 0,
	`productsUpdated` int DEFAULT 0,
	`productsWithErrors` int DEFAULT 0,
	`productsIgnored` int DEFAULT 0,
	`status` enum('running','completed','failed','partial') DEFAULT 'running',
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `capture_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `captured_product_batches` (
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
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `captured_product_batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `captured_product_field_confidence` (
	`id` int AUTO_INCREMENT NOT NULL,
	`capturedProductId` int NOT NULL,
	`fieldName` varchar(128) NOT NULL,
	`confidenceScore` decimal(5,2) NOT NULL DEFAULT '0.00',
	`extractionMethod` varchar(64),
	`sourceSnippet` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `captured_product_field_confidence_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `captured_product_source_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchId` int NOT NULL,
	`capturedProductId` int,
	`sourceType` enum('url','html','pdf','spreadsheet','xml','docx','text') NOT NULL,
	`sourceReference` varchar(512),
	`logLevel` enum('info','warning','error') NOT NULL DEFAULT 'info',
	`message` text NOT NULL,
	`payload` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `captured_product_source_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `captured_products` (
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
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `captured_products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`slug` varchar(128) NOT NULL,
	`description` text,
	`color` varchar(32) DEFAULT '#DC2626',
	`sortOrder` int DEFAULT 0,
	`parentId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `categories_name_unique` UNIQUE(`name`),
	CONSTRAINT `categories_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `category_pricing_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`categoryId` int NOT NULL,
	`icmsPercentage` decimal(5,2) DEFAULT '0',
	`ipPercentage` decimal(5,2) DEFAULT '0',
	`pisPercentage` decimal(5,2) DEFAULT '0',
	`cofinsPercentage` decimal(5,2) DEFAULT '0',
	`freightType` enum('fixed','percentage') DEFAULT 'fixed',
	`freightValue` decimal(12,2) DEFAULT '0',
	`marginPercentage` decimal(5,2) NOT NULL,
	`minPrice` decimal(12,2),
	`maxPrice` decimal(12,2),
	`roundingMethod` enum('round','ceil','floor') DEFAULT 'round',
	`isActive` enum('yes','no') NOT NULL DEFAULT 'yes',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `category_pricing_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `certidoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tipo` varchar(128) NOT NULL,
	`orgaoEmissor` varchar(256),
	`numero` varchar(128),
	`dataEmissao` date,
	`dataValidade` date NOT NULL,
	`arquivoUrl` text,
	`observacoes` text,
	`ativa` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `certidoes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cnpj_monitor_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cnpj` varchar(18) NOT NULL,
	`razaoSocial` varchar(256) NOT NULL DEFAULT '',
	`label` varchar(128) NOT NULL DEFAULT 'Minha Empresa',
	`active` boolean NOT NULL DEFAULT true,
	`intervalMinutes` int NOT NULL DEFAULT 60,
	`fontes` varchar(512) NOT NULL DEFAULT '["pncp_contratos","comprasnet_itens","sicaf"]',
	`keywords` varchar(1024) NOT NULL DEFAULT '[]',
	`lastCheckedAt` timestamp,
	`lastPublicationDate` varchar(10),
	`sicafStatus` varchar(64),
	`sicafCheckedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cnpj_monitor_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cnpj_monitor_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`configId` int NOT NULL,
	`fonte` varchar(32) NOT NULL,
	`tipoEvento` varchar(64) NOT NULL,
	`eventHash` varchar(64) NOT NULL,
	`externalId` varchar(256),
	`numeroPregao` varchar(128),
	`cnpjOrgao` varchar(18),
	`nomeOrgao` varchar(256),
	`ufOrgao` varchar(2),
	`objeto` text,
	`valor` decimal(14,2),
	`dataEvento` varchar(10),
	`dataPublicacao` varchar(10),
	`urlPortal` varchar(512),
	`dadosExtras` text,
	`readAt` timestamp,
	`notifiedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cnpj_monitor_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `company_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL DEFAULT '',
	`cnpj` varchar(18),
	`address` text,
	`city` varchar(128),
	`state` varchar(2),
	`zipCode` varchar(10),
	`phone` varchar(32),
	`email` varchar(320),
	`website` varchar(256),
	`logoUrl` text,
	`bankInfo` text,
	`notes` text,
	`minMarginPercent` decimal(6,2) DEFAULT '15',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `company_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contract_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contractId` int NOT NULL,
	`alertType` enum('vencimento','reajuste','saldo','pendencia','prorrogacao') NOT NULL,
	`severity` enum('info','warning','critical') NOT NULL DEFAULT 'warning',
	`title` varchar(256) NOT NULL,
	`description` text,
	`dueDate` date,
	`status` enum('open','resolved') NOT NULL DEFAULT 'open',
	`resolvedByUserId` int,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contract_alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contract_balance_movements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contractId` int NOT NULL,
	`movementType` enum('empenho','faturamento','consumo','reforco','glosa','outro') NOT NULL,
	`amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`movementDate` date NOT NULL,
	`description` text,
	`referenceNumber` varchar(128),
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contract_balance_movements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contract_extensions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contractId` int NOT NULL,
	`extensionType` enum('prazo','quantitativo','ambos') NOT NULL DEFAULT 'prazo',
	`previousEndDate` date,
	`newEndDate` date,
	`addedDays` int NOT NULL DEFAULT 0,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contract_extensions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contract_reajustes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contractId` int NOT NULL,
	`reajusteDate` date NOT NULL,
	`indexName` varchar(64),
	`indexPercent` decimal(8,4) DEFAULT '0.0000',
	`previousValue` decimal(14,2) DEFAULT '0.00',
	`updatedValue` decimal(14,2) DEFAULT '0.00',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contract_reajustes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
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
CREATE TABLE `diligencia_workflows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`proposalId` int,
	`orgId` int,
	`tipo` varchar(64) NOT NULL,
	`titulo` varchar(256) NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'aberta',
	`prioridade` varchar(16) NOT NULL DEFAULT 'media',
	`prazoResposta` date,
	`responsavel` varchar(256),
	`detalhes` text,
	`resposta` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `diligencia_workflows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documentos_habilitacao` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tipo` varchar(64) NOT NULL,
	`nome` varchar(256) NOT NULL,
	`fileUrl` varchar(512),
	`fileKey` varchar(256),
	`dataEmissao` varchar(16),
	`dataVencimento` varchar(16),
	`statusValidade` varchar(32) NOT NULL DEFAULT 'sem_data',
	`notas` text,
	`orgaoEmissor` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `documentos_habilitacao_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `duplicate_detection_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runId` int NOT NULL,
	`primaryProductId` int NOT NULL,
	`secondaryProductId` int NOT NULL,
	`score` decimal(5,2) NOT NULL DEFAULT '0.00',
	`classification` enum('confirmed','probable','review','distinct','ignored','merged') NOT NULL DEFAULT 'review',
	`rationale` text,
	`matchedFields` json,
	`reviewedByUserId` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `duplicate_detection_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `duplicate_detection_runs` (
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
	`finishedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `duplicate_detection_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `duplicate_merge_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`resultId` int,
	`primaryProductId` int NOT NULL,
	`secondaryProductId` int NOT NULL,
	`action` enum('merge','replace','ignore','mark_distinct') NOT NULL,
	`performedByUserId` int,
	`notes` text,
	`snapshot` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `duplicate_merge_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edital_analyses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileName` varchar(256) NOT NULL,
	`fileUrl` varchar(512),
	`fileKey` varchar(256),
	`itensExtraidos` json,
	`prazosEntrega` text,
	`condicoesPagamento` text,
	`documentosExigidos` json,
	`orgaoComprador` varchar(256),
	`numeroEdital` varchar(128),
	`status` varchar(32) NOT NULL DEFAULT 'pendente',
	`errorMessage` text,
	`proposalId` int,
	`licitacaoId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`processedAt` timestamp,
	CONSTRAINT `edital_analyses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `email_quotation_items` (
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
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `email_quotation_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `email_quotations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`messageId` varchar(512) NOT NULL,
	`fromAddress` varchar(320),
	`fromName` varchar(256),
	`subject` varchar(512),
	`orgao` varchar(256),
	`bodyText` text,
	`receivedAt` timestamp,
	`prazoResposta` date,
	`sourceType` enum('spreadsheet','pdf','docx','body','manual') NOT NULL DEFAULT 'body',
	`sourceFilename` varchar(512),
	`status` enum('nova','processando','revisao','respondida','descartada','erro') NOT NULL DEFAULT 'nova',
	`totalItems` int NOT NULL DEFAULT 0,
	`matchedItems` int NOT NULL DEFAULT 0,
	`errorMessage` text,
	`resultado` enum('pendente','ganhou','perdeu','cancelada') NOT NULL DEFAULT 'pendente',
	`valorProposto` decimal(15,2),
	`valorVencedor` decimal(15,2),
	`categoria` varchar(128),
	`resultadoObs` text,
	`resultadoEm` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `email_quotations_id` PRIMARY KEY(`id`),
	CONSTRAINT `email_quotations_messageId_unique` UNIQUE(`messageId`)
);
--> statement-breakpoint
CREATE TABLE `enrichment_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`executionId` varchar(64) NOT NULL,
	`source` enum('nfe_import','manual','batch_job','api') NOT NULL,
	`status` enum('pending','running','completed','failed') DEFAULT 'pending',
	`totalProducts` int DEFAULT 0,
	`successCount` int DEFAULT 0,
	`failureCount` int DEFAULT 0,
	`skippedCount` int DEFAULT 0,
	`averageConfidenceScore` decimal(5,2) DEFAULT '0.00',
	`startedAt` timestamp DEFAULT (now()),
	`completedAt` timestamp,
	`errorMessage` text,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `enrichment_history_id` PRIMARY KEY(`id`),
	CONSTRAINT `enrichment_history_executionId_unique` UNIQUE(`executionId`)
);
--> statement-breakpoint
CREATE TABLE `enrichment_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`executionId` varchar(64) NOT NULL,
	`productId` int NOT NULL,
	`fieldName` varchar(128) NOT NULL,
	`originalValue` text,
	`suggestedValue` text,
	`appliedValue` text,
	`confidenceScore` decimal(5,2) DEFAULT '0.00',
	`status` enum('pending','approved','rejected','applied') DEFAULT 'pending',
	`reviewNotes` text,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `enrichment_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `equivalence_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`activeIngredient` varchar(512) NOT NULL,
	`categoryId` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `equivalence_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `equivalence_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`productId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `equivalence_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_equiv_member` UNIQUE(`groupId`,`productId`)
);
--> statement-breakpoint
CREATE TABLE `equivalenceProfiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`categorySlug` varchar(128),
	`description` text,
	`isActive` enum('yes','no') NOT NULL DEFAULT 'yes',
	`criticalAttributes` json NOT NULL,
	`tolerances` json NOT NULL,
	`importantAttributes` json NOT NULL,
	`synonyms` json,
	`minScore` int DEFAULT 80,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `equivalenceProfiles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `equivalenceResults` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`candidateProductId` int,
	`candidateDescription` text,
	`status` enum('APROVADO','REPROVADO','REVISAO') NOT NULL,
	`score` int DEFAULT 0,
	`criticalDivergences` json,
	`importantDivergences` json,
	`attributeComparisons` json,
	`justification` text,
	`reviewNotes` text,
	`generatedBy` varchar(64) DEFAULT 'ai',
	`reviewedBy` varchar(128),
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `equivalenceResults_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `equivalenceSessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profileId` int,
	`referenceProductId` int,
	`referenceDescription` text,
	`title` varchar(512),
	`processNumber` varchar(256),
	`createdBy` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `equivalenceSessions_id` PRIMARY KEY(`id`)
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
CREATE TABLE `executive_decision_factors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`decisionId` int NOT NULL,
	`factorKey` varchar(64) NOT NULL,
	`factorLabel` varchar(128) NOT NULL,
	`score` int NOT NULL DEFAULT 0,
	`weight` int NOT NULL DEFAULT 0,
	`impact` enum('positive','neutral','negative') NOT NULL DEFAULT 'neutral',
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `executive_decision_factors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `executive_decisions` (
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
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `executive_decisions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `extractedAttributes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`attribute` varchar(128) NOT NULL,
	`value` text NOT NULL,
	`valueNormalized` text,
	`unit` varchar(64),
	`valueNumeric` decimal(18,6),
	`sourceType` enum('pdf','url','text','manual') NOT NULL,
	`sourceRef` text,
	`sourceHash` varchar(64),
	`sourcePage` int,
	`sourceExcerpt` text,
	`confidence` decimal(4,3) DEFAULT '0.000',
	`needsReview` int DEFAULT 0,
	`extractedBy` varchar(64) DEFAULT 'ai',
	`extractedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `extractedAttributes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `financial_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('income','expense') NOT NULL,
	`category` varchar(128),
	`description` varchar(512) NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`dueDate` timestamp,
	`paidAt` timestamp,
	`isPaid` enum('yes','no') NOT NULL DEFAULT 'no',
	`proposalId` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `financial_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gov_licitation_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`govLicitationId` int NOT NULL,
	`descricaoItem` text NOT NULL,
	`quantidade` decimal(12,3) DEFAULT '1',
	`unidade` varchar(64),
	`valorEstimado` decimal(14,4),
	`activeIngredient` varchar(256),
	`concentration` varchar(128),
	`presentation` varchar(128),
	`matchedProductId` int,
	`matchScore` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gov_licitation_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gov_licitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`source` varchar(64) NOT NULL DEFAULT 'comprasgov',
	`externalId` varchar(256) NOT NULL,
	`uasg` varchar(64),
	`numeroAviso` varchar(128),
	`objeto` text NOT NULL,
	`ufSigla` varchar(4),
	`razaoSocial` varchar(512),
	`dataPublicacao` timestamp,
	`dataAbertura` timestamp,
	`rawJson` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gov_licitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `gov_licitations_externalId_unique` UNIQUE(`externalId`)
);
--> statement-breakpoint
CREATE TABLE `gov_participation_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`govLicitationId` int NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'participou',
	`result` varchar(32) DEFAULT 'pendente',
	`proposalId` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gov_participation_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `image_auto_link_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`imageUrl` text NOT NULL,
	`productName` varchar(512) NOT NULL,
	`matchScore` decimal(3,2) NOT NULL,
	`status` enum('linked','rejected','pending_review') NOT NULL DEFAULT 'linked',
	`importBatchId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `image_auto_link_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `import_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierId` int,
	`categoryId` int,
	`fileName` varchar(512) NOT NULL,
	`fileUrl` text,
	`totalRows` int DEFAULT 0,
	`importedRows` int DEFAULT 0,
	`errorRows` int DEFAULT 0,
	`status` enum('pending','processing','done','error') NOT NULL DEFAULT 'pending',
	`errorMessage` text,
	`columnMapping` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `import_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `import_progress` (
	`queueId` varchar(64) NOT NULL,
	`status` varchar(32),
	`progressJson` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `import_progress_queueId` PRIMARY KEY(`queueId`)
);
--> statement-breakpoint
CREATE TABLE `keyword_monitor_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`keyword` varchar(256) NOT NULL,
	`descricao` varchar(256),
	`ativo` boolean NOT NULL DEFAULT true,
	`uf` varchar(2),
	`modalidade` int,
	`lastScanAt` timestamp,
	`totalFound` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `keyword_monitor_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `keyword_monitor_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`configId` int NOT NULL,
	`keyword` varchar(256) NOT NULL,
	`eventHash` varchar(64) NOT NULL,
	`numeroControlePncp` varchar(128),
	`numeroPregao` varchar(64),
	`anoCompra` int,
	`sequencialCompra` int,
	`cnpjOrgao` varchar(18),
	`nomeOrgao` varchar(256),
	`ufOrgao` varchar(2),
	`municipioOrgao` varchar(128),
	`objeto` text,
	`modalidadeNome` varchar(128),
	`modalidadeId` int,
	`valorEstimado` decimal(14,2),
	`dataAbertura` varchar(32),
	`dataEncerramento` varchar(32),
	`dataPublicacao` varchar(32),
	`srp` boolean DEFAULT false,
	`urlPortal` varchar(512),
	`readAt` timestamp,
	`notifiedAt` timestamp,
	`status` varchar(32) NOT NULL DEFAULT 'nova',
	`notas` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `keyword_monitor_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `keyword_monitor_events_eventHash_unique` UNIQUE(`eventHash`)
);
--> statement-breakpoint
CREATE TABLE `licitacaoItens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`licitacaoId` int NOT NULL,
	`numeroItem` int,
	`descricao` text,
	`quantidade` decimal(15,4),
	`unidade` varchar(64),
	`valorEstimado` decimal(15,2),
	`valorUnitario` decimal(15,4),
	`categoria` varchar(256),
	`codigoCatalogo` varchar(64),
	`produtoMatchId` int,
	`scoreMatch` decimal(5,4),
	`matchConfirmado` int DEFAULT 0,
	`createdAt` timestamp DEFAULT (now()),
	CONSTRAINT `licitacaoItens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `licitacaoMatch` (
	`id` int AUTO_INCREMENT NOT NULL,
	`licitacaoItemId` int NOT NULL,
	`produtoId` int NOT NULL,
	`score` decimal(5,4) NOT NULL,
	`matchConfirmado` int DEFAULT 0,
	`confirmadoPor` varchar(128),
	`data` timestamp DEFAULT (now()),
	CONSTRAINT `licitacaoMatch_id` PRIMARY KEY(`id`)
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
CREATE TABLE `licitacaoSyncLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fonte` varchar(32) NOT NULL,
	`dataExecucao` timestamp DEFAULT (now()),
	`totalLicitacoes` int DEFAULT 0,
	`totalItens` int DEFAULT 0,
	`totalOportunidades` int DEFAULT 0,
	`erros` int DEFAULT 0,
	`tempoExecucaoMs` int DEFAULT 0,
	`detalhes` text,
	`status` varchar(32) DEFAULT 'ok',
	CONSTRAINT `licitacaoSyncLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `licitacoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fonte` varchar(32) NOT NULL,
	`externalId` varchar(256) NOT NULL,
	`numero` varchar(128),
	`orgao` varchar(512),
	`cnpjOrgao` varchar(20),
	`uf` varchar(2),
	`municipio` varchar(128),
	`modalidade` varchar(128),
	`objeto` text,
	`dataPublicacao` varchar(32),
	`dataAbertura` varchar(32),
	`dataEncerramento` varchar(32),
	`valorEstimado` decimal(15,2),
	`status` varchar(64) DEFAULT 'ativa',
	`link` text,
	`rawData` json,
	`dataSync` timestamp DEFAULT (now()),
	`createdAt` timestamp DEFAULT (now()),
	`updatedAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `licitacoes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `licitacoes_descobertas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pncpId` varchar(128),
	`sequencial` int,
	`ano` int,
	`cnpjOrgao` varchar(18),
	`nomeOrgao` varchar(256),
	`ufOrgao` varchar(2),
	`municipioOrgao` varchar(128),
	`objeto` text,
	`modalidadeNome` varchar(128),
	`modalidadeId` int,
	`valorEstimado` decimal(14,2),
	`dataAbertura` varchar(32),
	`dataEncerramento` varchar(32),
	`dataPublicacao` varchar(32),
	`srp` boolean DEFAULT false,
	`urlPortal` varchar(512),
	`urlEdital` varchar(512),
	`status` varchar(32) NOT NULL DEFAULT 'nova',
	`notas` text,
	`proposalId` int,
	`origemKeyword` varchar(128),
	`hashId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `licitacoes_descobertas_id` PRIMARY KEY(`id`),
	CONSTRAINT `licitacoes_descobertas_hashId_unique` UNIQUE(`hashId`)
);
--> statement-breakpoint
CREATE TABLE `master_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ean` varchar(64),
	`codigoMapa` varchar(64),
	`name` varchar(512) NOT NULL,
	`activeIngredient` varchar(512),
	`manufacturer` varchar(256),
	`concentration` varchar(128),
	`presentation` varchar(512),
	`unit` varchar(64),
	`description` text,
	`categoryName` varchar(256),
	`categoryId` int,
	`imageUrl` text,
	`productUrl` text,
	`isActive` enum('yes','no') NOT NULL DEFAULT 'yes',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `master_products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `match_feedback` (
	`id` int AUTO_INCREMENT NOT NULL,
	`editalTerm` varchar(512) NOT NULL,
	`productId` int NOT NULL,
	`productName` varchar(512) NOT NULL,
	`useCount` int NOT NULL DEFAULT 1,
	`confirmedAt` timestamp NOT NULL DEFAULT (now()),
	`lastUsedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `match_feedback_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `match_feedback_v2` (
	`id` int AUTO_INCREMENT NOT NULL,
	`editalItem` varchar(512) NOT NULL,
	`editalItemNormalizado` varchar(512),
	`produtoSugeridoId` int,
	`produtoSugeridoNome` varchar(512),
	`scoreOriginal` decimal(5,4),
	`produtoEscolhidoId` int,
	`produtoEscolhidoNome` varchar(512),
	`acao` varchar(32) NOT NULL,
	`usuarioConfirmou` boolean NOT NULL DEFAULT false,
	`editalAnalysisId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `match_feedback_v2_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `match_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`editalItem` varchar(512) NOT NULL,
	`editalItemNormalizado` varchar(512),
	`produtoSugeridoId` int,
	`produtoSugeridoNome` varchar(512),
	`score` decimal(5,4),
	`criteriosUtilizados` json,
	`decisao` varchar(32),
	`tempoExecucaoMs` int,
	`editalAnalysisId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `match_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `nfe_imports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nfeNumber` varchar(256) NOT NULL,
	`supplierName` varchar(256) NOT NULL,
	`supplierCnpj` varchar(20) NOT NULL,
	`supplierId` int,
	`totalProducts` int DEFAULT 0,
	`importedProducts` int DEFAULT 0,
	`status` enum('pending','processing','completed','failed') DEFAULT 'pending',
	`xmlContent` text,
	`importDate` timestamp DEFAULT (now()),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `nfe_imports_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_nfe_imports_numero_cnpj` UNIQUE(`nfeNumber`,`supplierCnpj`)
);
--> statement-breakpoint
CREATE TABLE `notification_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierId` int NOT NULL,
	`webhookId` int NOT NULL,
	`type` varchar(50) NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text,
	`status` enum('sent','failed') DEFAULT 'sent',
	`errorMessage` text,
	`sentAt` timestamp DEFAULT (now()),
	CONSTRAINT `notification_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification_webhooks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierId` int NOT NULL,
	`type` enum('slack','email') NOT NULL,
	`webhookUrl` varchar(512) NOT NULL,
	`name` varchar(255),
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp DEFAULT (now()),
	`updatedAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notification_webhooks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `oportunidadesLicitacao` (
	`id` int AUTO_INCREMENT NOT NULL,
	`licitacaoId` int NOT NULL,
	`licitacaoItemId` int,
	`produtoId` int,
	`score` decimal(5,4),
	`valorEstimado` decimal(15,2),
	`status` varchar(32) DEFAULT 'nova',
	`alertaEnviado` int DEFAULT 0,
	`createdAt` timestamp DEFAULT (now()),
	`updatedAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `oportunidadesLicitacao_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `org_history_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`proposalId` int,
	`eventType` varchar(64) NOT NULL,
	`title` varchar(256) NOT NULL,
	`details` text,
	`score` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `org_history_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `portal_credentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`portal` varchar(32) NOT NULL,
	`apelido` varchar(128),
	`loginUrl` text,
	`usuario` varchar(256) NOT NULL,
	`senhaCriptografada` text NOT NULL,
	`cnpj` varchar(18),
	`ativo` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `portal_credentials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `post_award_contracts` (
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
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `post_award_contracts_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_post_award_contract_number` UNIQUE(`contractNumber`)
);
--> statement-breakpoint
CREATE TABLE `price_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`supplierId` int NOT NULL,
	`price` decimal(12,2),
	`freightValue` decimal(12,2),
	`taxValue` decimal(12,2),
	`landedCost` decimal(12,2),
	`priceAlert` enum('yes','no') NOT NULL DEFAULT 'no',
	`alertPercent` decimal(6,2),
	`importBatchId` int,
	`precoAnterior` decimal(12,2),
	`precoNovo` decimal(12,2),
	`origem` varchar(64),
	`data` timestamp DEFAULT (now()),
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `price_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pricing_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierId` int NOT NULL,
	`region` varchar(128) NOT NULL,
	`icmsPercentage` decimal(5,2) DEFAULT '0',
	`ipPercentage` decimal(5,2) DEFAULT '0',
	`pisPercentage` decimal(5,2) DEFAULT '0',
	`cofinsPercentage` decimal(5,2) DEFAULT '0',
	`freightType` enum('fixed','percentage') DEFAULT 'fixed',
	`freightValue` decimal(12,2) DEFAULT '0',
	`marginPercentage` decimal(5,2) NOT NULL,
	`minPrice` decimal(12,2),
	`maxPrice` decimal(12,2),
	`roundingMethod` enum('round','ceil','floor') DEFAULT 'round',
	`isActive` enum('yes','no') NOT NULL DEFAULT 'yes',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pricing_configs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pricing_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`pricingConfigId` int NOT NULL,
	`basePriceBeforeTax` decimal(12,2) NOT NULL,
	`taxAmount` decimal(12,2) NOT NULL,
	`freightAmount` decimal(12,2) NOT NULL,
	`priceBeforeMargin` decimal(12,2) NOT NULL,
	`marginAmount` decimal(12,2) NOT NULL,
	`finalPrice` decimal(12,2) NOT NULL,
	`icmsAmount` decimal(12,2) DEFAULT '0',
	`ipAmount` decimal(12,2) DEFAULT '0',
	`pisAmount` decimal(12,2) DEFAULT '0',
	`cofinsAmount` decimal(12,2) DEFAULT '0',
	`appliedAt` timestamp,
	`appliedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pricing_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `product_capture_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`supplierId` int NOT NULL,
	`fieldChanged` varchar(128) NOT NULL,
	`valueBefore` text,
	`valueAfter` text,
	`changeSource` enum('manual','validated','captured','system') DEFAULT 'captured',
	`status` enum('detected','approved','applied','rejected') DEFAULT 'detected',
	`approvedBy` int,
	`approvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_capture_history_id` PRIMARY KEY(`id`)
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
CREATE TABLE `productMetadata` (
	`id` int AUTO_INCREMENT NOT NULL,
	`produtoId` int NOT NULL,
	`key` varchar(128) NOT NULL,
	`value` text NOT NULL,
	`confidence` decimal(4,3) DEFAULT '0.000',
	`source` varchar(64) DEFAULT 'extracted_from_ficha',
	`needsReview` int DEFAULT 0,
	`lockedManual` int DEFAULT 0,
	`generatedBy` varchar(128),
	`updatedAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdAt` timestamp DEFAULT (now()),
	CONSTRAINT `productMetadata_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `product_supplier_offers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`supplierId` int NOT NULL,
	`supplierCode` varchar(255),
	`supplierName` varchar(255),
	`brand` varchar(255),
	`manufacturer` varchar(255),
	`price` decimal(12,2),
	`priceHistory` json,
	`link` text,
	`image` text,
	`availability` varchar(50),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `product_supplier_offers_id` PRIMARY KEY(`id`),
	CONSTRAINT `unique_product_supplier` UNIQUE(`productId`,`supplierId`)
);
--> statement-breakpoint
CREATE TABLE `product_supplier_prices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`supplierId` int NOT NULL,
	`price` decimal(12,2),
	`codigoFornecedor` varchar(128),
	`linkProduto` text,
	`dataAtualizacao` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `product_supplier_prices_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_psp_product_supplier` UNIQUE(`productId`,`supplierId`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierId` int NOT NULL,
	`categoryId` int,
	`code` varchar(128),
	`name` varchar(512) NOT NULL,
	`description` text,
	`activeIngredient` varchar(512),
	`manufacturer` varchar(256),
	`unit` varchar(64),
	`concentration` varchar(128),
	`presentation` varchar(256),
	`pharmaceuticalForm` varchar(128),
	`price` decimal(12,2),
	`priceUnit` varchar(64),
	`stock` varchar(64),
	`barcode` varchar(128),
	`gtin` varchar(64),
	`codigoFornecedor` varchar(128),
	`informacaoTecnica` text,
	`mapa` varchar(128),
	`subcategoria` varchar(256),
	`fichaTecnica` text,
	`ncm` varchar(16),
	`laboratorio` varchar(256),
	`especieAnimal` varchar(256),
	`classeTerapeutica` varchar(256),
	`nomeProduto` varchar(512),
	`registroRegulatorio` enum('MAPA','ANVISA','FORN'),
	`nomeNormalizado` varchar(512),
	`metadataExtractedAt` timestamp,
	`ean` varchar(64),
	`catmasCode` varchar(32),
	`catmatCode` varchar(32),
	`freightValue` decimal(12,2),
	`taxValue` decimal(12,2),
	`imageUrl` text,
	`productUrl` text,
	`importBatchId` int,
	`tipoCatalogo` enum('medicamento_veterinario','medicamento_humano','produto_nao_medicamentoso','material_insumo_equipamento') NOT NULL DEFAULT 'produto_nao_medicamentoso',
	`statusConfiabilidade` enum('completo_validado','completo_nao_validado','parcial','incompleto','enriquecido_ia','pendente_revisao') NOT NULL DEFAULT 'incompleto',
	`isActive` enum('yes','no') NOT NULL DEFAULT 'yes',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
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
CREATE TABLE `proposal_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`proposalId` int NOT NULL,
	`productId` int,
	`itemNumber` int DEFAULT 0,
	`productName` varchar(512) NOT NULL,
	`activeIngredient` varchar(512),
	`manufacturer` varchar(256),
	`concentration` varchar(128),
	`presentation` varchar(256),
	`unit` varchar(64),
	`supplierName` varchar(256),
	`unitPrice` decimal(12,2),
	`costPrice` decimal(12,2),
	`editalRefPrice` decimal(12,2),
	`suggestedPrice` decimal(12,2),
	`quantity` int NOT NULL DEFAULT 1,
	`totalPrice` decimal(14,2),
	`notes` text,
	`imageUrl` text,
	`productUrl` text,
	`registroMapa` varchar(128),
	`sortOrder` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `proposal_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `proposal_status_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`proposalId` int NOT NULL,
	`fromStatus` varchar(32),
	`toStatus` varchar(32) NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `proposal_status_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `proposal_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`orgType` enum('prefeitura','estado','federal','privado','outro') NOT NULL DEFAULT 'outro',
	`icmsPercent` decimal(5,2) DEFAULT '0',
	`stPercent` decimal(5,2) DEFAULT '0',
	`ipiPercent` decimal(5,2) DEFAULT '0',
	`otherTaxPercent` decimal(5,2) DEFAULT '0',
	`freightType` enum('cif','fob','none') DEFAULT 'cif',
	`freightPercent` decimal(5,2) DEFAULT '0',
	`validityDays` int DEFAULT 30,
	`declarations` text,
	`paymentTerms` varchar(256),
	`deliveryDays` int DEFAULT 15,
	`notes` text,
	`isDefault` enum('yes','no') NOT NULL DEFAULT 'no',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `proposal_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processNumber` varchar(128),
	`orgId` int,
	`orgName` varchar(256),
	`title` varchar(256) NOT NULL,
	`status` enum('draft','sent','order','in_transit','delivered','cancelled') NOT NULL DEFAULT 'draft',
	`validityDays` int DEFAULT 30,
	`paymentTerms` varchar(256),
	`deliveryTerms` varchar(256),
	`notes` text,
	`notesHtml` text,
	`regrasTributariasId` int,
	`freightValue` decimal(12,2),
	`freightCarrier` varchar(256),
	`freightTrackingCode` varchar(128),
	`freightPaidAt` timestamp,
	`sentAt` timestamp,
	`orderedAt` timestamp,
	`shippedAt` timestamp,
	`deliveredAt` timestamp,
	`cancelledAt` timestamp,
	`totalValue` decimal(14,2),
	`prazoPagamentoDias` int DEFAULT 30,
	`riscoFinanceiro` varchar(16),
	`origem` varchar(32) DEFAULT 'manual',
	`radarOpportunityId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `proposals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `publicPriceHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int,
	`itemDescription` text NOT NULL,
	`catmatCode` varchar(32),
	`unitPrice` decimal(15,4),
	`estimatedUnitPrice` decimal(15,4),
	`quantity` decimal(15,4),
	`unit` varchar(64),
	`totalValue` decimal(18,4),
	`source` varchar(32) NOT NULL DEFAULT 'PNCP',
	`processNumber` varchar(256),
	`pncpId` varchar(256),
	`orgaoCnpj` varchar(18),
	`orgaoName` varchar(512),
	`uf` varchar(2),
	`modalidade` varchar(64),
	`publicationDate` date,
	`homologationDate` date,
	`evidenceUrl` text,
	`rawJson` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `publicPriceHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quotation_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quotationId` int NOT NULL,
	`productId` int,
	`productName` varchar(512) NOT NULL,
	`supplierName` varchar(256),
	`activeIngredient` varchar(512),
	`manufacturer` varchar(256),
	`concentration` varchar(128),
	`presentation` varchar(256),
	`unit` varchar(64),
	`price` decimal(12,2),
	`priceUnit` varchar(64),
	`quantity` int NOT NULL DEFAULT 1,
	`sortOrder` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quotation_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quotations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(256) NOT NULL,
	`clientName` varchar(256),
	`clientContact` varchar(256),
	`notes` text,
	`status` enum('draft','finalized') NOT NULL DEFAULT 'draft',
	`validUntil` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quotations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `radarKeywords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`areaId` int NOT NULL,
	`areaName` varchar(128) NOT NULL,
	`keyword` varchar(256) NOT NULL,
	`type` enum('include','exclude','anchor') NOT NULL DEFAULT 'include',
	`scoreBonus` int DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `radarKeywords_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `radarOpportunities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceId` int,
	`areaId` int NOT NULL,
	`dataCaptura` timestamp NOT NULL DEFAULT (now()),
	`fonte` varchar(64) NOT NULL,
	`entidadeNome` varchar(256),
	`cnpjOrgao` varchar(18),
	`uf` varchar(2),
	`municipio` varchar(128),
	`canal` varchar(128),
	`objetoTexto` text,
	`modalidade` varchar(128),
	`dataPublicacao` date,
	`dataAbertura` date,
	`situacao` varchar(64),
	`linkEdital` text,
	`anexosLinks` json,
	`scoreRelevancia` int DEFAULT 0,
	`keywordsDetectadas` json,
	`evidencias` json,
	`numeroProcesso` varchar(128),
	`pncpId` varchar(256),
	`contentHash` varchar(64),
	`isNew` boolean NOT NULL DEFAULT true,
	`isAlerted` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `radarOpportunities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `radarSources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tipoEntidade` varchar(64) NOT NULL,
	`entidadeNome` varchar(256) NOT NULL,
	`uf` varchar(2),
	`municipio` varchar(128),
	`dominioOficial` varchar(256),
	`canalPrimario` varchar(64),
	`urlCanal` text,
	`metodoColeta` varchar(64) DEFAULT 'PNCP',
	`observacoesValidacao` text,
	`prioridade` enum('alta','media','baixa') NOT NULL DEFAULT 'media',
	`ativo` boolean NOT NULL DEFAULT true,
	`ultimaSincronizacao` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `radarSources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `radarSyncLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`finishedAt` timestamp,
	`status` enum('running','success','error','partial') NOT NULL DEFAULT 'running',
	`totalFontes` int DEFAULT 0,
	`totalOportunidades` int DEFAULT 0,
	`novas` int DEFAULT 0,
	`alteradas` int DEFAULT 0,
	`erros` int DEFAULT 0,
	`detalhes` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `radarSyncLogs_id` PRIMARY KEY(`id`)
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
CREATE TABLE `requesting_orgs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`cnpj` varchar(18),
	`address` text,
	`city` varchar(128),
	`state` varchar(2),
	`phone` varchar(32),
	`email` varchar(320),
	`contactPerson` varchar(256),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `requesting_orgs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scrape_enrichment_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int,
	`jobId` int,
	`campo` varchar(64) NOT NULL,
	`valorAnterior` text,
	`valorNovo` text,
	`fonte` varchar(2048),
	`dataCaptura` timestamp NOT NULL DEFAULT (now()),
	`temConflito` boolean NOT NULL DEFAULT false,
	`conflitosJson` json,
	`revisadoPor` varchar(256),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scrape_enrichment_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scrape_errors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`url` varchar(2048),
	`erro` text,
	`statusCode` int,
	`stack` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scrape_errors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scrape_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profileId` int,
	`supplierId` int,
	`supplierName` varchar(256),
	`tipo` varchar(32) NOT NULL,
	`url` varchar(2048) NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'pendente',
	`totalCapturado` int DEFAULT 0,
	`totalComEan` int DEFAULT 0,
	`totalSemFabricante` int DEFAULT 0,
	`totalSemFicha` int DEFAULT 0,
	`totalConflitos` int DEFAULT 0,
	`totalErros` int DEFAULT 0,
	`resultadoBruto` json,
	`errorMessage` text,
	`iniciadoEm` timestamp,
	`concluidoEm` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scrape_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scrape_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierId` int,
	`supplierName` varchar(256) NOT NULL,
	`allowedDomains` json NOT NULL,
	`selectors` json NOT NULL,
	`cleanRules` json,
	`sessionCookie` text,
	`userAgent` varchar(512),
	`rateLimitMs` int DEFAULT 2000,
	`maxPages` int DEFAULT 10,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scrape_profiles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scrape_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`productId` int,
	`dadosCapturados` json NOT NULL,
	`camposCapturados` json,
	`origem` varchar(32) DEFAULT 'site',
	`confianca` decimal(3,2),
	`status` varchar(32) NOT NULL DEFAULT 'pendente',
	`notasRevisao` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scrape_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scraper_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierId` int NOT NULL,
	`scraperType` varchar(64) NOT NULL,
	`enabled` enum('yes','no') NOT NULL DEFAULT 'yes',
	`email` text NOT NULL,
	`passwordHash` text NOT NULL,
	`scheduleTime` varchar(8) DEFAULT '02:00',
	`lastRunAt` timestamp,
	`nextRunAt` timestamp,
	`lastRunStatus` enum('success','failed','pending') DEFAULT 'pending',
	`lastRunErrorMessage` text,
	`productsScrapedCount` int DEFAULT 0,
	`productsMatchedCount` int DEFAULT 0,
	`productsUpdatedCount` int DEFAULT 0,
	`productsCreatedCount` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scraper_configs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scraper_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scraperConfigId` int NOT NULL,
	`status` enum('success','failed','running') NOT NULL,
	`startedAt` timestamp NOT NULL,
	`completedAt` timestamp,
	`durationMs` int,
	`productsScraped` int DEFAULT 0,
	`productsMatched` int DEFAULT 0,
	`productsUpdated` int DEFAULT 0,
	`productsCreated` int DEFAULT 0,
	`errorMessage` text,
	`errorStack` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scraper_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supplier_capture_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierId` int NOT NULL,
	`baseUrl` varchar(512) NOT NULL,
	`loginUrl` varchar(512),
	`catalogUrl` varchar(512),
	`accessType` enum('public','username_password','session_cookie','api_key') DEFAULT 'public',
	`captureMethod` enum('html','sitemap','api','pagination','search') DEFAULT 'html',
	`productListSelector` text,
	`productNameSelector` text,
	`productPriceSelector` text,
	`productDescriptionSelector` text,
	`productImageSelector` text,
	`productSkuSelector` text,
	`productManufacturerSelector` text,
	`productStockSelector` text,
	`paginationSelector` text,
	`productLinkSelector` text,
	`cleanupRegex` text,
	`prefixesToRemove` text,
	`suffixesToRemove` text,
	`updateFrequencyHours` int DEFAULT 24,
	`inactivationPolicy` enum('never','after_2_misses','after_3_misses') DEFAULT 'after_3_misses',
	`customHeaders` json,
	`retryAttempts` int DEFAULT 3,
	`timeoutSeconds` int DEFAULT 30,
	`isActive` boolean DEFAULT true,
	`lastCaptureAt` timestamp,
	`lastSuccessAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supplier_capture_configs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supplierConnectors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierId` int,
	`name` varchar(256) NOT NULL,
	`connectorType` enum('api_rest','csv_excel','xml','manual') NOT NULL DEFAULT 'csv_excel',
	`isActive` enum('yes','no') NOT NULL DEFAULT 'yes',
	`baseUrl` text,
	`authType` enum('none','api_key','bearer','basic') DEFAULT 'none',
	`authConfig` json,
	`endpoints` json,
	`paginationConfig` json,
	`rateLimit` int DEFAULT 60,
	`fieldMapping` json,
	`downloadUrl` text,
	`xmlRootPath` varchar(256),
	`lastSyncAt` timestamp,
	`lastSyncStatus` enum('ok','error','partial','pending') DEFAULT 'pending',
	`lastSyncMessage` text,
	`syncIntervalHours` int DEFAULT 24,
	`notes` text,
	`createdBy` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supplierConnectors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supplier_credentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierId` int NOT NULL,
	`authType` enum('username_password','api_key','oauth','session_token') DEFAULT 'username_password',
	`username` text,
	`passwordEncrypted` text,
	`apiKey` text,
	`sessionToken` text,
	`notes` text,
	`lastUsedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supplier_credentials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supplier_imports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierId` int NOT NULL,
	`fileName` varchar(256) NOT NULL,
	`fileContent` text,
	`productsImported` int DEFAULT 0,
	`productsMatched` int DEFAULT 0,
	`status` enum('pending','processing','completed','failed') DEFAULT 'pending',
	`errorMessage` text,
	`importedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supplier_imports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supplier_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierId` int NOT NULL,
	`cookies` text,
	`sessionToken` text,
	`authHeader` text,
	`status` enum('active','expired','invalid','pending') DEFAULT 'pending',
	`lastAuthAt` timestamp,
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `supplier_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`isActive` enum('yes','no') NOT NULL DEFAULT 'yes',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `suppliers_id` PRIMARY KEY(`id`),
	CONSTRAINT `suppliers_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `syncRuns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`source` varchar(64) NOT NULL,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`endedAt` timestamp,
	`insertedCount` int DEFAULT 0,
	`updatedCount` int DEFAULT 0,
	`skippedCount` int DEFAULT 0,
	`errorCount` int DEFAULT 0,
	`windowSync` varchar(128),
	`lastSuccessfulSyncAt` timestamp,
	`status` enum('running','success','error','partial') NOT NULL DEFAULT 'running',
	`errorDetails` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `syncRuns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `synonyms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`term` varchar(256) NOT NULL,
	`canonical` varchar(256) NOT NULL,
	`category` varchar(64) DEFAULT 'geral',
	`isActive` enum('yes','no') NOT NULL DEFAULT 'yes',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `synonyms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`passwordHash` varchar(255),
	`role` enum('user','admin','editor','viewer') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bulk_pricing_application_details` ADD CONSTRAINT `bulk_pricing_application_details_applicationId_bulk_pricing_applications_id_fk` FOREIGN KEY (`applicationId`) REFERENCES `bulk_pricing_applications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bulk_pricing_application_details` ADD CONSTRAINT `bulk_pricing_application_details_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bulk_pricing_applications` ADD CONSTRAINT `bulk_pricing_applications_categoryId_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bulk_pricing_applications` ADD CONSTRAINT `bulk_pricing_applications_appliedBy_users_id_fk` FOREIGN KEY (`appliedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `capture_errors` ADD CONSTRAINT `capture_errors_captureLogId_capture_logs_id_fk` FOREIGN KEY (`captureLogId`) REFERENCES `capture_logs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `capture_errors` ADD CONSTRAINT `capture_errors_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `capture_logs` ADD CONSTRAINT `capture_logs_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `captured_product_batches` ADD CONSTRAINT `captured_product_batches_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `captured_product_field_confidence` ADD CONSTRAINT `captured_product_field_confidence_capturedProductId_captured_products_id_fk` FOREIGN KEY (`capturedProductId`) REFERENCES `captured_products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `captured_product_source_logs` ADD CONSTRAINT `captured_product_source_logs_batchId_captured_product_batches_id_fk` FOREIGN KEY (`batchId`) REFERENCES `captured_product_batches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `captured_product_source_logs` ADD CONSTRAINT `captured_product_source_logs_capturedProductId_captured_products_id_fk` FOREIGN KEY (`capturedProductId`) REFERENCES `captured_products`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `captured_products` ADD CONSTRAINT `captured_products_batchId_captured_product_batches_id_fk` FOREIGN KEY (`batchId`) REFERENCES `captured_product_batches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `captured_products` ADD CONSTRAINT `captured_products_matchedProductId_products_id_fk` FOREIGN KEY (`matchedProductId`) REFERENCES `products`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `category_pricing_rules` ADD CONSTRAINT `category_pricing_rules_categoryId_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cnpj_monitor_events` ADD CONSTRAINT `cnpj_monitor_events_configId_cnpj_monitor_config_id_fk` FOREIGN KEY (`configId`) REFERENCES `cnpj_monitor_config`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contract_alerts` ADD CONSTRAINT `contract_alerts_contractId_post_award_contracts_id_fk` FOREIGN KEY (`contractId`) REFERENCES `post_award_contracts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contract_alerts` ADD CONSTRAINT `contract_alerts_resolvedByUserId_users_id_fk` FOREIGN KEY (`resolvedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contract_balance_movements` ADD CONSTRAINT `contract_balance_movements_contractId_post_award_contracts_id_fk` FOREIGN KEY (`contractId`) REFERENCES `post_award_contracts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contract_balance_movements` ADD CONSTRAINT `contract_balance_movements_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contract_extensions` ADD CONSTRAINT `contract_extensions_contractId_post_award_contracts_id_fk` FOREIGN KEY (`contractId`) REFERENCES `post_award_contracts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contract_reajustes` ADD CONSTRAINT `contract_reajustes_contractId_post_award_contracts_id_fk` FOREIGN KEY (`contractId`) REFERENCES `post_award_contracts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contrato_reajustes` ADD CONSTRAINT `contrato_reajustes_contratoId_contratos_id_fk` FOREIGN KEY (`contratoId`) REFERENCES `contratos`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contratos` ADD CONSTRAINT `contratos_proposalId_proposals_id_fk` FOREIGN KEY (`proposalId`) REFERENCES `proposals`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `diligencia_workflows` ADD CONSTRAINT `diligencia_workflows_proposalId_proposals_id_fk` FOREIGN KEY (`proposalId`) REFERENCES `proposals`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `diligencia_workflows` ADD CONSTRAINT `diligencia_workflows_orgId_requesting_orgs_id_fk` FOREIGN KEY (`orgId`) REFERENCES `requesting_orgs`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `duplicate_detection_results` ADD CONSTRAINT `duplicate_detection_results_runId_duplicate_detection_runs_id_fk` FOREIGN KEY (`runId`) REFERENCES `duplicate_detection_runs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `duplicate_detection_results` ADD CONSTRAINT `duplicate_detection_results_primaryProductId_products_id_fk` FOREIGN KEY (`primaryProductId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `duplicate_detection_results` ADD CONSTRAINT `duplicate_detection_results_secondaryProductId_products_id_fk` FOREIGN KEY (`secondaryProductId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `duplicate_detection_results` ADD CONSTRAINT `duplicate_detection_results_reviewedByUserId_users_id_fk` FOREIGN KEY (`reviewedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `duplicate_detection_runs` ADD CONSTRAINT `duplicate_detection_runs_triggeredByUserId_users_id_fk` FOREIGN KEY (`triggeredByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `duplicate_merge_history` ADD CONSTRAINT `duplicate_merge_history_resultId_duplicate_detection_results_id_fk` FOREIGN KEY (`resultId`) REFERENCES `duplicate_detection_results`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `duplicate_merge_history` ADD CONSTRAINT `duplicate_merge_history_primaryProductId_products_id_fk` FOREIGN KEY (`primaryProductId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `duplicate_merge_history` ADD CONSTRAINT `duplicate_merge_history_secondaryProductId_products_id_fk` FOREIGN KEY (`secondaryProductId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `duplicate_merge_history` ADD CONSTRAINT `duplicate_merge_history_performedByUserId_users_id_fk` FOREIGN KEY (`performedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `email_quotation_items` ADD CONSTRAINT `email_quotation_items_quotationId_email_quotations_id_fk` FOREIGN KEY (`quotationId`) REFERENCES `email_quotations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `enrichment_results` ADD CONSTRAINT `enrichment_results_executionId_enrichment_history_executionId_fk` FOREIGN KEY (`executionId`) REFERENCES `enrichment_history`(`executionId`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `enrichment_results` ADD CONSTRAINT `enrichment_results_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `equivalence_groups` ADD CONSTRAINT `equivalence_groups_categoryId_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `equivalence_members` ADD CONSTRAINT `equivalence_members_groupId_equivalence_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `equivalence_groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `equivalence_members` ADD CONSTRAINT `equivalence_members_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `equivalenceResults` ADD CONSTRAINT `equivalenceResults_sessionId_equivalenceSessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `equivalenceSessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `equivalenceResults` ADD CONSTRAINT `equivalenceResults_candidateProductId_products_id_fk` FOREIGN KEY (`candidateProductId`) REFERENCES `products`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `equivalenceSessions` ADD CONSTRAINT `equivalenceSessions_profileId_equivalenceProfiles_id_fk` FOREIGN KEY (`profileId`) REFERENCES `equivalenceProfiles`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `equivalenceSessions` ADD CONSTRAINT `equivalenceSessions_referenceProductId_products_id_fk` FOREIGN KEY (`referenceProductId`) REFERENCES `products`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `estoque` ADD CONSTRAINT `estoque_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `estoque_reservas` ADD CONSTRAINT `estoque_reservas_proposalId_proposals_id_fk` FOREIGN KEY (`proposalId`) REFERENCES `proposals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `estoque_reservas` ADD CONSTRAINT `estoque_reservas_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `executive_decision_factors` ADD CONSTRAINT `executive_decision_factors_decisionId_executive_decisions_id_fk` FOREIGN KEY (`decisionId`) REFERENCES `executive_decisions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `executive_decisions` ADD CONSTRAINT `executive_decisions_proposalId_proposals_id_fk` FOREIGN KEY (`proposalId`) REFERENCES `proposals`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `executive_decisions` ADD CONSTRAINT `executive_decisions_orgId_requesting_orgs_id_fk` FOREIGN KEY (`orgId`) REFERENCES `requesting_orgs`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `executive_decisions` ADD CONSTRAINT `executive_decisions_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `extractedAttributes` ADD CONSTRAINT `extractedAttributes_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `financial_entries` ADD CONSTRAINT `financial_entries_proposalId_proposals_id_fk` FOREIGN KEY (`proposalId`) REFERENCES `proposals`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gov_licitation_items` ADD CONSTRAINT `gov_licitation_items_govLicitationId_gov_licitations_id_fk` FOREIGN KEY (`govLicitationId`) REFERENCES `gov_licitations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gov_licitation_items` ADD CONSTRAINT `gov_licitation_items_matchedProductId_products_id_fk` FOREIGN KEY (`matchedProductId`) REFERENCES `products`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gov_participation_history` ADD CONSTRAINT `gov_participation_history_govLicitationId_gov_licitations_id_fk` FOREIGN KEY (`govLicitationId`) REFERENCES `gov_licitations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gov_participation_history` ADD CONSTRAINT `gov_participation_history_proposalId_proposals_id_fk` FOREIGN KEY (`proposalId`) REFERENCES `proposals`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `image_auto_link_history` ADD CONSTRAINT `image_auto_link_history_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `import_logs` ADD CONSTRAINT `import_logs_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `import_logs` ADD CONSTRAINT `import_logs_categoryId_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `keyword_monitor_events` ADD CONSTRAINT `keyword_monitor_events_configId_keyword_monitor_config_id_fk` FOREIGN KEY (`configId`) REFERENCES `keyword_monitor_config`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `licitacaoItens` ADD CONSTRAINT `licitacaoItens_licitacaoId_licitacoes_id_fk` FOREIGN KEY (`licitacaoId`) REFERENCES `licitacoes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `licitacaoMatch` ADD CONSTRAINT `licitacaoMatch_licitacaoItemId_licitacaoItens_id_fk` FOREIGN KEY (`licitacaoItemId`) REFERENCES `licitacaoItens`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `licitacao_resultados` ADD CONSTRAINT `licitacao_resultados_proposalId_proposals_id_fk` FOREIGN KEY (`proposalId`) REFERENCES `proposals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `master_products` ADD CONSTRAINT `master_products_categoryId_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `match_feedback` ADD CONSTRAINT `match_feedback_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `nfe_imports` ADD CONSTRAINT `nfe_imports_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_history` ADD CONSTRAINT `notification_history_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_history` ADD CONSTRAINT `notification_history_webhookId_notification_webhooks_id_fk` FOREIGN KEY (`webhookId`) REFERENCES `notification_webhooks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_webhooks` ADD CONSTRAINT `notification_webhooks_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `oportunidadesLicitacao` ADD CONSTRAINT `oportunidadesLicitacao_licitacaoId_licitacoes_id_fk` FOREIGN KEY (`licitacaoId`) REFERENCES `licitacoes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `oportunidadesLicitacao` ADD CONSTRAINT `oportunidadesLicitacao_licitacaoItemId_licitacaoItens_id_fk` FOREIGN KEY (`licitacaoItemId`) REFERENCES `licitacaoItens`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_history_events` ADD CONSTRAINT `org_history_events_orgId_requesting_orgs_id_fk` FOREIGN KEY (`orgId`) REFERENCES `requesting_orgs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_history_events` ADD CONSTRAINT `org_history_events_proposalId_proposals_id_fk` FOREIGN KEY (`proposalId`) REFERENCES `proposals`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `post_award_contracts` ADD CONSTRAINT `post_award_contracts_proposalId_proposals_id_fk` FOREIGN KEY (`proposalId`) REFERENCES `proposals`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `post_award_contracts` ADD CONSTRAINT `post_award_contracts_orgId_requesting_orgs_id_fk` FOREIGN KEY (`orgId`) REFERENCES `requesting_orgs`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `price_history` ADD CONSTRAINT `price_history_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `price_history` ADD CONSTRAINT `price_history_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pricing_configs` ADD CONSTRAINT `pricing_configs_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pricing_history` ADD CONSTRAINT `pricing_history_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pricing_history` ADD CONSTRAINT `pricing_history_pricingConfigId_pricing_configs_id_fk` FOREIGN KEY (`pricingConfigId`) REFERENCES `pricing_configs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pricing_history` ADD CONSTRAINT `pricing_history_appliedBy_users_id_fk` FOREIGN KEY (`appliedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_capture_history` ADD CONSTRAINT `product_capture_history_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_capture_history` ADD CONSTRAINT `product_capture_history_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_capture_history` ADD CONSTRAINT `product_capture_history_approvedBy_users_id_fk` FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_images` ADD CONSTRAINT `product_images_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `productMetadata` ADD CONSTRAINT `productMetadata_produtoId_products_id_fk` FOREIGN KEY (`produtoId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_supplier_offers` ADD CONSTRAINT `product_supplier_offers_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_supplier_offers` ADD CONSTRAINT `product_supplier_offers_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_supplier_prices` ADD CONSTRAINT `product_supplier_prices_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_supplier_prices` ADD CONSTRAINT `product_supplier_prices_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_categoryId_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposal_declarations` ADD CONSTRAINT `proposal_declarations_proposalId_proposals_id_fk` FOREIGN KEY (`proposalId`) REFERENCES `proposals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposal_items` ADD CONSTRAINT `proposal_items_proposalId_proposals_id_fk` FOREIGN KEY (`proposalId`) REFERENCES `proposals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposal_items` ADD CONSTRAINT `proposal_items_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposal_status_history` ADD CONSTRAINT `proposal_status_history_proposalId_proposals_id_fk` FOREIGN KEY (`proposalId`) REFERENCES `proposals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `proposals` ADD CONSTRAINT `proposals_orgId_requesting_orgs_id_fk` FOREIGN KEY (`orgId`) REFERENCES `requesting_orgs`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `publicPriceHistory` ADD CONSTRAINT `publicPriceHistory_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quotation_items` ADD CONSTRAINT `quotation_items_quotationId_quotations_id_fk` FOREIGN KEY (`quotationId`) REFERENCES `quotations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quotation_items` ADD CONSTRAINT `quotation_items_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scrape_errors` ADD CONSTRAINT `scrape_errors_jobId_scrape_jobs_id_fk` FOREIGN KEY (`jobId`) REFERENCES `scrape_jobs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scrape_jobs` ADD CONSTRAINT `scrape_jobs_profileId_scrape_profiles_id_fk` FOREIGN KEY (`profileId`) REFERENCES `scrape_profiles`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scrape_results` ADD CONSTRAINT `scrape_results_jobId_scrape_jobs_id_fk` FOREIGN KEY (`jobId`) REFERENCES `scrape_jobs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scraper_configs` ADD CONSTRAINT `scraper_configs_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scraper_logs` ADD CONSTRAINT `scraper_logs_scraperConfigId_scraper_configs_id_fk` FOREIGN KEY (`scraperConfigId`) REFERENCES `scraper_configs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplier_capture_configs` ADD CONSTRAINT `supplier_capture_configs_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplierConnectors` ADD CONSTRAINT `supplierConnectors_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplier_credentials` ADD CONSTRAINT `supplier_credentials_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplier_imports` ADD CONSTRAINT `supplier_imports_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplier_sessions` ADD CONSTRAINT `supplier_sessions_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_al_source` ON `apiLogs` (`source`);--> statement-breakpoint
CREATE INDEX `idx_al_success` ON `apiLogs` (`success`);--> statement-breakpoint
CREATE INDEX `idx_al_created` ON `apiLogs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_audit_source` ON `auditLog` (`source`);--> statement-breakpoint
CREATE INDEX `idx_audit_action` ON `auditLog` (`action`);--> statement-breakpoint
CREATE INDEX `idx_audit_status` ON `auditLog` (`status`);--> statement-breakpoint
CREATE INDEX `idx_audit_created` ON `auditLog` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_audit_entity` ON `audit_logs` (`entity`);--> statement-breakpoint
CREATE INDEX `idx_audit_entity_id` ON `audit_logs` (`entityId`);--> statement-breakpoint
CREATE INDEX `idx_audit_created` ON `audit_logs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_captured_batches_source_type` ON `captured_product_batches` (`sourceType`);--> statement-breakpoint
CREATE INDEX `idx_captured_batches_status` ON `captured_product_batches` (`status`);--> statement-breakpoint
CREATE INDEX `idx_captured_batches_created` ON `captured_product_batches` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_captured_confidence_product` ON `captured_product_field_confidence` (`capturedProductId`);--> statement-breakpoint
CREATE INDEX `idx_captured_confidence_field` ON `captured_product_field_confidence` (`fieldName`);--> statement-breakpoint
CREATE INDEX `idx_captured_logs_batch` ON `captured_product_source_logs` (`batchId`);--> statement-breakpoint
CREATE INDEX `idx_captured_logs_product` ON `captured_product_source_logs` (`capturedProductId`);--> statement-breakpoint
CREATE INDEX `idx_captured_logs_level` ON `captured_product_source_logs` (`logLevel`);--> statement-breakpoint
CREATE INDEX `idx_captured_products_batch` ON `captured_products` (`batchId`);--> statement-breakpoint
CREATE INDEX `idx_captured_products_match` ON `captured_products` (`matchedProductId`);--> statement-breakpoint
CREATE INDEX `idx_captured_products_status` ON `captured_products` (`status`);--> statement-breakpoint
CREATE INDEX `idx_captured_products_action` ON `captured_products` (`actionSuggestion`);--> statement-breakpoint
CREATE INDEX `idx_captured_products_duplicate` ON `captured_products` (`duplicateSignal`);--> statement-breakpoint
CREATE INDEX `idx_certidoes_validade` ON `certidoes` (`dataValidade`);--> statement-breakpoint
CREATE INDEX `idx_certidoes_tipo` ON `certidoes` (`tipo`);--> statement-breakpoint
CREATE INDEX `idx_certidoes_ativa` ON `certidoes` (`ativa`);--> statement-breakpoint
CREATE INDEX `idx_cnpjevent_config` ON `cnpj_monitor_events` (`configId`);--> statement-breakpoint
CREATE INDEX `idx_cnpjevent_hash` ON `cnpj_monitor_events` (`eventHash`);--> statement-breakpoint
CREATE INDEX `idx_cnpjevent_fonte` ON `cnpj_monitor_events` (`fonte`);--> statement-breakpoint
CREATE INDEX `idx_cnpjevent_read` ON `cnpj_monitor_events` (`readAt`);--> statement-breakpoint
CREATE INDEX `idx_cnpjevent_created` ON `cnpj_monitor_events` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_contract_alerts_contract` ON `contract_alerts` (`contractId`);--> statement-breakpoint
CREATE INDEX `idx_contract_alerts_type` ON `contract_alerts` (`alertType`);--> statement-breakpoint
CREATE INDEX `idx_contract_alerts_status` ON `contract_alerts` (`status`);--> statement-breakpoint
CREATE INDEX `idx_contract_alerts_due` ON `contract_alerts` (`dueDate`);--> statement-breakpoint
CREATE INDEX `idx_contract_balance_contract` ON `contract_balance_movements` (`contractId`);--> statement-breakpoint
CREATE INDEX `idx_contract_balance_type` ON `contract_balance_movements` (`movementType`);--> statement-breakpoint
CREATE INDEX `idx_contract_balance_date` ON `contract_balance_movements` (`movementDate`);--> statement-breakpoint
CREATE INDEX `idx_contract_extensions_contract` ON `contract_extensions` (`contractId`);--> statement-breakpoint
CREATE INDEX `idx_contract_extensions_new_end` ON `contract_extensions` (`newEndDate`);--> statement-breakpoint
CREATE INDEX `idx_contract_reajuste_contract` ON `contract_reajustes` (`contractId`);--> statement-breakpoint
CREATE INDEX `idx_contract_reajuste_date` ON `contract_reajustes` (`reajusteDate`);--> statement-breakpoint
CREATE INDEX `idx_creajuste_contrato` ON `contrato_reajustes` (`contratoId`);--> statement-breakpoint
CREATE INDEX `idx_contrato_proposal` ON `contratos` (`proposalId`);--> statement-breakpoint
CREATE INDEX `idx_dilig_status` ON `diligencia_workflows` (`status`);--> statement-breakpoint
CREATE INDEX `idx_dilig_proposal` ON `diligencia_workflows` (`proposalId`);--> statement-breakpoint
CREATE INDEX `idx_dilig_org` ON `diligencia_workflows` (`orgId`);--> statement-breakpoint
CREATE INDEX `idx_dilig_prazo` ON `diligencia_workflows` (`prazoResposta`);--> statement-breakpoint
CREATE INDEX `idx_doc_tipo` ON `documentos_habilitacao` (`tipo`);--> statement-breakpoint
CREATE INDEX `idx_doc_vencimento` ON `documentos_habilitacao` (`dataVencimento`);--> statement-breakpoint
CREATE INDEX `idx_doc_status` ON `documentos_habilitacao` (`statusValidade`);--> statement-breakpoint
CREATE INDEX `idx_duplicate_results_run` ON `duplicate_detection_results` (`runId`);--> statement-breakpoint
CREATE INDEX `idx_duplicate_results_primary` ON `duplicate_detection_results` (`primaryProductId`);--> statement-breakpoint
CREATE INDEX `idx_duplicate_results_secondary` ON `duplicate_detection_results` (`secondaryProductId`);--> statement-breakpoint
CREATE INDEX `idx_duplicate_results_classification` ON `duplicate_detection_results` (`classification`);--> statement-breakpoint
CREATE INDEX `idx_duplicate_results_score` ON `duplicate_detection_results` (`score`);--> statement-breakpoint
CREATE INDEX `idx_duplicate_runs_status` ON `duplicate_detection_runs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_duplicate_runs_user` ON `duplicate_detection_runs` (`triggeredByUserId`);--> statement-breakpoint
CREATE INDEX `idx_duplicate_runs_created` ON `duplicate_detection_runs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_duplicate_history_result` ON `duplicate_merge_history` (`resultId`);--> statement-breakpoint
CREATE INDEX `idx_duplicate_history_primary` ON `duplicate_merge_history` (`primaryProductId`);--> statement-breakpoint
CREATE INDEX `idx_duplicate_history_secondary` ON `duplicate_merge_history` (`secondaryProductId`);--> statement-breakpoint
CREATE INDEX `idx_duplicate_history_action` ON `duplicate_merge_history` (`action`);--> statement-breakpoint
CREATE INDEX `idx_edital_status` ON `edital_analyses` (`status`);--> statement-breakpoint
CREATE INDEX `idx_edital_created` ON `edital_analyses` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_email_quotation_items_quotation` ON `email_quotation_items` (`quotationId`);--> statement-breakpoint
CREATE INDEX `idx_email_quotation_items_produto` ON `email_quotation_items` (`produtoMatchId`);--> statement-breakpoint
CREATE INDEX `idx_email_quotation_items_catalogo` ON `email_quotation_items` (`codigoCatalogo`);--> statement-breakpoint
CREATE INDEX `idx_email_quotations_status` ON `email_quotations` (`status`);--> statement-breakpoint
CREATE INDEX `idx_email_quotations_received` ON `email_quotations` (`receivedAt`);--> statement-breakpoint
CREATE INDEX `idx_email_quotations_from` ON `email_quotations` (`fromAddress`);--> statement-breakpoint
CREATE INDEX `idx_email_quotations_prazo` ON `email_quotations` (`prazoResposta`);--> statement-breakpoint
CREATE INDEX `idx_email_quotations_resultado` ON `email_quotations` (`resultado`);--> statement-breakpoint
CREATE INDEX `idx_enrichment_history_source` ON `enrichment_history` (`source`);--> statement-breakpoint
CREATE INDEX `idx_enrichment_history_status` ON `enrichment_history` (`status`);--> statement-breakpoint
CREATE INDEX `idx_enrichment_history_created` ON `enrichment_history` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_enrichment_results_execution` ON `enrichment_results` (`executionId`);--> statement-breakpoint
CREATE INDEX `idx_enrichment_results_product` ON `enrichment_results` (`productId`);--> statement-breakpoint
CREATE INDEX `idx_enrichment_results_status` ON `enrichment_results` (`status`);--> statement-breakpoint
CREATE INDEX `idx_equiv_product` ON `equivalence_members` (`productId`);--> statement-breakpoint
CREATE INDEX `idx_eq_result_session` ON `equivalenceResults` (`sessionId`);--> statement-breakpoint
CREATE INDEX `idx_eq_result_candidate` ON `equivalenceResults` (`candidateProductId`);--> statement-breakpoint
CREATE INDEX `idx_eq_result_status` ON `equivalenceResults` (`status`);--> statement-breakpoint
CREATE INDEX `idx_estoque_product` ON `estoque` (`productId`);--> statement-breakpoint
CREATE INDEX `idx_ereserva_proposal` ON `estoque_reservas` (`proposalId`);--> statement-breakpoint
CREATE INDEX `idx_ereserva_product` ON `estoque_reservas` (`productId`);--> statement-breakpoint
CREATE INDEX `idx_exec_factors_decision` ON `executive_decision_factors` (`decisionId`);--> statement-breakpoint
CREATE INDEX `idx_exec_factors_key` ON `executive_decision_factors` (`factorKey`);--> statement-breakpoint
CREATE INDEX `idx_exec_factors_impact` ON `executive_decision_factors` (`impact`);--> statement-breakpoint
CREATE INDEX `idx_exec_decisions_proposal` ON `executive_decisions` (`proposalId`);--> statement-breakpoint
CREATE INDEX `idx_exec_decisions_org` ON `executive_decisions` (`orgId`);--> statement-breakpoint
CREATE INDEX `idx_exec_decisions_recommendation` ON `executive_decisions` (`recommendation`);--> statement-breakpoint
CREATE INDEX `idx_exec_decisions_score` ON `executive_decisions` (`totalScore`);--> statement-breakpoint
CREATE INDEX `idx_ext_attr_product` ON `extractedAttributes` (`productId`);--> statement-breakpoint
CREATE INDEX `idx_ext_attr_attribute` ON `extractedAttributes` (`attribute`);--> statement-breakpoint
CREATE INDEX `idx_ext_attr_product_attr` ON `extractedAttributes` (`productId`,`attribute`);--> statement-breakpoint
CREATE INDEX `idx_fentries_type` ON `financial_entries` (`type`);--> statement-breakpoint
CREATE INDEX `idx_fentries_proposal` ON `financial_entries` (`proposalId`);--> statement-breakpoint
CREATE INDEX `idx_fentries_paid` ON `financial_entries` (`isPaid`);--> statement-breakpoint
CREATE INDEX `idx_govitem_licid` ON `gov_licitation_items` (`govLicitationId`);--> statement-breakpoint
CREATE INDEX `idx_govitem_product` ON `gov_licitation_items` (`matchedProductId`);--> statement-breakpoint
CREATE INDEX `idx_govlic_extid` ON `gov_licitations` (`externalId`);--> statement-breakpoint
CREATE INDEX `idx_govlic_datapub` ON `gov_licitations` (`dataPublicacao`);--> statement-breakpoint
CREATE INDEX `idx_govlic_uasg` ON `gov_licitations` (`uasg`);--> statement-breakpoint
CREATE INDEX `idx_govpart_licid` ON `gov_participation_history` (`govLicitationId`);--> statement-breakpoint
CREATE INDEX `idx_govpart_status` ON `gov_participation_history` (`status`);--> statement-breakpoint
CREATE INDEX `idx_ialh_productId` ON `image_auto_link_history` (`productId`);--> statement-breakpoint
CREATE INDEX `idx_ialh_matchScore` ON `image_auto_link_history` (`matchScore`);--> statement-breakpoint
CREATE INDEX `idx_ialh_status` ON `image_auto_link_history` (`status`);--> statement-breakpoint
CREATE INDEX `idx_ialh_importBatchId` ON `image_auto_link_history` (`importBatchId`);--> statement-breakpoint
CREATE INDEX `idx_kwconfig_ativo` ON `keyword_monitor_config` (`ativo`);--> statement-breakpoint
CREATE INDEX `idx_kwconfig_keyword` ON `keyword_monitor_config` (`keyword`);--> statement-breakpoint
CREATE INDEX `idx_kwevent_config` ON `keyword_monitor_events` (`configId`);--> statement-breakpoint
CREATE INDEX `idx_kwevent_keyword` ON `keyword_monitor_events` (`keyword`);--> statement-breakpoint
CREATE INDEX `idx_kwevent_status` ON `keyword_monitor_events` (`status`);--> statement-breakpoint
CREATE INDEX `idx_kwevent_encerramento` ON `keyword_monitor_events` (`dataEncerramento`);--> statement-breakpoint
CREATE INDEX `idx_kwevent_created` ON `keyword_monitor_events` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_licit_proposal` ON `licitacao_resultados` (`proposalId`);--> statement-breakpoint
CREATE INDEX `idx_licit_status` ON `licitacoes_descobertas` (`status`);--> statement-breakpoint
CREATE INDEX `idx_licit_encerramento` ON `licitacoes_descobertas` (`dataEncerramento`);--> statement-breakpoint
CREATE INDEX `idx_licit_orgao` ON `licitacoes_descobertas` (`cnpjOrgao`);--> statement-breakpoint
CREATE INDEX `idx_licit_created` ON `licitacoes_descobertas` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_master_name` ON `master_products` (`name`);--> statement-breakpoint
CREATE INDEX `idx_master_ean` ON `master_products` (`ean`);--> statement-breakpoint
CREATE INDEX `idx_master_mapa` ON `master_products` (`codigoMapa`);--> statement-breakpoint
CREATE INDEX `idx_master_ingredient` ON `master_products` (`activeIngredient`);--> statement-breakpoint
CREATE INDEX `idx_mfb_term` ON `match_feedback` (`editalTerm`);--> statement-breakpoint
CREATE INDEX `idx_mfb_product` ON `match_feedback` (`productId`);--> statement-breakpoint
CREATE INDEX `idx_mfbv2_edital` ON `match_feedback_v2` (`editalItem`);--> statement-breakpoint
CREATE INDEX `idx_mfbv2_produto` ON `match_feedback_v2` (`produtoEscolhidoId`);--> statement-breakpoint
CREATE INDEX `idx_mfbv2_acao` ON `match_feedback_v2` (`acao`);--> statement-breakpoint
CREATE INDEX `idx_mfbv2_created` ON `match_feedback_v2` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_mlog_edital` ON `match_logs` (`editalItem`);--> statement-breakpoint
CREATE INDEX `idx_mlog_produto` ON `match_logs` (`produtoSugeridoId`);--> statement-breakpoint
CREATE INDEX `idx_mlog_score` ON `match_logs` (`score`);--> statement-breakpoint
CREATE INDEX `idx_mlog_decisao` ON `match_logs` (`decisao`);--> statement-breakpoint
CREATE INDEX `idx_mlog_created` ON `match_logs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_org_history_org` ON `org_history_events` (`orgId`);--> statement-breakpoint
CREATE INDEX `idx_org_history_type` ON `org_history_events` (`eventType`);--> statement-breakpoint
CREATE INDEX `idx_org_history_created` ON `org_history_events` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_portal_credentials_portal` ON `portal_credentials` (`portal`);--> statement-breakpoint
CREATE INDEX `idx_portal_credentials_ativo` ON `portal_credentials` (`ativo`);--> statement-breakpoint
CREATE INDEX `idx_post_award_contract_proposal` ON `post_award_contracts` (`proposalId`);--> statement-breakpoint
CREATE INDEX `idx_post_award_contract_org` ON `post_award_contracts` (`orgId`);--> statement-breakpoint
CREATE INDEX `idx_post_award_contract_status` ON `post_award_contracts` (`status`);--> statement-breakpoint
CREATE INDEX `idx_post_award_contract_end_date` ON `post_award_contracts` (`endDate`);--> statement-breakpoint
CREATE INDEX `idx_ph_product` ON `price_history` (`productId`);--> statement-breakpoint
CREATE INDEX `idx_ph_supplier` ON `price_history` (`supplierId`);--> statement-breakpoint
CREATE INDEX `idx_ph_recorded` ON `price_history` (`recordedAt`);--> statement-breakpoint
CREATE INDEX `idx_pimg_product` ON `product_images` (`productId`);--> statement-breakpoint
CREATE INDEX `idx_pimg_hash` ON `product_images` (`fileHash`);--> statement-breakpoint
CREATE INDEX `idx_pso_productId` ON `product_supplier_offers` (`productId`);--> statement-breakpoint
CREATE INDEX `idx_pso_supplierId` ON `product_supplier_offers` (`supplierId`);--> statement-breakpoint
CREATE INDEX `idx_pso_price` ON `product_supplier_offers` (`price`);--> statement-breakpoint
CREATE INDEX `idx_psp_product` ON `product_supplier_prices` (`productId`);--> statement-breakpoint
CREATE INDEX `idx_psp_supplier` ON `product_supplier_prices` (`supplierId`);--> statement-breakpoint
CREATE INDEX `idx_products_supplier` ON `products` (`supplierId`);--> statement-breakpoint
CREATE INDEX `idx_products_category` ON `products` (`categoryId`);--> statement-breakpoint
CREATE INDEX `idx_products_active_ingredient` ON `products` (`activeIngredient`);--> statement-breakpoint
CREATE INDEX `idx_products_name` ON `products` (`name`);--> statement-breakpoint
CREATE INDEX `idx_products_is_active` ON `products` (`isActive`);--> statement-breakpoint
CREATE INDEX `idx_products_manufacturer` ON `products` (`manufacturer`);--> statement-breakpoint
CREATE INDEX `idx_products_ean` ON `products` (`ean`);--> statement-breakpoint
CREATE INDEX `idx_products_catmas` ON `products` (`catmasCode`);--> statement-breakpoint
CREATE INDEX `idx_products_catmat` ON `products` (`catmatCode`);--> statement-breakpoint
CREATE INDEX `idx_products_gtin` ON `products` (`gtin`);--> statement-breakpoint
CREATE INDEX `idx_products_barcode` ON `products` (`barcode`);--> statement-breakpoint
CREATE INDEX `idx_products_mapa` ON `products` (`mapa`);--> statement-breakpoint
CREATE INDEX `idx_products_created_at` ON `products` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_products_code` ON `products` (`code`);--> statement-breakpoint
CREATE INDEX `idx_products_active_cat` ON `products` (`isActive`,`categoryId`);--> statement-breakpoint
CREATE INDEX `idx_products_active_mfr` ON `products` (`isActive`,`manufacturer`);--> statement-breakpoint
CREATE INDEX `idx_products_active_ficha` ON `products` (`isActive`,`fichaTecnica`);--> statement-breakpoint
CREATE INDEX `idx_products_active_name` ON `products` (`isActive`,`name`);--> statement-breakpoint
CREATE INDEX `idx_products_supplier_name` ON `products` (`supplierId`,`name`);--> statement-breakpoint
CREATE INDEX `idx_products_tipoCatalogo` ON `products` (`tipoCatalogo`);--> statement-breakpoint
CREATE INDEX `idx_products_statusConfiabilidade` ON `products` (`statusConfiabilidade`);--> statement-breakpoint
CREATE INDEX `idx_pdecl_proposal` ON `proposal_declarations` (`proposalId`);--> statement-breakpoint
CREATE INDEX `idx_pitems_proposal` ON `proposal_items` (`proposalId`);--> statement-breakpoint
CREATE INDEX `idx_psh_proposal` ON `proposal_status_history` (`proposalId`);--> statement-breakpoint
CREATE INDEX `idx_ptpl_orgtype` ON `proposal_templates` (`orgType`);--> statement-breakpoint
CREATE INDEX `idx_ptpl_default` ON `proposal_templates` (`isDefault`);--> statement-breakpoint
CREATE INDEX `idx_pph_product` ON `publicPriceHistory` (`productId`);--> statement-breakpoint
CREATE INDEX `idx_pph_catmat` ON `publicPriceHistory` (`catmatCode`);--> statement-breakpoint
CREATE INDEX `idx_pph_uf` ON `publicPriceHistory` (`uf`);--> statement-breakpoint
CREATE INDEX `idx_pph_date` ON `publicPriceHistory` (`publicationDate`);--> statement-breakpoint
CREATE INDEX `idx_pph_source` ON `publicPriceHistory` (`source`);--> statement-breakpoint
CREATE INDEX `idx_qitems_quotation` ON `quotation_items` (`quotationId`);--> statement-breakpoint
CREATE INDEX `idx_rk_area` ON `radarKeywords` (`areaId`);--> statement-breakpoint
CREATE INDEX `idx_rk_type` ON `radarKeywords` (`type`);--> statement-breakpoint
CREATE INDEX `idx_ro_area` ON `radarOpportunities` (`areaId`);--> statement-breakpoint
CREATE INDEX `idx_ro_fonte` ON `radarOpportunities` (`fonte`);--> statement-breakpoint
CREATE INDEX `idx_ro_uf` ON `radarOpportunities` (`uf`);--> statement-breakpoint
CREATE INDEX `idx_ro_score` ON `radarOpportunities` (`scoreRelevancia`);--> statement-breakpoint
CREATE INDEX `idx_ro_data` ON `radarOpportunities` (`dataPublicacao`);--> statement-breakpoint
CREATE INDEX `idx_ro_pncp` ON `radarOpportunities` (`pncpId`);--> statement-breakpoint
CREATE INDEX `idx_ro_hash` ON `radarOpportunities` (`contentHash`);--> statement-breakpoint
CREATE INDEX `idx_ro_new` ON `radarOpportunities` (`isNew`);--> statement-breakpoint
CREATE INDEX `idx_rs_uf` ON `radarSources` (`uf`);--> statement-breakpoint
CREATE INDEX `idx_rs_tipo` ON `radarSources` (`tipoEntidade`);--> statement-breakpoint
CREATE INDEX `idx_rs_prioridade` ON `radarSources` (`prioridade`);--> statement-breakpoint
CREATE INDEX `idx_rs_canal` ON `radarSources` (`canalPrimario`);--> statement-breakpoint
CREATE INDEX `idx_rsl_status` ON `radarSyncLogs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_rsl_started` ON `radarSyncLogs` (`startedAt`);--> statement-breakpoint
CREATE INDEX `idx_senr_product` ON `scrape_enrichment_log` (`productId`);--> statement-breakpoint
CREATE INDEX `idx_senr_job` ON `scrape_enrichment_log` (`jobId`);--> statement-breakpoint
CREATE INDEX `idx_senr_campo` ON `scrape_enrichment_log` (`campo`);--> statement-breakpoint
CREATE INDEX `idx_serr_job` ON `scrape_errors` (`jobId`);--> statement-breakpoint
CREATE INDEX `idx_serr_created` ON `scrape_errors` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_sjob_profile` ON `scrape_jobs` (`profileId`);--> statement-breakpoint
CREATE INDEX `idx_sjob_supplier` ON `scrape_jobs` (`supplierId`);--> statement-breakpoint
CREATE INDEX `idx_sjob_status` ON `scrape_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_sjob_tipo` ON `scrape_jobs` (`tipo`);--> statement-breakpoint
CREATE INDEX `idx_sjob_created` ON `scrape_jobs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_sprof_supplier` ON `scrape_profiles` (`supplierId`);--> statement-breakpoint
CREATE INDEX `idx_sprof_active` ON `scrape_profiles` (`isActive`);--> statement-breakpoint
CREATE INDEX `idx_sres_job` ON `scrape_results` (`jobId`);--> statement-breakpoint
CREATE INDEX `idx_sres_product` ON `scrape_results` (`productId`);--> statement-breakpoint
CREATE INDEX `idx_sres_status` ON `scrape_results` (`status`);--> statement-breakpoint
CREATE INDEX `idx_sres_origem` ON `scrape_results` (`origem`);--> statement-breakpoint
CREATE INDEX `idx_sc_supplier` ON `supplierConnectors` (`supplierId`);--> statement-breakpoint
CREATE INDEX `idx_sc_active` ON `supplierConnectors` (`isActive`);--> statement-breakpoint
CREATE INDEX `idx_supplier_imports_supplier` ON `supplier_imports` (`supplierId`);--> statement-breakpoint
CREATE INDEX `idx_supplier_imports_status` ON `supplier_imports` (`status`);--> statement-breakpoint
CREATE INDEX `idx_sr_source` ON `syncRuns` (`source`);--> statement-breakpoint
CREATE INDEX `idx_sr_status` ON `syncRuns` (`status`);--> statement-breakpoint
CREATE INDEX `idx_sr_started` ON `syncRuns` (`startedAt`);--> statement-breakpoint
CREATE INDEX `idx_synonym_term` ON `synonyms` (`term`);--> statement-breakpoint
CREATE INDEX `idx_synonym_canonical` ON `synonyms` (`canonical`);