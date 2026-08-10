import { createHash, randomUUID } from "node:crypto";
import { apiLogs } from "../../../drizzle/schema";
import { getDb } from "../../db";
import { logger } from "../../_core/logger";
import { classifyHttpFailure, classifyThrownError, IntegrationError } from "./integrationError";
import type { ExternalHttpRequest, ExternalHttpResponse } from "./types";

const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MAX_BODY_BYTES = 5 * 1024 * 1024;
const LOG_SAMPLE_MAX = 2_000;
const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_WINDOW_MS = 60_000;
const CIRCUIT_OPEN_MS = 30_000;

interface CircuitState {
  failures: number[];
  openUntil: number;
}

const circuits = new Map<string, CircuitState>();

function circuitKey(source: string, url: string): string {
  try {
    return `${source}:${new URL(url).host}`;
  } catch {
    return source;
  }
}

function circuitState(key: string): CircuitState {
  const state = circuits.get(key) ?? { failures: [], openUntil: 0 };
  circuits.set(key, state);
  return state;
}

function isCircuitOpen(key: string): boolean {
  const state = circuitState(key);
  if (state.openUntil > Date.now()) return true;
  if (state.openUntil > 0) {
    state.openUntil = 0;
    state.failures = [];
  }
  return false;
}

function recordCircuitSuccess(key: string): void {
  const state = circuitState(key);
  state.failures = [];
  state.openUntil = 0;
}

function recordCircuitFailure(key: string): void {
  const now = Date.now();
  const state = circuitState(key);
  state.failures = state.failures.filter((ts) => now - ts <= CIRCUIT_WINDOW_MS);
  state.failures.push(now);
  if (state.failures.length >= CIRCUIT_FAILURE_THRESHOLD) {
    state.openUntil = now + CIRCUIT_OPEN_MS;
  }
}

function redactUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    for (const key of Array.from(url.searchParams.keys())) {
      if (/token|key|secret|password|senha|authorization|api[_-]?key/i.test(key)) {
        url.searchParams.set(key, "[REDACTED]");
      }
    }
    return url.toString();
  } catch {
    return rawUrl.replace(/([?&](?:token|key|secret|password|senha|api[_-]?key)=)[^&]+/gi, "$1[REDACTED]");
  }
}

