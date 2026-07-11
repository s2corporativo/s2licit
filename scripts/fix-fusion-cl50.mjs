/**
 * Script para corrigir/inserir o produto FUSION CL 50 com dados corretos.
 * Dados conforme especificado:
 *   - Categoria: Carrapaticida, Mosquicida e Bernicida
 *   - Apresentação: 5 Litros
 *   - Uso (concentração): Pour-On
 *   - Marca: MSD
 *   - Composição: BUTOXIDO DE PIPERONILA, CIPERMETRINA, CITRONELAL, CLORPIRIFOS, FLUAZURON
 */
import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not found");
  process.exit(1);
}

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  console.log("Connected to database.");

  // 1. Verificar/criar categoria
  const categoryName = "Carrapaticida, Mosquicida e Bernicida";
  const categorySlug = "carrapaticida-mosquicida-bernicida";
  let categoryId;

  const [catRows] = await conn.execute(
    "SELECT id FROM categories WHERE name = ? OR slug = ? LIMIT 1",
    [categoryName, categorySlug]
  );
  if (catRows.length > 0) {
    categoryId = catRows[0].id;
    console.log(`Category found: id=${categoryId}`);
  } else {
    const [result] = await conn.execute(
      "INSERT INTO categories (name, slug, color, sortOrder) VALUES (?, ?, ?, ?)",
      [categoryName, categorySlug, "#DC2626", 10]
    );
    categoryId = result.insertId;
    console.log(`Category created: id=${categoryId}`);
  }

  // 2. Verificar se o produto já existe
  const [existing] = await conn.execute(
    "SELECT id, name, concentration, presentation, manufacturer, activeIngredient FROM products WHERE name LIKE '%FUSION CL%' OR name LIKE '%Fusion Cl%' LIMIT 5"
  );
  console.log("Existing products matching 'FUSION CL':", existing);

  // 3. Verificar fornecedores disponíveis
  const [suppliers] = await conn.execute("SELECT id, name FROM suppliers LIMIT 10");
  console.log("Available suppliers:", suppliers);

  // 4. Se o produto não existe, inserir; se existe, atualizar
  const productData = {
    name: "FUSION CL 50",
    activeIngredient: "BUTOXIDO DE PIPERONILA, CIPERMETRINA, CITRONELAL, CLORPIRIFOS, FLUAZURON",
    manufacturer: "MSD",
    concentration: "POUR-ON",
    presentation: "5 Litros",
    categoryId,
    description: "Carrapaticida, Mosquicida e Bernicida de uso Pour-On. Composição: Butóxido de Piperonila, Cipermetrina, Citronelal, Clorpirifós, Fluazuron.",
    unit: "L",
  };

  if (existing.length > 0) {
    // Atualizar todos os registros encontrados
    for (const row of existing) {
      await conn.execute(
        `UPDATE products SET
          activeIngredient = ?,
          manufacturer = ?,
          concentration = ?,
          presentation = ?,
          categoryId = ?,
          description = ?,
          unit = ?
        WHERE id = ?`,
        [
          productData.activeIngredient,
          productData.manufacturer,
          productData.concentration,
          productData.presentation,
          productData.categoryId,
          productData.description,
          productData.unit,
          row.id,
        ]
      );
      console.log(`Updated product id=${row.id} (${row.name})`);
    }
  } else {
    // Usar o primeiro fornecedor disponível ou criar um genérico
    let defaultSupplierId = suppliers.length > 0 ? suppliers[0].id : null;
    if (!defaultSupplierId) {
      const [sr] = await conn.execute(
        "INSERT INTO suppliers (name) VALUES (?)",
        ["MSD"]
      );
      defaultSupplierId = sr.insertId;
    }
    const [result] = await conn.execute(
      `INSERT INTO products (supplierId, name, activeIngredient, manufacturer, concentration, presentation, categoryId, description, unit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        defaultSupplierId,
        productData.name,
        productData.activeIngredient,
        productData.manufacturer,
        productData.concentration,
        productData.presentation,
        productData.categoryId,
        productData.description,
        productData.unit,
      ]
    );
    console.log(`Inserted FUSION CL 50 with id=${result.insertId}`);
  }

  // 5. Atualizar também na base mestre
  const [masterRows] = await conn.execute(
    "SELECT id FROM master_products WHERE name LIKE '%FUSION CL%' LIMIT 5"
  );
  if (masterRows.length > 0) {
    for (const row of masterRows) {
      await conn.execute(
        `UPDATE master_products SET
          activeIngredient = ?,
          manufacturer = ?,
          concentration = ?,
          presentation = ?,
          categoryName = ?
        WHERE id = ?`,
        [
          productData.activeIngredient,
          productData.manufacturer,
          productData.concentration,
          productData.presentation,
          categoryName,
          row.id,
        ]
      );
      console.log(`Updated master_product id=${row.id}`);
    }
  }

  await conn.end();
  console.log("Done!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
