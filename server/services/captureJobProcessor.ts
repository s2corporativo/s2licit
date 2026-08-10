import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import {
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
import { normalizeText } from "../matching/productMatcher";
import { logger } from "../_core/logger";
import {
  CaptureHumanInterventionRequiredError,
} from "./browserCaptureEngine";
import { captureSupplierProducts, type CapturedSupplierProduct } from "./scraperCaptureAdapter";
import {
  evaluateCapturePriceChange,
  evaluateCaptureQuality,
  normalizeCaptureAvailability,
  normalizeCaptureEan,
  type NormalizedAvailability,
} from "./captureCoreService";
import {
  loadCaptureMatchingContext,
  matchCapturedProduct,
  type CaptureAction,
  type CaptureMatchDecision,
} from "./captureMatchingService";
import { applyCapturedOffer, toLegacyAvailability } from "./captureOfferService";
import { explainCaptureAnomaly } from "./captureAiService";

const STORE_UNCHANGED = process.env.CAPTURE_STORE_UNCHANGED === "true";
const ITEM_WRITE_CONCURRENCY = boundedInteger(
  process.env.CAPTURE_ITEM_WRITE_CONCURRENCY,
  3,
  1,
  5,
);
const MAX_WRITE_FAILURE_RATIO = boundedRatio(
  process.env.CAPTURE_MAX_WRITE_FAILURE_RATIO,
  0.10,
  0.01,
  1,
);
const MAX_ITEM_ERROR_EVENTS = boundedInteger(
  process.env.CAPTURE_MAX_ITEM_ERROR_EVENTS,
  50,
  1,
  500,
);

interface EvaluatedItem {
  scraped: CapturedSupplierProduct;
  availability: NormalizedAvailability;
  match: CaptureMatchDecision;
  action: CaptureAction;
  reason: string;
  contentHash: string;
}

interface EvaluationSummary {
  items: EvaluatedItem[];
  matched: number;
  proposedCreate: number;
  review: number;
  errors: number;
}

interface PersistenceSummary {
  changed: number;
  errors: number;
  failedHashes: Set<string>;
}

type HealthStatus =
  | "healthy"
  | "attention"
  | "login_required"
  | "degraded"
  | "unknown";

type FailureKind = "login" | "transient" | "permanent";

class CaptureTransientProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaptureTransientProcessingError";
  }
}

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!raw?.trim()) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(parsed, max));
}

function boundedRatio(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!raw?.trim()) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(parsed, max));
}

function observationHash(input: {
  supplierSku?: string | null;
  ean?: string | null;
  name: string;
  price?: number | null;
  promo?: number | null;
  stock?: number | null;
  availability: NormalizedAvailability;
}): string {
  const canonical = {
    supplierSku: input.supplierSku?.trim().toUpperCase() || null,
    ean: normalizeCaptureEan(input.ean),
    name: normalizeText(input.name),
    price: input.price ?? null,
    promo: input.promo ?? null,
    stock: input.stock ?? null,
    availability: input.availability,
  };

  return createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");
}

async function addEvent(
  jobId: number,
  stage: string,
  message: string,
  level: "info" | "warning" | "error" = "info",
  data?: Record<string, unknown>,
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .insert(captureJobEvents)
    .values({ captureJobId: jobId, stage, message, level, data })
    .catch(() => undefined);

  await db
    .update(captureJobs)
    .set({
      progressStage: stage,
      progressMessage: message,
      heartbeatAt: new Date(),
    })
    .where(eq(captureJobs.id, jobId))
    .catch(() => undefined);
}

async function loadPendingHashes(supplierId: number): Promise<Set<string>> {
  const db = await getDb();
  if (!db) return new Set();

  const rows = await db
    .select({ contentHash: supplierProductObservations.contentHash })
    .from(supplierProductObservations)
    .where(
      and(
        eq(supplierProductObservations.supplierId, supplierId),
        eq(supplierProductObservations.reviewStatus, "pending"),
      ),
    );

  return new Set(rows.map((row) => row.contentHash));
}

