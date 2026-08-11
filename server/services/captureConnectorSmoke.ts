import "dotenv/config";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  productSupplierOffers,
  products,
  scraperConfigs,
} from "../../drizzle/schema";
import {
  captureSupplierProducts,
  type CaptureAdapterResult,
} from "./scraperCaptureAdapter";
import { getConnectorCapabilities } from "./captureConnectorCapabilities";

interface SmokeResult {
  label: string;
  scraperConfigId: number;
  scraperType: string;
  mode: CaptureAdapterResult["mode"];
  products: number;
  withEan: number;
  withSku: number;
  withStock: number;
  apiProducts: number;
  warnings: number;
  durationMs: number;
}

interface SmokeConfig {
  id: number;
  supplierId: number;
  scraperType: string;
  customSelectors: unknown;
}

function readOptionalPositiveInteger(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} deve conter um ID inteiro positivo quando informada.`);
  }
  return value;
}

function clampEnvInteger(name: string, maximum: number, fallback: number): void {
  const current = Number.parseInt(process.env[name] ?? "", 10);
  const safeCurrent = Number.isFinite(current) && current > 0 ? current : fallback;
  process.env[name] = String(Math.min(safeCurrent, maximum));
}

function validateCapturedProducts(
  label: string,
  result: CaptureAdapterResult,
): void {
  if (result.products.length === 0) {
    throw new Error(`${label}: nenhum produto capturado.`);
  }

  const invalidPrice = result.products.find(
    (product) => !Number.isFinite(product.price) || product.price <= 0,
  );
  if (invalidPrice) {
    throw new Error(`${label}: captura retornou produto com preço inválido.`);
  }

  const invalidName = result.products.find(
    (product) => !product.name?.trim() || product.name.trim().length < 3,
  );
  if (invalidName) {
    throw new Error(`${label}: captura retornou produto sem nome válido.`);
  }
}

async function loadSmokeConfigs(): Promise<SmokeConfig[]> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível para descobrir conectores de smoke.");

  return db
    .select({
      id: scraperConfigs.id,
      supplierId: scraperConfigs.supplierId,
      scraperType: scraperConfigs.scraperType,
      customSelectors: scraperConfigs.customSelectors,
    })
    .from(scraperConfigs)
    .where(
      and(
        eq(scraperConfigs.enabled, "yes"),
        eq(scraperConfigs.tosAprovado, true),
      ),
    );
}

function chooseTambasaConfig(configs: SmokeConfig[]): SmokeConfig {
  const explicitId = readOptionalPositiveInteger("CAPTURE_SMOKE_TAMBASA_CONFIG_ID");
  const candidate = explicitId
    ? configs.find((config) => config.id === explicitId)
    : configs.find(
        (config) => config.scraperType.trim().toLowerCase() === "tambasa",
      );

  if (!candidate) {
    throw new Error(
      explicitId
        ? `Config Tambasa #${explicitId} não está ativa ou com ToS aprovado.`
        : "Nenhuma configuração Tambasa ativa e com ToS aprovado foi encontrada.",
    );
  }

  if (candidate.scraperType.trim().toLowerCase() !== "tambasa") {
    throw new Error(
      `CAPTURE_SMOKE_TAMBASA_CONFIG_ID aponta para ${candidate.scraperType}, não Tambasa.`,
    );
  }

  return candidate;
}

function chooseSearchConfig(
  configs: SmokeConfig[],
  tambasaConfigId: number,
): SmokeConfig {
  const explicitId = readOptionalPositiveInteger("CAPTURE_SMOKE_SEARCH_CONFIG_ID");
  if (explicitId) {
    const explicit = configs.find((config) => config.id === explicitId);
    if (!explicit) {
      throw new Error(
        `Config de busca #${explicitId} não está ativa ou com ToS aprovado.`,
      );
    }

    const capabilities = getConnectorCapabilities(
      explicit.scraperType,
      explicit.customSelectors,
    );
    if (!capabilities.search) {
      throw new Error(`Config #${explicitId} não possui busca homologada.`);
    }
    return explicit;
  }

  const candidates = configs
    .filter((config) => config.id !== tambasaConfigId)
    .map((config) => ({
      config,
      capabilities: getConnectorCapabilities(
        config.scraperType,
        config.customSelectors,
      ),
    }));

  const searchOnly = candidates.find(
    ({ capabilities }) => capabilities.search && !capabilities.fullCatalog,
  );
  if (searchOnly) return searchOnly.config;

  const hybridSearch = candidates.find(({ capabilities }) => capabilities.search);
  if (hybridSearch) return hybridSearch.config;

  throw new Error(
    "Nenhum conector search-only/híbrido ativo e com busca homologada foi encontrado.",
  );
}

