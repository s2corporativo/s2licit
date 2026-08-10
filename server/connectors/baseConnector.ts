/**
 * Base Connector — contratos de domínio e compatibilidade dos connectors legados.
 *
 * Toda comunicação HTTP deve passar por `externalHttpRequest`. Este arquivo
 * mantém apenas o wrapper temporário necessário para consumidores ainda não
 * migrados e o histórico genérico de sync_runs.
 */
import { eq } from "drizzle-orm";
import { syncRuns } from "../../drizzle/schema";
import { externalHttpRequest } from "../integrations/core/externalHttpClient";
import { getDb } from "../db";

export interface ConnectorFetchResult<T = unknown> {
  source: string;
  sourceId?: string;
  requestUrl: string;
  fetchedAt: Date;
  statusCode: number;
  contentType: string;
  rawSample: string;
  payload: T | null;
  success: boolean;
  errorMessage?: string;
  durationMs: number;
  requestId?: string;
  attempts?: number;
}

export interface NormalizedLicitacao {
  source: string;
  sourceId: string;
  orgao: string;
  unidadeCompradora: string;
  modalidade: string;
  numeroProcesso: string;
  objeto: string;
  descricaoDetalhada: string;
  uf: string;
  municipio: string;
  dataPublicacao: Date | null;
  dataAbertura: Date | null;
  dataEncerramento: Date | null;
  valorEstimado: number;
  status: string;
  links: string[];
  dedupeKey: string;
}

/**
 * Wrapper temporário para consumidores antigos. Retry, timeout, redaction,
 * circuit breaker e telemetria são responsabilidade do cliente HTTP central.
 */
export async function robustFetch<T = unknown>(
  url: string,
  source: string,
  options?: RequestInit,
): Promise<ConnectorFetchResult<T>> {
  const headers = Object.fromEntries(Array.from(new Headers(options?.headers).entries()));
  const result = await externalHttpRequest<T>({
    source,
    operation: "legacy-fetch",
    url,
    method: options?.method,
    headers,
    body: options?.body ?? null,
    expected: "json",
    idempotent: ["GET", "HEAD", "OPTIONS"].includes((options?.method ?? "GET").toUpperCase()),
  });

  return {
    source,
    requestUrl: url,
    fetchedAt: result.fetchedAt,
    statusCode: result.statusCode,
    contentType: result.contentType,
    rawSample: result.text.slice(0, 2_000),
    payload: result.data,
    success: result.ok,
    errorMessage: result.error?.message,
    durationMs: result.durationMs,
    requestId: result.requestId,
    attempts: result.attempts,
  };
}

function insertIdFromResult(result: unknown): number | null {
  if (!result || typeof result !== "object" || !("insertId" in result)) return null;
  const parsed = Number((result as { insertId?: unknown }).insertId);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Histórico genérico de execução. A tabela mantém o nome legado `syncRuns` por
 * compatibilidade de banco, mas registra jobs e integrações de qualquer fonte.
 */
export async function startSyncRun(source: string, windowSync?: string): Promise<number | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const [result] = await db.insert(syncRuns).values({
      source,
      windowSync,
      status: "running",
    });
    return insertIdFromResult(result);
  } catch {
    return null;
  }
}

export async function finishSyncRun(
  runId: number | null,
  stats: {
    insertedCount: number;
    updatedCount: number;
    skippedCount: number;
    errorCount: number;
    status: "success" | "error" | "partial";
    errorDetails?: string;
  },
): Promise<void> {
  if (!runId) return;
  try {
    const db = await getDb();
    if (!db) return;
    await db
      .update(syncRuns)
      .set({
        endedAt: new Date(),
        insertedCount: stats.insertedCount,
        updatedCount: stats.updatedCount,
        skippedCount: stats.skippedCount,
        errorCount: stats.errorCount,
        status: stats.status,
        errorDetails: stats.errorDetails?.slice(0, 2_000),
        lastSuccessfulSyncAt: stats.status === "success" ? new Date() : undefined,
      })
      .where(eq(syncRuns.id, runId));
  } catch {
    // Auditoria não derruba o processamento principal.
  }
}

export function parseDate(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function generateDedupeKey(orgao: string, objeto: string, dataAbertura: Date | null): string {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 100);
  const date = dataAbertura ? dataAbertura.toISOString().slice(0, 10) : "nodate";
  return `${normalize(orgao)}_${normalize(objeto)}_${date}`;
}
