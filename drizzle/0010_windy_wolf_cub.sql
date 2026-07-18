CREATE TABLE `email_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`imapHost` varchar(256),
	`imapPort` int,
	`imapUser` varchar(320),
	`imapPasswordEnc` text,
	`imapTls` boolean NOT NULL DEFAULT true,
	`imapMailbox` varchar(128),
	`smtpHost` varchar(256),
	`smtpPort` int,
	`smtpUser` varchar(320),
	`smtpPasswordEnc` text,
	`smtpSecure` boolean NOT NULL DEFAULT false,
	`smtpFrom` varchar(320),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `email_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `scraper_configs` ADD `tosAprovado` boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `scraper_configs` SET `tosAprovado` = true;
