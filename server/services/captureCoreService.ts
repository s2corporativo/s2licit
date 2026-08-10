import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  or,
} from "drizzle-orm";
import { getDb } from "../db";
import { scraperConfigs } from "../../drizzle/schema";
import {
  captureConnectorHealth,
  captureJobEvents,
  captureJobs,
} from "../../drizzle/captureCoreSchema";
import { getConnectorCapabilities } from "./captureConnectorCapabilities";

const REVIEW_PRICE_CHANGE = readRatioEnv("CAPTURE_REVIEW_PRICE_CHANGE", 0.60, 0, 10);
const BLOCK_PRICE_CHANGE = readRatioEnv("CAPTURE_BLOCK_PRICE_CHANGE", 3.00, 0, 100);
const FULL_MIN_COVERAGE = readRatioEnv("CAPTURE_FULL_MIN_COVERAGE", 0.50, 0, 1);
const FULL_WARN_COVERAGE = readRatioEnv("CAPTURE_FULL_WARN_COVERAGE", 0.75, 0, 1);

export type CaptureMode = "search" | "refresh" | "full";
export type CaptureTrigger = "manual" | "scheduled" | "bulk" | "proposal" | "api";
export type NormalizedAvailability =
  | "in_stock"
  | "out_of_stock"
  | "limited"
  | "backorder"
  | "unknown";

function readRatioEnv(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = process.env[name];
  if (!raw?.trim()) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(parsed, max));
}

export function normalizeCaptureAvailability(
  value?: string | null,
  stock?: number | null,
): NormalizedAvailability {
  const text = String(value || "").trim().toLowerCase();
  if (stock === 0 || /indispon|out.?of.?stock|esgot/.test(text)) {
    return "out_of_stock";
  }
  if (stock != null && stock > 0) return stock <= 5 ? "limited" : "in_stock";
  if (/backorder|encomenda|sob pedido/.test(text)) return "backorder";
  if (/dispon|in.?stock/.test(text)) return "in_stock";
  return "unknown";
}

export function normalizeCaptureEan(value?: string | null): string | null {
  const digits = String(value || "").replace(/\D/g, "");
  return /^\d{8,14}$/.test(digits) ? digits : null;
}

function packSignature(name?: string | null): string {
  const text = String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const tokens = [
    ...text.matchAll(
      /\b(\d+(?:[.,]\d+)?)\s*(mg|mcg|g|kg|ml|l|un|und|unidades?|comprimidos?|capsulas?|ampolas?|frascos?|doses?)\b/gi,
    ),
  ].map((match) =>
    `${match[1].replace(",", ".")}${match[2].toLowerCase()}`,
  );

  return [...new Set(tokens)].sort().join("|");
}

export function capturePresentationCompatible(
  leftName?: string | null,
  rightName?: string | null,
): boolean {
  const left = packSignature(leftName);
  const right = packSignature(rightName);
  return !left || !right || left === right;
}

export function evaluateCapturePriceChange(
  newPrice: number,
  previous?: string | number | null,
) {
  const oldPrice = Number(previous || 0);
  if (!Number.isFinite(newPrice) || newPrice <= 0) {
    return { level: "block" as const, change: null as number | null };
  }
  if (!Number.isFinite(oldPrice) || oldPrice <= 0) {
    return { level: "ok" as const, change: null as number | null };
  }

  const change = Math.abs(newPrice - oldPrice) / oldPrice;
  if (change >= BLOCK_PRICE_CHANGE) {
    return { level: "block" as const, change };
  }
  if (change >= REVIEW_PRICE_CHANGE) {
    return { level: "review" as const, change };
  }
  return { level: "ok" as const, change };
}

export function evaluateCaptureQuality(input: {
  mode: CaptureMode;
  captured: number;
  baseline?: number | null;
  warnings?: number;
}) {
  let score = 100;
  let quarantine = false;
  const reasons: string[] = [];

  if (input.captured === 0) {
    if (input.mode === "full") {
      return {
        score: 0,
        quarantine: true,
        reasons: ["Nenhum produto foi capturado no catálogo completo."],
      };
    }
    return {
      score: 70,
      quarantine: false,
      reasons: [
        "A busca/atualização seletiva não retornou produtos; o conector ficou em atenção sem alterar o catálogo.",
      ],
    };
  }

  if (input.mode === "full" && input.baseline && input.baseline > 0) {
    const coverage = input.captured / input.baseline;
    if (coverage < FULL_MIN_COVERAGE) {
      quarantine = true;
      score -= 60;
      reasons.push(
        `Cobertura ${(coverage * 100).toFixed(1)}% abaixo do mínimo histórico.`,
      );
    } else if (coverage < FULL_WARN_COVERAGE) {
      score -= 25;
      reasons.push(
        `Cobertura reduzida: ${(coverage * 100).toFixed(1)}% do baseline.`,
      );
    }
  }

  score -= Math.min((input.warnings ?? 0) * 2, 20);
  return {
    score: Math.max(0, score),
    quarantine,
    reasons,
  };
}

