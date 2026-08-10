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
import { explainCaptureAnomaly, recordCaptureAiFeedback, resolveAmbiguousProductMatch } from "./captureAiService";
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
};

type Action = "no_change" | "update" | "create" | "review" | "blocked";

function legacyAvailability(value: NormalizedAvailability): string {
  if (value === "in_stock" || value === "limited") return "disponivel";
  if (value === "out_of_stock") return "indisponivel";
  if (value === "backorder") return "sob_encomenda";
  return "desconhecido";
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
    const first = normalizeText(product.name).split(/\s+/).find((word) => word.length >= 3);
    if (first) buckets.set(first, [...(buckets.get(first) ?? []), product]);
  }

  const offerByCode = new Map<string, OfferInfo>();
  const offerByProduct = new Map<number, OfferInfo>();
  for (const offer of offers) {
    if (offer.supplierCode) offerByCode.set(offer.supplierCode.trim(), offer);
    offerByProduct.set(offer.productId, offer);
  }

  return { byId, eanMap, buckets, offerByCode, offerByProduct };
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
    if (exact) {
      return {
        product: exact,
        existingOffer: ctx.offerByProduct.get(exact.id),
        deterministic: true,
        confidence: 1,
        reason: "EAN/GTIN exato.",
      };
    }
    return {
      product: null,
      deterministic: false,
      confidence: 0,
      actionHint: "blocked",
      reason: "EAN duplicado no catálogo mestre; identidade precisa ser saneada antes da atualização.",
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

  const normalized = normalizeText(scraped.name);
  const first = normalized.split(/\s+/).find((word) => word.length >= 3) ?? "";
  const candidates = (ctx.buckets.get(first) ?? [])
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
      deterministic: true,
      confidence: best.score,
      reason: `Nome/apresentação com similaridade ${(best.score * 100).toFixed(1)}%.`,
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
      reason: ai?.reason || "Nome semelhante, mas identidade insuficiente para automação.",
    };
  }

  // REGRA CENTRAL V2: mesmo EAN sintaticamente válido NÃO autoriza criação.
  // O item fica como proposta de criação até decisão humana explícita.
  if (ean) {
    return {
      product: null,
      deterministic: false,
      confidence: 0.85,
      actionHint: "create",
      reason: "EAN válido ainda não existe no catálogo. Criação proposta para revisão humana.",
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
    supplierCode: input.scraped.code ?? null,
    supplierName: input.supplierName,
    link: input.scraped.productUrl ?? null,
    image: input.scraped.imageUrl ?? null,
    availability: legacyAvailability(input.availability),
    promoPrice: input.scraped.pricePromo != null ? String(input.scraped.pricePromo) : null,
    stock: input.scraped.stock ?? null,
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
    .where(eq(captureConnectorHealth.scraperConfigId, scraperConfigId)).limit(1);
  return row ?? null;
}

async function saveHealth(input: {
  job: CaptureJob;
  score: number;
  captured: number;
  successful: boolean;
  capabilities: Record<string, unknown>;
  error?: string | null;
}) {
  const db = await getDb();
  if (!db) return;
  const existing = await getHealth(input.job.scraperConfigId);
  const now = new Date();
  const baseline = input.successful && input.job.mode === "full"
    ? Math.round(existing?.baselineItems ? existing.baselineItems * 0.8 + input.captured * 0.2 : input.captured)
    : existing?.baselineItems ?? null;
  const values = {
    supplierId: input.job.supplierId,
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

/**
 * Processador efetivamente usado pelo worker. A coleta nunca cria identidade
 * nova; apenas atualizações determinísticas de ofertas passam automaticamente.
 */
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

    await addEvent(job.id, "capture", `Iniciando captura segura ${job.mode} de ${supplierName}.`);
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
          const anomaly = evaluateCapturePriceChange(scraped.price, existingOffer?.price);
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
              String(existingOffer?.availability || "") === legacyAvailability(availability);
            action = same ? "no_change" : "update";
          }
        }

        // Única mutação automática: oferta de produto cuja identidade já é
        // determinística. Produto novo e match de IA nunca chegam aqui.
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

        if (STORE_UNCHANGED || action !== "no_change") {
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
            contentHash: makeObservationHash({
              supplierSku: scraped.code,
              ean: scraped.ean,
              name: scraped.name,
              price: scraped.price,
              promo: scraped.pricePromo,
              stock: scraped.stock,
              availability,
            }),
            confidence: String(Math.round(match.confidence * 10000) / 100),
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
    const errorRatio = captured.products.length ? errors / captured.products.length : 1;
    const reviewRatio = captured.products.length ? review / captured.products.length : 0;
    score -= Math.min(errorRatio * 100, 30);
    score -= Math.min(reviewRatio * 20, 15);
    score = Math.max(0, Math.min(score, 100));
    const finalStatus: "success" | "partial" = review > 0 || errors > 0 ? "partial" : "success";

    await db.update(captureJobs).set({
      status: finalStatus,
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

    await db.insert(scraperLogs).values({
      scraperConfigId: job.scraperConfigId,
      status: "success",
      startedAt,
      completedAt: new Date(),
      durationMs: Date.now() - startedAt.getTime(),
      productsScraped: captured.products.length,
      productsMatched: matched,
      productsUpdated: changed,
      productsCreated: 0,
      errorMessage: finalStatus === "partial" ? `${review} revisão(ões), ${errors} erro(s)` : null,
    }).catch(() => undefined);
  } catch (error) {
    const message = (error as Error).message;
    logger.error(`[CaptureSafeProcessor] Job #${job.id} falhou:`, error);
    await addEvent(job.id, "failed", message, "error");
    await db.update(captureJobs).set({
      status: "failed",
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
      errorMessage: message.slice(0, 500),
    }).catch(() => undefined);
  }
}

function makeObservationHash(input: {
  supplierSku?: string | null;
  ean?: string | null;
  name: string;
  price?: number | null;
  promo?: number | null;
  stock?: number | null;
  availability: NormalizedAvailability;
}): string {
  // Import local evita acoplamento com o hash privado do processador legado.
  const crypto = require("crypto") as typeof import("crypto");
  return crypto.createHash("sha256").update(JSON.stringify({
    supplierSku: input.supplierSku || null,
    ean: normalizeCaptureEan(input.ean),
    name: normalizeText(input.name),
    price: input.price ?? null,
    promo: input.promo ?? null,
    stock: input.stock ?? null,
    availability: input.availability,
  })).digest("hex");
}

/**
 * Fila canônica: inclui `create`, que significa proposta de cadastro ainda sem
 * qualquer linha em `products` ou `product_supplier_offers`.
 */
export async function listSafeCaptureReviewQueue(input: {
  scraperConfigId?: number;
  supplierId?: number;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  const actions = ["create", "review", "blocked"] as const;

  if (input.scraperConfigId && input.supplierId) {
    return db.select().from(supplierProductObservations).where(and(
      inArray(supplierProductObservations.action, actions),
      eq(supplierProductObservations.scraperConfigId, input.scraperConfigId),
      eq(supplierProductObservations.supplierId, input.supplierId),
    )).orderBy(desc(supplierProductObservations.capturedAt)).limit(limit);
  }
  if (input.scraperConfigId) {
    return db.select().from(supplierProductObservations).where(and(
      inArray(supplierProductObservations.action, actions),
      eq(supplierProductObservations.scraperConfigId, input.scraperConfigId),
    )).orderBy(desc(supplierProductObservations.capturedAt)).limit(limit);
  }
  if (input.supplierId) {
    return db.select().from(supplierProductObservations).where(and(
      inArray(supplierProductObservations.action, actions),
      eq(supplierProductObservations.supplierId, input.supplierId),
    )).orderBy(desc(supplierProductObservations.capturedAt)).limit(limit);
  }
  return db.select().from(supplierProductObservations)
    .where(inArray(supplierProductObservations.action, actions))
    .orderBy(desc(supplierProductObservations.capturedAt)).limit(limit);
}

/**
 * Revisão segura. Para `action=create`, a criação acontece somente neste ponto,
 * após clique humano. Se o EAN passou a existir entre captura e revisão, o
 * sistema reaproveita o produto existente em vez de duplicá-lo.
 */
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

  if (input.decision === "reject") {
    await db.update(supplierProductObservations).set({
      action: "blocked",
      reason: input.notes || "Rejeitado por revisão humana.",
    }).where(eq(supplierProductObservations.id, obs.id));
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

  const [supplier] = await db.select({ name: suppliers.name }).from(suppliers)
    .where(eq(suppliers.id, obs.supplierId)).limit(1);
  const supplierName = supplier?.name || `Fornecedor #${obs.supplierId}`;

  let productId = input.expectedProductId ?? obs.productId;
  let created = false;

  if (obs.action === "create" && !input.expectedProductId) {
    const ean = normalizeCaptureEan(obs.ean);
    if (ean) {
      const [existingByEan] = await db.select({ id: products.id }).from(products)
        .where(eq(products.ean, ean)).limit(1);
      if (existingByEan) productId = existingByEan.id;
    }
    if (!productId) {
      const [inserted] = await db.insert(products).values({
        supplierId: obs.supplierId,
        name: obs.rawName.slice(0, 512),
        price: obs.price != null ? String(obs.price) : null,
        codigoFornecedor: obs.supplierSku,
        code: obs.supplierSku,
        ean: ean,
        gtin: ean,
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
    throw new Error("Selecione o produto mestre correspondente ou aprove a proposta de criação.");
  }

  const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!product) throw new Error("Produto mestre selecionado não existe.");

  const [existingOffer] = await db.select({
    id: productSupplierOffers.id,
    productId: productSupplierOffers.productId,
    supplierCode: productSupplierOffers.supplierCode,
    price: productSupplierOffers.price,
    promoPrice: productSupplierOffers.promoPrice,
    stock: productSupplierOffers.stock,
    availability: productSupplierOffers.availability,
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
      price: Number(obs.price || 0),
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
    action: "update",
    reason: input.notes || (created ? "Novo produto criado após aprovação humana." : "Correspondência/oferta aprovada por revisão humana."),
  }).where(eq(supplierProductObservations.id, obs.id));

  await recordCaptureAiFeedback({
    supplierId: obs.supplierId,
    observationId: obs.id,
    decision: created ? "correct_match" : obs.productId === productId ? "approve_update" : "correct_match",
    observedName: obs.rawName,
    expectedProductId: productId,
    notes: input.notes || (created ? "Criação de produto aprovada por humano." : null),
    createdByUserId: input.userId,
  });

  return { applied: true, status: "approved" as const, productId, created };
}
