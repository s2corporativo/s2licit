import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { apiLogs } from "../../../drizzle/schema";
import { getDb } from "../../db";
import { logger } from "../../_core/logger";
import { classifyHttpFailure, classifyThrownError, IntegrationError } from "./integrationError";
import type { ExternalHttpRequest, ExternalHttpResponse } from "./types";

const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_DEADLINE_MS = 60_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_MAX_BODY_BYTES = 5 * 1024 * 1024;
const TELEMETRY_QUEUE_MAX = 1_000;
const TELEMETRY_BATCH_SIZE = 50;
const TELEMETRY_FLUSH_DELAY_MS = 250;
const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_WINDOW_MS = 60_000;
const CIRCUIT_OPEN_MS = 30_000;
const CIRCUIT_IDLE_TTL_MS = 15 * 60_000;
const CIRCUIT_MAX_ENTRIES = 256;
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
const SENSITIVE_HEADER = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key|x-auth-token)$/i;

interface CircuitState {
  failures: number[];
  openUntil: number;
  lastTouched: number;
}

interface TelemetryEvent {
  source: string;
  operation: string;
  url: string;
  statusCode: number;
  contentType: string;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
  sample?: string;
}

const circuits = new Map<string, CircuitState>();
const telemetryQueue: TelemetryEvent[] = [];
let telemetryTimer: ReturnType<typeof setTimeout> | null = null;
let telemetryFlushPromise: Promise<void> | null = null;
let droppedTelemetryEvents = 0;

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function bodyFingerprint(text: string): string {
  return `sha256=${sha256(text)} bytes=${Buffer.byteLength(text, "utf8")}`;
}

function redactUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    if (url.username) url.username = "[REDACTED]";
    if (url.password) url.password = "[REDACTED]";
    for (const key of Array.from(url.searchParams.keys())) {
      if (/token|key|secret|password|senha|authorization|api[_-]?key/i.test(key)) {
        url.searchParams.set(key, "[REDACTED]");
      }
    }
    return url.toString();
  } catch {
    return rawUrl
      .replace(/:\/\/[^/@\s]+@/g, "://[REDACTED]@")
      .replace(/([?&](?:token|key|secret|password|senha|authorization|api[_-]?key)=)[^&]+/gi, "$1[REDACTED]");
  }
}

