import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { captureJobs } from "../../drizzle/captureCoreSchema";
import {
  enqueueCaptureJob,
  type CaptureMode,
  type CaptureTrigger,
} from "./captureCoreService";

export interface ReliableEnqueueInput {
  scraperConfigId: number;
  mode?: CaptureMode;
  trigger?: CaptureTrigger;
  query?: string | null;
  priority?: number;
  createdByUserId?: number | null;
  meta?: Record<string, unknown>;
}

function isActiveJobConstraint(error: unknown): boolean {
  const message = String((error as any)?.message ?? error ?? "").toLowerCase();
  const code = String((error as any)?.code ?? "").toLowerCase();
  return code === "er_dup_entry" ||
    message.includes("uq_capture_jobs_active_key") ||
    (message.includes("duplicate") && message.includes("activekey"));
}

async function findActive(scraperConfigId: number) {
  const db = await getDb();
  if (!db) return null;
  const [job] = await db.select({
    id: captureJobs.id,
    status: captureJobs.status,
    mode: captureJobs.mode,
  }).from(captureJobs)
    .where(and(
      eq(captureJobs.scraperConfigId, scraperConfigId),
      inArray(captureJobs.status, ["queued", "running"]),
    ))
    .orderBy(desc(captureJobs.createdAt))
    .limit(1);
  return job ?? null;
}

/**
 * Enqueue idempotente entre múltiplas instâncias.
 *
 * A UNIQUE activeKey no MySQL é a trava final. Se duas instâncias passam pela
 * leitura prévia ao mesmo tempo, uma insere e a outra recebe duplicate-key;
 * esta função converte a colisão no mesmo contrato de "job reutilizado".
 */
export async function enqueueCaptureJobReliable(input: ReliableEnqueueInput) {
  try {
    return await enqueueCaptureJob(input);
  } catch (error) {
    if (!isActiveJobConstraint(error)) throw error;
    const active = await findActive(input.scraperConfigId);
    if (!active) throw error;
    return {
      id: active.id,
      status: active.status,
      reused: true as const,
      mode: active.mode,
    };
  }
}
