/**
 * Portal do fornecedor da Funarbe — "Agrega" (PHP/Yii2, Fundação Arthur Bernardes).
 *
 * Complementa o mural público (compras.funarbe.org.br): o portal do fornecedor
 * (fornecedor.funarbe.org.br) só expõe as cotações destinadas ao fornecedor
 * logado. Este módulo concentra as URLs da área autenticada e o parser do HTML
 * das GridView (widgets kartik), que devolve oportunidades no mesmo formato
 * dos parsers do radar para reaproveitar a fila auditável do S2.
 *
 * Roteiro validado diretamente no portal em 13/08/2026:
 * - Login: campo #loginform-email ("Email ou Login") + #loginform-senha +
 *   botão "Entrar", sem CAPTCHA identificado na data da análise.
 * - Cotações novas (abertas para envio de proposta): rotas por tipo de
 *   compra, principalmente /compra-produtos-diversos, além de /pedidos-compra.
 * - A rota /cotacao-aguardando-confirmacao lista apenas cotações JÁ respondidas
 *   que aguardam confirmação de entrega — incluída para rastreio de status.
 * - O robô é somente de leitura: nunca preenche, envia ou altera propostas.
 */
import { JSDOM } from "jsdom";
import { S2TargetPortal } from "./s2TargetPortals";

export const FUNARBE_PROVIDER_BASE_URL = "https://fornecedor.funarbe.org.br";

// Rotas de NOVAS cotações abertas para resposta (descoberta autenticada)
export const FUNARBE_PROVIDER_LIST_URLS: string[] = [
  `${FUNARBE_PROVIDER_BASE_URL}/compra-produtos-diversos`,
  `${FUNARBE_PROVIDER_BASE_URL}/pedidos-compra`,
];

// Rota de RASTREIO: cotações JÁ respondidas aguardando confirmação (fora da descoberta, só para status)
export const FUNARBE_PROVIDER_STATUS_TRACKING_URL = `${FUNARBE_PROVIDER_BASE_URL}/cotacao-aguardando-confirmacao`;

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeHeader(value: string | null | undefined): string {
  return stripAccents(normalizeText(value).toLowerCase());
}

