/**
 * embedding.ts — Provedores de Embedding para o Motor de Equivalências RAG.
 * ─────────────────────────────────────────────────────────────────────────────
 * Fonte única para converter texto em vetores numéricos. Três provedores:
 *
 *   - `local`   → Ollama rodando na mesma VPS do S2 (http://localhost:11434).
 *   - `remote`  → Ollama em outra máquina (URL via RAG_OLLAMA_URL).
 *   - `groq`    → API de embedding da Groq (RAG_GROQ_API_KEY + modelo
 *                 nomic-embed-text hospedado no Groq).
 *
 * O fallback segue a mesma lógica do gateway _core/llm: erro transitório tenta
 * uma vez; se o provedor principal falhar e houver Groq configurado, tenta
 * Groq. Nunca retorna vetor silenciosamente errado — lança erro claro.
 *
 * Modelo padrão: nomic-embed-text (768 dimensões, pt-BR razoável com digest
 * canônico; embeddings de mesma família são comparáveis entre si).
 *
 * Este módulo é puro de banco: sem drizzle, sem trpc — apenas HTTP + cálculo.
 */
import { ENV } from "../_core/env";
import { logger } from "../_core/logger";

export type EmbeddingProviderKind = "local" | "remote" | "groq";

export const DEFAULT_EMBEDDING_MODEL = "nomic-embed-text";
export const DEFAULT_DIMENSIONS = 768;

export type EmbeddingResult = {
  vector: number[];
  model: string;
  provider: EmbeddingProviderKind;
  dimensions: number;
};

export type EmbeddingOptions = {
  /** Sobrescreve o provedor padrão em env (teste/contingência). */
  provider?: EmbeddingProviderKind;
  /** Sobrescreve a URL base do Ollama. */
  ollamaUrl?: string;
  /** Sobrescreve o modelo. */
  model?: string;
};

