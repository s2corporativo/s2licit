import { JSDOM } from "jsdom";
import {
  FUNARBE_PROVIDER_BASE_URL,
  FUNARBE_PROVIDER_LIST_URLS,
  type S2TargetPortal,
} from "./s2TargetPortals";

export { FUNARBE_PROVIDER_BASE_URL, FUNARBE_PROVIDER_LIST_URLS };

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

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function parsePtBrNumber(value: string | null | undefined): number | null {
  const raw = normalizeText(value).replace(/[^\d,.-]/g, "");
  if (!raw) return null;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function parsePtBrDate(value: string | null | undefined): Date | null {
  const match = normalizeText(value).match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!match) return null;
  const [, day, month, year, hour = "23", minute = "59"] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    59,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function truncate(value: string, max = 512): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function rowActionUrl(row: Element, listUrl: string): string {
  for (const anchor of Array.from(row.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
    try {
      return new URL(anchor.getAttribute("href") ?? "", listUrl).toString();
    } catch {
      // Link inválido: tenta o próximo sem interromper a captura da listagem.
    }
  }
  return listUrl;
}

function explicitDeadline(
  headerCells: string[],
  cells: string[],
): Date | null {
  const deadlineHeaders = [
    "prazo",
    "data limite",
    "data-limite",
    "encerramento",
    "fim cotacao",
    "fim da cotacao",
  ];
  for (let i = 0; i < headerCells.length; i++) {
    const header = normalizeHeader(headerCells[i]);
    if (!deadlineHeaders.some((term) => header.includes(term))) continue;
    const parsed = parsePtBrDate(cells[i]);
    if (parsed) return parsed;
  }
  return null;
}

/**
 * Parser tolerante das GridView do portal fornecedor Funarbe (Agrega/Yii2).
 * Não inventa prazo de resposta a partir de datas logísticas: só preenche
 * `prazoResposta` quando a própria coluna declarar prazo/limite/encerramento.
 */
export function parseAgregaListHtml(
  html: string,
  listUrl: string,
): S2PortalOpportunityLike[] {
  const dom = new JSDOM(html, { url: listUrl });
  const document = dom.window.document;
  const opportunities: S2PortalOpportunityLike[] = [];

  for (const grid of Array.from(document.querySelectorAll("table"))) {
    const headerRow = grid.querySelector("thead tr") ?? grid.querySelector("tr:has(th)");
    const headerCells = headerRow
      ? Array.from(headerRow.querySelectorAll("th")).map((th) => normalizeText(th.textContent))
      : [];
    if (headerCells.length === 0) continue;

    const normalizedHeaders = headerCells.map(normalizeHeader);
    const bodyRows = Array.from(grid.querySelectorAll("tbody tr")).filter((row) => {
      const text = normalizeText(row.textContent);
      return text !== "" && !/nenhum resultado|sem resultado/i.test(text);
    });

    for (const row of bodyRows) {
      const cells = Array.from(row.querySelectorAll("th, td")).map((cell) =>
        normalizeText(cell.textContent),
      );
      if (cells.length === 0) continue;

      const column = (...names: string[]): string => {
        const index = normalizedHeaders.findIndex((header) =>
          names.some((name) => header.includes(normalizeHeader(name))),
        );
        return index >= 0 && index < cells.length ? cells[index] : "";
      };

      const processo = column("pedido de compra", "codigo", "processo de compra");
      if (!processo) continue;

      const item = column("item", "descricao", "objeto");
      const projeto = column("projeto");
      const comprador = column("comprador");
      const documentoFiscal = column("documento fiscal");
      const descricao = [item, projeto, comprador]
        .filter(Boolean)
        .join(" · ");
      const situacao = column("situacao", "status");
      const quantidade = parsePtBrNumber(column("quantidade", "qtd"));
      const unidade = column("unidade", "unid") || "UN";
      const valor = column("valor");
      const envioPedido = column("envio/pedido", "envio pedido");
      const envioCompras = column("envio/compras", "envio compras");
      const previsaoEntrega = column("previsao de entrega");
      const prazo = explicitDeadline(headerCells, cells);
      const href = rowActionUrl(row, listUrl);
      const externalId = processo.replace(/[^\w./-]/g, "").slice(0, 80) || processo;

      opportunities.push({
        externalId,
        subject: truncate(
          `Funarbe Fornecedor — ${processo}${situacao ? ` — ${situacao}` : ""}`,
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
          unidade ? `Unidade: ${unidade}` : "",
          valor ? `Valor: ${valor}` : "",
          documentoFiscal ? `Documento fiscal: ${documentoFiscal}` : "",
          envioPedido ? `Envio/Pedido: ${envioPedido}` : "",
          envioCompras ? `Envio/Compras: ${envioCompras}` : "",
          previsaoEntrega ? `Previsão de entrega: ${previsaoEntrega}` : "",
          prazo ? `Prazo explícito: ${prazo.toLocaleString("pt-BR")}` : "",
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

export function combineAgregaListHtmls(
  pages: Array<{ url: string; html: string }>,
): string {
  return pages
    .filter((page) => page.html.trim() !== "")
    .map((page) => `<!-- FUNARBE_PROVIDER_LIST:${page.url} -->\n${page.html}`)
    .join("\n");
}

/**
 * Lê o documento combinado e deduplica globalmente pelo identificador do
 * pedido. Se o mesmo pedido aparece em duas listagens, mantém a versão com
 * mais informação, evitando contagem e importação duplicadas.
 */
export function parseAgregaCombinedHtml(
  combinedHtml: string,
  defaultUrl = FUNARBE_PROVIDER_BASE_URL,
): S2PortalOpportunityLike[] {
  const markerRegex = /<!-- FUNARBE_PROVIDER_LIST:(https?:\/\/[^>]+) -->\s*/g;
  const markers = Array.from(combinedHtml.matchAll(markerRegex)).map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
    url: match[1],
  }));

  if (markers.length === 0) {
    return parseAgregaListHtml(combinedHtml, defaultUrl);
  }

  const all = new Map<string, S2PortalOpportunityLike>();
  for (let index = 0; index < markers.length; index++) {
    const marker = markers[index];
    const next = markers[index + 1];
    const slice = combinedHtml.slice(marker.end, next?.start);
    for (const opportunity of parseAgregaListHtml(slice, marker.url)) {
      const existing = all.get(opportunity.externalId);
      if (!existing || opportunity.bodyText.length > existing.bodyText.length) {
        all.set(opportunity.externalId, opportunity);
      }
    }
  }
  return Array.from(all.values());
}

export function isFunarbeProviderPortal(source: S2TargetPortal): boolean {
  return source === "funarbe";
}
