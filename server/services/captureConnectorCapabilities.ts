import { FORNECEDOR_CONFIGS, type SelectorConfig } from "./scraperEngine";

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
  experimental?: boolean;
  notes?: string;
}

const KNOWN: Record<string, Partial<ConnectorCapabilities>> = {
  tambasa: {
    method: "hybrid",
    fullCatalog: true,
    search: false,
    structuredData: true,
    stock: true,
    notes: "Dados estruturados/API interna preferenciais; DOM é fallback.",
  },
  bartofil: {
    method: "hybrid",
    fullCatalog: false,
    search: true,
    structuredData: false,
    notes: "SPA: busca/refresh observam JSON interno da sessão; DOM é fallback.",
  },
  bassopancotte: {
    method: "hybrid",
    fullCatalog: false,
    search: true,
    structuredData: false,
    notes: "SPA/React Native Web: busca/refresh observam JSON interno; DOM é fallback.",
  },
  magazinemedica: {
    method: "hybrid",
    fullCatalog: true,
    search: true,
    structuredData: true,
    notes: "Catálogo público/structured data preferencial; browser para sessão autenticada.",
  },
  utilidadesclinicas: {
    method: "hybrid",
    fullCatalog: true,
    search: true,
    structuredData: true,
    notes: "Magento: structured data/JSON/HTTP quando possível; browser para autenticação.",
  },
  cristalia: {
    method: "browser",
    experimental: true,
    notes: "Preset não homologado em produção; exigir health-check antes de confiar.",
  },
  ourofino: {
    method: "browser",
    experimental: true,
    notes: "Preset não homologado em produção; exigir health-check antes de confiar.",
  },
};

export function getConnectorCapabilities(
  scraperType: string,
  customSelectors?: SelectorConfig | null,
): ConnectorCapabilities {
  const type = scraperType.trim().toLowerCase();
  const cfg = customSelectors ?? FORNECEDOR_CONFIGS[type] ?? FORNECEDOR_CONFIGS.generico;
  const known = KNOWN[type] ?? {};

  return {
    method: known.method ?? "browser",
    fullCatalog: known.fullCatalog ?? (Array.isArray(cfg.categoryUrls) && cfg.categoryUrls.length > 0),
    search: known.search ?? Boolean(cfg.searchUrlTemplate),
    structuredData: known.structuredData ?? Boolean(cfg.useStructuredData),
    ean: known.ean ?? Boolean(cfg.productEan || cfg.useStructuredData),
    stock: known.stock ?? Boolean(cfg.useStructuredData),
    images: known.images ?? Boolean(cfg.productImage || cfg.useStructuredData),
    authenticated: true,
    experimental: known.experimental ?? false,
    notes: known.notes,
  };
}

export function chooseCaptureMode(
  requested: "search" | "refresh" | "full",
  capabilities: ConnectorCapabilities,
  query?: string | null,
): "search" | "refresh" | "full" {
  const hasQuery = Boolean(query?.trim());
  if (requested === "search") {
    if (hasQuery && capabilities.search) return "search";
    throw new Error("Este conector não suporta busca por termo ou a busca foi enviada sem termo.");
  }
  if (requested === "refresh") {
    if (capabilities.search || capabilities.fullCatalog) return "refresh";
    throw new Error("Este conector não possui estratégia de atualização incremental.");
  }
  if (requested === "full" && capabilities.fullCatalog) return "full";
  if (capabilities.search && hasQuery) return "search";
  throw new Error(
    "Este conector não suporta varredura integral. Use atualização seletiva/busca ou homologue um endpoint de catálogo.",
  );
}
