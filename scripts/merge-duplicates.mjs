/**
 * Script de mesclagem de duplicatas na base de produtos.
 *
 * SEGURANÇA: por padrão roda em modo SIMULAÇÃO (dry-run) — nada é gravado.
 * Para gravar de fato, passe --execute. Recomenda-se `pnpm db:backup` antes.
 *
 * Estratégia por grupo (mesmo supplierId + name + concentration + presentation):
 * 1. Identificar o registro "mais completo" (maior score de campos preenchidos)
 * 2. Mesclar campos não preenchidos no registro keeper com dados dos duplicados
 * 3. Redirecionar TODAS as referências para o keeper, em transação:
 *    proposal_items, equivalence_members,
 *    product_supplier_prices, product_supplier_offers, price_history
 * 4. Marcar duplicados como isActive='no' (soft delete para segurança)
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const EXECUTE = process.argv.includes("--execute");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não definido. Abortando.");
  process.exit(1);
}

const conn = await mysql.createConnection(process.env.DATABASE_URL);

console.log("=== Mesclagem de duplicatas ===");
console.log(EXECUTE ? ">>> MODO EXECUÇÃO — alterações serão gravadas\n"
                    : ">>> MODO SIMULAÇÃO (dry-run) — nada será gravado. Use --execute para aplicar.\n");

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

/**
 * Redireciona referências de tabelas com unique (productId, supplierId):
 * quando o keeper já possui linha para o mesmo fornecedor, mantém a mais
 * recente e descarta a do duplicado; senão, simplesmente reaponta.
 */
async function redirectUniqueOfferTable(tx, table, keeperId, dupIds, dupPlaceholders, orderColumn) {
  // Remove linhas dos duplicados cujo (fornecedor) já existe no keeper com dado mais novo ou igual
  await tx.execute(
    `DELETE d FROM \`${table}\` d
     INNER JOIN \`${table}\` k
       ON k.productId = ? AND k.supplierId = d.supplierId
     WHERE d.productId IN (${dupPlaceholders})
       AND k.\`${orderColumn}\` >= d.\`${orderColumn}\``,
    [keeperId, ...dupIds]
  );
  // Se o duplicado tem dado mais novo, remove a linha antiga do keeper...
  await tx.execute(
    `DELETE k FROM \`${table}\` k
     INNER JOIN \`${table}\` d
       ON d.productId IN (${dupPlaceholders}) AND d.supplierId = k.supplierId
     WHERE k.productId = ?
       AND d.\`${orderColumn}\` > k.\`${orderColumn}\``,
    [...dupIds, keeperId]
  );
  // ...e reaponta o restante para o keeper
  await tx.execute(
    `UPDATE \`${table}\` SET productId = ? WHERE productId IN (${dupPlaceholders})`,
    [keeperId, ...dupIds]
  );
}

for (const group of dupGroups) {
  const ids = group.ids.split(",").map(Number);

  // 2. Buscar todos os registros do grupo
  const placeholders = ids.map(() => "?").join(",");
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
  }

  const dupIds = duplicates.map(d => d.id);

  if (!EXECUTE) {
    console.log(
      `[dry-run] keeper #${keeper.id} "${keeper.name}" ← duplicados [${dupIds.join(", ")}]` +
      (Object.keys(updates).length ? ` (mesclaria campos: ${Object.keys(updates).join(", ")})` : "")
    );
    if (Object.keys(updates).length > 0) totalMerged++;
    totalRemoved += dupIds.length;
    continue;
  }

  // 5-7. Aplicar o merge do grupo inteiro numa transação
  await conn.beginTransaction();
  try {
    if (Object.keys(updates).length > 0) {
      const setClauses = Object.keys(updates).map(f => `\`${f}\` = ?`).join(", ");
      const values = [...Object.values(updates), keeper.id];
      await conn.execute(`UPDATE products SET ${setClauses} WHERE id = ?`, values);
      totalMerged++;
    }

    if (dupIds.length > 0) {
      const dupPlaceholders = dupIds.map(() => "?").join(",");

      // Referências simples (sem unique por produto)
      await conn.execute(
        `UPDATE proposal_items SET productId = ? WHERE productId IN (${dupPlaceholders})`,
        [keeper.id, ...dupIds]
      );
      await conn.execute(
        `UPDATE price_history SET productId = ? WHERE productId IN (${dupPlaceholders})`,
        [keeper.id, ...dupIds]
      );

      // Membros de equivalência: unique (groupId, productId) — remover colisões antes
      await conn.execute(
        `DELETE d FROM equivalence_members d
         INNER JOIN equivalence_members k
           ON k.productId = ? AND k.groupId = d.groupId
         WHERE d.productId IN (${dupPlaceholders})`,
        [keeper.id, ...dupIds]
      );
      await conn.execute(
        `UPDATE equivalence_members SET productId = ? WHERE productId IN (${dupPlaceholders})`,
        [keeper.id, ...dupIds]
      );

      // Ofertas por fornecedor: unique (productId, supplierId) — manter a mais recente
      await redirectUniqueOfferTable(conn, "product_supplier_prices", keeper.id, dupIds, dupPlaceholders, "updatedAt");
      await redirectUniqueOfferTable(conn, "product_supplier_offers", keeper.id, dupIds, dupPlaceholders, "updatedAt");

      // Soft delete dos duplicados
      await conn.execute(
        `UPDATE products SET isActive = 'no' WHERE id IN (${dupPlaceholders})`,
        dupIds
      );
      totalRemoved += dupIds.length;
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    console.error(`ERRO no grupo do keeper #${keeper.id} — transação revertida:`, err.message);
    console.error("Abortando para evitar estado parcial. Nenhum dado deste grupo foi alterado.");
    await conn.end();
    process.exit(1);
  }
}

// 8. Resultado final
const [[{ remaining }]] = await conn.execute(
  "SELECT COUNT(*) as remaining FROM products WHERE isActive = 'yes'"
);

console.log(`\n${EXECUTE ? "✅ Mesclagem concluída:" : "🔍 Simulação concluída (nada foi gravado):"}`);
console.log(`   Grupos processados: ${dupGroups.length}`);
console.log(`   Registros com dados mesclados: ${totalMerged}`);
console.log(`   Registros removidos (soft delete): ${totalRemoved}`);
console.log(`   Produtos ativos ${EXECUTE ? "restantes" : "atuais"}: ${remaining}`);

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
console.log(`   Grupos duplicados ${EXECUTE ? "restantes" : "encontrados"}: ${stillDup}${EXECUTE ? " (deve ser 0)" : ""}`);

await conn.end();
console.log("\n=== Script finalizado ===");
