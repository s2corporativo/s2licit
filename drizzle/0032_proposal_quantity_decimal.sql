-- Quantidade comercial deve preservar frações sem arredondamento silencioso.
-- Conversão de INT para DECIMAL(15,4) preserva integralmente os dados existentes.
ALTER TABLE `proposal_items`
  MODIFY COLUMN `quantity` DECIMAL(15,4) NOT NULL DEFAULT 1.0000;
