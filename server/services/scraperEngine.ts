/**
 * @deprecated Fachada de compatibilidade do antigo scraperEngine.
 *
 * O runtime operacional do S2 Licit é o Capture Core:
 * BrowserCaptureEngine -> captureSupplierProducts -> captureJobProcessor.
 *
 * Este arquivo preserva contratos/imports antigos sem reintroduzir matching,
 * criação de produtos, atualização de ofertas ou locks de negócio em memória.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { scraperConfigs } from "../../drizzle/schema";
import { decryptPassword } from "../utils/encryption";
import {
  BrowserCaptureEngine,
  testBrowserLogin,
  type TestBrowserLoginResult,
} from "./browserCaptureEngine";
import {
  buildSearchUrl,
  type ScrapedProduct,
  type ScraperRunResult,
  type SelectorConfig,
} from "./scraperContracts";
import {
  FORNECEDOR_CONFIGS,
  getScraperPreset,
} from "./scraperPresets";
import { assertSafeExternalUrl } from "../utils/urlGuard";

export type {
  ScrapedProduct,
  ScraperRunResult,
  SelectorConfig,
} from "./scraperContracts";
export { buildSearchUrl } from "./scraperContracts";
export { FORNECEDOR_CONFIGS } from "./scraperPresets";

export interface TestLoginResult {
  success: boolean;
  message: string;
  log: string[];
  requiresHumanIntervention?: boolean;
  challengeType?: "captcha" | "mfa" | "unknown" | null;
}

export class LegacyScraperMutationDisabledError extends Error {
  readonly code = "LEGACY_SCRAPER_MUTATION_DISABLED";

  constructor(operation: string) {
    super(
      `${operation} foi desativado no scraper legado. ` +
        "Use o Capture Core persistente para matching e atualização de catálogo.",
    );
    this.name = "LegacyScraperMutationDisabledError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeSelectorConfig(
  scraperType: string,
  customSelectors?: SelectorConfig | null,
): SelectorConfig {
  const type = scraperType.trim().toLowerCase();
  const preset = getScraperPreset(type);

  if (!preset && !customSelectors) {
    throw new Error(
      `Conector "${scraperType}" não possui preset nem configuração personalizada.`,
    );
  }

  if (!preset) {
    return {
      ...customSelectors!,
      categoryUrls: [...customSelectors!.categoryUrls],
    };
  }

  if (!customSelectors) return preset;

  return {
    ...preset,
    ...customSelectors,
    categoryUrls: Array.isArray(customSelectors.categoryUrls)
      ? [...customSelectors.categoryUrls]
      : [...preset.categoryUrls],
  };
}

function deriveLoginUrl(config: SelectorConfig): string {
  if (config.loginUrl) {
    return assertSafeExternalUrl(config.loginUrl, "URL de login").toString();
  }

  const source = config.categoryUrls[0] ?? config.searchUrlTemplate;
  if (!source) {
    throw new Error(
      "Conector sem loginUrl e sem URL de catálogo/busca para derivar a origem.",
    );
  }

  const probe = source.replace(/\{q\}|\{termo\}/gi, "capture-probe");
  const origin = assertSafeExternalUrl(probe, "URL base do conector").origin;
  return `${origin}/login`;
}

function resolveLoginIdentifier(raw: string | null | undefined): string {
  const value = raw?.trim();
  if (!value) return "";

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

/**
 * Wrapper browser-only para consumidores antigos da classe ScraperEngine.
 * Nenhum método desta classe conhece ou altera products/offers/history.
 */
export class ScraperEngine {
  private readonly runtime = new BrowserCaptureEngine();

  get authenticatedPage() {
    return this.runtime.authenticatedPage;
  }

  get log(): readonly string[] {
    return this.runtime.log;
  }

  async init(): Promise<void> {
    await this.runtime.init();
  }

  async close(): Promise<void> {
    await this.runtime.close();
  }

  async login(
    loginUrl: string,
    loginIdentifier: string,
    password: string,
    config: SelectorConfig,
    supplierId?: number,
  ): Promise<void> {
    await this.runtime.login(
      loginUrl,
      loginIdentifier,
      password,
      config,
      supplierId,
    );
  }

  async scrapeSearch(
    term: string,
    config: SelectorConfig,
  ): Promise<ScrapedProduct[]> {
    return this.runtime.scrapeSearch(term, config);
  }

  async scrapeCategory(
    categoryUrl: string,
    config: SelectorConfig,
  ): Promise<ScrapedProduct[]> {
    return this.runtime.scrapeCategory(categoryUrl, config);
  }

