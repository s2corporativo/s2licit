import puppeteer, {
  type Browser,
  type HTTPRequest,
  type Page,
} from "puppeteer";
import { storagePut } from "../storage";
import {
  assertSafeExternalUrl,
  assertSafeExternalUrlResolved,
} from "../utils/urlGuard";
import { logger } from "../_core/logger";
import { supplierSessionService } from "./supplierSessionService";
import {
  puppeteerCookiesToRecord,
  recordToPuppeteerCookies,
} from "./sessionCookies";
import {
  buildSearchUrl,
  type ScrapedProduct,
  type SelectorConfig,
} from "./scraperContracts";

const DEFAULT_NAVIGATION_TIMEOUT_MS = 30_000;
const DEFAULT_SELECTOR_TIMEOUT_MS = 10_000;
const DEFAULT_NAVIGATION_WAIT_MS = 2_000;
const DEFAULT_MAX_PAGES = 1_000;
const DNS_CACHE_TTL_MS = 30_000;
const MAX_ENGINE_LOG_LINES = 1_000;

interface DnsCacheEntry {
  expiresAt: number;
  validation: Promise<void>;
}

interface LoginSignals {
  passwordVisible: boolean;
  currentUrl: string;
  pageText: string;
  selectorMatched: boolean;
  urlMatched: boolean;
  textMatched: boolean;
}

interface ChallengeDetection {
  required: boolean;
  kind: "captcha" | "mfa" | "unknown" | null;
  reason: string | null;
}

export class CaptureHumanInterventionRequiredError extends Error {
  readonly code = "CAPTURE_HUMAN_INTERVENTION_REQUIRED";
  readonly kind: ChallengeDetection["kind"];

  constructor(message: string, kind: ChallengeDetection["kind"] = "unknown") {
    super(message);
    this.name = "CaptureHumanInterventionRequiredError";
    this.kind = kind;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!raw?.trim()) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(parsed, max));
}

function navigationWait(config: SelectorConfig): number {
  const value = config.navigationWait;
  if (!Number.isFinite(value)) return DEFAULT_NAVIGATION_WAIT_MS;
  return Math.max(0, Math.min(Math.trunc(value!), 60_000));
}

function normalizeIdentityKey(product: ScrapedProduct): string {
  const ean = product.ean?.replace(/\D/g, "");
  if (ean && /^\d{8,14}$/.test(ean)) return `ean:${ean}`;

  const code = product.code?.trim().toUpperCase();
  if (code) return `sku:${code}`;

  const url = product.productUrl?.trim();
  if (url) return `url:${url}`;

  return `name:${product.name.trim().toLowerCase()}`;
}

function normalizeProduct(product: ScrapedProduct): ScrapedProduct | null {
  const name = String(product.name || "").trim().replace(/\s+/g, " ").slice(0, 512);
  const price = Number(product.price);
  if (!name || !Number.isFinite(price) || price <= 0) return null;

  const eanDigits = String(product.ean || "").replace(/\D/g, "");
  const stock = product.stock == null
    ? undefined
    : Math.max(0, Math.trunc(Number(product.stock)));

  return {
    ...product,
    name,
    price,
    code: product.code?.trim().slice(0, 128) || undefined,
    ean: /^\d{8,14}$/.test(eanDigits) ? eanDigits : undefined,
    unit: product.unit?.trim().slice(0, 64) || undefined,
    imageUrl: product.imageUrl?.trim() || undefined,
    productUrl: product.productUrl?.trim() || undefined,
    availability: product.availability?.trim().slice(0, 128) || undefined,
    priceNormal:
      product.priceNormal != null && Number.isFinite(Number(product.priceNormal))
        ? Number(product.priceNormal)
        : undefined,
    pricePromo:
      product.pricePromo != null && Number.isFinite(Number(product.pricePromo))
        ? Number(product.pricePromo)
        : undefined,
    stock: stock != null && Number.isFinite(stock) ? stock : undefined,
  };
}