function offerIsEquivalent(
  item: CapturedSupplierProduct,
  availability: NormalizedAvailability,
  existing: CaptureMatchDecision["existingOffer"],
): boolean {
  if (!existing) return false;

  const priceEqual = Number(existing.price || 0) === Number(item.price);
  const promoEqual = item.pricePromo == null
    ? true
    : Number(existing.promoPrice || 0) === Number(item.pricePromo);
  const stockEqual = item.stock == null
    ? true
    : Number(existing.stock ?? -1) === Number(item.stock);
  const availabilityEqual = availability === "unknown"
    ? true
    : String(existing.availability || "") === toLegacyAvailability(availability);

  return priceEqual && promoEqual && stockEqual && availabilityEqual;
}

async function evaluateItems(
  job: CaptureJob,
  products: CapturedSupplierProduct[],
): Promise<EvaluationSummary> {
  const context = await loadCaptureMatchingContext(job.supplierId);
  const items: EvaluatedItem[] = [];
  let matched = 0;
  let proposedCreate = 0;
  let review = 0;
  let errors = 0;

  for (const scraped of products) {
    try {
      const availability = normalizeCaptureAvailability(
        scraped.availability,
        scraped.stock,
      );
      const match = await matchCapturedProduct(scraped, context);
      let action: CaptureAction = match.actionHint ?? "no_change";
      let reason = match.reason;

      if (!Number.isFinite(scraped.price) || scraped.price <= 0) {
        action = "blocked";
        reason = "Preço inválido ou ausente.";
      } else if (match.product) {
        const previousPrice =
          match.existingOffer?.price ??
          (match.product.supplierId === job.supplierId
            ? match.product.price
            : null);
        const anomaly = evaluateCapturePriceChange(
          scraped.price,
          previousPrice,
        );

        if (anomaly.level === "block") {
          action = "blocked";
          reason = anomaly.change == null
            ? "Preço inválido."
            : `Variação de preço ${(anomaly.change * 100).toFixed(1)}% bloqueada.`;
        } else if (anomaly.level === "review") {
          action = "review";
          reason = `Variação de preço ${(anomaly.change! * 100).toFixed(1)}% requer revisão.`;
        } else if (match.deterministic) {
          action = offerIsEquivalent(
            scraped,
            availability,
            match.existingOffer,
          )
            ? "no_change"
            : "update";
        }
      }

      if (match.product) matched += 1;
      if (action === "create") proposedCreate += 1;
      if (action === "create" || action === "review" || action === "blocked") {
        review += 1;
      }

      items.push({
        scraped,
        availability,
        match,
        action,
        reason,
        contentHash: observationHash({
          supplierSku: scraped.code,
          ean: scraped.ean,
          name: scraped.name,
          price: scraped.price,
          promo: scraped.pricePromo,
          stock: scraped.stock,
          availability,
        }),
      });
    } catch (error) {
      errors += 1;
      if (errors <= MAX_ITEM_ERROR_EVENTS) {
        await addEvent(
          job.id,
          "matching_item_error",
          `Falha ao avaliar "${scraped.name.slice(0, 180)}": ${(error as Error).message}`,
          "error",
        );
      }
    }
  }

  return { items, matched, proposedCreate, review, errors };
}

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;

  const runner = async (): Promise<void> => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      await worker(items[index]);
    }
  };

  const workers = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workers }, () => runner()));
}

