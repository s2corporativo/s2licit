/**
 * Script de mesclagem de duplicatas na base de produtos.
 *
 * Estratégia por grupo (mesmo supplierId + name + concentration + presentation):
 * 1. Identificar o registro "mais completo" (maior score de campos preenchidos)
 * 2. Mesclar campos não preenchidos no registro keeper com dados dos duplicados
 * 3. Atualizar referências de proposal_items e product_equivalence_members
 * 4. Marcar duplicados como isActive='no' (soft delete para segurança)
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

console.log("=== Mesclagem de duplicatas ===\n");

// 1. Buscar todos os grupos duplicados (sem limite)
const [dupGroups] = await conn.execute(`
  SELECT 
    supplierId,
    LOWER(TRIM(name)) as norm_name,
    LOWER(TRIM(COALESCE(concentration, ''))) as norm_conc,
    LOWER(TRIM(COALESCE(presentation, ''))) as norm_pres,
    COUNT(*) as cnt,
    GROUP_CONCAT(id ORDER BY id ASC SEPARATOR ',') as ids
  FROM products
  WHERE isActive = 'yes'
  GROUP BY supplierId, norm_name, norm_conc, norm_pres
  HAVING COUNT(*) > 1
  ORDER BY cnt DESC
`);

console.log(`Grupos a mesclar: ${dupGroups.length}`);

let totalMerged = 0;
let totalRemoved = 0;

for (const group of dupGroups) {
  const ids = group.ids.split(',').map(Number);
  
  // 2. Buscar todos os registros do grupo
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await conn.execute(
    `SELECT * FROM products WHERE id IN (${placeholders})`,
    ids
  );
  
  // 3. Calcular score de completude para cada registro
  const fields = ['activeIngredient', 'manufacturer', 'description', 'imageUrl', 'productUrl', 
                  'barcode', 'mapa', 'code', 'unit', 'priceUnit', 'stock', 'categoryId', 'price'];
  
  const scored = rows.map(r => ({
    ...r,
    score: fields.reduce((s, f) => s + (r[f] ? 1 : 0), 0)
  }));
  
  // Ordenar por score desc, depois por id asc (mais antigo como desempate)
  scored.sort((a, b) => b.score - a.score || a.id - b.id);
  
  const keeper = scored[0];
  const duplicates = scored.slice(1);
  
  // 4. Mesclar: preencher campos vazios do keeper com dados dos duplicados
  const updates = {};
  for (const dup of duplicates) {
    for (const f of fields) {
      if (!keeper[f] && dup[f]) {
        updates[f] = dup[f];
        keeper[f] = dup[f]; // atualizar em memória para próximas iterações
      }
    }
    // Usar o preço mais recente (último importado = maior id) se keeper não tem preço
    if (!keeper.price && dup.price) {
      updates.price = dup.price;
      keeper.price = dup.price;
    }
  }
  
  // 5. Atualizar o keeper se houver campos a mesclar
  if (Object.keys(updates).length > 0) {
    const setClauses = Object.keys(updates).map(f => `\`${f}\` = ?`).join(', ');
    const values = [...Object.values(updates), keeper.id];
    await conn.execute(`UPDATE products SET ${setClauses} WHERE id = ?`, values);
    totalMerged++;
  }
  
  // 6. Redirecionar referências de proposal_items para o keeper
  const dupIds = duplicates.map(d => d.id);
  if (dupIds.length > 0) {
    const dupPlaceholders = dupIds.map(() => '?').join(',');
    
    // Atualizar proposal_items que referenciam os duplicados
    await conn.execute(
      `UPDATE proposal_items SET productId = ? WHERE productId IN (${dupPlaceholders})`,
      [keeper.id, ...dupIds]
    );
    
    // Atualizar product_equivalence_members (se existir)
    try {
      await conn.execute(
        `UPDATE product_equivalence_members SET productId = ? WHERE productId IN (${dupPlaceholders})`,
        [keeper.id, ...dupIds]
      );
      // Remover duplicatas de membros que agora têm mesmo groupId+productId
      await conn.execute(
        `DELETE t1 FROM product_equivalence_members t1
         INNER JOIN product_equivalence_members t2
         WHERE t1.id > t2.id AND t1.groupId = t2.groupId AND t1.productId = t2.productId`
      );
    } catch (_) {
      // Tabela pode não existir — ignorar
    }
    
    // 7. Soft delete dos duplicados
    await conn.execute(
      `UPDATE products SET isActive = 'no' WHERE id IN (${dupPlaceholders})`,
      dupIds
    );
    totalRemoved += dupIds.length;
  }
}

// 8. Resultado final
const [[{ remaining }]] = await conn.execute(
  "SELECT COUNT(*) as remaining FROM products WHERE isActive = 'yes'"
);

console.log(`\n✅ Mesclagem concluída:`);
console.log(`   Grupos processados: ${dupGroups.length}`);
console.log(`   Registros com dados mesclados: ${totalMerged}`);
console.log(`   Registros removidos (soft delete): ${totalRemoved}`);
console.log(`   Produtos ativos restantes: ${remaining}`);

// 9. Verificar se ainda há duplicatas
const [[{ stillDup }]] = await conn.execute(`
  SELECT COUNT(*) as stillDup FROM (
    SELECT COUNT(*) as cnt
    FROM products
    WHERE isActive = 'yes'
    GROUP BY supplierId, LOWER(TRIM(name)), LOWER(TRIM(COALESCE(concentration, ''))), LOWER(TRIM(COALESCE(presentation, '')))
    HAVING COUNT(*) > 1
  ) t
`);
console.log(`   Grupos duplicados restantes: ${stillDup} (deve ser 0)`);

await conn.end();
console.log("\n=== Script finalizado ===");
