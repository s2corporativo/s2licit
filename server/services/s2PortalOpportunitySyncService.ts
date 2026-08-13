import axios from "axios";
import { createHash } from "crypto";
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
import {
  fetchAuthenticatedPortalHtml,
  isPortalAuthDiscoveryEnabled,
} from "./portalAuthenticatedDiscoveryService";
import {
  isFunarbeProviderPortal,
  parseAgregaCombinedHtml,
} from "./funarbeProviderPortal";
import { assertSafeExternalUrl } from "../utils/urlGuard";
import { logger } from "../_core/logger";

const HTTP_TIMEOUT_MS = 30_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; S2Licit/1.0; +https://github.com/s2corporativo/s2licit)";
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
  source: S2TargetPortal;
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

interface TambasaCatalogProduct {
  id: number;
  name: string;
  price: string | null;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(value: string, max = 512): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function stableId(source: S2TargetPortal, url: string, text: string): string {
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

  const iso = normalized.match(
    /(?:encerramento|encerra|finaliza|prazo|limite|fim|closing|end\s+date)[^0-9]*(\d{4})-(\d{2})-(\d{2})(?:[T\s]+(\d{1,2}):(\d{2}))?/i,
  );
  if (!iso) return null;
  const [, year, month, day, hour = "23", minute = "59"] = iso;
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
    // A URL já foi normalizada pelo chamador; falhas aqui não interrompem a captura.
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
  if (
    /(?:encerrad[oa]|conclu[ií]d[oa]|homologad[oa]|cancelad[oa]|anulad[oa]|revogad[oa]|desert[oa]|fracassad[oa]|finished|closed|approved|canceled|cancelled|annulled|repealed|failed)/i.test(
      normalized,
    )
  ) {
    return false;
  }
  return /(?:processo|licita[cç][aã]o|preg[aã]o|cota[cç][aã]o|compra\s+direta|contrata[cç][aã]o|bidding\s+process|quotation|direct\s+purchase|public\s+call|em\s+andamento|in\s+progress|recebimento\s+de\s+propostas|offers?\s+receipt|scheduled|published|agendada|publicada)/i.test(
    normalized,
  );
}

/**
 * Parser deliberadamente genérico para os murais públicos de Compras MG,
 * FIEMG/SESI/SENAI, CEMIG e COPASA. Ele só lê conteúdo já disponibilizado ao
 * público e não tenta autenticar, resolver CAPTCHA ou contornar permissões.
 */
export function parseInstitutionalPortalHtml(
  source: S2TargetPortal,
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
      bodyText: [
        `Origem: ${definition.label}`,
        `Processo: ${externalId}`,
        `URL: ${href}`,
        "",
        text,
      ].join("\n"),
      items,
    };

    const current = candidates.get(externalId);
    if (!current || opportunity.bodyText.length > current.bodyText.length) {
      candidates.set(externalId, opportunity);
    }
  };

  for (const row of Array.from(document.querySelectorAll("table tr"))) {
    const cells = Array.from(row.querySelectorAll("th,td"))
      .map((cell) => normalizeText(cell.textContent))
      .filter(Boolean);
    if (cells.length === 0) continue;
    const anchor = row.querySelector("a[href]");
    addCandidate(cells.join(" | "), anchor?.getAttribute("href"));
  }

  for (const selector of [
    "article",
    ".card",
    "[class*='process']",
    "[class*='licit']",
    "[class*='cotacao']",
    "[class*='opportun']",
    "li",
  ]) {
    for (const element of Array.from(document.querySelectorAll(selector))) {
      const anchor = element.querySelector("a[href]");
      addCandidate(element.textContent || "", anchor?.getAttribute("href"));
    }
  }

  for (const anchor of Array.from(document.querySelectorAll("a[href]"))) {
    const context = normalizeText(anchor.closest("tr,article,li,div")?.textContent || anchor.textContent);
    addCandidate(context, anchor.getAttribute("href"));
  }

  return Array.from(candidates.values());
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
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.7",
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
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(url.toString(), { waitUntil: "networkidle2", timeout: 45_000 });
    return await page.content();
  } finally {
    await browser.close();
  }
}

