import axios from "axios";
import { JSDOM } from "jsdom";
import puppeteer from "puppeteer";
import { and, eq, like } from "drizzle-orm";
import { getDb } from "../db";
import {
  emailQuotationItems,
  emailQuotations,
  products,
  suppliers,
} from "../../drizzle/schema";
import { bestNameMatch } from "./emailQuotationMatchingService";
import { assertSafeExternalUrl } from "../utils/urlGuard";
import { logger } from "../_core/logger";

const FUNDEP_GROUPS_URL =
  "https://portaldecompras.fundep.ufmg.br/Publico/ConsultarGruposAtivos.aspx";
const FUNARBE_OPEN_URL = "https://compras.funarbe.org.br/";
const DEFAULT_MAX_FUNDEP_GROUPS = 80;
const HTTP_TIMEOUT_MS = 30_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; S2Licit/1.0; +https://github.com/s2corporativo/s2licit)";

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

export interface PortalSourceSyncStats {
  source: PortalOpportunitySource;
  found: number;
  imported: number;
  skipped: number;
  matchedItems: number;
  unmatchedItems: number;
  /** Erros específicos desta fonte — não inclui erros de outra fonte da mesma rodada. */
  errors: string[];
}

export interface PortalSyncResult {
  sources: PortalOpportunitySource[];
  found: number;
  imported: number;
  skipped: number;
  matchedItems: number;
  unmatchedItems: number;
  errors: string[];
  /** Quebra por fonte (Fundep/Funarbe) — o agregado acima soma os dois. */
  sourceStats: PortalSourceSyncStats[];
}

interface TambasaCatalogProduct {
  id: number;
  name: string;
  price: string | null;
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
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function parseRelativeDeadline(text: string, now: Date): Date | null {
  const normalized = normalizeText(text);
  const match = normalized.match(
    /Finaliza\s+em[^0-9]*(\d+)(?::(\d{1,2}))?\s*horas?/i,
  );
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
    const rows = Array.from(table.querySelectorAll("tr"));
    for (const row of rows) {
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
          `Origem: Portal público de Compras Fundep`,
          `Grupo: ${groupName}`,
          `Lote: ${lotId}`,
          natureza ? `Natureza: ${natureza}` : null,
          processo ? `Processo: ${processo}` : null,
          `URL: ${portalUrl}`,
        ]
          .filter(Boolean)
          .join("\n"),
        items: [],
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
      // Link inválido é simplesmente ignorado.
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

    const href = hrefValue ? new URL(hrefValue, portalUrl).toString() : portalUrl;
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
      items: description.length >= 20
        ? [{ numeroItem: 1, descricao: description, quantidade: 1, unidade: "UN" }]
        : [],
    });
  };

  for (const row of Array.from(document.querySelectorAll("table tbody tr"))) {
    const text = Array.from(row.querySelectorAll("th,td"))
      .map((cell) => normalizeText(cell.textContent))
      .filter(Boolean)
      .join(" | ");
    const anchor = row.querySelector("a[href]");
    addCandidate(text, anchor?.getAttribute("href"));
  }

  for (const anchor of Array.from(document.querySelectorAll("a[href]"))) {
    const parentText = normalizeText(anchor.parentElement?.textContent);
    addCandidate(parentText || anchor.textContent || "", anchor.getAttribute("href"));
  }

  return Array.from(opportunities.values());
}

async function fetchHtml(urlValue: string): Promise<string> {
  const url = assertSafeExternalUrl(urlValue, "URL do portal");
  const response = await axios.get<string>(url.toString(), {
    timeout: HTTP_TIMEOUT_MS,
    responseType: "text",
    maxRedirects: 5,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "pt-BR,pt;q=0.9",
    },
  });
  return typeof response.data === "string" ? response.data : String(response.data ?? "");
}

async function fetchRenderedHtml(urlValue: string): Promise<string> {
  const url = assertSafeExternalUrl(urlValue, "URL do portal");
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.goto(url.toString(), { waitUntil: "networkidle2", timeout: 45_000 });
    return await page.content();
  } finally {
    await browser.close();
  }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(values.length);
  let cursor = 0;

  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await mapper(values[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );
  return results;
}

async function fetchFundepOpportunities(maxGroups: number, errors: string[]) {
  const indexHtml = await fetchHtml(FUNDEP_GROUPS_URL);
  const groupUrls = extractFundepGroupUrls(indexHtml).slice(0, maxGroups);
  if (groupUrls.length === 0) {
    errors.push("Fundep: nenhum grupo público foi identificado na página de grupos ativos.");
    return [] as PortalOpportunity[];
  }

  const batches = await mapWithConcurrency(groupUrls, 4, async (url) => {
    try {
      const html = await fetchHtml(url);
      return parseFundepGroupHtml(html, url);
    } catch (error) {
      errors.push(`Fundep (${url}): ${(error as Error).message}`);
      return [] as PortalOpportunity[];
    }
  });

  const byId = new Map<string, PortalOpportunity>();
  for (const opportunity of batches.flat()) {
    const existing = byId.get(opportunity.externalId);
    if (!existing || opportunity.items.length > existing.items.length) {
      byId.set(opportunity.externalId, opportunity);
    }
  }
  return Array.from(byId.values());
}

async function fetchFunarbeOpportunities(errors: string[]) {
  try {
    const html = await fetchHtml(FUNARBE_OPEN_URL);
    const parsed = parseFunarbeHtml(html);
    if (parsed.length > 0) return parsed;
  } catch (error) {
    errors.push(`Funarbe (HTML): ${(error as Error).message}`);
  }

  try {
    const rendered = await fetchRenderedHtml(FUNARBE_OPEN_URL);
    return parseFunarbeHtml(rendered);
  } catch (error) {
    errors.push(`Funarbe (navegador): ${(error as Error).message}`);
    return [] as PortalOpportunity[];
  }
}

