import { JSDOM } from "jsdom";
import { and, eq, like } from "drizzle-orm";
import {
  emailQuotationItems,
  emailQuotations,
  products,
  suppliers,
} from "../../drizzle/schema";
import { logger } from "../_core/logger";
import { getDb } from "../db";
import { externalHttpRequest } from "../integrations/core/externalHttpClient";
import { renderPublicHtml } from "../integrations/core/secureBrowserRenderer";
import {
  bestNameMatchFromIndex,
  buildNameMatchIndex,
  type CatalogProduct,
  type NameMatchIndex,
} from "./emailQuotationMatchingService";

const FUNDEP_GROUPS_URL =
  "https://portaldecompras.fundep.ufmg.br/Publico/ConsultarGruposAtivos.aspx";
const FUNARBE_OPEN_URL = "https://compras.funarbe.org.br/";
const DEFAULT_MAX_FUNDEP_GROUPS = 80;
const MAX_FUNDEP_GROUPS = 200;
const HTTP_TIMEOUT_MS = 30_000;
const MAX_HTML_BYTES = 8 * 1024 * 1024;
const USER_AGENT =
  "Mozilla/5.0 (compatible; S2Licit/2.0; procurement-integration-platform)";

export type PortalOpportunitySource = "fundep" | "funarbe";

export interface PortalOpportunityItem {
  numeroItem: number;
  descricao: string;
  quantidade: number | null;
  unidade: string | null;
  codigoExterno?: string | null;
}

export interface PortalOpportunity {
  source: PortalOpportunitySource;
  externalId: string;
  subject: string;
  orgao: string;
  portalUrl: string;
  prazoResposta: Date | null;
  bodyText: string;
  items: PortalOpportunityItem[];
}

