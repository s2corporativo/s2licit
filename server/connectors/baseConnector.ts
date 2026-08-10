/**
 * Base Connector — camada de compatibilidade dos connectors legados.
 *
 * Toda comunicação HTTP deve passar por `externalHttpRequest`. Este arquivo
 * mantém os contratos antigos enquanto os conectores são migrados, evitando
 * duplicar retry/timeout/logging em cada fonte.
 */

import { getDb } from "../db";
import { apiLogs, syncRuns } from "../../drizzle/schema";
import { externalHttpRequest } from "../integrations/core/externalHttpClient";

export interface ConnectorFetchResult {
  source: string;
  sourceId?: string;
  requestUrl: string;
  fetchedAt: Date;
  statusCode: number;
  contentType: string;
  rawSample: string;
  payload: any;
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
 * circuit breaker e api_logs são responsabilidade do cliente HTTP central.
 */
export async function robustFetch(
  url: string,
  source: string,
  options?: RequestInit,
): Promise<ConnectorFetchResult> {
  const headers = Object.fromEntries(
    Array.from(new Headers(options?.headers).entries()),
  );
  const result = await externalHttpRequest<any>({
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
    rawSample: result.text.slice(0, 2000),
    payload: result.data,
    success: result.ok,
    errorMessage: result.error?.message,
    durationMs: result.durationMs,
    requestId: result.requestId,
    attempts: result.attempts,
  };
}

/**
 * Registro manual para integrações que não usam HTTP JSON (ex.: parser HTML).
 * Novos conectores devem preferir `externalHttpRequest`, que já registra a
 * chamada com redaction automática.
 */
export async function logApiCall(params: {
  source: string;
  endpoint: string;
  requestUrl: string;
  statusCode: number;
  contentType: string;
  errorMessage?: string;
  rawSample: string;
  durationMs: number;
  success: boolean;
}): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const safeUrl = params.requestUrl.replace(
      /([?&](?:token|key|secret|password|senha|api[_-]?key)=)[^&]+/gi,
      "$1[REDACTED]",
    );
    const sanitize = (value: string) =>
      value
        .replace(/(authorization\s*[:=]\s*(?:bearer\s+)?)[^\s,"'}]+/gi, "$1[REDACTED]")
        .replace(/((?:api[_-]?key|token|password|senha|secret)\s*["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, "$1[REDACTED]");
    await db.insert(apiLogs).values({
      source: params.source,
      endpoint: params.endpoint.slice(0, 512),
      requestUrl: safeUrl,
      statusCode: params.statusCode,
      contentType: params.contentType.slice(0, 128),
      errorMessage: params.errorMessage ? sanitize(params.errorMessage).slice(0, 2000) : undefined,
      rawSample: sanitize(params.rawSample).slice(0, 2000),
      durationMs: params.durationMs,
      success: params.success,
    });
  } catch {
    // Logging nunca interrompe o fluxo principal.
  }
}

/**
 * Histórico genérico de execução. A tabela mantém o nome legado `sync_runs`
 * por compatibilidade de banco, mas passa a ser utilizada por qualquer fonte.
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
    return (result as any).insertId ?? null;
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
    const { eq } = await import("drizzle-orm");
    await db
      .update(syncRuns)
      .set({
        endedAt: new Date(),
        insertedCount: stats.insertedCount,
        updatedCount: stats.updatedCount,
        skippedCount: stats.skippedCount,
        errorCount: stats.errorCount,
        status: stats.status,
        errorDetails: stats.errorDetails?.slice(0, 2000),
        lastSuccessfulSyncAt: stats.status !== "error" ? new Date() : undefined,
      })
      .where(eq(syncRuns.id, runId));
  } catch {
    // Auditoria não derruba o processamento.
  }
}

export function parseDate(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

export function generateDedupeKey(orgao: string, objeto: string, dataAbertura: Date | null): string {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 100);
  const dateStr = dataAbertura ? dataAbertura.toISOString().slice(0, 10) : "nodate";
  return `${normalize(orgao)}_${normalize(objeto)}_${dateStr}`;
}
