import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { scraperConfigs } from "../../drizzle/schema";
import {
  captureConnectorHealth,
  captureJobEvents,
  captureJobs,
} from "../../drizzle/captureCoreSchema";
import { getConnectorCapabilities } from "./captureConnectorCapabilities";

const REVIEW_PRICE_CHANGE = Number(process.env.CAPTURE_REVIEW_PRICE_CHANGE || 0.60);
const BLOCK_PRICE_CHANGE = Number(process.env.CAPTURE_BLOCK_PRICE_CHANGE || 3.00);
const FULL_MIN_COVERAGE = Number(process.env.CAPTURE_FULL_MIN_COVERAGE || 0.50);
const FULL_WARN_COVERAGE = Number(process.env.CAPTURE_FULL_WARN_COVERAGE || 0.75);

export type CaptureMode = "search" | "refresh" | "full";
export type CaptureTrigger = "manual" | "scheduled" | "bulk" | "proposal" | "api";
export type NormalizedAvailability = "in_stock" | "out_of_stock" | "limited" | "backorder" | "unknown";

export function normalizeCaptureAvailability(
  value?: string | null,
  stock?: number | null,
): NormalizedAvailability {
  const text = String(value || "").trim().toLowerCase();
  if (stock === 0 || /indispon|out.?of.?stock|esgot/.test(text)) return "out_of_stock";
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
  const tokens = [...text.matchAll(
    /\b(\d+(?:[.,]\d+)?)\s*(mg|mcg|g|kg|ml|l|un|und|unidades?|comprimidos?|capsulas?|ampolas?|frascos?|doses?)\b/gi,
  )].map((match) => `${match[1].replace(",", ".")}${match[2].toLowerCase()}`);
  return Array.from(new Set(tokens)).sort().join("|");
}

export function capturePresentationCompatible(a?: string | null, b?: string | null): boolean {
  const left = packSignature(a);
  const right = packSignature(b);
  return !left || !right || left === right;
}

export function evaluateCapturePriceChange(newPrice: number, previous?: string | number | null) {
  const oldPrice = Number(previous || 0);
  if (!Number.isFinite(newPrice) || newPrice <= 0) {
    return { level: "block" as const, change: null as number | null };
  }
  if (!Number.isFinite(oldPrice) || oldPrice <= 0) {
    return { level: "ok" as const, change: null as number | null };
  }
  const change = Math.abs(newPrice - oldPrice) / oldPrice;
  if (change >= BLOCK_PRICE_CHANGE) return { level: "block" as const, change };
  if (change >= REVIEW_PRICE_CHANGE) return { level: "review" as const, change };
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
      return { score: 0, quarantine: true, reasons: ["Nenhum produto foi capturado no catálogo completo."] };
    }
    return {
      score: 70,
      quarantine: false,
      reasons: ["A busca/atualização seletiva não retornou produtos; o conector ficou em atenção sem alterar o catálogo."],
    };
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

  score -= Math.min((input.warnings ?? 0) * 2, 20);
  return { score: Math.max(0, score), quarantine, reasons };
}

