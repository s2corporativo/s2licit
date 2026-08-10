import { createHash } from "node:crypto";
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
import {
  syncPortalOpportunities as syncFoundationOpportunities,
  type PortalOpportunitySource as FoundationPortalSource,
} from "./portalOpportunitySyncService";
import {
  S2_TARGET_PORTAL_DEFINITIONS,
  S2_TARGET_PORTALS,
  getS2PortalUrl,
  type S2TargetPortal,
} from "./s2TargetPortals";

const HTTP_TIMEOUT_MS = 30_000;
const MAX_HTML_BYTES = 8 * 1024 * 1024;
const INSTITUTIONAL_CONCURRENCY = 2;
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36 S2Licit/2.0";
const INSTITUTIONAL_SOURCES = ["comprasmg", "fiemg", "cemig", "copasa"] as const;

type InstitutionalSource = (typeof INSTITUTIONAL_SOURCES)[number];

export interface S2PortalOpportunityItem {
  numeroItem: number;
  descricao: string;
  quantidade: number | null;
  unidade: string | null;
  codigoExterno?: string | null;
}

export interface S2PortalOpportunity {
  source: InstitutionalSource;
  externalId: string;
  subject: string;
  orgao: string;
  portalUrl: string;
  prazoResposta: Date | null;
  bodyText: string;
  items: S2PortalOpportunityItem[];
}

export interface S2PortalSourceStats {
  source: S2TargetPortal;
  found: number;
  imported: number;
  skipped: number;
  matchedItems: number;
  unmatchedItems: number;
  errors: string[];
}

