CREATE TABLE IF NOT EXISTS `edital_proposal_keys` (
  `dedupeKey` varchar(64) NOT NULL,
  `proposalId` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completedAt` timestamp NULL,
  PRIMARY KEY (`dedupeKey`),
  UNIQUE KEY `uq_edital_proposal_keys_proposal` (`proposalId`),
  CONSTRAINT `edital_proposal_keys_proposal_fk`
    FOREIGN KEY (`proposalId`) REFERENCES `proposals`(`id`)
    ON DELETE SET NULL ON UPDATE NO ACTION
);