async function loadTambasaCatalog(): Promise<TambasaCatalogProduct[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ id: products.id, name: products.name, price: products.price })
    .from(products)
    .innerJoin(suppliers, eq(products.supplierId, suppliers.id))
    .where(and(eq(products.isActive, "yes"), like(suppliers.name, "%Tambasa%")))
    .limit(50_000);
}

async function persistOpportunity(
  opportunity: PortalOpportunity,
  tambasaCatalog: TambasaCatalogProduct[],
): Promise<{ imported: boolean; matched: number; unmatched: number }> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  const messageId = `portal:${opportunity.source}:${opportunity.externalId}`;
  const existing = await db
    .select({ id: emailQuotations.id })
    .from(emailQuotations)
    .where(eq(emailQuotations.messageId, messageId))
    .limit(1);
  if (existing.length > 0) return { imported: false, matched: 0, unmatched: 0 };

  const matches = opportunity.items.map((item) => bestNameMatch(item.descricao, tambasaCatalog));
  const matched = matches.filter(Boolean).length;

  const [inserted] = await db.insert(emailQuotations).values({
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
  const quotationId = (inserted as { insertId?: number }).insertId;
  if (!quotationId) throw new Error(`Não foi possível identificar a cotação criada (${messageId}).`);

  if (opportunity.items.length > 0) {
    await db.insert(emailQuotationItems).values(
      opportunity.items.map((item, index) => {
        const match = matches[index];
        return {
          quotationId,
          numeroItem: item.numeroItem,
          descricao: truncate(item.descricao, 65_000),
          quantidade: item.quantidade != null ? String(item.quantidade) : null,
          unidade: item.unidade,
          codigoCatalogo: null,
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
}

/**
 * Captura oportunidades públicas da Fundep/Funarbe, cruza exclusivamente com
 * produtos Tambasa e as encaminha para a mesma fila auditável de cotações.
 * O envio permanece bloqueado até confirmação humana dos matches e preços.
 */
export async function syncPortalOpportunities(options?: {
  sources?: PortalOpportunitySource[];
  maxFundepGroups?: number;
  /** Catálogo já carregado pelo chamador — evita recarregar quando o chamador já fez o load (ex.: syncS2PortalOpportunities). */
  tambasaCatalog?: TambasaCatalogProduct[];
}): Promise<PortalSyncResult> {
  const sources = options?.sources?.length
    ? Array.from(new Set(options.sources))
    : (["fundep", "funarbe"] as PortalOpportunitySource[]);
  const maxFundepGroups = Math.min(
    Math.max(options?.maxFundepGroups ?? DEFAULT_MAX_FUNDEP_GROUPS, 1),
    200,
  );
  const bySource = new Map<PortalOpportunitySource, PortalSourceSyncStats>(
    sources.map((source) => [
      source,
      { source, found: 0, imported: 0, skipped: 0, matchedItems: 0, unmatchedItems: 0, errors: [] },
    ]),
  );
  const opportunities: PortalOpportunity[] = [];

  // Cada fonte é isolada: uma rejeição na busca da Fundep (ex.: página de
  // grupos fora do ar) não pode derrubar a sincronização inteira e impedir a
  // Funarbe de rodar — o erro fica registrado na própria fonte.
  if (sources.includes("fundep")) {
    const stats = bySource.get("fundep")!;
    try {
      opportunities.push(...(await fetchFundepOpportunities(maxFundepGroups, stats.errors)));
    } catch (error) {
      stats.errors.push(`Fundep: ${(error as Error).message}`);
    }
  }
  if (sources.includes("funarbe")) {
    const stats = bySource.get("funarbe")!;
    try {
      opportunities.push(...(await fetchFunarbeOpportunities(stats.errors)));
    } catch (error) {
      stats.errors.push(`Funarbe: ${(error as Error).message}`);
    }
  }

  const tambasaCatalog = options?.tambasaCatalog ?? (await loadTambasaCatalog());
  if (tambasaCatalog.length === 0) {
    for (const source of sources) {
      bySource.get(source)!.errors.push(
        "Catálogo Tambasa vazio: configure o fornecedor Tambasa e execute a sincronização completa antes do matching.",
      );
    }
  }

  let imported = 0;
  let skipped = 0;
  let matchedItems = 0;
  let unmatchedItems = 0;

  for (const opportunity of opportunities) {
    const sourceStats = bySource.get(opportunity.source);
    if (sourceStats) sourceStats.found++;
    try {
      const persisted = await persistOpportunity(opportunity, tambasaCatalog);
      if (persisted.imported) { imported++; if (sourceStats) sourceStats.imported++; }
      else { skipped++; if (sourceStats) sourceStats.skipped++; }
      matchedItems += persisted.matched;
      unmatchedItems += persisted.unmatched;
      if (sourceStats) {
        sourceStats.matchedItems += persisted.matched;
        sourceStats.unmatchedItems += persisted.unmatched;
      }
    } catch (error) {
      const message = `${opportunity.source.toUpperCase()} ${opportunity.externalId}: ${(error as Error).message}`;
      sourceStats ? sourceStats.errors.push(message) : void 0;
    }
  }

  logger.info(
    `[PortalSync] Fundep/Funarbe: ${opportunities.length} encontradas, ${imported} importadas, ` +
      `${skipped} já existentes, ${matchedItems} itens casados com Tambasa.`,
  );

  const sourceStats = Array.from(bySource.values());
  return {
    sources,
    found: opportunities.length,
    imported,
    skipped,
    matchedItems,
    unmatchedItems,
    errors: sourceStats.flatMap((s) => s.errors),
    sourceStats,
  };
}
