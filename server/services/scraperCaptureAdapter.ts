import { asc, and, eq } from "drizzle-orm";
import type { Page } from "puppeteer";
import { z } from "zod";
import { getDb } from "../db";
import {
  productSupplierOffers,
  products,
  scraperConfigs,
  suppliers,
} from "../../drizzle/schema";
import { decryptPassword } from "../utils/encryption";
import { normalizeText } from "../matching/productMatcher";
import { assertSafeExternalUrl } from "../utils/urlGuard";
import {
  FORNECEDOR_CONFIGS,
  ScraperEngine,
  type ScrapedProduct,
  type SelectorConfig,
} from "./scraperEngine";
import { discoverTambasaCategories } from "./tambasaCatalogService";
import {
  chooseCaptureMode,
  getConnectorCapabilities,
} from "./captureConnectorCapabilities";
import {
  attachNetworkJsonProductProbe,
  type NetworkJsonProbe,
  type ProbedProduct,
} from "./networkJsonProductProbe";
import { normalizeCaptureEan } from "./captureCoreService";

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

const selectorConfigSchema = z.object({
  loginUrl: z.string().trim().min(1).optional(),
  loginTrigger: z.string().trim().min(1).optional(),
  loginEmail: z.string().trim().min(1),
  loginPassword: z.string().trim().min(1),
  loginSubmit: z.string().trim().min(1),
  loginSuccessUrl: z.string().trim().min(1).optional(),
  loginSuccessText: z.string().trim().min(1).optional(),
  loginSuccessSelector: z.string().trim().min(1).optional(),
  useStructuredData: z.boolean().optional(),
  categoryUrls: z.array(z.string().trim().min(1)).max(5_000),
  searchUrlTemplate: z.string().trim().min(1).optional(),
  productItem: z.string().trim().min(1),
  productName: z.string().trim().min(1),
  productPrice: z.string().trim().min(1),
  productCode: z.string().trim().min(1).optional(),
  productEan: z.string().trim().min(1).optional(),
  productImage: z.string().trim().min(1).optional(),
  productLink: z.string().trim().min(1).optional(),
  nextPage: z.string().trim().min(1).optional(),
  waitForSelector: z.string().trim().min(1).optional(),
  navigationWait: z.number().int().min(0).max(60_000).optional(),
}).passthrough();

function readBoundedIntegerEnv(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = process.env[name];
  if (!raw?.trim()) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? Math.max(min, Math.min(value, max)) : fallback;
}

function normalizeConfiguredUrl(raw: string, context: string): string {
  const probeUrl = raw.replace(/\{q\}|\{termo\}/gi, "capture-probe");
  const url = assertSafeExternalUrl(probeUrl, context);
  if (url.username || url.password) {
    throw new Error(`${context} não pode conter credenciais embutidas na URL.`);
  }
  return raw.trim();
}

function normalizeSelectorUrls(selectors: SelectorConfig): SelectorConfig {
  const categoryUrls = Array.from(new Set(
    selectors.categoryUrls.map((url, index) =>
      normalizeConfiguredUrl(url, `URL de categoria #${index + 1}`),
    ),
  ));

  return {
    ...selectors,
    categoryUrls,
    loginUrl: selectors.loginUrl
      ? normalizeConfiguredUrl(selectors.loginUrl, "URL de login")
      : undefined,
    searchUrlTemplate: selectors.searchUrlTemplate
      ? normalizeConfiguredUrl(selectors.searchUrlTemplate, "Template de busca")
      : undefined,
  };
}

