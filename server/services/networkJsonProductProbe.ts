import type { HTTPResponse, Page } from "puppeteer";
import { parsePrecoBR } from "../utils/number";
import type { ScrapedProduct } from "./scraperContracts";

export type ProbedProduct = ScrapedProduct & { sourceType: "api" };

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_JSON_NODES = 20_000;
const MAX_PRODUCTS_PER_RESPONSE = 5_000;
const MAX_DEPTH = 9;

const NAME_KEYS = [
  "name",
  "nome",
  "title",
  "titulo",
  "productname",
  "product_name",
  "descricao",
  "description",
];
const PRICE_KEYS = [
  "price",
  "preco",
  "preço",
  "valor",
  "saleprice",
  "sale_price",
  "spot_price",
  "preco_venda",
  "precovenda",
  "precofinal",
  "preco_final",
  "unitprice",
  "unit_price",
];
const NORMAL_PRICE_KEYS = [
  "old_price",
  "listprice",
  "list_price",
  "preco_de",
  "precode",
  "regularprice",
  "regular_price",
];
const SKU_KEYS = [
  "sku",
  "code",
  "codigo",
  "código",
  "productcode",
  "product_code",
  "codproduto",
  "cod_produto",
];
const EAN_KEYS = [
  "ean",
  "gtin",
  "gtin13",
  "gtin14",
  "barcode",
  "codigo_barras",
  "codigobarras",
];
const STOCK_KEYS = [
  "stock",
  "estoque",
  "quantity",
  "qty",
  "saldo",
  "availablequantity",
  "available_quantity",
];
const AVAILABILITY_KEYS = [
  "availability",
  "disponibilidade",
  "stockstatus",
  "stock_status",
  "statusestoque",
];
const IMAGE_KEYS = [
  "image",
  "imageurl",
  "image_url",
  "imagem",
  "foto",
  "thumbnail",
  "thumbnailurl",
];
const URL_KEYS = [
  "url",
  "producturl",
  "product_url",
  "link",
  "href",
  "permalink",
];
const UNIT_KEYS = [
  "unit",
  "unidade",
  "uom",
  "unitofmeasure",
  "unit_of_measure",
];

const SENSITIVE_QUERY_PARAM =
  /(?:^|_)(?:access|auth|bearer|credential|jwt|key|password|secret|session|signature|sig|token)(?:$|_)/i;

function normalizedKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "");
}

function indexObject(value: Record<string, unknown>): Map<string, unknown> {
  const output = new Map<string, unknown>();
  for (const [key, item] of Object.entries(value)) {
    output.set(normalizedKey(key), item);
  }
  return output;
}

function pick(index: Map<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = index.get(normalizedKey(key));
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function text(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function numeric(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const raw = text(value);
  if (!raw) return undefined;
  const parsed = parsePrecoBR(raw);
  return parsed == null || !Number.isFinite(parsed) ? undefined : parsed;
}

function stockNumber(value: unknown): number | undefined {
  const parsed = numeric(value);
  if (parsed == null || parsed < 0) return undefined;
  return Math.trunc(parsed);
}

function normalizeEan(value: unknown): string | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, "");
  return /^\d{8,14}$/.test(digits) ? digits : undefined;
}

function sanitizeUrl(raw: string, baseUrl?: string): string | undefined {
  try {
    const url = new URL(raw, baseUrl);
    url.username = "";
    url.password = "";
    url.hash = "";

    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_PARAM.test(normalizedKey(key))) {
        url.searchParams.set(key, "REDACTED");
      }
    }

    return url.toString();
  } catch {
    return undefined;
  }
}

function absoluteUrl(raw: unknown, baseUrl: string): string | undefined {
  const value = text(raw);
  if (!value) return undefined;
  return sanitizeUrl(value, baseUrl);
}

function objectToProduct(
  value: Record<string, unknown>,
  baseUrl: string,
): ProbedProduct | null {
  const index = indexObject(value);
  const name = text(pick(index, NAME_KEYS));
  const price = numeric(pick(index, PRICE_KEYS));

  if (!name || name.length < 3 || price == null || price <= 0) return null;

  const code = text(pick(index, SKU_KEYS));
  const ean = normalizeEan(pick(index, EAN_KEYS));
  const stock = stockNumber(pick(index, STOCK_KEYS));
  const imageUrl = absoluteUrl(pick(index, IMAGE_KEYS), baseUrl);
  const productUrl = absoluteUrl(pick(index, URL_KEYS), baseUrl);
  const hasProductSignal = Boolean(
    code ||
      ean ||
      stock != null ||
      imageUrl ||
      productUrl ||
      [...index.keys()].some(
        (key) => key.includes("product") || key.includes("produto"),
      ),
  );

  if (!hasProductSignal) return null;

  const normalPrice = numeric(pick(index, NORMAL_PRICE_KEYS));
  const availability = text(pick(index, AVAILABILITY_KEYS));

  return {
    name,
    price,
    code,
    ean,
    unit: text(pick(index, UNIT_KEYS)),
    stock,
    availability,
    imageUrl,
    productUrl,
    priceNormal: normalPrice != null && normalPrice > 0 ? normalPrice : undefined,
    pricePromo:
      normalPrice != null && normalPrice > 0 && price < normalPrice
        ? price
        : undefined,
    consultadoEm: Date.now(),
    fonteUrl: sanitizeUrl(baseUrl),
    sourceType: "api",
  };
}

