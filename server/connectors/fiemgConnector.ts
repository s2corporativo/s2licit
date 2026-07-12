/**
 * fiemgConnector.ts
 * Terceira fonte do Radar: Sistema S / FIEMG (editais e licitações).
 *
 * O Sistema S (SESI/SENAI/IEL sob a FIEMG) NÃO publica de forma completa no
 * PNCP nem no Compras.gov.br — os editais ficam no próprio portal da FIEMG.
 * Como não há API JSON pública documentada, este connector é um leitor
 * best-effort de HTML: baixa a página de licitações e extrai os editais de
 * forma defensiva.
 *
 * IMPORTANTE (honestidade de engenharia):
 *   - A URL da listagem é configurável por env (FIEMG_LICITACOES_URL) porque o
 *     caminho exato pode mudar; o padrão aponta para a página pública da FIEMG.
 *   - O parser é tolerante: se o HTML não casar com os padrões esperados,
 *     retorna lista vazia em vez de dados inventados.
 *   - À PROVA DE FALHA: qualquer erro resulta em [] e um registro em api_logs
 *     (source "fiemg"). Nunca lança para o Radar; uma fonte muda de layout sem
 *     derrubar a busca.
 *   - Este connector precisa de UMA passada de calibração contra o HTML real em
 *     produção (visível no painel de Diagnóstico / api_logs) para começar a
 *     render resultados. Até lá degrada silenciosamente para vazio.
 */

import { logApiCall } from "./baseConnector";
import { parseDate, generateDedupeKey } from "./baseConnector";
import type { NormalizedLicitacao } from "./baseConnector";

const TIMEOUT_MS = 20_000;

/** URL pública da listagem de licitações da FIEMG (sobrescrevível por env). */
function fiemgUrl(): string {
  return process.env.FIEMG_LICITACOES_URL || "https://www7.fiemg.com.br/licitacoes";
}

interface EditalExtraido {
  titulo: string;
  href: string;
  dataTexto: string | null;
}

/** Decodifica entidades HTML básicas e normaliza espaços. */
function limparTexto(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&ccedil;/gi, "ç")
    .replace(/&atilde;/gi, "ã")
    .replace(/&otilde;/gi, "õ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, " ")
    .trim();
}

/** Detecta se um texto/href tem cara de edital/licitação. */
function pareceEdital(texto: string, href: string): boolean {
  const alvo = `${texto} ${href}`.toLowerCase();
  return /edital|licita|preg[aã]o|concorr[eê]ncia|processo|cota[cç][aã]o|chamada/.test(alvo);
}

/** Tenta achar uma data (dd/mm/aaaa ou aaaa-mm-dd) perto do título. */
function extrairData(trecho: string): string | null {
  const br = trecho.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = trecho.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  return null;
}

/**
 * Extrai editais do HTML de forma defensiva. Pura e testável.
 * Percorre âncoras <a href>…</a> e mantém as que parecem edital, buscando uma
 * data no próprio texto do link.
 */
export function extrairEditaisFiemg(html: string): EditalExtraido[] {
  const editais: EditalExtraido[] = [];
  const vistos = new Set<string>();
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const href = m[1];
    const titulo = limparTexto(m[2]);
    if (!titulo || titulo.length < 8) continue;
    if (!pareceEdital(titulo, href)) continue;
    if (vistos.has(href)) continue;
    vistos.add(href);
    editais.push({ titulo, href, dataTexto: extrairData(titulo) });
    if (editais.length >= 200) break; // teto de segurança
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

/**
 * Normaliza um edital extraído da FIEMG para o modelo unificado. Pura.
 */
export function normalizeFiemgEdital(e: EditalExtraido, base: string): NormalizedLicitacao {
  const dataPublicacao = parseDate(e.dataTexto);
  const link = resolverUrl(e.href, base);
  return {
    source: "fiemg",
    sourceId: link,
    orgao: "Sistema FIEMG",
    unidadeCompradora: "FIEMG / SESI / SENAI",
    modalidade: "Edital Sistema S",
    numeroProcesso: "",
    objeto: e.titulo,
    descricaoDetalhada: "",
    uf: "MG",
    municipio: "",
    dataPublicacao,
    dataAbertura: null,
    dataEncerramento: null,
    valorEstimado: 0,
    status: "Publicado",
    links: [link],
    dedupeKey: generateDedupeKey("Sistema FIEMG", e.titulo, dataPublicacao),
  };
}

/**
 * Busca editais do Sistema S / FIEMG. À prova de falha: qualquer erro resulta
 * em [] + registro em api_logs (source "fiemg").
 *
 * O filtro por janela de datas só se aplica aos editais que expõem data no
 * texto; editais sem data são mantidos (melhor mostrar do que esconder uma
 * oportunidade do Sistema S por falta de metadado).
 */
export async function buscarLicitacoesFiemg(
  inicio: Date,
  fim: Date,
): Promise<NormalizedLicitacao[]> {
  const url = fiemgUrl();
  const startedAt = Date.now();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let html = "";
    let status = 0;
    let contentType = "";
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "S2Licit-Radar/1.0 (+contato via sistema)",
        },
      });
      status = res.status;
      contentType = res.headers.get("content-type") || "";
      html = await res.text();
    } finally {
      clearTimeout(timer);
    }

    const durationMs = Date.now() - startedAt;

    if (status < 200 || status >= 300 || !html) {
      await logApiCall({
        source: "fiemg",
        endpoint: url,
        requestUrl: url,
        statusCode: status,
        contentType,
        errorMessage: `FIEMG respondeu status ${status} ou corpo vazio`,
        rawSample: html.slice(0, 2000),
        durationMs,
        success: false,
      });
      return [];
    }

    const editais = extrairEditaisFiemg(html);

    await logApiCall({
      source: "fiemg",
      endpoint: url,
      requestUrl: url,
      statusCode: status,
      contentType,
      rawSample: `${editais.length} edital(is) extraído(s)`,
      durationMs,
      success: true,
    });

    const dentroDaJanela = (d: Date | null) => {
      if (!d) return true; // sem data → mantém
      const t = d.getTime();
      return t >= inicio.getTime() && t <= fim.getTime() + 24 * 60 * 60 * 1000;
    };

    return editais
      .map((e) => normalizeFiemgEdital(e, url))
      .filter((lic) => dentroDaJanela(lic.dataPublicacao));
  } catch (err: any) {
    const durationMs = Date.now() - startedAt;
    const isTimeout = err?.name === "AbortError";
    await logApiCall({
      source: "fiemg",
      endpoint: url,
      requestUrl: url,
      statusCode: 0,
      contentType: "",
      errorMessage: isTimeout ? `Timeout após ${TIMEOUT_MS}ms` : `Erro: ${err?.message}`,
      rawSample: "",
      durationMs,
      success: false,
    });
    return [];
  }
}
