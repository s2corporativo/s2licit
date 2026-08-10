import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  capturedProductBatches,
  capturedProductFieldConfidence,
  capturedProductSourceLogs,
  capturedProducts,
  products,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { normalizeText } from "../matching/productMatcher";
import { calculateStringSimilarity } from "./productMatchingService";
import { capturePresentationCompatible } from "./captureCoreService";

export type CaptureSourceType =
  | "url"
  | "html"
  | "pdf"
  | "spreadsheet"
  | "xml"
  | "docx"
  | "text"
  | "image";
export type CaptureActionSuggestion = "create" | "update" | "review" | "ignore";
export type DuplicateSignal = "none" | "possible" | "probable" | "confirmed";
export type CaptureReviewStatus = "approved" | "rejected";

export interface CapturedInputProduct {
  name: string;
  brand?: string | null;
  manufacturer?: string | null;
  description?: string | null;
  presentation?: string | null;
  barcode?: string | null;
  sku?: string | null;
  price?: string | number | null;
  unit?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  productUrl?: string | null;
  matchedProductId?: number | null;
  actionSuggestion?: CaptureActionSuggestion;
  duplicateSignal?: DuplicateSignal;
  regulatoryData?: Record<string, unknown> | null;
  rawPayload?: Record<string, unknown> | null;
  confidence?: Array<{
    fieldName: string;
    confidenceScore: string | number;
    extractionMethod?: string | null;
    sourceSnippet?: string | null;
  }>;
}

export interface CreateCaptureBatchInput {
  sourceType: CaptureSourceType;
  sourceLabel?: string | null;
  sourceReference?: string | null;
  createdByUserId?: number | null;
  meta?: Record<string, unknown> | null;
  products: CapturedInputProduct[];
}

export interface CatalogProduct {
  id: number;
  name: string | null;
  manufacturer: string | null;
  barcode: string | null;
  ean: string | null;
  gtin: string | null;
  concentration: string | null;
  presentation: string | null;
  activeIngredient: string | null;
  description: string | null;
}

export interface MatchResolution {
  matchedProductId: number | null;
  duplicateSignal: DuplicateSignal;
  actionSuggestion: CaptureActionSuggestion;
  matchScore: number;
  matchType: "barcode" | "name_signature" | "name_similarity" | "none";
  matchedProductName?: string | null;
}

interface IndexedCatalogProduct extends CatalogProduct {
  normalizedName: string;
  normalizedManufacturer: string;
  normalizedPresentation: string;
  normalizedConcentration: string;
  tokens: string[];
}

interface CatalogIndex {
  version: string;
  size: number;
  byId: Map<number, IndexedCatalogProduct>;
  byBarcode: Map<string, IndexedCatalogProduct | null>;
  tokenBuckets: Map<string, IndexedCatalogProduct[]>;
  prefixBuckets: Map<string, IndexedCatalogProduct[]>;
}

interface AutoMatchPayload {
  matchScore: number;
  matchType: MatchResolution["matchType"];
  matchedProductName: string | null;
  appliedAt: string;
}

const CATALOG_CACHE_TTL_MS = 60_000;
const MAX_CATALOG_INDEX_SIZE = 150_000;
const MAX_FUZZY_CANDIDATES = 200;
const MAX_INDEX_TOKENS_PER_PRODUCT = 6;
const MAX_QUERY_TOKENS = 4;
const BULK_INSERT_SIZE = 300;
const INTERNAL_ORDINAL_KEY = "__captureOrdinal";

let catalogCache:
  | {
      checkedAt: number;
      version: string;
      index: CatalogIndex;
    }
  | null = null;

function toDecimal(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric.toFixed(2);
}

function normalizeCode(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/\D+/g, "");
  return /^\d{8,14}$/.test(digits) ? digits : "";
}

function tokenize(value: string | null | undefined): string[] {
  const normalized = normalizeText(value);
  if (!normalized) return [];
  return Array.from(
    new Set(
      normalized
        .split(/\s+/)
        .filter((token) => token.length >= 3)
        .slice(0, MAX_INDEX_TOKENS_PER_PRODUCT),
    ),
  );
}

function namePrefix(value: string): string {
  return value.replace(/\s+/g, " ").slice(0, 12);
}