export interface S2PortalSyncResult {
  sources: S2TargetPortal[];
  found: number;
  imported: number;
  skipped: number;
  matchedItems: number;
  unmatchedItems: number;
  errors: string[];
  sourceStats: S2PortalSourceStats[];
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(value: string, max = 512): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`;
}

function stableId(source: InstitutionalSource, url: string, text: string): string {
  return createHash("sha256")
    .update(`${source}|${url}|${normalizeText(text).slice(0, 2_000)}`)
    .digest("hex")
    .slice(0, 24);
}

function parseAbsoluteDeadline(text: string): Date | null {
  const normalized = normalizeText(text);
  const br = normalized.match(
    /(?:encerramento|encerra|finaliza|prazo|limite|fim|closing|end\s+date)[^0-9]*(\d{2})\/(\d{2})\/(\d{4})(?:[^0-9]+(\d{1,2}):(\d{2}))?/i,
  );
  if (br) {
    const [, day, month, year, hour = "23", minute = "59"] = br;
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0, 0);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const iso = normalized.match(
    /(?:encerramento|encerra|finaliza|prazo|limite|fim|closing|end\s+date)[^0-9]*(\d{4})-(\d{2})-(\d{2})(?:[T\s]+(\d{1,2}):(\d{2}))?/i,
  );
  if (!iso) return null;
  const [, year, month, day, hour = "23", minute = "59"] = iso;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function extractExternalId(text: string, href: string): string | null {
  const normalized = normalizeText(text);
  const patterns = [
    /(?:processo|proc\.?|licita[cç][aã]o|preg[aã]o|cota[cç][aã]o|compra\s+direta|bidding\s+process|quotation|public\s+call)\s*(?:n[º°.]?|number|no\.?|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9./_-]{2,})/i,
    /\b([A-Z]{0,6}\d{2,}[./-]\d{2,4}[A-Z0-9./_-]*)\b/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) return match[1].replace(/[),.;]+$/, "");
  }
  try {
    const url = new URL(href);
    for (const key of ["id", "processo", "process", "cotacao", "licitacao", "pregao", "codigo", "cod"] as const) {
      const value = normalizeText(url.searchParams.get(key));
      if (value.length >= 3) return value;
    }
    const tail = url.pathname.split("/").filter(Boolean).pop();
    if (tail && /\d/.test(tail) && tail.length >= 3) return tail;
  } catch {
    // URL inválida não interrompe o parser.
  }
  return null;
}

function extractObject(text: string): string {
  const normalized = normalizeText(text);
  const explicit = normalized.match(
    /(?:objeto|object|descri[cç][aã]o|description)\s*[:\-]\s*(.{12,800}?)(?=(?:situa[cç][aã]o|status|modalidade|mode|in[ií]cio|start|encerramento|closing|$))/i,
  )?.[1];
  if (explicit) return normalizeText(explicit);
  return normalizeText(
    normalized
      .replace(/(?:processo|proc\.?|licita[cç][aã]o|preg[aã]o|cota[cç][aã]o|compra\s+direta|bidding\s+process|quotation|public\s+call)\s*(?:n[º°.]?|number|no\.?|#)?\s*[:\-]?\s*[A-Z0-9./_-]+/gi, "")
      .replace(/(?:em\s+andamento|in\s+progress|recebimento\s+de\s+propostas|offers?\s+receipt|scheduled|published|agendada|publicada)/gi, ""),
  ).slice(0, 2_000);
}

function isActiveCandidate(text: string): boolean {
  const normalized = normalizeText(text);
  if (normalized.length < 12 || normalized.length > 20_000) return false;
  if (/(?:encerrad[oa]|conclu[ií]d[oa]|homologad[oa]|cancelad[oa]|anulad[oa]|revogad[oa]|desert[oa]|fracassad[oa]|finished|closed|approved|canceled|cancelled|annulled|repealed|failed)/i.test(normalized)) {
    return false;
  }
  return /(?:processo|licita[cç][aã]o|preg[aã]o|cota[cç][aã]o|compra\s+direta|contrata[cç][aã]o|bidding\s+process|quotation|direct\s+purchase|public\s+call|em\s+andamento|in\s+progress|recebimento\s+de\s+propostas|offers?\s+receipt|scheduled|published|agendada|publicada)/i.test(normalized);
}

/** Parser comum dos murais institucionais públicos. */
export function parseInstitutionalPortalHtml(
  source: InstitutionalSource,
  html: string,
  portalUrl: string,
): S2PortalOpportunity[] {
  const definition = S2_TARGET_PORTAL_DEFINITIONS[source];
  const dom = new JSDOM(html, { url: portalUrl });
  const document = dom.window.document;
  const candidates = new Map<string, S2PortalOpportunity>();

  const addCandidate = (textValue: string, hrefValue?: string | null) => {
    const text = normalizeText(textValue);
    if (!isActiveCandidate(text)) return;
    let href = portalUrl;
    try {
      href = hrefValue ? new URL(hrefValue, portalUrl).toString() : portalUrl;
    } catch {
      href = portalUrl;
    }
    const extractedId = extractExternalId(text, href);
    const externalId = extractedId || stableId(source, href, text);
    const object = extractObject(text);
    const subject = truncate(
      extractedId
        ? `${definition.label} — ${extractedId}${object ? ` — ${object}` : ""}`
        : `${definition.label} — ${object || text}`,
      512,
    );
    const items = object.length >= 12
      ? [{ numeroItem: 1, descricao: object, quantidade: 1, unidade: "UN", codigoExterno: null }]
      : [];
    const opportunity: S2PortalOpportunity = {
      source,
      externalId,
      subject,
      orgao: definition.orgao,
      portalUrl: href,
      prazoResposta: parseAbsoluteDeadline(text),
      bodyText: [`Origem: ${definition.label}`, `Processo: ${externalId}`, `URL: ${href}`, "", text].join("\n"),
      items,
    };
    const current = candidates.get(externalId);
    if (!current || opportunity.bodyText.length > current.bodyText.length) candidates.set(externalId, opportunity);
  };

  for (const row of Array.from(document.querySelectorAll("table tr"))) {
    const cells = Array.from(row.querySelectorAll("th,td"))
      .map((cell) => normalizeText(cell.textContent))
      .filter(Boolean);
    if (cells.length) addCandidate(cells.join(" | "), row.querySelector("a[href]")?.getAttribute("href"));
  }
  for (const selector of ["article", ".card", "[class*='process']", "[class*='licit']", "[class*='cotacao']", "[class*='opportun']", "li"]) {
    for (const element of Array.from(document.querySelectorAll(selector))) {
      addCandidate(element.textContent || "", element.querySelector("a[href]")?.getAttribute("href"));
    }
  }
  for (const anchor of Array.from(document.querySelectorAll("a[href]"))) {
    const context = normalizeText(anchor.closest("tr,article,li,div")?.textContent || anchor.textContent);
    addCandidate(context, anchor.getAttribute("href"));
  }
  return Array.from(candidates.values());
}

function pageLooksLikeOpportunityPortal(html: string): boolean {
  return /licita[cç][aã]o|edital|preg[aã]o|cota[cç][aã]o|processo|contrata[cç][aã]o|compra\s+direta|recebimento\s+de\s+propostas/i.test(html);
}

async function fetchHtml(source: InstitutionalSource, url: string): Promise<string> {
  const response = await externalHttpRequest<string>({
    source,
    operation: "opportunities.html",
    url,
    expected: "text",
    accept: "text/html,application/xhtml+xml",
    headers: { "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.7" },
    timeoutMs: HTTP_TIMEOUT_MS,
    deadlineMs: HTTP_TIMEOUT_MS * 2,
    maxRetries: 2,
    maxBodyBytes: MAX_HTML_BYTES,
    validator: (payload) => {
      if (typeof payload !== "string") throw new Error("Portal retornou conteúdo não textual.");
      return payload;
    },
  });
  if (!response.ok || response.data == null) throw new Error(response.error?.message ?? `HTTP ${response.statusCode}`);
  return response.data;
}

async function fetchRenderedHtml(source: InstitutionalSource, url: string): Promise<string> {
  return renderPublicHtml({
    source,
    url,
    userAgent: BROWSER_USER_AGENT,
    navigationTimeoutMs: 45_000,
    maxHtmlBytes: MAX_HTML_BYTES,
  });
}

async function fetchInstitutionalOpportunities(
  source: InstitutionalSource,
  errors: string[],
): Promise<S2PortalOpportunity[]> {
  const definition = S2_TARGET_PORTAL_DEFINITIONS[source];
  const url = await getS2PortalUrl(source);
  let staticSucceeded = false;
  let renderedSucceeded = false;
  let lastHtml = "";

  try {
    const html = await fetchHtml(source, url);
    staticSucceeded = true;
    lastHtml = html;
    const parsed = parseInstitutionalPortalHtml(source, html, url);
    if (parsed.length > 0) return parsed;
  } catch (error) {
    errors.push(`${definition.label} (HTML): ${error instanceof Error ? error.message : String(error)}`);
  }

  if (definition.discovery !== "public") {
    try {
      const rendered = await fetchRenderedHtml(source, url);
      renderedSucceeded = true;
      lastHtml = rendered;
      const parsed = parseInstitutionalPortalHtml(source, rendered, url);
      if (parsed.length > 0) return parsed;
    } catch (error) {
      errors.push(`${definition.label} (browser seguro): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if ((staticSucceeded || renderedSucceeded) && lastHtml && pageLooksLikeOpportunityPortal(lastHtml)) {
    errors.push(
      `${definition.label}: a fonte respondeu, mas nenhum registro ativo foi reconhecido. Valide possível mudança de layout/contrato antes de concluir ausência de oportunidades.`,
    );
  }
  return [];
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
  opportunity: S2PortalOpportunity,
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
  const definition = S2_TARGET_PORTAL_DEFINITIONS[opportunity.source];

