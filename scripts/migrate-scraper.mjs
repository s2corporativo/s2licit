import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not set in environment');
  process.exit(1);
}

async function runMigration() {
  let connection;
  try {
    // Parse connection string
    const url = new URL(`mysql://${DATABASE_URL.replace('mysql://', '')}`);
    
    const sslConfig = url.hostname.includes('amazonaws.com') || url.hostname.includes('tidbcloud.com')
      ? { rejectUnauthorized: false }
      : false;

    connection = await mysql.createConnection({
      host: url.hostname,
      user: url.username,
      password: url.password,
      database: url.pathname.slice(1),
      ssl: sslConfig,
    });

    console.log('✓ Connected to database');

    // Read SQL migration file
    const sqlPath = path.join(__dirname, '../drizzle/0_scraper_tables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    // Split by semicolon and execute each statement
    const statements = sql
      .split(';')
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0 && !stmt.startsWith('--'));

    for (const statement of statements) {
      console.log(`Executing: ${statement.substring(0, 50)}...`);
      await connection.execute(statement);
      console.log('✓ Statement executed');
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('Tables created:');
    console.log('  - scraper_configs');
    console.log('  - scraper_logs');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

runMigration();
