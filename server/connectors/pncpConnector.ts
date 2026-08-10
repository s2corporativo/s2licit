/**
 * PNCP — adapter oficial de contratações, itens e resultados homologados.
 *
 * Toda comunicação passa pelo ExternalHttpClient e toda resposta externa é
 * validada dentro da fronteira de transporte antes de virar modelo de domínio.
 */
import { z } from "zod";
import { generateDedupeKey, parseDate } from "./baseConnector";
import type { NormalizedLicitacao } from "./baseConnector";
import { externalHttpRequest } from "../integrations/core/externalHttpClient";
import { classifyThrownError, IntegrationError } from "../integrations/core/integrationError";
import { failureResult, successResult } from "../integrations/core/integrationResult";
import type { ExternalHttpResponse, IntegrationResult } from "../integrations/core/types";

const PNCP_CONSULTA_BASE = "https://pncp.gov.br/api/consulta";
const PNCP_ORGAOS_BASE = "https://pncp.gov.br/api/pncp";
const MAX_PUBLICACAO_PAGES = 20;
const MAX_ORG_RESOURCE_PAGES = 100;
const PAGE_SIZE = 50;

const PncpLicitacaoSchema = z.object({
  numeroControlePNCP: z.string(),
  orgaoEntidade: z.object({
    cnpj: z.string(),
    razaoSocial: z.string(),
    ufNome: z.string().optional().nullable(),
    municipioNome: z.string().optional().nullable(),
    poderId: z.string().optional().nullable(),
    esferaId: z.string().optional().nullable(),
  }).passthrough(),
  unidadeOrgao: z.object({
    ufNome: z.string().optional().nullable(),
    ufSigla: z.string().optional().nullable(),
    municipioNome: z.string().optional().nullable(),
    codigoIbge: z.union([z.string(), z.number()]).optional().nullable(),
    nomeUnidade: z.string().optional().nullable(),
  }).passthrough().optional().nullable(),
  modalidadeId: z.number().optional().nullable(),
  modalidadeNome: z.string().optional().nullable(),
  objetoCompra: z.string().optional().nullable(),
  informacaoComplementar: z.string().optional().nullable(),
  dataPublicacaoPncp: z.string().optional().nullable(),
  dataAberturaProposta: z.string().optional().nullable(),
  dataEncerramentoProposta: z.string().optional().nullable(),
  dataInclusao: z.string().optional().nullable(),
  valorTotalEstimado: z.number().optional().nullable(),
  valorTotalHomologado: z.number().optional().nullable(),
  situacaoCompraId: z.number().optional().nullable(),
  situacaoCompraNome: z.string().optional().nullable(),
  linkSistemaOrigem: z.string().optional().nullable(),
  anoCompra: z.number().optional().nullable(),
  sequencialCompra: z.number().optional().nullable(),
  srp: z.boolean().optional().nullable(),
  modoDisputaNome: z.string().optional().nullable(),
  tipoInstrumentoConvocatorioNome: z.string().optional().nullable(),
}).passthrough();

const PncpPublicacaoResponseSchema = z.object({
  data: z.array(PncpLicitacaoSchema).default([]),
  totalRegistros: z.number().optional().default(0),
  totalPaginas: z.number().optional().default(1),
  paginasRestantes: z.number().optional(),
}).passthrough();

export type PncpLicitacao = z.infer<typeof PncpLicitacaoSchema>;
type PncpPublicacaoResponse = z.infer<typeof PncpPublicacaoResponseSchema>;

const PncpItemSchema = z.object({
  numeroItem: z.number(),
  descricao: z.string().default(""),
  quantidade: z.number().optional().nullable(),
  unidadeMedida: z.string().optional().nullable(),
  valorUnitarioEstimado: z.number().optional().nullable(),
  valorTotal: z.number().optional().nullable(),
  catalogoItemId: z.union([z.string(), z.number()]).optional().nullable(),
  categoriaItem: z.string().optional().nullable(),
}).passthrough();

type PncpRawItem = z.infer<typeof PncpItemSchema>;

export interface PncpItem {
  numeroItem: number;
  descricao: string;
  quantidade?: number;
  unidadeMedida?: string;
  valorUnitarioEstimado?: number;
  valorTotal?: number;
  catalogoItemId?: string;
  categoriaItem?: string;
}