function collectProducts(
  node: unknown,
  baseUrl: string,
  output: ProbedProduct[],
  state: { nodes: number },
  depth = 0,
): void {
  if (
    node == null ||
    depth > MAX_DEPTH ||
    state.nodes >= MAX_JSON_NODES ||
    output.length >= MAX_PRODUCTS_PER_RESPONSE
  ) {
    return;
  }

  state.nodes += 1;

  if (Array.isArray(node)) {
    for (const item of node) {
      collectProducts(item, baseUrl, output, state, depth + 1);
      if (output.length >= MAX_PRODUCTS_PER_RESPONSE) break;
    }
    return;
  }

  if (typeof node !== "object") return;

  const record = node as Record<string, unknown>;
  const product = objectToProduct(record, baseUrl);
  if (product) output.push(product);

  for (const child of Object.values(record)) {
    if (typeof child !== "object" || child === null) continue;
    collectProducts(child, baseUrl, output, state, depth + 1);
    if (output.length >= MAX_PRODUCTS_PER_RESPONSE) break;
  }
}

function productIdentity(product: ProbedProduct): string {
  if (product.ean) return `ean:${product.ean}`;
  if (product.code?.trim()) return `sku:${product.code.trim().toUpperCase()}`;
  if (product.productUrl) return `url:${product.productUrl}`;
  return `name:${product.name.trim().toLowerCase()}|price:${product.price}`;
}

function richness(product: ProbedProduct): number {
  return (
    Number(Boolean(product.ean)) * 4 +
    Number(Boolean(product.code)) * 3 +
    Number(product.stock != null) * 2 +
    Number(Boolean(product.productUrl)) +
    Number(Boolean(product.imageUrl)) +
    Number(Boolean(product.unit)) +
    Number(product.priceNormal != null) +
    Number(product.pricePromo != null)
  );
}

function mergeProduct(
  preferred: ProbedProduct,
  fallback: ProbedProduct,
): ProbedProduct {
  return {
    ...fallback,
    ...preferred,
    code: preferred.code ?? fallback.code,
    ean: preferred.ean ?? fallback.ean,
    unit: preferred.unit ?? fallback.unit,
    stock: preferred.stock ?? fallback.stock,
    availability: preferred.availability ?? fallback.availability,
    imageUrl: preferred.imageUrl ?? fallback.imageUrl,
    productUrl: preferred.productUrl ?? fallback.productUrl,
    priceNormal: preferred.priceNormal ?? fallback.priceNormal,
    pricePromo: preferred.pricePromo ?? fallback.pricePromo,
    consultadoEm:
      Math.max(preferred.consultadoEm ?? 0, fallback.consultadoEm ?? 0) ||
      undefined,
    fonteUrl: preferred.fonteUrl ?? fallback.fonteUrl,
    sourceType: "api",
  };
}

function dedupe(products: ProbedProduct[]): ProbedProduct[] {
  const output = new Map<string, ProbedProduct>();

  for (const product of products) {
    const key = productIdentity(product);
    const previous = output.get(key);
    if (!previous) {
      output.set(key, product);
      continue;
    }

    const preferred = richness(product) > richness(previous) ? product : previous;
    const fallback = preferred === product ? previous : product;
    output.set(key, mergeProduct(preferred, fallback));
  }

  return [...output.values()];
}

function isAllowedResponse(
  response: HTTPResponse,
  allowedHosts: Set<string>,
): boolean {
  const status = response.status();
  if (status < 200 || status >= 300) return false;

  const resourceType = response.request().resourceType();
  if (resourceType !== "xhr" && resourceType !== "fetch") return false;

  let url: URL;
  try {
    url = new URL(response.url());
  } catch {
    return false;
  }

  if (allowedHosts.size > 0 && !allowedHosts.has(url.hostname.toLowerCase())) {
    return false;
  }

  const headers = response.headers();
  const contentType = String(headers["content-type"] || "").toLowerCase();
  const pathLooksStructured =
    /\/api\/|graphql|catalog|product|produto|search|busca/i.test(url.pathname);

  if (!contentType.includes("json") && !pathLooksStructured) return false;

  const declaredLength = Number(headers["content-length"] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    return false;
  }

  return true;
}

async function parseBoundedJsonResponse(
  response: HTTPResponse,
): Promise<unknown | null> {
  try {
    const textBody = await response.text();
    if (Buffer.byteLength(textBody, "utf8") > MAX_RESPONSE_BYTES) return null;
    if (!textBody.trim()) return null;
    return JSON.parse(textBody) as unknown;
  } catch {
    return null;
  }
}

export interface NetworkJsonProbe {
  drain(): Promise<ProbedProduct[]>;
  stop(): Promise<ProbedProduct[]>;
}

/**
 * Observa somente respostas XHR/fetch que a sessão autenticada já recebeu.
 * Não cria requests, não descobre endpoints e não contorna autenticação.
 */
export function attachNetworkJsonProductProbe(
  page: Page,
  allowedHosts: Iterable<string>,
): NetworkJsonProbe {
  const hosts = new Set(
    [...allowedHosts]
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );

  let collected: ProbedProduct[] = [];
  const pending = new Set<Promise<void>>();

  const onResponse = (response: HTTPResponse): void => {
    if (!isAllowedResponse(response, hosts)) return;

    const task = (async () => {
      const payload = await parseBoundedJsonResponse(response);
      if (payload == null) return;

      const found: ProbedProduct[] = [];
      const sourceUrl = sanitizeUrl(response.url());
      if (!sourceUrl) return;
      collectProducts(payload, sourceUrl, found, { nodes: 0 });
      if (found.length > 0) collected.push(...found);
    })();

    pending.add(task);
    void task.finally(() => pending.delete(task));
  };

  page.on("response", onResponse);

  const flush = async (): Promise<ProbedProduct[]> => {
    while (pending.size > 0) {
      await Promise.allSettled([...pending]);
    }

    const result = dedupe(collected);
    collected = [];
    return result;
  };

  return {
    drain: flush,
    async stop() {
      page.off("response", onResponse);
      return flush();
    },
  };
}
