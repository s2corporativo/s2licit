import { assertSafeExternalUrlResolved } from "./urlGuard";

export interface SafeExternalFetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

export interface SafeExternalTextResponse {
  url: string;
  status: number;
  ok: boolean;
  headers: Headers;
  text: string;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;

function boundedInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(Math.trunc(value!), max));
}

function sanitizeRequestHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!headers) return undefined;

  const forbidden = new Set([
    "connection",
    "content-length",
    "host",
    "proxy-authorization",
    "transfer-encoding",
  ]);
  const output: Record<string, string> = {};

  for (const [name, value] of Object.entries(headers)) {
    const normalizedName = name.trim();
    if (!normalizedName || forbidden.has(normalizedName.toLowerCase())) continue;
    output[normalizedName] = String(value).slice(0, 8_192);
  }

  return output;
}

async function readBoundedText(
  response: Response,
  maxBytes: number,
  controller: AbortController,
): Promise<string> {
  const declared = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    controller.abort();
    throw new Error(`Resposta externa excede limite de ${maxBytes} bytes.`);
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const chunks: string[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        controller.abort();
        throw new Error(`Resposta externa excede limite de ${maxBytes} bytes.`);
      }

      chunks.push(decoder.decode(value, { stream: true }));
    }

    chunks.push(decoder.decode());
    return chunks.join("");
  } finally {
    reader.releaseLock();
  }
}

/**
 * Fetch server-side com política SSRF única, redirects manuais e corpo limitado.
 * Cada hop é novamente resolvido por DNS antes do request.
 */
export async function safeExternalFetchText(
  rawUrl: string,
  options: SafeExternalFetchOptions = {},
): Promise<SafeExternalTextResponse> {
  const timeoutMs = boundedInteger(
    options.timeoutMs,
    DEFAULT_TIMEOUT_MS,
    1_000,
    60_000,
  );
  const maxBytes = boundedInteger(
    options.maxBytes,
    DEFAULT_MAX_BYTES,
    1_024,
    30 * 1024 * 1024,
  );
  const maxRedirects = boundedInteger(
    options.maxRedirects,
    DEFAULT_MAX_REDIRECTS,
    0,
    10,
  );
  const headers = sanitizeRequestHeaders(options.headers);

  let currentUrl = rawUrl;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const url = await assertSafeExternalUrlResolved(
      currentUrl,
      "URL externa",
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    timeout.unref?.();

    try {
      const response = await fetch(url, {
        method: "GET",
        headers,
        redirect: "manual",
        signal: controller.signal,
      });

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => undefined);

        if (!location) {
          throw new Error(`Redirect ${response.status} sem cabeçalho Location.`);
        }
        if (redirectCount >= maxRedirects) {
          throw new Error("Limite de redirects externos excedido.");
        }

        currentUrl = new URL(location, url).toString();
        continue;
      }

      const text = await readBoundedText(response, maxBytes, controller);
      return {
        url: url.toString(),
        status: response.status,
        ok: response.ok,
        headers: response.headers,
        text,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Timeout ao buscar URL externa após ${timeoutMs} ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("Falha inesperada ao buscar URL externa.");
}
