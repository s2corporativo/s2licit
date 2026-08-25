/**
 * Busca de Equivalências RAG.
 * Recuperação vetorial produz candidatos; não autoriza equivalência técnica
 * automática. A confirmação automática exige guarda determinística estruturada
 * no fluxo chamador.
 */
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import { products, productEmbeddings } from "../../drizzle/schema";
import { embedText } from "./embedding";
import { buildQueryDigest, cosineSimilarity } from "./digest";
import { getRagConfig } from "./ragConfig";
import { invokeLLM } from "../_core/llm";
import { logger } from "../_core/logger";
import { RAG_SCAN_BATCH_SIZE, RAG_SCAN_HARD_CAP } from "../services/ragRetrievalPolicy";

export type EquivalenciaResultado = {
  productId: number;
  nome: string;
  principioAtivo: string | null;
  concentracao: string | null;
  formaFarmaceutica: string | null;
  via: string | null;
  fabricante: string | null;
  tipoCatalogo: string | null;
  score: number;
  justificativa: string | null;
  /** Sempre false no RAG puro: sem validação técnica estruturada, é candidato. */
  autoMatch: boolean;
};

export type BuscaRagResult = {
  consulta: string;
  habilitado: boolean;
  candidatosVetoriais: number;
  resultados: EquivalenciaResultado[];
  fraseSeguranca: string | null;
  erro: string | null;
  tempoMs: number;
  scanTruncated?: boolean;
};

const FRASE_INSUFICIENTE = "TR tecnicamente insuficiente para correspondência segura.";
const FRASE_MOTOR_DESLIGADO = "Motor de Equivalências RAG desativado na configuração.";

const QUERY_EMBED_CACHE = new Map<string, { vector: number[]; model: string; ts: number }>();
const QUERY_EMBED_CACHE_TTL_MS = 30 * 60 * 1000;
const QUERY_EMBED_CACHE_MAX = 500;

export function clearQueryEmbedCache(): void {
  QUERY_EMBED_CACHE.clear();
}

async function embedQueryCached(queryDigest: string): Promise<{ vector: number[]; model: string }> {
  const now = Date.now();
  for (const [key, entry] of QUERY_EMBED_CACHE) {
    if (now - entry.ts > QUERY_EMBED_CACHE_TTL_MS) QUERY_EMBED_CACHE.delete(key);
  }
  const cached = QUERY_EMBED_CACHE.get(queryDigest);
  if (cached) return { vector: cached.vector, model: cached.model };
  const result = await embedText(queryDigest);
  if (QUERY_EMBED_CACHE.size >= QUERY_EMBED_CACHE_MAX) {
    const oldest = QUERY_EMBED_CACHE.keys().next().value;
    if (oldest !== undefined) QUERY_EMBED_CACHE.delete(oldest);
  }
  QUERY_EMBED_CACHE.set(queryDigest, { vector: result.vector, model: result.model, ts: now });
  return result;
}

interface RetrievalResult {
  candidates: Array<{ productId: number; score: number; model: string }>;
  scanned: number;
  truncated: boolean;
}

/**
 * Recuperação determinística e paginada por productId. A versão anterior fazia
 * `.limit(4000)` sem ORDER BY e podia nunca enxergar o melhor produto. Agora o
 * conjunto elegível é percorrido em lotes até acabar ou atingir hard-cap
 * explícito. Se atingir o cap, o resultado sinaliza `truncated`.
 */
async function retrieveCandidates(
  queryVector: number[],
  topK: number,
  tipoCatalogo?: string,
): Promise<RetrievalResult> {
  const db = await getDb();
  if (!db) return { candidates: [], scanned: 0, truncated: false };

  let lastProductId = 0;
  let scanned = 0;
  let exhausted = false;
  const best: Array<{ productId: number; score: number; model: string }> = [];

  while (!exhausted && scanned < RAG_SCAN_HARD_CAP) {
    const remaining = RAG_SCAN_HARD_CAP - scanned;
    const limit = Math.min(RAG_SCAN_BATCH_SIZE, remaining);
    const conditions = [
      eq(products.isActive, "yes"),
      sql`${products.deletedAt} IS NULL`,
      gt(productEmbeddings.productId, lastProductId),
    ];
    if (tipoCatalogo) conditions.push(eq(products.tipoCatalogo, tipoCatalogo as never));

    const rows = await db
      .select({
        productId: productEmbeddings.productId,
        embedding: productEmbeddings.embedding,
        model: productEmbeddings.model,
      })
      .from(productEmbeddings)
      .innerJoin(products, eq(products.id, productEmbeddings.productId))
      .where(and(...conditions))
      .orderBy(productEmbeddings.productId)
      .limit(limit);

    if (rows.length === 0) break;
    scanned += rows.length;
    lastProductId = rows[rows.length - 1]!.productId;
    exhausted = rows.length < limit;

    for (const row of rows) {
      const vec = Array.isArray(row.embedding) ? (row.embedding as number[]) : null;
      if (!vec) continue;
      try {
        best.push({ productId: row.productId, score: cosineSimilarity(queryVector, vec), model: row.model });
      } catch {
        // Embedding incompatível/corrompido não derruba a busca.
      }
    }

    // Mantém apenas uma margem dos melhores para limitar memória entre lotes.
    if (best.length > Math.max(topK * 5, 500)) {
      best.sort((a, b) => b.score - a.score);
      best.splice(Math.max(topK * 3, 300));
    }
  }

  best.sort((a, b) => b.score - a.score);
  return {
    candidates: best.slice(0, topK),
    scanned,
    truncated: !exhausted && scanned >= RAG_SCAN_HARD_CAP,
  };
}