function resolveSelectorConfig(
  scraperType: string,
  customSelectors: unknown,
): SelectorConfig {
  const preset = FORNECEDOR_CONFIGS[scraperType];
  const hasCustom = customSelectors != null;

  if (!preset && !hasCustom) {
    throw new Error(
      `Tipo de scraper "${scraperType}" não possui preset nem configuração personalizada.`,
    );
  }

  let candidate: unknown = preset;
  if (hasCustom) {
    if (
      typeof customSelectors !== "object" ||
      customSelectors === null ||
      Array.isArray(customSelectors)
    ) {
      throw new Error("Seletores personalizados possuem formato inválido.");
    }

    const custom = customSelectors as Record<string, unknown>;
    candidate = preset
      ? {
          ...preset,
          ...custom,
          categoryUrls: Array.isArray(custom.categoryUrls)
            ? custom.categoryUrls
            : preset.categoryUrls,
        }
      : custom;
  }

  const parsed = selectorConfigSchema.safeParse(candidate);
  if (!parsed.success) {
    const details = parsed.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Configuração do conector inválida: ${details}`);
  }

  return normalizeSelectorUrls(parsed.data as SelectorConfig);
}

function resolveLoginIdentifier(raw: string | null | undefined): string {
  const value = raw?.trim();
  if (!value) return "";

  // Instalações antigas podem ter armazenado o identificador criptografado.
  // Se não for ciphertext válido, preserva o usuário/CNPJ/e-mail em texto.
  try {
    const decrypted = decryptPassword(value).trim();
    return decrypted || value;
  } catch {
    return value;
  }
}

function decryptRequiredPassword(raw: string | null | undefined): string {
  if (!raw) throw new Error("Senha do fornecedor não configurada.");
  try {
    const password = decryptPassword(raw).trim();
    if (!password) throw new Error("Senha vazia após descriptografia.");
    return password;
  } catch {
    throw new Error("Falha ao descriptografar a senha do fornecedor.");
  }
}

async function loadConfig(scraperConfigId: number) {
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
    throw new Error("Captura bloqueada: configuração de fornecedor desativada.");
  }
  if (!config.tosAprovado) {
    throw new Error(
      "Captura bloqueada: os termos de uso do fornecedor ainda não foram aprovados.",
    );
  }

  const [supplier] = await db
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(eq(suppliers.id, config.supplierId))
    .limit(1);

  if (!supplier) throw new Error(`Fornecedor #${config.supplierId} não encontrado.`);

  const scraperType = config.scraperType.trim().toLowerCase();
  if (!scraperType) throw new Error("Tipo de scraper não configurado.");

  const selectors = resolveSelectorConfig(scraperType, config.customSelectors);
  const loginIdentifier = resolveLoginIdentifier(config.email);
  const password = decryptRequiredPassword(config.passwordHash);

  if (!loginIdentifier) {
    throw new Error("Usuário/e-mail do fornecedor não configurado.");
  }

  return {
    config,
    supplier,
    scraperType,
    selectors,
    loginIdentifier,
    password,
  };
}

function sourcePriority(sourceType: CapturedSupplierProduct["sourceType"]): number {
  if (sourceType === "api") return 3;
  if (sourceType === "structured") return 2;
  return 1;
}

function richness(product: CapturedSupplierProduct): number {
  return (
    Number(Boolean(normalizeCaptureEan(product.ean))) * 4 +
    Number(Boolean(product.code?.trim())) * 3 +
    Number(product.stock != null) * 2 +
    Number(Boolean(product.unit?.trim())) +
    Number(Boolean(product.imageUrl)) +
    Number(Boolean(product.productUrl)) +
    Number(product.priceNormal != null) +
    Number(product.pricePromo != null)
  );
}

function canonicalUrl(raw?: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    url.hash = "";
    return url.toString();
  } catch {
    return raw.trim() || null;
  }
}

function productIdentityKey(product: CapturedSupplierProduct): string {
  const ean = normalizeCaptureEan(product.ean);
  if (ean) return `ean:${ean}`;

  const code = product.code?.trim().toUpperCase();
  if (code) return `sku:${code}`;

  const url = canonicalUrl(product.productUrl);
  if (url) return `url:${url}`;

  return `name:${normalizeText(product.name)}|price:${product.price}`;
}

function choosePreferredProduct(
  current: CapturedSupplierProduct,
  candidate: CapturedSupplierProduct,
): CapturedSupplierProduct {
  const sourceDelta = sourcePriority(candidate.sourceType) - sourcePriority(current.sourceType);
  if (sourceDelta > 0) return candidate;
  if (sourceDelta < 0) return current;
  return richness(candidate) > richness(current) ? candidate : current;
}

function mergeProductEvidence(
  preferred: CapturedSupplierProduct,
  fallback: CapturedSupplierProduct,
): CapturedSupplierProduct {
  return {
    ...fallback,
    ...preferred,
    name: preferred.name || fallback.name,
    code: preferred.code ?? fallback.code,
    ean: normalizeCaptureEan(preferred.ean) ?? normalizeCaptureEan(fallback.ean) ?? undefined,
    unit: preferred.unit ?? fallback.unit,
    stock: preferred.stock ?? fallback.stock,
    availability: preferred.availability ?? fallback.availability,
    imageUrl: preferred.imageUrl ?? fallback.imageUrl,
    productUrl: preferred.productUrl ?? fallback.productUrl,
    priceNormal: preferred.priceNormal ?? fallback.priceNormal,
    pricePromo: preferred.pricePromo ?? fallback.pricePromo,
    consultadoEm: Math.max(preferred.consultadoEm ?? 0, fallback.consultadoEm ?? 0) || undefined,
    fonteUrl: preferred.fonteUrl ?? fallback.fonteUrl,
    sourceType: preferred.sourceType,
  };
}