function getTokenOverlap(leftTokens: readonly string[], rightTokens: readonly string[]): number {
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;
  const right = new Set(rightTokens);
  let matches = 0;
  for (const token of leftTokens) {
    if (right.has(token)) matches += 1;
  }
  return matches / Math.max(leftTokens.length, rightTokens.length);
}

function normalizeAction(product: CapturedInputProduct): CaptureActionSuggestion {
  if (product.actionSuggestion) return product.actionSuggestion;
  if (product.matchedProductId) {
    return product.duplicateSignal === "confirmed" ? "update" : "review";
  }
  return "create";
}

function normalizeDuplicateSignal(product: CapturedInputProduct): DuplicateSignal {
  if (product.duplicateSignal) return product.duplicateSignal;
  return product.matchedProductId ? "possible" : "none";
}

function pushBucket(
  map: Map<string, IndexedCatalogProduct[]>,
  key: string,
  product: IndexedCatalogProduct,
): void {
  if (!key) return;
  const bucket = map.get(key);
  if (bucket) bucket.push(product);
  else map.set(key, [product]);
}

function buildCatalogIndex(rows: CatalogProduct[], version: string): CatalogIndex {
  const byId = new Map<number, IndexedCatalogProduct>();
  const byBarcode = new Map<string, IndexedCatalogProduct | null>();
  const tokenBuckets = new Map<string, IndexedCatalogProduct[]>();
  const prefixBuckets = new Map<string, IndexedCatalogProduct[]>();

  for (const row of rows) {
    const normalizedName = normalizeText(row.name);
    const indexed: IndexedCatalogProduct = {
      ...row,
      normalizedName,
      normalizedManufacturer: normalizeText(row.manufacturer),
      normalizedPresentation: normalizeText(row.presentation),
      normalizedConcentration: normalizeText(row.concentration),
      tokens: tokenize(row.name),
    };

    byId.set(indexed.id, indexed);

    for (const rawCode of [row.barcode, row.ean, row.gtin]) {
      const code = normalizeCode(rawCode);
      if (!code) continue;
      if (!byBarcode.has(code)) byBarcode.set(code, indexed);
      else if (byBarcode.get(code)?.id !== indexed.id) byBarcode.set(code, null);
    }

    for (const token of indexed.tokens) pushBucket(tokenBuckets, token, indexed);
    const prefix = namePrefix(normalizedName);
    if (prefix.length >= 5) pushBucket(prefixBuckets, prefix, indexed);
  }

  return {
    version,
    size: rows.length,
    byId,
    byBarcode,
    tokenBuckets,
    prefixBuckets,
  };
}

async function catalogVersion(): Promise<{ version: string; count: number }> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  const [row] = await db
    .select({
      count: sql<number>`count(*)`,
      maxUpdatedAt: sql<Date | null>`max(${products.updatedAt})`,
    })
    .from(products)
    .where(eq(products.isActive, "yes"));

  const count = Number(row?.count ?? 0);
  const maxUpdatedAt = row?.maxUpdatedAt
    ? new Date(row.maxUpdatedAt).getTime()
    : 0;
  return {
    count,
    version: `${count}:${maxUpdatedAt}`,
  };
}

async function loadCatalogIndex(): Promise<CatalogIndex> {
  const now = Date.now();
  if (catalogCache && now - catalogCache.checkedAt < CATALOG_CACHE_TTL_MS) {
    return catalogCache.index;
  }

  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  const version = await catalogVersion();
  if (version.count > MAX_CATALOG_INDEX_SIZE) {
    throw new Error(
      `Catálogo ativo possui ${version.count} produtos, acima do limite seguro ` +
        `${MAX_CATALOG_INDEX_SIZE} para matching síncrono. Use o fluxo de captura assíncrona/indexada.`,
    );
  }

  if (catalogCache?.version === version.version) {
    catalogCache.checkedAt = now;
    return catalogCache.index;
  }

  const rows: CatalogProduct[] = await db
    .select({
      id: products.id,
      name: products.name,
      manufacturer: products.manufacturer,
      barcode: products.barcode,
      ean: products.ean,
      gtin: products.gtin,
      concentration: products.concentration,
      presentation: products.presentation,
      activeIngredient: products.activeIngredient,
      description: products.description,
    })
    .from(products)
    .where(eq(products.isActive, "yes"));

  const index = buildCatalogIndex(rows, version.version);
  catalogCache = {
    checkedAt: now,
    version: version.version,
    index,
  };
  return index;
}

