import type { Page } from "puppeteer";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { scraperConfigs } from "../../drizzle/schema";
import { decryptPassword } from "../utils/encryption";
import {
  assertSafeExternalUrl,
  assertSafeExternalUrlResolved,
} from "../utils/urlGuard";
import { logger } from "../_core/logger";
import { BrowserCaptureEngine } from "./browserCaptureEngine";
import { enqueueCaptureJob } from "./captureCoreService";
import { FORNECEDOR_CONFIGS } from "./scraperPresets";
import type { SelectorConfig } from "./scraperContracts";

const TAMBASA_HOME = "https://tambasa.com/";
const TAMBASA_HOSTS = new Set(["tambasa.com", "www.tambasa.com"]);
const DEFAULT_MAX_CATEGORIES = 1_500;
const MAX_ALLOWED_CATEGORIES = 3_000;
const DEFAULT_NAVIGATION_WAIT_MS = 1_200;

/**
 * Lock local somente evita trabalho duplicado na mesma instância. O fluxo de
 * captura efetivo continua protegido pelo activeKey persistente do Capture Core.
 */
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
  captureJob: {
    id: number;
    status: string;
    reused: boolean;
    mode: string;
  };
}

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

    const normalized = url.toString();
    assertSafeExternalUrl(normalized, "URL de catálogo Tambasa");
    return normalized;
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

function normalizeNavigationWait(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_NAVIGATION_WAIT_MS;
  return Math.max(250, Math.min(Math.trunc(value!), 15_000));
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
    if (document.querySelector(".f1-product-item, .products-lists__list-item")) {
      return true;
    }

    return Array.from(document.querySelectorAll("script:not([src])")).some((script) => {
      const text = script.textContent ?? "";
      return /pushProducts\s*\(\s*\[/.test(text);
    });
  });
}

function resolveLoginIdentifier(raw: string | null | undefined): string {
  const value = raw?.trim();
  if (!value) return "";

  try {
    const decrypted = decryptPassword(value).trim();
    return decrypted || value;
  } catch {
    return value;
  }
}

function decryptRequiredPassword(raw: string | null | undefined): string {
  if (!raw) throw new Error("Senha da Tambasa não configurada.");

  try {
    const password = decryptPassword(raw).trim();
    if (!password) throw new Error("Senha vazia após descriptografia.");
    return password;
  } catch {
    throw new Error("Falha ao descriptografar a senha da Tambasa no cofre de credenciais.");
  }
}

async function loadTambasaConfig(scraperConfigId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  const [config] = await db
    .select()
    .from(scraperConfigs)
    .where(eq(scraperConfigs.id, scraperConfigId))
    .limit(1);

  if (!config) {
    throw new Error(`Configuração de scraper #${scraperConfigId} não encontrada.`);
  }
  if (config.enabled !== "yes") {
    throw new Error("A configuração de captura da Tambasa está desativada.");
  }
  if (config.scraperType.trim().toLowerCase() !== "tambasa") {
    throw new Error("A descoberta automática desta rotina é exclusiva da Tambasa.");
  }
  if (!config.tosAprovado) {
    throw new Error(
      "Captura bloqueada: confirme que os termos de uso da Tambasa foram revisados e a coleta está autorizada.",
    );
  }

  const loginIdentifier = resolveLoginIdentifier(config.email);
  const password = decryptRequiredPassword(config.passwordHash);
  if (!loginIdentifier) {
    throw new Error("Usuário/e-mail da Tambasa não está configurado no S2.");
  }

  const baseConfig = FORNECEDOR_CONFIGS.tambasa;
  if (!baseConfig) throw new Error("Preset Tambasa ausente.");

  const custom = (
    config.customSelectors && typeof config.customSelectors === "object"
      ? config.customSelectors
      : {}
  ) as Partial<SelectorConfig>;

  const selectors: SelectorConfig = {
    ...baseConfig,
    ...custom,
    categoryUrls: Array.isArray(custom.categoryUrls)
      ? custom.categoryUrls
      : baseConfig.categoryUrls,
    useStructuredData: true,
  };

  if (selectors.loginUrl) {
    assertSafeExternalUrl(selectors.loginUrl, "URL de login Tambasa");
  }
  for (const url of selectors.categoryUrls) {
    if (!normalizeTambasaCatalogUrl(url)) {
      throw new Error(`URL de categoria Tambasa inválida: ${url}`);
    }
  }

  return {
    db,
    config,
    loginIdentifier,
    password,
    selectors,
  };
}

/**
 * Descobre categorias usando uma página que já pertence ao BrowserCaptureEngine.
 * Não cria navegador, não autentica e não possui política de rede paralela.
 */
