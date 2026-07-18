import { checkDuplicatesInRows, loadSupplierCatalog, bulkInsertProducts, mergeProductFromRow, createImportLog, updateImportLog } from "../db";
import { randomUUID } from "crypto";
import { parseLlmJson } from "../_core/llm";
import { notifyOwner } from "../_core/notification";
import type { InsertProduct } from "../../drizzle/schema";
import { products, importProgress } from "../../drizzle/schema";
import { eq, isNull, and, sql, inArray, ne, or } from "drizzle-orm";
import { getDb } from "../db";
import { jaroWinklerSimilarity } from "../matching/productMatcher";

export interface ImportBatchProgress {
  queueId: string;
  totalRows: number;
  processedRows: number;
  successRows: number;
  updatedRows: number;
  errorRows: number;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number; // 0-100
  estimatedTimeRemaining: number; // segundos
  startedAt: Date | null;
  completedAt: Date | null;
  errors: Array<{ rowIndex: number; error: string }>;
  duplicatesDetected?: Array<{ product: ImportBatchInput; existingId: number; matchType: string }>;
  batchId?: number;
}

export interface ImportBatchInput {
  name: string;
  description?: string;
  code?: string;
  activeIngredient?: string;
  manufacturer?: string;
  unit?: string;
  concentration?: string;
  presentation?: string;
  price?: string;
  priceUnit?: string;
  stock?: string;
  imageUrl?: string;
  productUrl?: string;
  barcode?: string;
  gtin?: string;
  codigoFornecedor?: string;
  informacaoTecnica?: string;
  mapa?: string;
  categoryId?: number | null;
}

const BATCH_SIZE = 100;       // 100 linhas por lote (era 50)
const MAX_PARALLEL = 5;       // até 5 lotes em paralelo
const PROGRESS_INTERVAL = 500; // atualizar progresso a cada 500ms

/** Valores válidos do enum products.tipoCatalogo (drizzle/schema.ts). */
const VALID_TIPO_CATALOGO = new Set([
  "medicamento_veterinario",
  "medicamento_humano",
  "produto_nao_medicamentoso",
  "material_insumo_equipamento",
]);

/**
 * Sanitiza a resposta do LLM antes de gravar no produto:
 * - tipoCatalogo: só grava se o valor estiver na whitelist do enum;
 * - statusConfiabilidade: enriquecimento automático NUNCA marca como
 *   validado por humano — sempre "enriquecido_ia".
 */
export function sanitizeEnrichmentUpdate(enriched: {
  activeIngredient?: string;
  concentration?: string;
  category?: string;
}): Record<string, unknown> {
  const update: Record<string, unknown> = {
    activeIngredient: enriched.activeIngredient,
    concentration: enriched.concentration,
    statusConfiabilidade: "enriquecido_ia",
  };
  if (enriched.category && VALID_TIPO_CATALOGO.has(enriched.category)) {
    update.tipoCatalogo = enriched.category;
  }
  return update;
}

/**
 * Consolida os resultados de um grupo de lotes processados em paralelo.
 * Lotes rejeitados contam o tamanho REAL do lote (não BATCH_SIZE fixo).
 */
export function tallyBatchResults(
  results: Array<PromiseSettledResult<{ inserted: number; updated: number; skipped: number; batchSize: number }>>,
  batchSizes: number[]
): { success: number; updated: number; error: number; processed: number } {
  let success = 0, updated = 0, error = 0, processed = 0;
  results.forEach((result, idx) => {
    if (result.status === "fulfilled") {
      success += result.value.inserted;
      updated += result.value.updated;
      error += result.value.skipped;
      processed += result.value.batchSize;
    } else {
      console.error("[importBatchJob] Lote falhou:", result.reason);
      const failedSize = batchSizes[idx] ?? 0;
      error += failedSize;
      processed += failedSize;
    }
  });
  return { success, updated, error, processed };
}

// Armazenar progresso em memória
const importProgressMap = new Map<string, ImportBatchProgress>();

/**
 * Inicia um job de importação em lote com persistência no banco
 */
