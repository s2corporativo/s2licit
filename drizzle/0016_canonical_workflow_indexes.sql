CREATE INDEX `idx_funil_processo_orgao` ON `funil_oportunidades` (`numeroProcesso`, `orgao`);--> statement-breakpoint
CREATE INDEX `idx_proposals_process_org` ON `proposals` (`processNumber`, `orgName`);--> statement-breakpoint
CREATE INDEX `idx_proposals_radar_opportunity` ON `proposals` (`radarOpportunityId`);