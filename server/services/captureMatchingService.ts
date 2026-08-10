import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { productSupplierOffers, products } from "../../drizzle/schema";
import { combinedStringSimilarity, normalizeText } from "../matching/productMatcher";
import {
  loadCaptureAiContext,
  resolveAmbiguousProductMatch,
  resolveLearnedCaptureMatchFromContext,
  type CaptureAiContext,
} from "./captureAiService";
import { capturePresentationCompatible, normalizeCaptureEan } from "./captureCoreService";
import type { ScrapedProduct } from "./scraperEngine";

export type CaptureAction = "no_change" | "update" | "create" | "review" | "blocked";

export interface CaptureProductMatchRecord {
  id: number;
  supplierId: number;
  name: string;
  normalizedName: string;
  primaryEan: string | null;
  code: string | null;
  supplierCode: string | null;
  manufacturer: string | null;
  presentation: string | null;
  unit: string | null;
  price: string | null;
  imageUrl: string | null;
}

export interface CaptureOfferMatchRecord {
  id: number;
  productId: number;
  supplierCode: string | null;
  price: string | null;
  promoPrice: string | null;
  stock: number | null;
  availability: string | null;
  link: string | null;
  image: string | null;
}

export interface CaptureMatchDecision {
  product: CaptureProductMatchRecord | null;
  existingOffer?: CaptureOfferMatchRecord;
  deterministic: boolean;
  confidence: number;
  actionHint?: CaptureAction;
  reason: string;
}

export interface CaptureMatchingContext {
  supplierId: number;
  productsById: ReadonlyMap<number, CaptureProductMatchRecord>;
  productByEan: ReadonlyMap<string, CaptureProductMatchRecord | null>;
  productsByToken: ReadonlyMap<string, readonly CaptureProductMatchRecord[]>;
  offerBySupplierCode: ReadonlyMap<string, CaptureOfferMatchRecord>;
  offerByProductId: ReadonlyMap<number, CaptureOfferMatchRecord>;
  ai: CaptureAiContext;
}

const AUTO_NAME_MATCH = clampRatio(Number(process.env.CAPTURE_AUTO_NAME_MATCH || 0.94), 0.5, 1);
const AI_NAME_MATCH_MIN = clampRatio(Number(process.env.CAPTURE_AI_NAME_MATCH_MIN || 0.82), 0.4, 1);
const MAX_FUZZY_CANDIDATES = clampInteger(
  Number(process.env.CAPTURE_MAX_FUZZY_CANDIDATES || 500),
  50,
  5000,
);
const MAX_AI_CANDIDATES = 5;
const MAX_INDEX_TOKENS = 4;

const weakTokens = new Set([
  "com",
  "sem",
  "para",
  "por",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "em",
  "tipo",
  "modelo",
  "produto",
  "unidade",
  "unidades",
  "un",
  "und",
]);

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(Math.trunc(value), max));
}

function clampRatio(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(value, max));
}

function normalizeSupplierCode(value?: string | null): string | null {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized || null;
}

function productTokens(normalizedName: string): string[] {
  const unique = new Set<string>();
  for (const token of normalizedName.split(/\s+/)) {
    if (token.length < 3 || weakTokens.has(token) || /^\d+(?:[.,]\d+)?$/.test(token)) continue;
    unique.add(token);
    if (unique.size >= MAX_INDEX_TOKENS) break;
  }
  return [...unique];
}

function primaryEan(row: { ean: string | null; gtin: string | null; barcode: string | null }): string | null {
  return normalizeCaptureEan(row.ean) || normalizeCaptureEan(row.gtin) || normalizeCaptureEan(row.barcode);
}

function addToBucket(
  buckets: Map<string, CaptureProductMatchRecord[]>,
  token: string,
  product: CaptureProductMatchRecord,
): void {
  const bucket = buckets.get(token);
  if (bucket) {
    bucket.push(product);
    return;
  }
  buckets.set(token, [product]);
}

function buildFuzzyCandidateSet(
  normalizedName: string,
  context: CaptureMatchingContext,
): CaptureProductMatchRecord[] {
  const buckets = productTokens(normalizedName)
    .map((token) => context.productsByToken.get(token) ?? [])
    .filter((bucket) => bucket.length > 0)
    .sort((left, right) => left.length - right.length);

  if (buckets.length === 0) return [];

  const candidates = new Map<number, CaptureProductMatchRecord>();
  for (const bucket of buckets) {
    for (const product of bucket) {
      candidates.set(product.id, product);
      if (candidates.size >= MAX_FUZZY_CANDIDATES) return [...candidates.values()];
    }
  }
  return [...candidates.values()];
}

