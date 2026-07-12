/**
 * Base Connector — Fundação para todos os connectors de APIs externas
 *
 * Implementa:
 * - Verificação de content-type antes de parsear JSON (corrige erro <!DOCTYPE)
 * - Registro em api_logs com raw_sample dos primeiros 2000 chars
 * - Retry com backoff exponencial (3 tentativas, timeout 25s)
 * - Normalização de campos para modelo unificado
 */

import { getDb } from "../db";
import { apiLogs, syncRuns } from "../../drizzle/schema";

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

const TIMEOUT_MS = 25_000;
const MAX_RETRIES = 3;
const RAW_SAMPLE_MAX = 2000;

/**
 * Fetch robusto com verificação de content-type, retry e logging
 */
export async function robustFetch(
  url: string,
  source: string,
  options?: RequestInit
): Promise<ConnectorFetchResult> {
  let lastError: Error | null = null;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    const startTime = Date.now();
    attempt++;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            Accept: "application/json",
            "User-Agent": "OrcaBudget/1.0 (+https://orcabudget.manus.space)",
            ...(options?.headers || {}),
          },
        });
      } finally {
        clearTimeout(timeoutId);
      }

      const durationMs = Date.now() - startTime;
      const contentType = response.headers.get("content-type") || "";
      const statusCode = response.status;

      // Ler corpo da resposta
      const bodyText = await response.text();
      const rawSample = bodyText.slice(0, RAW_SAMPLE_MAX);

      // ── CORREÇÃO CRÍTICA: verificar content-type antes de parsear JSON ──
      const isJson =
        contentType.includes("application/json") ||
        contentType.includes("text/json") ||
        (bodyText.trimStart().startsWith("{") || bodyText.trimStart().startsWith("["));

      if (!isJson || !response.ok) {
        const errorMessage = !response.ok
          ? `HTTP ${statusCode}: ${response.statusText}`
          : `Resposta não é JSON. Content-Type: ${contentType}. Início: ${rawSample.slice(0, 200)}`;

        // Registrar erro no api_logs
        await logApiCall({
          source,
          endpoint: url,
          requestUrl: url,
          statusCode,
          contentType,
          errorMessage,
          rawSample,
          durationMs,
          success: false,
        });

        lastError = new Error(errorMessage);

        // Retry apenas em erros de servidor (5xx) ou timeout
        if (statusCode >= 500 || statusCode === 0) {
          const backoff = Math.pow(2, attempt - 1) * 1000;
          await sleep(backoff);
          continue;
        }

        // Erro 4xx: não retry
        return {
          source,
          requestUrl: url,
          fetchedAt: new Date(),
          statusCode,
          contentType,
          rawSample,
          payload: null,
          success: false,
          errorMessage,
          durationMs,
        };
      }

      // Parse JSON seguro
      let payload: any;
      try {
        payload = JSON.parse(bodyText);
      } catch (parseError: any) {
        const errorMessage = `Falha ao parsear JSON: ${parseError.message}. Início: ${rawSample.slice(0, 200)}`;
        await logApiCall({
          source,
          endpoint: url,
          requestUrl: url,
          statusCode,
          contentType,
          errorMessage,
          rawSample,
          durationMs,
          success: false,
        });
        return {
          source,
          requestUrl: url,
          fetchedAt: new Date(),
          statusCode,
          contentType,
          rawSample,
          payload: null,
          success: false,
          errorMessage,
          durationMs,
        };
      }

      // Sucesso — registrar no api_logs
      await logApiCall({
        source,
        endpoint: url,
        requestUrl: url,
        statusCode,
        contentType,
        rawSample,
        durationMs,
        success: true,
      });

      return {
        source,
        requestUrl: url,
        fetchedAt: new Date(),
        statusCode,
        contentType,
        rawSample,
        payload,
        success: true,
        durationMs,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      lastError = err;

      const isTimeout = err?.name === "AbortError" || err?.message?.includes("abort");
      const errorMessage = isTimeout
        ? `Timeout após ${TIMEOUT_MS}ms (tentativa ${attempt}/${MAX_RETRIES})`
        : `Erro de rede: ${err?.message}`;

      await logApiCall({
        source,
        endpoint: url,
        requestUrl: url,
        statusCode: 0,
        contentType: "",
        errorMessage,
        rawSample: "",
        durationMs,
        success: false,
      });

      if (attempt < MAX_RETRIES) {
        const backoff = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
        console.warn(`[${source}] Tentativa ${attempt} falhou. Retry em ${backoff}ms. Erro: ${errorMessage}`);
        await sleep(backoff);
      }
    }
  }

  return {
    source,
    requestUrl: url,
    fetchedAt: new Date(),
    statusCode: 0,
    contentType: "",
    rawSample: "",
    payload: null,
    success: false,
    errorMessage: lastError?.message || "Falha após todas as tentativas",
    durationMs: 0,
  };
}

/**
 * Registrar chamada de API no banco de dados. Exportado para connectors que
 * fazem fetch fora do robustFetch (ex.: scrapers de HTML) manterem a mesma
 * trilha de auditoria em api_logs.
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
    await db.insert(apiLogs).values({
      source: params.source,
      endpoint: params.endpoint.slice(0, 512),
      requestUrl: params.requestUrl,
      statusCode: params.statusCode,
      contentType: params.contentType.slice(0, 128),
      errorMessage: params.errorMessage?.slice(0, 2000),
      rawSample: params.rawSample.slice(0, 2000),
      durationMs: params.durationMs,
      success: params.success,
    });
  } catch (_) {
    // Não propagar erros de logging
  }
}

/**
 * Criar registro de sync_run e retornar ID
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
  } catch (_) {
    return null;
  }
}

/**
 * Finalizar registro de sync_run
 */
export async function finishSyncRun(
  runId: number | null,
  stats: {
    insertedCount: number;
    updatedCount: number;
    skippedCount: number;
    errorCount: number;
    status: "success" | "error" | "partial";
    errorDetails?: string;
  }
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
  } catch (_) {
    // Não propagar erros de logging
  }
}

/**
 * Normalizar data de string para Date
 */
export function parseDate(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * Gerar chave de deduplicação
 */
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
