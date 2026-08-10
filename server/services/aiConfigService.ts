/**
 * Configuração administrativa de IA.
 *
 * Somente campos efetivamente informados viram overrides persistidos. Isso
 * evita materializar automaticamente preferências/modelos herdados do ambiente.
 * Chaves permanecem criptografadas e nenhuma alteração escreve em process.env.
 */
import { eq } from "drizzle-orm";
import { aiSettings, type AiSettings } from "../../drizzle/schema";
import { getDb, withDatabaseAdvisoryLock } from "../db";
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

function cleanOptional(value: string | null | undefined, label: string): string | undefined {
  if (value == null) return undefined;
  const cleaned = value.trim();
  if (!cleaned) throw new Error(`${label}: valor vazio. Use “Restaurar padrão” para remover overrides.`);
  return cleaned;
}

function validateForgeUrl(value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("URL Forge inválida.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("URL Forge deve usar HTTP ou HTTPS.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URL Forge não pode conter credenciais embutidas.");
  }
}

async function getRow(): Promise<AiSettings | null> {
  const db = await getDb().catch(() => null);
  if (!db) return null;
  const [row] = await db.select().from(aiSettings).limit(1);
  return row ?? null;
}

export async function getAiConfigView() {
  const [row, runtime, anthropicOrigin, groqOrigin, forgeOrigin, providerOrigin] = await Promise.all([
    getRow(),
    getAiRuntimeConfig(),
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

/**
 * Serializa atualizações administrativas para impedir duas criações simultâneas
 * da linha singleton. O lock é global no MySQL e não depende da instância Node.
 */
export async function saveAiConfig(input: AiConfigInput): Promise<void> {
  const result = await withDatabaseAdvisoryLock("config:ai-settings", async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados indisponível.");
    const [[row], runtime] = await Promise.all([
      db.select().from(aiSettings).limit(1),
      getAiRuntimeConfig(),
    ]);
    const existing = row ?? null;

    const anthropicApiKey = cleanOptional(input.anthropicApiKey, "Anthropic API key");
    const anthropicModel = cleanOptional(input.anthropicModel, "Modelo Anthropic");
    const groqApiKey = cleanOptional(input.groqApiKey, "Groq API key");
    const groqModel = cleanOptional(input.groqModel, "Modelo Groq");
    const forgeApiUrl = cleanOptional(input.forgeApiUrl, "URL Forge");
    const forgeApiKey = cleanOptional(input.forgeApiKey, "Forge API key");
    if (forgeApiUrl) validateForgeUrl(forgeApiUrl);

    const effectiveAnthropicKey = Boolean(anthropicApiKey || existing?.anthropicApiKeyEnc || runtime.anthropicApiKey);
    const effectiveGroqKey = Boolean(groqApiKey || existing?.groqApiKeyEnc || runtime.groqApiKey);
    const effectiveForgeKey = Boolean(forgeApiKey || existing?.forgeApiKeyEnc || runtime.forgeApiKey);
    const effectiveForgeUrl = Boolean(forgeApiUrl || existing?.forgeApiUrl || runtime.forgeApiUrl);
    const requestedProvider = input.aiProvider;

    if (requestedProvider === "anthropic" && !effectiveAnthropicKey) {
      throw new Error("Não é possível selecionar Anthropic sem uma chave Anthropic efetiva.");
    }
    if (requestedProvider === "groq" && !effectiveGroqKey) {
      throw new Error("Não é possível selecionar Groq sem uma chave Groq efetiva.");
    }
    if (
      requestedProvider === "auto" &&
      !effectiveAnthropicKey &&
      !effectiveGroqKey &&
      !(effectiveForgeKey && effectiveForgeUrl)
    ) {
      throw new Error("Modo automático requer ao menos um provedor de IA efetivamente configurado.");
    }

    const values = {
      aiProvider: input.aiProvider ?? existing?.aiProvider ?? null,
      anthropicApiKeyEnc: anthropicApiKey
        ? encryptPassword(anthropicApiKey)
        : existing?.anthropicApiKeyEnc ?? null,
      anthropicModel: anthropicModel ?? existing?.anthropicModel ?? null,
      groqApiKeyEnc: groqApiKey
        ? encryptPassword(groqApiKey)
        : existing?.groqApiKeyEnc ?? null,
      groqModel: groqModel ?? existing?.groqModel ?? null,
      forgeApiUrl: forgeApiUrl ?? existing?.forgeApiUrl ?? null,
      forgeApiKeyEnc: forgeApiKey
        ? encryptPassword(forgeApiKey)
        : existing?.forgeApiKeyEnc ?? null,
    };

    if (existing) {
      await db.update(aiSettings).set(values).where(eq(aiSettings.id, existing.id));
    } else {
      await db.insert(aiSettings).values(values);
    }
  });

  if (!result.acquired) throw new Error("Configuração de IA está sendo alterada por outra sessão. Tente novamente.");
  invalidateCredentialCache();
}

/** Remove todos os overrides da interface e restaura a configuração da instalação. */
export async function resetAiConfig(): Promise<void> {
  const result = await withDatabaseAdvisoryLock("config:ai-settings", async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados indisponível.");
    await db.delete(aiSettings);
  });
  if (!result.acquired) throw new Error("Configuração de IA está sendo alterada por outra sessão. Tente novamente.");
  invalidateCredentialCache();
}

/** Compatibilidade com inicialização legada; não escreve em process.env. */
export async function applyAiConfigFromDb(): Promise<void> {
  invalidateCredentialCache();
}
