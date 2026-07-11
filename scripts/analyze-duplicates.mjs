/**
 * Script de análise de duplicidades na base de produtos.
 * Critério: mesmo supplierId + LOWER(TRIM(name)) + LOWER(TRIM(concentration)) + LOWER(TRIM(presentation))
 * Produtos com concentração ou apresentação DIFERENTE são mantidos como distintos.
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

console.log("=== Analisando duplicidades na base de produtos ===\n");

// 1. Total de produtos ativos
const [[{ total }]] = await conn.execute(
  "SELECT COUNT(*) as total FROM products WHERE isActive = 'yes'"
);
console.log(`Total de produtos ativos: ${total}`);

// 2. Grupos duplicados: mesmo supplierId + name + concentration + presentation
const [dupGroups] = await conn.execute(`
  SELECT 
    supplierId,
    LOWER(TRIM(name)) as norm_name,
    LOWER(TRIM(COALESCE(concentration, ''))) as norm_conc,
    LOWER(TRIM(COALESCE(presentation, ''))) as norm_pres,
    COUNT(*) as cnt,
    GROUP_CONCAT(id ORDER BY id ASC) as ids,
    MIN(id) as keep_id,
    MAX(id) as last_id
  FROM products
  WHERE isActive = 'yes'
  GROUP BY supplierId, norm_name, norm_conc, norm_pres
  HAVING COUNT(*) > 1
  ORDER BY cnt DESC
  LIMIT 100
`);

console.log(`\nGrupos com duplicatas: ${dupGroups.length}`);

// 3. Total de registros duplicados (a remover)
const [[{ dupTotal }]] = await conn.execute(`
  SELECT SUM(cnt - 1) as dupTotal FROM (
    SELECT COUNT(*) as cnt
    FROM products
    WHERE isActive = 'yes'
    GROUP BY supplierId, LOWER(TRIM(name)), LOWER(TRIM(COALESCE(concentration, ''))), LOWER(TRIM(COALESCE(presentation, '')))
    HAVING COUNT(*) > 1
  ) t
`);
console.log(`Total de registros duplicados (a mesclar): ${dupTotal}`);

// 4. Mostrar os 10 maiores grupos
console.log("\nTop 10 grupos com mais duplicatas:");
for (const g of dupGroups.slice(0, 10)) {
  console.log(`  [${g.cnt}x] Fornecedor ${g.supplierId} | "${g.norm_name}" | conc="${g.norm_conc}" | pres="${g.norm_pres}"`);
  console.log(`       IDs: ${g.ids} → manter: ${g.keep_id}`);
}

// 5. Verificar duplicatas cross-supplier (mesmo nome+conc+pres, fornecedores diferentes — MANTER)
const [[{ crossSupplier }]] = await conn.execute(`
  SELECT COUNT(DISTINCT CONCAT(LOWER(TRIM(name)), '|', LOWER(TRIM(COALESCE(concentration,''))), '|', LOWER(TRIM(COALESCE(presentation,''))))) as crossSupplier
  FROM products
  WHERE isActive = 'yes'
  GROUP BY LOWER(TRIM(name)), LOWER(TRIM(COALESCE(concentration,''))), LOWER(TRIM(COALESCE(presentation,'')))
  HAVING COUNT(DISTINCT supplierId) > 1
`);
console.log(`\nProdutos com mesmo nome+conc+pres em FORNECEDORES DIFERENTES (mantidos): ${crossSupplier ?? 0}`);

await conn.end();
console.log("\n=== Análise concluída ===");
