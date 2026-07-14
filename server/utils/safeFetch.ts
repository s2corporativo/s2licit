/**
 * safeFetch — API wrapper com validação JSON, fallback para HTML e retry controlado.
 * Garante que respostas HTML (403/404/500/<!DOCTYPE) nunca causem "Unexpected token '<'".
 */

export interface SafeFetchOptions {
  /** Timeout em ms (padrão: 30000) */
  timeoutMs?: number;
  /** Número máximo de tentativas (padrão: 1 = sem retry) */
  maxRetries?: number;
  /** Delay base entre tentativas em ms (padrão: 1000, dobra a cada tentativa) */
  retryDelayMs?: number;
  /** Headers adicionais */
  headers?: Record<string, string>;
  /** Contexto para log */
  context?: string;
}

export interface SafeFetchResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
  /** true se a resposta foi HTML em vez de JSON */
  wasHtml: boolean;
  /** Número de tentativas realizadas */
  attempts: number;
}

/**
 * Detecta se o conteúdo é HTML (erro de servidor ou página de login).
 */
function isHtmlResponse(text: string): boolean {
  const trimmed = text.trimStart();
  return (
    trimmed.startsWith("<!DOCTYPE") ||
    trimmed.startsWith("<html") ||
    trimmed.startsWith("<!doctype")
  );
}

/**
 * Wrapper seguro para fetch com validação de JSON, detecção de HTML e retry.
 * Nunca lança exceção — sempre retorna SafeFetchResult.
 */
export async function safeFetch<T = unknown>(
  url: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResult<T>> {
  const {
    timeoutMs = 30_000,
    maxRetries = 1,
    retryDelayMs = 1_000,
    headers = {},
    context = url,
  } = options;

  let attempts = 0;
  let lastError = "";

  while (attempts < maxRetries) {
    attempts++;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(url, {
        headers: { Accept: "application/json", ...headers },
        signal: controller.signal,
      });
      clearTimeout(timer);

      const rawText = await res.text().catch(() => "");

      // Detectar HTML em vez de JSON
      if (isHtmlResponse(rawText)) {
        const msg = `[safeFetch] Resposta HTML recebida (status ${res.status}) de ${context}`;
        console.warn(msg);
        return {
          ok: false,
          status: res.status,
          data: null,
          error: `Servidor retornou HTML (status ${res.status}) — API indisponível ou erro de autenticação`,
          wasHtml: true,
          attempts,
        };
      }

      // Tentar parsear JSON
      let data: T | null = null;
      try {
        data = JSON.parse(rawText) as T;
      } catch (parseErr) {
        const msg = `[safeFetch] JSON inválido de ${context}: ${rawText.slice(0, 100)}`;
        console.warn(msg);
        return {
          ok: false,
          status: res.status,
          data: null,
          error: `JSON inválido retornado pela API: ${rawText.slice(0, 80)}`,
          wasHtml: false,
          attempts,
        };
      }

      if (!res.ok) {
        const errMsg = `[safeFetch] HTTP ${res.status} de ${context}`;
        console.warn(errMsg);
        // Não retry em 4xx (erro do cliente)
        if (res.status >= 400 && res.status < 500) {
          return { ok: false, status: res.status, data, error: `HTTP ${res.status}`, wasHtml: false, attempts };
        }
        lastError = `HTTP ${res.status}`;
        // 5xx: pode tentar novamente
        if (attempts < maxRetries) {
          await delay(retryDelayMs * attempts);
          continue;
        }
        return { ok: false, status: res.status, data, error: lastError, wasHtml: false, attempts };
      }

      return { ok: true, status: res.status, data, error: null, wasHtml: false, attempts };
    } catch (err: any) {
      lastError = err?.name === "AbortError"
        ? `Timeout após ${timeoutMs}ms`
        : (err?.message ?? "Erro de rede desconhecido");

      console.warn(`[safeFetch] Tentativa ${attempts}/${maxRetries} falhou para ${context}: ${lastError}`);

      if (attempts < maxRetries) {
        await delay(retryDelayMs * attempts);
        continue;
      }
    }
  }

  return { ok: false, status: 0, data: null, error: lastError, wasHtml: false, attempts };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