function candidateSet(
  product: CapturedInputProduct,
  index: CatalogIndex,
): IndexedCatalogProduct[] {
  const queryTokens = tokenize(product.name).slice(0, MAX_QUERY_TOKENS);
  const bucketCandidates = queryTokens
    .map((token) => index.tokenBuckets.get(token) ?? [])
    .filter((bucket) => bucket.length > 0)
    .sort((left, right) => left.length - right.length);

  const candidates = new Map<number, IndexedCatalogProduct>();
  for (const bucket of bucketCandidates.slice(0, 3)) {
    for (const candidate of bucket) {
      candidates.set(candidate.id, candidate);
      if (candidates.size >= MAX_FUZZY_CANDIDATES) break;
    }
    if (candidates.size >= MAX_FUZZY_CANDIDATES) break;
  }

  if (candidates.size === 0) {
    const prefix = namePrefix(normalizeText(product.name));
    const prefixBucket = index.prefixBuckets.get(prefix) ?? [];
    for (const candidate of prefixBucket.slice(0, MAX_FUZZY_CANDIDATES)) {
      candidates.set(candidate.id, candidate);
    }
  }

  return [...candidates.values()];
}

function scoreCandidate(
  product: CapturedInputProduct,
  candidate: IndexedCatalogProduct,
): { score: number; signature: boolean } | null {
  const normalizedName = normalizeText(product.name);
  if (!normalizedName || !candidate.normalizedName) return null;

  if (
    !capturePresentationCompatible(
      product.presentation || product.name,
      candidate.presentation || candidate.name,
    )
  ) {
    return null;
  }

  const queryTokens = tokenize(product.name);
  const nameSimilarity = calculateStringSimilarity(
    normalizedName,
    candidate.normalizedName,
  );
  const tokenOverlap = getTokenOverlap(queryTokens, candidate.tokens);
  const presentationSimilarity = product.presentation && candidate.normalizedPresentation
    ? calculateStringSimilarity(
        normalizeText(product.presentation),
        candidate.normalizedPresentation,
      )
    : 0;
  const manufacturerInput = normalizeText(product.manufacturer ?? product.brand ?? null);
  const manufacturerSimilarity = manufacturerInput && candidate.normalizedManufacturer
    ? calculateStringSimilarity(manufacturerInput, candidate.normalizedManufacturer)
    : 0;
  const concentrationSimilarity = product.description && candidate.normalizedConcentration
    ? calculateStringSimilarity(
        normalizeText(product.description),
        candidate.normalizedConcentration,
      )
    : 0;

  const score =
    nameSimilarity * 0.62 +
    tokenOverlap * 0.18 +
    presentationSimilarity * 0.10 +
    manufacturerSimilarity * 0.08 +
    concentrationSimilarity * 0.02;

  return {
    score,
    signature:
      nameSimilarity >= 0.92 &&
      (presentationSimilarity >= 0.78 ||
        tokenOverlap >= 0.72 ||
        manufacturerSimilarity >= 0.80),
  };
}

