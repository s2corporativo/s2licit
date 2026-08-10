import { inArray } from "drizzle-orm";
import { aiSettings, emailSettings, integrationSettings } from "../../../drizzle/schema";
import { getDb } from "../../db";
import { logger } from "../../_core/logger";
import { decryptPassword } from "../../utils/encryption";

/**
 * Snapshot imutável do ambiente de boot. Runtime nunca escreve em process.env.
 * Isso preserva o fallback original mesmo depois de uma credencial da interface
 * ser removida, eliminando o comportamento em que "voltar ao ambiente" só
 * funcionava depois de reiniciar o processo.
 */
const BOOTSTRAP_ENV = Object.freeze({ ...process.env });

export type CredentialOrigin = "interface" | "ambiente" | "nao_configurado";

interface RuntimeSnapshot {
  values: Map<string, string>;
  origins: Map<string, CredentialOrigin>;
  loadedAt: number;
}

const CACHE_TTL_MS = 5_000;
let cached: RuntimeSnapshot | null = null;
let loadPromise: Promise<RuntimeSnapshot> | null = null;

const GENERAL_KEYS = [
  "WHATSAPP_PHONE_ID",
  "WHATSAPP_TOKEN",
  "WHATSAPP_API_VERSION",
  "WHATSAPP_WEBHOOK_URL",
  "WHATSAPP_TO",
  "USD_BRL_RATE",
  "FIEMG_LICITACOES_URL",
  "EMAIL_SYNC_ENABLED",
  "EMAIL_SYNC_CRON",
  "ALERTS_ENABLED",
  "ALERTS_CRON",
  "SCRAPER_SCHEDULE_ENABLED",
  "SCRAPER_SCHEDULE_CRON",
  "PORTAL_OPPORTUNITY_SYNC_ENABLED",
  "PORTAL_OPPORTUNITY_SYNC_CRON",
] as const;

const KNOWN_ENV_KEYS = [
  ...GENERAL_KEYS,
  "AI_PROVIDER",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "GROQ_API_KEY",
  "GROQ_MODEL",
  "BUILT_IN_FORGE_API_URL",
  "BUILT_IN_FORGE_API_KEY",
  "LLM_TIMEOUT_MS",
  "IMAP_HOST",
  "IMAP_PORT",
  "IMAP_USER",
  "IMAP_PASSWORD",
  "IMAP_TLS",
  "IMAP_MAILBOX",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_SECURE",
  "SMTP_FROM",
] as const;

function setValue(
  values: Map<string, string>,
  origins: Map<string, CredentialOrigin>,
  key: string,
  value: unknown,
  origin: CredentialOrigin,
) {
  if (value == null) return;
  const normalized = String(value).trim();
  if (!normalized) return;
  values.set(key, normalized);
  origins.set(key, origin);
}

function decryptInto(
  values: Map<string, string>,
  origins: Map<string, CredentialOrigin>,
  key: string,
  encrypted: string | null | undefined,
) {
  if (!encrypted) return;
  try {
    setValue(values, origins, key, decryptPassword(encrypted), "interface");
  } catch (error) {
    logger.error(`[CredentialResolver] Não foi possível decriptar ${key}:`, error);
  }
}

async function loadSnapshot(): Promise<RuntimeSnapshot> {
  const values = new Map<string, string>();
  const origins = new Map<string, CredentialOrigin>();

  // Primeiro, a configuração imutável do processo vira fallback.
  for (const key of KNOWN_ENV_KEYS) {
    const value = BOOTSTRAP_ENV[key];
    if (value?.trim()) setValue(values, origins, key, value, "ambiente");
  }

  const db = await getDb().catch(() => null);
  if (!db) return { values, origins, loadedAt: Date.now() };

  try {
    const [aiRows, emailRows, generalRows] = await Promise.all([
      db.select().from(aiSettings).limit(1),
      db.select().from(emailSettings).limit(1),
      db
        .select()
        .from(integrationSettings)
        .where(inArray(integrationSettings.chave, [...GENERAL_KEYS])),
    ]);

    const ai = aiRows[0];
    if (ai) {
      setValue(values, origins, "AI_PROVIDER", ai.aiProvider, "interface");
      decryptInto(values, origins, "ANTHROPIC_API_KEY", ai.anthropicApiKeyEnc);
      setValue(values, origins, "ANTHROPIC_MODEL", ai.anthropicModel, "interface");
      decryptInto(values, origins, "GROQ_API_KEY", ai.groqApiKeyEnc);
      setValue(values, origins, "GROQ_MODEL", ai.groqModel, "interface");
      setValue(values, origins, "BUILT_IN_FORGE_API_URL", ai.forgeApiUrl, "interface");
      decryptInto(values, origins, "BUILT_IN_FORGE_API_KEY", ai.forgeApiKeyEnc);
    }

    const email = emailRows[0];
    if (email) {
      if (email.imapHost) {
        setValue(values, origins, "IMAP_HOST", email.imapHost, "interface");
        setValue(values, origins, "IMAP_PORT", email.imapPort, "interface");
        setValue(values, origins, "IMAP_USER", email.imapUser, "interface");
        decryptInto(values, origins, "IMAP_PASSWORD", email.imapPasswordEnc);
        setValue(values, origins, "IMAP_TLS", email.imapTls ? "true" : "false", "interface");
        setValue(values, origins, "IMAP_MAILBOX", email.imapMailbox || "INBOX", "interface");
      }
      if (email.smtpHost) {
        setValue(values, origins, "SMTP_HOST", email.smtpHost, "interface");
        setValue(values, origins, "SMTP_PORT", email.smtpPort, "interface");
        setValue(values, origins, "SMTP_USER", email.smtpUser, "interface");
        decryptInto(values, origins, "SMTP_PASSWORD", email.smtpPasswordEnc);
        setValue(values, origins, "SMTP_SECURE", email.smtpSecure ? "true" : "false", "interface");
        setValue(values, origins, "SMTP_FROM", email.smtpFrom, "interface");
      }
    }

    for (const row of generalRows) {
      if (!row.valorEnc) continue;
      decryptInto(values, origins, row.chave, row.valorEnc);
    }
  } catch (error) {
    // Uma falha no banco nunca apaga o fallback seguro de boot.
    logger.error("[CredentialResolver] Falha ao carregar overrides do banco:", error);
  }

  return { values, origins, loadedAt: Date.now() };
}

