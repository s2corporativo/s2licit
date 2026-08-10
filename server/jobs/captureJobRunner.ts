import { and, asc, desc, eq, lte } from "drizzle-orm";
import { hostname } from "node:os";
import { getDb } from "../db";
import { captureJobEvents, captureJobs } from "../../drizzle/captureCoreSchema";
import { recoverStaleCaptureJobs } from "../services/captureCoreService";
import { processCaptureJob } from "../services/captureJobProcessor";
import { logger } from "../_core/logger";

interface NumericEnvOptions {
  min: number;
  max: number;
}

function readBoundedIntegerEnv(
  name: string,
  fallback: number,
  options: NumericEnvOptions,
): number {
  const raw = process.env[name];
  if (!raw?.trim()) return fallback;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    logger.warn(`[CaptureRunner] ${name} inválido ("${raw}"); usando ${fallback}.`);
    return fallback;
  }

  return Math.max(options.min, Math.min(parsed, options.max));
}

const POLL_MS = readBoundedIntegerEnv("CAPTURE_JOB_POLL_MS", 5_000, {
  min: 2_000,
  max: 60_000,
});
const MAX_CONCURRENCY = readBoundedIntegerEnv("CAPTURE_WORKERS", 2, {
  min: 1,
  max: 4,
});
const HEARTBEAT_MS = readBoundedIntegerEnv("CAPTURE_HEARTBEAT_MS", 30_000, {
  min: 10_000,
  max: 120_000,
});
const RECOVERY_MS = readBoundedIntegerEnv("CAPTURE_RECOVERY_MS", 300_000, {
  min: 60_000,
  max: 3_600_000,
});
const STALE_MINUTES = readBoundedIntegerEnv("CAPTURE_STALE_MINUTES", 15, {
  min: 2,
  max: 240,
});
const CLAIM_CONTENTION_RETRIES = readBoundedIntegerEnv(
  "CAPTURE_CLAIM_CONTENTION_RETRIES",
  4,
  { min: 1, max: 20 },
);
const WORKER_ID = `${hostname()}:${process.pid}`;

let started = false;
let polling = false;
let recovering = false;
let pollTimer: NodeJS.Timeout | null = null;
let recoveryTimer: NodeJS.Timeout | null = null;

const activeJobs = new Map<number, Promise<void>>();

function affectedRows(result: unknown): number {
  if (!result || typeof result !== "object") return 0;

  const direct = result as { affectedRows?: unknown };
  if (typeof direct.affectedRows === "number") return direct.affectedRows;

  if (Array.isArray(result)) {
    for (const entry of result) {
      const rows = affectedRows(entry);
      if (rows > 0) return rows;
    }
  }

  return 0;
}

async function claimNextJob(): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  for (let attempt = 0; attempt < CLAIM_CONTENTION_RETRIES; attempt += 1) {
    const now = new Date();
    const [candidate] = await db
      .select({
        id: captureJobs.id,
        attempts: captureJobs.attempts,
      })
      .from(captureJobs)
      .where(
        and(
          eq(captureJobs.status, "queued"),
          lte(captureJobs.runAfter, now),
        ),
      )
      .orderBy(desc(captureJobs.priority), asc(captureJobs.createdAt))
      .limit(1);

    if (!candidate) return null;

    const claimedAt = new Date();
    const result = await db
      .update(captureJobs)
      .set({
        status: "running",
        workerId: WORKER_ID,
        startedAt: claimedAt,
        heartbeatAt: claimedAt,
        completedAt: null,
        attempts: candidate.attempts + 1,
        progressStage: "starting",
        progressMessage: `Worker ${WORKER_ID} assumiu o job.`,
        errorMessage: null,
      })
      .where(
        and(
          eq(captureJobs.id, candidate.id),
          eq(captureJobs.status, "queued"),
          lte(captureJobs.runAfter, claimedAt),
        ),
      );

    if (affectedRows(result) > 0) return candidate.id;
  }

  return null;
}

async function heartbeat(jobId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    await db
      .update(captureJobs)
      .set({ heartbeatAt: new Date() })
      .where(
        and(
          eq(captureJobs.id, jobId),
          eq(captureJobs.status, "running"),
          eq(captureJobs.workerId, WORKER_ID),
        ),
      );
  } catch (error) {
    logger.warn(
      `[CaptureRunner] Heartbeat falhou para job #${jobId}:`,
      (error as Error).message,
    );
  }
}