export function resolveAutomaticMatch(
  product: CapturedInputProduct,
  catalog: CatalogIndex | CatalogProduct[],
): MatchResolution {
  const index = Array.isArray(catalog)
    ? buildCatalogIndex(catalog, `inline:${catalog.length}`)
    : catalog;

  if (product.matchedProductId) {
    const selected = index.byId.get(product.matchedProductId);
    if (!selected) {
      throw new Error(
        `Produto mestre #${product.matchedProductId} informado no lote não existe ou está inativo.`,
      );
    }
    return {
      matchedProductId: selected.id,
      duplicateSignal: normalizeDuplicateSignal(product),
      actionSuggestion: normalizeAction(product),
      matchScore: 1,
      matchType: "name_signature",
      matchedProductName: selected.name,
    };
  }

  const barcode = normalizeCode(product.barcode);
  if (barcode && index.byBarcode.has(barcode)) {
    const exact = index.byBarcode.get(barcode);
    if (!exact) {
      return {
        matchedProductId: null,
        duplicateSignal: "probable",
        actionSuggestion: "review",
        matchScore: 1,
        matchType: "barcode",
      };
    }
    return {
      matchedProductId: exact.id,
      duplicateSignal: "confirmed",
      actionSuggestion: "update",
      matchScore: 1,
      matchType: "barcode",
      matchedProductName: exact.name,
    };
  }

  let best: IndexedCatalogProduct | null = null;
  let bestScore = 0;
  let bestSignature = false;

  for (const candidate of candidateSet(product, index)) {
    const scored = scoreCandidate(product, candidate);
    if (!scored || scored.score <= bestScore) continue;
    best = candidate;
    bestScore = scored.score;
    bestSignature = scored.signature;
  }

  if (!best || bestScore < 0.70) {
    return {
      matchedProductId: null,
      duplicateSignal: "none",
      actionSuggestion: "create",
      matchScore: Number(bestScore.toFixed(4)),
      matchType: "none",
    };
  }

  if (bestSignature || bestScore >= 0.90) {
    return {
      matchedProductId: best.id,
      duplicateSignal: "probable",
      actionSuggestion: "review",
      matchScore: Number(bestScore.toFixed(4)),
      matchType: bestSignature ? "name_signature" : "name_similarity",
      matchedProductName: best.name,
    };
  }

  return {
    matchedProductId: best.id,
    duplicateSignal: "possible",
    actionSuggestion: "review",
    matchScore: Number(bestScore.toFixed(4)),
    matchType: "name_similarity",
    matchedProductName: best.name,
  };
}

function mergeAutomaticMatch(
  product: CapturedInputProduct,
  resolution: MatchResolution,
  ordinal: number,
): CapturedInputProduct {
  const autoMatch: AutoMatchPayload = {
    matchScore: resolution.matchScore,
    matchType: resolution.matchType,
    matchedProductName: resolution.matchedProductName ?? null,
    appliedAt: new Date().toISOString(),
  };

  return {
    ...product,
    matchedProductId: resolution.matchedProductId,
    duplicateSignal: product.duplicateSignal ?? resolution.duplicateSignal,
    actionSuggestion: product.actionSuggestion ?? resolution.actionSuggestion,
    rawPayload: {
      ...(product.rawPayload ?? {}),
      autoMatch,
      [INTERNAL_ORDINAL_KEY]: ordinal,
    },
  };
}

export function buildBatchMatchingSummary(productsInput: CapturedInputProduct[]) {
  let matched = 0;
  let confirmed = 0;
  let probable = 0;
  let possible = 0;

  for (const product of productsInput) {
    if (!product.matchedProductId) continue;
    matched += 1;
    if (product.duplicateSignal === "confirmed") confirmed += 1;
    else if (product.duplicateSignal === "probable") probable += 1;
    else if (product.duplicateSignal === "possible") possible += 1;
  }

  return {
    totalProcessed: productsInput.length,
    totalMatched: matched,
    confirmed,
    probable,
    possible,
    unmatched: Math.max(productsInput.length - matched, 0),
  };
}

function readOrdinal(payload: unknown): number | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>)[INTERNAL_ORDINAL_KEY];
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function readAutoMatch(payload: unknown): AutoMatchPayload | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>).autoMatch;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const score = Number(record.matchScore);
  const matchType = String(record.matchType || "none") as MatchResolution["matchType"];
  return {
    matchScore: Number.isFinite(score) ? score : 0,
    matchType,
    matchedProductName:
      typeof record.matchedProductName === "string"
        ? record.matchedProductName
        : null,
    appliedAt:
      typeof record.appliedAt === "string"
        ? record.appliedAt
        : new Date(0).toISOString(),
  };
}

async function insertChunks<T>(
  rows: readonly T[],
  size: number,
  insert: (chunk: T[]) => Promise<unknown>,
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += size) {
    await insert(rows.slice(offset, offset + size) as T[]);
  }
}

