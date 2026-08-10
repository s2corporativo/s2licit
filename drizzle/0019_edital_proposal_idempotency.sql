ALTER TABLE `proposals` ADD COLUMN `editalDedupeKey` varchar(64) GENERATED ALWAYS AS (
  CASE
    WHEN `origem` = 'edital' AND `processNumber` IS NOT NULL AND `orgName` IS NOT NULL
      THEN SHA2(CONCAT(TRIM(`processNumber`), '||', TRIM(`orgName`)), 256)
    ELSE NULL
  END
) STORED;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_proposals_edital_dedupe` ON `proposals` (`editalDedupeKey`);