function hasEanConflict(observedEan: string | null, candidate: CaptureProductMatchRecord): boolean {
  return Boolean(observedEan && candidate.primaryEan && observedEan !== candidate.primaryEan);
}

/**
 * Constrói todos os índices usados pelo matching uma única vez por job.
 *
 * Construção: O(N + O), onde N é o catálogo ativo e O são as ofertas do
 * fornecedor. Consultas posteriores por EAN/SKU/memória são O(1). Buckets são
 * montados com push amortizado O(1), evitando cópias cumulativas de arrays.
 */
export async function loadCaptureMatchingContext(supplierId: number): Promise<CaptureMatchingContext> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");

  const [productRows, offerRows, ai] = await Promise.all([
    db.select({
      id: products.id,
      supplierId: products.supplierId,
      name: products.name,
      ean: products.ean,
      gtin: products.gtin,
      barcode: products.barcode,
      code: products.code,
      supplierCode: products.codigoFornecedor,
      manufacturer: products.manufacturer,
      presentation: products.presentation,
      unit: products.unit,
      price: products.price,
      imageUrl: products.imageUrl,
    }).from(products).where(eq(products.isActive, "yes")),
    db.select({
      id: productSupplierOffers.id,
      productId: productSupplierOffers.productId,
      supplierCode: productSupplierOffers.supplierCode,
      price: productSupplierOffers.price,
      promoPrice: productSupplierOffers.promoPrice,
      stock: productSupplierOffers.stock,
      availability: productSupplierOffers.availability,
      link: productSupplierOffers.link,
      image: productSupplierOffers.image,
    }).from(productSupplierOffers).where(eq(productSupplierOffers.supplierId, supplierId)),
    loadCaptureAiContext(supplierId),
  ]);

  const productsById = new Map<number, CaptureProductMatchRecord>();
  const productByEan = new Map<string, CaptureProductMatchRecord | null>();
  const productsByToken = new Map<string, CaptureProductMatchRecord[]>();

  for (const row of productRows) {
    const normalizedName = normalizeText(row.name);
    const product: CaptureProductMatchRecord = {
      id: row.id,
      supplierId: row.supplierId,
      name: row.name,
      normalizedName,
      primaryEan: primaryEan(row),
      code: row.code,
      supplierCode: row.supplierCode,
      manufacturer: row.manufacturer,
      presentation: row.presentation,
      unit: row.unit,
      price: row.price,
      imageUrl: row.imageUrl,
    };
    productsById.set(product.id, product);

    for (const rawEan of [row.ean, row.gtin, row.barcode]) {
      const ean = normalizeCaptureEan(rawEan);
      if (!ean) continue;
      if (!productByEan.has(ean)) {
        productByEan.set(ean, product);
      } else if (productByEan.get(ean)?.id !== product.id) {
        productByEan.set(ean, null);
      }
    }

    for (const token of productTokens(normalizedName)) {
      addToBucket(productsByToken, token, product);
    }
  }

  const offerBySupplierCode = new Map<string, CaptureOfferMatchRecord>();
  const offerByProductId = new Map<number, CaptureOfferMatchRecord>();
  for (const row of offerRows) {
    const offer: CaptureOfferMatchRecord = { ...row };
    const supplierCode = normalizeSupplierCode(row.supplierCode);
    if (supplierCode) offerBySupplierCode.set(supplierCode, offer);
    offerByProductId.set(row.productId, offer);
  }

  return {
    supplierId,
    productsById,
    productByEan,
    productsByToken,
    offerBySupplierCode,
    offerByProductId,
    ai,
  };
}