async function fetchInstitutionalOpportunities(
  source: InstitutionalSource,
  errors: string[],
): Promise<S2PortalOpportunity[]> {
  const definition = S2_TARGET_PORTAL_DEFINITIONS[source];
  const url = getS2PortalUrl(source);

  try {
    const html = await fetchHtml(url);
    const parsed = parseInstitutionalPortalHtml(source, html, url);
    if (parsed.length > 0) return parsed;
  } catch (error) {
    errors.push(`${definition.label} (HTML): ${(error as Error).message}`);
  }

  try {
    const rendered = await fetchRenderedHtml(url);
    const parsed = parseInstitutionalPortalHtml(source, rendered, url);
    if (parsed.length > 0) return parsed;
  } catch (error) {
    errors.push(`${definition.label} (navegador): ${(error as Error).message}`);
  }

  // Terceira tentativa: área autenticada com credencial do cofre (portais que
  // só listam cotações ao fornecedor logado). CAPTCHA interrompe com aviso.
  const authenticated = await fetchAuthenticatedOpportunities(source, errors);
  if (authenticated.length > 0) return authenticated;

  const guidance = definition.discovery === "authenticated_assisted"
    ? "O portal não expôs uma listagem pública utilizável. A participação permanece disponível pelo Agente de Propostas com credencial do cofre e aprovação humana."
    : `Nenhuma oportunidade pública ativa foi identificada. Caso o endereço público mude, configure ${definition.environmentUrl ?? "a URL do portal"}.`;
  errors.push(`${definition.label}: ${guidance}`);
  return [];
}

/**
 * Descoberta autenticada: entra no portal com a credencial do cofre e passa o
 * HTML da área logada pelos mesmos parsers do radar público. Sem credencial ou
 * com a chave desligada, devolve lista vazia em silêncio (o radar público já
 * cobriu o que era possível).
 */
