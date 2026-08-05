import { JSDOM } from "jsdom";
import { logger } from "../_core/logger";
import { parsePrecoBR } from "../utils/number";

export interface CatalogPage {
  url: string;
  pageNumber: number;
  productLinks: string[];
  nextPageUrl?: string;
  categoryPath?: string[];
}

export interface ExtractedProduct {
  name?: string;
  description?: string;
  price?: number;
  promotionalPrice?: number;
  sku?: string;
  manufacturer?: string;
  imageUrl?: string;
  imageUrls?: string[];
  stockStatus?: string;
  url?: string;
  ean?: string;
  category?: string;
  rawData?: Record<string, any>;
  confidence?: number;
}

/**
 * Descobre páginas de catálogo usando navegação
 */
export async function discoverCatalogPages(
  baseUrl: string,
  catalogUrl: string,
  maxPages: number = 50,
  pageSelector?: string
): Promise<CatalogPage[]> {
  const pages: CatalogPage[] = [];
  let currentUrl = catalogUrl;
  let pageNumber = 1;

  try {
    while (pageNumber <= maxPages && currentUrl) {
      const page = await fetchAndParsePage(currentUrl, pageSelector);
      pages.push({
        url: currentUrl,
        pageNumber,
        productLinks: page.productLinks,
        nextPageUrl: page.nextPageUrl,
        categoryPath: page.categoryPath,
      });

      if (!page.nextPageUrl) break;
      currentUrl = page.nextPageUrl;
      pageNumber++;
    }
  } catch (error) {
    logger.error("[catalogDiscoveryService] Erro ao descobrir páginas:", error);
  }

  return pages;
}

/**
 * Busca e parseia uma página de catálogo
 */
export async function fetchAndParsePage(
  url: string,
  pageSelector?: string
): Promise<{
  productLinks: string[];
  nextPageUrl?: string;
  categoryPath?: string[];
}> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Extrair links de produtos
    const productLinks: string[] = [];
    const productElements = pageSelector
      ? document.querySelectorAll(pageSelector)
      : document.querySelectorAll("a[href*='product'], a[href*='item']");

    for (const el of Array.from(productElements)) {
      const href = el.getAttribute("href");
      if (href) {
        const absoluteUrl = new URL(href, url).toString();
        if (!productLinks.includes(absoluteUrl)) {
          productLinks.push(absoluteUrl);
        }
      }
    }

    // Detectar próxima página. `:contains()` é seletor do jQuery/Sizzle, NÃO é
    // CSS válido — o querySelector do jsdom lançava SyntaxError e derrubava toda
    // a página (descartando até os links já coletados). Usamos CSS válido e,
    // como fallback, varremos as âncoras por texto ("próxima"/"next").
    let nextPageUrl: string | undefined;
    let nextPageLink: Element | null = document.querySelector(
      'a[rel="next"], a.next, a.pagination-next, .pagination-next a, .pagination__next',
    );
    if (!nextPageLink) {
      const anchors = Array.from(document.querySelectorAll("a"));
      nextPageLink = anchors.find((a) => {
        const t = (a.textContent ?? "").trim().toLowerCase();
        return t === "próxima" || t === "proxima" || t === "next" || t === "próximo" || t === "»";
      }) ?? null;
    }
    if (nextPageLink) {
      const href = nextPageLink.getAttribute("href");
      if (href) {
        nextPageUrl = new URL(href, url).toString();
      }
    }

    // Extrair caminho de categoria (breadcrumb)
    const categoryPath: string[] = [];
    const breadcrumbs = document.querySelectorAll(
      ".breadcrumb a, .breadcrumbs a, nav a"
    );
    for (const bc of Array.from(breadcrumbs)) {
      const text = bc.textContent?.trim();
      if (text && text !== "Home") {
        categoryPath.push(text);
      }
    }

    return {
      productLinks,
      nextPageUrl,
      categoryPath: categoryPath.length > 0 ? categoryPath : undefined,
    };
  } catch (error) {
    logger.error("[catalogDiscoveryService] Erro ao buscar página:", error);
    return {
      productLinks: [],
    };
  }
}

/**
 * Extrai dados estruturados de uma página de produto
 */