const PncpResultadoSchema = z.object({
  niFornecedor: z.string().optional().nullable(),
  nomeRazaoSocialFornecedor: z.string().optional().nullable(),
  quantidadeHomologada: z.number().optional().nullable(),
  valorUnitarioHomologado: z.number().optional().nullable(),
  valorTotalHomologado: z.number().optional().nullable(),
  dataResultado: z.string().optional().nullable(),
  dataResultadoPncp: z.string().optional().nullable(),
}).passthrough();

type PncpRawResultado = z.infer<typeof PncpResultadoSchema>;

export interface PncpItemResultado {
  numeroItem: number;
  fornecedorNome: string | null;
  fornecedorCnpjCpf: string | null;
  quantidadeHomologada: number | null;
  valorUnitarioHomologado: number | null;
  valorTotalHomologado: number | null;
  dataResultado: string | null;
}

interface PncpPageResult {
  data: PncpLicitacao[];
  totalRegistros: number;
  totalPaginas: number;
  requestId: string;
  durationMs: number;
}

interface ModalidadeResult {
  modalidade: number;
  data: PncpLicitacao[];
  pagesFetched: number;
  totalPages: number;
  totalRecords: number;
  truncated: boolean;
  requestId: string | null;
}

interface PagedPayload<T> {
  rows: T[];
  totalPaginas: number;
}

function responseError<T>(response: ExternalHttpResponse<T>, fallback: string): IntegrationError {
  return new IntegrationError(response.error?.message ?? fallback, {
    type: response.error?.type ?? "UPSTREAM",
    retryable: response.error?.retryable ?? false,
    upstreamStatus: response.statusCode || undefined,
    code: response.error?.code,
  });
}

function unwrapArrayPayload(payload: unknown): { rows: unknown[]; totalPaginas: number } {
  if (Array.isArray(payload)) return { rows: payload, totalPaginas: 1 };
  if (payload && typeof payload === "object") {
    const object = payload as Record<string, unknown>;
    const rows = Array.isArray(object.data)
      ? object.data
      : Array.isArray(object.resultado)
        ? object.resultado
        : [];
    const totalPaginas = Number(object.totalPaginas ?? object.totalPages ?? 1);
    return {
      rows,
      totalPaginas: Number.isFinite(totalPaginas) && totalPaginas > 0 ? Math.floor(totalPaginas) : 1,
    };
  }
  return { rows: [], totalPaginas: 1 };
}

function pageValidator<T>(schema: z.ZodType<T>): (payload: unknown) => PagedPayload<T> {
  return (payload) => {
    const unwrapped = unwrapArrayPayload(payload);
    return {
      rows: z.array(schema).parse(unwrapped.rows),
      totalPaginas: unwrapped.totalPaginas,
    };
  };
}

export async function buscarLicitacoesPNCP(
  dataInicial: string,
  dataFinal: string,
  pagina = 1,
  tamanhoPagina = PAGE_SIZE,
  codigoModalidade = 8,
): Promise<PncpPageResult> {
  const params = new URLSearchParams({
    dataInicial,
    dataFinal,
    pagina: String(pagina),
    tamanhoPagina: String(Math.min(Math.max(1, tamanhoPagina), PAGE_SIZE)),
    codigoModalidadeContratacao: String(codigoModalidade),
  });
  const url = `${PNCP_CONSULTA_BASE}/v1/contratacoes/publicacao?${params}`;
  const response = await externalHttpRequest<PncpPublicacaoResponse>({
    source: "pncp",
    operation: "contratacoes.publicacao",
    url,
    expected: "json",
    timeoutMs: 25_000,
    deadlineMs: 55_000,
    maxRetries: 2,
    validator: (payload) => PncpPublicacaoResponseSchema.parse(payload),
  });
  if (!response.ok || !response.data) throw responseError(response, `PNCP HTTP ${response.statusCode}`);

  return {
    data: response.data.data,
    totalRegistros: response.data.totalRegistros,
    totalPaginas: Math.max(1, response.data.totalPaginas),
    requestId: response.requestId,
    durationMs: response.durationMs,
  };
}

