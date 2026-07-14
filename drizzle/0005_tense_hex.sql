ALTER TABLE `products` ADD `viaAdministracao` varchar(128);--> statement-breakpoint
ALTER TABLE `products` ADD `validadeMeses` int;--> statement-breakpoint
ALTER TABLE `scraper_configs` ADD `customSelectors` json;