async function justificar(consulta: string, equivalente: EquivalenciaResultado): Promise<string | null> {
  try {
    const prompt = `Você é um analista técnico de licitações e medicamentos veterinários/humanos.
Dada a consulta "${consulta}", justifique em UMA frase técnica e objetiva (máx. 40 palavras, português) por que o produto abaixo é um candidato, citando apenas campos existentes. Não declare equivalência definitiva e não invente dados.

Produto: ${equivalente.nome}
Princípio ativo: ${equivalente.principioAtivo ?? "não informado"}
Concentração: ${equivalente.concentracao ?? "não informada"}
Forma farmacêutica: ${equivalente.formaFarmaceutica ?? "não informada"}
Via: ${equivalente.via ?? "não informada"}
Fabricante: ${equivalente.fabricante ?? "não informado"}
Score semântico: ${equivalente.score.toFixed(3)}`;
    const result = await invokeLLM({ messages: [{ role: "user", content: prompt }], maxTokens: 150 });
    const content = result.choices?.[0]?.message?.content;
    return typeof content === "string" ? content.trim() : null;
  } catch (error) {
    logger.warn("[rag.search] justificativa falhou para produto %d: %s", equivalente.productId, String(error));
    return null;
  }
}

export async function buscarEquivalencias(
  query: string,
  options: { tipoCatalogo?: string; topK?: number; comJustificativa?: boolean } = {},
): Promise<BuscaRagResult> {
  const start = Date.now();
  const config = await getRagConfig();

  if (!config.enabled) {
    return {
      consulta: query,
      habilitado: false,
      candidatosVetoriais: 0,
      resultados: [],
      fraseSeguranca: FRASE_MOTOR_DESLIGADO,
      erro: null,
      tempoMs: Date.now() - start,
      scanTruncated: false,
    };
  }

  const topK = options.topK ?? config.topK;
  const maxResults = config.maxResults;
  const minScore = config.minScore;

  try {
    const queryDigest = buildQueryDigest(query);
    const embedResult = await embedQueryCached(queryDigest);
    const retrieval = await retrieveCandidates(embedResult.vector, topK, options.tipoCatalogo);
    const aceitaveis = retrieval.candidates.filter((c) => c.score >= minScore).slice(0, maxResults);
    const db = await getDb();

    let resultados: EquivalenciaResultado[] = [];
    if (aceitaveis.length > 0 && db) {
      const ids = aceitaveis.map((c) => c.productId);
      const rows = await db
        .select({
          id: products.id,
          name: products.name,
          activeIngredient: products.activeIngredient,
          concentration: products.concentration,
          pharmaceuticalForm: products.pharmaceuticalForm,
          viaAdministracao: products.viaAdministracao,
          manufacturer: products.manufacturer,
          laboratorio: products.laboratorio,
          tipoCatalogo: products.tipoCatalogo,
        })
        .from(products)
        .where(inArray(products.id, ids));
      const rowById = new Map(rows.map((r) => [r.id, r]));
      resultados = aceitaveis.map((c) => {
        const row = rowById.get(c.productId);
        return {
          productId: c.productId,
          nome: row?.name ?? "—",
          principioAtivo: row?.activeIngredient ?? null,
          concentracao: row?.concentration ?? null,
          formaFarmaceutica: row?.pharmaceuticalForm ?? null,
          via: row?.viaAdministracao ?? null,
          fabricante: (row?.manufacturer || row?.laboratorio) ?? null,
          tipoCatalogo: row?.tipoCatalogo ?? null,
          score: c.score,
          justificativa: null,
          // Sem TR estruturado para comparar atributos obrigatórios, RAG puro
          // nunca decide equivalência automaticamente.
          autoMatch: false,
        };
      });
    }

    if (options.comJustificativa && resultados.length > 0) {
      const limite = Math.min(resultados.length, 5);
      await Promise.all(resultados.slice(0, limite).map(async (eq_) => {
        eq_.justificativa = await justificar(query, eq_);
      }));
    }

    const truncationWarning = retrieval.truncated
      ? "Busca vetorial atingiu o limite de varredura; resultado é candidato e exige revisão."
      : null;

    return {
      consulta: query,
      habilitado: true,
      candidatosVetoriais: retrieval.scanned,
      resultados,
      fraseSeguranca: resultados.length === 0 ? FRASE_INSUFICIENTE : truncationWarning,
      erro: null,
      tempoMs: Date.now() - start,
      scanTruncated: retrieval.truncated,
    };
  } catch (error) {
    logger.error("[rag.search] busca falhou: %s", String(error));
    return {
      consulta: query,
      habilitado: true,
      candidatosVetoriais: 0,
      resultados: [],
      fraseSeguranca: FRASE_INSUFICIENTE,
      erro: String(error),
      tempoMs: Date.now() - start,
      scanTruncated: false,
    };
  }
}