async function fetchModalidadeAll(
  dataInicial: string,
  dataFinal: string,
  modalidade: number,
): Promise<ModalidadeResult> {
  const collected = new Map<string, PncpLicitacao>();
  let pagina = 1;
  let totalPages = 1;
  let totalRecords = 0;
  let pagesFetched = 0;
  let requestId: string | null = null;

  while (pagina <= totalPages && pagina <= MAX_PUBLICACAO_PAGES) {
    const result = await buscarLicitacoesPNCP(dataInicial, dataFinal, pagina, PAGE_SIZE, modalidade);
    requestId ??= result.requestId;
    pagesFetched += 1;
    totalPages = Math.max(1, result.totalPaginas);
    totalRecords = Math.max(totalRecords, result.totalRegistros);
    for (const licitacao of result.data) collected.set(licitacao.numeroControlePNCP, licitacao);
    pagina += 1;
  }

  return {
    modalidade,
    data: Array.from(collected.values()),
    pagesFetched,
    totalPages,
    totalRecords,
    truncated: totalPages > MAX_PUBLICACAO_PAGES,
    requestId,
  };
}

/**
 * Modalidades independentes são processadas em paralelo; páginas da mesma
 * modalidade permanecem sequenciais. Com M<=6 e cap de 20 páginas, memória de
 * resultados é deterministicamente limitada ao volume retornado por 120 páginas.
 */
export async function buscarLicitacoesMultiModalidadeResult(
  dataInicial: string,
  dataFinal: string,
  modalidades = [8, 6],
): Promise<IntegrationResult<PncpLicitacao[]>> {
  const startedAt = Date.now();
  if (!modalidades.length) {
    return successResult({
      source: "pncp",
      operation: "contratacoes.multi-modalidade",
      data: [],
      startedAt,
      metadata: { pages: 0, records: 0, sourceUrl: PNCP_CONSULTA_BASE, schemaVersion: "pncp-2.5" },
    });
  }

  const settled = await Promise.allSettled(
    modalidades.map((modalidade) => fetchModalidadeAll(dataInicial, dataFinal, modalidade)),
  );
  const successes = settled
    .filter((result): result is PromiseFulfilledResult<ModalidadeResult> => result.status === "fulfilled")
    .map((result) => result.value);
  const failures = settled
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => classifyThrownError(result.reason));

  if (!successes.length) {
    const primary = failures[0] ?? new IntegrationError("PNCP indisponível.", { type: "UPSTREAM", retryable: true });
    const message = failures.map((error) => error.message).join(" | ") || primary.message;
    return failureResult({
      source: "pncp",
      operation: "contratacoes.multi-modalidade",
      data: [],
      startedAt,
      error: new IntegrationError(message.slice(0, 2_000), {
        type: primary.type,
        retryable: failures.some((error) => error.retryable),
        upstreamStatus: primary.upstreamStatus,
        code: primary.code,
      }),
      metadata: { pages: 0, records: 0, sourceUrl: PNCP_CONSULTA_BASE, schemaVersion: "pncp-2.5" },
    });
  }

  const collected = new Map<string, PncpLicitacao>();
  for (const result of successes) {
    for (const licitacao of result.data) collected.set(licitacao.numeroControlePNCP, licitacao);
  }
  const truncated = successes.some((result) => result.truncated);
  const partial = failures.length > 0 || truncated;
  const pagesFetched = successes.reduce((sum, result) => sum + result.pagesFetched, 0);
  const sourceTotalPages = Math.max(1, ...successes.map((result) => result.totalPages));
  const sourceTotalRecords = successes.reduce((sum, result) => sum + result.totalRecords, 0);

  return successResult({
    source: "pncp",
    operation: "contratacoes.multi-modalidade",
    data: Array.from(collected.values()),
    startedAt,
    requestId: successes.find((result) => result.requestId)?.requestId ?? undefined,
    status: partial ? "PARTIAL" : undefined,
    metadata: {
      pages: pagesFetched,
      records: collected.size,
      sourceTotalPages,
      sourceTotalRecords,
      partial,
      sourceUrl: PNCP_CONSULTA_BASE,
      schemaVersion: "pncp-2.5",
    },
  });
}