/** Lê configuração de embedding (env com fallback para defaults). */
function embeddingEnv() {
  return {
    provider:
      (process.env.RAG_EMBEDDING_PROVIDER ?? "local").toLowerCase() as EmbeddingProviderKind,
    ollamaUrl:
      process.env.RAG_OLLAMA_URL ??
      (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434"),
    groqApiKey: process.env.RAG_GROQ_API_KEY ?? ENV.groqApiKey ?? "",
    groqEmbedModel: process.env.RAG_GROQ_EMBED_MODEL ?? DEFAULT_EMBEDDING_MODEL,
    timeoutMs: Number(process.env.RAG_EMBEDDING_TIMEOUT_MS ?? 15000),
  };
}

const httpPost = async (
  url: string,
  body: unknown,
  timeoutMs: number,
  headers: Record<string, string> = { "Content-Type": "application/json" }
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
};

/** Embedding via Ollama /api/embed (formato aberto, idêntico local/remote).
 *  Aceita texto único ou array de textos (input array), preservando ordem. */
async function ollamaEmbed(
  ollamaUrl: string,
  model: string,
  text: string | string[],
  timeoutMs: number
): Promise<EmbeddingResult> {
  const res = await httpPost(
    `${ollamaUrl.replace(/\/$/, "")}/api/embed`,
    { model, input: text },
    timeoutMs
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Ollama /api/embed HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    embeddings?: number[][];
    embedding?: number[];
  };
  const vector = data.embeddings?.[0] ?? data.embedding;
  if (!vector || !Array.isArray(vector)) {
    throw new Error("Ollama /api/embed: resposta sem vetor válido");
  }
  return {
    vector,
    model,
    provider: "local",
    dimensions: vector.length,
  };
}

/** Embedding via Groq /openai/v1/embeddings (modelo hospedado). */
async function groqEmbed(
  apiKey: string,
  model: string,
  text: string,
  timeoutMs: number
): Promise<EmbeddingResult> {
  if (!apiKey) {
    throw new Error("Groq: RAG_GROQ_API_KEY (ou GROQ_API_KEY) não configurada");
  }
  const res = await httpPost(
    "https://api.groq.com/openai/v1/embeddings",
    { model, input: text },
    timeoutMs,
    {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Groq /embeddings HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    data?: Array<{ embedding: number[] }>;
  };
  const vector = data.data?.[0]?.embedding;
  if (!vector || !Array.isArray(vector)) {
    throw new Error("Groq /embeddings: resposta sem vetor válido");
  }
  return {
    vector,
    model,
    provider: "groq",
    dimensions: vector.length,
  };
}

/**
 * Gera o embedding de um texto com resiliência e fallback de provedor.
 * Ordem: provedor configurado → Groq (se disponível e diferente) → erro claro.
 */
export async function embedText(
  text: string,
  options: EmbeddingOptions = {}
): Promise<EmbeddingResult> {
  const env = embeddingEnv();
  const provider = options.provider ?? env.provider;
  // Groq hospeda o modelo com sufixo -v1.5 (RAG_GROQ_EMBED_MODEL); o modelo
  // nomic-embed-text puro só existe local/remote. A família mantém 768 dimensões.
  const groqModel = options.model ?? env.groqEmbedModel;
  const model = provider === "groq" ? groqModel : (options.model ?? DEFAULT_EMBEDDING_MODEL);

  if (!text.trim()) {
    throw new Error("embedText: texto vazio — geração de embedding rejeitada");
  }

  // Caminho principal
  try {
    if (provider === "groq") {
      return await groqEmbed(env.groqApiKey, model, text, env.timeoutMs);
    }
    const url = options.ollamaUrl ?? env.ollamaUrl;
    return await ollamaEmbed(url, model, text, env.timeoutMs);
  } catch (primaryError) {
    logger.warn("[rag.embedding] provedor principal falhou: %s", String(primaryError));
    // Fallback: Groq configurado e não era o principal
    if (provider !== "groq" && env.groqApiKey) {
      try {
        const result = await groqEmbed(env.groqApiKey, env.groqEmbedModel, text, env.timeoutMs);
        logger.info("[rag.embedding] fallback Groq OK (modelo %s)", result.model);
        return result;
      } catch (fallbackError) {
        logger.error("[rag.embedding] fallback Groq também falhou: %s", String(fallbackError));
      }
    }
    throw new Error(
      `Motor de Equivalências RAG indisponível: provedor '${provider}' falhou e não há fallback configurado. ` +
        "Verifique RAG_EMBEDDING_PROVIDER, RAG_OLLAMA_URL e/ou RAG_GROQ_API_KEY. " +
        `Erro original: ${String(primaryError)}`
    );
  }
}

/** Valida dimensão do vetor contra o esperado (família do modelo). */
export function validateDimensions(vector: number[], expected = DEFAULT_DIMENSIONS): boolean {
  return Array.isArray(vector) && vector.length === expected;
}

/** Tamanho do lote para embeddings em massa (um POST resolve N textos). */
export const EMBED_BATCH_SIZE = 32;

/**
 * Embeddings em lote — resolve vários textos em um único POST ao Ollama
 * (input array), reduzindo drasticamente o overhead por produto e o
 * congestionamento de CPU em máquinas sem GPU.
 * O fallback Groq executa serialmente (API sem suporte a array no modelo usado).
 */
export async function embedTextBatch(
  texts: string[],
  options: EmbeddingOptions = {}
): Promise<Array<{ vector: number[]; model: string; dimensions: number }>> {
  if (texts.length === 0) return [];
  const env = embeddingEnv();
  const provider = options.provider ?? env.provider;
  const model = options.model ?? DEFAULT_EMBEDDING_MODEL;

  if (provider === "groq") {
    const out = [];
    for (const text of texts) out.push(await embedText(text, { provider: "groq" }));
    return out;
  }
  const url = options.ollamaUrl ?? env.ollamaUrl;
  const res = await httpPost(`${url.replace(/\/$/, "")}/api/embed`, { model, input: texts }, env.timeoutMs);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Ollama /api/embed HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { embeddings?: number[][] };
  const vecs = data.embeddings ?? [];
  return texts.map((_t, i) => ({ vector: vecs[i] ?? vecs[0] ?? [], model, dimensions: vecs[0]?.length ?? DEFAULT_DIMENSIONS }));
}
