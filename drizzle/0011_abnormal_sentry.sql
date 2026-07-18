CREATE TABLE `ai_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`aiProvider` varchar(16),
	`anthropicApiKeyEnc` text,
	`anthropicModel` varchar(128),
	`groqApiKeyEnc` text,
	`groqModel` varchar(128),
	`forgeApiUrl` varchar(512),
	`forgeApiKeyEnc` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_settings_id` PRIMARY KEY(`id`)
);
