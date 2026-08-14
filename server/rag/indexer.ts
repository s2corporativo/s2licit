/**
 * indexer.ts — Indexação de produtos no Motor de Equivalências RAG.
 * ─────────────────────────────────────────────────────────────────────────────
 * Responsável por:
 *   - `reindexAll`    → varre `products` ativos e gera/renova os embeddings;
 *   - `reindexProduct`→ atualiza o embedding de um produto específico
 *                       (chamado após edição no CRUD de produtos);
 *   - `cleanOrphans`  → remove embeddings de produtos desativados/excluídos.
 *
 * Throttling: o provedor local (Ollama) processa ~50–100 embeddings/s em CPU
 * moderna; a fila limita a N requisições simultâneas (concurrency) e respeita
 * erro transitório com 1 nova tentativa. Produtos que falham 2x entram no
 * relatório final — nunca derrubam a reindexação em lote.
 *
 * A coluna `version` no schema separa gerações de digest; reindexação com
 * pipeline novo incrementa a versão e desativa as linhas antigas
 * (soft-delete via UPDATE de version+1 sobrescreve o unique index).
 */
import { eq, and, inArray, desc, sql, lte } from "drizzle-orm";
import { getDb } from "../db";
import { productEmbeddings, products } from "../../drizzle/schema";
import { embedText, DEFAULT_EMBEDDING_MODEL, DEFAULT_DIMENSIONS } from "./embedding";
import { buildProductDigest, RAG_DIGEST_VERSION } from "./digest";
import { logger } from "../_core/logger";

export type ReindexResult = {
  total: number;
  indexados: number;
  falhas: Array<{ productId: number; nome: string; erro: string }>;
  tempoMs: number;
};

const CONCURRENCY = 5;
const MAX_RETRIES = 1;

/** Produtos elegíveis: ativos, não soft-deletados, com nome válido. */
async function fetchEligibleProducts(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  return db
    .select({
      id: products.id,
      name: products.name,
      activeIngredient: products.activeIngredient,
      concentration: products.concentration,
      pharmaceuticalForm: products.pharmaceuticalForm,
      viaAdministracao: products.viaAdministracao,
      especieAnimal: products.especieAnimal,
      classeTerapeutica: products.classeTerapeutica,
      manufacturer: products.manufacturer,
      laboratorio: products.laboratorio,
      description: products.description,
    })
    .from(products)
    .where(
      and(
        eq(products.isActive, "yes"),
        sql`${products.deletedAt} IS NULL`,
        sql`CHAR_LENGTH(${products.name}) > 0`
      )
    );
}

async function embedOne(productId: number, product: NonNullable<Awaited<ReturnType<typeof fetchEligibleProducts>>>[number]) {
  // Recebe o produto já carregado — evita reconsultar fetchEligibleProducts
  // (SELECT de todo o catálogo) por produto na fila concorrente, o que saturava
  // o pool de conexões do MySQL (connectionLimit) e travava a reindexação.
  if (!product) throw new Error(`produto ${productId} não elegível ou inexistente`);
  const digest = buildProductDigest(product);
  const result = await embedText(digest);
  if (result.dimensions !== DEFAULT_DIMENSIONS) {
    logger.warn(
      "[rag.indexer] dimensões inesperadas (%d) para produto %d — vetores de famílias distintas não são comparáveis",
      result.dimensions,
      productId
    );
  }
  return { digest, embedding: result.vector, model: result.model };
}

async function upsertEmbedding(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  productId: number,
  digest: string,
  embedding: number[],
  model: string
) {
  await db
    .insert(productEmbeddings)
    .values({
      productId,
      provider: model,
      model,
      dimensions: embedding.length,
      embedding,
      textDigest: digest,
      version: RAG_DIGEST_VERSION,
    })
    .onDuplicateKeyUpdate({
      set: {
        embedding,
        textDigest: digest,
        model,
        indexedAt: new Date(),
      },
    });
}

/**
 * Reindexação completa do catálogo. Thread-safe por produto (unique index).
 */
export async function reindexAll(concurrency = CONCURRENCY): Promise<ReindexResult> {
  const start = Date.now();
  const db = await getDb();
  if (!db) throw new Error("indexer: banco indisponível");
  const eligible = await fetchEligibleProducts(db);
  const falhas: ReindexResult["falhas"] = [];
  let indexados = 0;

  // Fila com concorrência limitada.
  const queue = [...eligible];
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, queue.length); i++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const product = queue.shift();
          if (!product) return;
          let lastError: string | null = null;
          for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
              const { digest, embedding, model } = await embedOne(product.id, product);
              await upsertEmbedding(db, product.id, digest, embedding, model);
              indexados += 1;
              return;
            } catch (error) {
              lastError = String(error);
            }
          }
          falhas.push({ productId: product.id, nome: product.name, erro: lastError ?? "desconhecido" });
        }
      })()
    );
  }
  await Promise.all(workers);

  const tempoMs = Date.now() - start;
  logger.info(
    "[rag.indexer] reindexAll concluída: %d/%d produtos (%d ms, %d falhas)",
    indexados,
    eligible.length,
    tempoMs,
    falhas.length
  );
  return { total: eligible.length, indexados, falhas, tempoMs };
}

/** Reindexa um único produto (pós-atualização no CRUD). */
export async function reindexProduct(productId: number): Promise<{ indexed: boolean; erro?: string }> {
  try {
    const db = await getDb();
    if (!db) return { indexed: false, erro: "banco indisponível" };
    const rows = await fetchEligibleProducts(db);
    const product = rows.find((p) => p.id === productId);
    if (!product) return { indexed: false, erro: "produto não elegível ou inexistente" };
    const { digest, embedding, model } = await embedOne(productId, product);
    await upsertEmbedding(db, productId, digest, embedding, model);
    return { indexed: true };
  } catch (error) {
    return { indexed: false, erro: String(error) };
  }
}

/** Remove embeddings de produtos não mais ativos (mantém auditoria no log). */
export async function cleanOrphans(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const orphans = await db
    .select({ id: productEmbeddings.productId })
    .from(productEmbeddings)
    .leftJoin(products, eq(products.id, productEmbeddings.productId))
    .where(
      sql`${products.id} IS NULL OR ${products.isActive} = 'no' OR ${products.deletedAt} IS NOT NULL`
    );
  if (orphans.length === 0) return 0;
  const ids = orphans
    .map((o) => o.id)
    .filter((id): id is number => typeof id === "number" && id > 0);
  if (ids.length === 0) return 0;
  await db.delete(productEmbeddings).where(inArray(productEmbeddings.productId, ids));
  logger.info("[rag.indexer] cleanOrphans: %d embeddings removidos", ids.length);
  return ids.length;
}

/** Contagem de embeddings indexados por modelo. */
export async function embeddingStats() {
  const db = await getDb();
  if (!db) return { total: 0, porModelo: [] as Array<{ model: string; total: number }> };
  const [totais] = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(productEmbeddings);
  const porModelo = await db
    .select({ model: productEmbeddings.model, total: sql<number>`COUNT(*)` })
    .from(productEmbeddings)
    .groupBy(productEmbeddings.model);
  return { total: Number(totais?.total ?? 0), porModelo };
}