export async function createCaptureBatch(input: CreateCaptureBatchInput) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  if (input.products.length === 0) {
    throw new Error("O lote de captura não contém produtos.");
  }

  const catalogIndex = await loadCatalogIndex();
  const normalizedProducts = input.products.map((product, ordinal) =>
    mergeAutomaticMatch(
      product,
      resolveAutomaticMatch(product, catalogIndex),
      ordinal,
    ),
  );
  const matchingSummary = buildBatchMatchingSummary(normalizedProducts);

  const batchId = await db.transaction(async (tx) => {
    const [batchResult] = await tx.insert(capturedProductBatches).values({
      sourceType: input.sourceType,
      sourceLabel: input.sourceLabel ?? null,
      sourceReference: input.sourceReference ?? null,
      status: "review",
      totalCaptured: normalizedProducts.length,
      totalApproved: 0,
      totalRejected: 0,
      createdByUserId: input.createdByUserId ?? null,
      meta: {
        ...(input.meta ?? {}),
        autoMatching: matchingSummary,
        catalogIndexVersion: catalogIndex.version,
        catalogIndexSize: catalogIndex.size,
      },
    });

    const id = Number((batchResult as { insertId?: number | string }).insertId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error("Banco não retornou o ID do lote de captura.");
    }

    const productRows = normalizedProducts.map((product) => ({
      batchId: id,
      matchedProductId: product.matchedProductId ?? null,
      actionSuggestion: normalizeAction(product),
      duplicateSignal: normalizeDuplicateSignal(product),
      name: product.name.slice(0, 256),
      brand: product.brand?.slice(0, 128) ?? null,
      manufacturer: product.manufacturer?.slice(0, 128) ?? null,
      description: product.description ?? null,
      presentation: product.presentation?.slice(0, 128) ?? null,
      barcode: product.barcode?.slice(0, 64) ?? null,
      sku: product.sku?.slice(0, 128) ?? null,
      price: toDecimal(product.price),
      unit: product.unit?.slice(0, 64) ?? null,
      category: product.category?.slice(0, 128) ?? null,
      imageUrl: product.imageUrl ?? null,
      productUrl: product.productUrl ?? null,
      regulatoryData: product.regulatoryData ?? null,
      rawPayload: product.rawPayload ?? null,
      status: "pending" as const,
    }));

    await insertChunks(productRows, BULK_INSERT_SIZE, (chunk) =>
      tx.insert(capturedProducts).values(chunk),
    );

    const insertedRows = await tx
      .select({
        id: capturedProducts.id,
        rawPayload: capturedProducts.rawPayload,
      })
      .from(capturedProducts)
      .where(eq(capturedProducts.batchId, id));

    if (insertedRows.length !== normalizedProducts.length) {
      throw new Error(
        `Persistência inconsistente: esperados ${normalizedProducts.length} itens, ` +
          `mas ${insertedRows.length} foram recuperados no lote #${id}.`,
      );
    }

    const idByOrdinal = new Map<number, number>();
    for (const row of insertedRows) {
      const ordinal = readOrdinal(row.rawPayload);
      if (ordinal === null || idByOrdinal.has(ordinal)) {
        throw new Error(
          `Ordinal interno inválido/duplicado ao persistir lote #${id}.`,
        );
      }
      idByOrdinal.set(ordinal, row.id);
    }

    const confidenceRows: Array<typeof capturedProductFieldConfidence.$inferInsert> = [];
    const logRows: Array<typeof capturedProductSourceLogs.$inferInsert> = [];

    normalizedProducts.forEach((product, ordinal) => {
      const capturedProductId = idByOrdinal.get(ordinal);
      if (!capturedProductId) {
        throw new Error(`Item ${ordinal} do lote #${id} não recebeu ID persistido.`);
      }

      for (const confidence of product.confidence ?? []) {
        confidenceRows.push({
          capturedProductId,
          fieldName: confidence.fieldName,
          confidenceScore:
            typeof confidence.confidenceScore === "number"
              ? confidence.confidenceScore.toFixed(2)
              : String(confidence.confidenceScore),
          extractionMethod: confidence.extractionMethod ?? null,
          sourceSnippet: confidence.sourceSnippet ?? null,
        });
      }

      const autoMatch = readAutoMatch(product.rawPayload);
      const matchMessage = product.matchedProductId
        ? `Correspondência automática sugerida: ` +
          `${autoMatch?.matchedProductName ?? `produto #${product.matchedProductId}`} ` +
          `(${autoMatch?.matchType ?? "name_similarity"}, score ` +
          `${autoMatch ? autoMatch.matchScore.toFixed(2) : "n/d"}).`
        : "Nenhuma correspondência automática confiável foi encontrada para o item capturado.";

      logRows.push({
        batchId: id,
        capturedProductId,
        sourceType: input.sourceType,
        sourceReference: input.sourceReference ?? input.sourceLabel ?? null,
        logLevel: "info",
        message: `Produto capturado e enviado para revisão: ${product.name.slice(0, 256)}. ${matchMessage}`,
        payload: product.rawPayload ?? null,
      });
    });

    await insertChunks(confidenceRows, 500, (chunk) =>
      tx.insert(capturedProductFieldConfidence).values(chunk),
    );
    await insertChunks(logRows, 500, (chunk) =>
      tx.insert(capturedProductSourceLogs).values(chunk),
    );

    return id;
  });

  return getCaptureBatch(batchId);
}

