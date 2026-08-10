import { JSDOM } from "jsdom";
import { logger } from "../_core/logger";
import { parsePrecoBR } from "../utils/number";
import { safeExternalFetchText } from "../utils/safeExternalFetch";

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

const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
};

function absoluteUrl(value: string | undefined | null, base: string): string | undefined {
  if (!value) return undefined;
  try { return new URL(value, base).toString(); } catch { return undefined; }
}

function findJsonLdProducts(document: Document): any[] {
  const out: any[] = [];
  const walk = (node: any) => {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node !== "object") return;
    const type = node["@type"];
    if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) out.push(node);
    if (Array.isArray(node.itemListElement)) {
      node.itemListElement.forEach((entry: any) => walk(entry?.item ?? entry));
    }
    if (Array.isArray(node["@graph"])) node["@graph"].forEach(walk);
  };
  for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    try { walk(JSON.parse(script.textContent || "null")); } catch { /* JSON-LD inválido: ignora */ }
  }
  return out;
}

export async function discoverCatalogPages(
  baseUrl: string,
  catalogUrl: string,
  maxPages = 50,
  pageSelector?: string,
): Promise<CatalogPage[]> {
  const pages: CatalogPage[] = [];
  const visited = new Set<string>();
  let currentUrl = catalogUrl;
  let pageNumber = 1;

  try {
    while (pageNumber <= Math.max(1, Math.min(maxPages, 500)) && currentUrl) {
      const normalized = new URL(currentUrl, baseUrl).toString();
      if (visited.has(normalized)) break;
      visited.add(normalized);
      const page = await fetchAndParsePage(normalized, pageSelector);
      pages.push({
        url: normalized,
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

export async function fetchAndParsePage(
  url: string,
  pageSelector?: string,
): Promise<{ productLinks: string[]; nextPageUrl?: string; categoryPath?: string[] }> {
  try {
    const response = await safeExternalFetchText(url, {
      headers: DEFAULT_HEADERS,
      timeoutMs: 20_000,
      maxBytes: 8 * 1024 * 1024,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const dom = new JSDOM(response.text, { url: response.url });
    const document = dom.window.document;

    const unique = new Set<string>();
    const productElements = pageSelector
      ? document.querySelectorAll(pageSelector)
      : document.querySelectorAll(
          "a[href*='product'], a[href*='produto'], a[href*='/p/'], a.product-item-link, [itemtype*='Product'] a[href]",
        );
    for (const el of Array.from(productElements)) {
      const href = el.getAttribute("href");
      const absolute = absoluteUrl(href, response.url);
      if (absolute) unique.add(absolute);
    }

    // JSON-LD ItemList é mais resistente a mudanças de CSS.
    for (const product of findJsonLdProducts(document)) {
      const absolute = absoluteUrl(product?.url, response.url);
      if (absolute) unique.add(absolute);
    }

    let nextPageLink: Element | null = document.querySelector(
      'a[rel="next"], a.next, a.pagination-next, .pagination-next a, .pagination__next, .pages-item-next a',
    );
    if (!nextPageLink) {
      nextPageLink = Array.from(document.querySelectorAll("a")).find((a) => {
        const text = (a.textContent ?? "").trim().toLowerCase();
        return ["próxima", "proxima", "next", "próximo", "proximo", "»", ">"].includes(text);
      }) ?? null;
    }
    const nextPageUrl = absoluteUrl(nextPageLink?.getAttribute("href"), response.url);

    const categoryPath = Array.from(
      document.querySelectorAll(".breadcrumb a, .breadcrumbs a, nav[aria-label*='breadcrumb' i] a"),
    )
      .map((element) => element.textContent?.trim())
      .filter((text): text is string => Boolean(text && text.toLowerCase() !== "home"));

    return {
      productLinks: [...unique],
      nextPageUrl,
      categoryPath: categoryPath.length ? categoryPath : undefined,
    };
  } catch (error) {
    logger.error("[catalogDiscoveryService] Erro ao buscar página:", error);
    return { productLinks: [] };
  }
}

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
  },
): Promise<ExtractedProduct> {
  try {
    const response = await safeExternalFetchText(url, {
      headers: DEFAULT_HEADERS,
      timeoutMs: 20_000,
      maxBytes: 8 * 1024 * 1024,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const dom = new JSDOM(response.text, { url: response.url });
    const document = dom.window.document;
    const structured = findJsonLdProducts(document)[0];
    const offers = Array.isArray(structured?.offers) ? structured.offers[0] : structured?.offers;
    const product: ExtractedProduct = { url: response.url, rawData: {} };

    const selectedName = selectors?.nameSelector
      ? document.querySelector(selectors.nameSelector)?.textContent?.trim()
      : undefined;
    product.name = selectedName || structured?.name ||
      document.querySelector("h1, [itemprop='name']")?.textContent?.trim();

    const selectedPrice = selectors?.priceSelector
      ? document.querySelector(selectors.priceSelector)?.textContent?.trim()
      : undefined;
    const structuredPrice = offers?.price ?? offers?.lowPrice;
    product.price = parsePrice(selectedPrice ?? (structuredPrice != null ? String(structuredPrice) : undefined) ??
      document.querySelector("[itemprop='price'], .price, .product-price")?.textContent?.trim());

    const desc = selectors?.descriptionSelector
      ? document.querySelector(selectors.descriptionSelector)?.textContent?.trim()
      : undefined;
    product.description = desc || structured?.description ||
      document.querySelector("[itemprop='description'], .description, .product-description")?.textContent?.trim();

    const selectedImage = selectors?.imageSelector
      ? document.querySelector(selectors.imageSelector)?.getAttribute("src")
      : undefined;
    const structuredImage = Array.isArray(structured?.image) ? structured.image[0] : structured?.image;
    product.imageUrl = absoluteUrl(selectedImage || structuredImage ||
      document.querySelector("[itemprop='image'], .product-image img")?.getAttribute("src"), response.url);

    const skuText = selectors?.skuSelector
      ? document.querySelector(selectors.skuSelector)?.textContent?.trim()
      : undefined;
    product.sku = skuText || structured?.sku || structured?.mpn ||
      document.querySelector("[itemprop='sku'], .sku")?.textContent?.trim();

    const manufacturerText = selectors?.manufacturerSelector
      ? document.querySelector(selectors.manufacturerSelector)?.textContent?.trim()
      : undefined;
    const manufacturerStructured = typeof structured?.manufacturer === "string"
      ? structured.manufacturer
      : structured?.manufacturer?.name;
    product.manufacturer = manufacturerText || manufacturerStructured ||
      document.querySelector("[itemprop='manufacturer'], .manufacturer")?.textContent?.trim();

    product.stockStatus = selectors?.stockSelector
      ? document.querySelector(selectors.stockSelector)?.textContent?.trim()
      : document.querySelector(".stock, .availability")?.textContent?.trim() || offers?.availability;

    const eanText = selectors?.eanSelector
      ? document.querySelector(selectors.eanSelector)?.textContent?.trim()
      : undefined;
    product.ean = eanText || structured?.gtin13 || structured?.gtin14 || structured?.gtin || structured?.ean;

    product.rawData = {
      structuredData: structured ?? null,
      sourceUrl: response.url,
    };

    const fields = [product.name, product.price, product.description, product.imageUrl, product.sku, product.manufacturer, product.ean];
    product.confidence = Math.round((fields.filter((value) => value !== undefined && value !== null && value !== "").length / fields.length) * 100);
    return product;
  } catch (error) {
    logger.error("[catalogDiscoveryService] Erro ao extrair produto:", error);
    return { url, confidence: 0 };
  }
}

export function parsePrice(priceText?: string): number | undefined {
  const result = parsePrecoBR(priceText ?? "");
  return result === null ? undefined : result;
}

export function normalizeProductName(name?: string): string {
  if (!name) return "";
  return name.toLowerCase().trim().replace(/\s+/g, " ").replace(/[^a-z0-9À-ÿ\s-]/g, "");
}

export function detectCategory(name?: string, description?: string): string | undefined {
  const text = `${name || ""} ${description || ""}`.toLowerCase();
  const categories: Record<string, string[]> = {
    Pneumática: ["pneumático", "compressor", "cilindro pneumático"],
    Hidráulica: ["hidráulico", "bomba", "válvula", "atuador hidráulico"],
    Medicamentos: ["comprimido", "cápsula", "injeção", "xarope", "pomada"],
    Veterinária: ["veterinário", "animal", "pet", "cão", "gato"],
  };
  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some((keyword) => text.includes(keyword))) return category;
  }
  return undefined;
}

export function generateContentHash(product: ExtractedProduct): string {
  const content = JSON.stringify({
    name: product.name,
    price: product.price,
    description: product.description,
    sku: product.sku,
    ean: product.ean,
  });
  return require("crypto").createHash("sha256").update(content).digest("hex");
}
