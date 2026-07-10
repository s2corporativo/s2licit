import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';

const migrationPath = new URL('../drizzle/0020_patch_modulos_avancados_s2.sql', import.meta.url);
const sql = await fs.readFile(migrationPath, 'utf8');

const statements = sql
  .split(/;\s*\n/)
  .map((chunk) => chunk.trim())
  .filter(Boolean)
  .map((chunk) => (chunk.endsWith(';') ? chunk : `${chunk};`));

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não definida');
}

const connection = await mysql.createConnection(process.env.DATABASE_URL);

try {
  const ignorableCodes = new Set(['ER_TABLE_EXISTS_ERROR', 'ER_DUP_KEYNAME', 'ER_DUP_FIELDNAME', 'ER_DUP_ENTRY']);

  for (const [index, statement] of statements.entries()) {
    console.log(`Aplicando ${index + 1}/${statements.length}: ${statement.slice(0, 90)}...`);
    try {
      await connection.execute(statement);
    } catch (error) {
      if (ignorableCodes.has(error?.code)) {
        console.log(`Ignorando ${error.code}: ${error.sqlMessage}`);
        continue;
      }
      throw error;
    }
  }
  console.log(`Migração aplicada com sucesso. Total de instruções: ${statements.length}`);
} finally {
  await connection.end();
}
