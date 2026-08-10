/**
 * Compras.gov.br — fonte oficial complementar do Radar.
 *
 * Estratégia:
 * 1) API oficial atual de Dados Abertos (Módulo 07 - Contratações 14.133);
 * 2) fallback temporário para o endpoint SIASG legado quando a API atual estiver
 *    indisponível/incompatível;
 * 3) nunca converte falha nem truncamento em lista vazia/sucesso silencioso.
 */
import { z } from "zod";
import { generateDedupeKey, parseDate } from "./baseConnector";
import type { NormalizedLicitacao } from "./baseConnector";
import { externalHttpRequest } from "../integrations/core/externalHttpClient";
import { classifyThrownError, IntegrationError } from "../integrations/core/integrationError";
import { failureResult, successResult } from "../integrations/core/integrationResult";
import type { ExternalHttpResponse, IntegrationResult } from "../integrations/core/types";

const CURRENT_BASE = "https://dadosabertos.compras.gov.br";
const LEGACY_BASE = "https://compras.dados.gov.br";
const PAGE_SIZE = 250;
const MAX_CURRENT_PAGES = 12;
const LEGACY_PAGE_SIZE = 500;
const MAX_LEGACY_PAGES = 8;

const ModernRawSchema = z.object({
  idCompra: z.union([z.string(), z.number()]).optional().nullable(),
  numeroControlePNCP: z.string().optional().nullable(),
  numeroControlePncp: z.string().optional().nullable(),
  orgaoEntidadeRazaoSocial: z.string().optional().nullable(),
  unidadeOrgaoNomeUnidade: z.string().optional().nullable(),
  unidadeOrgaoCodigoUnidade: z.union([z.string(), z.number()]).optional().nullable(),
  unidadeOrgaoUfSigla: z.string().optional().nullable(),
  unidadeOrgaoMunicipioNome: z.string().optional().nullable(),
  numeroCompra: z.union([z.string(), z.number()]).optional().nullable(),
  numeroProcesso: z.union([z.string(), z.number()]).optional().nullable(),
  modalidadeNome: z.string().optional().nullable(),
  codigoModalidade: z.union([z.string(), z.number()]).optional().nullable(),
  objetoCompra: z.string().optional().nullable(),
  objeto: z.string().optional().nullable(),
  informacaoComplementar: z.string().optional().nullable(),
  dataPublicacaoPncp: z.string().optional().nullable(),
  dataAberturaProposta: z.string().optional().nullable(),
  dataEncerramentoProposta: z.string().optional().nullable(),
  valorTotalEstimado: z.union([z.string(), z.number()]).optional().nullable(),
  valorTotalHomologado: z.union([z.string(), z.number()]).optional().nullable(),
  situacaoCompraNome: z.string().optional().nullable(),
  linkSistemaOrigem: z.string().optional().nullable(),
}).passthrough();

const ModernResponseSchema = z.object({
  resultado: z.array(ModernRawSchema).default([]),
  totalRegistros: z.number().optional().default(0),
  totalPaginas: z.number().optional().default(1),
  paginasRestantes: z.number().optional(),
}).passthrough();

type ModernRaw = z.infer<typeof ModernRawSchema>;
type ModernResponse = z.infer<typeof ModernResponseSchema>;

const LegacyRawSchema = z.object({
  identificador: z.string().optional(),
  uasg: z.union([z.number(), z.string()]).optional(),
  nome_uasg: z.string().optional(),
  orgao: z.string().optional(),
  nome_orgao: z.string().optional(),
  modalidade: z.union([z.number(), z.string()]).optional(),
  numero_aviso: z.union([z.number(), z.string()]).optional(),
  objeto: z.string().optional(),
  situacao_aviso: z.string().optional(),
  data_publicacao: z.string().optional(),
  data_abertura_proposta: z.string().optional(),
  uf: z.string().optional(),
  nome_municipio: z.string().optional(),
  municipio: z.string().optional(),
  valor_estimado: z.union([z.number(), z.string()]).optional(),
  _links: z.object({ self: z.object({ href: z.string().optional() }).optional() }).optional(),
}).passthrough();

