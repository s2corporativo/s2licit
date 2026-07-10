/**
 * pncpConnector.ts
 * Connector robusto para a API do PNCP usando baseConnector
 *
 * Melhorias em relação ao pncpService.ts:
 * - Verificação de content-type antes de parsear JSON (corrige erro <!DOCTYPE)
 * - Registro em api_logs com raw_sample
 * - Retry com backoff exponencial
 * - Normalização para NormalizedLicitacao
 * - Integração com sync_runs para rastreabilidade
 */

import { robustFetch, parseDate, generateDedupeKey, startSyncRun, finishSyncRun } from "./baseConnector";
import type { NormalizedLicitacao } from "./baseConnector";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Delay entre páginas para respeitar rate limit da API do PNCP (máx ~60 req/min) */
const PNCP_PAGE_DELAY_MS = 600;

const PNCP_CONSULTA_BASE = "https://pncp.gov.br/api/consulta";
const PNCP_ORGAOS_BASE = "https://pncp.gov.br/api/pncp";

export interface PncpLicitacao {
  numeroControlePNCP: string;
  orgaoEntidade: {
    cnpj: string;
    razaoSocial: string;
    ufNome?: string;
    municipioNome?: string;
    poderId?: string;
    esferaId?: string;
  };
  unidadeOrgao?: {
    ufNome?: string;
    ufSigla?: string;
    municipioNome?: string;
    codigoIbge?: string;
    nomeUnidade?: string;
  };
  modalidadeId?: number;
  modalidadeNome?: string;
  objetoCompra?: string;
  informacaoComplementar?: string;
  dataPublicacaoPncp?: string;
  dataAberturaProposta?: string;
  dataEncerramentoProposta?: string;
  dataInclusao?: string;
  valorTotalEstimado?: number;
  valorTotalHomologado?: number;
  situacaoCompraId?: number;
  situacaoCompraNome?: string;
  linkSistemaOrigem?: string;
  anoCompra?: number;
  sequencialCompra?: number;
  srp?: boolean;
  modoDisputaNome?: string;
  tipoInstrumentoConvocatorioNome?: string;
}

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

/**
 * Busca licitações publicadas no PNCP em um intervalo de datas.
 * Usa robustFetch para verificar content-type e registrar em api_logs.
 */
export async function buscarLicitacoesPNCP(
  dataInicial: string,
  dataFinal: string,
  pagina = 1,
  tamanhoPagina = 50,
  codigoModalidade = 8
): Promise<{ data: PncpLicitacao[]; totalRegistros: number; totalPaginas: number }> {
  const pageSize = Math.min(tamanhoPagina, 50);
  const params = new URLSearchParams({
    dataInicial,
    dataFinal,
    pagina: String(pagina),
    tamanhoPagina: String(pageSize),
    codigoModalidadeContratacao: String(codigoModalidade),
  });

  const url = `${PNCP_CONSULTA_BASE}/v1/contratacoes/publicacao?${params.toString()}`;
  const result = await robustFetch(url, "pncp");

  if (!result.success || !result.payload) {
    throw new Error(result.errorMessage || `PNCP API error: sem resposta válida`);
  }

  const json = result.payload;
  return {
    data: json.data ?? [],
    totalRegistros: json.totalRegistros ?? 0,
    totalPaginas: json.totalPaginas ?? 1,
  };
}

/**
 * Busca licitações em múltiplas modalidades para ampliar a cobertura.
 */
export async function buscarLicitacoesMultiModalidade(
  dataInicial: string,
  dataFinal: string,
  pagina = 1,
  modalidades = [8, 6]
): Promise<{ data: PncpLicitacao[]; totalRegistros: number; totalPaginas: number }> {
  const results = await Promise.allSettled(
    modalidades.map((m) => buscarLicitacoesPNCP(dataInicial, dataFinal, pagina, 50, m))
  );

  const allData: PncpLicitacao[] = [];
  let totalRegistros = 0;
  let totalPaginas = 1;

  for (const r of results) {
    if (r.status === "fulfilled") {
      allData.push(...r.value.data);
      totalRegistros += r.value.totalRegistros;
      totalPaginas = Math.max(totalPaginas, r.value.totalPaginas);
    }
  }

  return { data: allData, totalRegistros, totalPaginas };
}

/**
 * Busca os itens de uma licitação específica no PNCP.
 */
