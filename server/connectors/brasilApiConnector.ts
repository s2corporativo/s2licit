import { z } from "zod";
import { externalHttpRequest } from "../integrations/core/externalHttpClient";
import { getIntegrationCache, putIntegrationCache } from "../integrations/core/integrationCache";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_SCHEMA_VERSION = "cnpj-normalized-v1";
const CONNECTOR_VERSION = "brasilapi-v1";

export interface CnpjInfo {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  situacao: string | null;
  uf: string | null;
  municipio: string | null;
  cnaePrincipal: string | null;
  email: string | null;
  telefone: string | null;
}

export interface CnpjLookupResult extends CnpjInfo {
  _meta: {
    source: "brasilapi";
    cached: boolean;
    stale: boolean;
    fetchedAt: string;
  };
}

const BrasilApiCnpjSchema = z.object({
  cnpj: z.union([z.string(), z.number()]).optional(),
  razao_social: z.string().optional().nullable(),
  nome_fantasia: z.string().optional().nullable(),
  descricao_situacao_cadastral: z.string().optional().nullable(),
  uf: z.string().optional().nullable(),
  municipio: z.string().optional().nullable(),
  cnae_fiscal_descricao: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  ddd_telefone_1: z.union([z.string(), z.number()]).optional().nullable(),
}).passthrough();

type BrasilApiCnpjPayload = z.infer<typeof BrasilApiCnpjSchema>;

const CnpjInfoSchema: z.ZodType<CnpjInfo> = z.object({
  cnpj: z.string(),
  razaoSocial: z.string(),
  nomeFantasia: z.string().nullable(),
  situacao: z.string().nullable(),
  uf: z.string().nullable(),
  municipio: z.string().nullable(),
  cnaePrincipal: z.string().nullable(),
  email: z.string().nullable(),
  telefone: z.string().nullable(),
});

function sanitizeCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}

function normalizeCnpj(data: BrasilApiCnpjPayload, fallbackCnpj: string): CnpjInfo {
  return {
    cnpj: data.cnpj != null ? String(data.cnpj) : fallbackCnpj,
    razaoSocial: data.razao_social ?? "",
    nomeFantasia: data.nome_fantasia ?? null,
    situacao: data.descricao_situacao_cadastral ?? null,
    uf: data.uf ?? null,
    municipio: data.municipio ?? null,
    cnaePrincipal: data.cnae_fiscal_descricao ?? null,
    email: data.email ?? null,
    telefone: data.ddd_telefone_1 != null ? String(data.ddd_telefone_1) : null,
  };
}

function fromCache(
  payload: CnpjInfo,
  fetchedAt: Date,
  stale: boolean,
): CnpjLookupResult {
  return {
    ...payload,
    _meta: {
      source: "brasilapi",
      cached: true,
      stale,
      fetchedAt: fetchedAt.toISOString(),
    },
  };
}

function canUseStale(errorType: string | undefined): boolean {
  return ["TIMEOUT", "NETWORK", "UPSTREAM", "RATE_LIMIT", "CONTRACT", "PARSE", "UNKNOWN"].includes(errorType ?? "");
}

/**
 * Consulta CNPJ com cache persistente validado. Dados frescos têm TTL de 24h.
 * Em falha transitória/contract drift, uma cópia de até 7 dias pode ser usada,
 * sempre marcada explicitamente em `_meta.stale`.
 */
export async function consultarCnpj(cnpjRaw: string): Promise<CnpjLookupResult> {
  const cnpj = sanitizeCnpj(cnpjRaw);
  if (!/^\d{14}$/.test(cnpj)) throw new Error("CNPJ inválido: informe 14 dígitos.");

  const cached = await getIntegrationCache<CnpjInfo>("brasilapi", "cnpj.lookup", cnpj, {
    schemaVersion: CACHE_SCHEMA_VERSION,
  });
  const cachedPayload = cached ? CnpjInfoSchema.safeParse(cached.payload) : null;
  if (cached && cachedPayload?.success && cached.fresh) {
    return fromCache(cachedPayload.data, cached.fetchedAt, false);
  }

  const url = `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`;
  const response = await externalHttpRequest<BrasilApiCnpjPayload>({
    source: "brasilapi",
    operation: "cnpj.lookup",
    url,
    expected: "json",
    timeoutMs: 15_000,
    deadlineMs: 35_000,
    maxRetries: 2,
    validator: (payload) => BrasilApiCnpjSchema.parse(payload),
  });

  if (!response.ok || !response.data) {
    if (
      cached &&
      cachedPayload?.success &&
      cached.ageMs <= MAX_STALE_MS &&
      canUseStale(response.error?.type)
    ) {
      return fromCache(cachedPayload.data, cached.fetchedAt, true);
    }
    throw new Error(response.error?.message ?? `Falha ao consultar CNPJ (status ${response.statusCode}).`);
  }

  const normalized = normalizeCnpj(response.data, cnpj);
  void putIntegrationCache({
    source: "brasilapi",
    operation: "cnpj.lookup",
    cacheKey: cnpj,
    sourceUrl: response.finalUrl ?? url,
    connectorVersion: CONNECTOR_VERSION,
    schemaVersion: CACHE_SCHEMA_VERSION,
    statusCode: response.statusCode,
    contentType: response.contentType,
    payload: normalized,
    ttlMs: CACHE_TTL_MS,
  });

  return {
    ...normalized,
    _meta: {
      source: "brasilapi",
      cached: false,
      stale: false,
      fetchedAt: response.fetchedAt.toISOString(),
    },
  };
}
