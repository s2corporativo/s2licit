import { createHash } from "crypto";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { getDb, recordPriceHistory } from "../db";
import {
  productSupplierOffers,
  products,
  scraperConfigs,
  scraperLogs,
  suppliers,
} from "../../drizzle/schema";
import {
  captureConnectorHealth,
  captureJobEvents,
  captureJobs,
  supplierProductObservations,
  type CaptureJob,
} from "../../drizzle/captureCoreSchema";
import { combinedStringSimilarity, normalizeText } from "../matching/productMatcher";
import { captureSupplierProducts } from "./scraperCaptureAdapter";
import {
  capturePresentationCompatible,
  evaluateCapturePriceChange,
  evaluateCaptureQuality,
  normalizeCaptureAvailability,
  normalizeCaptureEan,
  type NormalizedAvailability,
} from "./captureCoreService";
import {
  explainCaptureAnomaly,
  recordCaptureAiFeedback,
  resolveAmbiguousProductMatch,
  resolveLearnedCaptureMatch,
} from "./captureAiService";
import type { ScrapedProduct } from "./scraperEngine";
import { logger } from "../_core/logger";

const AUTO_NAME_MATCH = Number(process.env.CAPTURE_AUTO_NAME_MATCH || 0.94);
const AI_NAME_MATCH_MIN = Number(process.env.CAPTURE_AI_NAME_MATCH_MIN || 0.82);
const STORE_UNCHANGED = process.env.CAPTURE_STORE_UNCHANGED === "true";

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
  link: string | null;
  image: string | null;
};

type Action = "no_change" | "update" | "create" | "review" | "blocked";
type HealthStatus = "healthy" | "attention" | "login_required" | "degraded" | "unknown";

function legacyAvailability(value: NormalizedAvailability): string {
  if (value === "in_stock" || value === "limited") return "disponivel";
  if (value === "out_of_stock") return "indisponivel";
  if (value === "backorder") return "sob_encomenda";
  return "desconhecido";
}

function observationHash(input: {
  supplierSku?: string | null;
  ean?: string | null;
  name: string;
  price?: number | null;
  promo?: number | null;
  stock?: number | null;
  availability: NormalizedAvailability;
}) {
  return createHash("sha256").update(JSON.stringify({
    supplierSku: input.supplierSku?.trim() || null,
    ean: normalizeCaptureEan(input.ean),
    name: normalizeText(input.name),
    price: input.price ?? null,
    promo: input.promo ?? null,
    stock: input.stock ?? null,
    availability: input.availability,
  })).digest("hex");
}

async function addEvent(
  jobId: number,
  stage: string,
  message: string,
  level: "info" | "warning" | "error" = "info",
  data?: Record<string, unknown>,
) {
  const db = await getDb();
  if (!db) return;
  await db.insert(captureJobEvents)
    .values({ captureJobId: jobId, stage, message, level, data })
    .catch(() => undefined);
  await db.update(captureJobs)
    .set({ progressStage: stage, progressMessage: message, heartbeatAt: new Date() })
    .where(eq(captureJobs.id, jobId))
    .catch(() => undefined);
}

async function loadContext(supplierId: number) {
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
    link: productSupplierOffers.link,
    image: productSupplierOffers.image,
  }).from(productSupplierOffers).where(eq(productSupplierOffers.supplierId, supplierId));

  const byId = new Map(productRows.map((row) => [row.id, row]));
  const eanMap = new Map<string, ProductInfo | null>();
  const buckets = new Map<string, ProductInfo[]>();

  for (const product of productRows) {
    for (const raw of [product.ean, product.gtin, product.barcode]) {
      const ean = normalizeCaptureEan(raw);
      if (!ean) continue;
      if (!eanMap.has(ean)) eanMap.set(ean, product);
      else if (eanMap.get(ean)?.id !== product.id) eanMap.set(ean, null);
    }

    const tokens = Array.from(new Set(
      normalizeText(product.name).split(/\s+/).filter((word) => word.length >= 3).slice(0, 3),
    ));
    for (const token of tokens) buckets.set(token, [...(buckets.get(token) ?? []), product]);
  }

  const offerByCode = new Map<string, OfferInfo>();
  const offerByProduct = new Map<number, OfferInfo>();
  for (const offer of offers) {
    if (offer.supplierCode) offerByCode.set(offer.supplierCode.trim(), offer);
    offerByProduct.set(offer.productId, offer);
  }

  const pendingRows = await db.select({ contentHash: supplierProductObservations.contentHash })
    .from(supplierProductObservations)
    .where(and(
      eq(supplierProductObservations.supplierId, supplierId),
      eq(supplierProductObservations.reviewStatus, "pending"),
    ));
  const pendingHashes = new Set(pendingRows.map((row) => row.contentHash));

  return { byId, eanMap, buckets, offerByCode, offerByProduct, pendingHashes };
}

