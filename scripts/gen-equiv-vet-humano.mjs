/**
 * Script: Gerar equivalências Vet × Humano
 * Agrupa produtos por princípio ativo e cria grupos de equivalência
 * cruzando categorias de Medicamentos Veterinários (id=1) e Humanos (id=2)
 * e suas subcategorias.
 *
 * Tabelas usadas:
 *   equivalence_groups  (id, activeIngredient, categoryId, notes, createdAt, updatedAt)
 *   equivalence_members (id, groupId, productId, createdAt)
 */
import mysql from "mysql2/promise";

const VET_PARENT_ID = 1;
const HUMANO_PARENT_ID = 2;

function normalize(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  console.log("✓ Conectado ao banco de dados");

  // 1. Obter IDs das categorias vet e humano (pai + filhos)
  const [catRows] = await conn.execute(
    `SELECT id, name, parentId FROM categories WHERE id IN (${VET_PARENT_ID}, ${HUMANO_PARENT_ID}) OR parentId IN (${VET_PARENT_ID}, ${HUMANO_PARENT_ID})`
  );
  const vetIds = catRows.filter(c => c.id === VET_PARENT_ID || c.parentId === VET_PARENT_ID).map(c => c.id);
  const humanoIds = catRows.filter(c => c.id === HUMANO_PARENT_ID || c.parentId === HUMANO_PARENT_ID).map(c => c.id);
  console.log(`✓ Categorias Vet (${vetIds.length}): [${vetIds.join(", ")}]`);
  console.log(`✓ Categorias Humano (${humanoIds.length}): [${humanoIds.join(", ")}]`);

  // 2. Buscar produtos ativos com princípio ativo preenchido
  const allIds = [...vetIds, ...humanoIds];
  if (allIds.length === 0) {
    console.log("Nenhuma categoria encontrada.");
    await conn.end();
    return;
  }

  const placeholders = allIds.map(() => "?").join(",");
  const [products] = await conn.execute(
    `SELECT id, name, activeIngredient, categoryId FROM products WHERE isActive = 1 AND activeIngredient IS NOT NULL AND activeIngredient != '' AND categoryId IN (${placeholders})`,
    allIds
  );
  console.log(`✓ Produtos com princípio ativo: ${products.length}`);

  if (products.length === 0) {
    console.log("\n⚠ Nenhum produto com princípio ativo encontrado nas categorias Vet/Humano.");
    console.log("  Dica: importe planilhas e mapeie a coluna 'Princípio Ativo' para que os cruzamentos sejam gerados.");
    await conn.end();
    return;
  }

  // 3. Agrupar por princípio ativo normalizado
  const groups = new Map();
  for (const p of products) {
    const key = normalize(p.activeIngredient);
    if (!key || key.length < 3) continue;
    if (!groups.has(key)) {
      groups.set(key, { ingredient: p.activeIngredient, vet: [], humano: [] });
    }
    const g = groups.get(key);
    if (vetIds.includes(p.categoryId)) g.vet.push(p);
    else if (humanoIds.includes(p.categoryId)) g.humano.push(p);
  }

  // 4. Filtrar apenas grupos com produtos em AMBAS as linhas
  const crossGroups = Array.from(groups.values()).filter(g => g.vet.length > 0 && g.humano.length > 0);
  const onlyVet = Array.from(groups.values()).filter(g => g.vet.length > 0 && g.humano.length === 0);
  const onlyHumano = Array.from(groups.values()).filter(g => g.humano.length > 0 && g.vet.length === 0);

  console.log(`\n📊 Análise de princípios ativos:`);
  console.log(`   Cruzamentos Vet × Humano: ${crossGroups.length}`);
  console.log(`   Somente Vet (sem equivalente humano): ${onlyVet.length}`);
  console.log(`   Somente Humano (sem equivalente vet): ${onlyHumano.length}`);

  if (crossGroups.length === 0) {
    console.log("\n⚠ Nenhum cruzamento encontrado.");
    console.log("  Para gerar equivalências, é necessário ter produtos com o mesmo");
    console.log("  princípio ativo cadastrado tanto na linha veterinária quanto na humana.");
    await conn.end();
    return;
  }

  // 5. Criar/atualizar grupos de equivalência
  let created = 0, updated = 0;
  for (const g of crossGroups) {
    const notes = `Gerado automaticamente — ${g.vet.length} produto(s) vet + ${g.humano.length} produto(s) humano`;
    const allProductIds = [...g.vet.map(p => p.id), ...g.humano.map(p => p.id)];

    // Verificar se já existe grupo com esse princípio ativo e sem categoryId (grupo cruzado)
    const [existing] = await conn.execute(
      `SELECT id FROM equivalence_groups WHERE activeIngredient = ? AND categoryId IS NULL LIMIT 1`,
      [g.ingredient]
    );

    let groupId;
    if (existing.length > 0) {
      groupId = existing[0].id;
      await conn.execute(
        `UPDATE equivalence_groups SET notes = ?, updatedAt = NOW() WHERE id = ?`,
        [notes, groupId]
      );
      updated++;
    } else {
      const [ins] = await conn.execute(
        `INSERT INTO equivalence_groups (activeIngredient, categoryId, notes, createdAt, updatedAt) VALUES (?, NULL, ?, NOW(), NOW())`,
        [g.ingredient, notes]
      );
      groupId = ins.insertId;
      created++;
    }

    // Inserir membros (ignorar duplicatas via IGNORE)
    for (const pid of allProductIds) {
      await conn.execute(
        `INSERT IGNORE INTO equivalence_members (groupId, productId, createdAt) VALUES (?, ?, NOW())`,
        [groupId, pid]
      );
    }
  }

  console.log(`\n✅ Equivalências geradas com sucesso!`);
  console.log(`   Grupos criados:     ${created}`);
  console.log(`   Grupos atualizados: ${updated}`);
  console.log(`   Total de grupos:    ${crossGroups.length}`);
  console.log(`\n📋 Primeiros 15 grupos:`);
  crossGroups.slice(0, 15).forEach(g => {
    console.log(`   • ${g.ingredient}: ${g.vet.length} vet + ${g.humano.length} humano`);
  });

  await conn.end();
}

main().catch(err => {
  console.error("❌ Erro:", err.message);
  process.exit(1);
});
