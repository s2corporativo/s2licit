/**
 * Carrega BASE_PRODUTOS_SISTEMA.csv na tabela master_products.
 * Uso: node scripts/load-master-products.mjs /caminho/para/BASE_PRODUTOS_SISTEMA.csv
 */
import { createConnection } from "mysql2/promise";
import { createReadStream } from "fs";
import { parse } from "csv-parse";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

const csvPath = process.argv[2] || resolve(__dirname, "../../upload/BASE_PRODUTOS_SISTEMA.csv");

// Parse TiDB/MySQL URL: mysql://user:pass@host:port/db?ssl=...
function parseDbUrl(url) {
  const m = url.match(/mysql(?:\+\w+)?:\/\/([^:]+):([^@]+)@([^:/]+):?(\d+)?\/([^?]+)/);
  if (!m) throw new Error("Cannot parse DATABASE_URL: " + url);
  const [, user, password, host, port, database] = m;
  return { user, password, host, port: port ? parseInt(port) : 4000, database };
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");

  const { user, password, host, port, database } = parseDbUrl(dbUrl);

  console.log(`Connecting to ${host}:${port}/${database}...`);
  const conn = await createConnection({
    host, port, user, password, database,
    ssl: { rejectUnauthorized: true },
    multipleStatements: false,
  });

  // Limpa antes de recarregar
  await conn.execute("DELETE FROM master_products");
  console.log("Cleared existing rows.");

  const rows = [];
  await new Promise((resolve, reject) => {
    createReadStream(csvPath)
      .pipe(parse({ columns: true, skip_empty_lines: true, trim: true }))
      .on("data", (row) => {
        const name = (row["nome_produto"] || "").trim();
        if (!name) return;
        rows.push([
          (row["ean"] || "").trim() || null,
          (row["registro_mapa"] || "").trim() || null,
          name,
          (row["composicao"] || "").trim() || null,
          (row["marca"] || "").trim() || null,
          (row["forma_concentracao"] || "").trim() || null,
          (row["apresentacao"] || "").trim() || null,
          (row["categoria"] || "").trim() || null,
        ]);
      })
      .on("end", resolve)
      .on("error", reject);
  });

  console.log(`Parsed ${rows.length} rows from CSV.`);

  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const placeholders = batch.map(() => "(?,?,?,?,?,?,?,?)").join(",");
    const values = batch.flat();
    await conn.execute(
      `INSERT INTO master_products
       (ean, codigoMapa, name, activeIngredient, manufacturer, concentration, presentation, categoryName)
       VALUES ${placeholders}`,
      values
    );
    inserted += batch.length;
    process.stdout.write(`\r  Inserted ${inserted}/${rows.length}...`);
  }

  console.log(`\nDone! ${inserted} products loaded into master_products.`);
  await conn.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
