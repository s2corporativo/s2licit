import { getTableName, is, sql } from 'drizzle-orm';
import { MySqlTable } from 'drizzle-orm/mysql-core';
import * as schema from '../drizzle/schema';
import { getDb } from './db';

export interface TableCheckResult {
  name: string;
  exists: boolean;
  columnCount?: number;
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

// Derivada do próprio schema Drizzle — nunca fica defasada em relação ao código.
const EXPECTED_TABLES = Object.values(schema)
  .filter((value) => is(value as object, MySqlTable))
  .map((table) => getTableName(table as MySqlTable))
  .sort();

/**
 * Verifica a existência de uma tabela no banco de dados
 */
export async function checkTableExists(tableName: string): Promise<TableCheckResult> {
  try {
    const db = await getDb();
    if (!db) {
      return {
        name: tableName,
        exists: false,
        error: 'Database connection unavailable',
      };
    }
    const result = await db.execute(
      sql`SELECT COUNT(*) as column_count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${tableName}`
    );
    
    const columnCount = (result[0] as any)?.column_count || 0;
    
    if (columnCount === 0) {
      return {
        name: tableName,
        exists: false,
        error: 'Table not found in database schema',
      };
    }

    return {
      name: tableName,
      exists: true,
      columnCount,
    };
  } catch (error) {
    return {
      name: tableName,
      exists: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Verifica a integridade completa do banco de dados
 */
export async function checkDatabaseIntegrity(): Promise<DatabaseIntegrityReport> {
  const timestamp = new Date();
  const tableResults: TableCheckResult[] = [];
  const missingTables: string[] = [];

  // Uma única consulta ao information_schema cobre todas as tabelas esperadas
  const columnCounts = new Map<string, number>();
  try {
    const db = await getDb();
    if (!db) {
      throw new Error('Database connection unavailable');
    }
    const rows = await db.execute(
      sql`SELECT TABLE_NAME as table_name, COUNT(*) as column_count
          FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
          GROUP BY TABLE_NAME`
    );
    for (const row of rows as unknown as Array<{ table_name: string; column_count: number }>) {
      columnCounts.set(row.table_name, Number(row.column_count));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      timestamp,
      status: 'critical',
      totalTables: EXPECTED_TABLES.length,
      missingTables: [...EXPECTED_TABLES],
      tables: EXPECTED_TABLES.map((name) => ({ name, exists: false, error: message })),
      summary: `✗ Falha ao consultar o banco: ${message}`,
    };
  }

  for (const tableName of EXPECTED_TABLES) {
    const columnCount = columnCounts.get(tableName);
    if (columnCount === undefined) {
      tableResults.push({ name: tableName, exists: false, error: 'Table not found in database schema' });
      missingTables.push(tableName);
    } else {
      tableResults.push({ name: tableName, exists: true, columnCount });
    }
  }

  // Determinar status geral
  let status: 'healthy' | 'warning' | 'critical' = 'healthy';
  if (missingTables.length > 0 && missingTables.length <= 3) {
    status = 'warning';
  } else if (missingTables.length > 3) {
    status = 'critical';
  }

  const summary = 
    missingTables.length === 0
      ? `✓ Banco íntegro: ${tableResults.length} tabelas verificadas com sucesso`
      : `⚠ ${missingTables.length} tabela(s) ausente(s): ${missingTables.join(', ')}`;

  return {
    timestamp,
    status,
    totalTables: EXPECTED_TABLES.length,
    missingTables,
    tables: tableResults,
    summary,
  };
}

/**
 * Verifica chaves estrangeiras e relacionamentos críticos
 */
export async function checkForeignKeyIntegrity(): Promise<Record<string, any>> {
  try {
    const db = await getDb();
    if (!db) {
      return {
        status: 'error',
        error: 'Database connection unavailable',
      };
    }
    const result = await db.execute(
      sql`SELECT CONSTRAINT_NAME, TABLE_NAME, REFERENCED_TABLE_NAME 
          FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS 
          WHERE CONSTRAINT_SCHEMA = DATABASE()`
    );
    
    return {
      status: 'ok',
      foreignKeys: result,
      count: (result as any[]).length,
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Retorna estatísticas gerais do banco
 */
export async function getDatabaseStats(): Promise<Record<string, any>> {
  try {
    const db = await getDb();
    if (!db) {
      return {
        status: 'error',
        error: 'Database connection unavailable',
      };
    }
    const result = await db.execute(
      sql`SELECT 
            TABLE_NAME,
            TABLE_ROWS,
            ROUND(((data_length + index_length) / 1024 / 1024), 2) AS size_mb
          FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE()
          ORDER BY TABLE_ROWS DESC`
    );
    
    return {
      status: 'ok',
      tables: result,
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