/** Matching puro em relação ao banco: todo I/O necessário já está no contexto. */
export async function matchCapturedProduct(
  scraped: ScrapedProduct,
  context: CaptureMatchingContext,
): Promise<CaptureMatchDecision> {
  const observedEan = normalizeCaptureEan(scraped.ean);

  if (observedEan && context.productByEan.has(observedEan)) {
    const exact = context.productByEan.get(observedEan);
    if (!exact) {
      return {
        product: null,
        deterministic: false,
        confidence: 0,
        actionHint: "blocked",
        reason: "EAN duplicado no catálogo mestre; identidade precisa ser saneada antes da atualização.",
      };
    }
    return {
      product: exact,
      existingOffer: context.offerByProductId.get(exact.id),
      deterministic: true,
      confidence: 1,
      reason: "EAN/GTIN exato.",
    };
  }

  const supplierCode = normalizeSupplierCode(scraped.code);
  if (supplierCode) {
    const offer = context.offerBySupplierCode.get(supplierCode);
    const candidate = offer ? context.productsById.get(offer.productId) : undefined;
    if (candidate) {
      if (hasEanConflict(observedEan, candidate)) {
        return {
          product: candidate,
          existingOffer: offer,
          deterministic: false,
          confidence: 0,
          actionHint: "blocked",
          reason: "SKU conhecido aponta para produto com EAN conflitante.",
        };
      }
      return {
        product: candidate,
        existingOffer: offer,
        deterministic: true,
        confidence: 0.99,
        reason: "SKU já vinculado a este fornecedor.",
      };
    }
  }

  const learnedId = resolveLearnedCaptureMatchFromContext(context.ai, scraped.name);
  if (learnedId) {
    const learned = context.productsById.get(learnedId);
    if (
      learned &&
      !hasEanConflict(observedEan, learned) &&
      capturePresentationCompatible(scraped.name, learned.name)
    ) {
      return {
        product: learned,
        existingOffer: context.offerByProductId.get(learned.id),
        deterministic: true,
        confidence: 0.995,
        reason: "Correspondência reutilizada de decisão humana anterior.",
      };
    }
  }

  const normalizedName = normalizeText(scraped.name);
  const candidates = buildFuzzyCandidateSet(normalizedName, context)
    .filter((candidate) => !hasEanConflict(observedEan, candidate))
    .map((candidate) => ({
      candidate,
      score: combinedStringSimilarity(normalizedName, candidate.normalizedName),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_AI_CANDIDATES);

  const best = candidates[0];
  if (
    best &&
    best.score >= AUTO_NAME_MATCH &&
    capturePresentationCompatible(scraped.name, best.candidate.name)
  ) {
    return {
      product: best.candidate,
      existingOffer: context.offerByProductId.get(best.candidate.id),
      deterministic: false,
      confidence: best.score,
      actionHint: "review",
      reason: `Nome/apresentação muito semelhantes (${(best.score * 100).toFixed(1)}%), aguardando confirmação humana inicial.`,
    };
  }

  if (best && best.score >= AI_NAME_MATCH_MIN) {
    const aiDecision = await resolveAmbiguousProductMatch({
      supplierId: context.supplierId,
      observed: {
        name: scraped.name,
        ean: observedEan,
        sku: scraped.code,
        unit: scraped.unit,
        price: scraped.price,
      },
      candidates: candidates.map(({ candidate, score }) => ({
        id: candidate.id,
        name: candidate.name,
        ean: candidate.primaryEan,
        code: candidate.code || candidate.supplierCode,
        manufacturer: candidate.manufacturer,
        presentation: candidate.presentation,
        unit: candidate.unit,
        score,
      })),
      context: context.ai,
    });

    if (
      aiDecision?.selectedProductId &&
      aiDecision.confidence >= 0.92 &&
      aiDecision.compatiblePresentation
    ) {
      const selected = context.productsById.get(aiDecision.selectedProductId) ?? null;
      return {
        product: selected,
        existingOffer: selected ? context.offerByProductId.get(selected.id) : undefined,
        deterministic: false,
        confidence: aiDecision.confidence,
        actionHint: "review",
        reason: `IA sugeriu correspondência, sem aplicação automática: ${aiDecision.reason}`,
      };
    }

    return {
      product: null,
      deterministic: false,
      confidence: aiDecision?.confidence ?? best.score,
      actionHint: "review",
      reason: aiDecision?.reason || "Identidade insuficiente para automação.",
    };
  }

  if (observedEan) {
    return {
      product: null,
      deterministic: false,
      confidence: 0.85,
      actionHint: "create",
      reason: "EAN observado ainda não existe no catálogo. Criação proposta para revisão humana.",
    };
  }

  return {
    product: null,
    deterministic: false,
    confidence: 0,
    actionHint: "review",
    reason: "Produto novo sem EAN confiável; requer identificação manual.",
  };
}