export async function buscarItensPNCP(
  cnpj: string,
  ano: number,
  sequencial: number
): Promise<PncpItem[]> {
  const url = `${PNCP_ORGAOS_BASE}/v1/orgaos/${cnpj}/compras/${ano}/${sequencial}/itens?pagina=1&tamanhoPagina=500`;
  const result = await robustFetch(url, "pncp");

  if (!result.success) {
    if (result.statusCode === 404) return [];
    throw new Error(result.errorMessage || `PNCP itens API error`);
  }

  return result.payload?.data ?? [];
}

/**
 * Normaliza uma licitação PNCP para o modelo unificado NormalizedLicitacao.
 */
export function normalizePncpLicitacao(l: PncpLicitacao): NormalizedLicitacao {
  const orgao = l.orgaoEntidade?.razaoSocial ?? "";
  const unidade = l.unidadeOrgao?.nomeUnidade ?? orgao;
  const objeto = l.objetoCompra ?? "";
  const dataAbertura = parseDate(l.dataAberturaProposta);
  const dataEncerramento = parseDate(l.dataEncerramentoProposta);
  const dataPublicacao = parseDate(l.dataPublicacaoPncp ?? l.dataInclusao);

  const links: string[] = [];
  if (l.linkSistemaOrigem) links.push(l.linkSistemaOrigem);

  return {
    source: "pncp",
    sourceId: l.numeroControlePNCP,
    orgao,
    unidadeCompradora: unidade,
    modalidade: l.modalidadeNome ?? `Modalidade ${l.modalidadeId}`,
    numeroProcesso: l.numeroControlePNCP,
    objeto,
    descricaoDetalhada: l.informacaoComplementar ?? "",
    uf: l.unidadeOrgao?.ufSigla ?? l.orgaoEntidade?.ufNome ?? "",
    municipio: l.unidadeOrgao?.municipioNome ?? l.orgaoEntidade?.municipioNome ?? "",
    dataPublicacao,
    dataAbertura,
    dataEncerramento,
    valorEstimado: l.valorTotalEstimado ?? 0,
    status: l.situacaoCompraNome ?? "Divulgada",
    links,
    dedupeKey: generateDedupeKey(orgao, objeto, dataAbertura),
  };
}

/**
 * Sincronização completa com rastreabilidade via sync_runs.
 * Busca licitações de um período e retorna normalizadas.
 */
export async function syncPncpPeriodo(
  dataInicial: string,
  dataFinal: string,
  modalidades = [8, 6]
): Promise<{ licitacoes: NormalizedLicitacao[]; runId: number | null; errors: string[] }> {
  const runId = await startSyncRun("pncp", `${dataInicial}/${dataFinal}`);
  const licitacoes: NormalizedLicitacao[] = [];
  const errors: string[] = [];
  let insertedCount = 0;
  let errorCount = 0;

  try {
    for (const modalidade of modalidades) {
      let pagina = 1;
      let totalPaginas = 1;

      while (pagina <= totalPaginas && pagina <= 10) {
        // Limite de 10 páginas por sync
        try {
          const result = await buscarLicitacoesPNCP(dataInicial, dataFinal, pagina, 50, modalidade);
          totalPaginas = result.totalPaginas;

          for (const l of result.data) {
            try {
              const normalized = normalizePncpLicitacao(l);
              licitacoes.push(normalized);
              insertedCount++;
            } catch (e: any) {
              errors.push(`Erro ao normalizar ${l.numeroControlePNCP}: ${e.message}`);
              errorCount++;
            }
          }

          pagina++;
          // Rate limiting: aguardar antes da próxima página
          if (pagina <= totalPaginas && pagina <= 10) {
            await sleep(PNCP_PAGE_DELAY_MS);
          }
        } catch (e: any) {
          errors.push(`Erro na página ${pagina} modalidade ${modalidade}: ${e.message}`);
          errorCount++;
          break;
        }
      }
    }

    await finishSyncRun(runId, {
      insertedCount,
      updatedCount: 0,
      skippedCount: 0,
      errorCount,
      status: errorCount === 0 ? "success" : insertedCount > 0 ? "partial" : "error",
      errorDetails: errors.length > 0 ? errors.join("\n").slice(0, 2000) : undefined,
    });
  } catch (e: any) {
    await finishSyncRun(runId, {
      insertedCount,
      updatedCount: 0,
      skippedCount: 0,
      errorCount: errorCount + 1,
      status: "error",
      errorDetails: e.message,
    });
    errors.push(e.message);
  }

  return { licitacoes, runId, errors };
}
