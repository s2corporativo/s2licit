import {
  capturedProductBatches,
  capturedProductFieldConfidence,
  capturedProductSourceLogs,
  capturedProducts,
  products,
} from "../../drizzle/schema";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { calculateStringSimilarity } from "./productMatchingService";

type CaptureSourceType = "url" | "html" | "pdf" | "spreadsheet" | "xml" | "docx" | "text";
type CaptureActionSuggestion = "create" | "update" | "review" | "ignore";
type DuplicateSignal = "none" | "possible" | "probable" | "confirmed";

type CapturedInputProduct = {
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
};

type CreateCaptureBatchInput = {
  sourceType: CaptureSourceType;
  sourceLabel?: string | null;
  sourceReference?: string | null;
  createdByUserId?: number | null;
  meta?: Record<string, unknown> | null;
  products: CapturedInputProduct[];
};

type CatalogProduct = {
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
};

type MatchResolution = {
  matchedProductId: number | null;
  duplicateSignal: DuplicateSignal;
  actionSuggestion: CaptureActionSuggestion;
  matchScore: number;
  matchType: "barcode" | "name_signature" | "name_similarity" | "none";
  matchedProductName?: string | null;
};

const toDecimal = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "number" ? value.toFixed(2) : String(value);
};

const normalizeText = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeCode = (value: string | null | undefined) => (value ?? "").replace(/\D+/g, "").trim();

const tokenize = (value: string | null | undefined) => {
  const normalized = normalizeText(value);
  if (!normalized) return [] as string[];
  return normalized.split(" ").filter((token) => token.length >= 2);
};

const getTokenOverlap = (left: string | null | undefined, right: string | null | undefined) => {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let matches = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) matches += 1;
  }

  return matches / Math.max(leftTokens.size, rightTokens.size);
};

const normalizeAction = (product: CapturedInputProduct): CaptureActionSuggestion => {
  if (product.actionSuggestion) return product.actionSuggestion;
  if (product.matchedProductId) return product.duplicateSignal === "confirmed" ? "update" : "review";
  return "create";
};

const normalizeDuplicateSignal = (product: CapturedInputProduct): DuplicateSignal => {
  if (product.duplicateSignal) return product.duplicateSignal;
  if (product.matchedProductId) return "possible";
  return "none";
};

async function loadCatalogProducts(): Promise<CatalogProduct[]> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  return db
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
    .where(and(eq(products.isActive, "yes")))
    .orderBy(asc(products.name))
    .limit(5000);
}

export function resolveAutomaticMatch(product: CapturedInputProduct, catalogProducts: CatalogProduct[]): MatchResolution {
  if (product.matchedProductId) {
    return {
      matchedProductId: product.matchedProductId,
      duplicateSignal: normalizeDuplicateSignal(product),
      actionSuggestion: normalizeAction(product),
      matchScore: 1,
      matchType: "name_signature",
    };
  }

  const productBarcode = normalizeCode(product.barcode);
  if (productBarcode) {
    const exactBarcodeMatch = catalogProducts.find((candidate) => {
      const candidateCodes = [candidate.barcode, candidate.ean, candidate.gtin].map(normalizeCode).filter(Boolean);
      return candidateCodes.includes(productBarcode);
    });

    if (exactBarcodeMatch) {
      return {
        matchedProductId: exactBarcodeMatch.id,
        duplicateSignal: "confirmed",
        actionSuggestion: "update",
        matchScore: 1,
        matchType: "barcode",
        matchedProductName: exactBarcodeMatch.name,
      };
    }
  }

  const normalizedName = normalizeText(product.name);
  const normalizedPresentation = normalizeText(product.presentation);
  const normalizedManufacturer = normalizeText(product.manufacturer ?? product.brand ?? null);

  let bestCandidate: CatalogProduct | null = null;
  let bestScore = 0;
  let bestType: MatchResolution["matchType"] = "none";

  for (const candidate of catalogProducts) {
    const candidateName = normalizeText(candidate.name);
    if (!candidateName || !normalizedName) continue;

    const nameSimilarity = calculateStringSimilarity(normalizedName, candidateName);
    const tokenOverlap = getTokenOverlap(product.name, candidate.name);
    const presentationSimilarity = normalizedPresentation && candidate.presentation
      ? calculateStringSimilarity(normalizedPresentation, normalizeText(candidate.presentation))
      : 0;
    const concentrationSimilarity = product.description && candidate.concentration
      ? calculateStringSimilarity(normalizeText(product.description), normalizeText(candidate.concentration))
      : 0;
    const manufacturerSimilarity = normalizedManufacturer && candidate.manufacturer
      ? calculateStringSimilarity(normalizedManufacturer, normalizeText(candidate.manufacturer))
      : 0;

    const weightedScore = (nameSimilarity * 0.62) + (tokenOverlap * 0.18) + (presentationSimilarity * 0.1) + (manufacturerSimilarity * 0.08) + (concentrationSimilarity * 0.02);
    const isNameSignature = nameSimilarity >= 0.92 && (presentationSimilarity >= 0.78 || tokenOverlap >= 0.72 || manufacturerSimilarity >= 0.8);

    if (isNameSignature && weightedScore >= bestScore) {
      bestCandidate = candidate;
      bestScore = weightedScore;
      bestType = "name_signature";
      continue;
    }

    if (weightedScore > bestScore) {
      bestCandidate = candidate;
      bestScore = weightedScore;
      bestType = "name_similarity";
    }
  }

  if (!bestCandidate || bestScore < 0.7) {
    return {
      matchedProductId: null,
      duplicateSignal: "none",
      actionSuggestion: "create",
      matchScore: Number(bestScore.toFixed(4)),
      matchType: "none",
    };
  }

  if (bestType === "name_signature" || bestScore >= 0.9) {
    return {
      matchedProductId: bestCandidate.id,
      duplicateSignal: "probable",
      actionSuggestion: "review",
      matchScore: Number(bestScore.toFixed(4)),
      matchType: bestType,
      matchedProductName: bestCandidate.name,
    };
  }

  return {
    matchedProductId: bestCandidate.id,
    duplicateSignal: "possible",
    actionSuggestion: "review",
    matchScore: Number(bestScore.toFixed(4)),
    matchType: bestType,
    matchedProductName: bestCandidate.name,
  };
}