async function snapshot(force = false): Promise<RuntimeSnapshot> {
  if (!force && cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached;
  if (!force && loadPromise) return loadPromise;
  loadPromise = loadSnapshot();
  try {
    cached = await loadPromise;
    return cached;
  } finally {
    loadPromise = null;
  }
}

export function invalidateCredentialCache(): void {
  cached = null;
}

export async function resolveCredential(key: string): Promise<string | undefined> {
  return (await snapshot()).values.get(key);
}

export async function resolveCredentialWithOrigin(
  key: string,
): Promise<{ value?: string; origin: CredentialOrigin }> {
  const current = await snapshot();
  return {
    value: current.values.get(key),
    origin: current.origins.get(key) ?? "nao_configurado",
  };
}

export async function resolveCredentials(keys: string[]): Promise<Record<string, string | undefined>> {
  const current = await snapshot();
  return Object.fromEntries(keys.map((key) => [key, current.values.get(key)]));
}

export async function getEmailRuntimeConfig() {
  const current = await snapshot();
  const get = (key: string) => current.values.get(key);
  const imapPort = Number(get("IMAP_PORT") ?? 993);
  const smtpPort = Number(get("SMTP_PORT") ?? 587);
  return {
    imap: {
      host: get("IMAP_HOST") ?? "",
      port: Number.isFinite(imapPort) ? imapPort : 993,
      user: get("IMAP_USER") ?? "",
      password: get("IMAP_PASSWORD") ?? "",
      tls: (get("IMAP_TLS") ?? "true") !== "false",
      mailbox: get("IMAP_MAILBOX") ?? "INBOX",
    },
    smtp: {
      host: get("SMTP_HOST") ?? "",
      port: Number.isFinite(smtpPort) ? smtpPort : 587,
      user: get("SMTP_USER") ?? "",
      password: get("SMTP_PASSWORD") ?? "",
      secure: (get("SMTP_SECURE") ?? (smtpPort === 465 ? "true" : "false")) === "true",
      from: get("SMTP_FROM") ?? get("SMTP_USER") ?? "",
    },
  };
}

export async function getAiRuntimeConfig() {
  const current = await snapshot();
  const get = (key: string) => current.values.get(key);
  return {
    provider: (get("AI_PROVIDER") ?? "auto").toLowerCase(),
    anthropicApiKey: get("ANTHROPIC_API_KEY") ?? "",
    anthropicModel: get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-20250514",
    groqApiKey: get("GROQ_API_KEY") ?? "",
    groqModel: get("GROQ_MODEL") ?? "llama-3.3-70b-versatile",
    forgeApiUrl: get("BUILT_IN_FORGE_API_URL") ?? "",
    forgeApiKey: get("BUILT_IN_FORGE_API_KEY") ?? "",
    timeoutMs: Math.max(5_000, Number(get("LLM_TIMEOUT_MS") ?? 90_000) || 90_000),
  };
}

export async function getWhatsappRuntimeConfig() {
  const current = await snapshot();
  const get = (key: string) => current.values.get(key);
  return {
    phoneId: get("WHATSAPP_PHONE_ID") ?? "",
    token: get("WHATSAPP_TOKEN") ?? "",
    apiVersion: get("WHATSAPP_API_VERSION") ?? "v21.0",
    webhookUrl: get("WHATSAPP_WEBHOOK_URL") ?? "",
    to: get("WHATSAPP_TO") ?? "",
  };
}

export function bootstrapEnvironmentNames(): string[] {
  return Object.keys(BOOTSTRAP_ENV).filter((key) => Boolean(BOOTSTRAP_ENV[key]?.trim()));
}