function parsePtBrNumber(value: string | null | undefined): number | null {
  const raw = normalizeText(value).replace(/[^\d,.-]/g, "");
  if (!raw) return null;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function parsePtBrDate(value: string | null | undefined): Date | null {
  const normalized = normalizeText(value);
  const dateMatch = normalized.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (!dateMatch) return null;
  const [, day, month, year] = dateMatch;

  // Tenta extrair hora/minuto se presentes (ex.: "20/08/2026 18:00")
  let hours = 23, minutes = 59, seconds = 59;
  const timeMatch = normalized.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (timeMatch) {
    hours = Number(timeMatch[1]);
    minutes = Number(timeMatch[2]);
    seconds = timeMatch[3] ? Number(timeMatch[3]) : 0;
  }

  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    hours,
    minutes,
    seconds,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Extrai a URL de ação da linha (botão/ícone/link dentro da célula "Ações" ou
 * primeiro link da linha). Sem link, devolve a URL base da lista.
 */
function rowActionUrl(
  row: Element,
  listUrl: string,
  _doc: Document,
): string {
  const candidates = [
    ...Array.from(row.querySelectorAll<HTMLAnchorElement>('a[href*="view"], a[href*="compra"], a[href]')),
  ];
  for (const candidate of candidates) {
    try {
      return new URL(candidate.getAttribute("href") ?? "", listUrl).toString();
    } catch {
      // ignorar href relativo inválido e seguir para o próximo candidato
    }
  }
  return listUrl;
}

/**
 * Parser tolerante para as GridView do portal fornecedor Funarbe (Agrega).
 *
 * Entrada: o HTML de UMA página de listagem autenticada (por exemplo
 * /compra-produtos-diversos). Os cabeçalhos definem as colunas; o parser é
 * posicional e não depende de classes CSS específicas — se a ordem das
 * colunas mudar, basta o cabeçalho estar presente para o parser se adaptar.
 */
export function parseAgregaListHtml(
  html: string,
  listUrl: string,
): S2PortalOpportunityLike[] {
  const dom = new JSDOM(html, { url: listUrl });
  const document = dom.window.document;
  const opportunities: S2PortalOpportunityLike[] = [];

  for (const grid of Array.from(document.querySelectorAll("table"))) {
    // Algumas GridViews válidas não usam <thead>; nesse caso, usar a primeira
    // linha que contenha células <th>, sempre no nível da linha (não do <th>).
    const headerRow =
      grid.querySelector("thead tr") ??
      Array.from(grid.querySelectorAll("tr")).find((row) => row.querySelector("th")) ??
      null;
    const headerCells = headerRow
      ? Array.from(headerRow.querySelectorAll("th")).map((th) =>
          normalizeText(th.textContent ?? th.getAttribute("data-label") ?? ""),
        )
      : [];
    if (headerCells.length === 0) continue;

    const bodyRows = Array.from(grid.querySelectorAll("tbody tr")).filter((row) => {
      const text = normalizeText(row.textContent);
      return text !== "" && !/nenhum resultado/i.test(text) && !/sem resultado/i.test(text);
    });
    // Sem <tbody>, aceita linhas de dados posteriores ao cabeçalho.
    const rows = bodyRows.length > 0
      ? bodyRows
      : Array.from(grid.querySelectorAll("tr")).filter((row) => row !== headerRow && row.querySelector("td"));

    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll("th, td")).map((cell) =>
        normalizeText(cell.textContent),
      );
      if (cells.length === 0) continue;

      const column = (name: string): string => {
        const normalizedName = normalizeHeader(name);
        const index = headerCells.findIndex((header) =>
          normalizeHeader(header).includes(normalizedName),
        );
        return index >= 0 && index < cells.length ? cells[index] : "";
      };

      const processo =
        column("pedido de compra") || column("código") || column("processo de compra");
      if (!processo) continue;

      const descricao = [
        column("projeto"),
        column("item"),
        column("descricao"),
        column("objeto"),
        column("comprador"),
        column("documento fiscal"),
      ]
        .filter(Boolean)
        .join(" · ");

      const situacao =
        column("situação") || column("situacao") || column("status") || "";
      const quantidade = parsePtBrNumber(
        column("quantidade") || column("qtd"),
      );
      const unidade =
        column("unidade") || column("unidade de medida") || column("un") || "UN";
      const valor = column("valor");
      const previsaoEntrega =
        column("previsão de entrega") || column("previsao de entrega") || "";

      const hasExplicitDeadlineColumn = headerCells.some((header) => {
        const normalized = normalizeHeader(header);
        return (
          normalized.includes("prazo") ||
          normalized.includes("data limite") ||
          normalized.includes("data-limite") ||
          normalized.includes("encerramento") ||
          normalized.includes("fim cotacao") ||
          normalized.includes("fim da cotacao")
        );
      });

      const prazo = hasExplicitDeadlineColumn
        ? parsePtBrDate(
            column("prazo") ||
              column("data limite") ||
              column("data-limite") ||
              column("encerramento") ||
              column("fim cotacao") ||
              column("fim da cotacao") ||
              "",
          )
        : null;

      const href = rowActionUrl(row, listUrl, document);
      const externalId = processo.replace(/[^\w./-]/g, "").slice(0, 80) || processo;

      opportunities.push({
        externalId,
        subject: truncate(
          `Funarbe Fornecedor — ${processo}${situacao ? ` — ${situacao}` : ""}`,
          512,
        ),
        orgao: "FUNARBE",
        portalUrl: href,
        prazoResposta: prazo,
        bodyText: [
          "Origem: Portal do Fornecedor Funarbe (Agrega — fornecedor.funarbe.org.br)",
          `Processo/Pedido: ${processo}`,
          `Listagem: ${listUrl}`,
          `URL: ${href}`,
          situacao ? `Situação: ${situacao}` : "",
          descricao ? `Descrição: ${descricao}` : "",
          quantidade !== null ? `Quantidade: ${quantidade}` : "",
          valor ? `Valor: ${valor}` : "",
          previsaoEntrega ? `Previsão de entrega: ${previsaoEntrega}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        items: descricao.length >= 8
          ? [{ numeroItem: 1, descricao, quantidade, unidade, codigoExterno: null }]
          : [],
      });
    }
  }
  return opportunities;
}

/**
 * Agrega o HTML das várias listagens autenticadas em um único documento
 * marcado com âncoras de origem, permitindo que um único parse varra todas
 * as rotas do fornecedor. Cada HTML recebe um comentário-head com a URL de
 * origem, que o parser usa para montar o campo `portalUrl` da oportunidade.
 */
export function combineAgregaListHtmls(
  pages: Array<{ url: string; html: string }>,
): string {
  return pages
    .filter((page) => page.html.trim() !== "")
    .map(
      (page) =>
        `<!-- FUNARBE_PROVIDER_LIST:${page.url} -->${page.html}`,
    )
    .join("\n");
}

function opportunityCompleteness(opportunity: S2PortalOpportunityLike): number {
  let score = opportunity.items.length * 1000 + opportunity.bodyText.length;
  if (opportunity.prazoResposta) score += 200;
  for (const item of opportunity.items) {
    score += item.descricao.length;
    if (item.quantidade != null) score += 25;
    if (item.unidade && item.unidade !== "UN") score += 20;
  }
  try {
    const url = new URL(opportunity.portalUrl);
    if (url.search || /\/(?:view|detalhe|compra)\b/i.test(url.pathname)) score += 75;
  } catch {
    // URL inválida não ganha bônus de completude.
  }
  return score;
}

/**
 * Varre o documento combinado e devolve as oportunidades de cada listagem,
 * deduplicando por externalId — a mesma cotação pode aparecer em
 * mais de uma listagem (/pedidos-compra inclui todos os tipos de compra).
 */
export function parseAgregaCombinedHtml(
  combinedHtml: string,
  defaultUrl = FUNARBE_PROVIDER_BASE_URL,
): S2PortalOpportunityLike[] {
  const markerRegex = /<!-- FUNARBE_PROVIDER_LIST:(https?:\/\/[^>]+) -->/g;
  const sourceMarkers = Array.from(combinedHtml.matchAll(markerRegex)).map((match) => ({
    index: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
    url: match[1],
  }));

  // O parser também é usado isoladamente em testes/fallbacks. Se não houver
  // marcador, o documento começa no byte zero — não aplicar offset fictício.
  if (sourceMarkers.length === 0) {
    return parseAgregaListHtml(combinedHtml, defaultUrl);
  }

  const all = new Map<string, S2PortalOpportunityLike>();
  for (let markerIndex = 0; markerIndex < sourceMarkers.length; markerIndex++) {
    const marker = sourceMarkers[markerIndex];
    const nextMarker = sourceMarkers[markerIndex + 1];
    const slice = combinedHtml.slice(marker.end, nextMarker ? nextMarker.index : undefined);
    for (const opportunity of parseAgregaListHtml(slice, marker.url)) {
      const existing = all.get(opportunity.externalId);
      if (!existing || opportunityCompleteness(opportunity) > opportunityCompleteness(existing)) {
        all.set(opportunity.externalId, opportunity);
      }
    }
  }
  return Array.from(all.values());
}

export interface S2PortalOpportunityLike {
  externalId: string;
  subject: string;
  orgao: string;
  portalUrl: string;
  prazoResposta: Date | null;
  bodyText: string;
  items: Array<{
    numeroItem: number;
    descricao: string;
    quantidade: number | null;
    unidade: string | null;
    codigoExterno: string | null;
  }>;
}

function truncate(value: string, max = 512): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

export function isFunarbeProviderPortal(source: S2TargetPortal): boolean {
  return source === "funarbe";
}
