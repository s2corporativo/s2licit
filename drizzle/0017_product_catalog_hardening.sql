-- Hardening do catálogo canônico.
-- O produto passa a existir independentemente de fornecedor; fornecedores são
-- relacionados exclusivamente pelas ofertas. DDL pertence à migração, nunca ao
-- processo web.

-- O nome da FK histórica pode variar conforme a versão que criou o banco.
SET @products_supplier_fk = NULL;
--> statement-breakpoint

SELECT `CONSTRAINT_NAME`
INTO @products_supplier_fk
FROM `information_schema`.`KEY_COLUMN_USAGE`
WHERE `TABLE_SCHEMA` = DATABASE()
  AND `TABLE_NAME` = 'products'
  AND `COLUMN_NAME` = 'supplierId'
  AND `REFERENCED_TABLE_NAME` = 'suppliers'
LIMIT 1;
--> statement-breakpoint

SET @drop_products_supplier_fk = IF(
  @products_supplier_fk IS NULL,
  'SELECT 1',
  CONCAT('ALTER TABLE `products` DROP FOREIGN KEY `', REPLACE(@products_supplier_fk, '`', '``'), '`')
);
--> statement-breakpoint

PREPARE drop_products_supplier_fk_stmt FROM @drop_products_supplier_fk;
--> statement-breakpoint
EXECUTE drop_products_supplier_fk_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE drop_products_supplier_fk_stmt;
--> statement-breakpoint

ALTER TABLE `products`
  MODIFY COLUMN `supplierId` INT NULL;
--> statement-breakpoint

ALTER TABLE `products`
  ADD CONSTRAINT `fk_products_supplier_nullable`
  FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE SET NULL;
--> statement-breakpoint

-- Preserva TODA relação histórica Produto × Fornecedor antes de transformar
-- supplierId em mero cache de compatibilidade. Preço pode ser NULL.
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

-- Cache de compatibilidade para consumidores antigos:
-- products.price = melhor custo; products.supplierId = fornecedor da MESMA oferta.
-- Sem oferta com preço válido, ambos ficam NULL. A relação histórica continua
-- preservada em product_supplier_offers.
UPDATE `products` p
LEFT JOIN (
  SELECT ranked.`productId`, ranked.`supplierId`, ranked.`bestPrice`
  FROM (
    SELECT
      o.`id`,
      o.`productId`,
      o.`supplierId`,
      CASE
        WHEN o.`promoPrice` IS NOT NULL
          AND o.`promoPrice` > 0
          AND (o.`price` IS NULL OR o.`promoPrice` < o.`price`)
          THEN o.`promoPrice`
        WHEN o.`price` IS NOT NULL AND o.`price` > 0
          THEN o.`price`
        ELSE NULL
      END AS `bestPrice`,
      ROW_NUMBER() OVER (
        PARTITION BY o.`productId`
        ORDER BY
          CASE
            WHEN o.`promoPrice` IS NOT NULL
              AND o.`promoPrice` > 0
              AND (o.`price` IS NULL OR o.`promoPrice` < o.`price`)
              THEN o.`promoPrice`
            WHEN o.`price` IS NOT NULL AND o.`price` > 0
              THEN o.`price`
            ELSE NULL
          END ASC,
          o.`updatedAt` DESC,
          o.`id` ASC
      ) AS `rn`
    FROM `product_supplier_offers` o
    WHERE
      (o.`promoPrice` IS NOT NULL AND o.`promoPrice` > 0)
      OR (o.`price` IS NOT NULL AND o.`price` > 0)
  ) ranked
  WHERE ranked.`rn` = 1 AND ranked.`bestPrice` IS NOT NULL
) best ON best.`productId` = p.`id`
SET
  p.`price` = best.`bestPrice`,
  p.`supplierId` = best.`supplierId`
WHERE
  NOT (p.`price` <=> best.`bestPrice`)
  OR NOT (p.`supplierId` <=> best.`supplierId`);
