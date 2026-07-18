/**
 * aiConfigService: chaves e preferências de IA configuráveis pela interface.
 *
 * A linha única de `ai_settings` (chaves no cofre AES-256-GCM) tem precedência
 * sobre as variáveis de ambiente. Como os provedores em `_core/llm.ts` leem
 * process.env em tempo de execução, a config do banco é APLICADA em process.env
 * no boot e a cada salvamento — o .env fica como fallback.
 */
import { eq } from "drizzle-orm";
import { aiSettings, type AiSettings } from "../../drizzle/schema";
import { getDb } from "../db";
import { encryptPassword, decryptPassword } from "../utils/encryption";
import { logger } from "../_core/logger";

export type AiConfigInput = {
  aiProvider?: "auto" | "anthropic" | "groq";
  /** Vazio/undefined = manter a chave atual */
  anthropicApiKey?: string | null;
  anthropicModel?: string | null;
  groqApiKey?: string | null;
  groqModel?: string | null;
  forgeApiUrl?: string | null;
  forgeApiKey?: string | null;
};

async function getRow(): Promise<AiSettings | null> {
  const db = await getDb().catch(() => null);
  if (!db) return null;
  const [row] = await db.select().from(aiSettings).limit(1);
  return row ?? null;
}

/** Config para exibição (sem chaves em claro — só se há chave e a origem). */
export async function getAiConfigView() {
  const row = await getRow();
  const dbAnthropic = Boolean(row?.anthropicApiKeyEnc);
  const dbGroq = Boolean(row?.groqApiKeyEnc);
  const dbForge = Boolean(row?.forgeApiKeyEnc);
  return {
    aiProvider: row?.aiProvider ?? process.env.AI_PROVIDER ?? "auto",
    anthropic: {
      model: row?.anthropicModel ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
      hasKey: dbAnthropic || Boolean(process.env.ANTHROPIC_API_KEY),
      origem: dbAnthropic ? ("interface" as const) : process.env.ANTHROPIC_API_KEY ? ("ambiente" as const) : ("nao_configurado" as const),
    },
    groq: {
      model: row?.groqModel ?? process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
      hasKey: dbGroq || Boolean(process.env.GROQ_API_KEY),
      origem: dbGroq ? ("interface" as const) : process.env.GROQ_API_KEY ? ("ambiente" as const) : ("nao_configurado" as const),
    },
    forge: {
      url: row?.forgeApiUrl ?? process.env.BUILT_IN_FORGE_API_URL ?? "",
      hasKey: dbForge || Boolean(process.env.BUILT_IN_FORGE_API_KEY),
      origem: dbForge ? ("interface" as const) : process.env.BUILT_IN_FORGE_API_KEY ? ("ambiente" as const) : ("nao_configurado" as const),
    },
  };
}

/** Salva (upsert da linha única), criptografando as chaves novas. */
export async function saveAiConfig(input: AiConfigInput): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const row = await getRow();
  const values = {
    aiProvider: input.aiProvider ?? row?.aiProvider ?? "auto",
    anthropicApiKeyEnc: input.anthropicApiKey
      ? encryptPassword(input.anthropicApiKey)
      : row?.anthropicApiKeyEnc ?? null,
    anthropicModel: input.anthropicModel ?? row?.anthropicModel ?? null,
    groqApiKeyEnc: input.groqApiKey
      ? encryptPassword(input.groqApiKey)
      : row?.groqApiKeyEnc ?? null,
    groqModel: input.groqModel ?? row?.groqModel ?? null,
    forgeApiUrl: input.forgeApiUrl ?? row?.forgeApiUrl ?? null,
    forgeApiKeyEnc: input.forgeApiKey
      ? encryptPassword(input.forgeApiKey)
      : row?.forgeApiKeyEnc ?? null,
  };
  if (row) {
    await db.update(aiSettings).set(values).where(eq(aiSettings.id, row.id));
  } else {
    await db.insert(aiSettings).values(values);
  }
  await applyAiConfigFromDb();
}

/**
 * Aplica a config do banco em process.env (lida pelos provedores em llm.ts).
 * Chamado no boot e após cada salvamento.
 */
export async function applyAiConfigFromDb(): Promise<void> {
  try {
    const row = await getRow();
    if (!row) return;
    if (row.aiProvider) process.env.AI_PROVIDER = row.aiProvider;
    if (row.anthropicApiKeyEnc) process.env.ANTHROPIC_API_KEY = decryptPassword(row.anthropicApiKeyEnc);
    if (row.anthropicModel) process.env.ANTHROPIC_MODEL = row.anthropicModel;
    if (row.groqApiKeyEnc) process.env.GROQ_API_KEY = decryptPassword(row.groqApiKeyEnc);
    if (row.groqModel) process.env.GROQ_MODEL = row.groqModel;
    if (row.forgeApiUrl) process.env.BUILT_IN_FORGE_API_URL = row.forgeApiUrl;
    if (row.forgeApiKeyEnc) process.env.BUILT_IN_FORGE_API_KEY = decryptPassword(row.forgeApiKeyEnc);
    logger.info("[AiConfig] Configuração de IA da interface aplicada.");
  } catch (err) {
    logger.error("[AiConfig] Falha ao aplicar configuração do banco:", err);
  }
}
