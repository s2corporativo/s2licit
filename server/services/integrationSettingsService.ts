/**
 * Credenciais e parâmetros gerais administráveis pela interface.
 *
 * Valores são armazenados criptografados em `integration_settings`. A leitura
 * efetiva é feita pelo CredentialResolver, que combina overrides do banco com
 * o snapshot imutável do ambiente de boot. Este serviço NÃO altera process.env.
 */
import cron from "node-cron";
import { eq, inArray } from "drizzle-orm";
import { integrationSettings } from "../../drizzle/schema";
import { getDb } from "../db";
import { encryptPassword, decryptPassword } from "../utils/encryption";
import {
  invalidateCredentialCache,
  resolveCredentialWithOrigin,
} from "../integrations/core/credentialResolver";

export const INTEGRATION_KEYS: Record<
  string,
  { label: string; secreta: boolean; grupo: string }
> = {
  WHATSAPP_PHONE_ID: { label: "ID do telefone (Meta Cloud API)", secreta: false, grupo: "whatsapp" },
  WHATSAPP_TOKEN: { label: "Token de acesso", secreta: true, grupo: "whatsapp" },
  WHATSAPP_API_VERSION: { label: "Versão da API", secreta: false, grupo: "whatsapp" },
  WHATSAPP_WEBHOOK_URL: { label: "Webhook próprio (Z-API/Twilio/n8n)", secreta: true, grupo: "whatsapp" },
  WHATSAPP_TO: { label: "Número(s) de destino", secreta: false, grupo: "whatsapp" },
  USD_BRL_RATE: { label: "Cotação USD→BRL (custo de IA)", secreta: false, grupo: "geral" },
  FIEMG_OPPORTUNITIES_URL: { label: "URL pública FIEMG / SESI / SENAI", secreta: false, grupo: "fontes" },
  COMPRASMG_OPPORTUNITIES_URL: { label: "URL pública Compras MG", secreta: false, grupo: "fontes" },
  CEMIG_OPPORTUNITIES_URL: { label: "URL pública CEMIG", secreta: false, grupo: "fontes" },
  COPASA_OPPORTUNITIES_URL: { label: "URL pública COPASA", secreta: false, grupo: "fontes" },
  // Alias legado: oculto da UI nova, mas ainda aceito durante a migração.
  FIEMG_LICITACOES_URL: { label: "URL FIEMG (legado)", secreta: false, grupo: "legado" },
  EMAIL_SYNC_ENABLED: { label: "Sincronização de e-mail ativa (true/false)", secreta: false, grupo: "automacao" },
  EMAIL_SYNC_CRON: { label: "Agenda de e-mail (cron)", secreta: false, grupo: "automacao" },
  ALERTS_ENABLED: { label: "Alertas automáticos ativos (true/false)", secreta: false, grupo: "automacao" },
  ALERTS_CRON: { label: "Agenda de alertas (cron)", secreta: false, grupo: "automacao" },
  SCRAPER_SCHEDULE_ENABLED: { label: "Captura programada ativa (true/false)", secreta: false, grupo: "automacao" },
  SCRAPER_SCHEDULE_CRON: { label: "Agenda de captura (cron)", secreta: false, grupo: "automacao" },
  PORTAL_OPPORTUNITY_SYNC_ENABLED: { label: "Radar automático ativo (true/false)", secreta: false, grupo: "automacao" },
  PORTAL_OPPORTUNITY_SYNC_CRON: { label: "Agenda do radar automático (cron)", secreta: false, grupo: "automacao" },
  BACKUP_ENABLED: { label: "Backup automático ativo (true/false)", secreta: false, grupo: "automacao" },
  BACKUP_CRON: { label: "Agenda do backup (cron)", secreta: false, grupo: "automacao" },
  BACKUP_KEEP_DAYS: { label: "Retenção de backups (dias)", secreta: false, grupo: "automacao" },
  FAILURE_ALERTS_ENABLED: { label: "Alertas de falha ativos (true/false)", secreta: false, grupo: "automacao" },
};

export type IntegrationView = Array<{
  chave: string;
  label: string;
  grupo: string;
  secreta: boolean;
  valor: string | null;
  temValor: boolean;
  origem: "interface" | "ambiente" | "nao_configurado";
}>;

