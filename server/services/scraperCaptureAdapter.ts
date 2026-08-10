import { asc, eq } from "drizzle-orm";
import type { Page } from "puppeteer";
import { getDb } from "../db";
import { productSupplierOffers, products, scraperConfigs, suppliers } from "../../drizzle/schema";
import { decryptPassword } from "../utils/encryption";
import { normalizeText } from "../matching/productMatcher";
import {
  FORNECEDOR_CONFIGS,
  ScraperEngine,
  type ScrapedProduct,
  type SelectorConfig,
} from "./scraperEngine";
import { discoverTambasaCategories } from "./tambasaCatalogService";
import { chooseCaptureMode, getConnectorCapabilities } from "./captureConnectorCapabilities";
import { attachNetworkJsonProductProbe, type ProbedProduct } from "./networkJsonProductProbe";

export type CapturedSupplierProduct = ScrapedProduct & {
  sourceType: "api" | "browser" | "structured";
};

export interface CaptureAdapterInput {
  scraperConfigId: number;
  mode: "search" | "refresh" | "full";
  /** Busca: um termo. Refresh: termos/SKUs separados por quebra de linha. */
  query?: string | null;
}

export interface CaptureAdapterResult {
  supplierId: number;
  supplierName: string;
  scraperType: string;
  mode: "search" | "refresh" | "full";
  products: CapturedSupplierProduct[];
  expectedItems?: number;
  warnings: string[];
  capabilities: ReturnType<typeof getConnectorCapabilities>;
}

async function loadConfig(scraperConfigId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const [config] = await db.select().from(scraperConfigs)
    .where(eq(scraperConfigs.id, scraperConfigId)).limit(1);
  if (!config) throw new Error(`Configuração de scraper #${scraperConfigId} não encontrada.`);
  if (!config.tosAprovado) {
    throw new Error("Captura bloqueada: os termos de uso do fornecedor ainda não foram aprovados.");
  }

  const [supplier] = await db.select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers).where(eq(suppliers.id, config.supplierId)).limit(1);
  if (!supplier) throw new Error(`Fornecedor #${config.supplierId} não encontrado.`);

  const scraperType = config.scraperType.toLowerCase();
  const selectors = (
    (config.customSelectors as SelectorConfig | null) ??
    FORNECEDOR_CONFIGS[scraperType] ??
    FORNECEDOR_CONFIGS.generico
  );
  const email = config.email?.includes("@")
    ? config.email
    : (() => {
        try { return decryptPassword(config.email ?? ""); } catch { return config.email ?? ""; }
      })();
  let password = "";
  try { password = decryptPassword(config.passwordHash); }
  catch { throw new Error("Falha ao descriptografar a senha do fornecedor."); }
  if (!email || !password) throw new Error("Credenciais do fornecedor incompletas.");
  return { config, supplier, scraperType, selectors, email, password };
}

function richness(product: CapturedSupplierProduct): number {
  return Number(Boolean(product.ean)) * 3 +
    Number(Boolean(product.code)) * 2 +
    Number(product.stock != null) * 2 +
    Number(Boolean(product.imageUrl)) +
    Number(Boolean(product.productUrl)) +
    Number(product.sourceType === "api") * 2;
}

function dedupe(productsIn: CapturedSupplierProduct[]): CapturedSupplierProduct[] {
  const out = new Map<string, CapturedSupplierProduct>();
  for (const product of productsIn) {
    const key =
      (product.ean && `ean:${product.ean}`) ||
      (product.code && `sku:${product.code}`) ||
      (product.productUrl && `url:${product.productUrl}`) ||
      `name:${normalizeText(product.name)}|${product.price}`;
    const previous = out.get(key);
    if (!previous || richness(product) > richness(previous)) out.set(key, product);
  }
  return [...out.values()];
}

async function buildRefreshTerms(supplierId: number, limit: number): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({
    supplierCode: productSupplierOffers.supplierCode,
    productName: products.name,
  })
    .from(productSupplierOffers)
    .innerJoin(products, eq(productSupplierOffers.productId, products.id))
    .where(eq(productSupplierOffers.supplierId, supplierId))
    .orderBy(asc(productSupplierOffers.updatedAt))
    .limit(limit);
  return Array.from(new Set(
    rows.map((row) => (row.supplierCode || row.productName || "").trim()).filter(Boolean),
  ));
}

function explicitRefreshTerms(query?: string | null): string[] {
  if (!query?.trim()) return [];
  return Array.from(new Set(
    query.split(/\r?\n/).map((term) => term.trim()).filter(Boolean),
  )).slice(0, 500);
}

function allowedHosts(selectors: SelectorConfig, loginUrl: string): Set<string> {
  const hosts = new Set<string>();
  for (const raw of [loginUrl, selectors.searchUrlTemplate, ...selectors.categoryUrls]) {
    if (!raw) continue;
    try { hosts.add(new URL(raw.replace(/\{q\}|\{termo\}/gi, "probe")).hostname.toLowerCase()); }
    catch { /* configuração será validada quando efetivamente usada */ }
  }
  return hosts;
}

