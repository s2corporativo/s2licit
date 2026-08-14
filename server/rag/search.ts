/**
 * search.ts — Busca de Equivalências RAG (recuperação + justificativa).
 * ─────────────────────────────────────────────────────────────────────────────
 * Pipeline em 3 estágios, seguindo o padrão dos engines do S2:
 *
 *   1. RECUPERAÇÃO VETORIAL — embedding da consulta vs embeddings indexados;
 *      topK candidatos por similaridade de cosseno (pré-filtro por tipo de
 *      catálogo quando informado).
 *   2. PRÉ-FILTRO DETERMINÍSTICO — descarta candidatos com score < minScore
 *      e ordena por score decrescente.
 *   3. JUSTIFICATIVA POR IA (opcional) — o gateway _core/llm gera a
 *      justificativa técnica de cada equivalência sugerida (princípio ativo,
 *      concentração, via, fabricante) em JSON estruturado, com limite de
 *      tokens para controlar custo.
 *
 * Frases de segurança (padrão do escritório): quando o vetor da consulta não
 * retorna candidatos acima do limiar, a resposta é "TR tecnicamente
 * insuficiente para correspondência segura" — nunca um equivalente inventado.
 *
 * O estágio 3 usa o gateway existente (Anthropic/Groq/auto + registro em
 * ai_usage_daily) — não cria canal paralelo de custos.
 */
import { sql, and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { products, productEmbeddings } from "../../drizzle/schema";
import { embedText } from "./embedding";
import { buildQueryDigest, cosineSimilarity } from "./digest";
import { getRagConfig } from "./ragConfig";
import { invokeLLM } from "../_core/llm";
import { logger } from "../_core/logger";

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
};

const FRASE_INSUFICIENTE = "TR tecnicamente insuficiente para correspondência segura.";
const FRASE_MOTOR_DESLIGADO = "Motor de Equivalências RAG desativado na configuração.";

/**
 * Cache em memória de embeddings de consulta (digest → vetor). Reduz o tempo
 * de busca de consultas repetidas: o gargalo local (~7 s/embed no Ollama CPU)
 * cai para milissegundos quando o mesmo digest é reutilizado. Limite de
 * entradas e TTL de 30 min mantêm a memória sob controle.
 */
const QUERY_EMBED_CACHE = new Map<string, { vector: number[]; model: string; ts: number }>();
const QUERY_EMBED_CACHE_TTL_MS = 30 * 60 * 1000;
const QUERY_EMBED_CACHE_MAX = 500;

/** Invalida o cache de consultas quando a base indexada muda (reindexação). */
export function clearQueryEmbedCache(): void {
  QUERY_EMBED_CACHE.clear();
}

async function embedQueryCached(queryDigest: string): Promise<{ vector: number[]; model: string }> {
  // Purge expirados a cada acesso (manutenção simples, sem timer).
  const now = Date.now();
  let purged = false;
  for (const [key, entry] of QUERY_EMBED_CACHE) {
    if (now - entry.ts > QUERY_EMBED_CACHE_TTL_MS) {
      QUERY_EMBED_CACHE.delete(key);
      purged = true;
    }
  }
  void purged;
  const cached = QUERY_EMBED_CACHE.get(queryDigest);
  if (cached) return { vector: cached.vector, model: cached.model };
  const result = await embedText(queryDigest);
  if (QUERY_EMBED_CACHE.size >= QUERY_EMBED_CACHE_MAX) {
    // Remove a entrada mais antiga antes de inserir.
    const oldest = QUERY_EMBED_CACHE.keys().next().value;
    if (oldest !== undefined) QUERY_EMBED_CACHE.delete(oldest);
  }
  QUERY_EMBED_CACHE.set(queryDigest, { vector: result.vector, model: result.model, ts: now });
  return { vector: result.vector, model: result.model };
}

/**
 * Amostra ampliada: carrega até SAMPLE_WINDOW candidatos do banco e retorna
 * apenas o topK por score. O SELECT sem ORDER não garante ordem determinística,
 * então a janela larga evita que a busca dependa de uma fatia aleatória do
 * banco (limitação do MySQL 8.0 sem índice vetorial). Janela = max(topK*20,
 * 500), limitada a SAMPLE_CAP para não sobrecarregar memória/cálculo.
 */
const SAMPLE_WINDOW_FACTOR = 20;
const SAMPLE_MIN = 500;
const SAMPLE_CAP = 4000;

