import puppeteer, { type HTTPRequest } from "puppeteer";
import { logger } from "../../_core/logger";
import { assertPublicExternalUrl } from "../../utils/urlGuard";

const DEFAULT_NAVIGATION_TIMEOUT_MS = 45_000;
const DEFAULT_IDLE_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REQUESTS = 300;
const DEFAULT_MAX_HOSTS = 64;
const DEFAULT_MAX_HTML_BYTES = 8 * 1024 * 1024;
const BLOCKED_RESOURCE_TYPES = new Set(["image", "media", "font"]);
const INTERNAL_SCHEMES = ["data:", "blob:", "about:"];

export interface SecureBrowserRenderOptions {
  source: string;
  url: string;
  userAgent: string;
  navigationTimeoutMs?: number;
  idleTimeoutMs?: number;
  maxRequests?: number;
  maxHosts?: number;
  maxHtmlBytes?: number;
  viewport?: { width: number; height: number };
}

function isRootProcess(): boolean {
  return typeof process.getuid === "function" && process.getuid() === 0;
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

/**
 * Renderizador de browser para páginas públicas não confiáveis.
 *
 * Segurança:
 * - recusa execução como root em vez de usar `--no-sandbox`;
 * - valida DNS/IP de cada request HTTP(S), inclusive sub-recursos;
 * - bloqueia media/imagem/fontes e limita requests/hosts/HTML;
 * - não persiste cookies nem reutiliza contexto entre fontes.
 *
 * Memória por render é O(maxHtmlBytes + metadata bounded de requests/hosts).
 */
export async function renderPublicHtml(options: SecureBrowserRenderOptions): Promise<string> {
  if (isRootProcess()) {
    throw new Error(
      "Browser renderizado desabilitado: o processo está executando como root. " +
        "Execute o serviço/browser como usuário não-root; --no-sandbox não é permitido em produção.",
    );
  }

  const initialUrl = await assertPublicExternalUrl(options.url, `URL ${options.source}`);
  const navigationTimeoutMs = Math.max(5_000, Math.min(options.navigationTimeoutMs ?? DEFAULT_NAVIGATION_TIMEOUT_MS, 90_000));
  const idleTimeoutMs = Math.max(500, Math.min(options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS, 20_000));
  const maxRequests = Math.max(20, Math.min(options.maxRequests ?? DEFAULT_MAX_REQUESTS, 1_000));
  const maxHosts = Math.max(4, Math.min(options.maxHosts ?? DEFAULT_MAX_HOSTS, 128));
  const maxHtmlBytes = Math.max(256 * 1024, Math.min(options.maxHtmlBytes ?? DEFAULT_MAX_HTML_BYTES, 16 * 1024 * 1024));
  const viewport = options.viewport ?? { width: 1440, height: 1000 };

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-default-apps",
      "--disable-extensions",
      "--disable-sync",
      "--metrics-recording-only",
      "--no-first-run",
    ],
  });

  const startedAt = Date.now();
  try {
    const page = await browser.newPage();
    await page.setUserAgent(options.userAgent);
    await page.setViewport(viewport);
    await page.setCacheEnabled(false);
    page.setDefaultNavigationTimeout(navigationTimeoutMs);
    page.setDefaultTimeout(navigationTimeoutMs);

    const hostValidation = new Map<string, Promise<URL>>();
    let requestCount = 0;

    const validateRequest = async (request: HTTPRequest): Promise<void> => {
      if (request.isInterceptResolutionHandled()) return;
      requestCount += 1;
      if (requestCount > maxRequests) {
        await request.abort("blockedbyclient").catch(() => undefined);
        return;
      }

      const resourceType = request.resourceType();
      if (BLOCKED_RESOURCE_TYPES.has(resourceType)) {
        await request.abort("blockedbyclient").catch(() => undefined);
        return;
      }

      const rawUrl = request.url();
      if (INTERNAL_SCHEMES.some((scheme) => rawUrl.startsWith(scheme))) {
        await request.continue().catch(() => undefined);
        return;
      }

      let parsed: URL;
      try {
        parsed = new URL(rawUrl);
      } catch {
        await request.abort("blockedbyclient").catch(() => undefined);
        return;
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        await request.abort("blockedbyclient").catch(() => undefined);
        return;
      }

      const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
      let validation = hostValidation.get(host);
      if (!validation) {
        if (hostValidation.size >= maxHosts) {
          await request.abort("blockedbyclient").catch(() => undefined);
          return;
        }
        validation = assertPublicExternalUrl(rawUrl, `Sub-recurso ${options.source}`);
        hostValidation.set(host, validation);
      }

      try {
        await validation;
        await request.continue().catch(() => undefined);
      } catch (error) {
        logger.warn(
          `[SecureBrowser:${options.source}] Request bloqueado para ${host}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        await request.abort("blockedbyclient").catch(() => undefined);
      }
    };

    await page.setRequestInterception(true);
    page.on("request", (request) => {
      void validateRequest(request);
    });

    await page.goto(initialUrl.toString(), {
      waitUntil: "domcontentloaded",
      timeout: navigationTimeoutMs,
    });
    await page.waitForNetworkIdle({ idleTime: 500, timeout: idleTimeoutMs }).catch(() => undefined);

    const html = await page.content();
    const bytes = byteLength(html);
    if (bytes > maxHtmlBytes) {
      throw new Error(`HTML renderizado possui ${bytes} bytes; limite seguro é ${maxHtmlBytes}.`);
    }
    logger.info(
      `[SecureBrowser:${options.source}] render concluído em ${Date.now() - startedAt}ms, ${requestCount} request(s), ${bytes} bytes.`,
    );
    return html;
  } finally {
    await browser.close().catch(() => undefined);
  }
}
