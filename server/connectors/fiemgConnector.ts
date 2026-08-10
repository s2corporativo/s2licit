/**
 * FIEMG / Sistema S — fonte HTML não oficial.
 *
 * Não é tratada como API REST: o adapter classifica mudança de layout como
 * CONTRACT_ERROR e nunca confunde indisponibilidade/parser quebrado com zero
 * oportunidades legítimas.
 */
import { parseDate, generateDedupeKey } from "./baseConnector";
import type { NormalizedLicitacao } from "./baseConnector";
import { resolveCredential } from "../integrations/core/credentialResolver";
import { externalHttpRequest } from "../integrations/core/externalHttpClient";
import { classifyThrownError, IntegrationError } from "../integrations/core/integrationError";
import { failureResult, successResult } from "../integrations/core/integrationResult";
import type { IntegrationResult } from "../integrations/core/types";

const DEFAULT_FIEMG_URL = "https://www7.fiemg.com.br/licitacoes";

interface EditalExtraido {
  titulo: string;
  href: string;
  dataTexto: string | null;
}

async function fiemgUrl(): Promise<string> {
  return (await resolveCredential("FIEMG_LICITACOES_URL")) || DEFAULT_FIEMG_URL;
}

function limparTexto(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&ccedil;/gi, "ç")
    .replace(/&atilde;/gi, "ã")
    .replace(/&otilde;/gi, "õ")
    .replace(/&#(\d+);/g, (_, number) => String.fromCharCode(Number(number)))
    .replace(/\s+/g, " ")
    .trim();
}

function pareceEdital(texto: string, href: string): boolean {
  const alvo = `${texto} ${href}`.toLowerCase();
  return /edital|licita|preg[aã]o|concorr[eê]ncia|processo|cota[cç][aã]o|chamada/.test(alvo);
}

function extrairData(trecho: string): string | null {
  const br = trecho.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = trecho.match(/(\d{4})-(\d{2})-(\d{2})/);
  return iso?.[0] ?? null;
}

export function extrairEditaisFiemg(html: string): EditalExtraido[] {
  const editais: EditalExtraido[] = [];
  const vistos = new Set<string>();
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRe.exec(html)) !== null) {
    const href = match[1];
    const titulo = limparTexto(match[2]);
    if (!titulo || titulo.length < 8 || !pareceEdital(titulo, href) || vistos.has(href)) continue;
    vistos.add(href);
    editais.push({ titulo, href, dataTexto: extrairData(titulo) });
    if (editais.length >= 200) break;
  }
  return editais;
}

function resolverUrl(href: string, base: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

export function normalizeFiemgEdital(edital: EditalExtraido, base: string): NormalizedLicitacao {
  const dataPublicacao = parseDate(edital.dataTexto);
  const link = resolverUrl(edital.href, base);
  return {
    source: "fiemg",
    sourceId: link,
    orgao: "Sistema FIEMG",
    unidadeCompradora: "FIEMG / SESI / SENAI",
    modalidade: "Edital Sistema S",
    numeroProcesso: "",
    objeto: edital.titulo,
    descricaoDetalhada: "",
    uf: "MG",
    municipio: "",
    dataPublicacao,
    dataAbertura: null,
    dataEncerramento: null,
    valorEstimado: 0,
    status: "Publicado",
    links: [link],
    dedupeKey: generateDedupeKey("Sistema FIEMG", edital.titulo, dataPublicacao),
  };
}

export async function buscarLicitacoesFiemgResult(
  inicio: Date,
  fim: Date,
): Promise<IntegrationResult<NormalizedLicitacao[]>> {
  const startedAt = Date.now();
  const url = await fiemgUrl();
  try {
    const response = await externalHttpRequest<string>({
      source: "fiemg",
      operation: "licitacoes.html",
      url,
      expected: "text",
      accept: "text/html,application/xhtml+xml",
      timeoutMs: 20_000,
      maxRetries: 1,
      maxBodyBytes: 5 * 1024 * 1024,
    });
    if (!response.ok || !response.data) {
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

    const html = response.data;
    const editais = extrairEditaisFiemg(html);
    const pageLooksRelevant = /licita|edital|preg[aã]o|concorr[eê]ncia|cota[cç][aã]o/i.test(html);
    if (editais.length === 0 && pageLooksRelevant) {
      return failureResult({
        source: "fiemg",
        operation: "licitacoes.list",
        data: [],
        startedAt,
        requestId: response.requestId,
        error: new IntegrationError(
          "A página FIEMG respondeu, mas o parser não reconheceu editais. Possível mudança de layout.",
          { type: "CONTRACT", code: "FIEMG_HTML_DRIFT" },
        ),
        metadata: { sourceUrl: url, schemaVersion: "fiemg-html-v2" },
      });
    }

    const data = editais
      .map((edital) => normalizeFiemgEdital(edital, url))
      .filter((licitacao) => {
        if (!licitacao.dataPublicacao) return true;
        const time = licitacao.dataPublicacao.getTime();
        return time >= inicio.getTime() && time <= fim.getTime() + 86_400_000;
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
        schemaVersion: "fiemg-html-v2",
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

/** Compatibilidade: falha verdadeira lança; zero real continua sendo []. */
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
