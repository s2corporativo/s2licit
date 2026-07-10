-- Tabela: product_capture_history
-- Histórico de captura de dados de produtos com rastreamento de mudanças, origem e status de aprovação
CREATE TABLE IF NOT EXISTS `product_capture_history` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `productId` int NOT NULL,
  `supplierId` int NOT NULL,
  `fieldChanged` varchar(128) NOT NULL,
  `valueBefore` text,
  `valueAfter` text,
  `changeSource` enum('manual', 'validated', 'captured', 'system') NOT NULL DEFAULT 'captured',
  `status` enum('detected', 'approved', 'applied', 'rejected') NOT NULL DEFAULT 'detected',
  `approvedBy` int,
  `approvedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_product_capture_productId` (`productId`),
  KEY `idx_product_capture_supplierId` (`supplierId`),
  KEY `idx_product_capture_status` (`status`),
  KEY `idx_product_capture_changeSource` (`changeSource`),
  KEY `idx_product_capture_approvedBy` (`approvedBy`),
  KEY `idx_product_capture_createdAt` (`createdAt`),
  CONSTRAINT `product_capture_history_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `product_capture_history_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `product_capture_history_approvedBy_users_id_fk` FOREIGN KEY (`approvedBy`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
