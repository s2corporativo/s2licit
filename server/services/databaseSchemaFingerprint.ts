import { sql } from "drizzle-orm";
import { getDb } from "../db";

export interface ColumnFingerprint {
  tableName: string;
  columnName: string;
  columnType: string;
  nullable: boolean;
  defaultValue: string | null;
  extra: string;
}

export interface IndexFingerprint {
  tableName: string;
  indexName: string;
  nonUnique: boolean;
  sequence: number;
  columnName: string | null;
}

/**
 * Snapshot estrutural auditável do banco real. É mais forte que apenas contar
 * tabelas/colunas e permite comparar ambientes antes/depois de migrations.
 */
export async function getDatabaseSchemaFingerprint(): Promise<{
  columns: ColumnFingerprint[];
  indexes: IndexFingerprint[];
}> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  // db.execute() do mysql2/drizzle devolve a tupla [rows, fields], não a
  // lista de linhas — mesmo defeito corrigido em server/db.audit.ts. Sem o
  // desestruturar, .map() abaixo rodava sobre a tupla de 2 elementos.
  const [columnRows] = await db.execute(sql`
    SELECT TABLE_NAME AS tableName,
           COLUMN_NAME AS columnName,
           COLUMN_TYPE AS columnType,
           IS_NULLABLE AS isNullable,
           COLUMN_DEFAULT AS defaultValue,
           EXTRA AS extra
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
     ORDER BY TABLE_NAME, ORDINAL_POSITION
  `);
  const [indexRows] = await db.execute(sql`
    SELECT TABLE_NAME AS tableName,
           INDEX_NAME AS indexName,
           NON_UNIQUE AS nonUnique,
           SEQ_IN_INDEX AS sequence,
           COLUMN_NAME AS columnName
      FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
     ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
  `);
  return {
    columns: (columnRows as unknown as any[]).map((r) => ({
      tableName: String(r.tableName),
      columnName: String(r.columnName),
      columnType: String(r.columnType),
      nullable: String(r.isNullable).toUpperCase() === "YES",
      defaultValue: r.defaultValue == null ? null : String(r.defaultValue),
      extra: String(r.extra ?? ""),
    })),
    indexes: (indexRows as unknown as any[]).map((r) => ({
      tableName: String(r.tableName),
      indexName: String(r.indexName),
      nonUnique: Number(r.nonUnique) !== 0,
      sequence: Number(r.sequence),
      columnName: r.columnName == null ? null : String(r.columnName),
    })),
  };
}
