import { and, asc, desc, eq, lte } from "drizzle-orm";
import { hostname } from "os";
import { getDb } from "../db";
import { captureJobs } from "../../drizzle/captureCoreSchema";
import { processCaptureJob, recoverStaleCaptureJobs } from "../services/captureCoreService";
import { logger } from "../_core/logger";

const POLL_MS = Math.max(2000, Number(process.env.CAPTURE_JOB_POLL_MS || 5000));
const MAX_CONCURRENCY = Math.max(1, Math.min(Number(process.env.CAPTURE_WORKERS || 2), 4));
const WORKER_ID = `${hostname()}:${process.pid}`;

let started = false;
let polling = false;
const active = new Set<number>();

function affectedRows(result: unknown): number {
  const value = result as any;
  return Number(value?.[0]?.affectedRows ?? value?.affectedRows ?? value?.[0]?.[0]?.affectedRows ?? 0);
}

async function claimNextJob(): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  const [candidate] = await db
    .select({ id: captureJobs.id, attempts: captureJobs.attempts })
    .from(captureJobs)
    .where(and(eq(captureJobs.status, "queued"), lte(captureJobs.runAfter, new Date())))
    .orderBy(desc(captureJobs.priority), asc(captureJobs.createdAt))
    .limit(1);
  if (!candidate) return null;

  // Compare-and-set no banco: duas instâncias podem enxergar o mesmo candidato,
  // mas apenas uma consegue mudar queued -> running.
  const result = await db
    .update(captureJobs)
    .set({
      status: "running",
      workerId: WORKER_ID,
      startedAt: new Date(),
      heartbeatAt: new Date(),
      attempts: candidate.attempts + 1,
      progressStage: "starting",
      progressMessage: `Worker ${WORKER_ID} assumiu o job.`,
    })
    .where(and(eq(captureJobs.id, candidate.id), eq(captureJobs.status, "queued")));

  return affectedRows(result) > 0 ? candidate.id : null;
}

async function runClaimed(jobId: number) {
  active.add(jobId);
  try {
    await processCaptureJob(jobId);
  } catch (error) {
    logger.error(`[CaptureRunner] Falha não tratada no job #${jobId}:`, error);
  } finally {
    active.delete(jobId);
  }
}

async function poll() {
  if (polling) return;
  polling = true;
  try {
    while (active.size < MAX_CONCURRENCY) {
      const jobId = await claimNextJob();
      if (!jobId) break;
      void runClaimed(jobId);
    }
  } catch (error) {
    logger.error("[CaptureRunner] Falha ao buscar jobs:", error);
  } finally {
    polling = false;
  }
}

/**
 * Inicia o worker local. A fila e o estado ficam no MySQL; GitHub não participa
 * de execução, status, recuperação ou aprendizado do módulo.
 */
export function startCaptureJobRunner(): void {
  if (started) return;
  started = true;
  void recoverStaleCaptureJobs(Number(process.env.CAPTURE_STALE_MINUTES || 15))
    .then((count) => {
      if (count > 0) logger.warn(`[CaptureRunner] ${count} job(s) interrompido(s) recuperado(s).`);
    })
    .catch((error) => logger.error("[CaptureRunner] Falha ao recuperar jobs:", error));

  void poll();
  setInterval(() => { void poll(); }, POLL_MS).unref();
  logger.info(`[CaptureRunner] ativo: ${MAX_CONCURRENCY} worker(s), polling ${POLL_MS}ms.`);
}

export function captureRunnerStatus() {
  return {
    workerId: WORKER_ID,
    started,
    activeJobs: [...active],
    concurrency: MAX_CONCURRENCY,
    pollMs: POLL_MS,
  };
}