async function resolveSearchQuery(config: SmokeConfig): Promise<string> {
  const explicit = process.env.CAPTURE_SMOKE_SEARCH_QUERY?.trim();
  if (explicit) return explicit;

  const db = await getDb();
  if (!db) throw new Error("Banco indisponível para resolver termo do smoke.");

  const rows = await db
    .select({
      supplierCode: productSupplierOffers.supplierCode,
      productName: products.name,
    })
    .from(productSupplierOffers)
    .innerJoin(products, eq(productSupplierOffers.productId, products.id))
    .where(
      and(
        eq(productSupplierOffers.supplierId, config.supplierId),
        eq(products.isActive, "yes"),
      ),
    )
    .limit(25);

  for (const row of rows) {
    const supplierCode = row.supplierCode?.trim();
    if (supplierCode) return supplierCode;
  }
  for (const row of rows) {
    const productName = row.productName?.trim();
    if (productName) return productName.slice(0, 180);
  }

  throw new Error(
    `Fornecedor da config #${config.id} não possui oferta conhecida para semear o smoke de busca. ` +
      "Defina CAPTURE_SMOKE_SEARCH_QUERY explicitamente.",
  );
}

async function runSmoke(input: {
  label: string;
  scraperConfigId: number;
  mode: "search" | "full";
  query?: string;
  expectedType?: string;
}): Promise<SmokeResult> {
  const startedAt = Date.now();
  const result = await captureSupplierProducts({
    scraperConfigId: input.scraperConfigId,
    mode: input.mode,
    query: input.query,
  });

  if (
    input.expectedType &&
    result.scraperType.trim().toLowerCase() !== input.expectedType.toLowerCase()
  ) {
    throw new Error(
      `${input.label}: config #${input.scraperConfigId} é ${result.scraperType}, ` +
        `esperado ${input.expectedType}.`,
    );
  }

  if (input.mode === "search" && !result.capabilities.search) {
    throw new Error(`${input.label}: conector não declara capacidade de busca.`);
  }

  if (input.mode === "full" && result.mode !== "full") {
    throw new Error(
      `${input.label}: smoke full foi degradado para ${result.mode}; ` +
        "o conector não está homologado para catálogo integral.",
    );
  }

  validateCapturedProducts(input.label, result);

  return {
    label: input.label,
    scraperConfigId: input.scraperConfigId,
    scraperType: result.scraperType,
    mode: result.mode,
    products: result.products.length,
    withEan: result.products.filter((product) => Boolean(product.ean)).length,
    withSku: result.products.filter((product) => Boolean(product.code?.trim())).length,
    withStock: result.products.filter((product) => product.stock != null).length,
    apiProducts: result.products.filter((product) => product.sourceType === "api").length,
    warnings: result.warnings.length,
    durationMs: Date.now() - startedAt,
  };
}

export async function runCaptureConnectorSmoke(): Promise<SmokeResult[]> {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL não configurada para o smoke de conectores.");
  }

  // Limites exclusivos deste processo. O smoke valida autenticação + extração
  // sem transformar o teste em full scan de produção.
  clampEnvInteger("SCRAPER_MAX_PAGES", 2, 2);
  clampEnvInteger("TAMBASA_MAX_CATEGORIES", 3, 3);
  clampEnvInteger("CAPTURE_REFRESH_LIMIT", 5, 5);

  const configs = await loadSmokeConfigs();
  const tambasaConfig = chooseTambasaConfig(configs);
  const searchConfig = chooseSearchConfig(configs, tambasaConfig.id);
  const searchQuery = await resolveSearchQuery(searchConfig);

  const tambasa = await runSmoke({
    label: "Tambasa full bounded",
    scraperConfigId: tambasaConfig.id,
    mode: "full",
    expectedType: "tambasa",
  });

  const searchOnly = await runSmoke({
    label: "Search-only/hybrid",
    scraperConfigId: searchConfig.id,
    mode: "search",
    query: searchQuery,
  });

  return [tambasa, searchOnly];
}

const executedDirectly =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (executedDirectly) {
  runCaptureConnectorSmoke()
    .then((results) => {
      process.stdout.write(
        `${JSON.stringify({ ok: true, results }, null, 2)}\n`,
      );
      process.exit(0);
    })
    .catch((error) => {
      process.stderr.write(
        `${JSON.stringify(
          {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          },
          null,
          2,
        )}\n`,
      );
      process.exit(1);
    });
}
