/**
 * Configuração administrativa de IA.
 *
 * As chaves são criptografadas em `ai_settings`; o CredentialResolver combina
 * estes overrides com o ambiente imutável da instalação. Nenhuma alteração é
 * propagada por process.env em runtime.
 */
import { eq } from "drizzle-orm";
import { aiSettings, type AiSettings } from "../../drizzle/schema";
import { getDb } from "../db";
import { encryptPassword } from "../utils/encryption";
import {
  getAiRuntimeConfig,
  invalidateCredentialCache,
  resolveCredentialWithOrigin,
} from "../integrations/core/credentialResolver";

export type AiConfigInput = {
  aiProvider?: "auto" | "anthropic" | "groq";
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

export async function getAiConfigView() {
  const row = await getRow();
  const runtime = await getAiRuntimeConfig();
  const [anthropicOrigin, groqOrigin, forgeOrigin, providerOrigin] = await Promise.all([
    resolveCredentialWithOrigin("ANTHROPIC_API_KEY"),
    resolveCredentialWithOrigin("GROQ_API_KEY"),
    resolveCredentialWithOrigin("BUILT_IN_FORGE_API_KEY"),
    resolveCredentialWithOrigin("AI_PROVIDER"),
  ]);
  return {
    aiProvider: runtime.provider,
    providerOrigem: providerOrigin.origin,
    anthropic: {
      model: runtime.anthropicModel,
      hasKey: Boolean(runtime.anthropicApiKey),
      origem: anthropicOrigin.origin,
    },
    groq: {
      model: runtime.groqModel,
      hasKey: Boolean(runtime.groqApiKey),
      origem: groqOrigin.origin,
    },
    forge: {
      url: runtime.forgeApiUrl,
      hasKey: Boolean(runtime.forgeApiKey),
      origem: forgeOrigin.origin,
    },
    hasInterfaceOverride: Boolean(row),
  };
}

export async function saveAiConfig(input: AiConfigInput): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const row = await getRow();
  const values = {
    aiProvider: input.aiProvider ?? row?.aiProvider ?? "auto",
    anthropicApiKeyEnc: input.anthropicApiKey
      ? encryptPassword(input.anthropicApiKey.trim())
      : row?.anthropicApiKeyEnc ?? null,
    anthropicModel: input.anthropicModel?.trim() || row?.anthropicModel || null,
    groqApiKeyEnc: input.groqApiKey
      ? encryptPassword(input.groqApiKey.trim())
      : row?.groqApiKeyEnc ?? null,
    groqModel: input.groqModel?.trim() || row?.groqModel || null,
    forgeApiUrl: input.forgeApiUrl?.trim() || row?.forgeApiUrl || null,
    forgeApiKeyEnc: input.forgeApiKey
      ? encryptPassword(input.forgeApiKey.trim())
      : row?.forgeApiKeyEnc ?? null,
  };
  if (values.forgeApiUrl) {
    const parsed = new URL(values.forgeApiUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("URL Forge deve usar HTTP ou HTTPS.");
    }
  }
  if (row) {
    await db.update(aiSettings).set(values).where(eq(aiSettings.id, row.id));
  } else {
    await db.insert(aiSettings).values(values);
  }
  invalidateCredentialCache();
}

/** Remove todos os overrides da interface e restaura a configuração da instalação. */
export async function resetAiConfig(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.delete(aiSettings);
  invalidateCredentialCache();
}

/** Compatibilidade com inicialização legada; não escreve em process.env. */
export async function applyAiConfigFromDb(): Promise<void> {
  invalidateCredentialCache();
}
