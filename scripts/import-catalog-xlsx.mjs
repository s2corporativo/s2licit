/**
 * Importa um catálogo consolidado (XLSX) para a tabela `products`.
 *
 * Feito para o layout do CONSOLIDADO_FINAL.xlsx (catálogo veterinário), com
 * colunas: Produto, Laboratório Fabricante, Fórmula / Princípio Ativo,
 * Apresentação, Classe Terapêutica, Espécie-alvo, Via de Administração,
 * Custo_R$, ORIGEM, Imagem_URL, Fonte_URL, Registro MAPA, EAN.
 *
 * Uso:
 *   node scripts/import-catalog-xlsx.mjs /caminho/CONSOLIDADO_FINAL.xlsx [--supplier "Catálogo de Referência"] [--dry-run]
 *
 * - Cria (se necessário) um fornecedor de referência ao qual os produtos são
 *   vinculados (products.supplierId é obrigatório).
 * - Deduplica por (supplierId, name) via INSERT IGNORE.
 * - Sinaliza outliers de preço (custo <= 0 ou muito alto) sem abortar.
 */

import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";
import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import ExcelJS from "exceljs";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

const args = process.argv.slice(2);
const xlsxPath = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const supplierIdx = args.indexOf("--supplier");
const supplierName = supplierIdx >= 0 ? args[supplierIdx + 1] : "Catálogo de Referência";
const PRICE_OUTLIER_MAX = 100000; // custo acima disso é tratado como suspeito

if (!xlsxPath) {
  console.error("Uso: node scripts/import-catalog-xlsx.mjs /caminho/arquivo.xlsx [--supplier NOME] [--dry-run]");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não definido no .env");
  process.exit(1);
}

function toNumber(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const cleaned = String(v).replace(/[^0-9.,-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}
function str(v, max) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return max ? s.slice(0, max) : s;
}

function cellVal(v) {
  if (v == null) return null;
  if (typeof v === "object") {
    if (v.result !== undefined) return v.result;
    if (v.text !== undefined) return v.text;
    if (v.richText) return v.richText.map((t) => t.text).join("");
    if (v instanceof Date) return v;
    return String(v);
  }
  return v;
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readFileSync(xlsxPath));
  const ws = wb.worksheets[0];
  const matrix = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const arr = [];
    for (let c = 1; c <= ws.columnCount; c++) arr.push(cellVal(row.getCell(c).value));
    matrix.push(arr);
  });
  const headers = (matrix[0] ?? []).map((h) => (h == null ? "" : String(h).trim()));
  const rows = matrix.slice(1).map((r) => {
    const o = {};
    headers.forEach((h, i) => { if (h) o[h] = r[i] ?? null; });
    return o;
  });
  console.log(`Lidas ${rows.length} linhas de ${ws.name}`);

  const conn = await createConnection(process.env.DATABASE_URL);
  try {
    // Fornecedor de referência
    let supplierId;
    const [existing] = await conn.execute("SELECT id FROM suppliers WHERE name = ? LIMIT 1", [supplierName]);
    if (existing.length > 0) {
      supplierId = existing[0].id;
    } else if (dryRun) {
      supplierId = 0;
      console.log(`[dry-run] criaria fornecedor "${supplierName}"`);
    } else {
      const [res] = await conn.execute("INSERT INTO suppliers (name) VALUES (?)", [supplierName]);
      supplierId = res.insertId;
      console.log(`Fornecedor "${supplierName}" criado (id ${supplierId})`);
    }

    let inserted = 0, skipped = 0, outliers = 0, semNome = 0;
    for (const r of rows) {
      const name = str(r["Produto"], 512);
      if (!name) { semNome++; continue; }

      const custo = toNumber(r["Custo_R$"]);
      let price = custo;
      if (custo != null && (custo <= 0 || custo > PRICE_OUTLIER_MAX)) {
        outliers++;
        price = null; // não grava preço suspeito
      }

      const product = {
        supplierId,
        name,
        manufacturer: str(r["Laboratório Fabricante"], 256),
        activeIngredient: str(r["Fórmula / Princípio Ativo"], 512),
        presentation: str(r["Apresentação"], 128),
        subcategoria: str(r["Classe Terapêutica"], 128),
        description: [str(r["Espécie-alvo"]), str(r["Via de Administração"])].filter(Boolean).join(" · ") || null,
        price: price != null ? String(price) : null,
        imageUrl: str(r["Imagem_URL"]),
        productUrl: str(r["Fonte_URL"]),
        mapa: str(r["Registro MAPA"], 64),
        ean: str(r["EAN"], 64),
      };

      if (dryRun) { inserted++; continue; }

      const [res] = await conn.execute(
        `INSERT IGNORE INTO products
           (supplierId, name, manufacturer, activeIngredient, presentation, subcategoria, description, price, imageUrl, productUrl, mapa, ean)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [product.supplierId, product.name, product.manufacturer, product.activeIngredient,
         product.presentation, product.subcategoria, product.description, product.price,
         product.imageUrl, product.productUrl, product.mapa, product.ean],
      );
      if (res.affectedRows > 0) inserted++; else skipped++;
    }

    console.log("─".repeat(48));
    console.log(`${dryRun ? "[dry-run] " : ""}Inseridos: ${inserted}`);
    console.log(`Ignorados (duplicados): ${skipped}`);
    console.log(`Sem nome (pulados): ${semNome}`);
    console.log(`Outliers de preço (preço zerado): ${outliers}`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("Falha na importação:", err.message);
  process.exit(1);
});
