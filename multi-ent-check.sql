-- Módulo 05: verificação de integridade multi-entidade
SELECT 'proposals por org' AS chk;
SELECT p.orgId, o.name, COUNT(*) n FROM proposals p LEFT JOIN requesting_orgs o ON o.id = p.orgId GROUP BY p.orgId, o.name;

SELECT 'itens por fornecedor (supplierName)' AS chk;
SELECT pi.supplierName, COUNT(*) n FROM proposal_items pi GROUP BY pi.supplierName ORDER BY n DESC LIMIT 12;

SELECT 'itens sem fornecedor' AS chk;
SELECT COUNT(*) orfaos FROM proposal_items WHERE supplierName IS NULL OR supplierName = '';

SELECT 'propostas sem orgao' AS chk;
SELECT COUNT(*) orfaas FROM proposals WHERE orgId IS NULL;

SELECT 'cotações e-mail: órgãos e resultado' AS chk;
SELECT COUNT(*) total FROM email_quotations;
SELECT orgao, COUNT(*) n FROM email_quotations GROUP BY orgao ORDER BY n DESC LIMIT 10;
SELECT resultado, COUNT(*) n FROM email_quotations GROUP BY resultado;

SELECT 'contratos (purchase_orders) por org' AS chk;
SELECT orgId, COUNT(*) n FROM purchase_orders GROUP BY orgId LIMIT 10;

SELECT 'historico: registros por proposta (top 5)' AS chk;
SELECT proposalId, COUNT(*) n FROM proposal_status_history GROUP BY proposalId ORDER BY n DESC LIMIT 5;

SELECT 'histórico sem proposta' AS chk;
SELECT COUNT(*) orfaos FROM proposal_status_history h LEFT JOIN proposals p ON p.id = h.proposalId WHERE p.id IS NULL;

SELECT 'preços por fornecedor (product_supplier_prices)' AS chk;
SELECT supplierId, COUNT(*) n FROM product_supplier_prices GROUP BY supplierId LIMIT 10;