function redactText(text: string): string {
  return text
    .replace(/(authorization\s*[:=]\s*(?:bearer\s+)?)[^\s,"'}]+/gi, "$1[REDACTED]")
    .replace(/((?:api[_-]?key|token|password|senha|secret)\s*["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, "$1[REDACTED]")
    .slice(0, 2_000);
}

function telemetryValues(event: TelemetryEvent) {
  return {
    source: event.source,
    endpoint: event.operation.slice(0, 512),
    requestUrl: redactUrl(event.url),
    statusCode: event.statusCode,
    contentType: event.contentType.slice(0, 128),
    errorMessage: event.errorMessage ? redactText(event.errorMessage).slice(0, 2_000) : undefined,
    rawSample: redactText(event.sample ?? ""),
    durationMs: event.durationMs,
    success: event.success,
  };
}

async function flushTelemetryBatch(): Promise<void> {
  if (telemetryFlushPromise) return telemetryFlushPromise;
  telemetryFlushPromise = (async () => {
    while (telemetryQueue.length > 0) {
      const batch = telemetryQueue.splice(0, TELEMETRY_BATCH_SIZE);
      try {
        const db = await getDb().catch(() => null);
        if (!db) continue;
        await db.insert(apiLogs).values(batch.map(telemetryValues));
      } catch (error) {
        logger.warn("[IntegrationTelemetry] Falha ao persistir lote de telemetria; lote descartado.", {
          count: batch.length,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  })();
  try {
    await telemetryFlushPromise;
  } finally {
    telemetryFlushPromise = null;
  }
}

function scheduleTelemetryFlush(): void {
  if (telemetryTimer) return;
  telemetryTimer = setTimeout(() => {
    telemetryTimer = null;
    void flushTelemetryBatch();
  }, TELEMETRY_FLUSH_DELAY_MS);
  telemetryTimer.unref?.();
}

function enqueueTelemetry(event: TelemetryEvent): void {
  if (telemetryQueue.length >= TELEMETRY_QUEUE_MAX) {
    droppedTelemetryEvents += 1;
    if (droppedTelemetryEvents === 1 || droppedTelemetryEvents % 100 === 0) {
      logger.warn(`[IntegrationTelemetry] Fila cheia; ${droppedTelemetryEvents} evento(s) descartado(s).`);
    }
    return;
  }
  telemetryQueue.push(event);
  if (telemetryQueue.length >= TELEMETRY_BATCH_SIZE) {
    void flushTelemetryBatch();
  } else {
    scheduleTelemetryFlush();
  }
}

/** Permite flush explícito em shutdown controlado e em testes. */
export async function flushIntegrationTelemetry(): Promise<void> {
  if (telemetryTimer) {
    clearTimeout(telemetryTimer);
    telemetryTimer = null;
  }
  await flushTelemetryBatch();
}

function circuitKey(source: string, url: string): string {
  try {
    return `${source}:${new URL(url).host.toLowerCase()}`;
  } catch {
    return source;
  }
}

function pruneCircuits(now = Date.now()): void {
  for (const [key, state] of circuits) {
    if (state.openUntil <= now && now - state.lastTouched > CIRCUIT_IDLE_TTL_MS) circuits.delete(key);
  }
  while (circuits.size > CIRCUIT_MAX_ENTRIES) {
    let oldestKey: string | null = null;
    let oldestTouched = Infinity;
    for (const [key, state] of circuits) {
      if (state.lastTouched < oldestTouched) {
        oldestTouched = state.lastTouched;
        oldestKey = key;
      }
    }
    if (!oldestKey) break;
    circuits.delete(oldestKey);
  }
}

function circuitState(key: string): CircuitState {
  const now = Date.now();
  let state = circuits.get(key);
  if (!state) {
    pruneCircuits(now);
    state = { failures: [], openUntil: 0, lastTouched: now };
    circuits.set(key, state);
    pruneCircuits(now);
  }
  state.lastTouched = now;
  return state;
}

function isCircuitOpen(key: string): boolean {
  const state = circuitState(key);
  const now = Date.now();
  if (state.openUntil > now) return true;
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
  state.failures = state.failures.filter((timestamp) => now - timestamp <= CIRCUIT_WINDOW_MS);
  state.failures.push(now);
  if (state.failures.length >= CIRCUIT_FAILURE_THRESHOLD) state.openUntil = now + CIRCUIT_OPEN_MS;
}

function parseIpv4(address: string): number[] | null {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts;
}

function isNonPublicIpv4(address: string): boolean {
  const parts = parseIpv4(address);
  if (!parts) return true;
  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isNonPublicIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith("ff")) return true;
  if (normalized.startsWith("2001:db8:")) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isNonPublicIpv4(mapped[1]) : false;
}

function isNonPublicIp(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isNonPublicIpv4(address);
  if (family === 6) return isNonPublicIpv6(address);
  return true;
}

async function assertAllowedUrl(rawUrl: string, request: ExternalHttpRequest): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new IntegrationError("URL externa inválida.", { type: "CONFIGURATION", code: "INVALID_URL" });
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new IntegrationError(`Protocolo externo não permitido: ${url.protocol}`, {
      type: "CONFIGURATION",
      code: "UNSAFE_PROTOCOL",
    });
  }
  if (url.username || url.password) {
    throw new IntegrationError("Credenciais embutidas na URL não são permitidas.", {
      type: "CONFIGURATION",
      code: "URL_CREDENTIALS_FORBIDDEN",
    });
  }
  if (request.networkPolicy === "allow-private") return url;

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new IntegrationError("Destino local/privado bloqueado pela política de rede.", {
      type: "CONFIGURATION",
      code: "SSRF_BLOCKED_HOST",
    });
  }

  if (isIP(hostname)) {
    if (isNonPublicIp(hostname)) {
      throw new IntegrationError("Endereço IP não público bloqueado pela política de rede.", {
        type: "CONFIGURATION",
        code: "SSRF_BLOCKED_IP",
      });
    }
    return url;
  }

  let addresses: Awaited<ReturnType<typeof lookup>>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch (error) {
    throw new IntegrationError(`Falha ao resolver DNS de ${hostname}.`, {
      type: "NETWORK",
      retryable: true,
      code: "DNS_LOOKUP_FAILED",
      cause: error,
    });
  }
  if (!addresses.length || addresses.some((entry) => isNonPublicIp(entry.address))) {
    throw new IntegrationError("Destino DNS resolveu para endereço não público e foi bloqueado.", {
      type: "CONFIGURATION",
      code: "SSRF_BLOCKED_DNS",
    });
  }
  return url;
}

async function readBodyLimited(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
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
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 60_000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, Math.min(date - Date.now(), 60_000));
  }
  const base = Math.min(1_000 * 2 ** Math.max(0, attempt - 1), 15_000);
  return base + Math.floor(Math.random() * Math.max(250, base * 0.35));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isReplayableBody(body: BodyInit | null | undefined): boolean {
  if (body == null || typeof body === "string") return true;
  if (body instanceof URLSearchParams || body instanceof Blob || body instanceof FormData || body instanceof ArrayBuffer) return true;
  return ArrayBuffer.isView(body);
}

function mayRetry(request: ExternalHttpRequest): boolean {
  const method = (request.method ?? "GET").toUpperCase();
  const idempotent = request.idempotent === true || method === "GET" || method === "HEAD" || method === "OPTIONS";
  return idempotent && isReplayableBody(request.body);
}

function contentLooksJson(contentType: string, text: string): boolean {
  const trimmed = text.trimStart();
  return contentType.includes("application/json") || contentType.includes("text/json") || trimmed.startsWith("{") || trimmed.startsWith("[");
}

function stripSensitiveHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !SENSITIVE_HEADER.test(name)));
}

async function fetchWithValidatedRedirects(input: {
  request: ExternalHttpRequest;
  initialUrl: string;
  headers: Record<string, string>;
  signal: AbortSignal;
  maxRedirects: number;
}): Promise<{ response: Response; finalUrl: string }> {
  const method = (input.request.method ?? "GET").toUpperCase();
  let currentUrl = input.initialUrl;
  let headers = input.headers;

  for (let redirectCount = 0; ; redirectCount += 1) {
    const validated = await assertAllowedUrl(currentUrl, input.request);
    const response = await fetch(validated, {
      method,
      headers,
      body: input.request.body ?? undefined,
      signal: input.signal,
      redirect: "manual",
    });

    if (!REDIRECT_CODES.has(response.status)) return { response, finalUrl: validated.toString() };
    const location = response.headers.get("location");
    if (!location) return { response, finalUrl: validated.toString() };
    if (redirectCount >= input.maxRedirects) {
      await response.body?.cancel().catch(() => undefined);
      throw new IntegrationError(`Limite de ${input.maxRedirects} redirecionamentos excedido.`, {
        type: "UPSTREAM",
        code: "TOO_MANY_REDIRECTS",
      });
    }
    if (method !== "GET" && method !== "HEAD") {
      await response.body?.cancel().catch(() => undefined);
      throw new IntegrationError("Redirecionamento de operação com corpo/efeito colateral foi bloqueado.", {
        type: "CONTRACT",
        code: "UNSAFE_REDIRECT",
      });
    }

    const next = new URL(location, validated);
    if (next.origin !== validated.origin) headers = stripSensitiveHeaders(headers);
    await response.body?.cancel().catch(() => undefined);
    currentUrl = next.toString();
  }
}

function telemetryForResponse(input: {
  request: ExternalHttpRequest;
  url: string;
  statusCode: number;
  contentType: string;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
  body?: string;
}): void {
  enqueueTelemetry({
    source: input.request.source,
    operation: input.request.operation,
    url: input.url,
    statusCode: input.statusCode,
    contentType: input.contentType,
    durationMs: input.durationMs,
    success: input.success,
    errorMessage: input.errorMessage,
    sample: input.body != null ? bodyFingerprint(input.body) : undefined,
  });
}

/**
 * Cliente HTTP único das integrações externas.
 *
 * Complexidade de memória por request: O(min(payload, maxBodyBytes)); circuitos
 * e telemetria possuem limites globais fixos. Telemetria sai do hot path e não
 * altera a latência funcional da chamada externa.
 */
export async function externalHttpRequest<T = unknown>(request: ExternalHttpRequest): Promise<ExternalHttpResponse<T>> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const timeoutMs = Math.max(1_000, request.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const deadlineMs = Math.max(timeoutMs, request.deadlineMs ?? DEFAULT_DEADLINE_MS);
  const deadlineAt = startedAt + deadlineMs;
  const maxRetries = Math.max(0, Math.min(request.maxRetries ?? DEFAULT_MAX_RETRIES, 5));
  const maxAttempts = mayRetry(request) ? maxRetries + 1 : 1;
  const maxRedirects = Math.max(0, Math.min(request.maxRedirects ?? DEFAULT_MAX_REDIRECTS, 10));
  const maxBodyBytes = Math.max(1_024, Math.min(request.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES, 25 * 1024 * 1024));
  const key = circuitKey(request.source, request.url);

  if (isCircuitOpen(key)) {
    const error = new IntegrationError("Circuit breaker aberto após falhas consecutivas da fonte.", {
      type: "UPSTREAM",
      retryable: true,
      code: "CIRCUIT_OPEN",
    });
    telemetryForResponse({
      request,
      url: request.url,
      statusCode: 0,
      contentType: "",
      durationMs: Date.now() - startedAt,
      success: false,
      errorMessage: error.message,
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
      finalUrl: redactUrl(request.url),
      error: error.toPayload(),
    };
  }

  let lastError: IntegrationError | null = null;
  let lastFinalUrl = request.url;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 0) {
      lastError = new IntegrationError(`Orçamento total de ${deadlineMs}ms excedido.`, {
        type: "TIMEOUT",
        retryable: true,
        code: "DEADLINE_EXCEEDED",
      });
      break;
    }

    const attemptStartedAt = Date.now();
    const controller = new AbortController();
    const attemptBudgetMs = Math.max(1, Math.min(timeoutMs, remainingMs));
    const timer = setTimeout(() => controller.abort(), attemptBudgetMs);
    let response: Response | undefined;

    try {
      const baseHeaders: Record<string, string> = {
        Accept: request.accept ?? (request.expected === "text" ? "text/plain,text/html,*/*" : "application/json"),
        "User-Agent": "S2Licit/2.0 (+integration-platform)",
        "X-S2-Request-Id": requestId,
        ...(request.headers ?? {}),
      };
      const fetched = await fetchWithValidatedRedirects({
        request,
        initialUrl: request.url,
        headers: baseHeaders,
        signal: controller.signal,
        maxRedirects,
      });
      response = fetched.response;
      lastFinalUrl = fetched.finalUrl;

      const contentType = response.headers.get("content-type") ?? "";
      const text = await readBodyLimited(response, maxBodyBytes);
      const durationMs = Date.now() - startedAt;

      if (!response.ok) {
        const httpError = classifyHttpFailure(response.status, `HTTP ${response.status} ${response.statusText}`);
        lastError = httpError;
        telemetryForResponse({
          request,
          url: lastFinalUrl,
          statusCode: response.status,
          contentType,
          durationMs: Date.now() - attemptStartedAt,
          success: false,
          errorMessage: httpError.message,
          body: text,
        });

        if (httpError.retryable && attempt < maxAttempts) {
          const delay = retryDelayMs(attempt, response);
          const budgetAfterAttempt = deadlineAt - Date.now();
          if (budgetAfterAttempt <= delay) break;
          await sleep(delay);
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
          finalUrl: redactUrl(lastFinalUrl),
          error: httpError.toPayload(),
        };
      }

      let data: T | null = null;
      const expected = request.expected ?? "json";
      if (expected === "text") {
        data = text as T;
      } else if (expected === "json" || (expected === "any" && contentLooksJson(contentType, text))) {
        if (!contentLooksJson(contentType, text)) {
          throw new IntegrationError(`Contrato inválido: resposta não JSON (Content-Type: ${contentType || "ausente"}).`, {
            type: "CONTRACT",
            code: "NON_JSON_RESPONSE",
          });
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
      telemetryForResponse({
        request,
        url: lastFinalUrl,
        statusCode: response.status,
        contentType,
        durationMs: Date.now() - attemptStartedAt,
        success: true,
        body: text,
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
        finalUrl: redactUrl(lastFinalUrl),
      };
    } catch (error) {
      const classified = classifyThrownError(error);
      lastError = classified;
      telemetryForResponse({
        request,
        url: lastFinalUrl,
        statusCode: response?.status ?? 0,
        contentType: response?.headers.get("content-type") ?? "",
        durationMs: Date.now() - attemptStartedAt,
        success: false,
        errorMessage: classified.message,
      });

      if (classified.retryable && attempt < maxAttempts) {
        const delay = retryDelayMs(attempt, response);
        const budgetAfterAttempt = deadlineAt - Date.now();
        if (budgetAfterAttempt <= delay) break;
        logger.warn(
          `[Integration:${request.source}] ${request.operation} falhou (tentativa ${attempt}/${maxAttempts}); retry controlado.`,
        );
        await sleep(delay);
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
        finalUrl: redactUrl(lastFinalUrl),
        error: classified.toPayload(),
      };
    } finally {
      clearTimeout(timer);
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
    finalUrl: redactUrl(lastFinalUrl),
    error: fallback.toPayload(),
  };
}

export function resetIntegrationCircuits(): void {
  circuits.clear();
}