  async capturarEvidencia(prefix: string): Promise<string | null> {
    return this.runtime.captureEvidence(prefix);
  }

  async matchAndUpdate(): Promise<never> {
    throw new LegacyScraperMutationDisabledError("matchAndUpdate");
  }
}

export async function testarLoginFornecedor(
  scraperType: string,
  loginIdentifier: string,
  password: string,
  customSelectors?: SelectorConfig,
): Promise<TestLoginResult> {
  if (!loginIdentifier.trim() || !password) {
    return {
      success: false,
      message: "Identificador de login e senha são obrigatórios.",
      log: [],
    };
  }

  try {
    const config = mergeSelectorConfig(scraperType, customSelectors);
    const loginUrl = deriveLoginUrl(config);
    const result: TestBrowserLoginResult = await testBrowserLogin({
      loginUrl,
      loginIdentifier: loginIdentifier.trim(),
      password,
      config,
    });

    return {
      success: result.success,
      message: result.message,
      log: result.log,
      requiresHumanIntervention: result.requiresHumanIntervention,
      challengeType: result.challengeType,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Falha ao validar conexão.",
      log: [],
    };
  }
}

/**
 * Estado local existe somente para consultas read-only feitas por consumidores
 * legados. O Capture Core não usa este lock e sua exclusão mútua é MySQL-backed.
 */
const legacyReadLocks = new Set<number>();

export function isScraperRunning(scraperConfigId: number): boolean {
  return legacyReadLocks.has(scraperConfigId);
}

/**
 * Execução mutável síncrona foi removida deliberadamente. Manter esta função
 * fail-closed impede que um consumidor antigo volte a contornar quality gates,
 * observações e revisão humana do Capture Core.
 */
export async function executarScraper(
  _scraperConfigId: number,
): Promise<ScraperRunResult> {
  throw new LegacyScraperMutationDisabledError("executarScraper");
}

/**
 * Consulta read-only compatível para cascatas antigas. Não persiste resultados.
 */
export async function buscarProdutosFornecedor(
  scraperConfigId: number,
  query: { termo?: string; codigo?: string },
): Promise<ScrapedProduct[]> {
  if (legacyReadLocks.has(scraperConfigId)) {
    throw new Error(
      `Fornecedor #${scraperConfigId} já está em consulta read-only nesta instância.`,
    );
  }

  legacyReadLocks.add(scraperConfigId);
  try {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados indisponível.");

    const [stored] = await db
      .select()
      .from(scraperConfigs)
      .where(eq(scraperConfigs.id, scraperConfigId))
      .limit(1);

    if (!stored) {
      throw new Error(`Configuração de scraper #${scraperConfigId} não encontrada.`);
    }
    if (stored.enabled !== "yes") {
      throw new Error("Configuração de fornecedor desativada.");
    }
    if (!stored.tosAprovado) {
      throw new Error("Consulta bloqueada: termos de uso ainda não aprovados.");
    }

    const custom = isRecord(stored.customSelectors)
      ? (stored.customSelectors as unknown as SelectorConfig)
      : null;
    const config = mergeSelectorConfig(stored.scraperType, custom);
    const loginIdentifier = resolveLoginIdentifier(stored.email);
    const password = decryptRequiredPassword(stored.passwordHash);
    if (!loginIdentifier) {
      throw new Error("Identificador de login do fornecedor não configurado.");
    }

    const loginUrl = deriveLoginUrl(config);
    const engine = new BrowserCaptureEngine();

    try {
      await engine.login(
        loginUrl,
        loginIdentifier,
        password,
        config,
        stored.supplierId,
      );

      const term = (query.termo ?? query.codigo ?? "").trim();
      if (term) {
        if (!config.searchUrlTemplate) {
          throw new Error("Conector não possui busca seletiva configurada.");
        }
        return engine.scrapeSearch(term, config);
      }

      const firstCategory = config.categoryUrls[0];
      if (!firstCategory) {
        throw new Error(
          "Consulta sem termo exige ao menos uma categoria configurada.",
        );
      }
      return engine.scrapeCategory(firstCategory, config);
    } finally {
      await engine.close();
    }
  } finally {
    legacyReadLocks.delete(scraperConfigId);
  }
}

/**
 * Reexport explícito para consumidores que ainda importam a constante daqui.
 * O objeto canônico vive em scraperPresets.ts.
 */
void FORNECEDOR_CONFIGS;
void buildSearchUrl;
