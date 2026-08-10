CREATE TABLE IF NOT EXISTS `proposal_email_dispatches` (
  `proposalId` int NOT NULL,
  `dispatchToken` varchar(64) NOT NULL,
  `recipient` varchar(320) NOT NULL,
  `subject` varchar(256) NOT NULL,
  `state` varchar(32) NOT NULL,
  `messageId` varchar(512) NULL,
  `lastError` text NULL,
  `requestedBy` varchar(128) NULL,
  `sendingAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `smtpAcceptedAt` timestamp NULL,
  `completedAt` timestamp NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`proposalId`),
  UNIQUE KEY `uq_proposal_email_dispatch_token` (`dispatchToken`),
  KEY `idx_proposal_email_dispatch_state` (`state`, `updatedAt`),
  CONSTRAINT `proposal_email_dispatch_proposal_fk`
    FOREIGN KEY (`proposalId`) REFERENCES `proposals`(`id`)
    ON DELETE CASCADE ON UPDATE NO ACTION
);