export interface PortalSyncResult {
  sources: PortalOpportunitySource[];
  found: number;
  imported: number;
  skipped: number;
  matchedItems: number;
  unmatchedItems: number;
  errors: string[];
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function parsePtBrNumber(value: string | null | undefined): number | null {
  const raw = normalizeText(value).replace(/[^\d,.-]/g, "");
  if (!raw) return null;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function truncate(value: string, max = 512): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`;
}

function parseRelativeDeadline(text: string, now: Date): Date | null {
  const normalized = normalizeText(text);
  const match = normalized.match(/Finaliza\s+em[^0-9]*(\d+)(?::(\d{1,2}))?\s*horas?/i);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return new Date(now.getTime() + (hours * 60 + minutes) * 60_000);
}

function parseAbsoluteDeadline(text: string): Date | null {
  const normalized = normalizeText(text);
  const match = normalized.match(
    /(?:encerra(?:mento)?|finaliza|prazo|data\s+limite)[^0-9]*(\d{2})\/(\d{2})\/(\d{4})(?:[^0-9]+(\d{1,2}):(\d{2}))?/i,
  );
  if (!match) return null;
  const [, day, month, year, hour = "23", minute = "59"] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0,
    0,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function nearestContextText(element: Element, lotId?: string): string {
  let current: Element | null = element;
  while (current) {
    const text = normalizeText(current.textContent);
    if (
      text.length > 0 &&
      text.length <= 30_000 &&
      (!lotId || text.includes(`Lote: ${lotId}`) || text.includes(`Lote ${lotId}`))
    ) {
      return text;
    }
    current = current.parentElement;
  }
  return normalizeText(element.ownerDocument?.body?.textContent);
}

/** Parser puro da página pública de um grupo da Fundep. */
export function parseFundepGroupHtml(
  html: string,
  portalUrl: string,
  now = new Date(),
): PortalOpportunity[] {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const bodyText = normalizeText(document.body?.textContent);
  const groupName =
    bodyText.match(/Grupo:\s*(.+?)(?=Informações importantes|Lote de compra|$)/i)?.[1]?.trim() ||
    "Compras Fundep";
  const byLot = new Map<string, PortalOpportunity>();

  for (const table of Array.from(document.querySelectorAll("table"))) {
    for (const row of Array.from(table.querySelectorAll("tr"))) {
      const cells = Array.from(row.querySelectorAll("th,td")).map((cell) =>
        normalizeText(cell.textContent),
      );
      if (cells.length < 3) continue;
      const codeIndex = cells.findIndex((cell) => /^\d+\s*\*\s*\d+$/.test(cell));
      if (codeIndex < 0) continue;
      const codeMatch = cells[codeIndex].match(/^(\d+)\s*\*\s*(\d+)$/);
      if (!codeMatch) continue;

      const lotId = codeMatch[1];
      const numeroItem = Number(codeMatch[2]);
      const descricao = normalizeText(cells[codeIndex + 1]);
      if (!descricao || descricao.length < 3) continue;
      const quantidade = parsePtBrNumber(cells[codeIndex + 2]);
      const unidade = normalizeText(cells[codeIndex + 3]) || null;
      const context = nearestContextText(table, lotId);
      const natureza = context.match(/Natureza:\s*([^*]+?)(?=Processo|Finaliza|Item|$)/i)?.[1]?.trim();
      const processo = context.match(/Processo\*?:\s*([^*]+?)(?=Finaliza|Item|$)/i)?.[1]?.trim();

      const current = byLot.get(lotId) ?? {
        source: "fundep" as const,
        externalId: lotId,
        subject: truncate(`${groupName} — Lote ${lotId}`),
        orgao: "FUNDEP",
        portalUrl,
        prazoResposta: parseRelativeDeadline(context, now),
        bodyText: [
          "Origem: Portal público de Compras Fundep",
          `Grupo: ${groupName}`,
          `Lote: ${lotId}`,
          natureza ? `Natureza: ${natureza}` : null,
          processo ? `Processo: ${processo}` : null,
          `URL: ${portalUrl}`,
        ]
          .filter(Boolean)
          .join("\n"),
        items: [] as PortalOpportunityItem[],
      };

      if (!current.items.some((item) => item.numeroItem === numeroItem)) {
        current.items.push({
          numeroItem,
          descricao,
          quantidade,
          unidade,
          codigoExterno: `${lotId}*${numeroItem}`,
        });
      }
      byLot.set(lotId, current);
    }
  }

  return Array.from(byLot.values()).map((opportunity) => ({
    ...opportunity,
    items: opportunity.items.sort((a, b) => a.numeroItem - b.numeroItem),
  }));
}

function extractFundepGroupUrls(html: string): string[] {
  const dom = new JSDOM(html, { url: FUNDEP_GROUPS_URL });
  const document = dom.window.document;
  const urls = new Set<string>();

  for (const anchor of Array.from(document.querySelectorAll("a[href]"))) {
    const href = anchor.getAttribute("href");
    if (!href || !/ConsultarLotesPorGrupo\.aspx/i.test(href)) continue;
    try {
      const url = new URL(href, FUNDEP_GROUPS_URL);
      if (url.searchParams.get("CodigoGrupoProduto")) urls.add(url.toString());
    } catch {
      // Link inválido é ignorado.
    }
  }

  for (const option of Array.from(document.querySelectorAll("select option[value]"))) {
    const value = normalizeText(option.getAttribute("value"));
    const label = normalizeText(option.textContent);
    if (!/^\d+$/.test(value) || label.length < 3) continue;
    const url = new URL(
      `/Publico/ConsultarLotesPorGrupo.aspx?CodigoGrupoProduto=${encodeURIComponent(value)}&Fundacao=1`,
      FUNDEP_GROUPS_URL,
    );
    urls.add(url.toString());
  }

  const regex = /ConsultarLotesPorGrupo\.aspx\?[^"'<>]*CodigoGrupoProduto=(\d+)[^"'<>]*/gi;
  for (const match of html.matchAll(regex)) {
    const url = new URL(
      `/Publico/ConsultarLotesPorGrupo.aspx?CodigoGrupoProduto=${encodeURIComponent(match[1])}&Fundacao=1`,
      FUNDEP_GROUPS_URL,
    );
    urls.add(url.toString());
  }
  return Array.from(urls);
}

/** Parser tolerante para listagens públicas da Funarbe. */
export function parseFunarbeHtml(html: string, portalUrl = FUNARBE_OPEN_URL): PortalOpportunity[] {
  const dom = new JSDOM(html, { url: portalUrl });
  const document = dom.window.document;
  const opportunities = new Map<string, PortalOpportunity>();

  const addCandidate = (textValue: string, hrefValue?: string | null) => {
    const text = normalizeText(textValue);
    if (text.length < 12) return;
    if (!/(abert|cota[cç][aã]o|preg[aã]o|sele[cç][aã]o|tomada\s+de\s+pre[cç]os)/i.test(text)) return;

    let href = portalUrl;
    try {
      if (hrefValue) href = new URL(hrefValue, portalUrl).toString();
    } catch {
      href = portalUrl;
    }
    const idMatch = text.match(
      /(?:processo|cota[cç][aã]o|preg[aã]o|sele[cç][aã]o|tomada|n[º°.]?)\s*[:#-]?\s*([A-Z0-9][A-Z0-9./-]{2,})/i,
    );
    const hrefId = href.match(/(?:id|processo|cotacao|pregao)[=/:-]+([A-Z0-9.-]{3,})/i)?.[1];
    const externalId = normalizeText(idMatch?.[1] ?? hrefId);
    if (!externalId) return;

    const title = truncate(text, 512);
    const description = text
      .replace(/abert[oa]s?\s+para\s+cota[cç][aã]o/gi, "")
      .replace(/hoje\s+\d{2}\/\d{2}\/\d{4}/gi, "")
      .trim();

    opportunities.set(externalId, {
      source: "funarbe",
      externalId,
      subject: title,
      orgao: "FUNARBE",
      portalUrl: href,
      prazoResposta: parseAbsoluteDeadline(text),
      bodyText: `Origem: Portal público de Compras Funarbe\nProcesso: ${externalId}\nURL: ${href}\n\n${text}`,
      items:
        description.length >= 20
          ? [{ numeroItem: 1, descricao: description, quantidade: 1, unidade: "UN" }]
          : [],
    });
  };

  for (const row of Array.from(document.querySelectorAll("table tbody tr"))) {
    const text = Array.from(row.querySelectorAll("th,td"))
      .map((cell) => normalizeText(cell.textContent))
      .filter(Boolean)
      .join(" | ");
    addCandidate(text, row.querySelector("a[href]")?.getAttribute("href"));
  }
  for (const anchor of Array.from(document.querySelectorAll("a[href]"))) {
    const parentText = normalizeText(anchor.parentElement?.textContent);
    addCandidate(parentText || anchor.textContent || "", anchor.getAttribute("href"));
  }
  return Array.from(opportunities.values());
}

async function fetchHtml(
  source: PortalOpportunitySource,
  operation: string,
  url: string,
): Promise<string> {
  const response = await externalHttpRequest<string>({
    source,
    operation,
    url,
    expected: "text",
    accept: "text/html,application/xhtml+xml",
    headers: {
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.7",
      "User-Agent": USER_AGENT,
    },
    timeoutMs: HTTP_TIMEOUT_MS,
    deadlineMs: HTTP_TIMEOUT_MS * 2,
    maxRetries: 2,
    maxBodyBytes: MAX_HTML_BYTES,
    validator: (payload) => {
      if (typeof payload !== "string") throw new Error("Portal retornou conteúdo não textual.");
      return payload;
    },
  });
  if (!response.ok || response.data == null) {
    throw new Error(response.error?.message ?? `HTTP ${response.statusCode}`);
  }
  return response.data;
}

async function fetchRenderedHtml(source: PortalOpportunitySource, url: string): Promise<string> {
  return renderPublicHtml({
    source,
    url,
    userAgent: USER_AGENT,
    navigationTimeoutMs: 45_000,
    maxHtmlBytes: MAX_HTML_BYTES,
  });
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  if (!values.length) return [];
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), values.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      results[index] = await mapper(values[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchFundepOpportunities(maxGroups: number, errors: string[]): Promise<PortalOpportunity[]> {
  const indexHtml = await fetchHtml("fundep", "groups.index", FUNDEP_GROUPS_URL);
  const groupUrls = extractFundepGroupUrls(indexHtml).slice(0, maxGroups);
  if (groupUrls.length === 0) {
    errors.push("Fundep: nenhum grupo público foi identificado na página de grupos ativos.");
    return [];
  }

  const batches = await mapWithConcurrency(groupUrls, 4, async (url) => {
    try {
      const html = await fetchHtml("fundep", "group.items", url);
      return parseFundepGroupHtml(html, url);
    } catch (error) {
      errors.push(`Fundep (${new URL(url).hostname}): ${error instanceof Error ? error.message : String(error)}`);
      return [] as PortalOpportunity[];
    }
  });

  const byId = new Map<string, PortalOpportunity>();
  for (const opportunity of batches.flat()) {
    const existing = byId.get(opportunity.externalId);
    if (!existing || opportunity.items.length > existing.items.length) byId.set(opportunity.externalId, opportunity);
  }
  return Array.from(byId.values());
}

async function fetchFunarbeOpportunities(errors: string[]): Promise<PortalOpportunity[]> {
  let staticSucceeded = false;
  try {
    const html = await fetchHtml("funarbe", "opportunities.html", FUNARBE_OPEN_URL);
    staticSucceeded = true;
    const parsed = parseFunarbeHtml(html);
    if (parsed.length > 0) return parsed;
  } catch (error) {
    errors.push(`Funarbe (HTML): ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const rendered = await fetchRenderedHtml("funarbe", FUNARBE_OPEN_URL);
    const parsed = parseFunarbeHtml(rendered);
    if (parsed.length === 0 && staticSucceeded) {
      errors.push(
        "Funarbe: fonte respondeu, mas nenhum registro ativo foi reconhecido; valide possível mudança de layout antes de concluir ausência de oportunidades.",
      );
    }
    return parsed;
  } catch (error) {
    errors.push(`Funarbe (browser seguro): ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

async function loadTambasaCatalog(): Promise<CatalogProduct[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ id: products.id, name: products.name, price: products.price })
    .from(products)
    .innerJoin(suppliers, eq(products.supplierId, suppliers.id))
    .where(and(eq(products.isActive, "yes"), like(suppliers.name, "%Tambasa%")))
    .limit(50_000);
}

function insertIdFromResult(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  if (!header || typeof header !== "object" || !("insertId" in header)) {
    throw new Error("Banco não retornou o ID da oportunidade inserida.");
  }
  const id = Number((header as { insertId?: unknown }).insertId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("ID inválido retornado ao inserir oportunidade.");
  return id;
}

async function persistOpportunity(
  opportunity: PortalOpportunity,
  matchIndex: NameMatchIndex,
): Promise<{ imported: boolean; matched: number; unmatched: number }> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  const messageId = `portal:${opportunity.source}:${opportunity.externalId}`;
  const [existing] = await db
    .select({ id: emailQuotations.id })
    .from(emailQuotations)
    .where(eq(emailQuotations.messageId, messageId))
    .limit(1);
  if (existing) return { imported: false, matched: 0, unmatched: 0 };

  const matches = opportunity.items.map((item) => bestNameMatchFromIndex(item.descricao, matchIndex));
  const matched = matches.filter(Boolean).length;

  return db.transaction(async (tx) => {
    const [duplicate] = await tx
      .select({ id: emailQuotations.id })
      .from(emailQuotations)
      .where(eq(emailQuotations.messageId, messageId))
      .limit(1);
    if (duplicate) return { imported: false, matched: 0, unmatched: 0 };

    const insertResult = await tx.insert(emailQuotations).values({
      messageId,
      fromName: opportunity.source === "fundep" ? "Portal Fundep" : "Portal Funarbe",
      fromAddress: null,
      subject: truncate(opportunity.subject, 512),
      orgao: opportunity.orgao,
      bodyText: truncate(opportunity.bodyText, 65_000),
      receivedAt: new Date(),
      prazoResposta: opportunity.prazoResposta,
      sourceType: "body",
      sourceFilename: null,
      status: opportunity.items.length > 0 ? "revisao" : "nova",
      totalItems: opportunity.items.length,
      matchedItems: matched,
    });
    const quotationId = insertIdFromResult(insertResult);

    if (opportunity.items.length > 0) {
      await tx.insert(emailQuotationItems).values(
        opportunity.items.map((item, index) => {
          const match = matches[index];
          return {
            quotationId,
            numeroItem: item.numeroItem,
            descricao: truncate(item.descricao, 65_000),
            quantidade: item.quantidade != null ? String(item.quantidade) : null,
            unidade: item.unidade,
            codigoCatalogo: item.codigoExterno ?? null,
            produtoMatchId: match?.product.id ?? null,
            matchScore: match ? String(Number(match.score.toFixed(4))) : null,
            matchMethod: match ? ("nome" as const) : ("nenhum" as const),
            matchConfirmado: false,
            precoSugerido: match?.product.price ?? null,
          };
        }),
      );
    }
    return {
      imported: true,
      matched,
      unmatched: opportunity.items.length - matched,
    };
  });
}

/**
 * Captura oportunidades públicas de Fundep/Funarbe usando a plataforma única
 * de integrações. As fontes são independentes e consultadas em paralelo; a
 * persistência de cada cotação + itens é atômica.
 */
export async function syncPortalOpportunities(options?: {
  sources?: PortalOpportunitySource[];
  maxFundepGroups?: number;
}): Promise<PortalSyncResult> {
  const sources = options?.sources?.length
    ? Array.from(new Set(options.sources))
    : (["fundep", "funarbe"] as PortalOpportunitySource[]);
  const maxFundepGroups = Math.min(
    Math.max(options?.maxFundepGroups ?? DEFAULT_MAX_FUNDEP_GROUPS, 1),
    MAX_FUNDEP_GROUPS,
  );
  const errors: string[] = [];

  const [fundep, funarbe, tambasaCatalog] = await Promise.all([
    sources.includes("fundep") ? fetchFundepOpportunities(maxFundepGroups, errors) : Promise.resolve([]),
    sources.includes("funarbe") ? fetchFunarbeOpportunities(errors) : Promise.resolve([]),
    loadTambasaCatalog(),
  ]);
  const opportunities = [...fundep, ...funarbe];
  if (tambasaCatalog.length === 0) {
    errors.push(
      "Catálogo Tambasa vazio: configure o fornecedor Tambasa e execute a sincronização completa antes do matching.",
    );
  }
  const matchIndex = buildNameMatchIndex(tambasaCatalog);

  let imported = 0;
  let skipped = 0;
  let matchedItems = 0;
  let unmatchedItems = 0;
  for (const opportunity of opportunities) {
    try {
      const persisted = await persistOpportunity(opportunity, matchIndex);
      if (persisted.imported) imported += 1;
      else skipped += 1;
      matchedItems += persisted.matched;
      unmatchedItems += persisted.unmatched;
    } catch (error) {
      errors.push(
        `${opportunity.source.toUpperCase()} ${opportunity.externalId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  logger.info(
    `[PortalSync] Fundep/Funarbe: ${opportunities.length} encontradas, ${imported} importadas, ` +
      `${skipped} já existentes, ${matchedItems} itens casados com Tambasa, ${errors.length} erro(s).`,
  );

  return {
    sources,
    found: opportunities.length,
    imported,
    skipped,
    matchedItems,
    unmatchedItems,
    errors,
  };
}
