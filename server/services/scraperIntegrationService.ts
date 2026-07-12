import { getDb } from "../db";
import { supplierCaptureConfigs } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";
import { parsePrecoBR } from "../utils/number";

/**
 * Interface para produto capturado de scraper
 */
export interface ScrapedProduct {
  ean?: string;
  name: string;
  description?: string;
  manufacturer?: string;
  presentation?: string;
  codigoFornecedor?: string;
  price?: number;
  subcategoria?: string;
  imageUrl?: string;
  productUrl?: string;
  activeIngredient?: string;
  concentration?: string;
  unit?: string;
  stock?: string;
  mapa?: string;
  ncm?: string;
  especieAnimal?: string;
  classeTerapeutica?: string;
}

/**
 * Interface para configuração de scraper
 */
export interface ScraperConfig {
  supplierId: number;
  scraperType: "http" | "javascript" | "selenium";
  baseUrl: string;
  catalogUrl?: string;
  loginUrl?: string;
  username?: string;
  password?: string;
  headers?: Record<string, string>;
  selectors?: {
    productList?: string;
    productName?: string;
    productPrice?: string;
    productImage?: string;
    productUrl?: string;
    productEan?: string;
    productManufacturer?: string;
    pagination?: string;
  };
  customScript?: string;
  maxPages?: number;
  delayBetweenRequests?: number;
  timeout?: number;
  retryCount?: number;
  isActive: boolean;
}

/**
 * Executa scraper HTTP simples
 */
export async function executeHttpScraper(
  config: ScraperConfig
): Promise<ScrapedProduct[]> {
  const products: ScrapedProduct[] = [];

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      config.timeout || 30000
    );

    const response = await fetch(config.catalogUrl || config.baseUrl, {
      headers: config.headers || {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();

    // Parse HTML com regex simples (em produção, usar cheerio ou jsdom)
    // Exemplo: extrair produtos de uma tabela ou lista
    const productRegex =
      /<div class="product"[^>]*>[\s\S]*?<\/div>/g;
    const matches = html.match(productRegex) || [];

    for (const match of matches) {
      const product = parseProductFromHtml(match, config);
      if (product) {
        products.push(product);
      }
    }

    return products;
  } catch (error) {
    console.error(`[Scraper] Erro ao executar HTTP scraper:`, error);
    throw error;
  }
}

/**
 * Executa scraper com JavaScript (Puppeteer/Playwright)
 */
export async function executeJavaScriptScraper(
  config: ScraperConfig
): Promise<ScrapedProduct[]> {
  const products: ScrapedProduct[] = [];

  try {
    // TODO: Implementar com Puppeteer ou Playwright
    // Por enquanto, retornar array vazio
    console.log(
      `[Scraper] JavaScript scraper para ${config.baseUrl} (não implementado)`
    );

    return products;
  } catch (error) {
    console.error(`[Scraper] Erro ao executar JavaScript scraper:`, error);
    throw error;
  }
}

/**
 * Executa scraper com Selenium
 */
export async function executeSeleniumScraper(
  config: ScraperConfig
): Promise<ScrapedProduct[]> {
  const products: ScrapedProduct[] = [];

  try {
    // TODO: Implementar com Selenium
    // Por enquanto, retornar array vazio
    console.log(
      `[Scraper] Selenium scraper para ${config.baseUrl} (não implementado)`
    );

    return products;
  } catch (error) {
    console.error(`[Scraper] Erro ao executar Selenium scraper:`, error);
    throw error;
  }
}

/**
 * Parse de produto a partir de HTML
 */
function parseProductFromHtml(
  html: string,
  config: ScraperConfig
): ScrapedProduct | null {
  try {
    const selectors = config.selectors || {};

    // Extrair campos usando regex (simplificado)
    const nameMatch = html.match(/<h2[^>]*>(.*?)<\/h2>/);
    const priceMatch = html.match(/R\$\s*([\d.,]+)/);
    const imageMatch = html.match(/<img[^>]*src="([^"]*)"[^>]*>/);
    const eanMatch = html.match(/EAN:\s*(\d+)/i);
    const manufacturerMatch = html.match(/Fabricante:\s*([^<]+)/i);

    if (!nameMatch) return null;

    return {
      name: nameMatch[1]?.trim() || "",
      price: priceMatch
        ? parsePrecoBR(priceMatch[1]) ?? undefined
        : undefined,
      imageUrl: imageMatch ? imageMatch[1] : undefined,
      ean: eanMatch ? eanMatch[1] : undefined,
      manufacturer: manufacturerMatch ? manufacturerMatch[1].trim() : undefined,
    };
  } catch (error) {
    console.error(`[Scraper] Erro ao fazer parse de produto:`, error);
    return null;
  }
}

/**
 * Executa scraper baseado em tipo
 */
