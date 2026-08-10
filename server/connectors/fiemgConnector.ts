/**
 * FIEMG / Sistema S — adapter do Radar manual.
 *
 * Reutiliza a mesma URL e o mesmo parser institucional do radar agendado para
 * evitar duas interpretações diferentes da mesma fonte.
 */
import type { NormalizedLicitacao } from "./baseConnector";
import { generateDedupeKey } from "./baseConnector";
import { externalHttpRequest } from "../integrations/core/externalHttpClient";
import { classifyThrownError, IntegrationError } from "../integrations/core/integrationError";
import { failureResult, successResult } from "../integrations/core/integrationResult";
import type { IntegrationResult } from "../integrations/core/types";
import { getS2PortalUrl } from "../services/s2TargetPortals";
import { parseInstitutionalPortalHtml } from "../services/s2PortalOpportunitySyncService";

function normalizeOpportunity(
  opportunity: ReturnType<typeof parseInstitutionalPortalHtml>[number],
): NormalizedLicitacao {
  return {
    source: "fiemg",
    sourceId: opportunity.externalId,
    orgao: opportunity.orgao,
    unidadeCompradora: "FIEMG / SESI / SENAI",
    modalidade: "Edital Sistema S",
    numeroProcesso: opportunity.externalId,
    objeto: opportunity.items[0]?.descricao || opportunity.subject,
    descricaoDetalhada: opportunity.bodyText,
    uf: "MG",
    municipio: "",
    dataPublicacao: null,
    dataAbertura: null,
    dataEncerramento: opportunity.prazoResposta,
    valorEstimado: 0,
    status: "Publicado",
    links: [opportunity.portalUrl],
    dedupeKey: generateDedupeKey(
      opportunity.orgao,
      opportunity.items[0]?.descricao || opportunity.subject,
      opportunity.prazoResposta,
    ),
  };
}

export async function buscarLicitacoesFiemgResult(
  inicio: Date,
  fim: Date,
): Promise<IntegrationResult<NormalizedLicitacao[]>> {
  const startedAt = Date.now();
  const url = await getS2PortalUrl("fiemg");
  try {
    const response = await externalHttpRequest<string>({
      source: "fiemg",
      operation: "licitacoes.html",
      url,
      expected: "text",
      accept: "text/html,application/xhtml+xml",
      timeoutMs: 20_000,
      maxRetries: 1,
      maxBodyBytes: 8 * 1024 * 1024,
    });
    if (!response.ok || response.data == null) {
      return failureResult({
        source: "fiemg",
        operation: "licitacoes.list",
        data: [],
        startedAt,
        requestId: response.requestId,
        error: new IntegrationError(response.error?.message ?? "FIEMG indisponível.", {
          type: response.error?.type === "TIMEOUT" ? "TIMEOUT" : "UPSTREAM",
          retryable: response.error?.retryable ?? true,
          upstreamStatus: response.statusCode || undefined,
        }),
        metadata: { sourceUrl: url },
      });
    }

    const opportunities = parseInstitutionalPortalHtml("fiemg", response.data, url);
    const pageLooksRelevant = /licita[cç][aã]o|edital|preg[aã]o|cota[cç][aã]o|processo|contrata[cç][aã]o/i.test(response.data);
    if (opportunities.length === 0 && pageLooksRelevant) {
      return failureResult({
        source: "fiemg",
        operation: "licitacoes.list",
        data: [],
        startedAt,
        requestId: response.requestId,
        error: new IntegrationError(
          "A página FIEMG respondeu, mas o parser institucional não reconheceu oportunidades ativas. Possível mudança de layout.",
          { type: "CONTRACT", code: "FIEMG_HTML_DRIFT" },
        ),
        metadata: { sourceUrl: url, schemaVersion: "institutional-html-v3" },
      });
    }

    const data = opportunities
      .map(normalizeOpportunity)
      .filter((opportunity) => {
        const deadline = opportunity.dataEncerramento;
        if (!deadline) return true;
        // Não exibe no Radar uma oportunidade cujo prazo terminou antes da janela.
        return deadline.getTime() >= inicio.getTime() && deadline.getTime() <= fim.getTime() + 90 * 86_400_000;
      });

    return successResult({
      source: "fiemg",
      operation: "licitacoes.list",
      data,
      startedAt,
      requestId: response.requestId,
      metadata: {
        records: data.length,
        sourceUrl: url,
        schemaVersion: "institutional-html-v3",
      },
    });
  } catch (error) {
    return failureResult({
      source: "fiemg",
      operation: "licitacoes.list",
      data: [],
      startedAt,
      error: classifyThrownError(error),
      metadata: { sourceUrl: url },
    });
  }
}

export async function buscarLicitacoesFiemg(
  inicio: Date,
  fim: Date,
): Promise<NormalizedLicitacao[]> {
  const result = await buscarLicitacoesFiemgResult(inicio, fim);
  if (["UNAVAILABLE", "TIMEOUT", "RATE_LIMITED", "AUTH_ERROR", "CONTRACT_ERROR", "CONFIG_ERROR"].includes(result.status)) {
    throw new Error(result.error?.message ?? "FIEMG indisponível.");
  }
  return result.data;
}
