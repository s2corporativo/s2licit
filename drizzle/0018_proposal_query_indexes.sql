CREATE INDEX `idx_pitems_proposal_item` ON `proposal_items` (`proposalId`, `itemNumber`);--> statement-breakpoint
CREATE INDEX `idx_proposals_org_name` ON `proposals` (`orgName`);