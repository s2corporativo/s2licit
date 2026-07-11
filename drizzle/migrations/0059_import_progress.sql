-- Progresso de jobs de importação, persistido para sobreviver a restart.
CREATE TABLE IF NOT EXISTS `import_progress` (
  `queueId` varchar(64) NOT NULL,
  `status` varchar(32),
  `progressJson` text NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `import_progress_queueId` PRIMARY KEY(`queueId`)
);