function redactText(text: string): string {
  return text
    .replace(/(authorization\s*[:=]\s*(?:bearer\s+)?)[^\s,"'}]+/gi, "$1[REDACTED]")
    .replace(/((?:api[_-]?key|token|password|senha|secret)\s*["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, "$1[REDACTED]")
    .slice(0, LOG_SAMPLE_MAX);
}

async function logCall(input: {
  source: string;
  operation: string;
  url: string;
  statusCode: number;
  contentType: string;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
  sample?: string;
}): Promise<void> {
  try {
    const db = await getDb().catch(() => null);
    if (!db) return;
    const safeUrl = redactUrl(input.url);
    await db.insert(apiLogs).values({
      source: input.source,
      endpoint: input.operation.slice(0, 512),
      requestUrl: safeUrl,
      statusCode: input.statusCode,
      contentType: input.contentType.slice(0, 128),
      errorMessage: input.errorMessage ? redactText(input.errorMessage).slice(0, 2000) : undefined,
      rawSample: redactText(input.sample ?? ""),
      durationMs: input.durationMs,
      success: input.success,
    });
  } catch {
    // Observabilidade nunca deve derrubar a operação principal.
  }
}

async function readBodyLimited(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes) {
    throw new IntegrationError(`Resposta excede o limite de ${maxBytes} bytes.`, {
      type: "CONTRACT",
      code: "BODY_TOO_LARGE",
    });
  }

  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new IntegrationError(`Resposta excede o limite de ${maxBytes} bytes.`, {
          type: "CONTRACT",
          code: "BODY_TOO_LARGE",
        });
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

function retryDelayMs(attempt: number, response?: Response): number {
  const retryAfter = response?.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 60_000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, Math.min(date - Date.now(), 60_000));
  }
  const base = Math.min(1_000 * 2 ** Math.max(0, attempt - 1), 15_000);
  const jitter = Math.floor(Math.random() * Math.max(250, base * 0.35));
  return base + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mayRetry(request: ExternalHttpRequest): boolean {
  const method = (request.method ?? "GET").toUpperCase();
  return request.idempotent === true || method === "GET" || method === "HEAD" || method === "OPTIONS";
}

function contentLooksJson(contentType: string, text: string): boolean {
  return (
    contentType.includes("application/json") ||
    contentType.includes("text/json") ||
    text.trimStart().startsWith("{") ||
    text.trimStart().startsWith("[")
  );
}

function payloadHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Cliente HTTP único das integrações externas.
 *
 * Regras centrais: timeout, retry apenas em operações seguras, Retry-After,
 * jitter, circuit breaker, limite de corpo, redaction e api_logs.
 */
export async function externalHttpRequest<T = unknown>(
  request: ExternalHttpRequest,
): Promise<ExternalHttpResponse<T>> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const timeoutMs = Math.max(1_000, request.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const maxRetries = Math.max(0, request.maxRetries ?? DEFAULT_MAX_RETRIES);
  const maxAttempts = mayRetry(request) ? maxRetries + 1 : 1;
  const maxBodyBytes = Math.max(1_024, request.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES);
  const key = circuitKey(request.source, request.url);

  if (isCircuitOpen(key)) {
    const error = new IntegrationError("Circuit breaker aberto após falhas consecutivas da fonte.", {
      type: "UPSTREAM",
      retryable: true,
      code: "CIRCUIT_OPEN",
    });
    return {
      ok: false,
      source: request.source,
      operation: request.operation,
      requestId,
      statusCode: 0,
      contentType: "",
      data: null,
      text: "",
      fetchedAt: new Date(),
      durationMs: Date.now() - startedAt,
      attempts: 0,
      error: error.toPayload(),
    };
  }

  let lastError: IntegrationError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptStartedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response | undefined;

    try {
      response = await fetch(request.url, {
        method: request.method ?? "GET",
        headers: {
          Accept: request.accept ?? (request.expected === "text" ? "text/plain,text/html,*/*" : "application/json"),
          "User-Agent": "S2Licit/2.0 (+integration-platform)",
          "X-S2-Request-Id": requestId,
          ...(request.headers ?? {}),
        },
        body: request.body ?? undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);

      const contentType = response.headers.get("content-type") ?? "";
      const text = await readBodyLimited(response, maxBodyBytes);
      const durationMs = Date.now() - startedAt;

      if (!response.ok) {
        const httpError = classifyHttpFailure(
          response.status,
          `HTTP ${response.status} ${response.statusText}${text ? ` — ${redactText(text).slice(0, 400)}` : ""}`,
        );
        lastError = httpError;
        await logCall({
          source: request.source,
          operation: request.operation,
          url: request.url,
          statusCode: response.status,
          contentType,
          durationMs: Date.now() - attemptStartedAt,
          success: false,
          errorMessage: httpError.message,
          sample: text,
        });

        if (httpError.retryable && attempt < maxAttempts) {
          await sleep(retryDelayMs(attempt, response));
          continue;
        }

        recordCircuitFailure(key);
        return {
          ok: false,
          source: request.source,
          operation: request.operation,
          requestId,
          statusCode: response.status,
          contentType,
          data: null,
          text,
          fetchedAt: new Date(),
          durationMs,
          attempts: attempt,
          error: httpError.toPayload(),
        };
      }

      let data: T | null = null;
      const expected = request.expected ?? "json";
      if (expected === "text") {
        data = text as T;
      } else if (expected === "json" || (expected === "any" && contentLooksJson(contentType, text))) {
        if (!contentLooksJson(contentType, text)) {
          throw new IntegrationError(
            `Contrato inválido: resposta não JSON (Content-Type: ${contentType || "ausente"}).`,
            { type: "CONTRACT", code: "NON_JSON_RESPONSE" },
          );
        }
        try {
          data = JSON.parse(text) as T;
        } catch (error) {
          throw new IntegrationError("Contrato inválido: JSON malformado.", {
            type: "PARSE",
            code: "INVALID_JSON",
            cause: error,
          });
        }
      } else {
        data = text as T;
      }

      recordCircuitSuccess(key);
      await logCall({
        source: request.source,
        operation: request.operation,
        url: request.url,
        statusCode: response.status,
        contentType,
        durationMs: Date.now() - attemptStartedAt,
        success: true,
        // Não persiste payload integral; somente fingerprint e tamanho.
        sample: `sha256=${payloadHash(text)} bytes=${Buffer.byteLength(text, "utf8")}`,
      });

      return {
        ok: true,
        source: request.source,
        operation: request.operation,
        requestId,
        statusCode: response.status,
        contentType,
        data,
        text,
        fetchedAt: new Date(),
        durationMs,
        attempts: attempt,
      };
    } catch (error) {
      clearTimeout(timer);
      const classified = classifyThrownError(error);
      lastError = classified;
      await logCall({
        source: request.source,
        operation: request.operation,
        url: request.url,
        statusCode: response?.status ?? 0,
        contentType: response?.headers.get("content-type") ?? "",
        durationMs: Date.now() - attemptStartedAt,
        success: false,
        errorMessage: classified.message,
      });

      if (classified.retryable && attempt < maxAttempts) {
        logger.warn(
          `[Integration:${request.source}] ${request.operation} falhou (tentativa ${attempt}/${maxAttempts}); novo retry controlado.`,
        );
        await sleep(retryDelayMs(attempt, response));
        continue;
      }

      recordCircuitFailure(key);
      return {
        ok: false,
        source: request.source,
        operation: request.operation,
        requestId,
        statusCode: response?.status ?? 0,
        contentType: response?.headers.get("content-type") ?? "",
        data: null,
        text: "",
        fetchedAt: new Date(),
        durationMs: Date.now() - startedAt,
        attempts: attempt,
        error: classified.toPayload(),
      };
    }
  }

  recordCircuitFailure(key);
  const fallback = lastError ?? new IntegrationError("Falha externa sem detalhe.", { type: "UNKNOWN" });
  return {
    ok: false,
    source: request.source,
    operation: request.operation,
    requestId,
    statusCode: fallback.upstreamStatus ?? 0,
    contentType: "",
    data: null,
    text: "",
    fetchedAt: new Date(),
    durationMs: Date.now() - startedAt,
    attempts: maxAttempts,
    error: fallback.toPayload(),
  };
}

export function resetIntegrationCircuits(): void {
  circuits.clear();
}