async function fetchAuthenticatedOpportunities(
  source: S2TargetPortal,
  errors: string[],
): Promise<S2PortalOpportunity[]> {
  if (!isPortalAuthDiscoveryEnabled()) return [];
  const definition = S2_TARGET_PORTAL_DEFINITIONS[source];
  try {
    const html = await fetchAuthenticatedPortalHtml(source);
    if (!html) return [];
    // Funarbe: o HTML autenticado vem do portal do fornecedor (Agrega/Yii2),
    // que não é uma listagem institucional comum — usa o parser dedicado das
    // GridView do Agrega, que preserva prazos, quantidades e valores.
    if (isFunarbeProviderPortal(source)) {
      // As oportunidades do Agrega são devolvidas no formato estrutural do
      // radar (source externo fica fixo em "funarbe" para o fallback autenticado).
      return parseAgregaCombinedHtml(html).map((opportunity) => ({
        ...opportunity,
        source,
      })) as S2PortalOpportunity[];
    }
    return parseInstitutionalPortalHtml(source, html, getS2PortalUrl(source));
  } catch (error) {
    errors.push(`${definition.label} (autenticado): ${(error as Error).message}`);
    return [];
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
  opportunity: S2PortalOpportunity,
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
  const definition = S2_TARGET_PORTAL_DEFINITIONS[opportunity.source];

  const [inserted] = await db.insert(emailQuotations).values({
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

function emptyStats(source: S2TargetPortal): S2PortalSourceStats {
  return {
    source,
    found: 0,
    imported: 0,
    skipped: 0,
    matchedItems: 0,
    unmatchedItems: 0,
    errors: [],
  };
}

/**
 * Radar único do S2 Licit. O escopo é propositalmente fechado em COPASA,
 * CEMIG, Fundep, Funarbe, Compras MG e FIEMG/SESI/SENAI.
 */
export async function syncS2PortalOpportunities(options?: {
  sources?: S2TargetPortal[];
  maxFundepGroups?: number;
}): Promise<S2PortalSyncResult> {
  const requested = options?.sources?.length ? options.sources : [...S2_TARGET_PORTALS];
  const sources = Array.from(new Set(requested)).filter((source): source is S2TargetPortal =>
    (S2_TARGET_PORTALS as readonly string[]).includes(source),
  );
  const stats = new Map<S2TargetPortal, S2PortalSourceStats>(
    sources.map((source) => [source, emptyStats(source)]),
  );

  const foundationSources = sources.filter(
    (source): source is FoundationPortalSource => source === "fundep" || source === "funarbe",
  );
  const institutionalSources = sources.filter(
    (source): source is InstitutionalSource =>
      (INSTITUTIONAL_SOURCES as readonly string[]).includes(source),
  );

  // Carregado uma única vez para todo o sync (era carregado de novo a cada
  // fallback autenticado da fundação E de novo para os institucionais).
  const tambasaCatalog =
    foundationSources.length > 0 || institutionalSources.length > 0 ? await loadTambasaCatalog() : [];

  if (foundationSources.length > 0) {
    const result = await syncFoundationOpportunities({
      sources: foundationSources,
      maxFundepGroups: options?.maxFundepGroups,
      tambasaCatalog,
    });
    // Contagem POR FONTE (não o agregado de Fundep+Funarbe combinados) —
    // senão Funarbe herda o resultado de Fundep (e vice-versa) e o fallback
    // autenticado abaixo nunca roda quando só uma das duas tem resultado.
    // Erros também são só os da própria fonte — senão um erro do Fundep
    // apareceria (duplicado) no relatório da Funarbe, e vice-versa.
    for (const source of foundationSources) {
      const target = stats.get(source)!;
      const perSource = result.sourceStats.find((s) => s.source === source);
      target.found = perSource?.found ?? 0;
      target.imported = perSource?.imported ?? 0;
      target.skipped = perSource?.skipped ?? 0;
      target.matchedItems = perSource?.matchedItems ?? 0;
      target.unmatchedItems = perSource?.unmatchedItems ?? 0;
      target.errors.push(...(perSource?.errors ?? []));
    }

    // Fallback autenticado das fundações: se o mural público não trouxe nada e
    // há credencial no cofre, tenta a área logada do fornecedor.
    for (const source of foundationSources) {
      const target = stats.get(source)!;
      if (target.found > 0) continue;
      const authenticated = await fetchAuthenticatedOpportunities(source, target.errors);
      if (authenticated.length === 0) continue;
      target.found += authenticated.length;
      for (const opportunity of authenticated) {
        try {
          const persisted = await persistOpportunity(opportunity, tambasaCatalog);
          if (persisted.imported) target.imported++;
          else target.skipped++;
          target.matchedItems += persisted.matched;
          target.unmatchedItems += persisted.unmatched;
        } catch (error) {
          target.errors.push(`${opportunity.externalId}: ${(error as Error).message}`);
        }
      }
    }
  }

  if (institutionalSources.length > 0) {
    if (tambasaCatalog.length === 0) {
      for (const source of institutionalSources) {
        stats.get(source)!.errors.push(
          "Catálogo Tambasa vazio: configure o fornecedor Tambasa e execute a sincronização completa antes do matching.",
        );
      }
    }

    for (const source of institutionalSources) {
      const sourceStats = stats.get(source)!;
      const opportunities = await fetchInstitutionalOpportunities(source, sourceStats.errors);
      sourceStats.found = opportunities.length;
      for (const opportunity of opportunities) {
        try {
          const persisted = await persistOpportunity(opportunity, tambasaCatalog);
          if (persisted.imported) sourceStats.imported++;
          else sourceStats.skipped++;
          sourceStats.matchedItems += persisted.matched;
          sourceStats.unmatchedItems += persisted.unmatched;
        } catch (error) {
          sourceStats.errors.push(
            `${opportunity.externalId}: ${(error as Error).message}`,
          );
        }
      }
    }
  }

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
    `[PortalSync] Seis portais S2: ${result.found} encontradas, ${result.imported} importadas, ` +
      `${result.skipped} já existentes e ${result.matchedItems} itens casados com Tambasa.`,
  );

  return result;
}
