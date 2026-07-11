/**
 * Script de importação completa da BASE_PRODUTOS_SISTEMA.csv
 * Cria categorias, atualiza base mestre e insere/atualiza produtos na tabela products
 */
import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env") });

const CSV_PATH = "/home/ubuntu/upload/BASE_PRODUTOS_SISTEMA.csv";

// Paleta de cores para categorias
const CATEGORY_COLORS = [
  "#dc2626","#ea580c","#d97706","#65a30d","#16a34a","#0d9488",
  "#0284c7","#4f46e5","#7c3aed","#c026d3","#db2777","#059669",
  "#0891b2","#6366f1","#8b5cf6","#ec4899","#f43f5e","#84cc16",
  "#22c55e","#14b8a6","#3b82f6","#a855f7","#f97316","#eab308",
  "#10b981","#06b6d4","#6d28d9","#be185d","#b45309","#047857",
  "#0369a1","#1d4ed8","#7e22ce","#9d174d","#92400e","#065f46",
  "#1e3a5f","#374151",
];

async function main() {
  const conn = await createConnection(process.env.DATABASE_URL);
  console.log("✓ Conectado ao banco de dados");

  // 1. Ler o CSV
  const raw = readFileSync(CSV_PATH);
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  });
  console.log(`✓ CSV lido: ${rows.length} linhas`);

  // 2. Coletar categorias únicas do CSV
  const uniqueCategories = [...new Set(
    rows.map(r => r.categoria?.trim()).filter(Boolean)
  )].sort();
  console.log(`✓ Categorias únicas no CSV: ${uniqueCategories.length}`);

  // 3. Buscar categorias existentes (usando camelCase do schema)
  const [existingCats] = await conn.execute("SELECT id, name FROM categories");
  const catMap = new Map(existingCats.map(c => [c.name.trim().toUpperCase(), c.id]));
  console.log(`✓ Categorias existentes no banco: ${existingCats.length}`);

  // 4. Criar categorias faltantes
  let colorIdx = existingCats.length;
  let newCatsCreated = 0;
  for (const cat of uniqueCategories) {
    const key = cat.toUpperCase();
    if (!catMap.has(key)) {
      const color = CATEGORY_COLORS[colorIdx % CATEGORY_COLORS.length];
      colorIdx++;
      // Gerar slug a partir do nome
      const slug = cat.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now();
      const [result] = await conn.execute(
        "INSERT INTO categories (name, slug, color, createdAt, updatedAt) VALUES (?, ?, ?, NOW(), NOW())",
        [cat, slug, color]
      );
      catMap.set(key, result.insertId);
      newCatsCreated++;
    }
  }
  console.log(`✓ Novas categorias criadas: ${newCatsCreated}`);

  // 5. Garantir fornecedor padrão "Base Mestre"
  const [existingSuppliers] = await conn.execute("SELECT id, name FROM suppliers ORDER BY id LIMIT 1");
  let defaultSupplierId = existingSuppliers.length > 0 ? existingSuppliers[0].id : null;
  if (!defaultSupplierId) {
    const [res] = await conn.execute(
      "INSERT INTO suppliers (name, createdAt) VALUES ('Base Mestre', NOW())"
    );
    defaultSupplierId = res.insertId;
    console.log("  + Fornecedor 'Base Mestre' criado");
  }
  console.log(`✓ Fornecedor padrão: id=${defaultSupplierId}`);

  // 6. Garantir categoria padrão "Outros" para produtos sem categoria
  let defaultCatId = catMap.get("OUTROS");
  if (!defaultCatId) {
    const [res] = await conn.execute(
      "INSERT INTO categories (name, slug, color, createdAt, updatedAt) VALUES ('Outros', 'outros-default', '#6b7280', NOW(), NOW())"
    );
    defaultCatId = res.insertId;
    catMap.set("OUTROS", defaultCatId);
    console.log("  + Categoria 'Outros' criada como padrão");
  }

  // 7. Buscar produtos existentes para evitar duplicatas (por nome + concentração)
  const [existingProducts] = await conn.execute(
    "SELECT id, name, concentration FROM products"
  );
  const existingMap = new Map(
    existingProducts.map(p => [
      `${(p.name || "").trim().toUpperCase()}||${(p.concentration || "").trim().toUpperCase()}`,
      p.id
    ])
  );
  console.log(`✓ Produtos já existentes no banco: ${existingProducts.length}`);

  // 8. Importar produtos em lotes de 100
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const BATCH = 100;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = row.nome_produto?.trim();
    if (!name) { skipped++; continue; }

    const concentration  = row.forma_concentracao?.trim() || null;
    const presentation   = row.apresentacao?.trim() || null;
    const codigoMapa     = row.registro_mapa?.trim() || null;
    const activeIngredient = row.composicao?.trim() || null;
    const categoryName   = row.categoria?.trim() || null;
    const manufacturer   = row.marca?.trim() || null;
    const ean            = row.ean?.trim() || null;

    // Resolver categoria
    const catId = categoryName
      ? (catMap.get(categoryName.toUpperCase()) ?? defaultCatId)
      : defaultCatId;

    const key = `${name.toUpperCase()}||${(concentration || "").toUpperCase()}`;

    if (existingMap.has(key)) {
      // Atualizar produto existente com dados da base mestre (só preenche campos vazios)
      const pid = existingMap.get(key);
      await conn.execute(
        `UPDATE products SET
          activeIngredient = COALESCE(NULLIF(activeIngredient,''), ?),
          presentation = COALESCE(NULLIF(presentation,''), ?),
          categoryId = COALESCE(categoryId, ?),
          manufacturer = COALESCE(NULLIF(manufacturer,''), ?),
          barcode = COALESCE(NULLIF(barcode,''), ?)
        WHERE id = ?`,
        [activeIngredient, presentation, catId, manufacturer, ean, pid]
      );
      updated++;
    } else {
      // Inserir novo produto
      try {
        const [res] = await conn.execute(
          `INSERT INTO products
            (supplierId, categoryId, name, concentration, presentation,
             activeIngredient, manufacturer, barcode, isActive, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'yes', NOW(), NOW())`,
          [defaultSupplierId, catId, name, concentration, presentation,
           activeIngredient, manufacturer, ean]
        );
        existingMap.set(key, res.insertId);
        inserted++;
      } catch (err) {
        // Ignorar erros de chave duplicada
        skipped++;
      }
    }

    // Log de progresso a cada 500 produtos
    if ((i + 1) % 500 === 0) {
      console.log(`  ... processados ${i + 1}/${rows.length} (ins:${inserted} upd:${updated} skip:${skipped})`);
    }
  }

  // 9. Atualizar base mestre (upsert)
  console.log("\n  Atualizando tabela master_products...");
  let masterUpserted = 0;
  for (const row of rows) {
    const name = row.nome_produto?.trim();
    if (!name) continue;
    try {
      await conn.execute(
        `INSERT INTO master_products
          (name, concentration, presentation, codigoMapa, activeIngredient,
           categoryName, manufacturer, ean, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
          concentration = VALUES(concentration),
          presentation = VALUES(presentation),
          codigoMapa = VALUES(codigoMapa),
          activeIngredient = VALUES(activeIngredient),
          categoryName = VALUES(categoryName),
          manufacturer = VALUES(manufacturer),
          ean = VALUES(ean)`,
        [
          name,
          row.forma_concentracao?.trim() || null,
          row.apresentacao?.trim() || null,
          row.registro_mapa?.trim() || null,
          row.composicao?.trim() || null,
          row.categoria?.trim() || null,
          row.marca?.trim() || null,
          row.ean?.trim() || null,
        ]
      );
      masterUpserted++;
    } catch (err) {
      // Ignorar erros de coluna inexistente na master
    }
  }

  await conn.end();

  console.log("\n═══════════════════════════════════════");
  console.log("  IMPORTAÇÃO CONCLUÍDA");
  console.log("═══════════════════════════════════════");
  console.log(`  Produtos inseridos:    ${inserted}`);
  console.log(`  Produtos atualizados:  ${updated}`);
  console.log(`  Ignorados/duplicados:  ${skipped}`);
  console.log(`  Base mestre (upsert):  ${masterUpserted}`);
  console.log("═══════════════════════════════════════");
}

main().catch(err => {
  console.error("ERRO:", err.message);
  console.error(err.stack);
  process.exit(1);
});