const LegacyResponseSchema = z.object({
  _embedded: z.object({ licitacoes: z.array(LegacyRawSchema).optional() }).optional(),
  count: z.number().optional(),
}).passthrough();

type LegacyRaw = z.infer<typeof LegacyRawSchema>;
type LegacyResponse = z.infer<typeof LegacyResponseSchema>;

interface SourceFetchResult {
  data: NormalizedLicitacao[];
  requestId: string;
  pages: number;
  totalPages: number;
  totalRecords: number;
  truncated: boolean;
}

const MODALIDADE_NOME: Record<number, string> = {
  1: "Convite",
  2: "Tomada de Preços",
  3: "Concorrência",
  4: "Concorrência Internacional",
  5: "Pregão",
  6: "Dispensa de Licitação",
  7: "Inexigibilidade",
  20: "Concurso",
  22: "Tomada de Preços por Técnica e Preço",
  33: "Registro de Preços",
};

function responseError<T>(response: ExternalHttpResponse<T>, fallback: string): IntegrationError {
  return new IntegrationError(response.error?.message ?? fallback, {
    type: response.error?.type ?? "UPSTREAM",
    retryable: response.error?.retryable ?? false,
    upstreamStatus: response.statusCode || undefined,
    code: response.error?.code,
  });
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const normalized = value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function modalidadeNome(value: unknown): string {
  const code = typeof value === "number" ? value : Number(value);
  return MODALIDADE_NOME[code] ?? (value ? `Modalidade ${value}` : "Licitação");
}

export function normalizeComprasGovModern(raw: ModernRaw): NormalizedLicitacao {
  const orgao = raw.orgaoEntidadeRazaoSocial ?? raw.unidadeOrgaoNomeUnidade ?? "Órgão público";
  const unidade = raw.unidadeOrgaoNomeUnidade ?? orgao;
  const objeto = raw.objetoCompra ?? raw.objeto ?? "";
  const dataPublicacao = parseDate(raw.dataPublicacaoPncp);
  const dataAbertura = parseDate(raw.dataAberturaProposta);
  const idCompra = raw.idCompra != null ? String(raw.idCompra) : "";
  const numeroControle = raw.numeroControlePNCP ?? raw.numeroControlePncp ?? "";
  const numeroCompra = raw.numeroCompra != null ? String(raw.numeroCompra) : "";
  const sourceId = idCompra || numeroControle || generateDedupeKey(orgao, objeto, dataAbertura);
  const links = [
    raw.linkSistemaOrigem,
    numeroControle ? `https://pncp.gov.br/app/editais/${numeroControle}` : null,
  ].filter((link): link is string => Boolean(link));

  return {
    source: "comprasgov",
    sourceId,
    orgao,
    unidadeCompradora: unidade,
    modalidade: raw.modalidadeNome ?? modalidadeNome(raw.codigoModalidade),
    numeroProcesso: raw.numeroProcesso != null ? String(raw.numeroProcesso) : numeroCompra || sourceId,
    objeto,
    descricaoDetalhada: raw.informacaoComplementar ?? "",
    uf: (raw.unidadeOrgaoUfSigla ?? "").toUpperCase(),
    municipio: raw.unidadeOrgaoMunicipioNome ?? "",
    dataPublicacao,
    dataAbertura,
    dataEncerramento: parseDate(raw.dataEncerramentoProposta),
    valorEstimado: toNumber(raw.valorTotalEstimado),
    status: raw.situacaoCompraNome ?? "Publicado",
    links,
    dedupeKey: generateDedupeKey(orgao, objeto, dataAbertura),
  };
}

export function normalizeComprasLicitacao(raw: LegacyRaw): NormalizedLicitacao {
  const orgao = raw.nome_orgao ?? raw.orgao ?? raw.nome_uasg ?? "Órgão federal";
  const unidade = raw.nome_uasg ?? orgao;
  const objeto = raw.objeto ?? "";
  const dataPublicacao = parseDate(raw.data_publicacao);
  const dataAbertura = parseDate(raw.data_abertura_proposta);
  const uasg = raw.uasg != null ? String(raw.uasg) : "";
  const aviso = raw.numero_aviso != null ? String(raw.numero_aviso) : "";
  const sourceId = raw.identificador ?? (uasg && aviso ? `${uasg}-${aviso}` : `${uasg}${aviso}`);
  const href = raw._links?.self?.href;
  const links = href
    ? [href.startsWith("http") ? href : `${LEGACY_BASE}${href}`]
    : uasg
      ? [`https://www.gov.br/compras/pt-br?uasg=${uasg}`]
      : [];

  return {
    source: "comprasgov",
    sourceId: sourceId || generateDedupeKey(orgao, objeto, dataAbertura),
    orgao,
    unidadeCompradora: unidade,
    modalidade: modalidadeNome(raw.modalidade),
    numeroProcesso: aviso || sourceId,
    objeto,
    descricaoDetalhada: "",
    uf: (raw.uf ?? "").toUpperCase(),
    municipio: raw.nome_municipio ?? raw.municipio ?? "",
    dataPublicacao,
    dataAbertura,
    dataEncerramento: null,
    valorEstimado: toNumber(raw.valor_estimado),
    status: raw.situacao_aviso ?? "Publicado",
    links,
    dedupeKey: generateDedupeKey(orgao, objeto, dataAbertura),
  };
}

async function fetchCurrent(inicio: Date, fim: Date, uf?: string): Promise<SourceFetchResult> {
  const collected = new Map<string, NormalizedLicitacao>();
  let requestId = "";
  let pages = 0;
  let totalPages = 1;
  let totalRecords = 0;

  for (let page = 1; page <= totalPages && page <= MAX_CURRENT_PAGES; page += 1) {
    const params = new URLSearchParams({
      pagina: String(page),
      tamanhoPagina: String(PAGE_SIZE),
      dataPublicacaoPncpInicial: isoDate(inicio),
      dataPublicacaoPncpFinal: isoDate(fim),
    });
    if (uf) params.set("unidadeOrgaoUfSigla", uf.toUpperCase());
    const url = `${CURRENT_BASE}/modulo-contratacoes/1_consultarContratacoes_PNCP_14133?${params}`;
    const response = await externalHttpRequest<ModernResponse>({
      source: "comprasgov",
      operation: "contratacoes.list.current",
      url,
      expected: "json",
      timeoutMs: 25_000,
      deadlineMs: 55_000,
      maxRetries: 2,
      validator: (payload) => ModernResponseSchema.parse(payload),
    });
    requestId ||= response.requestId;
    if (!response.ok || !response.data) throw responseError(response, `Compras.gov HTTP ${response.statusCode}`);

    pages += 1;
    totalPages = Math.max(1, response.data.totalPaginas || 1);
    totalRecords = Math.max(totalRecords, response.data.totalRegistros || 0);
    for (const raw of response.data.resultado) {
      const normalized = normalizeComprasGovModern(raw);
      collected.set(normalized.sourceId || normalized.dedupeKey, normalized);
    }
    if (
      response.data.resultado.length === 0 ||
      page >= totalPages ||
      response.data.paginasRestantes === 0
    ) {
      break;
    }
  }

  return {
    data: Array.from(collected.values()),
    requestId,
    pages,
    totalPages,
    totalRecords,
    truncated: totalPages > MAX_CURRENT_PAGES,
  };
}

async function fetchLegacy(inicio: Date, fim: Date, uf?: string): Promise<SourceFetchResult> {
  const collected = new Map<string, NormalizedLicitacao>();
  let requestId = "";
  let pages = 0;
  let totalRecords = 0;
  let reachedBeforeWindow = false;
  let lastPageWasFull = false;

  for (let page = 1; page <= MAX_LEGACY_PAGES; page += 1) {
    const offset = (page - 1) * LEGACY_PAGE_SIZE;
    const ufParam = uf ? `&uf=${encodeURIComponent(uf.toUpperCase())}` : "";
    const url = `${LEGACY_BASE}/licitacoes/v1/licitacoes.json?ordenacao=-data_publicacao&tam_pagina=${LEGACY_PAGE_SIZE}&offset=${offset}${ufParam}`;
    const response = await externalHttpRequest<LegacyResponse>({
      source: "comprasgov",
      operation: "contratacoes.list.legacy-fallback",
      url,
      expected: "json",
      timeoutMs: 25_000,
      deadlineMs: 55_000,
      maxRetries: 1,
      validator: (payload) => LegacyResponseSchema.parse(payload),
    });
    requestId ||= response.requestId;
    if (!response.ok || !response.data) throw responseError(response, `Compras.gov legado HTTP ${response.statusCode}`);

    pages += 1;
    totalRecords = Math.max(totalRecords, response.data.count ?? 0);
    const rows = response.data._embedded?.licitacoes ?? [];
    lastPageWasFull = rows.length >= LEGACY_PAGE_SIZE;
    if (!rows.length) break;

    for (const raw of rows) {
      const published = parseDate(raw.data_publicacao);
      if (!published) continue;
      if (published.getTime() < inicio.getTime()) reachedBeforeWindow = true;
      if (published.getTime() >= inicio.getTime() && published.getTime() <= fim.getTime() + 86_400_000) {
        const normalized = normalizeComprasLicitacao(raw);
        collected.set(normalized.sourceId || normalized.dedupeKey, normalized);
      }
    }
    if (reachedBeforeWindow) break;
  }

  return {
    data: Array.from(collected.values()),
    requestId,
    pages,
    totalPages: pages,
    totalRecords,
    truncated: pages >= MAX_LEGACY_PAGES && lastPageWasFull && !reachedBeforeWindow,
  };
}

export async function buscarLicitacoesComprasGovResult(
  inicio: Date,
  fim: Date,
  uf?: string,
): Promise<IntegrationResult<NormalizedLicitacao[]>> {
  const startedAt = Date.now();
  try {
    const current = await fetchCurrent(inicio, fim, uf);
    return successResult({
      source: "comprasgov",
      operation: "contratacoes.list",
      data: current.data,
      startedAt,
      requestId: current.requestId,
      status: current.truncated ? "PARTIAL" : undefined,
      metadata: {
        pages: current.pages,
        records: current.data.length,
        sourceTotalPages: current.totalPages,
        sourceTotalRecords: current.totalRecords,
        partial: current.truncated,
        sourceUrl: CURRENT_BASE,
        schemaVersion: "comprasgov-2026-v2",
      },
    });
  } catch (currentError) {
    const currentFailure = classifyThrownError(currentError);
    try {
      const legacy = await fetchLegacy(inicio, fim, uf);
      return successResult({
        source: "comprasgov",
        operation: "contratacoes.list",
        data: legacy.data,
        startedAt,
        requestId: legacy.requestId,
        status: "PARTIAL",
        metadata: {
          pages: legacy.pages,
          records: legacy.data.length,
          sourceTotalRecords: legacy.totalRecords,
          partial: true,
          sourceUrl: LEGACY_BASE,
          schemaVersion: `legacy-fallback:${currentFailure.type}${legacy.truncated ? ":truncated" : ""}`,
        },
      });
    } catch (legacyError) {
      const legacyFailure = classifyThrownError(legacyError);
      return failureResult({
        source: "comprasgov",
        operation: "contratacoes.list",
        data: [],
        startedAt,
        error: new IntegrationError(
          `API atual: ${currentFailure.message} | fallback legado: ${legacyFailure.message}`.slice(0, 2_000),
          {
            type: legacyFailure.type,
            retryable: currentFailure.retryable || legacyFailure.retryable,
            upstreamStatus: legacyFailure.upstreamStatus ?? currentFailure.upstreamStatus,
            code: legacyFailure.code ?? currentFailure.code,
          },
        ),
        metadata: { partial: true, sourceUrl: CURRENT_BASE },
      });
    }
  }
}

/** Compatibilidade: consumidores legados recebem dados, mas falha real lança. */
export async function buscarLicitacoesComprasGov(
  inicio: Date,
  fim: Date,
  uf?: string,
): Promise<NormalizedLicitacao[]> {
  const result = await buscarLicitacoesComprasGovResult(inicio, fim, uf);
  if (["UNAVAILABLE", "TIMEOUT", "RATE_LIMITED", "AUTH_ERROR", "CONTRACT_ERROR", "CONFIG_ERROR"].includes(result.status)) {
    throw new Error(result.error?.message ?? "Compras.gov indisponível.");
  }
  return result.data;
}