export async function discoverTambasaCategoriesOnPage(
  page: Page,
  selectors: SelectorConfig,
  maxCategories: number,
): Promise<TambasaCategoryDiscovery> {
  const startedAt = Date.now();
  const warnings: string[] = [];
  const discovered = new Set<string>();
  const visited = new Set<string>();
  const productBearing = new Set<string>();
  const queue: string[] = [];
  let cursor = 0;

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

  const navigationWaitMs = normalizeNavigationWait(selectors.navigationWait);
  while (cursor < queue.length && visited.size < maxCategories) {
    const url = queue[cursor];
    cursor += 1;
    if (visited.has(url)) continue;
    visited.add(url);

    try {
      const safe = await assertSafeExternalUrlResolved(url, "URL de categoria Tambasa");
      await page.goto(safe.toString(), {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await assertSafeExternalUrlResolved(page.url(), "URL Tambasa após redirecionamento");
      await sleep(navigationWaitMs);

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
      if (warnings.length < 200) warnings.push(`${url}: ${message}`);
      logger.warn(`[TambasaCatalog] Falha controlada em categoria: ${message}`);
    }
  }

  const source = productBearing.size > 0 ? productBearing : discovered;
  const categoryUrls = [...source].sort(
    (left, right) =>
      categoryDepth(right) - categoryDepth(left) || left.localeCompare(right),
  );

  if (categoryUrls.length === 0) {
    throw new Error("Nenhuma página de catálogo utilizável foi descoberta na Tambasa.");
  }

  return {
    categoriesDiscovered: discovered.size,
    categoriesVisited: visited.size,
    productBearingCategories: productBearing.size,
    categoryUrls,
    truncated: cursor < queue.length,
    warnings,
    durationMs: Date.now() - startedAt,
  };
}

async function discoverTambasaCategoriesInternal(
  scraperConfigId: number,
  maxCategories: number,
): Promise<TambasaCategoryDiscovery> {
  const { config, loginIdentifier, password, selectors } = await loadTambasaConfig(scraperConfigId);
  const engine = new BrowserCaptureEngine();

  try {
    await engine.login(
      selectors.loginUrl ?? TAMBASA_HOME,
      loginIdentifier,
      password,
      selectors,
      config.supplierId,
    );

    const page = engine.authenticatedPage;
    if (!page) throw new Error("Página autenticada da Tambasa indisponível.");

    logger.info(
      `[TambasaCatalog] Login confirmado pelo BrowserCaptureEngine para configuração #${scraperConfigId}.`,
    );
    return await discoverTambasaCategoriesOnPage(page, selectors, maxCategories);
  } finally {
    await engine.close();
  }
}

function normalizeMaxCategories(value?: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_CATEGORIES;
  return Math.min(
    MAX_ALLOWED_CATEGORIES,
    Math.max(10, Math.trunc(value!)),
  );
}

export function isTambasaCatalogRunning(scraperConfigId: number): boolean {
  return runningConfigIds.has(scraperConfigId);
}

export async function discoverTambasaCategories(
  scraperConfigId: number,
  options: { maxCategories?: number } = {},
): Promise<TambasaCategoryDiscovery> {
  if (runningConfigIds.has(scraperConfigId)) {
    throw new Error(`A Tambasa #${scraperConfigId} já está em descoberta nesta instância.`);
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
 * Compatibilidade do fluxo antigo "expandir e sincronizar". A descoberta usa o
 * mesmo runtime seguro do Capture Core e a sincronização apenas enfileira job;
 * nunca escreve produto/oferta diretamente.
 */
export async function expandAndSyncTambasaCatalog(
  scraperConfigId: number,
  options: { maxCategories?: number } = {},
): Promise<TambasaExpandedRunResult> {
  if (runningConfigIds.has(scraperConfigId)) {
    throw new Error(`A Tambasa #${scraperConfigId} já está em descoberta nesta instância.`);
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
      .set({ customSelectors: expandedSelectors })
      .where(eq(scraperConfigs.id, config.id));

    const captureJob = await enqueueCaptureJob({
      scraperConfigId,
      mode: "full",
      trigger: "manual",
      priority: 80,
      meta: {
        source: "tambasa_catalog_expansion",
        discoveredCategories: discovery.categoryUrls.length,
      },
    });

    logger.info(
      `[TambasaCatalog] Configuração #${scraperConfigId} ampliada para ` +
        `${discovery.categoryUrls.length} páginas; Capture Job #${captureJob.id} ` +
        `${captureJob.reused ? "reutilizado" : "enfileirado"}.`,
    );

    return {
      discovery,
      captureJob: {
        id: captureJob.id,
        status: captureJob.status,
        reused: captureJob.reused,
        mode: captureJob.mode,
      },
    };
  } finally {
    runningConfigIds.delete(scraperConfigId);
  }
}