function dedupeProducts(productsIn: CapturedSupplierProduct[]): {
  products: CapturedSupplierProduct[];
  warnings: string[];
} {
  const byIdentity = new Map<string, CapturedSupplierProduct>();
  const warnings: string[] = [];

  for (const product of productsIn) {
    const key = productIdentityKey(product);
    const previous = byIdentity.get(key);
    if (!previous) {
      byIdentity.set(key, product);
      continue;
    }

    if (
      Number.isFinite(previous.price) &&
      Number.isFinite(product.price) &&
      Math.abs(previous.price - product.price) > 0.01 &&
      warnings.length < 30
    ) {
      warnings.push(
        `Conflito de preço para ${key}: ${previous.price} (${previous.sourceType}) vs ` +
          `${product.price} (${product.sourceType}); fonte mais confiável priorizada.`,
      );
    }

    const preferred = choosePreferredProduct(previous, product);
    const fallback = preferred === previous ? product : previous;
    byIdentity.set(key, mergeProductEvidence(preferred, fallback));
  }

  return { products: [...byIdentity.values()], warnings };
}

async function buildRefreshTerms(supplierId: number, limit: number): Promise<string[]> {
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
        eq(products.isActive, "yes"),
      ),
    )
    .orderBy(asc(productSupplierOffers.updatedAt))
    .limit(limit);

  const unique = new Set<string>();
  for (const row of rows) {
    const term = (row.supplierCode || row.productName || "").trim();
    if (term) unique.add(term);
  }
  return [...unique];
}

function explicitRefreshTerms(query?: string | null): string[] {
  if (!query?.trim()) return [];

  const unique = new Set<string>();
  for (const raw of query.split(/\r?\n/)) {
    const term = raw.trim();
    if (term) unique.add(term);
    if (unique.size >= 500) break;
  }
  return [...unique];
}

function resolveLoginUrl(selectors: SelectorConfig): string {
  if (selectors.loginUrl) return selectors.loginUrl;

  const source = selectors.categoryUrls[0] ?? selectors.searchUrlTemplate;
  if (!source) {
    throw new Error(
      "Conector sem URL de login e sem URL de catálogo/busca para derivar a origem.",
    );
  }

  const probe = source.replace(/\{q\}|\{termo\}/gi, "capture-probe");
  const origin = assertSafeExternalUrl(probe, "URL base do conector").origin;
  return `${origin}/login`;
}

function allowedHosts(selectors: SelectorConfig, loginUrl: string): Set<string> {
  const hosts = new Set<string>();
  const urls = [loginUrl, selectors.searchUrlTemplate, ...selectors.categoryUrls];

  for (const raw of urls) {
    if (!raw) continue;
    try {
      const probe = raw.replace(/\{q\}|\{termo\}/gi, "capture-probe");
      hosts.add(assertSafeExternalUrl(probe, "URL do conector").hostname.toLowerCase());
    } catch {
      // A configuração já foi validada em loadConfig. Mantemos esta função
      // defensiva para não ampliar hosts em caso de mutação inesperada.
    }
  }

  return hosts;
}

function browserProducts(
  items: ScrapedProduct[],
  selectors: SelectorConfig,
): CapturedSupplierProduct[] {
  const sourceType: CapturedSupplierProduct["sourceType"] = selectors.useStructuredData
    ? "structured"
    : "browser";

  return items.map((product) => ({ ...product, sourceType }));
}

async function drainProbe(
  probe: NetworkJsonProbe | null,
  target: CapturedSupplierProduct[],
): Promise<void> {
  if (!probe) return;
  const probed: ProbedProduct[] = await probe.drain();
  target.push(...probed);
}

/**
 * Captura sem persistência. O adapter é responsável apenas por autenticação,
 * navegação e normalização da evidência de origem. Matching, quality gate e
 * mutação do catálogo pertencem ao Capture Core.
 */