export async function listCaptureBatches(limit = 20) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  const bounded = Math.min(Math.max(Math.trunc(limit), 1), 100);
  return db
    .select()
    .from(capturedProductBatches)
    .orderBy(desc(capturedProductBatches.createdAt))
    .limit(bounded);
}

export async function getCaptureBatch(batchId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  const [batchRows, productRows, logRows] = await Promise.all([
    db
      .select()
      .from(capturedProductBatches)
      .where(eq(capturedProductBatches.id, batchId))
      .limit(1),
    db
      .select()
      .from(capturedProducts)
      .where(eq(capturedProducts.batchId, batchId))
      .orderBy(asc(capturedProducts.id)),
    db
      .select()
      .from(capturedProductSourceLogs)
      .where(eq(capturedProductSourceLogs.batchId, batchId))
      .orderBy(asc(capturedProductSourceLogs.id)),
  ]);

  const matchingSummary = buildBatchMatchingSummary(
    productRows.map((item) => ({
      name: item.name,
      matchedProductId: item.matchedProductId,
      duplicateSignal: item.duplicateSignal as DuplicateSignal,
    })),
  );

  return {
    batch: batchRows[0] ?? null,
    products: productRows,
    logs: logRows,
    matchingSummary,
  };
}

/**
 * Revisão do item capturado. "applied" não é aceito aqui: status de aplicação
 * só pode nascer de uma operação real de catálogo, nunca de troca de rótulo.
 */
export async function updateCapturedProductStatus(
  capturedProductId: number,
  status: CaptureReviewStatus,
  reviewedByUserId?: number | null,
): Promise<{ status: CaptureReviewStatus; idempotent: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  return db.transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(capturedProducts)
      .where(eq(capturedProducts.id, capturedProductId))
      .for("update")
      .limit(1);
    if (!item) throw new Error("Produto capturado não encontrado.");

    if (item.status === status) {
      return { status, idempotent: true };
    }
    if (item.status !== "pending") {
      throw new Error(
        `Item já está em estado terminal (${item.status}); revisão não pode ser sobrescrita.`,
      );
    }

    const [batch] = await tx
      .select()
      .from(capturedProductBatches)
      .where(eq(capturedProductBatches.id, item.batchId))
      .for("update")
      .limit(1);
    if (!batch) throw new Error("Lote de captura não encontrado.");

    await tx
      .update(capturedProducts)
      .set({ status })
      .where(
        and(
          eq(capturedProducts.id, item.id),
          eq(capturedProducts.status, "pending"),
        ),
      );

    const nextApproved = batch.totalApproved + Number(status === "approved");
    const nextRejected = batch.totalRejected + Number(status === "rejected");
    const reviewed = nextApproved + nextRejected;
    const nextBatchStatus = reviewed >= batch.totalCaptured
      ? nextRejected === 0
        ? "approved"
        : nextApproved === 0
          ? "rejected"
          : "review"
      : "review";

    await tx
      .update(capturedProductBatches)
      .set({
        totalApproved: nextApproved,
        totalRejected: nextRejected,
        status: nextBatchStatus,
      })
      .where(eq(capturedProductBatches.id, batch.id));

    await tx.insert(capturedProductSourceLogs).values({
      batchId: batch.id,
      capturedProductId: item.id,
      sourceType: batch.sourceType,
      sourceReference: batch.sourceReference ?? batch.sourceLabel ?? null,
      logLevel: "info",
      message: status === "approved"
        ? "Item aprovado em revisão humana. Nenhuma mutação de catálogo foi realizada por esta ação."
        : "Item rejeitado em revisão humana.",
      payload: {
        reviewStatus: status,
        reviewedByUserId: reviewedByUserId ?? null,
        reviewedAt: new Date().toISOString(),
      },
    });

    return { status, idempotent: false };
  });
}
