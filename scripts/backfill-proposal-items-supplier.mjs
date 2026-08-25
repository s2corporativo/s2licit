/**
 * backfill-proposal-items-supplier.mjs
 *
 * Ressalva 4 (Módulo 06, curto prazo) — preenche `proposal_items.supplierId`
 * (FK para `suppliers`) a partir do texto livre existente em `supplierName`,
 * casando por nome exato (case-insensitive). Itens sem correspondência
 * exata permanecem com supplierId NULL — o vínculo é oportunista, não
 * obrigatório (retrocompatível: nada é bloqueado ou removido).
 *
 * Execução única, idempotente (só afeta linhas com supplierId ainda NULL):
 *   node scripts/backfill-proposal-items-supplier.mjs
 *
 * Rollback (se necessário reverter o vínculo automático):
 *   UPDATE proposal_items SET supplierId = NULL;
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

console.log('🔌 Conectando ao banco...');

const [before] = await conn.query(
  'SELECT COUNT(*) as total FROM proposal_items WHERE supplierName IS NOT NULL AND supplierName <> "" AND supplierId IS NULL'
);
console.log(`📋 ${before[0].total} item(ns) de proposta com supplierName mas sem supplierId`);

const [result] = await conn.execute(`
  UPDATE proposal_items pi
  JOIN suppliers s ON LOWER(TRIM(pi.supplierName)) = LOWER(TRIM(s.name))
  SET pi.supplierId = s.id
  WHERE pi.supplierId IS NULL
    AND pi.supplierName IS NOT NULL
    AND pi.supplierName <> ''
`);
console.log(`✅ ${result.affectedRows} item(ns) vinculados por correspondência exata de nome`);

const [remaining] = await conn.query(
  'SELECT COUNT(*) as total FROM proposal_items WHERE supplierName IS NOT NULL AND supplierName <> "" AND supplierId IS NULL'
);
console.log(`⚠️  ${remaining[0].total} item(ns) permanecem sem vínculo (nome não bate exatamente com nenhum fornecedor cadastrado — requer revisão manual)`);

if (remaining[0].total > 0) {
  const [samples] = await conn.query(`
    SELECT DISTINCT supplierName FROM proposal_items
    WHERE supplierName IS NOT NULL AND supplierName <> '' AND supplierId IS NULL
    LIMIT 20
  `);
  console.log('   Nomes não vinculados (amostra, até 20):');
  for (const row of samples) console.log(`   - ${row.supplierName}`);
}

await conn.end();
