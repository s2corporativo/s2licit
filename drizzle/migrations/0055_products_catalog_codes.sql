-- Códigos de catálogo governamental para matching determinístico de cotações.
-- CATMAS = Catálogo de Materiais e Serviços do Estado de MG (Compras MG).
-- CATMAT = Catálogo de Materiais federal (Compras.gov.br).
ALTER TABLE `products` ADD COLUMN `catmasCode` VARCHAR(32) NULL;
ALTER TABLE `products` ADD COLUMN `catmatCode` VARCHAR(32) NULL;
CREATE INDEX `idx_products_catmas` ON `products` (`catmasCode`);
CREATE INDEX `idx_products_catmat` ON `products` (`catmatCode`);
