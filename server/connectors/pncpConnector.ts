/**
 * PNCP — adapter oficial de contratações, itens e resultados homologados.
 *
 * Toda comunicação passa pelo ExternalHttpClient e toda resposta externa é
 * validada antes de virar modelo de domínio.
 */
import { z } from "zod";
import { parseDate, generateDedupeKey } from "./baseConnector";
import type { NormalizedLicitacao } from "./baseConnector";
import { externalHttpRequest } from "../integrations/core/externalHttpClient";
import { IntegrationError } from "../integrations/core/integrationError";
import { failureResult, successResult } from "../integrations/core/integrationResult";
import type { IntegrationResult } from "../integrations/core/types";

const PNCP_CONSULTA_BASE = "https://pncp.gov.br/api/consulta";
const PNCP_ORGAOS_BASE = "https://pncp.gov.br/api/pncp";
const MAX_PUBLICACAO_PAGES = 20;
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

export interface PncpItemResultado {
  numeroItem: number;
  fornecedorNome: string | null;
  fornecedorCnpjCpf: string | null;
  quantidadeHomologada: number | null;
  valorUnitarioHomologado: number | null;
  valorTotalHomologado: number | null;
  dataResultado: string | null;
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
    return { rows, totalPaginas: Number.isFinite(totalPaginas) && totalPaginas > 0 ? totalPaginas : 1 };
  }
  return { rows: [], totalPaginas: 1 };
}

export async function buscarLicitacoesPNCP(
  dataInicial: string,
  dataFinal: string,
  pagina = 1,
  tamanhoPagina = PAGE_SIZE,
  codigoModalidade = 8,
): Promise<{ data: PncpLicitacao[]; totalRegistros: number; totalPaginas: number }> {
  const params = new URLSearchParams({
    dataInicial,
    dataFinal,
    pagina: String(pagina),
    tamanhoPagina: String(Math.min(tamanhoPagina, PAGE_SIZE)),
    codigoModalidadeContratacao: String(codigoModalidade),
  });
  const url = `${PNCP_CONSULTA_BASE}/v1/contratacoes/publicacao?${params}`;
  const response = await externalHttpRequest<unknown>({
    source: "pncp",
    operation: "contratacoes.publicacao",
    url,
    expected: "json",
    timeoutMs: 25_000,
    maxRetries: 2,
  });
  if (!response.ok || !response.data) {
    throw new IntegrationError(response.error?.message ?? `PNCP HTTP ${response.statusCode}`, {
      type: response.error?.type === "TIMEOUT" ? "TIMEOUT" : response.error?.type === "RATE_LIMIT" ? "RATE_LIMIT" : "UPSTREAM",
      retryable: response.error?.retryable ?? false,
      upstreamStatus: response.statusCode || undefined,
    });
  }
  const parsed = PncpPublicacaoResponseSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new IntegrationError("Contrato da consulta de publicações do PNCP divergiu do schema esperado.", {
      type: "CONTRACT",
      code: "PNCP_PUBLICACAO_SCHEMA",
      cause: parsed.error,
    });
  }
  return {
    data: parsed.data.data,
    totalRegistros: parsed.data.totalRegistros,
    totalPaginas: parsed.data.totalPaginas,
  };
}

