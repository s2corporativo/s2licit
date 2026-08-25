import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { logger } from "./logger";
import { schemaBootDdlEnabled } from "../services/schemaBootPolicy";

let warnedDdlDisabled = false;
function canAlterSchema(): boolean {
  const enabled = schemaBootDdlEnabled();
  if (!enabled && !warnedDdlDisabled) {
    warnedDdlDisabled = true;
    logger.info("[Schema] DDL de boot desativado: migrations são a fonte única do schema em produção.");
  }
  return enabled;
}

/**
 * Em produção esta função é VALIDADORA: consulta a coluna e registra erro se
 * faltar, mas não altera o banco. Em desenvolvimento pode manter o fallback
 * legado quando SCHEMA_BOOT_DDL_ENABLED=true.
 */
async function ensureColumn(table: string, column: string, definition: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const [rows] = await db.execute(
    sql`SELECT COUNT(*) as total FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}`,
  );
  const total = Number((rows as any)[0]?.total ?? 0);
  if (total > 0) return;
  if (!canAlterSchema()) {
    logger.error(`[Schema] Coluna ausente: ${table}.${column}. Crie/aplique uma migration versionada.`);
    return;
  }
  await db.execute(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`));
  logger.info(`[Schema] Coluna ${table}.${column} criada em modo de desenvolvimento.`);
}

export async function ensureProductColumns(): Promise<void> {
  try {
    await ensureColumn("products", "viaAdministracao", "VARCHAR(128) NULL");
    await ensureColumn("products", "validadeMeses", "INT NULL");
  } catch (err) { logger.error("[Schema] Falha ao validar colunas de produto:", err); }
}

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
  } catch (err) { logger.error("[Schema] Falha ao validar colunas de segurança/auditoria:", err); }
}

export async function ensureCompanySettingsColumns(): Promise<void> {
  try {
    await ensureColumn("company_settings", "priceValidityPreset", "VARCHAR(16) NULL DEFAULT '24h'");
    await ensureColumn("company_settings", "priceValidityCustomHours", "INT NULL");
  } catch (err) { logger.error("[Schema] Falha ao validar company_settings:", err); }
}

export async function ensureOfferColumns(): Promise<void> {
  try {
    await ensureColumn("product_supplier_offers", "promoPrice", "DECIMAL(12,2) NULL");
    await ensureColumn("product_supplier_offers", "stock", "INT NULL");
  } catch (err) { logger.error("[Schema] Falha ao validar colunas de ofertas:", err); }
}

export async function ensureScraperColumns(): Promise<void> {
  try {
    await ensureColumn("supplier_sessions", "localStorage", "TEXT NULL");
    await ensureColumn("scraper_logs", "evidenceUrl", "VARCHAR(512) NULL");
    await ensureColumn("scraper_configs", "tosAprovado", "BOOLEAN NOT NULL DEFAULT TRUE");
  } catch (err) { logger.error("[Schema] Falha ao validar colunas do scraper:", err); }
}

export async function ensureQuotationAutomationColumns(): Promise<void> {
  try {
    await ensureColumn("email_quotations", "propostaPdfUrl", "TEXT NULL");
    await ensureColumn("email_quotations", "propostaGeradaEm", "TIMESTAMP NULL");
    await ensureColumn("email_quotations", "propostaMargemPercent", "DECIMAL(5,2) NULL");
    await ensureColumn("email_quotation_items", "matchAuto", "BOOLEAN NOT NULL DEFAULT FALSE");
  } catch (err) { logger.error("[Schema] Falha ao validar colunas de proposta automática:", err); }
}

export async function ensureEmailQuotationImageSourceType(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const [rows] = await db.execute(
      sql`SELECT COLUMN_TYPE as t FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'email_quotations' AND COLUMN_NAME = 'sourceType'`,
    );
    const tipo = String((rows as any)[0]?.t ?? "");
    if (!tipo || tipo.includes("'image'")) return;
    if (!canAlterSchema()) {
      logger.error("[Schema] email_quotations.sourceType sem 'image'. Corrija via migration.");
      return;
    }
    await db.execute(sql.raw(
      "ALTER TABLE `email_quotations` MODIFY COLUMN `sourceType` " +
      "ENUM('spreadsheet','pdf','docx','image','body','manual') NOT NULL DEFAULT 'body'",
    ));
    logger.info("[Schema] Enum email_quotations.sourceType ajustado em desenvolvimento.");
  } catch (err) { logger.error("[Schema] Falha ao validar email_quotations.sourceType:", err); }
}

export async function ensurePortalSessionColumns(): Promise<void> {
  try {
    await ensureColumn("portal_credentials", "sessaoCookies", "TEXT NULL");
    await ensureColumn("portal_credentials", "sessaoExpiraEm", "TIMESTAMP NULL");
    await ensureColumn("portal_credentials", "loginFailCount", "INT NOT NULL DEFAULT 0");
    await ensureColumn("proposals", "emailQuotationId", "INT NULL");
    await ensureUniqueIndex("proposals", "emailQuotationId", "uq_proposals_email_quotation");
  } catch (err) { logger.error("[Schema] Falha ao validar colunas de sessão de portal:", err); }
}

async function ensureUniqueIndex(table: string, column: string, indexName: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const [rows] = await db.execute(
    sql`SELECT COUNT(*) as total FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND INDEX_NAME = ${indexName}`,
  );
  const total = Number((rows as any)[0]?.total ?? 0);
  if (total > 0) return;
  if (!canAlterSchema()) {
    logger.error(`[Schema] Índice ausente: ${indexName} em ${table}.${column}. Corrija via migration.`);
    return;
  }
  await db.execute(sql.raw(`ALTER TABLE \`${table}\` ADD UNIQUE INDEX \`${indexName}\` (\`${column}\`)`));
  logger.info(`[Schema] Índice ${indexName} criado em desenvolvimento.`);
}

export async function ensureTaxRuleTypes(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const [rows] = await db.execute(
      sql`SELECT COLUMN_TYPE as t FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tax_rules' AND COLUMN_NAME = 'tipo'`,
    );
    const tipo = String((rows as any)[0]?.t ?? "");
    if (!tipo) return;
    if (tipo.includes("'ipi'") && tipo.includes("'pis'") && tipo.includes("'cofins'")) return;
    if (!canAlterSchema()) {
      logger.error("[Schema] tax_rules.tipo sem IPI/PIS/COFINS. Corrija via migration.");
      return;
    }
    await db.execute(sql.raw(
      "ALTER TABLE `tax_rules` MODIFY COLUMN `tipo` " +
      "ENUM('simples_efetiva','icms','difal','st','fcp','iss','ipi','pis','cofins','outro') NOT NULL",
    ));
    logger.info("[Schema] tax_rules.tipo ajustado em desenvolvimento.");
  } catch (err) { logger.error("[Schema] Falha ao validar tax_rules.tipo:", err); }
}

export async function ensureCaptureSourceTypes(): Promise<void> {
  const tabelas = ["captured_product_batches", "captured_product_source_logs"];
  const enumDef = "ENUM('url','html','pdf','spreadsheet','xml','docx','text','image') NOT NULL";
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
      if (!canAlterSchema()) {
        logger.error(`[Schema] ${tabela}.sourceType sem 'image'. Corrija via migration.`);
        continue;
      }
      await db.execute(sql.raw(`ALTER TABLE \`${tabela}\` MODIFY COLUMN \`sourceType\` ${enumDef}`));
      logger.info(`[Schema] ${tabela}.sourceType ajustado em desenvolvimento.`);
    }
  } catch (err) { logger.error("[Schema] Falha ao validar sourceType de captura:", err); }
}