async function chooseMatch(
  job: CaptureJob,
  scraped: ScrapedProduct,
  ctx: Awaited<ReturnType<typeof loadContext>>,
): Promise<{
  product: ProductInfo | null;
  existingOffer?: OfferInfo;
  deterministic: boolean;
  confidence: number;
  actionHint?: Action;
  reason: string;
}> {
  const ean = normalizeCaptureEan(scraped.ean);

  if (ean && ctx.eanMap.has(ean)) {
    const exact = ctx.eanMap.get(ean);
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
      existingOffer: ctx.offerByProduct.get(exact.id),
      deterministic: true,
      confidence: 1,
      reason: "EAN/GTIN exato.",
    };
  }

  if (scraped.code) {
    const offer = ctx.offerByCode.get(scraped.code.trim());
    const candidate = offer ? ctx.byId.get(offer.productId) : undefined;
    if (candidate) {
      const candidateEan = normalizeCaptureEan(candidate.ean || candidate.gtin || candidate.barcode);
      if (ean && candidateEan && ean !== candidateEan) {
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

  const learnedId = await resolveLearnedCaptureMatch(job.supplierId, scraped.name);
  if (learnedId) {
    const learned = ctx.byId.get(learnedId);
    if (learned) {
      const learnedEan = normalizeCaptureEan(learned.ean || learned.gtin || learned.barcode);
      if ((!ean || !learnedEan || ean === learnedEan) && capturePresentationCompatible(scraped.name, learned.name)) {
        return {
          product: learned,
          existingOffer: ctx.offerByProduct.get(learned.id),
          deterministic: true,
          confidence: 0.995,
          reason: "Correspondência reutilizada de decisão humana anterior.",
        };
      }
    }
  }

  const normalized = normalizeText(scraped.name);
  const tokens = Array.from(new Set(
    normalized.split(/\s+/).filter((word) => word.length >= 3).slice(0, 3),
  ));
  const candidateMap = new Map<number, ProductInfo>();
  for (const token of tokens) {
    for (const product of ctx.buckets.get(token) ?? []) candidateMap.set(product.id, product);
  }

  const candidates = [...candidateMap.values()]
    .map((candidate) => ({
      candidate,
      score: combinedStringSimilarity(normalized, normalizeText(candidate.name)),
    }))
    .filter(({ candidate }) => {
      const candidateEan = normalizeCaptureEan(candidate.ean || candidate.gtin || candidate.barcode);
      return !(ean && candidateEan && ean !== candidateEan);
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  const best = candidates[0];
  if (best && best.score >= AUTO_NAME_MATCH && capturePresentationCompatible(scraped.name, best.candidate.name)) {
    return {
      product: best.candidate,
      existingOffer: ctx.offerByProduct.get(best.candidate.id),
      deterministic: false,
      confidence: best.score,
      actionHint: "review",
      reason: `Nome/apresentação muito semelhantes (${(best.score * 100).toFixed(1)}%), aguardando confirmação humana inicial.`,
    };
  }

  if (best && best.score >= AI_NAME_MATCH_MIN) {
    const ai = await resolveAmbiguousProductMatch({
      supplierId: job.supplierId,
      observed: {
        name: scraped.name,
        ean,
        sku: scraped.code,
        unit: scraped.unit,
        price: scraped.price,
      },
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
      const selected = ctx.byId.get(ai.selectedProductId) ?? null;
      return {
        product: selected,
        existingOffer: selected ? ctx.offerByProduct.get(selected.id) : undefined,
        deterministic: false,
        confidence: ai.confidence,
        actionHint: "review",
        reason: `IA sugeriu correspondência, sem aplicação automática: ${ai.reason}`,
      };
    }
    return {
      product: null,
      deterministic: false,
      confidence: ai?.confidence ?? best.score,
      actionHint: "review",
      reason: ai?.reason || "Identidade insuficiente para automação.",
    };
  }

  if (ean) {
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

async function upsertOffer(input: {
  productId: number;
  supplierId: number;
  supplierName: string;
  scraped: ScrapedProduct;
  availability: NormalizedAvailability;
  existing?: OfferInfo;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");

  const values = {
    price: String(input.scraped.price),
    supplierCode: input.scraped.code ?? input.existing?.supplierCode ?? null,
    supplierName: input.supplierName,
    link: input.scraped.productUrl ?? input.existing?.link ?? null,
    image: input.scraped.imageUrl ?? input.existing?.image ?? null,
    availability: input.availability === "unknown" && input.existing?.availability
      ? input.existing.availability
      : legacyAvailability(input.availability),
    promoPrice: input.scraped.pricePromo != null ? String(input.scraped.pricePromo) : null,
    stock: input.scraped.stock ?? input.existing?.stock ?? null,
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

  await recordPriceHistory({
    productId: input.productId,
    supplierId: input.supplierId,
    price: String(input.scraped.price),
  }).catch(() => undefined);
}

async function getHealth(scraperConfigId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(captureConnectorHealth)
    .where(eq(captureConnectorHealth.scraperConfigId, scraperConfigId))
    .limit(1);
  return row ?? null;
}

async function saveHealth(input: {
  job: CaptureJob;
  score: number;
  captured: number;
  successful: boolean;
  capabilities: Record<string, unknown>;
  error?: string | null;
  statusOverride?: HealthStatus;
}) {
  const db = await getDb();
  if (!db) return;
  const existing = await getHealth(input.job.scraperConfigId);
  const now = new Date();
  const baseline = input.successful && input.job.mode === "full"
    ? Math.round(existing?.baselineItems ? existing.baselineItems * 0.8 + input.captured * 0.2 : input.captured)
    : existing?.baselineItems ?? null;
  const status: HealthStatus = input.statusOverride ?? (
    input.successful
      ? input.score >= 90 ? "healthy" : input.score >= 70 ? "attention" : "degraded"
      : "degraded"
  );
  const values = {
    supplierId: input.job.supplierId,
    status,
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

function failureKind(message: string): "login" | "transient" | "permanent" {
  const value = message.toLowerCase();
  if (/captcha|2fa|mfa|credencial|senha|login|autentic|acesso negado|unauthor|forbidden/.test(value)) return "login";
  if (/timeout|timed out|econn|enotfound|socket|network|navigation|target closed|browser.*disconnect|429|502|503|504|temporar/.test(value)) {
    return "transient";
  }
  return "permanent";
}

async function writeLegacyLog(input: {
  job: CaptureJob;
  startedAt: Date;
  status: "success" | "failed";
  captured: number;
  matched: number;
  changed: number;
  created?: number;
  error?: string | null;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(scraperLogs).values({
    scraperConfigId: input.job.scraperConfigId,
    status: input.status,
    startedAt: input.startedAt,
    completedAt: new Date(),
    durationMs: Date.now() - input.startedAt.getTime(),
    productsScraped: input.captured,
    productsMatched: input.matched,
    productsUpdated: input.changed,
    productsCreated: input.created ?? 0,
    errorMessage: input.error?.slice(0, 500) ?? null,
  }).catch(() => undefined);
}

/** Único processador operacional do Capture Core. */
export async function processCaptureJobSafe(jobId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const [job] = await db.select().from(captureJobs).where(eq(captureJobs.id, jobId)).limit(1);
  if (!job) throw new Error(`Capture job #${jobId} não encontrado.`);

  const startedAt = job.startedAt ?? new Date();
  let supplierName = `Fornecedor #${job.supplierId}`;

  try {
    const [supplier] = await db.select({ name: suppliers.name }).from(suppliers)
      .where(eq(suppliers.id, job.supplierId)).limit(1);
    if (supplier) supplierName = supplier.name;

    await addEvent(job.id, "capture", `Iniciando captura ${job.mode} de ${supplierName}.`);
    const captured = await captureSupplierProducts({
      scraperConfigId: job.scraperConfigId,
      mode: job.mode,
      query: job.query,
    });
    for (const warning of captured.warnings.slice(0, 30)) {
      await addEvent(job.id, "capture", warning, "warning");
    }

    const previousHealth = await getHealth(job.scraperConfigId);
    const gate = evaluateCaptureQuality({
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
      await addEvent(job.id, "quality", `Captura em quarentena: ${reason}`, "error");
      const aiDiagnosis = await explainCaptureAnomaly({
        supplierName,
        capturedItems: captured.products.length,
        baselineItems: previousHealth?.baselineItems,
        errorItems: 0,
        warnings: captured.warnings,
      });
      if (aiDiagnosis) await addEvent(job.id, "ai_diagnosis", aiDiagnosis, "warning");

      await db.update(captureJobs).set({
        status: "quarantine",
        activeKey: null,
        workerId: null,
        heartbeatAt: null,
        completedAt: new Date(),
        progressStage: "quarantine",
        progressMessage: reason,
        errorMessage: reason,
      }).where(eq(captureJobs.id, job.id));
      await saveHealth({
        job,
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
      await writeLegacyLog({
        job,
        startedAt,
        status: "failed",
        captured: captured.products.length,
        matched: 0,
        changed: 0,
        error: reason,
      });
      return;
    }

    await addEvent(job.id, "matching", `Quality gate aprovado (${gate.score.toFixed(0)}/100). Matching seguro iniciado.`);
    const ctx = await loadContext(job.supplierId);
    const observations: Array<typeof supplierProductObservations.$inferInsert> = [];
    let matched = 0;
    let changed = 0;
    let proposedCreate = 0;
    let review = 0;
    let errors = 0;

    for (const scraped of captured.products) {
      try {
        const availability = normalizeCaptureAvailability(scraped.availability, scraped.stock);
        const match = await chooseMatch(job, scraped, ctx);
        const product = match.product;
        const existingOffer = match.existingOffer;
        let action: Action = match.actionHint ?? "no_change";
        let reason = match.reason;

        if (!Number.isFinite(scraped.price) || scraped.price <= 0) {
          action = "blocked";
          reason = "Preço inválido ou ausente.";
        } else if (product) {
          const previousPrice = existingOffer?.price ?? (product.supplierId === job.supplierId ? product.price : null);
          const anomaly = evaluateCapturePriceChange(scraped.price, previousPrice);
          if (anomaly.level === "block") {
            action = "blocked";
            reason = anomaly.change == null
              ? "Preço inválido."
              : `Variação de preço ${(anomaly.change * 100).toFixed(1)}% bloqueada.`;
          } else if (anomaly.level === "review") {
            action = "review";
            reason = `Variação de preço ${(anomaly.change! * 100).toFixed(1)}% requer revisão.`;
          } else if (match.deterministic) {
            const same = Boolean(existingOffer) &&
              Number(existingOffer?.price || 0) === scraped.price &&
              Number(existingOffer?.promoPrice || 0) === Number(scraped.pricePromo || 0) &&
              Number(existingOffer?.stock ?? -1) === Number(scraped.stock ?? -1) &&
              (availability === "unknown" || String(existingOffer?.availability || "") === legacyAvailability(availability));
            action = same ? "no_change" : "update";
          }
        }

        if (action === "update" && product) {
          await upsertOffer({
            productId: product.id,
            supplierId: job.supplierId,
            supplierName,
            scraped,
            availability,
            existing: existingOffer,
          });
          if (product.supplierId === job.supplierId) {
            const updates: Record<string, unknown> = {
              price: String(scraped.price),
              updatedAt: new Date(),
            };
            if (scraped.imageUrl && !product.imageUrl) updates.imageUrl = scraped.imageUrl;
            if (scraped.productUrl) updates.productUrl = scraped.productUrl;
            await db.update(products).set(updates).where(eq(products.id, product.id));
          }
          changed++;
        }

        if (product) matched++;
        if (action === "create") proposedCreate++;
        if (action === "create" || action === "review" || action === "blocked") review++;

        const hash = observationHash({
          supplierSku: scraped.code,
          ean: scraped.ean,
          name: scraped.name,
          price: scraped.price,
          promo: scraped.pricePromo,
          stock: scraped.stock,
          availability,
        });
        const needsHuman = action === "create" || action === "review" || action === "blocked";
        const duplicatePending = needsHuman && ctx.pendingHashes.has(hash);

        if ((STORE_UNCHANGED || action !== "no_change") && !duplicatePending) {
          observations.push({
            captureJobId: job.id,
            scraperConfigId: job.scraperConfigId,
            supplierId: job.supplierId,
            productId: product?.id ?? null,
            supplierSku: scraped.code ?? null,
            ean: normalizeCaptureEan(scraped.ean),
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
            sourceType: scraped.sourceType,
            sourceUrl: scraped.fonteUrl ?? scraped.productUrl ?? null,
            contentHash: hash,
            confidence: String(Math.round(match.confidence * 10000) / 100),
            action,
            reason,
            reviewStatus: needsHuman ? "pending" : "approved",
            reviewedAt: needsHuman ? null : new Date(),
            rawPayload: {
              name: scraped.name,
              code: scraped.code,
              ean: scraped.ean,
              unit: scraped.unit,
              availability: scraped.availability,
              consultedAt: scraped.consultadoEm,
            },
          });
          if (needsHuman) ctx.pendingHashes.add(hash);
        }
      } catch (error) {
        errors++;
        await addEvent(job.id, "item", `Falha em item: ${(error as Error).message}`, "error");
      }
    }

    for (let index = 0; index < observations.length; index += 500) {
      await db.insert(supplierProductObservations).values(observations.slice(index, index + 500));
    }

    let score = gate.score;
    const errorRatio = captured.products.length ? errors / captured.products.length : 0;
    const reviewRatio = captured.products.length ? review / captured.products.length : 0;
    score -= Math.min(errorRatio * 100, 30);
    score -= Math.min(reviewRatio * 20, 15);
    score = Math.max(0, Math.min(score, 100));
    const finalStatus: "success" | "partial" =
      errors > 0 || review > 0 || captured.products.length === 0 ? "partial" : "success";

    await db.update(captureJobs).set({
      status: finalStatus,
      activeKey: null,
      workerId: null,
      heartbeatAt: null,
      completedAt: new Date(),
      progressStage: "done",
      progressMessage: `${captured.products.length} capturados; ${changed} atualizações; ${proposedCreate} novos propostos; ${review} revisões.`,
      capturedItems: captured.products.length,
      matchedItems: matched,
      changedItems: changed,
      createdItems: 0,
      reviewItems: review,
      errorItems: errors,
      qualityScore: String(score),
      errorMessage: errors ? `${errors} item(ns) com erro.` : null,
    }).where(eq(captureJobs.id, job.id));

    await addEvent(
      job.id,
      "done",
      `Captura concluída: ${captured.products.length} itens, ${changed} atualizações, ${proposedCreate} criações propostas, ${review} revisões, ${errors} erros.`,
    );
    // addEvent atualiza heartbeat; terminal precisa ficar sem lease.
    await db.update(captureJobs).set({ heartbeatAt: null }).where(eq(captureJobs.id, job.id));

    await saveHealth({
      job,
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
      productsCreatedCount: 0,
    }).where(eq(scraperConfigs.id, job.scraperConfigId));
    await writeLegacyLog({
      job,
      startedAt,
      status: "success",
      captured: captured.products.length,
      matched,
      changed,
      error: finalStatus === "partial" ? `${review} revisão(ões), ${errors} erro(s)` : null,
    });
  } catch (error) {
    const message = (error as Error).message;
    const kind = failureKind(message);
    logger.error(`[CaptureSafeProcessor] Job #${job.id} falhou (${kind}):`, error);
    await addEvent(job.id, "failed", message, kind === "transient" ? "warning" : "error");

    if (kind === "transient" && job.attempts < job.maxAttempts) {
      const delayMinutes = Math.min(15, 2 ** Math.max(job.attempts - 1, 0));
      await db.update(captureJobs).set({
        status: "queued",
        activeKey: `scraper:${job.scraperConfigId}`,
        workerId: null,
        heartbeatAt: null,
        startedAt: null,
        completedAt: null,
        runAfter: new Date(Date.now() + delayMinutes * 60_000),
        progressStage: "retry_wait",
        progressMessage: `Falha transitória; nova tentativa em ${delayMinutes} min.`,
        errorMessage: message.slice(0, 2000),
      }).where(eq(captureJobs.id, job.id));
      return;
    }

    await db.update(captureJobs).set({
      status: "failed",
      activeKey: null,
      workerId: null,
      heartbeatAt: null,
      completedAt: new Date(),
      progressStage: "failed",
      progressMessage: message,
      errorMessage: message,
    }).where(eq(captureJobs.id, job.id));
    await db.update(scraperConfigs).set({
      lastRunAt: new Date(),
      lastRunStatus: "failed",
      lastRunErrorMessage: message.slice(0, 500),
    }).where(eq(scraperConfigs.id, job.scraperConfigId)).catch(() => undefined);
    await saveHealth({
      job,
      score: 0,
      captured: 0,
      successful: false,
      capabilities: {},
      error: message,
      statusOverride: kind === "login" ? "login_required" : "degraded",
    }).catch(() => undefined);
    await writeLegacyLog({
      job,
      startedAt,
      status: "failed",
      captured: 0,
      matched: 0,
      changed: 0,
      error: message,
    });
  }
}

export async function listSafeCaptureReviewQueue(input: {
  scraperConfigId?: number;
  supplierId?: number;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  const actions = ["create", "review", "blocked"] as const;
  const filters = [
    eq(supplierProductObservations.reviewStatus, "pending"),
    inArray(supplierProductObservations.action, actions),
  ];
  if (input.scraperConfigId) filters.push(eq(supplierProductObservations.scraperConfigId, input.scraperConfigId));
  if (input.supplierId) filters.push(eq(supplierProductObservations.supplierId, input.supplierId));

  return db.select().from(supplierProductObservations)
    .where(and(...filters))
    .orderBy(desc(supplierProductObservations.capturedAt))
    .limit(limit);
}

function payloadUnit(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>).unit;
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 64) : null;
}

export async function decideSafeCaptureObservation(input: {
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
  if (obs.reviewStatus !== "pending") {
    throw new Error(`Esta observação já foi revisada (${obs.reviewStatus}).`);
  }

  if (input.decision === "reject") {
    await db.update(supplierProductObservations).set({
      reviewStatus: "rejected",
      reviewedAt: new Date(),
      reviewedByUserId: input.userId ?? null,
      reason: input.notes || obs.reason || "Rejeitado por revisão humana.",
    }).where(and(
      eq(supplierProductObservations.id, obs.id),
      eq(supplierProductObservations.reviewStatus, "pending"),
    ));
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

  const observedPrice = Number(obs.price || 0);
  if (!Number.isFinite(observedPrice) || observedPrice <= 0) {
    throw new Error("A observação não possui preço válido para aplicação.");
  }

  const [supplier] = await db.select({ name: suppliers.name }).from(suppliers)
    .where(eq(suppliers.id, obs.supplierId)).limit(1);
  const supplierName = supplier?.name || `Fornecedor #${obs.supplierId}`;

  let productId = input.expectedProductId ?? obs.productId;
  let created = false;

  if (obs.action === "create" && !input.expectedProductId) {
    const ean = normalizeCaptureEan(obs.ean);
    if (ean) {
      const [existingByEan] = await db.select({ id: products.id }).from(products)
        .where(or(eq(products.ean, ean), eq(products.gtin, ean), eq(products.barcode, ean)))
        .limit(1);
      if (existingByEan) productId = existingByEan.id;
    }
    if (!productId) {
      const [inserted] = await db.insert(products).values({
        supplierId: obs.supplierId,
        name: obs.rawName.slice(0, 512),
        price: String(observedPrice),
        codigoFornecedor: obs.supplierSku,
        code: obs.supplierSku,
        ean,
        gtin: ean,
        unit: payloadUnit(obs.rawPayload),
        imageUrl: obs.imageUrl,
        productUrl: obs.productUrl,
        stock: obs.stock != null ? String(obs.stock) : null,
        statusConfiabilidade: "parcial",
        isActive: "yes",
      });
      productId = Number((inserted as any).insertId);
      created = true;
    }
  }

  if (!productId) {
    throw new Error("Selecione o produto mestre correspondente ou aprove uma proposta de criação com EAN.");
  }

  const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!product) throw new Error("Produto mestre selecionado não existe.");

  const observedEan = normalizeCaptureEan(obs.ean);
  const productEan = normalizeCaptureEan(product.ean || product.gtin || product.barcode);
  if (observedEan && productEan && observedEan !== productEan) {
    throw new Error("Aprovação bloqueada: o EAN observado conflita com o produto selecionado.");
  }
  if (!capturePresentationCompatible(obs.rawName, product.name)) {
    throw new Error("Aprovação bloqueada: apresentação/quantidade incompatível com o produto selecionado.");
  }

  const [existingOffer] = await db.select({
    id: productSupplierOffers.id,
    productId: productSupplierOffers.productId,
    supplierCode: productSupplierOffers.supplierCode,
    price: productSupplierOffers.price,
    promoPrice: productSupplierOffers.promoPrice,
    stock: productSupplierOffers.stock,
    availability: productSupplierOffers.availability,
    link: productSupplierOffers.link,
    image: productSupplierOffers.image,
  }).from(productSupplierOffers).where(and(
    eq(productSupplierOffers.productId, productId),
    eq(productSupplierOffers.supplierId, obs.supplierId),
  )).limit(1);

  await upsertOffer({
    productId,
    supplierId: obs.supplierId,
    supplierName,
    scraped: {
      name: obs.rawName,
      code: obs.supplierSku ?? undefined,
      ean: obs.ean ?? undefined,
      price: observedPrice,
      priceNormal: obs.normalPrice != null ? Number(obs.normalPrice) : undefined,
      pricePromo: obs.promoPrice != null ? Number(obs.promoPrice) : undefined,
      stock: obs.stock ?? undefined,
      productUrl: obs.productUrl ?? undefined,
      imageUrl: obs.imageUrl ?? undefined,
    },
    availability: obs.availability,
    existing: existingOffer ?? undefined,
  });

  await db.update(supplierProductObservations).set({
    productId,
    reviewStatus: "approved",
    reviewedAt: new Date(),
    reviewedByUserId: input.userId ?? null,
    reason: input.notes || (created
      ? "Novo produto criado após aprovação humana."
      : "Correspondência/oferta aprovada por revisão humana."),
  }).where(and(
    eq(supplierProductObservations.id, obs.id),
    eq(supplierProductObservations.reviewStatus, "pending"),
  ));

  await recordCaptureAiFeedback({
    supplierId: obs.supplierId,
    observationId: obs.id,
    decision: created || obs.productId !== productId ? "correct_match" : "approve_update",
    observedName: obs.rawName,
    expectedProductId: productId,
    expectedNormalizedName: normalizeText(product.name),
    notes: input.notes || (created ? "Criação de produto aprovada por humano." : null),
    createdByUserId: input.userId,
  });

  return { applied: true, status: "approved" as const, productId, created };
}
