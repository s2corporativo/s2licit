import { createHash } from "crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, recordPriceHistory } from "../db";
import {
  productSupplierOffers,
  products,
  scraperConfigs,
  scraperLogs,
  suppliers,
} from "../../drizzle/schema";
import {
  captureAiFeedback,
  captureConnectorHealth,
  captureJobEvents,
  captureJobs,
  supplierProductObservations,
  type CaptureJob,
} from "../../drizzle/captureCoreSchema";
import { combinedStringSimilarity, normalizeText } from "../matching/productMatcher";
import { captureSupplierProducts } from "./scraperCaptureAdapter";
import { getConnectorCapabilities } from "./captureConnectorCapabilities";
import { explainCaptureAnomaly, recordCaptureAiFeedback, resolveAmbiguousProductMatch } from "./captureAiService";
import type { ScrapedProduct } from "./scraperEngine";
import { logger } from "../_core/logger";

const AUTO_NAME_MATCH = Number(process.env.CAPTURE_AUTO_NAME_MATCH || 0.94);
const AI_NAME_MATCH_MIN = Number(process.env.CAPTURE_AI_NAME_MATCH_MIN || 0.82);
const REVIEW_PRICE_CHANGE = Number(process.env.CAPTURE_REVIEW_PRICE_CHANGE || 0.60);
const BLOCK_PRICE_CHANGE = Number(process.env.CAPTURE_BLOCK_PRICE_CHANGE || 3.00);
const FULL_MIN_COVERAGE = Number(process.env.CAPTURE_FULL_MIN_COVERAGE || 0.50);
const FULL_WARN_COVERAGE = Number(process.env.CAPTURE_FULL_WARN_COVERAGE || 0.75);

export type CaptureMode = "search" | "refresh" | "full";
export type CaptureTrigger = "manual" | "scheduled" | "bulk" | "proposal" | "api";

type Availability = "in_stock" | "out_of_stock" | "limited" | "backorder" | "unknown";

type ProductInfo = {
  id: number;
  supplierId: number;
  name: string;
  ean: string | null;
  gtin: string | null;
  barcode: string | null;
  code: string | null;
  codigoFornecedor: string | null;
  manufacturer: string | null;
  presentation: string | null;
  unit: string | null;
  price: string | null;
  imageUrl: string | null;
};

type OfferInfo = {
  id: number;
  productId: number;
  supplierCode: string | null;
  price: string | null;
  promoPrice: string | null;
  stock: number | null;
  availability: string | null;
};

function asAvailability(value?: string | null, stock?: number | null): Availability {
  const text = String(value || "").toLowerCase();
  if (stock === 0 || /indispon|out.?of.?stock|esgot/.test(text)) return "out_of_stock";
  if (stock != null && stock > 0) return stock <= 5 ? "limited" : "in_stock";
  if (/dispon|in.?stock/.test(text)) return "in_stock";
  if (/backorder|encomenda|sob pedido/.test(text)) return "backorder";
  return "unknown";
}

function offerAvailability(value: Availability): string {
  if (value === "in_stock" || value === "limited") return "disponivel";
  if (value === "out_of_stock") return "indisponivel";
  if (value === "backorder") return "sob_encomenda";
  return "desconhecido";
}

function normalizedEan(value?: string | null): string | null {
  const digits = String(value || "").replace(/\D/g, "");
  return /^\d{8,14}$/.test(digits) ? digits : null;
}

function packSignature(name?: string | null): string {
  const text = normalizeText(name || "");
  const tokens = [...text.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(mg|mcg|g|kg|ml|l|un|und|unidades?|comprimidos?|capsulas?|ampolas?|frascos?|doses?)\b/gi)]
    .map((match) => `${match[1].replace(",", ".")}${match[2].toLowerCase()}`);
  return Array.from(new Set(tokens)).sort().join("|");
}

function presentationCompatible(a?: string | null, b?: string | null): boolean {
  const sa = packSignature(a);
  const sb = packSignature(b);
  return !sa || !sb || sa === sb;
}

function contentHash(input: {
  sku?: string | null;
  ean?: string | null;
  name: string;
  price?: number | null;
  promo?: number | null;
  stock?: number | null;
  availability: Availability;
}): string {
  return createHash("sha256")
    .update(JSON.stringify({
      sku: input.sku || null,
      ean: normalizedEan(input.ean),
      name: normalizeText(input.name),
      price: input.price ?? null,
      promo: input.promo ?? null,
      stock: input.stock ?? null,
      availability: input.availability,
    }))
    .digest("hex");
}