function isDuplicateActiveJob(error: unknown): boolean {
  const value = error as { code?: unknown; message?: unknown };
  const code = String(value?.code ?? "").toLowerCase();
  const message = String(value?.message ?? error ?? "").toLowerCase();
  return (
    code === "er_dup_entry" ||
    message.includes("uq_capture_jobs_active_key") ||
    (message.includes("duplicate") && message.includes("activekey"))
  );
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

export async function getActiveCaptureJob(scraperConfigId: number) {
  const db = await getDb();
  if (!db) return null;

  const [job] = await db
    .select()
    .from(captureJobs)
    .where(
      and(
        eq(captureJobs.scraperConfigId, scraperConfigId),
        inArray(captureJobs.status, ["queued", "running"]),
      ),
    )
    .orderBy(desc(captureJobs.createdAt))
    .limit(1);

  return job ?? null;
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
  if (!db) throw new Error("Banco indisponível.");

  const [config] = await db
    .select()
    .from(scraperConfigs)
    .where(eq(scraperConfigs.id, input.scraperConfigId))
    .limit(1);

  if (!config) throw new Error("Configuração de captura não encontrada.");
  if (config.enabled !== "yes") {
    throw new Error("Esta configuração de captura está desativada.");
  }
  if (!config.tosAprovado) {
    throw new Error("Captura bloqueada: termos de uso ainda não aprovados.");
  }

  const active = await getActiveCaptureJob(input.scraperConfigId);
  if (active) {
    return {
      id: active.id,
      status: active.status,
      reused: true as const,
      mode: active.mode,
    };
  }

  const capabilities = getConnectorCapabilities(
    config.scraperType,
    config.customSelectors,
  );
  if (!capabilities.configured || !capabilities.authenticated) {
    throw new Error("Conector não está configurado para execução autenticada.");
  }

  const requested = input.mode ?? "full";
  let mode: CaptureMode = requested;

  // Agendamento/bulk pode pedir "full" de forma genérica. Conectores search-only
  // degradam explicitamente para refresh de ofertas já conhecidas.
  if (requested === "full" && !capabilities.fullCatalog) {
    if (!capabilities.search) {
      throw new Error(
        "O conector não suporta catálogo completo nem atualização seletiva.",
      );
    }
    mode = input.query?.trim() ? "search" : "refresh";
  }

  if (mode === "search") {
    if (!capabilities.search || !input.query?.trim()) {
      throw new Error("Busca exige conector com busca e termo, SKU ou EAN.");
    }
  }

  if (
    mode === "refresh" &&
    !capabilities.search &&
    !capabilities.fullCatalog
  ) {
    throw new Error("O conector não possui estratégia de atualização incremental.");
  }

  const activeKey = `scraper:${config.id}`;
  const priority = Math.max(0, Math.min(Math.trunc(input.priority ?? 50), 100));

  try {
    const [inserted] = await db.insert(captureJobs).values({
      scraperConfigId: config.id,
      supplierId: config.supplierId,
      activeKey,
      mode,
      trigger: input.trigger ?? "manual",
      query: input.query?.trim() || null,
      priority,
      createdByUserId: input.createdByUserId ?? null,
      meta: {
        ...(input.meta ?? {}),
        capabilities,
      },
      progressStage: "queued",
      progressMessage: "Captura aguardando worker.",
    });

    const id = Number((inserted as { insertId?: number | string }).insertId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error("Banco não retornou o ID do capture job criado.");
    }

    await addEvent(
      id,
      "queued",
      `Job criado (${mode}/${input.trigger ?? "manual"}).`,
    );

    return {
      id,
      status: "queued" as const,
      reused: false as const,
      mode,
    };
  } catch (error) {
    if (!isDuplicateActiveJob(error)) throw error;

    const winner = await getActiveCaptureJob(input.scraperConfigId);
    if (!winner) throw error;
    return {
      id: winner.id,
      status: winner.status,
      reused: true as const,
      mode: winner.mode,
    };
  }
}

export async function getCaptureJobStatus(scraperConfigId: number) {
  const db = await getDb();
  if (!db) {
    return {
      status: "idle" as const,
      log: [] as string[],
      startedAt: null as Date | null,
    };
  }

  const [job] = await db
    .select()
    .from(captureJobs)
    .where(eq(captureJobs.scraperConfigId, scraperConfigId))
    .orderBy(desc(captureJobs.createdAt))
    .limit(1);

  if (!job) {
    return {
      status: "idle" as const,
      log: [] as string[],
      startedAt: null as Date | null,
    };
  }

  const rows = await db
    .select()
    .from(captureJobEvents)
    .where(eq(captureJobEvents.captureJobId, job.id))
    .orderBy(desc(captureJobEvents.createdAt))
    .limit(80);

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

export async function listCaptureJobHistory(
  scraperConfigId: number,
  limit = 20,
) {
  const db = await getDb();
  if (!db) return [];

  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const rows = await db
    .select()
    .from(captureJobs)
    .where(eq(captureJobs.scraperConfigId, scraperConfigId))
    .orderBy(desc(captureJobs.createdAt))
    .limit(boundedLimit);

  return rows.map((job) => ({
    id: job.id,
    scraperConfigId: job.scraperConfigId,
    status:
      job.status === "partial"
        ? "success"
        : job.status === "quarantine"
          ? "failed"
          : job.status,
    startedAt: job.startedAt ?? job.createdAt,
    completedAt: job.completedAt,
    durationMs:
      job.startedAt && job.completedAt
        ? job.completedAt.getTime() - job.startedAt.getTime()
        : null,
    productsScraped: job.capturedItems,
    productsMatched: job.matchedItems,
    productsUpdated: job.changedItems,
    productsCreated: job.createdItems,
    errorMessage: job.errorMessage,
    qualityScore: job.qualityScore,
    captureStatus: job.status,
  }));
}

export async function getConnectorHealthList() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(captureConnectorHealth)
    .orderBy(desc(captureConnectorHealth.updatedAt));
}

export async function recoverStaleCaptureJobs(
  maxAgeMinutes = 15,
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const boundedMinutes = Math.max(2, Math.min(Math.trunc(maxAgeMinutes), 240));
  const cutoff = new Date(Date.now() - boundedMinutes * 60_000);

  const staleJobs = await db
    .select()
    .from(captureJobs)
    .where(
      and(
        eq(captureJobs.status, "running"),
        or(
          lt(captureJobs.heartbeatAt, cutoff),
          and(
            isNull(captureJobs.heartbeatAt),
            or(
              lt(captureJobs.startedAt, cutoff),
              isNull(captureJobs.startedAt),
            ),
          ),
        ),
      ),
    );

  let recovered = 0;
  for (const job of staleJobs) {
    const retry = job.attempts < job.maxAttempts;
    const now = new Date();

    await db
      .update(captureJobs)
      .set({
        status: retry ? "queued" : "failed",
        activeKey: retry ? `scraper:${job.scraperConfigId}` : null,
        workerId: null,
        heartbeatAt: null,
        startedAt: retry ? null : job.startedAt,
        completedAt: retry ? null : now,
        runAfter: retry ? now : job.runAfter,
        progressStage: retry ? "recovered" : "failed",
        progressMessage: retry
          ? "Job recuperado após interrupção do processo."
          : "Job excedeu tentativas após interrupção do processo.",
        errorMessage: retry ? null : "Worker interrompido sem heartbeat.",
      })
      .where(
        and(
          eq(captureJobs.id, job.id),
          eq(captureJobs.status, "running"),
        ),
      );

    recovered += 1;
  }

  return recovered;
}

/** Compatibilidade da fachada antiga: fila de revisão V2. */
export async function listCaptureReviewQueue(input: {
  scraperConfigId?: number;
  supplierId?: number;
  limit?: number;
}) {
  const { listSafeCaptureReviewQueue } = await import("./captureSafeProcessor");
  return listSafeCaptureReviewQueue(input);
}

/** Compatibilidade da fachada antiga: decisão sempre transacional. */
export async function decideCaptureObservation(input: {
  observationId: number;
  decision: "approve" | "reject";
  expectedProductId?: number | null;
  userId?: number | null;
  notes?: string | null;
}) {
  const { decideCaptureObservationTransactional } = await import(
    "./captureReviewService"
  );
  return decideCaptureObservationTransactional(input);
}