  return db.transaction(async (tx) => {
    const [duplicate] = await tx
      .select({ id: emailQuotations.id })
      .from(emailQuotations)
      .where(eq(emailQuotations.messageId, messageId))
      .limit(1);
    if (duplicate) return { imported: false, matched: 0, unmatched: 0 };

    const insertResult = await tx.insert(emailQuotations).values({
      messageId,
      fromName: `Portal ${definition.label}`,
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
    return { imported: true, matched, unmatched: opportunity.items.length - matched };
  });
}

function emptyStats(source: S2TargetPortal): S2PortalSourceStats {
  return { source, found: 0, imported: 0, skipped: 0, matchedItems: 0, unmatchedItems: 0, errors: [] };
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

async function syncInstitutionalSource(
  source: InstitutionalSource,
  matchIndex: NameMatchIndex,
): Promise<S2PortalSourceStats> {
  const stats = emptyStats(source);
  const opportunities = await fetchInstitutionalOpportunities(source, stats.errors);
  stats.found = opportunities.length;
  for (const opportunity of opportunities) {
    try {
      const persisted = await persistOpportunity(opportunity, matchIndex);
      if (persisted.imported) stats.imported += 1;
      else stats.skipped += 1;
      stats.matchedItems += persisted.matched;
      stats.unmatchedItems += persisted.unmatched;
    } catch (error) {
      stats.errors.push(`${opportunity.externalId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return stats;
}

/** Radar agendado único dos portais institucionais do S2 Licit. */
export async function syncS2PortalOpportunities(options?: {
  sources?: S2TargetPortal[];
  maxFundepGroups?: number;
}): Promise<S2PortalSyncResult> {
  const requested = options?.sources?.length ? options.sources : [...S2_TARGET_PORTALS];
  const sources = Array.from(new Set(requested)).filter((source): source is S2TargetPortal =>
    (S2_TARGET_PORTALS as readonly string[]).includes(source),
  );
  const stats = new Map<S2TargetPortal, S2PortalSourceStats>(sources.map((source) => [source, emptyStats(source)]));

  const foundationSources = sources.filter(
    (source): source is FoundationPortalSource => source === "fundep" || source === "funarbe",
  );
  const institutionalSources = sources.filter(
    (source): source is InstitutionalSource => (INSTITUTIONAL_SOURCES as readonly string[]).includes(source),
  );

  const foundationTasks = foundationSources.map(async (source) => {
    const target = stats.get(source)!;
    try {
      const result = await syncFoundationOpportunities({
        sources: [source],
        maxFundepGroups: options?.maxFundepGroups,
      });
      target.found = result.found;
      target.imported = result.imported;
      target.skipped = result.skipped;
      target.matchedItems = result.matchedItems;
      target.unmatchedItems = result.unmatchedItems;
      target.errors.push(...result.errors);
    } catch (error) {
      target.errors.push(error instanceof Error ? error.message : String(error));
    }
  });

  const catalog = institutionalSources.length > 0 ? await loadTambasaCatalog() : [];
  const matchIndex = buildNameMatchIndex(catalog);
  if (institutionalSources.length > 0 && catalog.length === 0) {
    for (const source of institutionalSources) {
      stats.get(source)!.errors.push(
        "Catálogo Tambasa vazio: configure o fornecedor Tambasa e execute a sincronização completa antes do matching.",
      );
    }
  }

  const institutionalTask = mapWithConcurrency(
    institutionalSources,
    INSTITUTIONAL_CONCURRENCY,
    async (source) => syncInstitutionalSource(source, matchIndex),
  ).then((results) => {
    for (const result of results) stats.set(result.source, result);
  });

  await Promise.all([...foundationTasks, institutionalTask]);

  const sourceStats = sources.map((source) => stats.get(source)!);
  const result: S2PortalSyncResult = {
    sources,
    found: sourceStats.reduce((sum, item) => sum + item.found, 0),
    imported: sourceStats.reduce((sum, item) => sum + item.imported, 0),
    skipped: sourceStats.reduce((sum, item) => sum + item.skipped, 0),
    matchedItems: sourceStats.reduce((sum, item) => sum + item.matchedItems, 0),
    unmatchedItems: sourceStats.reduce((sum, item) => sum + item.unmatchedItems, 0),
    errors: sourceStats.flatMap((item) =>
      item.errors.map((error) => `${S2_TARGET_PORTAL_DEFINITIONS[item.source].label}: ${error}`),
    ),
    sourceStats,
  };

  logger.info(
    `[PortalSync] Fontes S2: ${result.found} encontradas, ${result.imported} importadas, ` +
      `${result.skipped} já existentes, ${result.matchedItems} itens casados, ${result.errors.length} erro(s).`,
  );
  return result;
}