async function markUnexpectedFailure(jobId: number, error: unknown): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const message = error instanceof Error ? error.message : String(error);
  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      const result = await tx
        .update(captureJobs)
        .set({
          status: "failed",
          activeKey: null,
          workerId: null,
          heartbeatAt: null,
          completedAt: now,
          progressStage: "failed",
          progressMessage: "Falha inesperada no runner de captura.",
          errorMessage: message.slice(0, 2_000),
        })
        .where(
          and(
            eq(captureJobs.id, jobId),
            eq(captureJobs.status, "running"),
            eq(captureJobs.workerId, WORKER_ID),
          ),
        );

      if (affectedRows(result) === 0) return;

      await tx.insert(captureJobEvents).values({
        captureJobId: jobId,
        level: "error",
        stage: "runner_failure",
        message: `Falha inesperada do runner: ${message}`.slice(0, 2_000),
        data: {
          workerId: WORKER_ID,
          processId: process.pid,
        },
      });
    });
  } catch (persistError) {
    logger.error(
      `[CaptureRunner] Não foi possível persistir falha terminal do job #${jobId}:`,
      persistError,
    );
  }
}

async function executeClaimedJob(jobId: number): Promise<void> {
  const heartbeatTimer = setInterval(() => {
    void heartbeat(jobId);
  }, HEARTBEAT_MS);
  heartbeatTimer.unref();

  try {
    await heartbeat(jobId);
    await processCaptureJob(jobId);
  } catch (error) {
    logger.error(`[CaptureRunner] Falha não tratada no job #${jobId}:`, error);
    await markUnexpectedFailure(jobId, error);
  } finally {
    clearInterval(heartbeatTimer);
  }
}

function scheduleClaimedJob(jobId: number): void {
  const execution = executeClaimedJob(jobId).finally(() => {
    activeJobs.delete(jobId);
    if (started) void poll();
  });

  activeJobs.set(jobId, execution);
}

async function poll(): Promise<void> {
  if (!started || polling) return;
  polling = true;

  try {
    while (started && activeJobs.size < MAX_CONCURRENCY) {
      const jobId = await claimNextJob();
      if (!jobId) break;
      scheduleClaimedJob(jobId);
    }
  } catch (error) {
    logger.error("[CaptureRunner] Falha ao buscar/assumir jobs:", error);
  } finally {
    polling = false;
  }
}

async function recover(): Promise<void> {
  if (!started || recovering) return;
  recovering = true;

  try {
    const count = await recoverStaleCaptureJobs(STALE_MINUTES);
    if (count > 0) {
      logger.warn(`[CaptureRunner] ${count} job(s) interrompido(s) recuperado(s).`);
      await poll();
    }
  } catch (error) {
    logger.error("[CaptureRunner] Falha ao recuperar jobs:", error);
  } finally {
    recovering = false;
  }
}

export function startCaptureJobRunner(): void {
  if (started) return;
  started = true;

  void recover().then(() => poll());

  pollTimer = setInterval(() => {
    void poll();
  }, POLL_MS);
  pollTimer.unref();

  recoveryTimer = setInterval(() => {
    void recover();
  }, RECOVERY_MS);
  recoveryTimer.unref();

  logger.info(
    `[CaptureRunner] ativo: worker=${WORKER_ID}, concorrência=${MAX_CONCURRENCY}, ` +
      `poll=${POLL_MS}ms, heartbeat=${HEARTBEAT_MS}ms, stale=${STALE_MINUTES}min.`,
  );
}

export async function stopCaptureJobRunner(options?: {
  drain?: boolean;
  timeoutMs?: number;
}): Promise<void> {
  if (!started && !pollTimer && !recoveryTimer) return;

  started = false;

  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (recoveryTimer) {
    clearInterval(recoveryTimer);
    recoveryTimer = null;
  }

  if (!options?.drain || activeJobs.size === 0) return;

  const timeoutMs = Math.max(1_000, Math.min(options.timeoutMs ?? 30_000, 300_000));
  let timeout: NodeJS.Timeout | null = null;

  try {
    await Promise.race([
      Promise.allSettled([...activeJobs.values()]),
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, timeoutMs);
        timeout.unref();
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function captureRunnerStatus() {
  return {
    workerId: WORKER_ID,
    started,
    activeJobs: [...activeJobs.keys()],
    concurrency: MAX_CONCURRENCY,
    pollMs: POLL_MS,
    heartbeatMs: HEARTBEAT_MS,
    recoveryMs: RECOVERY_MS,
    staleMinutes: STALE_MINUTES,
    contentionRetries: CLAIM_CONTENTION_RETRIES,
  };
}
