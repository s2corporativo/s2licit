import puppeteer, { type Browser, type Page } from "puppeteer";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { scraperConfigs } from "../../drizzle/schema";
import { decryptPassword } from "../utils/encryption";
import {
  executarScraper,
  FORNECEDOR_CONFIGS,
  type ScraperRunResult,
  type SelectorConfig,
} from "./scraperEngine";
import { logger } from "../_core/logger";

const TAMBASA_HOME = "https://tambasa.com/";
const TAMBASA_HOSTS = new Set(["tambasa.com", "www.tambasa.com"]);
const DEFAULT_MAX_CATEGORIES = 1_500;
const MAX_ALLOWED_CATEGORIES = 3_000;

const runningConfigIds = new Set<number>();

export interface TambasaCategoryDiscovery {
  categoriesDiscovered: number;
  categoriesVisited: number;
  productBearingCategories: number;
  categoryUrls: string[];
  truncated: boolean;
  warnings: string[];
  durationMs: number;
}

export interface TambasaExpandedRunResult {
  discovery: TambasaCategoryDiscovery;
  scraper: ScraperRunResult;
}

/**
 * Normaliza somente URLs de catálogo da Tambasa. Links externos, contas,
 * carrinho e páginas de produto são recusados. Query string e hash são
 * removidos para impedir a mesma categoria de entrar várias vezes na fila.
 */
export function normalizeTambasaCatalogUrl(
  rawUrl: string,
  baseUrl = TAMBASA_HOME,
): string | null {
  try {
    const url = new URL(rawUrl, baseUrl);
    const host = url.hostname.toLowerCase();
    if (!TAMBASA_HOSTS.has(host)) return null;

    const path = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    const isCategory = path === "/categoria" || path.startsWith("/categoria/");
    const isOffers = path === "/ofertas" || path.startsWith("/ofertas/");
    if (!isCategory && !isOffers) return null;

    url.protocol = "https:";
    url.hostname = "tambasa.com";
    url.pathname = path;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function categoryDepth(url: string): number {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).length;
  } catch {
    return 0;
  }
}

async function collectCatalogLinks(page: Page): Promise<string[]> {
  const hrefs = await page.$$eval("a[href]", (anchors) =>
    anchors
      .map((anchor) => (anchor as HTMLAnchorElement).href)
      .filter((href): href is string => typeof href === "string" && href.length > 0),
  );

  const unique = new Set<string>();
  for (const href of hrefs) {
    const normalized = normalizeTambasaCatalogUrl(href, page.url());
    if (normalized) unique.add(normalized);
  }
  return [...unique];
}

async function pageHasProducts(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    if (document.querySelector(".f1-product-item, .products-lists__list-item")) return true;

    return Array.from(document.querySelectorAll("script:not([src])")).some((script) => {
      const text = script.textContent ?? "";
      return /pushProducts\s*\(\s*\[/.test(text);
    });
  });
}

async function openLoginModalIfNeeded(page: Page, cfg: SelectorConfig): Promise<void> {
  if (await page.$(cfg.loginEmail)) return;
  if (!cfg.loginTrigger) return;

  const trigger = await page.$(cfg.loginTrigger);
  if (!trigger) return;

  await trigger.click().catch(() => undefined);
  await sleep(800);
}

async function loginTambasa(
  page: Page,
  cfg: SelectorConfig,
  email: string,
  password: string,
): Promise<void> {
  await page.goto(cfg.loginUrl ?? TAMBASA_HOME, {
    waitUntil: "networkidle2",
    timeout: 30_000,
  });

  await openLoginModalIfNeeded(page, cfg);
  await page.waitForSelector(cfg.loginEmail, { visible: true, timeout: 12_000 });
  await page.waitForSelector(cfg.loginPassword, { visible: true, timeout: 12_000 });

  await page.click(cfg.loginEmail);
  await page.type(cfg.loginEmail, email, { delay: 50 });
  await page.click(cfg.loginPassword);
  await page.type(cfg.loginPassword, password, { delay: 50 });

  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30_000 }).catch(() => undefined),
    page.click(cfg.loginSubmit),
  ]);
  await sleep(1_200);

  const logged = cfg.loginSuccessSelector
    ? await page.evaluate((selector) => Boolean(document.querySelector(selector)), cfg.loginSuccessSelector)
    : !(await page.evaluate(() =>
        Array.from(document.querySelectorAll('input[type="password"]')).some(
          (element) => (element as HTMLElement).offsetParent !== null,
        ),
      ));

  if (!logged) {
    throw new Error("Não foi possível confirmar o login autenticado na Tambasa.");
  }
}

async function loadTambasaConfig(scraperConfigId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const [config] = await db
    .select()
    .from(scraperConfigs)
    .where(eq(scraperConfigs.id, scraperConfigId))
    .limit(1);

  if (!config) throw new Error(`Configuração de scraper #${scraperConfigId} não encontrada.`);
  if (config.scraperType.toLowerCase() !== "tambasa") {
    throw new Error("A ampliação automática de catálogo desta rotina é exclusiva da Tambasa.");
  }
  if (!config.tosAprovado) {
    throw new Error(
      "Captura bloqueada: confirme que os termos de uso da Tambasa foram revisados e a coleta está autorizada.",
    );
  }

  const email = config.email?.includes("@")
    ? config.email
    : (() => {
        try {
          return decryptPassword(config.email ?? "");
        } catch {
          return config.email ?? "";
        }
      })();

  let password = "";
  try {
    password = decryptPassword(config.passwordHash);
  } catch {
    throw new Error("Falha ao descriptografar a senha da Tambasa no cofre de credenciais.");
  }

  if (!email || !password) {
    throw new Error("Credenciais da Tambasa não estão completas no cofre do S2.");
  }

  const baseConfig = FORNECEDOR_CONFIGS.tambasa;
  const custom = (config.customSelectors ?? {}) as Partial<SelectorConfig>;
  const selectors: SelectorConfig = {
    ...baseConfig,
    ...custom,
    categoryUrls: Array.isArray(custom.categoryUrls)
      ? custom.categoryUrls
      : baseConfig.categoryUrls,
    useStructuredData: true,
  };

  return { db, config, email, password, selectors };
}

