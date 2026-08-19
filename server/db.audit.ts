import { getTableColumns, getTableName, is, sql } from 'drizzle-orm';
import { MySqlTable } from 'drizzle-orm/mysql-core';
import * as schema from '../drizzle/schema';
import { getDb } from './db';

export interface TableCheckResult {
  name: string;
  exists: boolean;
  columnCount?: number;
  expectedColumnCount?: number;
  missingColumns?: string[];
  unexpectedColumns?: string[];
  error?: string;
}

export interface DatabaseIntegrityReport {
  timestamp: Date;
  status: 'healthy' | 'warning' | 'critical';
  totalTables: number;
  missingTables: string[];
  tables: TableCheckResult[];
  summary: string;
}

const EXPECTED_TABLE_OBJECTS = Object.values(schema)
  .filter((value) => is(value as object, MySqlTable))
  .map((table) => table as MySqlTable)
  .sort((a, b) => getTableName(a).localeCompare(getTableName(b)));

const EXPECTED_TABLES = EXPECTED_TABLE_OBJECTS.map((table) => getTableName(table));

function expectedColumns(table: MySqlTable): string[] {
  return Object.values(getTableColumns(table)).map((column: any) => String(column.name)).sort();
}

export async function checkTableExists(tableName: string): Promise<TableCheckResult> {
  try {
    const db = await getDb();
    if (!db) return { name: tableName, exists: false, error: 'Database connection unavailable' };
    const rows = await db.execute(sql`
      SELECT COLUMN_NAME AS column_name
        FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${tableName}
       ORDER BY ORDINAL_POSITION
    `);
    const actual = (rows as unknown as Array<{ column_name: string }>).map((r) => String(r.column_name));
    const table = EXPECTED_TABLE_OBJECTS.find((t) => getTableName(t) === tableName);
    const expected = table ? expectedColumns(table) : [];
    if (actual.length === 0) return { name: tableName, exists: false, error: 'Table not found in database schema' };
    const actualSet = new Set(actual);
    const expectedSet = new Set(expected);
    const missingColumns = expected.filter((c) => !actualSet.has(c));
    const unexpectedColumns = actual.filter((c) => !expectedSet.has(c));
    return {
      name: tableName,
      exists: true,
      columnCount: actual.length,
      expectedColumnCount: expected.length,
      missingColumns,
      unexpectedColumns,
    };
  } catch (error) {
    return { name: tableName, exists: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function checkDatabaseIntegrity(): Promise<DatabaseIntegrityReport> {
  const timestamp = new Date();
  const tableResults: TableCheckResult[] = [];
  const missingTables: string[] = [];

  let actualByTable = new Map<string, string[]>();
  try {
    const db = await getDb();
    if (!db) throw new Error('Database connection unavailable');
    const rows = await db.execute(sql`
      SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
        FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
       ORDER BY TABLE_NAME, ORDINAL_POSITION
    `);
    for (const row of rows as unknown as Array<{ table_name: string; column_name: string }>) {
      const table = String(row.table_name);
      const list = actualByTable.get(table) ?? [];
      list.push(String(row.column_name));
      actualByTable.set(table, list);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      timestamp,
      status: 'critical',
      totalTables: EXPECTED_TABLES.length,
      missingTables: [...EXPECTED_TABLES],
      tables: EXPECTED_TABLES.map((name) => ({ name, exists: false, error: message })),
      summary: `Falha ao consultar o banco: ${message}`,
    };
  }

  let tablesWithColumnDrift = 0;
  for (const table of EXPECTED_TABLE_OBJECTS) {
    const tableName = getTableName(table);
    const actual = actualByTable.get(tableName);
    if (!actual) {
      missingTables.push(tableName);
      tableResults.push({ name: tableName, exists: false, error: 'Table not found in database schema' });
      continue;
    }
    const expected = expectedColumns(table);
    const actualSet = new Set(actual);
    const expectedSet = new Set(expected);
    const missingColumns = expected.filter((c) => !actualSet.has(c));
    const unexpectedColumns = actual.filter((c) => !expectedSet.has(c));
    if (missingColumns.length > 0) tablesWithColumnDrift++;
    tableResults.push({
      name: tableName,
      exists: true,
      columnCount: actual.length,
      expectedColumnCount: expected.length,
      missingColumns,
      unexpectedColumns,
    });
  }

  let status: 'healthy' | 'warning' | 'critical' = 'healthy';
  if (missingTables.length > 0 || tablesWithColumnDrift > 0) status = 'critical';
  else if (tableResults.some((t) => (t.unexpectedColumns?.length ?? 0) > 0)) status = 'warning';

  const summary = status === 'healthy'
    ? `Banco íntegro: ${tableResults.length} tabelas e colunas Drizzle verificadas`
    : `Schema divergente: ${missingTables.length} tabela(s) ausente(s), ${tablesWithColumnDrift} tabela(s) com coluna(s) esperada(s) ausente(s).`;

  return { timestamp, status, totalTables: EXPECTED_TABLES.length, missingTables, tables: tableResults, summary };
}

export async function checkForeignKeyIntegrity(): Promise<Record<string, any>> {
  try {
    const db = await getDb();
    if (!db) return { status: 'error', error: 'Database connection unavailable' };
    const result = await db.execute(sql`
      SELECT CONSTRAINT_NAME, TABLE_NAME, REFERENCED_TABLE_NAME
        FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = DATABASE()
    `);
    return { status: 'ok', foreignKeys: result, count: (result as any[]).length };
  } catch (error) {
    return { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function getDatabaseStats(): Promise<Record<string, any>> {
  try {
    const db = await getDb();
    if (!db) return { status: 'error', error: 'Database connection unavailable' };
    const result = await db.execute(sql`
      SELECT TABLE_NAME, TABLE_ROWS,
             ROUND(((data_length + index_length) / 1024 / 1024), 2) AS size_mb
        FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
       ORDER BY TABLE_ROWS DESC
    `);
    const indexes = await db.execute(sql`
      SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
        FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
       ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
    `);
    return { status: 'ok', tables: result, indexes };
  } catch (error) {
    return { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