export async function buscarLicitacoesMultiModalidadeResult(
  dataInicial: string,
  dataFinal: string,
  modalidades = [8, 6],
): Promise<IntegrationResult<PncpLicitacao[]>> {
  const startedAt = Date.now();
  const collected = new Map<string, PncpLicitacao>();
  const errors: string[] = [];
  let pages = 0;
  for (const modalidade of modalidades) {
    try {
      let pagina = 1;
      let totalPaginas = 1;
      while (pagina <= totalPaginas && pagina <= MAX_PUBLICACAO_PAGES) {
        const result = await buscarLicitacoesPNCP(dataInicial, dataFinal, pagina, PAGE_SIZE, modalidade);
        pages += 1;
        totalPaginas = Math.max(1, result.totalPaginas);
        for (const licitacao of result.data) collected.set(licitacao.numeroControlePNCP, licitacao);
        pagina += 1;
      }
    } catch (error) {
      errors.push(`Modalidade ${modalidade}: ${(error as Error).message}`);
    }
  }
  if (errors.length === modalidades.length) {
    return failureResult({
      source: "pncp",
      operation: "contratacoes.multi-modalidade",
      data: [],
      startedAt,
      error: new IntegrationError(errors.join(" | "), { type: "UPSTREAM", retryable: true }),
      metadata: { pages, records: 0, sourceUrl: PNCP_CONSULTA_BASE },
    });
  }
  return successResult({
    source: "pncp",
    operation: "contratacoes.multi-modalidade",
    data: Array.from(collected.values()),
    startedAt,
    status: errors.length ? "PARTIAL" : undefined,
    metadata: {
      pages,
      records: collected.size,
      partial: errors.length > 0,
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
    const results = await Promise.all(modalidades.map((modalidade) => buscarLicitacoesPNCP(dataInicial, dataFinal, pagina, PAGE_SIZE, modalidade)));
    const data = results.flatMap((result) => result.data);
    return {
      data,
      totalRegistros: results.reduce((sum, result) => sum + result.totalRegistros, 0),
      totalPaginas: Math.max(1, ...results.map((result) => result.totalPaginas)),
    };
  }
  const result = await buscarLicitacoesMultiModalidadeResult(dataInicial, dataFinal, modalidades);
  if (["UNAVAILABLE", "TIMEOUT", "RATE_LIMITED", "AUTH_ERROR", "CONTRACT_ERROR", "CONFIG_ERROR"].includes(result.status)) {
    throw new Error(result.error?.message ?? "PNCP indisponível.");
  }
  return { data: result.data, totalRegistros: result.data.length, totalPaginas: result.metadata?.pages ?? 1 };
}

async function fetchPagedOrgResource(
  operation: string,
  baseUrl: string,
): Promise<unknown[]> {
  const first = await externalHttpRequest<unknown>({
    source: "pncp",
    operation,
    url: baseUrl,
    expected: "json",
    timeoutMs: 25_000,
    maxRetries: 2,
  });
  if (!first.ok) {
    if (first.statusCode === 404) return [];
    throw new IntegrationError(first.error?.message ?? `PNCP HTTP ${first.statusCode}`, {
      type: first.error?.type === "TIMEOUT" ? "TIMEOUT" : "UPSTREAM",
      retryable: first.error?.retryable ?? false,
      upstreamStatus: first.statusCode || undefined,
    });
  }
  const unwrapped = unwrapArrayPayload(first.data);
  const rows = [...unwrapped.rows];
  // O manual atual pode retornar lista integral. Se houver metadados explícitos
  // de paginação, percorremos as demais páginas; caso contrário, não inventamos
  // query params não declarados pelo contrato.
  if (unwrapped.totalPaginas > 1) {
    for (let page = 2; page <= Math.min(unwrapped.totalPaginas, 100); page++) {
      const separator = baseUrl.includes("?") ? "&" : "?";
      const response = await externalHttpRequest<unknown>({
        source: "pncp",
        operation,
        url: `${baseUrl}${separator}pagina=${page}&tamanhoPagina=500`,
        expected: "json",
        timeoutMs: 25_000,
        maxRetries: 2,
      });
      if (!response.ok) {
        throw new IntegrationError(response.error?.message ?? `PNCP HTTP ${response.statusCode}`, {
          type: "UPSTREAM",
          retryable: response.error?.retryable ?? false,
          upstreamStatus: response.statusCode || undefined,
        });
      }
      rows.push(...unwrapArrayPayload(response.data).rows);
    }
  }
  return rows;
}

export async function buscarItensPNCP(cnpj: string, ano: number, sequencial: number): Promise<PncpItem[]> {
  const url = `${PNCP_ORGAOS_BASE}/v1/orgaos/${cnpj}/compras/${ano}/${sequencial}/itens`;
  const rows = await fetchPagedOrgResource("compras.itens", url);
  const parsed = z.array(PncpItemSchema).safeParse(rows);
  if (!parsed.success) {
    throw new IntegrationError("Contrato de itens do PNCP divergiu do schema esperado.", {
      type: "CONTRACT",
      code: "PNCP_ITENS_SCHEMA",
      cause: parsed.error,
    });
  }
  return parsed.data.map((item) => ({
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
  const rows = await fetchPagedOrgResource("compras.itens.resultados", url);
  const parsed = z.array(PncpResultadoSchema).safeParse(rows);
  if (!parsed.success) {
    throw new IntegrationError("Contrato de resultados do PNCP divergiu do schema esperado.", {
      type: "CONTRACT",
      code: "PNCP_RESULTADOS_SCHEMA",
      cause: parsed.error,
    });
  }
  return parsed.data.map((row) => ({
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
