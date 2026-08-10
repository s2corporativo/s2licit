import type { SelectorConfig } from "./scraperContracts";
import { FORNECEDOR_CONFIGS } from "./scraperPresets";

export type CaptureMethod = "api" | "http" | "browser" | "hybrid";

export interface ConnectorCapabilities {
  method: CaptureMethod;
  fullCatalog: boolean;
  search: boolean;
  structuredData: boolean;
  ean: boolean;
  stock: boolean;
  images: boolean;
  authenticated: boolean;
  experimental: boolean;
  configured: boolean;
  notes?: string;
}

type SelectorOverrides = Partial<SelectorConfig> | null | undefined;

interface ConnectorProfile {
  method: CaptureMethod;
  fullCatalogMode?: "discovery" | "configured_categories" | "none";
  searchMode?: "configured_url" | "none";
  structuredData?: boolean;
  ean?: boolean;
  stock?: boolean;
  images?: boolean;
  experimental?: boolean;
  notes?: string;
}

const PROFILES: Record<string, ConnectorProfile> = {
  tambasa: {
    method: "hybrid",
    fullCatalogMode: "discovery",
    searchMode: "configured_url",
    structuredData: true,
    ean: true,
    stock: true,
    images: true,
    notes: "Descoberta autenticada de categorias + dados estruturados/JSON; DOM é fallback.",
  },
  bartofil: {
    method: "hybrid",
    fullCatalogMode: "none",
    searchMode: "configured_url",
    experimental: true,
    notes: "SPA: somente busca/refresh enquanto rota de catálogo integral não for homologada.",
  },
  bassopancotte: {
    method: "hybrid",
    fullCatalogMode: "none",
    searchMode: "configured_url",
    experimental: true,
    notes: "React Native Web: somente busca/refresh enquanto catálogo integral não for homologado.",
  },
  magazinemedica: {
    method: "hybrid",
    fullCatalogMode: "configured_categories",
    searchMode: "configured_url",
    structuredData: true,
    images: true,
    notes: "Catálogo/structured data preferencial; browser necessário quando a sessão autenticada for exigida.",
  },
  utilidadesclinicas: {
    method: "hybrid",
    fullCatalogMode: "configured_categories",
    searchMode: "configured_url",
    structuredData: true,
    images: true,
    notes: "Magento: structured data/JSON preferenciais; browser para autenticação e páginas protegidas.",
  },
  cristalia: {
    method: "browser",
    fullCatalogMode: "configured_categories",
    searchMode: "configured_url",
    experimental: true,
    notes: "Preset não homologado em produção; exigir health-check antes de confiar nos resultados.",
  },
  ourofino: {
    method: "browser",
    fullCatalogMode: "configured_categories",
    searchMode: "configured_url",
    experimental: true,
    notes: "Preset não homologado em produção; exigir health-check antes de confiar nos resultados.",
  },
  generico: {
    method: "browser",
    fullCatalogMode: "configured_categories",
    searchMode: "configured_url",
    experimental: true,
    notes: "Conector genérico depende integralmente da configuração personalizada e deve ser homologado antes do uso recorrente.",
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeOverrides(value: unknown): SelectorOverrides {
  if (!isRecord(value)) return undefined;
  return value as SelectorOverrides;
}

function effectiveConfig(
  type: string,
  overridesInput?: unknown,
): Partial<SelectorConfig> | null {
  const preset = FORNECEDOR_CONFIGS[type];
  const overrides = normalizeOverrides(overridesInput);

  if (!preset && !overrides) return null;
  if (!preset) return overrides ?? null;
  if (!overrides) return preset;

  return {
    ...preset,
    ...overrides,
    categoryUrls: Array.isArray(overrides.categoryUrls)
      ? overrides.categoryUrls
      : preset.categoryUrls,
  };
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasConfiguredCategories(cfg: Partial<SelectorConfig> | null): boolean {
  return Boolean(
    cfg &&
    Array.isArray(cfg.categoryUrls) &&
    cfg.categoryUrls.some(hasNonEmptyString),
  );
}

function hasConfiguredSearch(cfg: Partial<SelectorConfig> | null): boolean {
  return Boolean(cfg && hasNonEmptyString(cfg.searchUrlTemplate));
}

function hasAuthenticationSelectors(cfg: Partial<SelectorConfig> | null): boolean {
  return Boolean(
    cfg &&
    hasNonEmptyString(cfg.loginEmail) &&
    hasNonEmptyString(cfg.loginPassword) &&
    hasNonEmptyString(cfg.loginSubmit),
  );
}

function resolveFullCatalogCapability(
  profile: ConnectorProfile | undefined,
  cfg: Partial<SelectorConfig> | null,
): boolean {
  if (profile?.fullCatalogMode === "discovery") return true;
  if (profile?.fullCatalogMode === "none") return false;
  return hasConfiguredCategories(cfg);
}

function resolveSearchCapability(
  profile: ConnectorProfile | undefined,
  cfg: Partial<SelectorConfig> | null,
): boolean {
  if (profile?.searchMode === "none") return false;
  return hasConfiguredSearch(cfg);
}

export function getConnectorCapabilities(
  scraperType: string,
  customSelectors?: unknown,
): ConnectorCapabilities {
  const type = scraperType.trim().toLowerCase();
  const profile = PROFILES[type];
  const cfg = effectiveConfig(type, customSelectors);
  const structuredData = Boolean(profile?.structuredData || cfg?.useStructuredData);

  return {
    method: profile?.method ?? "browser",
    fullCatalog: resolveFullCatalogCapability(profile, cfg),
    search: resolveSearchCapability(profile, cfg),
    structuredData,
    ean: Boolean(profile?.ean || cfg?.productEan || structuredData),
    stock: Boolean(profile?.stock || structuredData),
    images: Boolean(profile?.images || cfg?.productImage || structuredData),
    authenticated: hasAuthenticationSelectors(cfg),
    experimental: profile?.experimental ?? !PROFILES[type],
    configured: cfg !== null,
    notes: profile?.notes,
  };
}

export function chooseCaptureMode(
  requested: "search" | "refresh" | "full",
  capabilities: ConnectorCapabilities,
  query?: string | null,
): "search" | "refresh" | "full" {
  if (!capabilities.configured) {
    throw new Error("Conector sem preset e sem configuração personalizada válida.");
  }
  if (!capabilities.authenticated) {
    throw new Error("Conector sem seletores mínimos de autenticação configurados.");
  }

  const hasQuery = Boolean(query?.trim());

  if (requested === "search") {
    if (!hasQuery) {
      throw new Error("Busca sob demanda exige termo, SKU ou EAN.");
    }
    if (!capabilities.search) {
      throw new Error("Este conector não possui URL de busca configurada/homologada.");
    }
    return "search";
  }

  if (requested === "refresh") {
    if (capabilities.search || capabilities.fullCatalog) return "refresh";
    throw new Error("Este conector não possui estratégia de atualização incremental.");
  }

  if (capabilities.fullCatalog) return "full";
  if (capabilities.search && hasQuery) return "search";

  throw new Error(
    "Este conector não suporta varredura integral. Use atualização seletiva/busca ou homologue uma estratégia de catálogo completo.",
  );
}
