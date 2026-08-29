-- Preserva quantidades fracionárias recebidas em cotações e editais.
-- Widening de INT -> DECIMAL é não destrutivo para os valores inteiros existentes.
ALTER TABLE `proposal_items`
  MODIFY COLUMN `quantity` DECIMAL(15,4) NOT NULL DEFAULT 1.0000;
