/**
 * ragConfig.ts — Configuração do Motor de Equivalências RAG (Fonte Única).
 * ─────────────────────────────────────────────────────────────────────────────
 * Lê as chaves de `rag_config` com cache em memória (invalidado a cada
 * salvamento via update). Defaults aplicados quando a tabela está vazia
 * (primeira execução antes da migration rodar): o motor inicia desligado
 * com defaults seguros — nunca busca sem configuração explícita.
 */
import { getDb } from "../db";
import { ragConfig } from "../../drizzle/schema";
import { logger } from "../_core/logger";

export type RagConfig = {
  enabled: boolean;
  embeddingProvider: "local" | "remote" | "groq";
  ollamaUrl: string;
  embeddingModel: string;
  generationModel: string;
  topK: number;
  maxResults: number;
  minScore: number;
  autoMatchScore: number;
  reindexOnUpdate: boolean;
};

const DEFAULTS: RagConfig = {
  enabled: false, // Segurança: motor só liga após config explícita via painel
  embeddingProvider: "local",
  ollamaUrl: "http://localhost:11434",
  embeddingModel: "nomic-embed-text",
  generationModel: "llama3.1:8b",
  topK: 25,
  maxResults: 10,
  minScore: 0.72,
  autoMatchScore: 0.88,
  reindexOnUpdate: true,
};

const BOOL_KEYS = new Set(["rag.enabled", "rag.reindexOnUpdate"]);
const NUM_KEYS = new Set(["rag.topK", "rag.maxResults", "rag.minScore", "rag.autoMatchScore"]);

let cache: { config: RagConfig; at: number } | null = null;
const CACHE_TTL_MS = 60_000;

function mapRow(key: string, value: string): [string, unknown] {
  const plain = key.replace("rag.", "");
  if (BOOL_KEYS.has(key)) return [plain, value === "true"];
  if (NUM_KEYS.has(key)) return [plain, Number(value) || 0];
  return [plain, value];
}

/**
 * Lê a configuração RAG (cache de 60s). Nunca lança — em falha de banco
 * retorna defaults com enabled=false.
 */
export async function getRagConfig(): Promise<RagConfig> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.config;
  try {
    const db = await getDb();
    if (!db) {
      cache = { config: DEFAULTS, at: Date.now() };
      return DEFAULTS;
    }
    const rows = await db.select().from(ragConfig);
    const config: Record<string, unknown> = { ...DEFAULTS };
    for (const row of rows) {
      const [k, v] = mapRow(row.key, row.value);
      config[k] = v;
    }
    const merged: RagConfig = { ...DEFAULTS, ...config } as RagConfig;
    cache = { config: merged, at: Date.now() };
    return merged;
  } catch (error) {
    logger.error("[rag.config] falha ao ler configuração, usando defaults: %s", String(error));
    return DEFAULTS;
  }
}

/** Atualiza uma chave e invalida o cache. */
export async function setRagConfigKey(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("ragConfig: banco indisponível");
  await db
    .insert(ragConfig)
    .values({ key, value })
    .onDuplicateKeyUpdate({ set: { value, updatedAt: new Date() } });
  cache = null;
}

/** Exposto para o router administrativo (edição em lote do painel). */
export async function updateRagConfig(updates: Record<string, string>): Promise<RagConfig> {
  const db = await getDb();
  if (!db) throw new Error("ragConfig: banco indisponível");
  for (const [key, value] of Object.entries(updates)) {
    await db
      .insert(ragConfig)
      .values({ key, value })
      .onDuplicateKeyUpdate({ set: { value, updatedAt: new Date() } });
  }
  cache = null;
  return getRagConfig();
}

export function invalidateRagConfigCache(): void {
  cache = null;
}
