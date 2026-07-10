-- Tabela: documentos_habilitacao
CREATE TABLE IF NOT EXISTS `documentos_habilitacao` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `tipo` varchar(64) NOT NULL,
  `nome` varchar(256) NOT NULL,
  `fileUrl` varchar(512),
  `fileKey` varchar(256),
  `dataEmissao` varchar(16),
  `dataVencimento` varchar(16),
  `statusValidade` varchar(32) NOT NULL DEFAULT 'sem_data',
  `notas` text,
  `orgaoEmissor` varchar(128),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_doc_tipo` (`tipo`),
  KEY `idx_doc_vencimento` (`dataVencimento`),
  KEY `idx_doc_status` (`statusValidade`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela: diligencia_workflows
CREATE TABLE IF NOT EXISTS `diligencia_workflows` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
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
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_dilig_status` (`status`),
  KEY `idx_dilig_proposal` (`proposalId`),
  KEY `idx_dilig_org` (`orgId`),
  KEY `idx_dilig_prazo` (`prazoResposta`),
  CONSTRAINT `diligencia_workflows_proposalId_proposals_id_fk` FOREIGN KEY (`proposalId`) REFERENCES `proposals` (`id`) ON DELETE SET NULL,
  CONSTRAINT `diligencia_workflows_orgId_requesting_orgs_id_fk` FOREIGN KEY (`orgId`) REFERENCES `requesting_orgs` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