async function persistSafeUpdates(
  job: CaptureJob,
  supplierName: string,
  items: EvaluatedItem[],
): Promise<PersistenceSummary> {
  const updates = items.filter(
    (item) => item.action === "update" && item.match.product,
  );
  const failedHashes = new Set<string>();
  let changed = 0;
  let errors = 0;

  await runWithConcurrency(updates, ITEM_WRITE_CONCURRENCY, async (item) => {
    try {
      await applyCapturedOffer({
        product: item.match.product!,
        supplierId: job.supplierId,
        supplierName,
        scraped: item.scraped,
        availability: item.availability,
        existingOffer: item.match.existingOffer,
        origin: "capture_core",
      });
      changed += 1;
    } catch (error) {
      errors += 1;
      failedHashes.add(item.contentHash);
      if (errors <= MAX_ITEM_ERROR_EVENTS) {
        await addEvent(
          job.id,
          "persistence_item_error",
          `Falha ao atualizar "${item.scraped.name.slice(0, 180)}": ${(error as Error).message}`,
          "error",
        );
      }
    }
  });

  if (updates.length > 0 && errors / updates.length > MAX_WRITE_FAILURE_RATIO) {
    throw new CaptureTransientProcessingError(
      `Falha sistêmica de persistência: ${errors}/${updates.length} atualizações falharam ` +
        `(limite ${(MAX_WRITE_FAILURE_RATIO * 100).toFixed(0)}%).`,
    );
  }

  return { changed, errors, failedHashes };
}

