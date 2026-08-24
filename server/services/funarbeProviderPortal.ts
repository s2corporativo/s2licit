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

export const FUNARBE_PROVIDER_LIST_URLS: string[] = [
  `${FUNARBE_PROVIDER_BASE_URL}/compra-produtos-diversos`,
  `${FUNARBE_PROVIDER_BASE_URL}/pedidos-compra`,
  `${FUNARBE_PROVIDER_BASE_URL}/cotacao-aguardando-confirmacao`,
];

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function parsePtBrNumber(value: string | null | undefined): number | null {
  const raw = normalizeText(value).replace(/[^\d,.-]/g, "");
  if (!raw) return null;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function parsePtBrDate(value: string | null | undefined): Date | null {
  const match = normalizeText(value).match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    23,
    59,
    59,
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
  doc: Document,
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
    const headerRow = grid.querySelector("thead tr, tr th");
    const headerCells = headerRow
      ? Array.from(headerRow.querySelectorAll("th")).map((th) =>
          normalizeText(th.textContent ?? th.getAttribute("data-label") ?? ""),
        )
      : [];
    if (headerCells.length === 0) continue;

    const bodyRows = Array.from(grid.querySelectorAll("tbody tr")).filter(
      (row) =>
        normalizeText(row.textContent) !== "" &&
        !/nenhum resultado/i.test(normalizeText(row.textContent) ?? ""),
    );
    for (const row of bodyRows) {
      const cells = Array.from(row.querySelectorAll("th, td")).map((cell) =>
        normalizeText(cell.textContent),
      );
      if (cells.length === 0) continue;

      const column = <T extends string>(name: string): string => {
        const index = headerCells.findIndex((header) =>
          header.toLowerCase().includes(name.toLowerCase()),
        );
        return index >= 0 && index < cells.length ? cells[index] : "";
      };

      // Pedido de Compra (/compra-produtos-diversos e /pedidos-compra) ou
      // Código, conforme a listagem; para a tela de confirmação, o identificador
      // vem de "Pedido de Compra" também.
      const processo =
        column("pedido de compra") || column("código") || column("processo de compra");
      if (!processo) continue;

      const descricao = [
        column("projeto"),
        column("item"),
        column("comprador"),
        column("documento fiscal"),
      ]
        .filter(Boolean)
        .join(" · ");

      const situacao =
        column("situação") || column("situacao") || column("situaçao") || "";
      const quantidade = parsePtBrNumber(
        column("quantidade") || column("qtd"),
      );
      const valor = column("valor");
      const previsaoEntrega =
        column("previsão de entrega") || column("previsao de entrega") || "";

      const hasExplicitDeadlineColumn = headerCells.some((header) => {
        const normalized = header.toLowerCase();
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
        items: descricao.length >= 12
          ? [{ numeroItem: 1, descricao, quantidade, unidade: "UN", codigoExterno: null }]
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

/**
 * Varre o documento combinado e devolve as oportunidades de cada listagem,
 * deduplicando por externalId — a mesma cotação pode aparecer em
 * mais de uma listagem (/pedidos-compra inclui todos os tipos de compra).
 */
export function parseAgregaCombinedHtml(
  combinedHtml: string,
  defaultUrl = FUNARBE_PROVIDER_BASE_URL,
): S2PortalOpportunityLike[] {
  const sourceMarkers = Array.from(
    combinedHtml.matchAll(/<!-- FUNARBE_PROVIDER_LIST:(https?:\/\/[^>]+) -->/g),
  ).map((match) => ({ index: match.index ?? 0, url: match[1] }));
  const sources = sourceMarkers.length > 0 ? sourceMarkers : [{ index: 0, url: defaultUrl }];

  const all = new Map<string, S2PortalOpportunityLike>();
  for (let markerIndex = 0; markerIndex < sources.length; markerIndex++) {
    const marker = sources[markerIndex];
    const nextMarker = sources[markerIndex + 1];
    const slice = combinedHtml.slice(
      marker.index + marker.url.length + 40,
      nextMarker ? nextMarker.index : undefined,
    );
    for (const opportunity of parseAgregaListHtml(slice, marker.url)) {
      const existing = all.get(opportunity.externalId);
      if (!existing || opportunity.items.length > existing.items.length) {
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
