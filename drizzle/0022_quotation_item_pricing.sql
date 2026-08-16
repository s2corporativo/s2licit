CREATE TABLE IF NOT EXISTS `quotation_item_pricing` (
  `itemId` int NOT NULL,
  `salePrice` decimal(15,4) DEFAULT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`itemId`),
  CONSTRAINT `fk_quotation_item_pricing_item`
    FOREIGN KEY (`itemId`) REFERENCES `email_quotation_items` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;