async function discoverTambasaCategoriesInternal(
  scraperConfigId: number,
  maxCategories: number,
): Promise<TambasaCategoryDiscovery> {
  const startedAt = Date.now();
  const { email, password, selectors } = await loadTambasaConfig(scraperConfigId);

  const browser: Browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  const warnings: string[] = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    );

    await loginTambasa(page, selectors, email, password);
    logger.info(`[TambasaCatalog] Login confirmado para descoberta do catálogo #${scraperConfigId}.`);

    const discovered = new Set<string>();
    const visited = new Set<string>();
    const productBearing = new Set<string>();
    const queue: string[] = [];

    const seedLinks = await collectCatalogLinks(page);
    for (const url of [...seedLinks, ...selectors.categoryUrls]) {
      const normalized = normalizeTambasaCatalogUrl(url);
      if (!normalized || discovered.has(normalized)) continue;
      discovered.add(normalized);
      queue.push(normalized);
    }

    if (queue.length === 0) {
      throw new Error("A Tambasa não apresentou links de categorias após o login.");
    }

    while (queue.length > 0 && visited.size < maxCategories) {
      const url = queue.shift()!;
      if (visited.has(url)) continue;
      visited.add(url);

      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await sleep(selectors.navigationWait ?? 1_200);

        if (await pageHasProducts(page)) productBearing.add(url);

        const links = await collectCatalogLinks(page);
        for (const link of links) {
          if (discovered.size >= maxCategories) break;
          if (discovered.has(link)) continue;
          discovered.add(link);
          queue.push(link);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`${url}: ${message}`);
        logger.warn(`[TambasaCatalog] Falha ao inspecionar ${url}: ${message}`);
      }
    }

    const categoryUrls = [...(productBearing.size > 0 ? productBearing : discovered)]
      .sort((a, b) => categoryDepth(b) - categoryDepth(a) || a.localeCompare(b));

    if (categoryUrls.length === 0) {
      throw new Error("Nenhuma página de catálogo utilizável foi descoberta na Tambasa.");
    }

    return {
      categoriesDiscovered: discovered.size,
      categoriesVisited: visited.size,
      productBearingCategories: productBearing.size,
      categoryUrls,
      truncated: queue.length > 0,
      warnings,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await browser.close().catch(() => undefined);
  }
}

function normalizeMaxCategories(value?: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_CATEGORIES;
  return Math.min(MAX_ALLOWED_CATEGORIES, Math.max(10, Math.trunc(value!)));
}

export function isTambasaCatalogRunning(scraperConfigId: number): boolean {
  return runningConfigIds.has(scraperConfigId);
}

export async function discoverTambasaCategories(
  scraperConfigId: number,
  options: { maxCategories?: number } = {},
): Promise<TambasaCategoryDiscovery> {
  if (runningConfigIds.has(scraperConfigId)) {
    throw new Error(`A Tambasa #${scraperConfigId} já está em descoberta ou sincronização.`);
  }

  runningConfigIds.add(scraperConfigId);
  try {
    return await discoverTambasaCategoriesInternal(
      scraperConfigId,
      normalizeMaxCategories(options.maxCategories),
    );
  } finally {
    runningConfigIds.delete(scraperConfigId);
  }
}

/**
 * Descobre todas as páginas de catálogo disponíveis para a conta autenticada,
 * grava a configuração expandida no S2 e executa o motor já existente de
 * captura, deduplicação, cadastro de produtos, atualização de ofertas e
 * histórico de preços.
 */
export async function expandAndSyncTambasaCatalog(
  scraperConfigId: number,
  options: { maxCategories?: number } = {},
): Promise<TambasaExpandedRunResult> {
  if (runningConfigIds.has(scraperConfigId)) {
    throw new Error(`A Tambasa #${scraperConfigId} já está em descoberta ou sincronização.`);
  }

  runningConfigIds.add(scraperConfigId);
  try {
    const discovery = await discoverTambasaCategoriesInternal(
      scraperConfigId,
      normalizeMaxCategories(options.maxCategories),
    );

    const { db, config, selectors } = await loadTambasaConfig(scraperConfigId);
    const expandedSelectors: SelectorConfig = {
      ...selectors,
      categoryUrls: discovery.categoryUrls,
      useStructuredData: true,
    };

    await db
      .update(scraperConfigs)
      .set({ customSelectors: expandedSelectors as unknown as Record<string, unknown> })
      .where(eq(scraperConfigs.id, config.id));

    logger.info(
      `[TambasaCatalog] Configuração #${scraperConfigId} ampliada para ` +
        `${discovery.categoryUrls.length} páginas de catálogo. Iniciando sincronização.`,
    );

    const scraper = await executarScraper(scraperConfigId);
    return { discovery, scraper };
  } finally {
    runningConfigIds.delete(scraperConfigId);
  }
}