function validateValue(chave: string, value: string): string {
  const valor = value.trim();
  if (!valor) throw new Error(`${chave}: valor vazio.`);

  if (chave.endsWith("_ENABLED") && !["true", "false", "1", "0"].includes(valor.toLowerCase())) {
    throw new Error(`${chave}: use true ou false.`);
  }
  if (chave.endsWith("_CRON") && !cron.validate(valor)) {
    throw new Error(`${chave}: expressão cron inválida.`);
  }
  if (chave === "BACKUP_KEEP_DAYS") {
    const days = Number(valor);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      throw new Error("BACKUP_KEEP_DAYS: informe um número inteiro entre 1 e 365.");
    }
  }
  if (
    chave === "FIEMG_LICITACOES_URL" ||
    chave.endsWith("_OPPORTUNITIES_URL") ||
    chave === "WHATSAPP_WEBHOOK_URL"
  ) {
    let parsed: URL;
    try {
      parsed = new URL(valor);
    } catch {
      throw new Error(`${chave}: URL inválida.`);
    }
    if (!["https:", "http:"].includes(parsed.protocol)) {
      throw new Error(`${chave}: somente HTTP/HTTPS é permitido.`);
    }
  }
  if (chave === "USD_BRL_RATE") {
    const rate = Number(valor.replace(",", "."));
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100) {
      throw new Error("USD_BRL_RATE: informe uma cotação positiva e plausível.");
    }
  }
  if (chave === "WHATSAPP_API_VERSION" && !/^v\d+(?:\.\d+)?$/i.test(valor)) {
    throw new Error("WHATSAPP_API_VERSION: formato esperado vNN.N.");
  }
  if (chave === "WHATSAPP_TO") {
    const invalid = valor
      .split(",")
      .map((item) => item.replace(/\D/g, ""))
      .some((item) => item.length < 10 || item.length > 15);
    if (invalid) throw new Error("WHATSAPP_TO: informe números E.164 válidos separados por vírgula.");
  }
  return valor;
}

export async function getIntegrationView(): Promise<IntegrationView> {
  const db = await getDb().catch(() => null);
  const rows = db
    ? await db
        .select()
        .from(integrationSettings)
        .where(inArray(integrationSettings.chave, Object.keys(INTEGRATION_KEYS)))
    : [];
  const byKey = new Map(rows.map((row) => [row.chave, row] as const));

  const visibleEntries = Object.entries(INTEGRATION_KEYS).filter(([, meta]) => meta.grupo !== "legado");
  return Promise.all(
    visibleEntries.map(async ([chave, meta]) => {
      const row = byKey.get(chave);
      const resolved = await resolveCredentialWithOrigin(chave);
      let valor: string | null = null;
      if (!meta.secreta) {
        if (row?.valorEnc) {
          try {
            valor = decryptPassword(row.valorEnc);
          } catch {
            valor = null;
          }
        } else {
          valor = resolved.value ?? null;
        }
      }
      return {
        chave,
        label: meta.label,
        grupo: meta.grupo,
        secreta: meta.secreta,
        valor,
        temValor: Boolean(resolved.value),
        origem: resolved.origin,
      };
    }),
  );
}

/** Valor vazio mantém o atual. Remoção é feita pela operação explícita `remove`. */
export async function saveIntegrationSettings(entries: Record<string, string>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  for (const [chave, rawValue] of Object.entries(entries)) {
    if (!(chave in INTEGRATION_KEYS)) throw new Error(`Chave de integração não permitida: ${chave}.`);
    if (rawValue == null || rawValue.trim() === "") continue;
    const valor = validateValue(chave, rawValue);
    const valorEnc = encryptPassword(valor);
    const [existing] = await db
      .select({ id: integrationSettings.id })
      .from(integrationSettings)
      .where(eq(integrationSettings.chave, chave))
      .limit(1);
    if (existing) {
      await db.update(integrationSettings).set({ valorEnc }).where(eq(integrationSettings.id, existing.id));
    } else {
      await db.insert(integrationSettings).values({ chave, valorEnc });
    }
  }
  invalidateCredentialCache();
}

export async function removeIntegrationSetting(chave: string): Promise<void> {
  if (!(chave in INTEGRATION_KEYS)) throw new Error(`Chave de integração não permitida: ${chave}.`);
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.delete(integrationSettings).where(eq(integrationSettings.chave, chave));
  invalidateCredentialCache();
}

/**
 * Compatibilidade com o boot antigo. Nada é injetado em process.env; apenas
 * invalida o cache para que a próxima leitura use banco + ambiente original.
 */
export async function applyIntegrationSettingsFromDb(): Promise<void> {
  invalidateCredentialCache();
}
