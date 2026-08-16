SELECT 'proposals por org' AS chk;
SELECT p.orgId, o.name, COUNT(*) n FROM proposals p LEFT JOIN requesting_orgs o ON o.id = p.orgId GROUP BY p.orgId, o.name;

SELECT 'historico por proposta (top 5)' AS chk;
SELECT proposalId, COUNT(*) n FROM proposal_status_history GROUP BY proposalId ORDER BY n DESC LIMIT 5;

SELECT 'historico sem proposta' AS chk;
SELECT COUNT(*) orfaos FROM proposal_status_history h LEFT JOIN proposals p ON p.id = h.proposalId WHERE p.id IS NULL;

SELECT 'precos por fornecedor (top 8)' AS chk;
SELECT supplierId, COUNT(*) n FROM product_supplier_prices GROUP BY supplierId ORDER BY n DESC LIMIT 8;

SELECT 'suppliers ativos' AS chk;
SELECT id, name, isActive FROM suppliers ORDER BY id LIMIT 15;

SELECT 'orgs cadastrados' AS chk;
SELECT id, name FROM requesting_orgs ORDER BY id LIMIT 15;

SELECT 'contratos total' AS chk;
SELECT COUNT(*) total FROM purchase_orders;
