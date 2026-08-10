-- Hardening do catálogo canônico.
-- O produto passa a existir independentemente de fornecedor; fornecedores são
-- relacionados exclusivamente pelas ofertas. DDL pertence à migração, nunca ao
-- processo web.

ALTER TABLE `products`
  DROP FOREIGN KEY `products_supplierId_suppliers_id_fk`;
--> statement-breakpoint

ALTER TABLE `products`
  MODIFY COLUMN `supplierId` INT NULL;
--> statement-breakpoint

ALTER TABLE `products`
  ADD CONSTRAINT `fk_products_supplier_nullable`
  FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE SET NULL;
--> statement-breakpoint

-- Converte custos ainda existentes apenas no registro legado em ofertas
-- canônicas, sem duplicar pares já migrados.
INSERT INTO `product_supplier_offers`
  (`productId`, `supplierId`, `price`, `supplierCode`, `link`, `updatedAt`)
SELECT
  p.`id`,
  p.`supplierId`,
  p.`price`,
  p.`codigoFornecedor`,
  p.`productUrl`,
  COALESCE(p.`updatedAt`, CURRENT_TIMESTAMP)
FROM `products` p
LEFT JOIN `product_supplier_offers` o
  ON o.`productId` = p.`id`
 AND o.`supplierId` = p.`supplierId`
WHERE p.`supplierId` IS NOT NULL
  AND p.`price` IS NOT NULL
  AND p.`price` > 0
  AND o.`id` IS NULL;
--> statement-breakpoint

-- Normalização conservadora: só preenche aliases vazios.
UPDATE `products`
SET
  `ean` = COALESCE(NULLIF(TRIM(`ean`), ''), NULLIF(TRIM(`gtin`), ''), NULLIF(TRIM(`barcode`), '')),
  `gtin` = COALESCE(NULLIF(TRIM(`gtin`), ''), NULLIF(TRIM(`ean`), ''), NULLIF(TRIM(`barcode`), '')),
  `barcode` = COALESCE(NULLIF(TRIM(`barcode`), ''), NULLIF(TRIM(`gtin`), ''), NULLIF(TRIM(`ean`), '')),
  `nomeProduto` = COALESCE(NULLIF(TRIM(`nomeProduto`), ''), `name`),
  `laboratorio` = COALESCE(NULLIF(TRIM(`laboratorio`), ''), NULLIF(TRIM(`manufacturer`), '')),
  `manufacturer` = COALESCE(NULLIF(TRIM(`manufacturer`), ''), NULLIF(TRIM(`laboratorio`), ''))
WHERE
  `ean` IS NULL OR TRIM(`ean`) = '' OR
  `gtin` IS NULL OR TRIM(`gtin`) = '' OR
  `barcode` IS NULL OR TRIM(`barcode`) = '' OR
  `nomeProduto` IS NULL OR TRIM(`nomeProduto`) = '' OR
  `laboratorio` IS NULL OR TRIM(`laboratorio`) = '' OR
  `manufacturer` IS NULL OR TRIM(`manufacturer`) = '';
--> statement-breakpoint

-- products.price permanece apenas como cache de compatibilidade do menor custo.
UPDATE `products` p
LEFT JOIN (
  SELECT
    `productId`,
    MIN(
      CASE
        WHEN `promoPrice` IS NOT NULL
          AND `promoPrice` > 0
          AND (`price` IS NULL OR `promoPrice` < `price`)
          THEN `promoPrice`
        WHEN `price` IS NOT NULL AND `price` > 0
          THEN `price`
        ELSE NULL
      END
    ) AS `bestPrice`
  FROM `product_supplier_offers`
  GROUP BY `productId`
) best ON best.`productId` = p.`id`
SET p.`price` = best.`bestPrice`
WHERE NOT (p.`price` <=> best.`bestPrice`);
