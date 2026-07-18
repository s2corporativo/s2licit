DROP TABLE `auditLog`;--> statement-breakpoint
ALTER TABLE `products` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `products` ADD `mergedIntoId` int;