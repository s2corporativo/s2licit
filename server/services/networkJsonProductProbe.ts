import type { HTTPResponse, Page } from "puppeteer";
import { parsePrecoBR } from "../utils/number";
import type { ScrapedProduct } from "./scraperEngine";

export type ProbedProduct = ScrapedProduct & { sourceType: "api" };

const NAME_KEYS = ["name", "nome", "title", "titulo", "productname", "product_name", "descricao", "description"];
const PRICE_KEYS = [
  "price", "preco", "preço", "valor", "saleprice", "sale_price", "spot_price",
  "preco_venda", "precovenda", "precofinal", "preco_final", "unitprice", "unit_price",
];
const NORMAL_PRICE_KEYS = ["old_price", "listprice", "list_price", "preco_de", "precode", "regularprice", "regular_price"];
const SKU_KEYS = ["sku", "code", "codigo", "código", "productcode", "product_code", "codproduto", "cod_produto"];
const EAN_KEYS = ["ean", "gtin", "gtin13", "gtin14", "barcode", "codigo_barras", "codigobarras"];
const STOCK_KEYS = ["stock", "estoque", "quantity", "qty", "saldo", "availablequantity", "available_quantity"];
const AVAILABILITY_KEYS = ["availability", "disponibilidade", "stockstatus", "stock_status", "statusestoque"];
const IMAGE_KEYS = ["image", "imageurl", "image_url", "imagem", "foto", "thumbnail", "thumbnailurl"];
const URL_KEYS = ["url", "producturl", "product_url", "link", "href", "permalink"];
const UNIT_KEYS = ["unit", "unidade", "uom", "unitofmeasure", "unit_of_measure"];

function normalizedKey(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_]/g, "");
}

function indexObject(value: Record<string, unknown>): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [key, item] of Object.entries(value)) out.set(normalizedKey(key), item);
  return out;
}

function pick(index: Map<string, unknown>, keys: string[]): unknown {
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

function absoluteUrl(raw: unknown, baseUrl: string): string | undefined {
  const value = text(raw);
  if (!value) return undefined;
  try { return new URL(value, baseUrl).toString(); } catch { return undefined; }
}

function objectToProduct(value: Record<string, unknown>, baseUrl: string): ProbedProduct | null {
  const index = indexObject(value);
  const name = text(pick(index, NAME_KEYS));
  const price = numeric(pick(index, PRICE_KEYS));
  if (!name || name.length < 3 || !price || price <= 0) return null;

  // Reduz falso positivo: além de nome+preço, exige algum sinal típico de
  // catálogo (SKU/EAN/estoque/imagem/url ou chave explicitamente de produto).
  const code = text(pick(index, SKU_KEYS));
  const eanRaw = text(pick(index, EAN_KEYS));
  const stock = numeric(pick(index, STOCK_KEYS));
  const imageUrl = absoluteUrl(pick(index, IMAGE_KEYS), baseUrl);
  const productUrl = absoluteUrl(pick(index, URL_KEYS), baseUrl);
  const hasProductSignal = Boolean(
    code || eanRaw || stock != null || imageUrl || productUrl ||
    [...index.keys()].some((key) => key.includes("product") || key.includes("produto")),
  );
  if (!hasProductSignal) return null;

  const normalPrice = numeric(pick(index, NORMAL_PRICE_KEYS));
  const availability = text(pick(index, AVAILABILITY_KEYS));
  const eanDigits = eanRaw?.replace(/\D/g, "");
  return {
    name,
    price,
    code,
    ean: eanDigits && /^\d{8,14}$/.test(eanDigits) ? eanDigits : undefined,
    unit: text(pick(index, UNIT_KEYS)),
    stock: stock != null ? Math.max(0, Math.trunc(stock)) : undefined,
    availability,
    imageUrl,
    productUrl,
    priceNormal: normalPrice && normalPrice > 0 ? normalPrice : undefined,
    pricePromo: normalPrice && price < normalPrice ? price : undefined,
    consultadoEm: Date.now(),
    fonteUrl: baseUrl,
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
  if (node == null || depth > 9 || state.nodes >= 20_000 || output.length >= 5_000) return;
  state.nodes++;
  if (Array.isArray(node)) {
    for (const item of node) collectProducts(item, baseUrl, output, state, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  const product = objectToProduct(record, baseUrl);
  if (product) output.push(product);
  for (const value of Object.values(record)) {
    if (typeof value === "object" && value !== null) collectProducts(value, baseUrl, output, state, depth + 1);
  }
}

function dedupe(products: ProbedProduct[]): ProbedProduct[] {
  const out = new Map<string, ProbedProduct>();
  for (const product of products) {
    const key = product.ean || product.code || product.productUrl || `${product.name.toLowerCase()}|${product.price}`;
    const previous = out.get(key);
    if (!previous) {
      out.set(key, product);
      continue;
    }
    const previousScore = Number(Boolean(previous.ean)) + Number(Boolean(previous.code)) + Number(previous.stock != null);
    const nextScore = Number(Boolean(product.ean)) + Number(Boolean(product.code)) + Number(product.stock != null);
    if (nextScore > previousScore) out.set(key, product);
  }
  return [...out.values()];
}

export interface NetworkJsonProbe {
  drain(): Promise<ProbedProduct[]>;
  stop(): Promise<ProbedProduct[]>;
}

/**
 * Observa XHR/fetch JSON após o login e transforma listas de produtos em dados
 * estruturados. Não descobre/burla endpoints protegidos: apenas lê respostas
 * que a sessão autenticada já recebeu normalmente no navegador.
 */
export function attachNetworkJsonProductProbe(
  page: Page,
  allowedHosts: Iterable<string>,
): NetworkJsonProbe {
  const hosts = new Set([...allowedHosts].map((host) => host.toLowerCase()));
  let collected: ProbedProduct[] = [];
  const pending = new Set<Promise<void>>();

  const onResponse = (response: HTTPResponse) => {
    const task = (async () => {
      try {
        const url = new URL(response.url());
        if (hosts.size > 0 && !hosts.has(url.hostname.toLowerCase())) return;
        const headers = response.headers();
        const type = String(headers["content-type"] || "").toLowerCase();
        if (!type.includes("json") && !/\/api\/|graphql|catalog|product|produto|search|busca/i.test(url.pathname)) return;
        const declared = Number(headers["content-length"] || 0);
        if (declared > 5 * 1024 * 1024) return;
        const payload = await response.json().catch(() => null);
        if (payload == null) return;
        const found: ProbedProduct[] = [];
        collectProducts(payload, response.url(), found, { nodes: 0 });
        if (found.length) collected.push(...found);
      } catch {
        // Probe é oportunístico. DOM/structured data seguem como fallback.
      }
    })();
    pending.add(task);
    void task.finally(() => pending.delete(task));
  };

  page.on("response", onResponse);

  const flush = async () => {
    if (pending.size) await Promise.allSettled([...pending]);
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
