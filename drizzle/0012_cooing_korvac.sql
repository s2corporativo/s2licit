CREATE TABLE `integration_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`chave` varchar(64) NOT NULL,
	`valorEnc` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `integration_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_integration_chave` UNIQUE(`chave`)
);
