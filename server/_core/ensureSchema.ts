import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { logger } from "./logger";

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
    logger.info(`[Schema] Coluna ${table}.${column} criada.`);
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
    logger.error("[Schema] Falha ao garantir colunas de produto:", err);
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
    await ensureColumn("users", "mfaEnabled", "BOOLEAN NOT NULL DEFAULT FALSE");
    await ensureColumn("users", "mfaSecret", "TEXT NULL");
    await ensureColumn("users", "disabled", "BOOLEAN NOT NULL DEFAULT FALSE");
    await ensureColumn("users", "sessionVersion", "INT NOT NULL DEFAULT 0");
    await ensureColumn("audit_logs", "ipAddress", "VARCHAR(64) NULL");
    await ensureColumn("audit_logs", "userAgent", "VARCHAR(512) NULL");
  } catch (err) {
    logger.error("[Schema] Falha ao garantir colunas de segurança/auditoria:", err);
  }
}

/** Configuração de validade da consulta de preço (§13). */
export async function ensureCompanySettingsColumns(): Promise<void> {
  try {
    await ensureColumn("company_settings", "priceValidityPreset", "VARCHAR(16) NULL DEFAULT '24h'");
    await ensureColumn("company_settings", "priceValidityCustomHours", "INT NULL");
  } catch (err) {
    logger.error("[Schema] Falha ao garantir colunas de company_settings:", err);
  }
}

/** Campos ampliados coletados do fornecedor (§7): promocional e estoque. */
export async function ensureOfferColumns(): Promise<void> {
  try {
    await ensureColumn("product_supplier_offers", "promoPrice", "DECIMAL(12,2) NULL");
    await ensureColumn("product_supplier_offers", "stock", "INT NULL");
  } catch (err) {
    logger.error("[Schema] Falha ao garantir colunas de ofertas:", err);
  }
}

/**
 * Colunas do conector de fornecedores:
 * - supplier_sessions.localStorage: reuso de sessão de SPAs que guardam o token
 *   de autenticação no localStorage (não só em cookies), criptografado no cofre.
 * - scraper_logs.evidenceUrl: print da tela capturado quando a raspagem falha,
 *   para diagnosticar mudança de layout sem expor a senha (§9).
 */
export async function ensureScraperColumns(): Promise<void> {
  try {
    await ensureColumn("supplier_sessions", "localStorage", "TEXT NULL");
    await ensureColumn("scraper_logs", "evidenceUrl", "VARCHAR(512) NULL");
  } catch (err) {
    logger.error("[Schema] Falha ao garantir colunas do conector de fornecedores:", err);
  }
}

/**
 * IPI/PIS/COFINS como tipos de 1ª classe no Motor Tributário (§9). Estende o
 * enum tax_rules.tipo de forma idempotente (só altera se ainda não os inclui).
 */
export async function ensureTaxRuleTypes(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const [rows] = await db.execute(
      sql`SELECT COLUMN_TYPE as t FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tax_rules' AND COLUMN_NAME = 'tipo'`,
    );
    const tipo = String((rows as any)[0]?.t ?? "");
    if (!tipo) return; // tabela ainda não criada
    if (tipo.includes("'ipi'") && tipo.includes("'pis'") && tipo.includes("'cofins'")) return;
    await db.execute(
      sql.raw(
        "ALTER TABLE `tax_rules` MODIFY COLUMN `tipo` " +
          "ENUM('simples_efetiva','icms','difal','st','fcp','iss','ipi','pis','cofins','outro') NOT NULL",
      ),
    );
    logger.info("[Schema] Enum tax_rules.tipo estendido com IPI/PIS/COFINS.");
  } catch (err) {
    logger.error("[Schema] Falha ao estender tax_rules.tipo:", err);
  }
}

/**
 * Inclui "image" no enum sourceType das tabelas de captura (§2 — OCR de imagem
 * digitalizada). Idempotente: só altera se o valor ainda não existe.
 */
export async function ensureCaptureSourceTypes(): Promise<void> {
  const tabelas = ["captured_product_batches", "captured_product_source_logs"];
  const enumDef =
    "ENUM('url','html','pdf','spreadsheet','xml','docx','text','image') NOT NULL";
  try {
    const db = await getDb();
    if (!db) return;
    for (const tabela of tabelas) {
      const [rows] = await db.execute(
        sql`SELECT COLUMN_TYPE as t FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${tabela} AND COLUMN_NAME = 'sourceType'`,
      );
      const tipo = String((rows as any)[0]?.t ?? "");
      if (!tipo || tipo.includes("'image'")) continue;
      await db.execute(sql.raw(`ALTER TABLE \`${tabela}\` MODIFY COLUMN \`sourceType\` ${enumDef}`));
      logger.info(`[Schema] Enum ${tabela}.sourceType estendido com 'image'.`);
    }
  } catch (err) {
    logger.error("[Schema] Falha ao estender sourceType das tabelas de captura:", err);
  }
}