async function persistObservations(input: {
  job: CaptureJob;
  items: EvaluatedItem[];
  failedHashes: ReadonlySet<string>;
  pendingHashes: Set<string>;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível.");

  const observations: Array<typeof supplierProductObservations.$inferInsert> = [];

  for (const item of input.items) {
    if (input.failedHashes.has(item.contentHash)) continue;

    const needsHuman =
      item.action === "create" ||
      item.action === "review" ||
      item.action === "blocked";
    if (needsHuman && input.pendingHashes.has(item.contentHash)) continue;
    if (!STORE_UNCHANGED && item.action === "no_change") continue;

    observations.push({
      captureJobId: input.job.id,
      scraperConfigId: input.job.scraperConfigId,
      supplierId: input.job.supplierId,
      productId: item.match.product?.id ?? null,
      supplierSku: item.scraped.code ?? null,
      ean: normalizeCaptureEan(item.scraped.ean),
      rawName: item.scraped.name.slice(0, 512),
      normalizedName: normalizeText(item.scraped.name).slice(0, 512),
      rawPrice: String(item.scraped.price),
      price: String(item.scraped.price),
      normalPrice:
        item.scraped.priceNormal != null
          ? String(item.scraped.priceNormal)
          : null,
      promoPrice:
        item.scraped.pricePromo != null
          ? String(item.scraped.pricePromo)
          : null,
      stock: item.scraped.stock ?? null,
      availability: item.availability,
      productUrl: item.scraped.productUrl ?? null,
      imageUrl: item.scraped.imageUrl ?? null,
      sourceType: item.scraped.sourceType,
      sourceUrl: item.scraped.fonteUrl ?? item.scraped.productUrl ?? null,
      contentHash: item.contentHash,
      confidence: String(
        Math.round(item.match.confidence * 10_000) / 100,
      ),
      action: item.action,
      reason: item.reason,
      reviewStatus: needsHuman ? "pending" : "approved",
      reviewedAt: needsHuman ? null : new Date(),
      rawPayload: {
        name: item.scraped.name,
        code: item.scraped.code,
        ean: item.scraped.ean,
        unit: item.scraped.unit,
        availability: item.scraped.availability,
        consultedAt: item.scraped.consultadoEm,
      },
    });

    if (needsHuman) input.pendingHashes.add(item.contentHash);
  }

  for (let offset = 0; offset < observations.length; offset += 500) {
    await db
      .insert(supplierProductObservations)
      .values(observations.slice(offset, offset + 500));
  }

  return observations.length;
}

async function getHealth(scraperConfigId: number) {
  const db = await getDb();
  if (!db) return null;

  const [health] = await db
    .select()
    .from(captureConnectorHealth)
    .where(eq(captureConnectorHealth.scraperConfigId, scraperConfigId))
    .limit(1);

  return health ?? null;
}

async function saveHealth(input: {
  job: CaptureJob;
  score: number;
  captured: number;
  successful: boolean;
  capabilities: Record<string, unknown>;
  error?: string | null;
  statusOverride?: HealthStatus;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const existing = await getHealth(input.job.scraperConfigId);
  const now = new Date();
  const baseline =
    input.successful && input.job.mode === "full"
      ? Math.round(
          existing?.baselineItems
            ? existing.baselineItems * 0.8 + input.captured * 0.2
            : input.captured,
        )
      : existing?.baselineItems ?? null;

  const status: HealthStatus = input.statusOverride ?? (
    input.successful
      ? input.score >= 90
        ? "healthy"
        : input.score >= 70
          ? "attention"
          : "degraded"
      : "degraded"
  );

  const values = {
    supplierId: input.job.supplierId,
    status,
    score: String(Math.max(0, Math.min(input.score, 100))),
    baselineItems: baseline,
    lastCapturedItems: input.captured,
    consecutiveFailures: input.successful
      ? 0
      : (existing?.consecutiveFailures ?? 0) + 1,
    lastSuccessAt: input.successful ? now : existing?.lastSuccessAt ?? null,
    lastFailureAt: input.successful ? existing?.lastFailureAt ?? null : now,
    lastError: input.error ?? null,
    capabilities: input.capabilities,
    updatedAt: now,
  };

  await db
    .insert(captureConnectorHealth)
    .values({
      scraperConfigId: input.job.scraperConfigId,
      ...values,
    })
    .onDuplicateKeyUpdate({ set: values });
}

function classifyFailure(error: unknown): FailureKind {
  if (error instanceof CaptureHumanInterventionRequiredError) return "login";
  if (error instanceof CaptureTransientProcessingError) return "transient";

  const message = String(
    error instanceof Error ? error.message : error ?? "",
  ).toLowerCase();

  if (
    /captcha|2fa|mfa|credencial|senha|login|autentic|acesso negado|unauthor|forbidden/.test(
      message,
    )
  ) {
    return "login";
  }

  if (
    /timeout|timed out|econn|enotfound|socket|network|navigation|target closed|browser.*disconnect|429|502|503|504|deadlock|lock wait|pool|connection|persist[eê]ncia|temporar/.test(
      message,
    )
  ) {
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
  error?: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .insert(scraperLogs)
    .values({
      scraperConfigId: input.job.scraperConfigId,
      status: input.status,
      startedAt: input.startedAt,
      completedAt: new Date(),
      durationMs: Date.now() - input.startedAt.getTime(),
      productsScraped: input.captured,
      productsMatched: input.matched,
      productsUpdated: input.changed,
      productsCreated: 0,
      errorMessage: input.error?.slice(0, 500) ?? null,
    })
    .catch(() => undefined);
}

async function finishQuarantine(input: {
  job: CaptureJob;
  startedAt: Date;
  captured: number;
  score: number;
  reason: string;
  capabilities: Record<string, unknown>;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const now = new Date();

  await db
    .update(captureJobs)
    .set({
      status: "quarantine",
      activeKey: null,
      workerId: null,
      heartbeatAt: null,
      completedAt: now,
      progressStage: "quarantine",
      progressMessage: input.reason,
      errorMessage: input.reason,
    })
    .where(eq(captureJobs.id, input.job.id));

  await Promise.all([
    saveHealth({
      job: input.job,
      score: input.score,
      captured: input.captured,
      successful: false,
      capabilities: input.capabilities,
      error: input.reason,
    }),
    db
      .update(scraperConfigs)
      .set({
        lastRunAt: now,
        lastRunStatus: "failed",
        lastRunErrorMessage: input.reason.slice(0, 500),
        productsScrapedCount: input.captured,
      })
      .where(eq(scraperConfigs.id, input.job.scraperConfigId)),
    writeLegacyLog({
      job: input.job,
      startedAt: input.startedAt,
      status: "failed",
      captured: input.captured,
      matched: 0,
      changed: 0,
      error: input.reason,
    }),
  ]);
}

/** Processador operacional único da fila Capture Core. */
export async function processCaptureJob(jobId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível.");

  const [job] = await db
    .select()
    .from(captureJobs)
    .where(eq(captureJobs.id, jobId))
    .limit(1);
  if (!job) throw new Error(`Capture job #${jobId} não encontrado.`);
  if (job.status !== "running") {
    throw new Error(
      `Capture job #${jobId} não está em execução (status=${job.status}).`,
    );
  }

  const startedAt = job.startedAt ?? new Date();
  let supplierName = `Fornecedor #${job.supplierId}`;

  try {
    const [supplier] = await db
      .select({ name: suppliers.name })
      .from(suppliers)
      .where(eq(suppliers.id, job.supplierId))
      .limit(1);
    if (!supplier) throw new Error(`Fornecedor #${job.supplierId} não encontrado.`);
    supplierName = supplier.name;

    await addEvent(
      job.id,
      "capture",
      `Iniciando captura ${job.mode} de ${supplierName}.`,
    );

    const captured = await captureSupplierProducts({
      scraperConfigId: job.scraperConfigId,
      mode: job.mode,
      query: job.query,
    });

    for (const warning of captured.warnings.slice(0, 30)) {
      await addEvent(job.id, "capture_warning", warning, "warning");
    }

    const previousHealth = await getHealth(job.scraperConfigId);
    const gate = evaluateCaptureQuality({
      mode: job.mode,
      captured: captured.products.length,
      baseline: previousHealth?.baselineItems,
      warnings: captured.warnings.length,
    });

    await db
      .update(captureJobs)
      .set({
        capturedItems: captured.products.length,
        expectedItems: previousHealth?.baselineItems ?? null,
        qualityScore: String(gate.score),
      })
      .where(eq(captureJobs.id, job.id));

    if (gate.quarantine) {
      const reason = gate.reasons.join(" ") || "Quality gate bloqueou a captura.";
      await addEvent(job.id, "quality", `Captura em quarentena: ${reason}`, "error");

      const diagnosis = await explainCaptureAnomaly({
        supplierName,
        capturedItems: captured.products.length,
        baselineItems: previousHealth?.baselineItems,
        errorItems: 0,
        warnings: captured.warnings,
      });
      if (diagnosis) {
        await addEvent(job.id, "ai_diagnosis", diagnosis, "warning");
      }

      await finishQuarantine({
        job,
        startedAt,
        captured: captured.products.length,
        score: gate.score,
        reason,
        capabilities: captured.capabilities as unknown as Record<string, unknown>,
      });
      return;
    }

    await addEvent(
      job.id,
      "matching",
      `Quality gate aprovado (${gate.score.toFixed(0)}/100). Avaliando identidade e preço.`,
    );

    const [evaluation, pendingHashes] = await Promise.all([
      evaluateItems(job, captured.products),
      loadPendingHashes(job.supplierId),
    ]);

    await addEvent(
      job.id,
      "persistence",
      `${evaluation.items.length} item(ns) avaliados; aplicando alterações determinísticas com concorrência ${ITEM_WRITE_CONCURRENCY}.`,
    );

    const persistence = await persistSafeUpdates(
      job,
      supplierName,
      evaluation.items,
    );

    await persistObservations({
      job,
      items: evaluation.items,
      failedHashes: persistence.failedHashes,
      pendingHashes,
    });

    const errors = evaluation.errors + persistence.errors;
    let score = gate.score;
    const total = captured.products.length;
    const errorRatio = total > 0 ? errors / total : 0;
    const reviewRatio = total > 0 ? evaluation.review / total : 0;
    score -= Math.min(errorRatio * 100, 30);
    score -= Math.min(reviewRatio * 20, 15);
    score = Math.max(0, Math.min(score, 100));

    const finalStatus: "success" | "partial" =
      errors > 0 || evaluation.review > 0 ? "partial" : "success";
    const now = new Date();
    const summary =
      `${total} capturados; ${persistence.changed} atualizações; ` +
      `${evaluation.proposedCreate} novos propostos; ${evaluation.review} revisões; ` +
      `${errors} erros.`;

    await db
      .update(captureJobs)
      .set({
        status: finalStatus,
        activeKey: null,
        workerId: null,
        heartbeatAt: null,
        completedAt: now,
        progressStage: "done",
        progressMessage: summary,
        capturedItems: total,
        matchedItems: evaluation.matched,
        changedItems: persistence.changed,
        createdItems: 0,
        reviewItems: evaluation.review,
        errorItems: errors,
        qualityScore: String(score),
        errorMessage: errors > 0 ? `${errors} item(ns) com erro.` : null,
      })
      .where(eq(captureJobs.id, job.id));

    await Promise.all([
      saveHealth({
        job,
        score,
        captured: total,
        successful: true,
        capabilities: captured.capabilities as unknown as Record<string, unknown>,
        error: errors > 0 ? `${errors} item(ns) com erro.` : null,
      }),
      db
        .update(scraperConfigs)
        .set({
          lastRunAt: now,
          lastRunStatus: "success",
          lastRunErrorMessage:
            finalStatus === "partial"
              ? `${evaluation.review} revisão(ões), ${errors} erro(s)`
              : null,
          productsScrapedCount: total,
          productsMatchedCount: evaluation.matched,
          productsUpdatedCount: persistence.changed,
          productsCreatedCount: 0,
        })
        .where(eq(scraperConfigs.id, job.scraperConfigId)),
      writeLegacyLog({
        job,
        startedAt,
        status: "success",
        captured: total,
        matched: evaluation.matched,
        changed: persistence.changed,
        error:
          finalStatus === "partial"
            ? `${evaluation.review} revisão(ões), ${errors} erro(s)`
            : null,
      }),
    ]);

    await addEvent(job.id, "done", `Captura concluída: ${summary}`);
    // addEvent atualiza heartbeat por compatibilidade; estado terminal não deve
    // manter lease ativo.
    await db
      .update(captureJobs)
      .set({ heartbeatAt: null })
      .where(eq(captureJobs.id, job.id));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const kind = classifyFailure(error);
    logger.error(
      `[CaptureProcessor] Job #${job.id} falhou (${kind}):`,
      error,
    );

    await addEvent(
      job.id,
      "failed",
      message,
      kind === "transient" ? "warning" : "error",
    );

    if (kind === "transient" && job.attempts < job.maxAttempts) {
      const delayMinutes = Math.min(
        15,
        2 ** Math.max(job.attempts - 1, 0),
      );

      await db
        .update(captureJobs)
        .set({
          status: "queued",
          activeKey: `scraper:${job.scraperConfigId}`,
          workerId: null,
          heartbeatAt: null,
          startedAt: null,
          completedAt: null,
          runAfter: new Date(Date.now() + delayMinutes * 60_000),
          progressStage: "retry_wait",
          progressMessage: `Falha transitória; nova tentativa em ${delayMinutes} min.`,
          errorMessage: message.slice(0, 2_000),
        })
        .where(eq(captureJobs.id, job.id));
      return;
    }

    const now = new Date();
    await db
      .update(captureJobs)
      .set({
        status: "failed",
        activeKey: null,
        workerId: null,
        heartbeatAt: null,
        completedAt: now,
        progressStage: "failed",
        progressMessage: message,
        errorMessage: message.slice(0, 2_000),
      })
      .where(eq(captureJobs.id, job.id));

    await Promise.all([
      db
        .update(scraperConfigs)
        .set({
          lastRunAt: now,
          lastRunStatus: "failed",
          lastRunErrorMessage: message.slice(0, 500),
        })
        .where(eq(scraperConfigs.id, job.scraperConfigId))
        .catch(() => undefined),
      saveHealth({
        job,
        score: 0,
        captured: 0,
        successful: false,
        capabilities: {},
        error: message,
        statusOverride: kind === "login" ? "login_required" : "degraded",
      }).catch(() => undefined),
      writeLegacyLog({
        job,
        startedAt,
        status: "failed",
        captured: 0,
        matched: 0,
        changed: 0,
        error: message,
      }),
    ]);
  }
}