/** Compatibilidade com consumidores antigos. */
export async function buscarLicitacoesMultiModalidade(
  dataInicial: string,
  dataFinal: string,
  pagina = 1,
  modalidades = [8, 6],
): Promise<{ data: PncpLicitacao[]; totalRegistros: number; totalPaginas: number }> {
  if (pagina !== 1) {
    const results = await Promise.all(
      modalidades.map((modalidade) => buscarLicitacoesPNCP(dataInicial, dataFinal, pagina, PAGE_SIZE, modalidade)),
    );
    return {
      data: results.flatMap((result) => result.data),
      totalRegistros: results.reduce((sum, result) => sum + result.totalRegistros, 0),
      totalPaginas: Math.max(1, ...results.map((result) => result.totalPaginas)),
    };
  }

  const result = await buscarLicitacoesMultiModalidadeResult(dataInicial, dataFinal, modalidades);
  if (["UNAVAILABLE", "TIMEOUT", "RATE_LIMITED", "AUTH_ERROR", "CONTRACT_ERROR", "CONFIG_ERROR"].includes(result.status)) {
    throw new Error(result.error?.message ?? "PNCP indisponível.");
  }
  return {
    data: result.data,
    totalRegistros: result.metadata?.sourceTotalRecords ?? result.data.length,
    totalPaginas: result.metadata?.sourceTotalPages ?? 1,
  };
}

async function fetchPagedOrgResource<T>(
  operation: string,
  baseUrl: string,
  schema: z.ZodType<T>,
): Promise<T[]> {
  const first = await externalHttpRequest<PagedPayload<T>>({
    source: "pncp",
    operation,
    url: baseUrl,
    expected: "json",
    timeoutMs: 25_000,
    deadlineMs: 55_000,
    maxRetries: 2,
    validator: pageValidator(schema),
  });
  if (!first.ok || !first.data) {
    if (first.statusCode === 404) return [];
    throw responseError(first, `PNCP HTTP ${first.statusCode}`);
  }

  if (first.data.totalPaginas > MAX_ORG_RESOURCE_PAGES) {
    throw new IntegrationError(
      `PNCP informou ${first.data.totalPaginas} páginas para ${operation}, acima do limite seguro de ${MAX_ORG_RESOURCE_PAGES}.`,
      { type: "CONTRACT", code: "PNCP_PAGINATION_LIMIT_EXCEEDED" },
    );
  }

  const rows = [...first.data.rows];
  for (let page = 2; page <= first.data.totalPaginas; page += 1) {
    const separator = baseUrl.includes("?") ? "&" : "?";
    const response = await externalHttpRequest<PagedPayload<T>>({
      source: "pncp",
      operation,
      url: `${baseUrl}${separator}pagina=${page}&tamanhoPagina=500`,
      expected: "json",
      timeoutMs: 25_000,
      deadlineMs: 55_000,
      maxRetries: 2,
      validator: pageValidator(schema),
    });
    if (!response.ok || !response.data) throw responseError(response, `PNCP HTTP ${response.statusCode}`);
    rows.push(...response.data.rows);
  }
  return rows;
}

export async function buscarItensPNCP(cnpj: string, ano: number, sequencial: number): Promise<PncpItem[]> {
  const url = `${PNCP_ORGAOS_BASE}/v1/orgaos/${cnpj}/compras/${ano}/${sequencial}/itens`;
  const rows = await fetchPagedOrgResource<PncpRawItem>("compras.itens", url, PncpItemSchema);
  return rows.map((item) => ({
    numeroItem: item.numeroItem,
    descricao: item.descricao,
    quantidade: item.quantidade ?? undefined,
    unidadeMedida: item.unidadeMedida ?? undefined,
    valorUnitarioEstimado: item.valorUnitarioEstimado ?? undefined,
    valorTotal: item.valorTotal ?? undefined,
    catalogoItemId: item.catalogoItemId != null ? String(item.catalogoItemId) : undefined,
    categoriaItem: item.categoriaItem ?? undefined,
  }));
}

