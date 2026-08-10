import { and, asc, eq, isNotNull, or } from "drizzle-orm";
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

export interface CaptureAdapterInput {
  scraperConfigId: number;
  mode: "search" | "refresh" | "full";
  query?: string | null;
}

export interface CaptureAdapterResult {
  supplierId: number;
  supplierName: string;
  scraperType: string;
  mode: "search" | "refresh" | "full";
  products: Array<ScrapedProduct & { sourceType: "browser" | "structured" }>;
  expectedItems?: number;
  warnings: string[];
  capabilities: ReturnType<typeof getConnectorCapabilities>;
}

async function loadConfig(scraperConfigId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const [config] = await db
    .select()
    .from(scraperConfigs)
    .where(eq(scraperConfigs.id, scraperConfigId))
    .limit(1);
  if (!config) throw new Error(`Configuração de scraper #${scraperConfigId} não encontrada.`);
  if (!config.tosAprovado) {
    throw new Error("Captura bloqueada: os termos de uso do fornecedor ainda não foram aprovados.");
  }

  const [supplier] = await db
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(eq(suppliers.id, config.supplierId))
    .limit(1);
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

  return { db, config, supplier, scraperType, selectors, email, password };
}

function dedupe(productsIn: ScrapedProduct[]): ScrapedProduct[] {
  const out = new Map<string, ScrapedProduct>();
  for (const product of productsIn) {
    const key =
      (product.ean && `ean:${product.ean}`) ||
      (product.code && `sku:${product.code}`) ||
      (product.productUrl && `url:${product.productUrl}`) ||
      `name:${normalizeText(product.name)}`;
    const previous = out.get(key);
    if (!previous) {
      out.set(key, product);
      continue;
    }
    // Em duplicidade entre categoria/oferta, preserva a observação mais rica.
    const prevScore = Number(Boolean(previous.ean)) + Number(Boolean(previous.code)) + Number(Boolean(previous.stock != null));
    const nextScore = Number(Boolean(product.ean)) + Number(Boolean(product.code)) + Number(Boolean(product.stock != null));
    if (nextScore > prevScore) out.set(key, product);
  }
  return [...out.values()];
}

async function buildRefreshTerms(
  supplierId: number,
  limit: number,
): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      supplierCode: productSupplierOffers.supplierCode,
      productName: products.name,
    })
    .from(productSupplierOffers)
    .innerJoin(products, eq(productSupplierOffers.productId, products.id))
    .where(
      and(
        eq(productSupplierOffers.supplierId, supplierId),
        or(isNotNull(productSupplierOffers.supplierCode), isNotNull(products.name)),
      ),
    )
    .orderBy(asc(productSupplierOffers.updatedAt))
    .limit(limit);

  return Array.from(
    new Set(rows.map((row) => (row.supplierCode || row.productName || "").trim()).filter(Boolean)),
  );
}

/**
 * Captura dados do fornecedor SEM gravar produtos/ofertas.
 *
 * Esta função é a fronteira entre o scraper legado e o novo Capture Core. O
 * motor antigo continua responsável por login/navegação, mas toda decisão de
 * matching, qualidade e persistência passa a ocorrer depois, sobre observações.
 */
export async function captureSupplierProducts(input: CaptureAdapterInput): Promise<CaptureAdapterResult> {
  const loaded = await loadConfig(input.scraperConfigId);
  const { config, supplier, scraperType, email, password } = loaded;
  let selectors: SelectorConfig = { ...loaded.selectors, categoryUrls: [...loaded.selectors.categoryUrls] };
  const capabilities = getConnectorCapabilities(scraperType, selectors);
  const mode = chooseCaptureMode(input.mode, capabilities, input.query);
  const warnings: string[] = [];

  // Tambasa: reaproveita a descoberta robusta existente, mas não persiste os
  // seletores descobertos. A captura e a decisão de aplicação ficam no Core.
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

  const loginUrl =
    selectors.loginUrl ??
    (selectors.categoryUrls[0]
      ? new URL(selectors.categoryUrls[0]).origin + "/login"
      : `https://${scraperType}.com.br/login`);

  const engine = new ScraperEngine();
  const all: ScrapedProduct[] = [];
  try {
    await engine.login(loginUrl, email, password, selectors, config.supplierId);

    if (mode === "search") {
      const query = input.query?.trim();
      if (!query) throw new Error("Busca sob demanda exige termo, SKU ou EAN.");
      all.push(...await engine.scrapeSearch(query, selectors));
    } else if (mode === "refresh" && capabilities.search) {
      const limit = Math.max(1, Math.min(Number(process.env.CAPTURE_REFRESH_LIMIT || 250), 2000));
      const terms = await buildRefreshTerms(config.supplierId, limit);
      if (terms.length === 0 && capabilities.fullCatalog) {
        for (const categoryUrl of selectors.categoryUrls) {
          all.push(...await engine.scrapeCategory(categoryUrl, selectors));
        }
      } else {
        for (const term of terms) {
          try {
            all.push(...await engine.scrapeSearch(term, selectors));
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
        all.push(...await engine.scrapeCategory(categoryUrl, selectors));
      }
    }
  } finally {
    await engine.close();
  }

  const unique = dedupe(all);
  return {
    supplierId: config.supplierId,
    supplierName: supplier.name,
    scraperType,
    mode,
    products: unique.map((product) => ({
      ...product,
      sourceType: selectors.useStructuredData ? "structured" : "browser",
    })),
    expectedItems: mode === "refresh" ? undefined : unique.length,
    warnings,
    capabilities,
  };
}
