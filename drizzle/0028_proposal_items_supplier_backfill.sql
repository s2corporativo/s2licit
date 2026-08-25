-- Migration 0028 — backfill conservador de supplierId em proposal_items
--
-- A migration 0025 já adicionou a FK supplierId na main. Esta migration NÃO
-- reescreve 0025: apenas recupera o backfill que ficou fora da integração.
--
-- Segurança:
-- - só preenche linhas ainda sem supplierId;
-- - preserva supplierName original;
-- - só vincula quando o nome normalizado (TRIM + LOWER) corresponde a UM único
--   fornecedor cadastrado;
-- - não cria fornecedores e não sobrescreve vínculos existentes;
-- - reexecução é idempotente.

UPDATE `proposal_items` pi
JOIN (
  SELECT
    LOWER(TRIM(`name`)) AS `normalizedName`,
    MIN(`id`) AS `supplierId`
  FROM `suppliers`
  WHERE `name` IS NOT NULL AND TRIM(`name`) <> ''
  GROUP BY LOWER(TRIM(`name`))
  HAVING COUNT(*) = 1
) s ON LOWER(TRIM(pi.`supplierName`)) = s.`normalizedName`
SET pi.`supplierId` = s.`supplierId`
WHERE pi.`supplierId` IS NULL
  AND pi.`supplierName` IS NOT NULL
  AND TRIM(pi.`supplierName`) <> '';