function mergeAutomaticMatch(product: CapturedInputProduct, resolution: MatchResolution): CapturedInputProduct {
  const autoMatchPayload = {
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
      autoMatch: autoMatchPayload,
    },
  };
}

export function buildBatchMatchingSummary(products: CapturedInputProduct[]) {
  let matched = 0;
  let confirmed = 0;
  let probable = 0;
  let possible = 0;

  for (const product of products) {
    if (!product.matchedProductId) continue;
    matched += 1;
    if (product.duplicateSignal === "confirmed") confirmed += 1;
    else if (product.duplicateSignal === "probable") probable += 1;
    else if (product.duplicateSignal === "possible") possible += 1;
  }

  return {
    totalProcessed: products.length,
    totalMatched: matched,
    confirmed,
    probable,
    possible,
    unmatched: Math.max(products.length - matched, 0),
  };
}

export async function createCaptureBatch(input: CreateCaptureBatchInput) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const catalogProducts = await loadCatalogProducts();
  const normalizedProducts = input.products.map((product) => mergeAutomaticMatch(product, resolveAutomaticMatch(product, catalogProducts)));
  const matchingSummary = buildBatchMatchingSummary(normalizedProducts);

  const batchResult = await db.insert(capturedProductBatches).values({
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
    },
  });

  const batchId = Number(batchResult[0].insertId);

  for (const product of normalizedProducts) {
    const capturedResult = await db.insert(capturedProducts).values({
      batchId,
      matchedProductId: product.matchedProductId ?? null,
      actionSuggestion: normalizeAction(product),
      duplicateSignal: normalizeDuplicateSignal(product),
      name: product.name,
      brand: product.brand ?? null,
      manufacturer: product.manufacturer ?? null,
      description: product.description ?? null,
      presentation: product.presentation ?? null,
      barcode: product.barcode ?? null,
      sku: product.sku ?? null,
      price: toDecimal(product.price),
      unit: product.unit ?? null,
      category: product.category ?? null,
      imageUrl: product.imageUrl ?? null,
      productUrl: product.productUrl ?? null,
      regulatoryData: product.regulatoryData ?? null,
      rawPayload: product.rawPayload ?? null,
      status: "pending",
    });

    const capturedProductId = Number(capturedResult[0].insertId);

    if (product.confidence?.length) {
      await db.insert(capturedProductFieldConfidence).values(
        product.confidence.map((item) => ({
          capturedProductId,
          fieldName: item.fieldName,
          confidenceScore: typeof item.confidenceScore === "number" ? item.confidenceScore.toFixed(2) : String(item.confidenceScore),
          extractionMethod: item.extractionMethod ?? null,
          sourceSnippet: item.sourceSnippet ?? null,
        })),
      );
    }

    const autoMatch = (product.rawPayload as { autoMatch?: { matchScore?: number; matchType?: string; matchedProductName?: string | null } } | null)?.autoMatch;
    const matchMessage = product.matchedProductId
      ? `Correspondência automática sugerida: ${autoMatch?.matchedProductName ?? `produto #${product.matchedProductId}`} (${autoMatch?.matchType ?? "name_similarity"}, score ${typeof autoMatch?.matchScore === "number" ? autoMatch.matchScore.toFixed(2) : "n/d"}).`
      : "Nenhuma correspondência automática confiável foi encontrada para o item capturado.";

    await db.insert(capturedProductSourceLogs).values({
      batchId,
      capturedProductId,
      sourceType: input.sourceType,
      sourceReference: input.sourceReference ?? input.sourceLabel ?? null,
      logLevel: "info",
      message: `Produto capturado e enviado para revisão: ${product.name}. ${matchMessage}`,
      payload: product.rawPayload ?? null,
    });
  }

  return getCaptureBatch(batchId);
}

export async function listCaptureBatches(limit = 20) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  return db.select().from(capturedProductBatches).orderBy(capturedProductBatches.createdAt).limit(limit);
}

export async function getCaptureBatch(batchId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const [batch] = await db.select().from(capturedProductBatches).where(eq(capturedProductBatches.id, batchId)).limit(1);
  const productsRows = await db.select().from(capturedProducts).where(eq(capturedProducts.batchId, batchId));
  const logs = await db.select().from(capturedProductSourceLogs).where(eq(capturedProductSourceLogs.batchId, batchId));

  const summary = buildBatchMatchingSummary(
    productsRows.map((item) => ({
      name: item.name,
      matchedProductId: item.matchedProductId,
      duplicateSignal: item.duplicateSignal as DuplicateSignal,
    })),
  );

  return {
    batch: batch ?? null,
    products: productsRows,
    logs,
    matchingSummary: summary,
  };
}

export async function updateCapturedProductStatus(capturedProductId: number, status: "approved" | "rejected" | "applied") {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  await db.update(capturedProducts).set({ status }).where(eq(capturedProducts.id, capturedProductId));
  return true;
}

export type { CapturedInputProduct, CreateCaptureBatchInput, CatalogProduct, MatchResolution };
