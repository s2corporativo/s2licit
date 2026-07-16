import { sql } from "drizzle-orm";
import { getDb } from "../db";

/**
 * Garante colunas adicionadas fora do fluxo de migração do drizzle, de forma
 * idempotente no boot (mesmo padrão de ensurePasswordColumn). Assim a coluna
 * existe em produção sem depender do journal de migrações ter rodado.
 */
async function ensureColumn(table: string, column: string, definition: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const [rows] = await db.execute(
    sql`SELECT COUNT(*) as total FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}`,
  );
  const total = Number((rows as any)[0]?.total ?? 0);
  if (total === 0) {
    // table/column vêm de literais internos (não de input do usuário).
    await db.execute(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`));
    console.log(`[Schema] Coluna ${table}.${column} criada.`);
  }
}

/**
 * Colunas regulatórias/técnicas de produto usadas na equivalência veterinária
 * (via de administração e prazo de validade). Fecha o gap em que a equivalência
 * de medicamento não considerava via nem validade.
 */
export async function ensureProductColumns(): Promise<void> {
  try {
    await ensureColumn("products", "viaAdministracao", "VARCHAR(128) NULL");
    await ensureColumn("products", "validadeMeses", "INT NULL");
  } catch (err) {
    console.error("[Schema] Falha ao garantir colunas de produto:", err);
  }
}

/**
 * Colunas de segurança de autenticação e auditoria (§16, §18):
 * bloqueio de conta por tentativas inválidas e rastreabilidade de origem
 * (IP / user-agent) na trilha de auditoria.
 */
export async function ensureAuthSecurityColumns(): Promise<void> {
  try {
    await ensureColumn("users", "failedLoginAttempts", "INT NOT NULL DEFAULT 0");
    await ensureColumn("users", "lockedUntil", "TIMESTAMP NULL");
    await ensureColumn("audit_logs", "ipAddress", "VARCHAR(64) NULL");
    await ensureColumn("audit_logs", "userAgent", "VARCHAR(512) NULL");
  } catch (err) {
    console.error("[Schema] Falha ao garantir colunas de segurança/auditoria:", err);
  }
}

/** Configuração de validade da consulta de preço (§13). */
export async function ensureCompanySettingsColumns(): Promise<void> {
  try {
    await ensureColumn("company_settings", "priceValidityPreset", "VARCHAR(16) NULL DEFAULT '24h'");
    await ensureColumn("company_settings", "priceValidityCustomHours", "INT NULL");
  } catch (err) {
    console.error("[Schema] Falha ao garantir colunas de company_settings:", err);
  }
}