export async function extractProductData(
  url: string,
  selectors?: {
    nameSelector?: string;
    priceSelector?: string;
    descriptionSelector?: string;
    imageSelector?: string;
    skuSelector?: string;
    manufacturerSelector?: string;
    stockSelector?: string;
    eanSelector?: string;
  }
): Promise<ExtractedProduct> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const product: ExtractedProduct = {
      url,
      rawData: {},
    };

    // Nome
    if (selectors?.nameSelector) {
      const nameEl = document.querySelector(selectors.nameSelector);
      product.name = nameEl?.textContent?.trim();
    } else {
      const nameEl =
        document.querySelector("h1") ||
        document.querySelector("[itemprop='name']");
      product.name = nameEl?.textContent?.trim();
    }

    // Preço
    if (selectors?.priceSelector) {
      const priceEl = document.querySelector(selectors.priceSelector);
      const priceText = priceEl?.textContent?.trim();
      product.price = parsePrice(priceText);
    } else {
      const priceEl = document.querySelector(
        "[itemprop='price'], .price, .product-price"
      );
      const priceText = priceEl?.textContent?.trim();
      product.price = parsePrice(priceText);
    }

    // Descrição
    if (selectors?.descriptionSelector) {
      const descEl = document.querySelector(selectors.descriptionSelector);
      product.description = descEl?.textContent?.trim();
    } else {
      const descEl = document.querySelector(
        "[itemprop='description'], .description, .product-description"
      );
      product.description = descEl?.textContent?.trim();
    }

    // Imagem
    if (selectors?.imageSelector) {
      const imgEl = document.querySelector(selectors.imageSelector);
      const src = imgEl?.getAttribute("src");
      if (src) {
        product.imageUrl = new URL(src, url).toString();
      }
    } else {
      const imgEl = document.querySelector(
        "[itemprop='image'], .product-image img"
      );
      const src = imgEl?.getAttribute("src");
      if (src) {
        product.imageUrl = new URL(src, url).toString();
      }
    }

    // SKU
    if (selectors?.skuSelector) {
      const skuEl = document.querySelector(selectors.skuSelector);
      product.sku = skuEl?.textContent?.trim();
    } else {
      const skuEl = document.querySelector("[itemprop='sku'], .sku");
      product.sku = skuEl?.textContent?.trim();
    }

    // Fabricante
    if (selectors?.manufacturerSelector) {
      const mfgEl = document.querySelector(selectors.manufacturerSelector);
      product.manufacturer = mfgEl?.textContent?.trim();
    } else {
      const mfgEl = document.querySelector(
        "[itemprop='manufacturer'], .manufacturer"
      );
      product.manufacturer = mfgEl?.textContent?.trim();
    }

    // Estoque
    if (selectors?.stockSelector) {
      const stockEl = document.querySelector(selectors.stockSelector);
      product.stockStatus = stockEl?.textContent?.trim();
    } else {
      const stockEl = document.querySelector(".stock, .availability");
      product.stockStatus = stockEl?.textContent?.trim();
    }

    // EAN
    if (selectors?.eanSelector) {
      const eanEl = document.querySelector(selectors.eanSelector);
      product.ean = eanEl?.textContent?.trim();
    }

    // Calcular confiança
    const fieldsFound = Object.values(product).filter(
      (v) => v && v !== url && typeof v === "string" && v.length > 0
    ).length;
    product.confidence = Math.min(100, (fieldsFound / 7) * 100);

    return product;
  } catch (error) {
    logger.error("[catalogDiscoveryService] Erro ao extrair produto:", error);
    return {
      url,
      confidence: 0,
    };
  }
}

/**
 * Normaliza e limpa preço extraído
 */
export function parsePrice(priceText?: string): number | undefined {
  const result = parsePrecoBR(priceText ?? "");
  return result === null ? undefined : result;
}

/**
 * Normaliza nome do produto
 */
export function normalizeProductName(name?: string): string {
  if (!name) return "";

  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9À-ÿ\s-]/g, "");
}


/**
 * Detecta categoria por padrões
 */
export function detectCategory(
  name?: string,
  description?: string
): string | undefined {
  const text = `${name || ""} ${description || ""}`.toLowerCase();

  const categories: Record<string, string[]> = {
    Pneumática: ["pneumático", "compressor", "cilindro pneumático"],
    Hidráulica: ["hidráulico", "bomba", "válvula", "atuador hidráulico"],
    Medicamentos: ["comprimido", "cápsula", "injeção", "xarope", "pomada"],
    Veterinária: ["veterinário", "animal", "pet", "cão", "gato"],
  };

  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some((kw) => text.includes(kw))) {
      return category;
    }
  }

  return undefined;
}

/**
 * Gera hash de conteúdo para detectar mudanças
 */
export function generateContentHash(product: ExtractedProduct): string {
  const content = JSON.stringify({
    name: product.name,
    price: product.price,
    description: product.description,
    sku: product.sku,
    ean: product.ean,
  });

  return require("crypto")
    .createHash("sha256")
    .update(content)
    .digest("hex");
}
