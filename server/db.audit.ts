import { sql } from 'drizzle-orm';
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

const EXPECTED_TABLES = [
  'categories',
  'suppliers',
  'products',
  'product_equivalences',
  'import_logs',
  'company_settings',
  'requesting_orgs',
  'proposals',
  'proposal_items',
  'financial_entries',
  'proposal_status_history',
  'users',
  'product_capture_history',
  'documentos_habilitacao',
  'diligencia_workflows',
  'proposal_templates',
  'capture_action_history',
  'api_logs',
];

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

  // Verificar todas as tabelas esperadas
  for (const tableName of EXPECTED_TABLES) {
    const result = await checkTableExists(tableName);
    tableResults.push(result);
    
    if (!result.exists) {
      missingTables.push(tableName);
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
