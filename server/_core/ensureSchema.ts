import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { logger } from "./logger";

/**
 * Valida a presença de uma coluna sem alterar o banco. Migrations versionadas
 * são a única fonte de DDL, inclusive em desenvolvimento.
 */
async function ensureColumn(table: string, column: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const [rows] = await db.execute(
    sql`SELECT COUNT(*) as total FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}`,
  );
  const total = Number((rows as any)[0]?.total ?? 0);
  if (total === 0) logger.error(`[Schema] Coluna ausente: ${table}.${column}. Crie/aplique uma migration versionada.`);
}

export async function ensureProductColumns(): Promise<void> {
  try {
    await ensureColumn("products", "viaAdministracao");
    await ensureColumn("products", "validadeMeses");
  } catch (err) { logger.error("[Schema] Falha ao validar colunas de produto:", err); }
}

export async function ensureAuthSecurityColumns(): Promise<void> {
  try {
    await ensureColumn("users", "failedLoginAttempts");
    await ensureColumn("users", "lockedUntil");
    await ensureColumn("users", "mfaEnabled");
    await ensureColumn("users", "mfaSecret");
    await ensureColumn("users", "disabled");
    await ensureColumn("users", "sessionVersion");
    await ensureColumn("audit_logs", "ipAddress");
    await ensureColumn("audit_logs", "userAgent");
  } catch (err) { logger.error("[Schema] Falha ao validar colunas de segurança/auditoria:", err); }
}

export async function ensureCompanySettingsColumns(): Promise<void> {
  try {
    await ensureColumn("company_settings", "priceValidityPreset");
    await ensureColumn("company_settings", "priceValidityCustomHours");
  } catch (err) { logger.error("[Schema] Falha ao validar company_settings:", err); }
}

export async function ensureOfferColumns(): Promise<void> {
  try {
    await ensureColumn("product_supplier_offers", "promoPrice");
    await ensureColumn("product_supplier_offers", "stock");
  } catch (err) { logger.error("[Schema] Falha ao validar colunas de ofertas:", err); }
}

export async function ensureScraperColumns(): Promise<void> {
  try {
    await ensureColumn("supplier_sessions", "localStorage");
    await ensureColumn("scraper_logs", "evidenceUrl");
    await ensureColumn("scraper_configs", "tosAprovado");
  } catch (err) { logger.error("[Schema] Falha ao validar colunas do scraper:", err); }
}

export async function ensureQuotationAutomationColumns(): Promise<void> {
  try {
    await ensureColumn("email_quotations", "propostaPdfUrl");
    await ensureColumn("email_quotations", "propostaGeradaEm");
    await ensureColumn("email_quotations", "propostaMargemPercent");
    await ensureColumn("email_quotation_items", "matchAuto");
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
    if (tipo && !tipo.includes("'image'")) {
      logger.error("[Schema] email_quotations.sourceType sem 'image'. Crie/aplique uma migration versionada.");
    }
  } catch (err) { logger.error("[Schema] Falha ao validar email_quotations.sourceType:", err); }
}

export async function ensurePortalSessionColumns(): Promise<void> {
  try {
    await ensureColumn("portal_credentials", "sessaoCookies");
    await ensureColumn("portal_credentials", "sessaoExpiraEm");
    await ensureColumn("portal_credentials", "loginFailCount");
    await ensureColumn("proposals", "emailQuotationId");
    await ensureUniqueIndex("proposals", "emailQuotationId", "proposals_emailQuotationId_unique");
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
  if (total === 0) logger.error(`[Schema] Índice ausente: ${indexName} em ${table}.${column}. Crie/aplique uma migration versionada.`);
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
    if (tipo && !(tipo.includes("'ipi'") && tipo.includes("'pis'") && tipo.includes("'cofins'"))) {
      logger.error("[Schema] tax_rules.tipo sem IPI/PIS/COFINS. Crie/aplique uma migration versionada.");
    }
  } catch (err) { logger.error("[Schema] Falha ao validar tax_rules.tipo:", err); }
}

export async function ensureCaptureSourceTypes(): Promise<void> {
  const tabelas = ["captured_product_batches", "captured_product_source_logs"];
  try {
    const db = await getDb();
    if (!db) return;
    for (const tabela of tabelas) {
      const [rows] = await db.execute(
        sql`SELECT COLUMN_TYPE as t FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${tabela} AND COLUMN_NAME = 'sourceType'`,
      );
      const tipo = String((rows as any)[0]?.t ?? "");
      if (tipo && !tipo.includes("'image'")) {
        logger.error(`[Schema] ${tabela}.sourceType sem 'image'. Crie/aplique uma migration versionada.`);
      }
    }
  } catch (err) { logger.error("[Schema] Falha ao validar sourceType de captura:", err); }
}