export async function buscarResultadosItemPNCP(
  cnpj: string,
  ano: number,
  sequencial: number,
  numeroItem: number,
): Promise<PncpItemResultado[]> {
  const url = `${PNCP_ORGAOS_BASE}/v1/orgaos/${cnpj}/compras/${ano}/${sequencial}/itens/${numeroItem}/resultados`;
  const rows = await fetchPagedOrgResource<PncpRawResultado>("compras.itens.resultados", url, PncpResultadoSchema);
  return rows.map((row) => ({
    numeroItem,
    fornecedorNome: row.nomeRazaoSocialFornecedor ?? row.niFornecedor ?? null,
    fornecedorCnpjCpf: row.niFornecedor ?? null,
    quantidadeHomologada: row.quantidadeHomologada ?? null,
    valorUnitarioHomologado: row.valorUnitarioHomologado ?? null,
    valorTotalHomologado: row.valorTotalHomologado ?? null,
    dataResultado: row.dataResultado ?? row.dataResultadoPncp ?? null,
  }));
}

export function estatisticasPreco(resultados: PncpItemResultado[]): {
  amostras: number;
  media: number | null;
  minimo: number | null;
  maximo: number | null;
  mediana: number | null;
} {
  let valores = resultados
    .map((resultado) => resultado.valorUnitarioHomologado)
    .filter((valor): valor is number => typeof valor === "number" && valor > 0)
    .sort((a, b) => a - b);
  if (!valores.length) return { amostras: 0, media: null, minimo: null, maximo: null, mediana: null };

  if (valores.length >= 8) {
    const quantil = (percentual: number) => {
      const index = (valores.length - 1) * percentual;
      const low = Math.floor(index);
      const high = Math.ceil(index);
      return valores[low] + (valores[high] - valores[low]) * (index - low);
    };
    const q1 = quantil(0.25);
    const q3 = quantil(0.75);
    const iqr = q3 - q1;
    const filtered = valores.filter((valor) => valor >= q1 - 1.5 * iqr && valor <= q3 + 1.5 * iqr);
    if (filtered.length >= 4) valores = filtered;
  }

  const sum = valores.reduce((total, value) => total + value, 0);
  const middle = Math.floor(valores.length / 2);
  const median = valores.length % 2 === 0 ? (valores[middle - 1] + valores[middle]) / 2 : valores[middle];
  return {
    amostras: valores.length,
    media: Number((sum / valores.length).toFixed(2)),
    minimo: valores[0],
    maximo: valores[valores.length - 1],
    mediana: Number(median.toFixed(2)),
  };
}

export function normalizePncpLicitacao(licitacao: PncpLicitacao): NormalizedLicitacao {
  const orgao = licitacao.orgaoEntidade?.razaoSocial ?? "";
  const unidade = licitacao.unidadeOrgao?.nomeUnidade ?? orgao;
  const objeto = licitacao.objetoCompra ?? "";
  const dataAbertura = parseDate(licitacao.dataAberturaProposta);
  const dataEncerramento = parseDate(licitacao.dataEncerramentoProposta);
  const dataPublicacao = parseDate(licitacao.dataPublicacaoPncp ?? licitacao.dataInclusao);
  const links = [licitacao.linkSistemaOrigem].filter((link): link is string => Boolean(link));
  return {
    source: "pncp",
    sourceId: licitacao.numeroControlePNCP,
    orgao,
    unidadeCompradora: unidade,
    modalidade: licitacao.modalidadeNome ?? `Modalidade ${licitacao.modalidadeId ?? ""}`,
    numeroProcesso: licitacao.numeroControlePNCP,
    objeto,
    descricaoDetalhada: licitacao.informacaoComplementar ?? "",
    uf: licitacao.unidadeOrgao?.ufSigla ?? licitacao.orgaoEntidade?.ufNome ?? "",
    municipio: licitacao.unidadeOrgao?.municipioNome ?? licitacao.orgaoEntidade?.municipioNome ?? "",
    dataPublicacao,
    dataAbertura,
    dataEncerramento,
    valorEstimado: licitacao.valorTotalEstimado ?? 0,
    status: licitacao.situacaoCompraNome ?? "Divulgada",
    links,
    dedupeKey: generateDedupeKey(orgao, objeto, dataAbertura),
  };
}