export async function captureSupplierProducts(
  input: CaptureAdapterInput,
): Promise<CaptureAdapterResult> {
  const loaded = await loadConfig(input.scraperConfigId);
  const {
    config,
    supplier,
    scraperType,
    loginIdentifier,
    password,
  } = loaded;

  let selectors: SelectorConfig = {
    ...loaded.selectors,
    categoryUrls: [...loaded.selectors.categoryUrls],
  };

  const capabilities = getConnectorCapabilities(scraperType, selectors);
  const mode = chooseCaptureMode(input.mode, capabilities, input.query);
  const warnings: string[] = [];

  if (mode === "full" && scraperType === "tambasa") {
    try {
      const discovery = await discoverTambasaCategories(input.scraperConfigId, {
        maxCategories: readBoundedIntegerEnv(
          "TAMBASA_MAX_CATEGORIES",
          1_500,
          1,
          5_000,
        ),
      });
      selectors = normalizeSelectorUrls({
        ...selectors,
        categoryUrls: discovery.categoryUrls,
        useStructuredData: true,
      });
      warnings.push(...discovery.warnings.slice(0, 20));
    } catch (error) {
      warnings.push(
        `Descoberta ampla Tambasa indisponível; usando categorias configuradas: ` +
          `${(error as Error).message}`,
      );
    }
  }

  const loginUrl = resolveLoginUrl(selectors);
  assertSafeExternalUrl(loginUrl, "URL de login");

  const engine = new ScraperEngine();
  const capturedProducts: CapturedSupplierProduct[] = [];
  let probe: NetworkJsonProbe | null = null;

  try {
    await engine.login(
      loginUrl,
      loginIdentifier,
      password,
      selectors,
      config.supplierId,
    );

    // TODO arquitetural eliminado quando ScraperEngine expuser um accessor
    // somente-leitura para a página autenticada. O cast não altera estado.
    const page = (engine as unknown as { page: Page | null }).page;
    if (page && capabilities.method === "hybrid") {
      probe = attachNetworkJsonProductProbe(
        page,
        allowedHosts(selectors, loginUrl),
      );
    }

    if (mode === "search") {
      const query = input.query?.trim();
      if (!query) throw new Error("Busca sob demanda exige termo, SKU ou EAN.");

      capturedProducts.push(
        ...browserProducts(await engine.scrapeSearch(query, selectors), selectors),
      );
      await drainProbe(probe, capturedProducts);
    } else if (mode === "refresh" && capabilities.search) {
      const limit = readBoundedIntegerEnv("CAPTURE_REFRESH_LIMIT", 250, 1, 2_000);
      const requestedTerms = explicitRefreshTerms(input.query);
      const refreshTerms = requestedTerms.length
        ? requestedTerms
        : await buildRefreshTerms(config.supplierId, limit);

      if (refreshTerms.length === 0 && capabilities.fullCatalog) {
        for (const categoryUrl of selectors.categoryUrls) {
          try {
            capturedProducts.push(
              ...browserProducts(
                await engine.scrapeCategory(categoryUrl, selectors),
                selectors,
              ),
            );
            await drainProbe(probe, capturedProducts);
          } catch (error) {
            warnings.push(
              `Categoria ${categoryUrl}: ${(error as Error).message}`,
            );
          }
        }
      } else if (refreshTerms.length === 0) {
        warnings.push(
          "Nenhuma oferta conhecida para atualização incremental; use busca por termo para semear este conector.",
        );
      } else {
        for (const term of refreshTerms.slice(0, limit)) {
          try {
            capturedProducts.push(
              ...browserProducts(await engine.scrapeSearch(term, selectors), selectors),
            );
            await drainProbe(probe, capturedProducts);
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
        try {
          capturedProducts.push(
            ...browserProducts(
              await engine.scrapeCategory(categoryUrl, selectors),
              selectors,
            ),
          );
          await drainProbe(probe, capturedProducts);
        } catch (error) {
          warnings.push(`Categoria ${categoryUrl}: ${(error as Error).message}`);
        }
      }
    }

    if (probe) {
      capturedProducts.push(...await probe.stop());
      probe = null;
    }
  } finally {
    if (probe) await probe.stop().catch(() => []);
    await engine.close();
  }

  const deduped = dedupeProducts(capturedProducts);
  warnings.push(...deduped.warnings);

  const apiCount = deduped.products.reduce(
    (count, product) => count + Number(product.sourceType === "api"),
    0,
  );
  if (capabilities.method === "hybrid" && apiCount > 0) {
    warnings.push(
      `Conector híbrido aproveitou ${apiCount} produto(s) de respostas JSON internas.`,
    );
  }

  return {
    supplierId: config.supplierId,
    supplierName: supplier.name,
    scraperType,
    mode,
    products: deduped.products,
    warnings: warnings.slice(0, 100),
    capabilities,
  };
}