function dedupeProducts(products: ScrapedProduct[]): ScrapedProduct[] {
  const output = new Map<string, ScrapedProduct>();
  for (const rawProduct of products) {
    const product = normalizeProduct(rawProduct);
    if (!product) continue;
    const key = normalizeIdentityKey(product);
    if (!output.has(key)) output.set(key, product);
  }
  return [...output.values()];
}

export class BrowserCaptureEngine {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private readonly logs: string[] = [];
  private readonly dnsCache = new Map<string, DnsCacheEntry>();

  get authenticatedPage(): Page | null {
    return this.page;
  }

  get log(): readonly string[] {
    return [...this.logs];
  }

  private addLog(message: string): void {
    const timestamp = new Date().toISOString().slice(11, 19);
    const line = `[${timestamp}] ${message}`;
    this.logs.push(line);
    if (this.logs.length > MAX_ENGINE_LOG_LINES) {
      this.logs.splice(0, this.logs.length - MAX_ENGINE_LOG_LINES);
    }
    logger.info(`[BrowserCapture] ${line}`);
  }

  async init(): Promise<void> {
    if (this.browser) return;

    this.addLog("Iniciando navegador de captura.");
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
    this.browser = await puppeteer.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });
    this.addLog("Navegador de captura iniciado.");
  }

  async close(): Promise<void> {
    const page = this.page;
    const browser = this.browser;
    this.page = null;
    this.browser = null;
    this.dnsCache.clear();

    if (page) {
      await page.close().catch((error) => {
        logger.warn("[BrowserCapture] Falha ao fechar página:", (error as Error).message);
      });
    }
    if (browser) {
      await browser.close().catch((error) => {
        logger.warn("[BrowserCapture] Falha ao fechar navegador:", (error as Error).message);
      });
    }
  }

  private async validateRequestUrl(rawUrl: string): Promise<void> {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return;
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
    assertSafeExternalUrl(rawUrl, "Requisição do navegador");

    const host = parsed.hostname.toLowerCase();
    const now = Date.now();
    const cached = this.dnsCache.get(host);
    if (cached && cached.expiresAt > now) {
      await cached.validation;
      return;
    }

    const validation = assertSafeExternalUrlResolved(
      parsed.origin,
      "Host requisitado pelo navegador",
    ).then(() => undefined);

    this.dnsCache.set(host, {
      expiresAt: now + DNS_CACHE_TTL_MS,
      validation,
    });

    try {
      await validation;
    } catch (error) {
      this.dnsCache.delete(host);
      throw error;
    }
  }

  private async handleRequest(request: HTTPRequest): Promise<void> {
    if (request.isInterceptResolutionHandled()) return;

    try {
      await this.validateRequestUrl(request.url());
      if (!request.isInterceptResolutionHandled()) await request.continue();
    } catch (error) {
      logger.warn(
        `[BrowserCapture] Requisição bloqueada por política de rede: ${request.url()} — ${(error as Error).message}`,
      );
      if (!request.isInterceptResolutionHandled()) {
        await request.abort("blockedbyclient").catch(() => undefined);
      }
    }
  }

  private async createPage(): Promise<Page> {
    if (!this.browser) await this.init();
    if (!this.browser) throw new Error("Navegador não inicializado.");

    const page = await this.browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    );
    page.setDefaultNavigationTimeout(DEFAULT_NAVIGATION_TIMEOUT_MS);
    page.setDefaultTimeout(DEFAULT_SELECTOR_TIMEOUT_MS);

    await page.setRequestInterception(true);
    page.on("request", (request) => {
      void this.handleRequest(request);
    });

    return page;
  }

  private async navigate(rawUrl: string, context: string): Promise<void> {
    const page = this.requirePage();
    const safeUrl = await assertSafeExternalUrlResolved(rawUrl, context);

    await page.goto(safeUrl.toString(), {
      waitUntil: "networkidle2",
      timeout: DEFAULT_NAVIGATION_TIMEOUT_MS,
    });

    await assertSafeExternalUrlResolved(page.url(), `${context} após redirecionamento`);
  }

  private requirePage(): Page {
    if (!this.page) {
      throw new Error("Sessão de navegador não inicializada. Chame login() primeiro.");
    }
    return this.page;
  }

  private async readLocalStorage(): Promise<Record<string, string>> {
    const page = this.requirePage();
    try {
      return await page.evaluate(() => {
        const output: Record<string, string> = {};
        for (let index = 0; index < localStorage.length; index += 1) {
          const key = localStorage.key(index);
          if (key != null) output[key] = localStorage.getItem(key) ?? "";
        }
        return output;
      });
    } catch {
      return {};
    }
  }

  private async injectLocalStorage(entries: Record<string, string>): Promise<void> {
    const page = this.requirePage();
    if (Object.keys(entries).length === 0) return;

    try {
      await page.evaluate((data: Record<string, string>) => {
        for (const [key, value] of Object.entries(data)) {
          try {
            localStorage.setItem(key, value);
          } catch {
            // Opaque origin/quota: sessão por localStorage simplesmente não é reutilizada.
          }
        }
      }, entries);
    } catch {
      // Best effort; cookies ainda podem manter a sessão.
    }
  }

  private async saveSession(supplierId: number): Promise<void> {
    const page = this.requirePage();
    try {
      const cookies = puppeteerCookiesToRecord(await page.cookies());
      const localStorage = await this.readLocalStorage();
      if (Object.keys(cookies).length === 0 && Object.keys(localStorage).length === 0) {
        return;
      }

      await supplierSessionService.upsertSession(
        supplierId,
        { cookies, localStorage },
        "active",
      );
      this.addLog("Sessão autenticada salva para reuso.");
    } catch (error) {
      logger.warn(
        `[BrowserCapture] Falha ao persistir sessão do fornecedor #${supplierId}:`,
        (error as Error).message,
      );
    }
  }

  private async collectLoginSignals(config: SelectorConfig): Promise<LoginSignals> {
    const page = this.requirePage();
    const currentUrl = page.url();
    const pageText = await page.evaluate(() => document.body?.innerText ?? "");
    const passwordVisible = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input[type="password"]')).some(
        (element) => (element as HTMLElement).offsetParent !== null,
      ),
    );

    const selectorMatched = config.loginSuccessSelector
      ? await page.evaluate(
          (selector) => Boolean(document.querySelector(selector)),
          config.loginSuccessSelector,
        )
      : false;

    return {
      passwordVisible,
      currentUrl,
      pageText,
      selectorMatched,
      urlMatched: Boolean(
        config.loginSuccessUrl && currentUrl.includes(config.loginSuccessUrl),
      ),
      textMatched: Boolean(
        config.loginSuccessText && pageText.includes(config.loginSuccessText),
      ),
    };
  }

  private loginConfirmed(config: SelectorConfig, signals: LoginSignals): boolean {
    const normalizedText = signals.pageText.toLowerCase();
    const hasExplicitError = [
      "senha incorreta",
      "usuário não encontrado",
      "usuario nao encontrado",
      "credenciais inválidas",
      "credenciais invalidas",
      "e-mail ou senha",
      "email ou senha",
      "acesso negado",
    ].some((message) => normalizedText.includes(message));

    if (hasExplicitError) return false;

    const configuredSignals: boolean[] = [];
    if (config.loginSuccessSelector) configuredSignals.push(signals.selectorMatched);
    if (config.loginSuccessUrl) configuredSignals.push(signals.urlMatched);
    if (config.loginSuccessText) configuredSignals.push(signals.textMatched);

    if (configuredSignals.length > 0) {
      return configuredSignals.some(Boolean) && !signals.passwordVisible;
    }

    return !signals.passwordVisible;
  }

  private async detectHumanChallenge(): Promise<ChallengeDetection> {
    const page = this.requirePage();
    return page.evaluate(() => {
      const hasCaptcha = Boolean(
        document.querySelector(
          [
            ".g-recaptcha",
            ".h-captcha",
            ".cf-turnstile",
            "iframe[src*='recaptcha']",
            "iframe[src*='hcaptcha']",
            "[data-sitekey]",
            "script[src*='recaptcha']",
            "script[src*='hcaptcha']",
            "script[src*='turnstile']",
          ].join(","),
        ),
      );
      if (hasCaptcha) {
        return {
          required: true,
          kind: "captcha" as const,
          reason: "CAPTCHA/anti-bot detectado; autenticação automática não será contornada.",
        };
      }

      const mfaSelectors = [
        "input[autocomplete='one-time-code']",
        "input[name*='otp' i]",
        "input[id*='otp' i]",
        "input[name*='token' i]",
        "input[id*='mfa' i]",
        "input[name*='2fa' i]",
      ];
      const hasVisibleMfaInput = mfaSelectors.some((selector) =>
        Array.from(document.querySelectorAll(selector)).some(
          (element) => (element as HTMLElement).offsetParent !== null,
        ),
      );
      const bodyText = (document.body?.innerText ?? "").toLowerCase();
      const hasMfaText = /c[oó]digo.*(?:sms|whatsapp|autentica|verifica)|duplo fator|2fa|mfa/.test(
        bodyText,
      );

      if (hasVisibleMfaInput || hasMfaText) {
        return {
          required: true,
          kind: "mfa" as const,
          reason: "MFA/2FA detectado; a sessão requer autenticação humana.",
        };
      }

      return { required: false, kind: null, reason: null };
    });
  }

  private async tryReuseSession(
    supplierId: number,
    loginUrl: string,
    config: SelectorConfig,
  ): Promise<boolean> {
    try {
      const session = await supplierSessionService.getActiveSession(supplierId);
      if (!session) return false;

      const page = this.requirePage();
      const cookies = recordToPuppeteerCookies(
        supplierSessionService.parseCookies(session),
        loginUrl,
      );
      if (cookies.length > 0) await page.setCookie(...cookies);

      await this.navigate(loginUrl, "URL de reuso da sessão");

      const localStorage = supplierSessionService.parseLocalStorage(session);
      if (Object.keys(localStorage).length > 0) {
        await this.injectLocalStorage(localStorage);
        await this.navigate(loginUrl, "URL de reuso da sessão após localStorage");
      }

      await sleep(500);
      const signals = await this.collectLoginSignals(config);
      if (this.loginConfirmed(config, signals)) return true;

      await supplierSessionService.expireSession(supplierId).catch(() => undefined);
      return false;
    } catch (error) {
      logger.warn(
        `[BrowserCapture] Sessão salva do fornecedor #${supplierId} não pôde ser reutilizada:`,
        (error as Error).message,
      );
      return false;
    }
  }

  async login(
    loginUrl: string,
    loginIdentifier: string,
    password: string,
    config: SelectorConfig,
    supplierId?: number,
  ): Promise<void> {
    if (!loginIdentifier.trim()) throw new Error("Identificador de login vazio.");
    if (!password) throw new Error("Senha do fornecedor vazia.");

    if (!this.browser) await this.init();
    if (this.page) await this.page.close().catch(() => undefined);
    this.page = await this.createPage();

    await assertSafeExternalUrlResolved(loginUrl, "URL de login do fornecedor");

    if (
      supplierId != null &&
      (await this.tryReuseSession(supplierId, loginUrl, config))
    ) {
      this.addLog("Sessão reutilizada; login por formulário dispensado.");
      return;
    }

    this.addLog("Abrindo página de autenticação do fornecedor.");
    await this.navigate(loginUrl, "URL de login do fornecedor");

    const challengeBeforeLogin = await this.detectHumanChallenge();
    if (challengeBeforeLogin.required) {
      throw new CaptureHumanInterventionRequiredError(
        challengeBeforeLogin.reason ?? "Autenticação humana necessária.",
        challengeBeforeLogin.kind,
      );
    }

    const page = this.requirePage();
    const loginField = await page.$(config.loginEmail);
    if (!loginField && config.loginTrigger) {
      const trigger = await page.$(config.loginTrigger);
      if (trigger) {
        this.addLog("Abrindo formulário/modal de login.");
        await trigger.click();
        await sleep(600);
      }
    }

    await page.waitForSelector(config.loginEmail, {
      visible: true,
      timeout: DEFAULT_SELECTOR_TIMEOUT_MS,
    });
    await page.waitForSelector(config.loginPassword, {
      visible: true,
      timeout: DEFAULT_SELECTOR_TIMEOUT_MS,
    });

    await page.click(config.loginEmail, { clickCount: 3 });
    await page.type(config.loginEmail, loginIdentifier, { delay: 35 });
    await page.click(config.loginPassword, { clickCount: 3 });
    await page.type(config.loginPassword, password, { delay: 35 });

    await Promise.all([
      page
        .waitForNavigation({
          waitUntil: "networkidle2",
          timeout: DEFAULT_NAVIGATION_TIMEOUT_MS,
        })
        .catch(() => undefined),
      page.click(config.loginSubmit),
    ]);
    await sleep(1_000);

    await assertSafeExternalUrlResolved(
      page.url(),
      "URL após autenticação do fornecedor",
    );

    const signals = await this.collectLoginSignals(config);
    if (!this.loginConfirmed(config, signals)) {
      const challenge = await this.detectHumanChallenge();
      if (challenge.required) {
        throw new CaptureHumanInterventionRequiredError(
          challenge.reason ?? "Autenticação humana necessária.",
          challenge.kind,
        );
      }
      throw new Error(
        `Login falhou ou não pôde ser confirmado. URL atual: ${signals.currentUrl}`,
      );
    }

    this.addLog("Login autenticado confirmado.");
    if (supplierId != null) await this.saveSession(supplierId);
  }

  private async waitForContent(config: SelectorConfig): Promise<void> {
    const page = this.requirePage();
    await sleep(navigationWait(config));

    if (!config.waitForSelector) return;
    try {
      await page.waitForSelector(config.waitForSelector, {
        timeout: DEFAULT_SELECTOR_TIMEOUT_MS,
      });
    } catch {
      this.addLog(
        `Seletor de espera "${config.waitForSelector}" não apareceu; seguindo para extração/fallback.`,
      );
    }
  }

  async scrapeSearch(
    term: string,
    config: SelectorConfig,
  ): Promise<ScrapedProduct[]> {
    if (!config.searchUrlTemplate) {
      throw new Error("Conector não possui searchUrlTemplate configurado.");
    }

    const url = buildSearchUrl(config.searchUrlTemplate, term);
    this.addLog(`Executando busca seletiva por "${term.trim()}".`);
    await this.navigate(url, "URL de busca do fornecedor");
    await this.waitForContent(config);

    const products = await this.extractCurrentPage(config);
    const capturedAt = Date.now();
    for (const product of products) {
      product.consultadoEm = capturedAt;
      product.fonteUrl = product.productUrl ?? url;
    }

    this.addLog(`Busca retornou ${products.length} produto(s).`);
    return products;
  }

  async scrapeCategory(
    categoryUrl: string,
    config: SelectorConfig,
  ): Promise<ScrapedProduct[]> {
    const maxPages = boundedInteger(
      process.env.SCRAPER_MAX_PAGES,
      DEFAULT_MAX_PAGES,
      1,
      5_000,
    );
    const output: ScrapedProduct[] = [];
    const seen = new Set<string>();

    this.addLog(`Capturando categoria ${categoryUrl}.`);
    await this.navigate(categoryUrl, "URL de categoria do fornecedor");
    await this.waitForContent(config);

    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
      const products = await this.extractCurrentPage(config);
      const capturedAt = Date.now();
      let newItems = 0;

      for (const product of products) {
        product.consultadoEm = capturedAt;
        product.fonteUrl = product.productUrl ?? this.requirePage().url();
        const normalized = normalizeProduct(product);
        if (!normalized) continue;

        const key = normalizeIdentityKey(normalized);
        if (seen.has(key)) continue;
        seen.add(key);
        output.push(normalized);
        newItems += 1;
      }

      this.addLog(
        `Categoria página ${pageNumber}: ${products.length} extraídos, ${newItems} novos.`,
      );

      if (products.length > 0 && newItems === 0) break;
      if (!config.nextPage) break;

      const page = this.requirePage();
      const nextButton = await page.$(config.nextPage);
      if (!nextButton) break;

      const previousUrl = page.url();
      try {
        await Promise.all([
          page
            .waitForNavigation({
              waitUntil: "networkidle2",
              timeout: 15_000,
            })
            .catch(() => undefined),
          nextButton.click(),
        ]);
        await this.waitForContent(config);
        await assertSafeExternalUrlResolved(
          page.url(),
          "URL de paginação do fornecedor",
        );

        if (page.url() === previousUrl && products.length === 0) break;
      } catch (error) {
        this.addLog(
          `Paginação encerrada após falha controlada: ${(error as Error).message}`,
        );
        break;
      }
    }

    return dedupeProducts(output);
  }

  private async extractCurrentPage(config: SelectorConfig): Promise<ScrapedProduct[]> {
    if (config.useStructuredData) {
      const structured = await this.extractStructuredProducts();
      if (structured.length > 0) return structured;
    }
    return this.extractDomProducts(config);
  }

  private async extractDomProducts(config: SelectorConfig): Promise<ScrapedProduct[]> {
    const page = this.requirePage();
    const raw = await page.evaluate((selectors) => {
      const parsePrice = (value: string): number => {
        const cleaned = value.replace(/[^\d,.-]/g, "").trim();
        if (!cleaned) return 0;

        const normalized = cleaned.includes(",")
          ? cleaned.replace(/\./g, "").replace(",", ".")
          : cleaned;
        const parsed = Number.parseFloat(normalized);
        return Number.isFinite(parsed) ? parsed : 0;
      };

      const absolute = (value: string): string | undefined => {
        if (!value) return undefined;
        try {
          return new URL(value, window.location.href).toString();
        } catch {
          return undefined;
        }
      };

      return Array.from(document.querySelectorAll(selectors.productItem))
        .map((element) => {
          const getText = (selector?: string): string => {
            if (!selector) return "";
            return element.querySelector(selector)?.textContent?.trim() ?? "";
          };
          const getAttribute = (selector: string | undefined, attribute: string): string => {
            if (!selector) return "";
            const node = element.querySelector(selector);
            return node?.getAttribute(attribute)?.trim() ?? "";
          };

          const name = getText(selectors.productName);
          const price = parsePrice(getText(selectors.productPrice));
          const code = getText(selectors.productCode)
            .replace(/c[oó]digo\s*:?/i, "")
            .trim() || undefined;

          let ean = getText(selectors.productEan) || undefined;
          if (!ean && selectors.productEan) {
            ean =
              getAttribute(selectors.productEan, "data-ean") ||
              getAttribute(selectors.productEan, "value") ||
              undefined;
          }

          const imageRaw =
            getAttribute(selectors.productImage, "src") ||
            getAttribute(selectors.productImage, "data-src");
          const linkRaw = getAttribute(selectors.productLink, "href");

          return {
            name,
            price,
            code,
            ean,
            imageUrl: absolute(imageRaw),
            productUrl: absolute(linkRaw),
          };
        })
        .filter((product) => product.name && product.price > 0);
    }, config);

    return dedupeProducts(raw);
  }

  private async extractStructuredProducts(): Promise<ScrapedProduct[]> {
    const page = this.requirePage();
    const raw = await page.evaluate(() => {
      type UnknownRecord = Record<string, unknown>;

      const toNumber = (value: unknown): number => {
        if (typeof value === "number") return Number.isFinite(value) ? value : 0;
        if (typeof value !== "string") return 0;
        const cleaned = value.replace(/[^\d,.-]/g, "").trim();
        if (!cleaned) return 0;
        const normalized = cleaned.includes(",")
          ? cleaned.replace(/\./g, "").replace(",", ".")
          : cleaned;
        const parsed = Number.parseFloat(normalized);
        return Number.isFinite(parsed) ? parsed : 0;
      };

      const toText = (value: unknown): string | undefined => {
        if (typeof value === "string") return value.trim() || undefined;
        if (typeof value === "number" && Number.isFinite(value)) return String(value);
        return undefined;
      };

      const absolute = (value: unknown): string | undefined => {
        const text = toText(value);
        if (!text) return undefined;
        try {
          return new URL(text, window.location.href).toString();
        } catch {
          return undefined;
        }
      };

      const eanOf = (record: UnknownRecord): string | undefined => {
        const rawValue =
          record.gtin13 ??
          record.gtin14 ??
          record.gtin ??
          record.ean ??
          record.barcode;
        const digits = toText(rawValue)?.replace(/\D/g, "") ?? "";
        return /^\d{8,14}$/.test(digits) ? digits : undefined;
      };

      const imageOf = (record: UnknownRecord): string | undefined => {
        const image = Array.isArray(record.image) ? record.image[0] : record.image;
        if (typeof image === "object" && image !== null) {
          return absolute((image as UnknownRecord).url);
        }
        return absolute(image);
      };

      const dataLayerProducts: UnknownRecord[] = [];
      for (const script of Array.from(document.querySelectorAll("script:not([src])"))) {
        const source = script.textContent ?? "";
        let cursor = source.indexOf("pushProducts(");

        while (cursor !== -1) {
          const start = source.indexOf("[", cursor);
          if (start === -1) break;

          let depth = 0;
          let end = -1;
          let quote = "";
          let inString = false;

          for (let index = start; index < source.length; index += 1) {
            const character = source[index];
            if (inString) {
              if (character === "\\") {
                index += 1;
                continue;
              }
              if (character === quote) inString = false;
              continue;
            }

            if (character === '"' || character === "'") {
              inString = true;
              quote = character;
            } else if (character === "[") {
              depth += 1;
            } else if (character === "]") {
              depth -= 1;
              if (depth === 0) {
                end = index;
                break;
              }
            }
          }

          if (end === -1) break;
          try {
            const parsed = JSON.parse(source.slice(start, end + 1));
            if (Array.isArray(parsed)) {
              for (const item of parsed) {
                if (item && typeof item === "object") {
                  dataLayerProducts.push(item as UnknownRecord);
                }
              }
            }
          } catch {
            // Script não contém JSON puro; JSON-LD/DOM continuam como fallback.
          }
          cursor = source.indexOf("pushProducts(", end + 1);
        }
      }

      const jsonLdProducts: UnknownRecord[] = [];
      const collectJsonLd = (node: unknown, depth = 0): void => {
        if (node == null || depth > 10) return;
        if (Array.isArray(node)) {
          for (const item of node) collectJsonLd(item, depth + 1);
          return;
        }
        if (typeof node !== "object") return;

        const record = node as UnknownRecord;
        const type = record["@type"];
        if (
          type === "Product" ||
          (Array.isArray(type) && type.includes("Product"))
        ) {
          jsonLdProducts.push(record);
        }

        if (record.itemListElement) collectJsonLd(record.itemListElement, depth + 1);
        if (record.item) collectJsonLd(record.item, depth + 1);
        if (record["@graph"]) collectJsonLd(record["@graph"], depth + 1);
      };

      for (const node of Array.from(
        document.querySelectorAll('script[type="application/ld+json"]'),
      )) {
        try {
          collectJsonLd(JSON.parse(node.textContent ?? "null"));
        } catch {
          // JSON-LD inválido não bloqueia outras fontes.
        }
      }

      const jsonLdBySku = new Map<string, UnknownRecord>();
      for (const product of jsonLdProducts) {
        const sku = toText(
          product.sku ?? product.mpn ?? product.productID ?? product.gtin13,
        );
        if (sku) jsonLdBySku.set(sku, product);
      }

      const output: Array<{
        name: string;
        code?: string;
        ean?: string;
        price: number;
        unit?: string;
        imageUrl?: string;
        productUrl?: string;
        availability?: string;
        priceNormal?: number;
        pricePromo?: number;
        stock?: number;
      }> = [];
      const seen = new Set<string>();

      for (const data of dataLayerProducts) {
        const code = toText(data.code ?? data.sku ?? data.id);
        const name = toText(data.name ?? data.title);
        const spotPrice = toNumber(data.spot_price);
        const normalPrice = toNumber(data.old_price ?? data.price);
        const price = spotPrice > 0 ? spotPrice : normalPrice;
        if (!name || price <= 0) continue;

        const key = code || name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        const linked = code ? jsonLdBySku.get(code) : undefined;
        const stockRaw = data.stock ?? data.estoque ?? data.quantity;
        const stockNumber = stockRaw == null ? undefined : toNumber(stockRaw);
        const stock = stockNumber == null ? undefined : Math.max(0, Math.trunc(stockNumber));

        output.push({
          name,
          code,
          ean: eanOf(data) ?? (linked ? eanOf(linked) : undefined),
          price,
          imageUrl:
            absolute(data.image ?? data.imageUrl) ??
            (linked ? imageOf(linked) : undefined),
          productUrl:
            absolute(data.url ?? data.productUrl) ??
            (linked ? absolute(linked.url) : undefined),
          availability:
            stock == null ? toText(data.availability) : stock > 0 ? "disponivel" : "indisponivel",
          priceNormal: normalPrice > 0 ? normalPrice : undefined,
          pricePromo:
            spotPrice > 0 && normalPrice > 0 && spotPrice < normalPrice
              ? spotPrice
              : undefined,
          stock,
          unit: toText(data.unit ?? data.unidade),
        });
      }

      for (const product of jsonLdProducts) {
        const code = toText(
          product.sku ?? product.mpn ?? product.productID ?? product.gtin13,
        );
        const name = toText(product.name);
        if (!name) continue;

        const offersRaw = product.offers;
        const offers = Array.isArray(offersRaw) ? offersRaw[0] : offersRaw;
        const offer =
          offers && typeof offers === "object"
            ? (offers as UnknownRecord)
            : null;
        const price = offer ? toNumber(offer.price ?? offer.lowPrice) : 0;
        if (price <= 0) continue;

        const key = code || name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        output.push({
          name,
          code,
          ean: eanOf(product),
          price,
          imageUrl: imageOf(product),
          productUrl: absolute(product.url),
          availability: offer ? toText(offer.availability) : undefined,
        });
      }

      return output;
    });

    return dedupeProducts(raw);
  }

  async captureEvidence(prefix: string): Promise<string | null> {
    const page = this.page;
    if (!page) return null;

    try {
      const buffer = (await page.screenshot({
        type: "jpeg",
        quality: 60,
        fullPage: false,
      })) as Buffer;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const safePrefix = prefix.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80);
      const { url } = await storagePut(
        `scraper-evidencias/${safePrefix}-${stamp}.jpg`,
        buffer,
        "image/jpeg",
      );
      return url;
    } catch (error) {
      logger.warn(
        "[BrowserCapture] Falha ao salvar evidência visual:",
        (error as Error).message,
      );
      return null;
    }
  }
}

export interface TestBrowserLoginResult {
  success: boolean;
  message: string;
  log: string[];
  requiresHumanIntervention?: boolean;
  challengeType?: ChallengeDetection["kind"];
}

export async function testBrowserLogin(input: {
  loginUrl: string;
  loginIdentifier: string;
  password: string;
  config: SelectorConfig;
}): Promise<TestBrowserLoginResult> {
  const engine = new BrowserCaptureEngine();

  try {
    await engine.login(
      input.loginUrl,
      input.loginIdentifier,
      input.password,
      input.config,
    );
    return {
      success: true,
      message: "Login confirmado no site do fornecedor.",
      log: [...engine.log],
    };
  } catch (error) {
    if (error instanceof CaptureHumanInterventionRequiredError) {
      return {
        success: false,
        message: error.message,
        log: [...engine.log],
        requiresHumanIntervention: true,
        challengeType: error.kind,
      };
    }

    return {
      success: false,
      message: error instanceof Error ? error.message : "Falha ao autenticar.",
      log: [...engine.log],
    };
  } finally {
    await engine.close();
  }
}