function browserProducts(
  products: ScrapedProduct[],
  selectors: SelectorConfig,
): CapturedSupplierProduct[] {
  return products.map((product) => ({
    ...product,
    sourceType: selectors.useStructuredData ? "structured" : "browser",
  }));
}

/**
 * Captura SEM persistência. Em conectores híbridos, observa também respostas
 * JSON que o próprio portal carrega na sessão autenticada e prefere esses dados
 * quando forem mais ricos; CSS/DOM permanece fallback automático.
 */
export async function captureSupplierProducts(input: CaptureAdapterInput): Promise<CaptureAdapterResult> {
  const loaded = await loadConfig(input.scraperConfigId);
  const { config, supplier, scraperType, email, password } = loaded;
  let selectors: SelectorConfig = { ...loaded.selectors, categoryUrls: [...loaded.selectors.categoryUrls] };
  const capabilities = getConnectorCapabilities(scraperType, selectors);
  const mode = chooseCaptureMode(input.mode, capabilities, input.query);
  const warnings: string[] = [];

  if (mode === "full" && scraperType === "tambasa") {
    try {
      const discovery = await discoverTambasaCategories(input.scraperConfigId, {
        maxCategories: Number(process.env.TAMBASA_MAX_CATEGORIES || 1500),
      });
      selectors = { ...selectors, categoryUrls: discovery.categoryUrls, useStructuredData: true };
      warnings.push(...discovery.warnings.slice(0, 20));
    } catch (error) {
      warnings.push(`Descoberta ampla Tambasa indisponível; usando categorias salvas: ${(error as Error).message}`);
    }
  }

  const loginUrl = selectors.loginUrl ??
    (selectors.categoryUrls[0]
      ? new URL(selectors.categoryUrls[0]).origin + "/login"
      : `https://${scraperType}.com.br/login`);

  const engine = new ScraperEngine();
  const all: CapturedSupplierProduct[] = [];
  let probe: ReturnType<typeof attachNetworkJsonProductProbe> | null = null;
  try {
    await engine.login(loginUrl, email, password, selectors, config.supplierId);
    const page = (engine as unknown as { page: Page | null }).page;
    if (page && capabilities.method === "hybrid") {
      probe = attachNetworkJsonProductProbe(page, allowedHosts(selectors, loginUrl));
    }

    if (mode === "search") {
      const query = input.query?.trim();
      if (!query) throw new Error("Busca sob demanda exige termo, SKU ou EAN.");
      all.push(...browserProducts(await engine.scrapeSearch(query, selectors), selectors));
      if (probe) all.push(...await probe.drain());
    } else if (mode === "refresh" && capabilities.search) {
      const limit = Math.max(1, Math.min(Number(process.env.CAPTURE_REFRESH_LIMIT || 250), 2000));
      const terms = explicitRefreshTerms(input.query);
      const refreshTerms = terms.length ? terms : await buildRefreshTerms(config.supplierId, limit);
      if (refreshTerms.length === 0 && capabilities.fullCatalog) {
        for (const categoryUrl of selectors.categoryUrls) {
          all.push(...browserProducts(await engine.scrapeCategory(categoryUrl, selectors), selectors));
          if (probe) all.push(...await probe.drain());
        }
      } else if (refreshTerms.length === 0) {
        warnings.push("Nenhuma oferta conhecida para atualização incremental; use busca por termo para semear este conector.");
      } else {
        for (const term of refreshTerms.slice(0, limit)) {
          try {
            all.push(...browserProducts(await engine.scrapeSearch(term, selectors), selectors));
            if (probe) all.push(...await probe.drain());
          } catch (error) {
            warnings.push(`Refresh "${term}": ${(error as Error).message}`);
          }
        }
      }
    } else {
      if (!selectors.categoryUrls.length) {
        throw new Error("Conector sem rotas de catálogo para varredura integral.");
      }
      for (const categoryUrl of selectors.categoryUrls) {
        all.push(...browserProducts(await engine.scrapeCategory(categoryUrl, selectors), selectors));
        if (probe) all.push(...await probe.drain());
      }
    }

    if (probe) {
      const remaining: ProbedProduct[] = await probe.stop();
      all.push(...remaining);
      probe = null;
    }
  } finally {
    if (probe) await probe.stop().catch(() => []);
    await engine.close();
  }

  const unique = dedupe(all);
  const apiCount = unique.filter((product) => product.sourceType === "api").length;
  if (capabilities.method === "hybrid" && apiCount > 0) {
    warnings.push(`Conector híbrido aproveitou ${apiCount} produto(s) de respostas JSON internas.`);
  }

  return {
    supplierId: config.supplierId,
    supplierName: supplier.name,
    scraperType,
    mode,
    products: unique,
    expectedItems: mode === "refresh" ? undefined : unique.length,
    warnings,
    capabilities,
  };
}