function sampleWindow(topK: number): number {
  return Math.min(SAMPLE_CAP, Math.max(SAMPLE_MIN, topK * SAMPLE_WINDOW_FACTOR));
}

/** Recuperação vetorial bruta (estágio 1). */
async function retrieveCandidates(
  queryVector: number[],
  topK: number,
  tipoCatalogo?: string
): Promise<Array<{ productId: number; score: number; model: string }>> {
  const db = await getDb();
  if (!db) return [];
  // Carrega candidatos com digest e embedding (JSON → array) em janela ampliada.
  const where = tipoCatalogo
    ? and(
        eq(products.isActive, "yes"),
        sql`${products.deletedAt} IS NULL`,
        eq(products.tipoCatalogo, tipoCatalogo as never)
      )
    : and(eq(products.isActive, "yes"), sql`${products.deletedAt} IS NULL`);
  const rows = await db
    .select({
      productId: productEmbeddings.productId,
      embedding: productEmbeddings.embedding,
      model: productEmbeddings.model,
      tipoCatalogo: products.tipoCatalogo,
    })
    .from(productEmbeddings)
    .innerJoin(products, eq(products.id, productEmbeddings.productId))
    .where(where)
    .limit(sampleWindow(topK));
  const scored = rows
    .map((row) => {
      const vec = Array.isArray(row.embedding) ? (row.embedding as number[]) : null;
      if (!vec) return null;
      try {
        return { productId: row.productId, score: cosineSimilarity(queryVector, vec), model: row.model };
      } catch {
        return null;
      }
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  return scored;
}

/** Monta a justificativa técnica via gateway de IA (estágio 3, opcional). */
async function   justificar(
    consulta: string,
    equivalente: EquivalenciaResultado
  ): Promise<string | null> {
  try {
    const prompt = `Você é um analista técnico de licitações e medicamentos veterinários/humanos.
Dada a consulta "${consulta}", justifique em UMA frase técnica e objetiva (máx. 40 palavras, português) por que o produto abaixo é um equivalente candidato, citando princípio ativo, concentração, forma farmacêutica, via de administração e fabricante quando disponíveis. Se algum campo for nulo, não invente — apenas omita.

Produto: ${equivalente.nome}
Princípio ativo: ${equivalente.principioAtivo ?? "não informado"}
Concentração: ${equivalente.concentracao ?? "não informada"}
Forma farmacêutica: ${equivalente.formaFarmaceutica ?? "não informada"}
Via: ${equivalente.via ?? "não informada"}
Fabricante: ${equivalente.fabricante ?? "não informado"}
Score de similaridade semântica: ${equivalente.score.toFixed(3)}`;
    const result = await invokeLLM({
      messages: [{ role: "user", content: prompt }],
      maxTokens: 150,
    });
    const content = result.choices?.[0]?.message?.content;
    return typeof content === "string" ? content.trim() : null;
  } catch (error) {
    logger.warn("[rag.search] justificativa falhou para produto %d: %s", equivalente.productId, String(error));
    return null;
  }
}

/**
 * Busca de equivalências por descrição livre / TR.
 * Se o motor estiver desligado, retorna {habilitado: false} sem erro.
 */
export async function buscarEquivalencias(
  query: string,
  options: {
    tipoCatalogo?: string;
    topK?: number;
    comJustificativa?: boolean;
  } = {}
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
    };
  }

  const topK = options.topK ?? config.topK;
  const maxResults = config.maxResults;
  const minScore = config.minScore;
  const autoMatchScore = config.autoMatchScore;

  try {
    const queryDigest = buildQueryDigest(query);
    const embedResult = await embedQueryCached(queryDigest);
    const candidates = await retrieveCandidates(embedResult.vector, topK, options.tipoCatalogo);

    const aceitaveis = candidates.filter((c) => c.score >= minScore).slice(0, maxResults);
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
          autoMatch: c.score >= autoMatchScore,
        };
      });
    }

    if (options.comJustificativa && resultados.length > 0) {
      // Justificativas em paralelo com limite de concorrência (controle de custo).
      const limite = Math.min(resultados.length, 5);
      await Promise.all(
        resultados.slice(0, limite).map(async (eq_) => {
          eq_.justificativa = await justificar(query, eq_);
        })
      );
    }

    return {
      consulta: query,
      habilitado: true,
      candidatosVetoriais: candidates.length,
      resultados,
      fraseSeguranca: resultados.length === 0 ? FRASE_INSUFICIENTE : null,
      erro: null,
      tempoMs: Date.now() - start,
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
    };
  }
}