export async function startImportBatchJob(
  rows: Array<Record<string, string>>,
  supplierId: number,
  userId: number,
  enrichWithAI: boolean = false
): Promise<string> {
  if (!rows || rows.length === 0) throw new Error("Array 'rows' não pode estar vazio");

  const queueId = randomUUID(); // UUID v4 — sem colisão e seguro para serialização JSON

  importProgressMap.set(queueId, {
    queueId,
    totalRows: rows.length,
    processedRows: 0,
    successRows: 0,
    updatedRows: 0,
    errorRows: 0,
    status: "pending",
    progress: 0,
    estimatedTimeRemaining: 0,
    startedAt: null,
    completedAt: null,
    errors: [],
  });

  // Disparar em background sem aguardar
  processImportBatchAsync(queueId, rows, supplierId, userId, enrichWithAI).catch((error) => {
    console.error(`[importBatchJob] Erro na fila ${queueId}:`, error);
    updateProgress(queueId, { status: "failed" });
  });

  return queueId;
}

/**
 * Processa a importação em lotes paralelos com persistência real no banco
 */
async function processImportBatchAsync(
  queueId: string,
  rows: Array<Record<string, string>>,
  supplierId: number,
  userId: number,
  enrichWithAI: boolean = false
): Promise<void> {
  const startTime = Date.now();
  updateProgress(queueId, { status: "processing", startedAt: new Date() });

  // Criar log de importação no banco
  let batchId = 0;
  try {
    batchId = await createImportLog({
      supplierId,
      fileName: `batch-import-${new Date().toISOString().slice(0, 10)}`,
      totalRows: rows.length,
      status: "processing",
    });
    updateProgress(queueId, { batchId });
  } catch (e) {
    console.warn("[importBatchJob] Não foi possível criar log de importação:", e);
  }

  const sanitiseText = (v?: string, maxLen = 512) => {
    if (!v) return null;
    const t = v.trim();
    return t.length > maxLen ? t.slice(0, maxLen) : t || null;
  };
  const sanitisePrice = (v?: string) => {
    if (!v) return null;
    const raw = v.trim();
    // Detectar formato brasileiro: 1.234,56 (ponto = milhar, vírgula = decimal)
    const hasBrFormat = /\d\.\d{3},\d/.test(raw) || (/,\d{1,2}$/.test(raw) && !raw.includes("."));
    let normalized: string;
    if (hasBrFormat) {
      // Remove pontos de milhar, troca vírgula decimal por ponto
      normalized = raw.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = raw.replace(/[^0-9.,]/g, "").replace(",", ".");
    }
    const num = parseFloat(normalized);
    return isNaN(num) ? null : normalized;
  };

  // Normalizar linhas para InsertProduct
  const toInsert: InsertProduct[] = rows.map((r) => ({
    supplierId,
    name: sanitiseText(r.name || r.nome, 512) ?? "(sem nome)",
    description: sanitiseText(r.description || r.descricao, 2000),
    code: sanitiseText(r.code || r.codigo, 128),
    activeIngredient: sanitiseText(r.activeIngredient || r.principioAtivo, 512),
    manufacturer: sanitiseText(r.manufacturer || r.fabricante, 256),
    unit: sanitiseText(r.unit || r.unidade, 64),
    concentration: sanitiseText(r.concentration || r.concentracao, 128),
    presentation: sanitiseText(r.presentation || r.apresentacao, 256),
    price: sanitisePrice(r.price || r.preco),
    priceUnit: sanitiseText(r.priceUnit || r.precoUnidade, 64),
    stock: sanitiseText(r.stock || r.estoque, 64),
    imageUrl: sanitiseText(r.imageUrl || r.urlImagem, 2000),
    productUrl: sanitiseText(r.productUrl || r.linkProduto, 2000),
    barcode: sanitiseText(r.barcode || r.codigoBarras, 128),
    gtin: sanitiseText(r.gtin, 64),
    codigoFornecedor: sanitiseText(r.codigoFornecedor, 128),
    informacaoTecnica: sanitiseText(r.informacaoTecnica || r.fichaTecnica, 2000),
    mapa: sanitiseText(r.mapa, 128),
    importBatchId: batchId || null,
    isActive: "yes" as const,
  }));

  const allErrors: Array<{ rowIndex: number; error: string }> = [];
  let successCount = 0;
  let updatedCount = 0;
  let errorCount = 0;
  let processedCount = 0;

  // Detectar duplicados por EAN/MAPA ANTES dos inserts, em consulta única por
  // campo (inArray), excluindo produtos do próprio lote de importação.
  try {
    const db = await getDb();
    if (db && rows.length > 0) {
      const gtins = Array.from(new Set(rows.map((r) => r.gtin).filter((v): v is string => Boolean(v))));
      const mapas = Array.from(new Set(rows.map((r) => r.mapa).filter((v): v is string => Boolean(v))));
      const notOwnBatch = batchId
        ? or(isNull(products.importBatchId), ne(products.importBatchId, batchId))
        : undefined;

      const gtinMap = new Map<string, number>();
      if (gtins.length > 0) {
        const found = await db
          .select({ id: products.id, gtin: products.gtin })
          .from(products)
          .where(and(inArray(products.gtin, gtins), notOwnBatch));
        for (const p of found) {
          if (p.gtin && !gtinMap.has(p.gtin)) gtinMap.set(p.gtin, p.id);
        }
      }

      const mapaMap = new Map<string, number>();
      if (mapas.length > 0) {
        const found = await db
          .select({ id: products.id, mapa: products.mapa })
          .from(products)
          .where(and(inArray(products.mapa, mapas), notOwnBatch));
        for (const p of found) {
          if (p.mapa && !mapaMap.has(p.mapa)) mapaMap.set(p.mapa, p.id);
        }
      }

      const duplicatesDetected: Array<{ product: any; existingId: number; matchType: string }> = [];
      for (const row of rows) {
        if (row.gtin && gtinMap.has(row.gtin)) {
          duplicatesDetected.push({ product: row, existingId: gtinMap.get(row.gtin)!, matchType: "ean_exact" });
          continue;
        }
        if (row.mapa && mapaMap.has(row.mapa)) {
          duplicatesDetected.push({ product: row, existingId: mapaMap.get(row.mapa)!, matchType: "mapa_exact" });
        }
      }

      if (duplicatesDetected.length > 0) {
        updateProgress(queueId, {
          duplicatesDetected: duplicatesDetected.slice(0, 50),
        });
      }
    }
  } catch (e) {
    console.warn("[importBatchJob] Erro ao detectar duplicados:", e);
  }

  // Carregar o catálogo do fornecedor UMA vez para todos os lotes
  let supplierCatalog: Awaited<ReturnType<typeof loadSupplierCatalog>> | undefined;
  try {
    supplierCatalog = await loadSupplierCatalog(supplierId);
  } catch (e) {
    console.warn("[importBatchJob] Erro ao carregar catálogo do fornecedor:", e);
  }

  // Dividir em lotes para processamento paralelo
  const batches: InsertProduct[][] = [];
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    batches.push(toInsert.slice(i, i + BATCH_SIZE));
  }

  // Processar lotes em grupos de MAX_PARALLEL
  for (let groupStart = 0; groupStart < batches.length; groupStart += MAX_PARALLEL) {
    const group = batches.slice(groupStart, groupStart + MAX_PARALLEL);

    const results = await Promise.allSettled(
      group.map(async (batch, groupIdx) => {
        const batchStart = (groupStart + groupIdx) * BATCH_SIZE;
        // Verificar duplicatas para o lote (catálogo pré-carregado)
        const dupCheck = await checkDuplicatesInRows(
          batch.map((r) => ({
            name: r.name,
            fichaTecnica: r.informacaoTecnica ?? undefined,
            presentation: r.presentation ?? undefined,
            ean: r.gtin ?? r.barcode ?? undefined,
          })),
          supplierId,
          supplierCatalog
        );

        const toInsertBatch: InsertProduct[] = [];
        let batchUpdated = 0;

        for (let j = 0; j < batch.length; j++) {
          const dup = dupCheck[j];
          if (dup?.status === "duplicate" && dup.existingId) {
            // Atualizar produto existente com novos dados
            try {
              await mergeProductFromRow(dup.existingId, batch[j] as any);
              batchUpdated++;
            } catch (e: any) {
              allErrors.push({ rowIndex: batchStart + j, error: `Erro ao atualizar: ${e?.message}` });
            }
          } else {
            toInsertBatch.push(batch[j]);
          }
        }

        const { inserted, skipped, errors } = await bulkInsertProducts(toInsertBatch);
        for (const e of errors) {
          allErrors.push({ rowIndex: batchStart + e.row - 1, error: e.reason });
        }

        return { inserted, updated: batchUpdated, skipped, batchSize: batch.length };
      })
    );

    const tally = tallyBatchResults(results, group.map((b) => b.length));
    successCount += tally.success;
    updatedCount += tally.updated;
    errorCount += tally.error;
    processedCount += tally.processed;

    // Atualizar progresso
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = processedCount / Math.max(elapsed, 1);
    const remaining = Math.max(0, (toInsert.length - processedCount) / Math.max(rate, 1));

    updateProgress(queueId, {
      processedRows: Math.min(processedCount, toInsert.length),
      successRows: successCount,
      updatedRows: updatedCount,
      errorRows: errorCount,
      progress: Math.round((processedCount / toInsert.length) * 100),
      estimatedTimeRemaining: Math.round(remaining),
      errors: allErrors.slice(0, 20),
    });

    // Pequena pausa entre grupos para não saturar o banco
    if (groupStart + MAX_PARALLEL < batches.length) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  // Auto-vincular imagens com fuzzy matching se houver coluna de imagem
  try {
    const db = await getDb();
    if (db && rows.length > 0) {
      // Detectar coluna de imagem
      const imageColumnNames = ['imageUrl', 'imagem', 'url_imagem', 'image', 'foto', 'picture', 'img', 'urlImagem', 'link_imagem'];
      let imageColumn: string | null = null;
      for (const col of imageColumnNames) {
        if (rows[0][col]) {
          imageColumn = col;
          break;
        }
      }

      if (imageColumn) {
        updateProgress(queueId, { status: "processing", progress: 85 });
        // Não importar, usar lógica inline
        
        // Preparar dados de imagem
        const imageData = rows
          .map((row, idx) => ({
            productName: row.name || row.nome || "",
            imageUrl: row[imageColumn] || "",
            rowIndex: idx,
          }))
          .filter(d => d.imageUrl && d.productName);

        if (imageData.length > 0) {
          console.log(`[importBatchJob] Auto-vinculando ${imageData.length} imagens com fuzzy matching`);

          // Carregar TODOS os produtos do lote uma única vez, fora do loop
          const batchProducts = await db
            .select({ id: products.id, name: products.name })
            .from(products)
            .where(eq(products.importBatchId, batchId));

          // Auto-vincular em lotes
          for (let i = 0; i < imageData.length; i += 50) {
            const batch = imageData.slice(i, i + 50);
            for (const item of batch) {
              try {
                let bestMatch = null;
                let bestScore = 0.7; // Threshold de 70%

                for (const prod of batchProducts) {
                  // Jaro-Winkler compartilhado (server/matching/productMatcher)
                  const score = jaroWinklerSimilarity(
                    item.productName.toLowerCase(),
                    prod.name.toLowerCase()
                  );
                  if (score > bestScore) {
                    bestScore = score;
                    bestMatch = prod;
                  }
                }

                if (bestMatch) {
                  await db
                    .update(products)
                    .set({ imageUrl: item.imageUrl })
                    .where(eq(products.id, bestMatch.id));
                  console.log(`[importBatchJob] Imagem vinculada a ${bestMatch.name} (score: ${bestScore.toFixed(2)})`);
                }
              } catch (e) {
                console.warn(`[importBatchJob] Erro ao vincular imagem de ${item.productName}:`, e);
              }
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn("[importBatchJob] Erro ao auto-vincular imagens:", e);
  }

  // Enriquecer com IA se solicitado
  if (enrichWithAI && successCount > 0) {
    try {
      const db = await getDb();
      if (db) {
        updateProgress(queueId, {
          status: "processing",
          progress: 95,
        });

        const { invokeLLM } = await import("../_core/llm");
        const productsToEnrich = await db
          .select({ id: products.id, name: products.name, manufacturer: products.manufacturer })
          .from(products)
          .where(and(eq(products.importBatchId, batchId), isNull(products.activeIngredient)))
          .limit(100);

        let enrichedCount = 0;
        for (const prod of productsToEnrich) {
          try {
            const prompt = `Produto: "${prod.name}". Fabricante: ${prod.manufacturer || "desconhecido"}. Sugira: activeIngredient, concentration, category, subcategory, indication, confidence (0-1). JSON.`;
            const response = await invokeLLM({
              messages: [
                { role: "system", content: "Especialista em farmacologia veterinária. JSON apenas." },
                { role: "user", content: prompt },
              ],
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: "enrichment",
                  strict: true,
                  schema: {
                    type: "object",
                    properties: {
                      activeIngredient: { type: "string" },
                      concentration: { type: "string" },
                      category: { type: "string" },
                      subcategory: { type: "string" },
                      indication: { type: "string" },
                      confidence: { type: "number" },
                    },
                    required: ["activeIngredient", "concentration", "category", "subcategory", "indication", "confidence"],
                    additionalProperties: false,
                  },
                },
              } as any,
            });
            const content = response.choices[0]?.message?.content;
            if (content) {
              const contentStr = typeof content === "string" ? content : JSON.stringify(content);
              const enriched = parseLlmJson<any>(contentStr);
              await db
                .update(products)
                .set({
                  activeIngredient: enriched.activeIngredient,
                  concentration: enriched.concentration,
                  tipoCatalogo: enriched.category,
                  statusConfiabilidade: enriched.confidence > 0.7 ? "completo_validado" : "enriquecido_ia",
                })
                .where(eq(products.id, prod.id));
              enrichedCount++;
            }
          } catch (e) {
            console.warn(`[importBatchJob] Erro ao enriquecer ${prod.id}:`, e);
          }
        }
        console.log(`[importBatchJob] ${enrichedCount} produtos enriquecidos`);
      }
    } catch (e) {
      console.warn("[importBatchJob] Erro ao enriquecer com IA:", e);
    }
  }

  // Finalizar
  updateProgress(queueId, {
    status: "completed",
    completedAt: new Date(),
    progress: 100,
    processedRows: toInsert.length,
    estimatedTimeRemaining: 0,
    errors: allErrors.slice(0, 20),
  });

  // Atualizar log no banco
  if (batchId > 0) {
    try {
      // Truncar e resumir erros para evitar exceder limite de TEXT no banco
      let errorMessage: string | undefined;
      if (allErrors.length > 0) {
        const truncateError = (err: string, maxLen: number = 200) => {
          return err.length > maxLen ? err.slice(0, maxLen) + "..." : err;
        };
        const errorSummary = allErrors.slice(0, 3).map(e => 
          `L${e.rowIndex}: ${truncateError(e.error)}`
        ).join(" | ");
        errorMessage = `${allErrors.length} erro(s): ${truncateError(errorSummary, 1000)}`;
      }
      
      await updateImportLog(batchId, {
        status: "done",
        importedRows: successCount + updatedCount,
        errorRows: errorCount,
        errorMessage,
      });
    } catch (e) {
      console.warn("[importBatchJob] Não foi possível atualizar log:", e);
    }
  }

  // Notificar proprietário
  const total = successCount + updatedCount;
  if (total > 0) {
    await notifyOwner({
      title: `Importação Concluída: ${total} produto(s)`,
      content: `Inseridos: ${successCount} | Atualizados: ${updatedCount} | Erros: ${errorCount} | Total: ${toInsert.length}`,
    }).catch(() => {});
  }
}

function updateProgress(queueId: string, updates: Partial<ImportBatchProgress>): void {
  const current = importProgressMap.get(queueId);
  if (current) {
    const next = { ...current, ...updates };
    importProgressMap.set(queueId, next);
    // Persiste um snapshot no banco (fire-and-forget) para sobreviver a restart.
    void persistProgress(next);
  }
}

/** Grava o snapshot de progresso no banco (best-effort). */
async function persistProgress(p: ImportBatchProgress): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const progressJson = JSON.stringify(p);
    await db
      .insert(importProgress)
      .values({ queueId: p.queueId, status: p.status, progressJson })
      .onDuplicateKeyUpdate({ set: { status: p.status, progressJson } });
  } catch {
    // Persistência de progresso é best-effort; o Map em memória é a fonte rápida.
  }
}

export async function getImportProgress(queueId: string): Promise<ImportBatchProgress | null> {
  const inMemory = importProgressMap.get(queueId);
  if (inMemory) return inMemory;
  // Fallback: recupera do banco (ex.: após restart do processo).
  try {
    const db = await getDb();
    if (!db) return null;
    const rows = await db.select().from(importProgress).where(eq(importProgress.queueId, queueId)).limit(1);
    if (rows[0]) return JSON.parse(rows[0].progressJson) as ImportBatchProgress;
  } catch {
    /* ignore */
  }
  return null;
}

export function cleanupOldProgress(): void {
  const now = Date.now();
  for (const [queueId, progress] of Array.from(importProgressMap.entries())) {
    if (progress.completedAt) {
      const ageMs = now - progress.completedAt.getTime();
      if (ageMs > 3600000) importProgressMap.delete(queueId);
    }
  }
  // Limpa também os snapshots persistidos com mais de 24h (best-effort).
  void (async () => {
    try {
      const db = await getDb();
      if (!db) return;
      await db.execute(
        sql`DELETE FROM import_progress WHERE updatedAt < DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
      );
    } catch {
      /* ignore */
    }
  })();
}

// Limpar progresso antigo a cada 10 minutos
setInterval(cleanupOldProgress, 600000);
