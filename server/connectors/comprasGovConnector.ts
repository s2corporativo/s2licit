/**
 * comprasGovConnector.ts
 * Segunda fonte do Radar: Compras.gov.br — Dados Abertos (SIASG).
 *
 * Complementa o PNCP com licitações de UASGs federais (pregões, tomadas de
 * preço, concorrências) publicadas no ComprasNet/SIASG. Muitos pregões
 * federais aparecem aqui com detalhe de item que o PNCP nem sempre expõe.
 *
 * API pública, sem autenticação (dados abertos). Retorno HAL+JSON:
 *   { _embedded: { licitacoes: [...] }, count, _links }
 *
 * PRINCÍPIO À PROVA DE FALHA: qualquer erro (endpoint fora do ar, mudança de
 * contrato, timeout) resulta em lista vazia — NUNCA lança para o Radar. O erro
 * fica registrado em api_logs (via robustFetch) para diagnóstico posterior.
 * Assim uma fonte instável jamais derruba a busca nem "finge" resultado.
 */

import { robustFetch, parseDate, generateDedupeKey } from "./baseConnector";
import type { NormalizedLicitacao } from "./baseConnector";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Respeita o rate limit do Dados Abertos (conservador). */
const PAGE_DELAY_MS = 400;
/** Teto de páginas por busca — evita varreduras longas em janelas amplas. */
const MAX_PAGES = 8;
const PAGE_SIZE = 500;

const COMPRAS_BASE = "https://compras.dados.gov.br";

/** Modalidades SIASG (código → nome legível). */
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

interface ComprasLicitacaoRaw {
  identificador?: string;
  uasg?: number | string;
  nome_uasg?: string;
  orgao?: string;
  nome_orgao?: string;
  modalidade?: number | string;
  numero_aviso?: number | string;
  objeto?: string;
  situacao_aviso?: string;
  data_publicacao?: string;
  data_abertura_proposta?: string;
  data_entrega_edital?: string;
  uf?: string;
  nome_municipio?: string;
  municipio?: string;
  valor_estimado?: number | string;
  _links?: { self?: { href?: string } };
}

interface ComprasResponse {
  _embedded?: { licitacoes?: ComprasLicitacaoRaw[] };
  count?: number;
  _links?: { next?: { href?: string } };
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/\./g, "").replace(",", "."));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function modalidadeNome(m: unknown): string {
  const code = typeof m === "number" ? m : Number(m);
  return MODALIDADE_NOME[code] ?? (m ? `Modalidade ${m}` : "Licitação");
}

/**
 * Normaliza uma licitação do Compras.gov.br para o modelo unificado. Pura e
 * testável (não faz I/O).
 */
export function normalizeComprasLicitacao(l: ComprasLicitacaoRaw): NormalizedLicitacao {
  const orgao = l.nome_orgao ?? l.orgao ?? l.nome_uasg ?? "Órgão federal";
  const unidade = l.nome_uasg ?? orgao;
  const objeto = l.objeto ?? "";
  const dataPublicacao = parseDate(l.data_publicacao);
  const dataAbertura = parseDate(l.data_abertura_proposta);
  const uasg = l.uasg != null ? String(l.uasg) : "";
  const aviso = l.numero_aviso != null ? String(l.numero_aviso) : "";
  const sourceId = l.identificador ?? (uasg && aviso ? `${uasg}-${aviso}` : `${uasg}${aviso}`);

  const links: string[] = [];
  const href = l._links?.self?.href;
  if (href) {
    links.push(href.startsWith("http") ? href : `${COMPRAS_BASE}${href}`);
  } else if (uasg) {
    // Link de consulta pública no ComprasNet como fallback.
    links.push(`https://www.gov.br/compras/pt-br?uasg=${uasg}`);
  }

  return {
    source: "comprasgov",
    sourceId: sourceId || generateDedupeKey(orgao, objeto, dataAbertura),
    orgao,
    unidadeCompradora: unidade,
    modalidade: modalidadeNome(l.modalidade),
    numeroProcesso: aviso || sourceId,
    objeto,
    descricaoDetalhada: "",
    uf: (l.uf ?? "").toUpperCase(),
    municipio: l.nome_municipio ?? l.municipio ?? "",
    dataPublicacao,
    dataAbertura,
    dataEncerramento: null,
    valorEstimado: toNumber(l.valor_estimado),
    status: l.situacao_aviso ?? "Publicado",
    links,
    dedupeKey: generateDedupeKey(orgao, objeto, dataAbertura),
  };
}

function dentroDaJanela(dataStr: string | undefined, inicio: Date, fim: Date): boolean {
  const d = parseDate(dataStr);
  if (!d) return false;
  // Compara só a data (ignora hora) para não perder o último dia.
  const t = d.getTime();
  return t >= inicio.getTime() && t <= fim.getTime() + 24 * 60 * 60 * 1000;
}

/**
 * Busca licitações do Compras.gov.br publicadas na janela [inicio, fim].
 *
 * A API SIASG não filtra por intervalo de datas de forma confiável em todas as
 * versões, então buscamos as páginas mais recentes (opcionalmente por UF) e
 * filtramos a janela em memória. Sempre à prova de falha: em qualquer erro
 * retorna o que já tiver (possivelmente vazio) sem lançar.
 *
 * @param inicio  início da janela (Date)
 * @param fim     fim da janela (Date)
 * @param uf      UF opcional (ex.: "MG") para reduzir o volume
 */
export async function buscarLicitacoesComprasGov(
  inicio: Date,
  fim: Date,
  uf?: string,
): Promise<NormalizedLicitacao[]> {
  const coletadas: NormalizedLicitacao[] = [];
  const ufParam = uf ? `&uf=${encodeURIComponent(uf.toUpperCase())}` : "";

  for (let pagina = 1; pagina <= MAX_PAGES; pagina++) {
    const offset = (pagina - 1) * PAGE_SIZE;
    const url = `${COMPRAS_BASE}/licitacoes/v1/licitacoes.json?ordenacao=-data_publicacao&tam_pagina=${PAGE_SIZE}&offset=${offset}${ufParam}`;

    const result = await robustFetch(url, "comprasgov");
    if (!result.success || !result.payload) {
      // Erro já logado em api_logs. Interrompe e devolve o que houver.
      break;
    }

    const json = result.payload as ComprasResponse;
    const linha = json._embedded?.licitacoes ?? [];
    if (linha.length === 0) break;

    let algumaNaJanela = false;
    for (const raw of linha) {
      if (dentroDaJanela(raw.data_publicacao, inicio, fim)) {
        algumaNaJanela = true;
        coletadas.push(normalizeComprasLicitacao(raw));
      }
    }

    // Como pedimos ordenação por data desc, se uma página inteira já está
    // antes da janela, as próximas também estarão — pode parar.
    const ultima = linha[linha.length - 1];
    const ultimaData = parseDate(ultima?.data_publicacao);
    if (!algumaNaJanela && ultimaData && ultimaData.getTime() < inicio.getTime()) {
      break;
    }

    if (pagina < MAX_PAGES) await sleep(PAGE_DELAY_MS);
  }

  return coletadas;
}
