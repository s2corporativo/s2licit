import { createConnection } from 'mysql2/promise';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, '../drizzle/migrations/0050_pricing_tables.sql');
const sql = readFileSync(sqlPath, 'utf8');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const conn = await createConnection(url);

// Split SQL into individual statements - handle multi-line CREATE TABLE
// Remove comment lines first, then split on semicolons
const cleanSql = sql
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n');

const statements = cleanSql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 10);

console.log(`Applying ${statements.length} statements...`);

for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    const preview = stmt.substring(0, 80).replace(/\n/g, ' ');
    console.log(`✅ OK: ${preview}`);
  } catch (err) {
    const preview = stmt.substring(0, 80).replace(/\n/g, ' ');
    console.log(`❌ ERR: ${preview}`);
    console.log(`   ${err.message}`);
  }
}

await conn.end();
console.log('Migration complete.');
