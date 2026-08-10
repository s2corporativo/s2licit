import { sql } from "drizzle-orm";
import { getDb } from "../db";

const REQUIRED_TABLES = [
  "equivalence_compendium_entries",
  "equivalence_compendium_members",
  "equivalence_compendium_feedback",
  "product_field_provenance",
  "product_merge_events",
] as const;

let schemaReady = false;
let schemaCheck: Promise<void> | null = null;

/**
 * Verifica a infraestrutura do catálogo sem executar DDL durante requests.
 *
 * Em produção o schema é responsabilidade exclusiva das migrações versionadas.
 * Isso evita metadata locks, necessidade de privilégios ALTER/CREATE no usuário
 * da aplicação e corridas entre réplicas horizontais.
 *
 * O nome é mantido por compatibilidade com os consumidores existentes; a
 * operação agora é uma assertion idempotente e cacheada por processo.
 */
export async function ensureCatalogKnowledgeSchema(): Promise<void> {
  if (schemaReady) return;
  if (schemaCheck) return schemaCheck;

  schemaCheck = (async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco indisponível ao verificar o catálogo");

    const [rows] = await db.execute(sql`
      SELECT TABLE_NAME AS tableName
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (
          'equivalence_compendium_entries',
          'equivalence_compendium_members',
          'equivalence_compendium_feedback',
          'product_field_provenance',
          'product_merge_events'
        )
    `);

    const existing = new Set(
      (Array.isArray(rows) ? rows : []).map((row: any) => String(row.tableName)),
    );
    const missing = REQUIRED_TABLES.filter((table) => !existing.has(table));

    if (missing.length > 0) {
      throw new Error(
        `Schema do catálogo incompleto: ${missing.join(", ")}. Aplique as migrações do banco antes de iniciar esta versão.`,
      );
    }

    schemaReady = true;
  })().catch((error) => {
    schemaCheck = null;
    schemaReady = false;
    throw error;
  });

  return schemaCheck;
}
