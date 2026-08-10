export interface SelectorConfig {
  loginUrl?: string;
  loginTrigger?: string;
  loginEmail: string;
  loginPassword: string;
  loginSubmit: string;
  loginSuccessUrl?: string;
  loginSuccessText?: string;
  loginSuccessSelector?: string;
  useStructuredData?: boolean;
  categoryUrls: string[];
  searchUrlTemplate?: string;
  productItem: string;
  productName: string;
  productPrice: string;
  productCode?: string;
  productEan?: string;
  productImage?: string;
  productLink?: string;
  nextPage?: string;
  waitForSelector?: string;
  navigationWait?: number;
}

export interface ScrapedProduct {
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
  consultadoEm?: number;
  fonteUrl?: string;
}

export interface ScraperRunResult {
  success: boolean;
  supplierId: number;
  supplierName: string;
  productsScraped: number;
  productsMatched: number;
  productsUpdated: number;
  productsNew: number;
  errors: string[];
  durationMs: number;
  log: string[];
}

export function buildSearchUrl(template: string, term: string): string {
  const normalizedTerm = term.trim();
  if (!normalizedTerm) throw new Error("Termo de busca vazio.");

  const encoded = encodeURIComponent(normalizedTerm);
  if (/\{q\}|\{termo\}/i.test(template)) {
    return template
      .replace(/\{q\}/gi, encoded)
      .replace(/\{termo\}/gi, encoded);
  }

  const separator = template.includes("?") ? "&" : "?";
  return `${template}${separator}q=${encoded}`;
}