async function event(
  jobId: number,
  stage: string,
  message: string,
  level: "info" | "warning" | "error" = "info",
  data?: Record<string, unknown>,
) {
  const db = await getDb();
  if (!db) return;
  await db.insert(captureJobEvents).values({ captureJobId: jobId, stage, message, level, data }).catch(() => undefined);
  await db.update(captureJobs)
    .set({ progressStage: stage, progressMessage: message, heartbeatAt: new Date() })
    .where(eq(captureJobs.id, jobId))
    .catch(() => undefined);
}

export async function enqueueCaptureJob(input: {
  scraperConfigId: number;
  mode?: CaptureMode;
  trigger?: CaptureTrigger;
  query?: string | null;
  priority?: number;
  createdByUserId?: number | null;
  meta?: Record<string, unknown>;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");

  const [config] = await db.select().from(scraperConfigs)
    .where(eq(scraperConfigs.id, input.scraperConfigId)).limit(1);
  if (!config) throw new Error("Configuração de captura não encontrada.");
  if (config.enabled !== "yes") throw new Error("Esta configuração de captura está desativada.");
  if (!config.tosAprovado) throw new Error("Captura bloqueada: termos de uso ainda não aprovados.");

  const capabilities = getConnectorCapabilities(
    config.scraperType,
    config.customSelectors as any,
  );

  let mode = input.mode ?? "full";
  if (mode === "full" && !capabilities.fullCatalog) {
    // Search-only não fica mais quebrado no scheduler: atualiza apenas ofertas
    // conhecidas pela busca do próprio fornecedor.
    if (capabilities.search) mode = input.query?.trim() ? "search" : "refresh";
    else throw new Error("O conector não suporta catálogo completo nem busca sob demanda.");
  }
  if (mode === "search" && !input.query?.trim()) throw new Error("Busca exige termo, SKU ou EAN.");

  const [active] = await db
    .select({ id: captureJobs.id, status: captureJobs.status })
    .from(captureJobs)
    .where(and(
      eq(captureJobs.scraperConfigId, input.scraperConfigId),
      inArray(captureJobs.status, ["queued", "running"]),
    ))
    .orderBy(desc(captureJobs.createdAt))
    .limit(1);
  if (active) return { id: active.id, status: active.status, reused: true as const, mode };

  const [inserted] = await db.insert(captureJobs).values({
    scraperConfigId: input.scraperConfigId,
    supplierId: config.supplierId,
    mode,
    trigger: input.trigger ?? "manual",
    query: input.query?.trim() || null,
    priority: Math.max(0, Math.min(input.priority ?? 50, 100)),
    createdByUserId: input.createdByUserId ?? null,
    meta: { ...(input.meta ?? {}), capabilities },
    progressStage: "queued",
    progressMessage: "Captura aguardando worker.",
  });
  const id = Number((inserted as any).insertId);
  await event(id, "queued", `Job criado (${mode}/${input.trigger ?? "manual"}).`);
  return { id, status: "queued" as const, reused: false as const, mode };
}

export async function getActiveCaptureJob(scraperConfigId: number) {
  const db = await getDb();
  if (!db) return null;
  const [job] = await db
    .select()
    .from(captureJobs)
    .where(and(
      eq(captureJobs.scraperConfigId, scraperConfigId),
      inArray(captureJobs.status, ["queued", "running"]),
    ))
    .orderBy(desc(captureJobs.createdAt))
    .limit(1);
  return job ?? null;
}

export async function getCaptureJobStatus(scraperConfigId: number) {
  const db = await getDb();
  if (!db) return { status: "idle", log: [] as string[], startedAt: null as Date | null };
  const [job] = await db.select().from(captureJobs)
    .where(eq(captureJobs.scraperConfigId, scraperConfigId))
    .orderBy(desc(captureJobs.createdAt)).limit(1);
  if (!job) return { status: "idle", log: [] as string[], startedAt: null as Date | null };
  const rows = await db.select().from(captureJobEvents)
    .where(eq(captureJobEvents.captureJobId, job.id))
    .orderBy(desc(captureJobEvents.createdAt)).limit(80);
  return {
    id: job.id,
    status: job.status,
    stage: job.progressStage,
    message: job.progressMessage,
    startedAt: job.startedAt ?? job.createdAt,
    completedAt: job.completedAt,
    qualityScore: job.qualityScore != null ? Number(job.qualityScore) : null,
    capturedItems: job.capturedItems,
    matchedItems: job.matchedItems,
    changedItems: job.changedItems,
    reviewItems: job.reviewItems,
    errorItems: job.errorItems,
    log: rows.reverse().map((row) => `[${row.level}] ${row.message}`),
  };
}

export async function listCaptureJobHistory(scraperConfigId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(captureJobs)
    .where(eq(captureJobs.scraperConfigId, scraperConfigId))
    .orderBy(desc(captureJobs.createdAt)).limit(Math.min(Math.max(limit, 1), 100));
  return rows.map((job) => ({
    id: job.id,
    scraperConfigId: job.scraperConfigId,
    status: job.status === "partial" ? "success" : job.status === "quarantine" ? "failed" : job.status,
    startedAt: job.startedAt ?? job.createdAt,
    completedAt: job.completedAt,
    durationMs: job.startedAt && job.completedAt ? job.completedAt.getTime() - job.startedAt.getTime() : null,
    productsScraped: job.capturedItems,
    productsMatched: job.matchedItems,
    productsUpdated: job.changedItems,
    productsCreated: job.createdItems,
    errorMessage: job.errorMessage,
    qualityScore: job.qualityScore,
    captureStatus: job.status,
  }));
}

async function catalogContext(supplierId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");

  const productRows: ProductInfo[] = await db.select({
    id: products.id,
    supplierId: products.supplierId,
    name: products.name,
    ean: products.ean,
    gtin: products.gtin,
    barcode: products.barcode,
    code: products.code,
    codigoFornecedor: products.codigoFornecedor,
    manufacturer: products.manufacturer,
    presentation: products.presentation,
    unit: products.unit,
    price: products.price,
    imageUrl: products.imageUrl,
  }).from(products).where(eq(products.isActive, "yes"));

  const offers: OfferInfo[] = await db.select({
    id: productSupplierOffers.id,
    productId: productSupplierOffers.productId,
    supplierCode: productSupplierOffers.supplierCode,
    price: productSupplierOffers.price,
    promoPrice: productSupplierOffers.promoPrice,
    stock: productSupplierOffers.stock,
    availability: productSupplierOffers.availability,
  }).from(productSupplierOffers).where(eq(productSupplierOffers.supplierId, supplierId));

  const byId = new Map(productRows.map((row) => [row.id, row]));
  const eanMap = new Map<string, ProductInfo | null>();
  const buckets = new Map<string, ProductInfo[]>();
  for (const row of productRows) {
    for (const raw of [row.ean, row.gtin, row.barcode]) {
      const ean = normalizedEan(raw);
      if (!ean) continue;
      if (!eanMap.has(ean)) eanMap.set(ean, row);
      else if (eanMap.get(ean)?.id !== row.id) eanMap.set(ean, null); // duplicidade global: não automatiza
    }
    const word = normalizeText(row.name).split(/\s+/).find((part) => part.length >= 3);
    if (word) {
      const bucket = buckets.get(word) ?? [];
      bucket.push(row);
      buckets.set(word, bucket);
    }
  }
  const offerByCode = new Map<string, OfferInfo>();
  const offerByProduct = new Map<number, OfferInfo>();
  for (const offer of offers) {
    if (offer.supplierCode) offerByCode.set(offer.supplierCode.trim(), offer);
    offerByProduct.set(offer.productId, offer);
  }
  return { byId, eanMap, buckets, offerByCode, offerByProduct };
}

function priceAnomaly(newPrice: number, previous?: string | null) {
  const oldPrice = Number(previous || 0);
  if (!Number.isFinite(newPrice) || newPrice <= 0) return { level: "block" as const, change: null };
  if (!oldPrice || oldPrice <= 0) return { level: "ok" as const, change: null };
  const change = Math.abs(newPrice - oldPrice) / oldPrice;
  if (change >= BLOCK_PRICE_CHANGE) return { level: "block" as const, change };
  if (change >= REVIEW_PRICE_CHANGE) return { level: "review" as const, change };
  return { level: "ok" as const, change };
}

async function upsertOffer(input: {
  productId: number;
  supplierId: number;
  supplierName: string;
  product: ScrapedProduct;
  availability: Availability;
  existing?: OfferInfo;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const values = {
    price: String(input.product.price),
    supplierCode: input.product.code ?? null,
    supplierName: input.supplierName,
    link: input.product.productUrl ?? null,
    image: input.product.imageUrl ?? null,
    availability: offerAvailability(input.availability),
    promoPrice: input.product.pricePromo != null ? String(input.product.pricePromo) : null,
    stock: input.product.stock ?? null,
    updatedAt: new Date(),
  };
  if (input.existing) {
    await db.update(productSupplierOffers).set(values).where(eq(productSupplierOffers.id, input.existing.id));
  } else {
    await db.insert(productSupplierOffers).values({
      productId: input.productId,
      supplierId: input.supplierId,
      ...values,
      createdAt: new Date(),
    });
  }
  await recordPriceHistory({ productId: input.productId, supplierId: input.supplierId, price: String(input.product.price) })
    .catch(() => undefined);
}

async function createProductFromObservation(input: {
  supplierId: number;
  supplierName: string;
  product: ScrapedProduct;
  availability: Availability;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const ean = normalizedEan(input.product.ean);
  const [inserted] = await db.insert(products).values({
    supplierId: input.supplierId,
    name: input.product.name.slice(0, 512),
    price: String(input.product.price),
    codigoFornecedor: input.product.code ?? null,
    code: input.product.code ?? null,
    ean,
    gtin: ean,
    unit: input.product.unit ?? null,
    imageUrl: input.product.imageUrl ?? null,
    productUrl: input.product.productUrl ?? input.product.fonteUrl ?? null,
    stock: input.product.stock != null ? String(input.product.stock) : null,
    statusConfiabilidade: "pendente_revisao",
    isActive: "yes",
  });
  const productId = Number((inserted as any).insertId);
  await upsertOffer({
    productId,
    supplierId: input.supplierId,
    supplierName: input.supplierName,
    product: input.product,
    availability: input.availability,
  });
  return productId;
}

function preliminaryQuality(input: {
  mode: CaptureMode;
  captured: number;
  baseline?: number | null;
  warnings: number;
}) {
  let score = 100;
  let quarantine = false;
  const reasons: string[] = [];
  if (input.captured === 0) {
    return { score: 0, quarantine: true, reasons: ["Nenhum produto foi capturado."] };
  }
  if (input.mode === "full" && input.baseline && input.baseline > 0) {
    const coverage = input.captured / input.baseline;
    if (coverage < FULL_MIN_COVERAGE) {
      quarantine = true;
      score -= 60;
      reasons.push(`Cobertura ${(coverage * 100).toFixed(1)}% abaixo do mínimo histórico.`);
    } else if (coverage < FULL_WARN_COVERAGE) {
      score -= 25;
      reasons.push(`Cobertura reduzida: ${(coverage * 100).toFixed(1)}% do baseline.`);
    }
  }
  score -= Math.min(input.warnings * 2, 20);
  return { score: Math.max(0, score), quarantine, reasons };
}

async function healthRow(scraperConfigId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(captureConnectorHealth)
    .where(eq(captureConnectorHealth.scraperConfigId, scraperConfigId)).limit(1);
  return row ?? null;
}

async function updateHealth(input: {
  job: CaptureJob;
  supplierId: number;
  score: number;
  captured: number;
  successful: boolean;
  capabilities: Record<string, unknown>;
  error?: string | null;
}) {
  const db = await getDb();
  if (!db) return;
  const existing = await healthRow(input.job.scraperConfigId);
  const now = new Date();
  const baseline = input.successful && input.job.mode === "full"
    ? Math.round(existing?.baselineItems ? existing.baselineItems * 0.8 + input.captured * 0.2 : input.captured)
    : existing?.baselineItems ?? null;
  const values = {
    supplierId: input.supplierId,
    status: (input.successful
      ? input.score >= 90 ? "healthy" : input.score >= 70 ? "attention" : "degraded"
      : "degraded") as "healthy" | "attention" | "degraded",
    score: String(Math.max(0, Math.min(input.score, 100))),
    baselineItems: baseline,
    lastCapturedItems: input.captured,
    consecutiveFailures: input.successful ? 0 : (existing?.consecutiveFailures ?? 0) + 1,
    lastSuccessAt: input.successful ? now : existing?.lastSuccessAt ?? null,
    lastFailureAt: input.successful ? existing?.lastFailureAt ?? null : now,
    lastError: input.error ?? null,
    capabilities: input.capabilities,
    updatedAt: now,
  };
  if (existing) {
    await db.update(captureConnectorHealth).set(values).where(eq(captureConnectorHealth.id, existing.id));
  } else {
    await db.insert(captureConnectorHealth).values({
      scraperConfigId: input.job.scraperConfigId,
      ...values,
    });
  }
}

/** Processa um job já reclamado pelo worker. */
export async function processCaptureJob(jobId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const [job] = await db.select().from(captureJobs).where(eq(captureJobs.id, jobId)).limit(1);
  if (!job) throw new Error(`Capture job #${jobId} não encontrado.`);

  const startedAt = job.startedAt ?? new Date();
  let supplierName = `Fornecedor #${job.supplierId}`;
  let errorMessage: string | null = null;
  try {
    const [supplier] = await db.select({ name: suppliers.name }).from(suppliers)
      .where(eq(suppliers.id, job.supplierId)).limit(1);
    if (supplier) supplierName = supplier.name;

    await event(job.id, "capture", `Iniciando captura ${job.mode} de ${supplierName}.`);
    const captured = await captureSupplierProducts({
      scraperConfigId: job.scraperConfigId,
      mode: job.mode,
      query: job.query,
    });
    for (const warning of captured.warnings.slice(0, 30)) await event(job.id, "capture", warning, "warning");

    const previousHealth = await healthRow(job.scraperConfigId);
    const gate = preliminaryQuality({
      mode: job.mode,
      captured: captured.products.length,
      baseline: previousHealth?.baselineItems,
      warnings: captured.warnings.length,
    });
    await db.update(captureJobs).set({
      capturedItems: captured.products.length,
      expectedItems: previousHealth?.baselineItems ?? captured.expectedItems ?? null,
      qualityScore: String(gate.score),
    }).where(eq(captureJobs.id, job.id));

    if (gate.quarantine) {
      const reason = gate.reasons.join(" ");
      await event(job.id, "quality", `Captura em quarentena: ${reason}`, "error");
      const aiDiagnosis = await explainCaptureAnomaly({
        supplierName,
        capturedItems: captured.products.length,
        baselineItems: previousHealth?.baselineItems,
        errorItems: 0,
        warnings: captured.warnings,
      });
      if (aiDiagnosis) await event(job.id, "ai_diagnosis", aiDiagnosis, "warning");
      await db.update(captureJobs).set({
        status: "quarantine",
        completedAt: new Date(),
        progressStage: "quarantine",
        progressMessage: reason,
        errorMessage: reason,
      }).where(eq(captureJobs.id, job.id));
      await updateHealth({
        job,
        supplierId: job.supplierId,
        score: gate.score,
        captured: captured.products.length,
        successful: false,
        capabilities: captured.capabilities as unknown as Record<string, unknown>,
        error: reason,
      });
      await db.update(scraperConfigs).set({
        lastRunAt: new Date(),
        lastRunStatus: "failed",
        lastRunErrorMessage: reason.slice(0, 500),
        productsScrapedCount: captured.products.length,
      }).where(eq(scraperConfigs.id, job.scraperConfigId));
      return;
    }

    await event(job.id, "matching", `Quality gate aprovado (${gate.score.toFixed(0)}/100). Iniciando matching.`);
    const ctx = await catalogContext(job.supplierId);
    const observations: Array<typeof supplierProductObservations.$inferInsert> = [];
    let matched = 0;
    let changed = 0;
    let created = 0;
    let review = 0;
    let errors = 0;

    for (const scraped of captured.products) {
      try {
        const availability = asAvailability(scraped.availability, scraped.stock);
        const ean = normalizedEan(scraped.ean);
        let product: ProductInfo | null = null;
        let existingOffer: OfferInfo | undefined;
        let confidence = 0;
        let deterministic = false;
        let reason = "";
        let action: "no_change" | "update" | "create" | "review" | "blocked" = "review";

        if (!Number.isFinite(scraped.price) || scraped.price <= 0) {
          action = "blocked";
          reason = "Preço inválido ou ausente.";
        } else {
          if (ean && ctx.eanMap.has(ean)) {
            const exact = ctx.eanMap.get(ean);
            if (exact) {
              product = exact;
              deterministic = true;
              confidence = 1;
              reason = "EAN/GTIN exato.";
            } else {
              action = "review";
              reason = "EAN duplicado no catálogo mestre; automação bloqueada.";
            }
          }

          if (!product && action !== "review" && scraped.code) {
            const offer = ctx.offerByCode.get(scraped.code.trim());
            const candidate = offer ? ctx.byId.get(offer.productId) : undefined;
            if (candidate) {
              const candidateEan = normalizedEan(candidate.ean || candidate.gtin || candidate.barcode);
              if (ean && candidateEan && ean !== candidateEan) {
                action = "blocked";
                reason = "SKU conhecido aponta para produto com EAN conflitante.";
              } else {
                product = candidate;
                existingOffer = offer;
                deterministic = true;
                confidence = 0.99;
                reason = "SKU já vinculado a este fornecedor.";
              }
            }
          }

          if (!product && action !== "blocked" && action !== "review") {
            const normalized = normalizeText(scraped.name);
            const first = normalized.split(/\s+/).find((word) => word.length >= 3) ?? "";
            const candidates = (ctx.buckets.get(first) ?? [])
              .map((candidate) => ({
                candidate,
                score: combinedStringSimilarity(normalized, normalizeText(candidate.name)),
              }))
              .filter(({ candidate }) => {
                const candidateEan = normalizedEan(candidate.ean || candidate.gtin || candidate.barcode);
                return !(ean && candidateEan && ean !== candidateEan);
              })
              .sort((a, b) => b.score - a.score)
              .slice(0, 5);
            const best = candidates[0];
            if (best && best.score >= AUTO_NAME_MATCH && presentationCompatible(scraped.name, best.candidate.name)) {
              product = best.candidate;
              deterministic = true;
              confidence = best.score;
              reason = `Nome/apresentação com similaridade ${(best.score * 100).toFixed(1)}%.`;
            } else if (best && best.score >= AI_NAME_MATCH_MIN) {
              const ai = await resolveAmbiguousProductMatch({
                supplierId: job.supplierId,
                observed: { name: scraped.name, ean, sku: scraped.code, unit: scraped.unit, price: scraped.price },
                candidates: candidates.map(({ candidate, score }) => ({
                  id: candidate.id,
                  name: candidate.name,
                  ean: candidate.ean || candidate.gtin || candidate.barcode,
                  code: candidate.code || candidate.codigoFornecedor,
                  manufacturer: candidate.manufacturer,
                  presentation: candidate.presentation,
                  unit: candidate.unit,
                  score,
                })),
              });
              if (ai?.selectedProductId && ai.confidence >= 0.92 && ai.compatiblePresentation) {
                product = ctx.byId.get(ai.selectedProductId) ?? null;
                confidence = ai.confidence;
                action = "review"; // IA sozinha nunca aplica identidade automaticamente.
                reason = `IA sugeriu match: ${ai.reason}`;
              } else {
                action = "review";
                reason = ai?.reason || "Nome semelhante, mas identidade insuficiente para automação.";
              }
            } else if (ean) {
              action = "create";
              confidence = 0.97;
              reason = "EAN válido e inexistente no catálogo; novo produto determinístico.";
            } else {
              action = "review";
              reason = "Produto novo sem EAN confiável; requer validação.";
            }
          }

          if (product) {
            existingOffer = existingOffer ?? ctx.offerByProduct.get(product.id);
            const anomaly = priceAnomaly(scraped.price, existingOffer?.price);
            if (anomaly.level === "block") {
              action = "blocked";
              reason = anomaly.change == null
                ? "Preço inválido."
                : `Variação de preço ${(anomaly.change * 100).toFixed(1)}% bloqueada.`;
            } else if (anomaly.level === "review") {
              action = "review";
              reason = `Variação de preço ${(anomaly.change! * 100).toFixed(1)}% requer revisão.`;
            } else if (deterministic) {
              const same = existingOffer &&
                Number(existingOffer.price || 0) === scraped.price &&
                Number(existingOffer.promoPrice || 0) === Number(scraped.pricePromo || 0) &&
                Number(existingOffer.stock ?? -1) === Number(scraped.stock ?? -1) &&
                String(existingOffer.availability || "") === offerAvailability(availability);
              action = same ? "no_change" : "update";
            }
          }
        }

        if (action === "create") {
          const productId = await createProductFromObservation({
            supplierId: job.supplierId,
            supplierName,
            product: scraped,
            availability,
          });
          product = {
            id: productId,
            supplierId: job.supplierId,
            name: scraped.name,
            ean,
            gtin: ean,
            barcode: null,
            code: scraped.code ?? null,
            codigoFornecedor: scraped.code ?? null,
            manufacturer: null,
            presentation: null,
            unit: scraped.unit ?? null,
            price: String(scraped.price),
            imageUrl: scraped.imageUrl ?? null,
          };
          created++;
          changed++;
        } else if (action === "update" && product) {
          await upsertOffer({
            productId: product.id,
            supplierId: job.supplierId,
            supplierName,
            product: scraped,
            availability,
            existing: existingOffer,
          });
          // Compatibilidade temporária: products.price permanece como cache do
          // fornecedor proprietário, mas product_supplier_offers é a fonte real.
          if (product.supplierId === job.supplierId) {
            const updates: Record<string, unknown> = { price: String(scraped.price), updatedAt: new Date() };
            if (scraped.imageUrl && !product.imageUrl) updates.imageUrl = scraped.imageUrl;
            if (scraped.productUrl) updates.productUrl = scraped.productUrl;
            await db.update(products).set(updates).where(eq(products.id, product.id));
          }
          changed++;
        }

        if (product) matched++;
        if (action === "review" || action === "blocked") review++;

        observations.push({
          captureJobId: job.id,
          scraperConfigId: job.scraperConfigId,
          supplierId: job.supplierId,
          productId: product?.id ?? null,
          supplierSku: scraped.code ?? null,
          ean,
          rawName: scraped.name.slice(0, 512),
          normalizedName: normalizeText(scraped.name).slice(0, 512),
          rawPrice: String(scraped.price),
          price: String(scraped.price),
          normalPrice: scraped.priceNormal != null ? String(scraped.priceNormal) : null,
          promoPrice: scraped.pricePromo != null ? String(scraped.pricePromo) : null,
          stock: scraped.stock ?? null,
          availability,
          productUrl: scraped.productUrl ?? null,
          imageUrl: scraped.imageUrl ?? null,
          sourceType: captured.products.find((item) => item === scraped)?.sourceType ?? "browser",
          sourceUrl: scraped.fonteUrl ?? scraped.productUrl ?? null,
          contentHash: contentHash({
            sku: scraped.code,
            ean,
            name: scraped.name,
            price: scraped.price,
            promo: scraped.pricePromo,
            stock: scraped.stock,
            availability,
          }),
          confidence: String(Math.round(confidence * 10000) / 100),
          action,
          reason,
          rawPayload: {
            name: scraped.name,
            code: scraped.code,
            ean: scraped.ean,
            unit: scraped.unit,
            availability: scraped.availability,
            consultedAt: scraped.consultadoEm,
          },
        });
      } catch (error) {
        errors++;
        await event(job.id, "item", `Falha em item: ${(error as Error).message}`, "error");
      }
    }

    for (let i = 0; i < observations.length; i += 500) {
      await db.insert(supplierProductObservations).values(observations.slice(i, i + 500));
    }

    let score = gate.score;
    const errorRatio = captured.products.length ? errors / captured.products.length : 1;
    const reviewRatio = captured.products.length ? review / captured.products.length : 0;
    score -= Math.min(errorRatio * 100, 30);
    score -= Math.min(reviewRatio * 20, 15);
    score = Math.max(0, Math.min(score, 100));
    const finalStatus = errors > 0 || review > 0 ? "partial" : "success";

    await db.update(captureJobs).set({
      status: finalStatus,
      completedAt: new Date(),
      progressStage: "done",
      progressMessage: `${captured.products.length} capturados; ${changed} alterados; ${review} para revisão.`,
      capturedItems: captured.products.length,
      matchedItems: matched,
      changedItems: changed,
      createdItems: created,
      reviewItems: review,
      errorItems: errors,
      qualityScore: String(score),
      errorMessage: errors ? `${errors} item(ns) com erro.` : null,
    }).where(eq(captureJobs.id, job.id));

    await event(job.id, "done", `Captura concluída: ${captured.products.length} itens, ${changed} alterações, ${review} revisões, ${errors} erros.`);
    await updateHealth({
      job,
      supplierId: job.supplierId,
      score,
      captured: captured.products.length,
      successful: true,
      capabilities: captured.capabilities as unknown as Record<string, unknown>,
      error: errors ? `${errors} item(ns) com erro.` : null,
    });

    await db.update(scraperConfigs).set({
      lastRunAt: new Date(),
      lastRunStatus: "success",
      lastRunErrorMessage: finalStatus === "partial" ? `${review} revisão(ões), ${errors} erro(s)` : null,
      productsScrapedCount: captured.products.length,
      productsMatchedCount: matched,
      productsUpdatedCount: changed,
      productsCreatedCount: created,
    }).where(eq(scraperConfigs.id, job.scraperConfigId));

    await db.insert(scraperLogs).values({
      scraperConfigId: job.scraperConfigId,
      status: finalStatus === "success" ? "success" : "success",
      startedAt,
      completedAt: new Date(),
      durationMs: Date.now() - startedAt.getTime(),
      productsScraped: captured.products.length,
      productsMatched: matched,
      productsUpdated: changed,
      productsCreated: created,
      errorMessage: finalStatus === "partial" ? `${review} revisão(ões), ${errors} erro(s)` : null,
    }).catch(() => undefined);
  } catch (error) {
    errorMessage = (error as Error).message;
    logger.error(`[CaptureCore] Job #${job.id} falhou:`, error);
    await event(job.id, "failed", errorMessage, "error");
    await db.update(captureJobs).set({
      status: "failed",
      completedAt: new Date(),
      progressStage: "failed",
      progressMessage: errorMessage,
      errorMessage,
    }).where(eq(captureJobs.id, job.id));
    await db.update(scraperConfigs).set({
      lastRunAt: new Date(),
      lastRunStatus: "failed",
      lastRunErrorMessage: errorMessage.slice(0, 500),
    }).where(eq(scraperConfigs.id, job.scraperConfigId)).catch(() => undefined);
    await updateHealth({
      job,
      supplierId: job.supplierId,
      score: 0,
      captured: 0,
      successful: false,
      capabilities: {},
      error: errorMessage,
    }).catch(() => undefined);
    await db.insert(scraperLogs).values({
      scraperConfigId: job.scraperConfigId,
      status: "failed",
      startedAt,
      completedAt: new Date(),
      durationMs: Date.now() - startedAt.getTime(),
      productsScraped: 0,
      productsMatched: 0,
      productsUpdated: 0,
      productsCreated: 0,
      errorMessage: errorMessage.slice(0, 500),
    }).catch(() => undefined);
  }
}

export async function listCaptureReviewQueue(input: {
  scraperConfigId?: number;
  supplierId?: number;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [inArray(supplierProductObservations.action, ["review", "blocked"] as const)];
  if (input.scraperConfigId) conditions.push(eq(supplierProductObservations.scraperConfigId, input.scraperConfigId));
  if (input.supplierId) conditions.push(eq(supplierProductObservations.supplierId, input.supplierId));
  return db.select().from(supplierProductObservations)
    .where(and(...conditions))
    .orderBy(desc(supplierProductObservations.capturedAt))
    .limit(Math.min(Math.max(input.limit ?? 100, 1), 500));
}

export async function decideCaptureObservation(input: {
  observationId: number;
  decision: "approve" | "reject";
  expectedProductId?: number | null;
  userId?: number | null;
  notes?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const [obs] = await db.select().from(supplierProductObservations)
    .where(eq(supplierProductObservations.id, input.observationId)).limit(1);
  if (!obs) throw new Error("Observação não encontrada.");

  if (input.decision === "reject") {
    await db.update(supplierProductObservations)
      .set({ action: "blocked", reason: input.notes || "Rejeitado por revisão humana." })
      .where(eq(supplierProductObservations.id, obs.id));
    await recordCaptureAiFeedback({
      supplierId: obs.supplierId,
      observationId: obs.id,
      decision: obs.productId ? "reject_update" : "wrong_match",
      observedName: obs.rawName,
      expectedProductId: input.expectedProductId ?? null,
      notes: input.notes,
      createdByUserId: input.userId,
    });
    return { applied: false, status: "rejected" as const };
  }

  const productId = input.expectedProductId ?? obs.productId;
  if (!productId) throw new Error("Para aprovar produto não identificado, selecione o produto mestre correspondente.");
  const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!product) throw new Error("Produto mestre selecionado não existe.");
  const [supplier] = await db.select({ name: suppliers.name }).from(suppliers)
    .where(eq(suppliers.id, obs.supplierId)).limit(1);
  const [existing] = await db.select({
    id: productSupplierOffers.id,
    productId: productSupplierOffers.productId,
    supplierCode: productSupplierOffers.supplierCode,
    price: productSupplierOffers.price,
    promoPrice: productSupplierOffers.promoPrice,
    stock: productSupplierOffers.stock,
    availability: productSupplierOffers.availability,
  }).from(productSupplierOffers)
    .where(and(eq(productSupplierOffers.productId, productId), eq(productSupplierOffers.supplierId, obs.supplierId)))
    .limit(1);

  await upsertOffer({
    productId,
    supplierId: obs.supplierId,
    supplierName: supplier?.name || `Fornecedor #${obs.supplierId}`,
    product: {
      name: obs.rawName,
      code: obs.supplierSku ?? undefined,
      ean: obs.ean ?? undefined,
      price: Number(obs.price || 0),
      priceNormal: obs.normalPrice != null ? Number(obs.normalPrice) : undefined,
      pricePromo: obs.promoPrice != null ? Number(obs.promoPrice) : undefined,
      stock: obs.stock ?? undefined,
      productUrl: obs.productUrl ?? undefined,
      imageUrl: obs.imageUrl ?? undefined,
    },
    availability: obs.availability,
    existing: existing ?? undefined,
  });
  await db.update(supplierProductObservations)
    .set({ productId, action: "update", reason: input.notes || "Aprovado por revisão humana." })
    .where(eq(supplierProductObservations.id, obs.id));
  await recordCaptureAiFeedback({
    supplierId: obs.supplierId,
    observationId: obs.id,
    decision: obs.productId === productId ? "approve_update" : "correct_match",
    observedName: obs.rawName,
    expectedProductId: productId,
    notes: input.notes,
    createdByUserId: input.userId,
  });
  return { applied: true, status: "approved" as const, productId };
}

export async function getConnectorHealthList() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(captureConnectorHealth).orderBy(desc(captureConnectorHealth.updatedAt));
}

export async function recoverStaleCaptureJobs(maxAgeMinutes = 15) {
  const db = await getDb();
  if (!db) return 0;
  const running = await db.select().from(captureJobs).where(eq(captureJobs.status, "running"));
  const cutoff = Date.now() - maxAgeMinutes * 60_000;
  let recovered = 0;
  for (const job of running) {
    const heartbeat = job.heartbeatAt?.getTime() ?? job.startedAt?.getTime() ?? job.updatedAt.getTime();
    if (heartbeat >= cutoff) continue;
    const retry = job.attempts < job.maxAttempts;
    await db.update(captureJobs).set({
      status: retry ? "queued" : "failed",
      workerId: null,
      heartbeatAt: null,
      startedAt: retry ? null : job.startedAt,
      completedAt: retry ? null : new Date(),
      progressStage: retry ? "recovered" : "failed",
      progressMessage: retry
        ? "Job recuperado após interrupção do processo."
        : "Job excedeu tentativas após interrupção do processo.",
      errorMessage: retry ? null : "Worker interrompido sem heartbeat.",
    }).where(eq(captureJobs.id, job.id));
    recovered++;
  }
  return recovered;
}