function isDuplicateActiveJob(error: unknown): boolean {
  const code = String((error as { code?: unknown })?.code ?? "").toLowerCase();
  const message = String((error as { message?: unknown })?.message ?? error ?? "").toLowerCase();
  return code === "er_dup_entry" ||
    message.includes("uq_capture_jobs_active_key") ||
    (message.includes("duplicate") && message.includes("activekey"));
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

export async function getActiveCaptureJob(scraperConfigId: number) {
  const db = await getDb();
  if (!db) return null;
  const [job] = await db.select().from(captureJobs)
    .where(and(
      eq(captureJobs.scraperConfigId, scraperConfigId),
      inArray(captureJobs.status, ["queued", "running"]),
    ))
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
  if (!db) throw new Error("Banco indisponível");

  const [config] = await db.select().from(scraperConfigs)
    .where(eq(scraperConfigs.id, input.scraperConfigId))
    .limit(1);
  if (!config) throw new Error("Configuração de captura não encontrada.");
  if (config.enabled !== "yes") throw new Error("Esta configuração de captura está desativada.");
  if (!config.tosAprovado) throw new Error("Captura bloqueada: termos de uso ainda não aprovados.");

  const active = await getActiveCaptureJob(input.scraperConfigId);
  if (active) {
    return { id: active.id, status: active.status, reused: true as const, mode: active.mode };
  }

  const capabilities = getConnectorCapabilities(config.scraperType, config.customSelectors as any);
  const requested = input.mode ?? "full";
  let mode: CaptureMode = requested;
  if (requested === "full" && !capabilities.fullCatalog) {
    if (!capabilities.search) {
      throw new Error("O conector não suporta catálogo completo nem atualização seletiva.");
    }
    mode = input.query?.trim() ? "search" : "refresh";
  }
  if (mode === "search" && (!capabilities.search || !input.query?.trim())) {
    throw new Error("Busca exige um conector com busca e um termo, SKU ou EAN.");
  }
  if (mode === "refresh" && !capabilities.search && !capabilities.fullCatalog) {
    throw new Error("O conector não possui estratégia de atualização incremental.");
  }

  const activeKey = `scraper:${config.id}`;
  try {
    const [inserted] = await db.insert(captureJobs).values({
      scraperConfigId: config.id,
      supplierId: config.supplierId,
      activeKey,
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
    await addEvent(id, "queued", `Job criado (${mode}/${input.trigger ?? "manual"}).`);
    return { id, status: "queued" as const, reused: false as const, mode };
  } catch (error) {
    if (!isDuplicateActiveJob(error)) throw error;
    const winner = await getActiveCaptureJob(input.scraperConfigId);
    if (!winner) throw error;
    return { id: winner.id, status: winner.status, reused: true as const, mode: winner.mode };
  }
}

export async function getCaptureJobStatus(scraperConfigId: number) {
  const db = await getDb();
  if (!db) return { status: "idle" as const, log: [] as string[], startedAt: null as Date | null };

  const [job] = await db.select().from(captureJobs)
    .where(eq(captureJobs.scraperConfigId, scraperConfigId))
    .orderBy(desc(captureJobs.createdAt))
    .limit(1);
  if (!job) return { status: "idle" as const, log: [] as string[], startedAt: null as Date | null };

  const rows = await db.select().from(captureJobEvents)
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

export async function listCaptureJobHistory(scraperConfigId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(captureJobs)
    .where(eq(captureJobs.scraperConfigId, scraperConfigId))
    .orderBy(desc(captureJobs.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));

  return rows.map((job) => ({
    id: job.id,
    scraperConfigId: job.scraperConfigId,
    status: job.status === "partial" ? "success" : job.status === "quarantine" ? "failed" : job.status,
    startedAt: job.startedAt ?? job.createdAt,
    completedAt: job.completedAt,
    durationMs: job.startedAt && job.completedAt
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
  return db.select().from(captureConnectorHealth)
    .orderBy(desc(captureConnectorHealth.updatedAt));
}

export async function recoverStaleCaptureJobs(maxAgeMinutes = 15) {
  const db = await getDb();
  if (!db) return 0;
  const running = await db.select().from(captureJobs).where(eq(captureJobs.status, "running"));
  const cutoff = Date.now() - Math.max(2, maxAgeMinutes) * 60_000;
  let recovered = 0;

  for (const job of running) {
    const heartbeat = job.heartbeatAt?.getTime() ?? job.startedAt?.getTime() ?? job.updatedAt.getTime();
    if (heartbeat >= cutoff) continue;

    const retry = job.attempts < job.maxAttempts;
    await db.update(captureJobs).set({
      status: retry ? "queued" : "failed",
      activeKey: retry ? `scraper:${job.scraperConfigId}` : null,
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

/** Compatibilidade da fachada antiga: a política efetiva é sempre a V2 segura. */
export async function listCaptureReviewQueue(input: {
  scraperConfigId?: number;
  supplierId?: number;
  limit?: number;
}) {
  const { listSafeCaptureReviewQueue } = await import("./captureSafeProcessor");
  return listSafeCaptureReviewQueue(input);
}

/** Compatibilidade da fachada antiga: aprovação/criação passa sempre pelo V2 seguro. */
export async function decideCaptureObservation(input: {
  observationId: number;
  decision: "approve" | "reject";
  expectedProductId?: number | null;
  userId?: number | null;
  notes?: string | null;
}) {
  const { decideSafeCaptureObservation } = await import("./captureSafeProcessor");
  return decideSafeCaptureObservation(input);
}
