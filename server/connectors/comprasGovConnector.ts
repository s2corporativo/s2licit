/**
 * Compras.gov.br — fonte oficial complementar do Radar.
 *
 * Estratégia:
 * 1) API oficial atual de Dados Abertos (Módulo 07 - Contratações 14.133);
 * 2) fallback temporário para o endpoint SIASG legado quando a API atual estiver
 *    indisponível/incompatível;
 * 3) nunca converte falha em lista vazia silenciosa.
 */
import { z } from "zod";
import { parseDate, generateDedupeKey } from "./baseConnector";
import type { NormalizedLicitacao } from "./baseConnector";
import { externalHttpRequest } from "../integrations/core/externalHttpClient";
import { classifyThrownError, IntegrationError } from "../integrations/core/integrationError";
import { failureResult, successResult } from "../integrations/core/integrationResult";
import type { IntegrationResult } from "../integrations/core/types";

const CURRENT_BASE = "https://dadosabertos.compras.gov.br";
const LEGACY_BASE = "https://compras.dados.gov.br";
const PAGE_SIZE = 250;
const MAX_PAGES = 12;

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
  paginasRestantes: z.number().optional().default(0),
}).passthrough();

type ModernRaw = z.infer<typeof ModernRawSchema>;

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

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const normalized = value.includes(",")
    ? value.replace(/\./g, "").replace(",", ".")
    : value;
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
  const links = [raw.linkSistemaOrigem, numeroControle ? `https://pncp.gov.br/app/editais/${numeroControle}` : null]
    .filter((link): link is string => Boolean(link));

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

async function fetchCurrent(
  inicio: Date,
  fim: Date,
  uf?: string,
): Promise<{ data: NormalizedLicitacao[]; requestId: string; pages: number }> {
  const collected = new Map<string, NormalizedLicitacao>();
  let requestId = "";
  let pages = 0;
  let totalPages = 1;

  for (let page = 1; page <= Math.min(totalPages, MAX_PAGES); page++) {
    const params = new URLSearchParams({
      pagina: String(page),
      tamanhoPagina: String(PAGE_SIZE),
      dataPublicacaoPncpInicial: isoDate(inicio),
      dataPublicacaoPncpFinal: isoDate(fim),
    });
    if (uf) params.set("unidadeOrgaoUfSigla", uf.toUpperCase());
    const url = `${CURRENT_BASE}/modulo-contratacoes/1_consultarContratacoes_PNCP_14133?${params}`;
    const response = await externalHttpRequest<unknown>({
      source: "comprasgov",
      operation: "contratacoes.list.current",
      url,
      expected: "json",
      timeoutMs: 25_000,
      maxRetries: 2,
    });
    requestId ||= response.requestId;
    if (!response.ok || !response.data) {
      throw new IntegrationError(response.error?.message ?? `Compras.gov HTTP ${response.statusCode}`, {
        type: response.error?.type === "TIMEOUT" ? "TIMEOUT" : response.error?.type === "RATE_LIMIT" ? "RATE_LIMIT" : "UPSTREAM",
        retryable: response.error?.retryable ?? false,
        upstreamStatus: response.statusCode || undefined,
      });
    }
    const parsed = ModernResponseSchema.safeParse(response.data);
    if (!parsed.success) {
      throw new IntegrationError("Contrato da API atual do Compras.gov divergiu do schema esperado.", {
        type: "CONTRACT",
        code: "COMPRASGOV_CURRENT_SCHEMA",
        cause: parsed.error,
      });
    }
    pages += 1;
    totalPages = Math.max(1, parsed.data.totalPaginas || 1);
    for (const raw of parsed.data.resultado) {
      const normalized = normalizeComprasGovModern(raw);
      collected.set(normalized.sourceId || normalized.dedupeKey, normalized);
    }
    if (parsed.data.resultado.length === 0 || parsed.data.paginasRestantes === 0) break;
  }

  return { data: Array.from(collected.values()), requestId, pages };
}

async function fetchLegacy(
  inicio: Date,
  fim: Date,
  uf?: string,
): Promise<{ data: NormalizedLicitacao[]; requestId: string; pages: number }> {
  const collected = new Map<string, NormalizedLicitacao>();
  let requestId = "";
  let pages = 0;
  for (let page = 1; page <= 8; page++) {
    const offset = (page - 1) * 500;
    const ufParam = uf ? `&uf=${encodeURIComponent(uf.toUpperCase())}` : "";
    const url = `${LEGACY_BASE}/licitacoes/v1/licitacoes.json?ordenacao=-data_publicacao&tam_pagina=500&offset=${offset}${ufParam}`;
    const response = await externalHttpRequest<unknown>({
      source: "comprasgov",
      operation: "contratacoes.list.legacy-fallback",
      url,
      expected: "json",
      timeoutMs: 25_000,
      maxRetries: 1,
    });
    requestId ||= response.requestId;
    if (!response.ok || !response.data) {
      throw new IntegrationError(response.error?.message ?? `Compras.gov legado HTTP ${response.statusCode}`, {
        type: "UPSTREAM",
        retryable: response.error?.retryable ?? false,
        upstreamStatus: response.statusCode || undefined,
      });
    }
    const parsed = LegacyResponseSchema.safeParse(response.data);
    if (!parsed.success) {
      throw new IntegrationError("Contrato do fallback legado do Compras.gov divergiu do esperado.", {
        type: "CONTRACT",
        code: "COMPRASGOV_LEGACY_SCHEMA",
        cause: parsed.error,
      });
    }
    pages += 1;
    const rows = parsed.data._embedded?.licitacoes ?? [];
    if (!rows.length) break;
    let reachedBeforeWindow = false;
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
  return { data: Array.from(collected.values()), requestId, pages };
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
      metadata: {
        pages: current.pages,
        records: current.data.length,
        sourceUrl: CURRENT_BASE,
        schemaVersion: "comprasgov-2026-v2",
      },
    });
  } catch (currentError) {
    try {
      const legacy = await fetchLegacy(inicio, fim, uf);
      const error = classifyThrownError(currentError);
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
          partial: true,
          sourceUrl: LEGACY_BASE,
          schemaVersion: `legacy-fallback:${error.type}`,
        },
      });
    } catch (legacyError) {
      return failureResult({
        source: "comprasgov",
        operation: "contratacoes.list",
        data: [],
        startedAt,
        error: classifyThrownError(legacyError),
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