export async function executeScraper(
  config: ScraperConfig
): Promise<ScrapedProduct[]> {
  if (!config.isActive) {
    throw new Error("Scraper não está ativo");
  }

  switch (config.scraperType) {
    case "http":
      return await executeHttpScraper(config);
    case "javascript":
      return await executeJavaScriptScraper(config);
    case "selenium":
      return await executeSeleniumScraper(config);
    default:
      throw new Error(`Tipo de scraper desconhecido: ${config.scraperType}`);
  }
}

/**
 * Obtém configuração de scraper para fornecedor
 */
export async function getScraperConfig(
  supplierId: number
): Promise<ScraperConfig | null> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const config = await db
    .select()
    .from(supplierCaptureConfigs)
    .where(eq(supplierCaptureConfigs.supplierId, supplierId))
    .limit(1);

  if (config.length === 0) return null;

  const cfg = config[0];

  return {
    supplierId,
    scraperType: "http",
    baseUrl: cfg.baseUrl || "",
    catalogUrl: cfg.catalogUrl || undefined,
    loginUrl: cfg.loginUrl || undefined,
    username: undefined,
    password: undefined,
    headers: undefined,
    selectors: {
      productList: cfg.productListSelector || undefined,
      productName: cfg.productNameSelector || undefined,
      productPrice: cfg.productPriceSelector || undefined,
      productImage: cfg.productImageSelector || undefined,

      productManufacturer: cfg.productManufacturerSelector || undefined,
    },
    customScript: undefined,
    maxPages: 10,
    delayBetweenRequests: 1000,
    timeout: 30000,
    retryCount: 3,
    isActive: true,
  };
}

/**
 * Executa scraper para fornecedor e retorna produtos
 */
export async function scrapeSupplierCatalog(
  supplierId: number
): Promise<{
  products: ScrapedProduct[];
  totalScraped: number;
  errors: string[];
}> {
  const config = await getScraperConfig(supplierId);

  if (!config) {
    throw new Error(`Configuração de scraper não encontrada para fornecedor #${supplierId}`);
  }

  const errors: string[] = [];
  let products: ScrapedProduct[] = [];

  // Tentar executar com retry
  for (let attempt = 1; attempt <= (config.retryCount || 3); attempt++) {
    try {
      products = await executeScraper(config);

      if (products.length > 0) {
        console.log(
          `[Scraper] Sucesso na tentativa ${attempt}: ${products.length} produtos capturados`
        );
        break;
      }
    } catch (error) {
      const errorMsg = `Tentativa ${attempt}: ${String(error)}`;
      errors.push(errorMsg);
      console.error(`[Scraper] ${errorMsg}`);

      // Aguardar antes de retry
      if (attempt < (config.retryCount || 3)) {
        await new Promise((resolve) =>
          setTimeout(resolve, 2000 * attempt)
        );
      }
    }
  }

  // Notificar se houve erros
  if (errors.length > 0 && products.length === 0) {
    await notifyOwner({
      title: `Erro ao scraping fornecedor #${supplierId}`,
      content: `Falha após ${config.retryCount} tentativas:\n${errors.join("\n")}`,
    });
  }

  return {
    products,
    totalScraped: products.length,
    errors,
  };
}

/**
 * Valida configuração de scraper
 */
export async function validateScraperConfig(
  config: ScraperConfig
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  if (!config.baseUrl) {
    errors.push("baseUrl é obrigatório");
  }

  if (!config.scraperType) {
    errors.push("scraperType é obrigatório");
  }

  if (config.scraperType === "http" && !config.catalogUrl && !config.baseUrl) {
    errors.push("catalogUrl ou baseUrl é obrigatório para HTTP scraper");
  }

  if (config.timeout && config.timeout < 5000) {
    errors.push("timeout deve ser >= 5000ms");
  }

  if (config.maxPages && config.maxPages < 1) {
    errors.push("maxPages deve ser >= 1");
  }

  // Tentar fazer uma requisição de teste
  if (config.scraperType === "http") {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(config.catalogUrl || config.baseUrl, {
        method: "HEAD",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        errors.push(`URL retornou status ${response.status}`);
      }
    } catch (error) {
      errors.push(`Erro ao conectar à URL: ${String(error)}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Testa scraper com URL de teste
 */
export async function testScraper(
  config: ScraperConfig
): Promise<{
  success: boolean;
  productsFound: number;
  sampleProducts: ScrapedProduct[];
  error?: string;
}> {
  try {
    const validation = await validateScraperConfig(config);

    if (!validation.valid) {
      return {
        success: false,
        productsFound: 0,
        sampleProducts: [],
        error: `Validação falhou: ${validation.errors.join(", ")}`,
      };
    }

    const products = await executeScraper(config);

    return {
      success: true,
      productsFound: products.length,
      sampleProducts: products.slice(0, 5),
    };
  } catch (error) {
    return {
      success: false,
      productsFound: 0,
      sampleProducts: [],
      error: String(error),
    };
  }
}
