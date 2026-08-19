import { and, desc, eq, isNotNull, ne } from "drizzle-orm";
import {
  auditLogs,
  emailQuotationItems,
  emailQuotations,
  products,
  suppliers,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { calcLandedCost } from "../db/landedCost";
import { getPriceHistory, getProductSupplierPrices } from "../db/supplierPrices";
import { calculateStringSimilarity } from "./productMatchingService";
import { getEmailQuotationWithItems } from "./emailQuotationSyncService";
import { suggestSimilarItems } from "./emailQuotationSimilarService";
import { previewQuotationPricing } from "./emailQuotationResponseService";

export type QuotationRiskLevel = "green" | "yellow" | "red";
export type PriceFreshness = "fresh" | "attention" | "stale" | "unknown";

const MEMORY_LIMIT = 1500;
const AUTO_MEMORY_THRESHOLD = 0.94;
const AUTO_SUGGESTION_THRESHOLD = 0.92;

function safeNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function positive(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9%/.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function daysSince(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
}

export function classifyFreshness(value: Date | string | null | undefined): {
  status: PriceFreshness;
  daysOld: number | null;
} {
  const daysOld = daysSince(value);
  if (daysOld == null) return { status: "unknown", daysOld: null };
  if (daysOld <= 7) return { status: "fresh", daysOld };
  if (daysOld <= 30) return { status: "attention", daysOld };
  return { status: "stale", daysOld };
}

export function calculateMaxPurchasePrice(input: {
  targetSale: number;
  minMarginPercent: number;
  freightValue?: number;
  taxValue?: number;
}) {
  const targetSale = Math.max(0, input.targetSale);
  const minMarginPercent = Math.min(99.99, Math.max(0, input.minMarginPercent));
  const maxLandedCost = targetSale * (1 - minMarginPercent / 100);
  const freightValue = Math.max(0, input.freightValue ?? 0);
  const taxValue = Math.max(0, input.taxValue ?? 0);
  const maxPurchasePrice = Math.max(0, maxLandedCost - freightValue - taxValue);
  return {
    targetSale: Number(targetSale.toFixed(2)),
    minMarginPercent: Number(minMarginPercent.toFixed(2)),
    maxLandedCost: Number(maxLandedCost.toFixed(2)),
    maxPurchasePrice: Number(maxPurchasePrice.toFixed(2)),
    freightValue: Number(freightValue.toFixed(2)),
    taxValue: Number(taxValue.toFixed(2)),
  };
}

type HistoricalMatch = {
  quotationItemId: number;
  quotationId: number;
  descricao: string;
  produtoMatchId: number;
  productName: string;
  productPrice: string | null;
  supplierId: number | null;
  supplierName: string | null;
  orgao: string | null;
  resultado: string | null;
  matchScore: string | null;
  precoSugerido: string | null;
  precoVendaManual: string | null;
  receivedAt: Date | null;
};

async function loadHistoricalMatches(excludeQuotationId: number): Promise<HistoricalMatch[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      quotationItemId: emailQuotationItems.id,
      quotationId: emailQuotationItems.quotationId,
      descricao: emailQuotationItems.descricao,
      produtoMatchId: products.id,
      productName: products.name,
      productPrice: products.price,
      supplierId: products.supplierId,
      supplierName: suppliers.name,
      orgao: emailQuotations.orgao,
      resultado: emailQuotations.resultado,
      matchScore: emailQuotationItems.matchScore,
      precoSugerido: emailQuotationItems.precoSugerido,
      precoVendaManual: emailQuotationItems.precoVendaManual,
      receivedAt: emailQuotations.receivedAt,
    })
    .from(emailQuotationItems)
    .innerJoin(products, eq(emailQuotationItems.produtoMatchId, products.id))
    .innerJoin(emailQuotations, eq(emailQuotationItems.quotationId, emailQuotations.id))
    .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
    .where(
      and(
        ne(emailQuotationItems.quotationId, excludeQuotationId),
        eq(emailQuotationItems.matchConfirmado, true),
        isNotNull(emailQuotationItems.produtoMatchId),
      ),
    )
    .orderBy(desc(emailQuotations.receivedAt))
    .limit(MEMORY_LIMIT);
  return rows as HistoricalMatch[];
}

export type MatchMemoryCandidate = {
  productId: number;
  productName: string;
  supplierId: number | null;
  supplierName: string | null;
  similarity: number;
  confidence: number;
  approvals: number;
  wins: number;
  sameOrgUses: number;
  lastCost: number | null;
  lastSale: number | null;
  lastUsedAt: Date | null;
  evidence: string[];
};

function memoryCandidatesForItem(
  item: { descricao: string },
  orgao: string | null | undefined,
  history: HistoricalMatch[],
): MatchMemoryCandidate[] {
  const current = normalizeText(item.descricao);
  if (!current) return [];
  const byProduct = new Map<number, MatchMemoryCandidate>();

  for (const row of history) {
    const similarity = calculateStringSimilarity(current, normalizeText(row.descricao));
    if (similarity < 0.62) continue;
    const sameOrg = Boolean(orgao && row.orgao && normalizeText(orgao) === normalizeText(row.orgao));
    const won = row.resultado === "ganhou";
    const existing = byProduct.get(row.produtoMatchId);

    if (!existing) {
      byProduct.set(row.produtoMatchId, {
        productId: row.produtoMatchId,
        productName: row.productName,
        supplierId: row.supplierId,
        supplierName: row.supplierName,
        similarity,
        confidence: 0,
        approvals: 1,
        wins: won ? 1 : 0,
        sameOrgUses: sameOrg ? 1 : 0,
        lastCost: safeNumber(row.precoSugerido ?? row.productPrice),
        lastSale: safeNumber(row.precoVendaManual),
        lastUsedAt: row.receivedAt,
        evidence: [],
      });
      continue;
    }

    existing.approvals += 1;
    existing.wins += won ? 1 : 0;
    existing.sameOrgUses += sameOrg ? 1 : 0;
    existing.similarity = Math.max(existing.similarity, similarity);
  }

  return [...byProduct.values()]
    .map((candidate) => {
      const evidenceBoost = Math.min(0.08, Math.log2(candidate.approvals + 1) * 0.018);
      const winBoost = Math.min(0.07, candidate.wins * 0.02);
      const orgBoost = Math.min(0.06, candidate.sameOrgUses * 0.025);
      candidate.confidence = Math.min(0.995, candidate.similarity * 0.86 + evidenceBoost + winBoost + orgBoost);
      candidate.evidence = [
        `${candidate.approvals} match(es) aprovado(s)`,
        candidate.wins > 0 ? `${candidate.wins} vitória(s)` : null,
        candidate.sameOrgUses > 0 ? `${candidate.sameOrgUses} uso(s) no mesmo órgão` : null,
      ].filter((value): value is string => Boolean(value));
      return candidate;
    })
    .sort((a, b) => b.confidence - a.confidence || b.wins - a.wins || b.approvals - a.approvals)
    .slice(0, 5);
}

export async function getQuotationMatchMemory(quotationId: number) {
  const data = await getEmailQuotationWithItems(quotationId);
  if (!data) throw new Error("Cotação não encontrada.");
  const history = await loadHistoricalMatches(quotationId);
  return data.items.map((item) => ({
    itemId: item.id,
    descricao: item.descricao,
    candidates: memoryCandidatesForItem(item, data.quotation.orgao, history),
  }));
}

export type SupplierRankRow = {
  rank: number;
  offerId: number;
  productId: number;
  supplierId: number;
  supplierName: string | null;
  basePrice: number | null;
  promoPrice: number | null;
  effectivePrice: number | null;
  freightValue: number;
  taxValue: number;
  landedCost: number | null;
  availability: string | null;
  stock: string | null;
  link: string | null;
  updatedAt: Date | null;
  freshness: PriceFreshness;
  daysOld: number | null;
  winCount: number;
  score: number;
  scoreBreakdown: { cost: number; availability: number; freshness: number; wins: number };
};

async function supplierWinCounts(productId: number): Promise<Map<number, number>> {
  const db = await getDb();
  const result = new Map<number, number>();
  if (!db) return result;
  const rows = await db
    .select({ supplierId: products.supplierId })
    .from(emailQuotationItems)
    .innerJoin(products, eq(emailQuotationItems.produtoMatchId, products.id))
    .innerJoin(emailQuotations, eq(emailQuotationItems.quotationId, emailQuotations.id))
    .where(and(eq(emailQuotationItems.produtoMatchId, productId), eq(emailQuotations.resultado, "ganhou")));
  for (const row of rows) {
    if (row.supplierId == null) continue;
    result.set(row.supplierId, (result.get(row.supplierId) ?? 0) + 1);
  }
  return result;
}

export async function rankSuppliersForProduct(productId: number): Promise<SupplierRankRow[]> {
  const offers = await getProductSupplierPrices(productId);
  const wins = await supplierWinCounts(productId);
  const enriched = await Promise.all(
    offers.map(async (offer) => {
      const history = await getPriceHistory(productId, offer.supplierId, 1);
      const latest = history[0];
      const basePrice = safeNumber(offer.price);
      const promoPrice = safeNumber(offer.promoPrice);
      const effectivePrice = promoPrice != null && promoPrice > 0 ? promoPrice : basePrice;
      const freightValue = positive(latest?.freightValue);
      const taxValue = positive(latest?.taxValue);
      const rawLandedCost = effectivePrice == null
        ? null
        : calcLandedCost(String(effectivePrice), String(freightValue), String(taxValue));
      const landedCost = rawLandedCost == null ? null : Number(rawLandedCost.toFixed(4));
      const updatedAt = (offer.updatedAt ?? latest?.recordedAt ?? null) as Date | null;
      return {
        offer,
        basePrice,
        promoPrice,
        effectivePrice,
        freightValue,
        taxValue,
        landedCost,
        updatedAt,
        freshness: classifyFreshness(updatedAt),
        winCount: wins.get(offer.supplierId) ?? 0,
      };
    }),
  );

  const costs = enriched.map((row) => row.landedCost).filter((value): value is number => value != null && value > 0);
  const minCost = costs.length > 0 ? Math.min(...costs) : null;
  const maxWins = Math.max(1, ...enriched.map((row) => row.winCount));

  return enriched
    .map((row) => {
      const costScore = row.landedCost && minCost ? Math.min(100, (minCost / row.landedCost) * 100) : 0;
      const availabilityText = normalizeText(row.offer.availability);
      const stockNumber = safeNumber(row.offer.stock);
      const availabilityScore = stockNumber != null
        ? stockNumber > 0 ? 100 : 0
        : availabilityText.includes("indispon") || availabilityText.includes("ruptura")
          ? 0
          : availabilityText.includes("dispon") || availabilityText.includes("estoque")
            ? 90
            : 55;
      const freshnessScore = row.freshness.status === "fresh" ? 100
        : row.freshness.status === "attention" ? 72
          : row.freshness.status === "stale" ? 25
            : 35;
      const winsScore = row.winCount > 0 ? Math.min(100, 55 + (row.winCount / maxWins) * 45) : 35;
      const score = costScore * 0.45 + availabilityScore * 0.20 + freshnessScore * 0.15 + winsScore * 0.20;

      return {
        rank: 0,
        offerId: row.offer.id,
        productId,
        supplierId: row.offer.supplierId,
        supplierName: row.offer.supplierName ?? null,
        basePrice: row.basePrice,
        promoPrice: row.promoPrice,
        effectivePrice: row.effectivePrice,
        freightValue: row.freightValue,
        taxValue: row.taxValue,
        landedCost: row.landedCost,
        availability: row.offer.availability ?? null,
        stock: row.offer.stock ?? null,
        link: row.offer.linkProduto ?? null,
        updatedAt: row.updatedAt,
        freshness: row.freshness.status,
        daysOld: row.freshness.daysOld,
        winCount: row.winCount,
        score: Number(score.toFixed(1)),
        scoreBreakdown: {
          cost: Number(costScore.toFixed(1)),
          availability: Number(availabilityScore.toFixed(1)),
          freshness: Number(freshnessScore.toFixed(1)),
          wins: Number(winsScore.toFixed(1)),
        },
      } satisfies SupplierRankRow;
    })
    .sort((a, b) => b.score - a.score || (a.landedCost ?? Infinity) - (b.landedCost ?? Infinity))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export type ItemDecision = {
  itemId: number;
  numeroItem: number | null;
  descricao: string;
  productId: number | null;
  productName: string | null;
  matchScore: number | null;
  matchConfirmed: boolean;
  cost: number | null;
  sale: number | null;
  marginPercent: number | null;
  minMarginPercent: number;
  maxPurchasePrice: number | null;
  priceFreshness: PriceFreshness;
  priceAgeDays: number | null;
  risk: QuotationRiskLevel;
  riskReasons: string[];
  memory: MatchMemoryCandidate[];
  supplierRanking: SupplierRankRow[];
};

function riskLevel(reasons: Array<{ severity: QuotationRiskLevel; text: string }>): QuotationRiskLevel {
  if (reasons.some((reason) => reason.severity === "red")) return "red";
  if (reasons.some((reason) => reason.severity === "yellow")) return "yellow";
  return "green";
}

export async function getQuotationDecisionSummary(quotationId: number) {
  const data = await getEmailQuotationWithItems(quotationId);
  if (!data) throw new Error("Cotação não encontrada.");
  const preview = await previewQuotationPricing(quotationId);
  const memoryRows = await getQuotationMatchMemory(quotationId);
  const memoryByItem = new Map(memoryRows.map((row) => [row.itemId, row.candidates]));
  const previewByItem = new Map(preview.items.map((row) => [row.quotationItemId, row]));
  const rankingCache = new Map<number, Promise<SupplierRankRow[]>>();
  const rankingFor = (productId: number) => {
    const cached = rankingCache.get(productId);
    if (cached) return cached;
    const pending = rankSuppliersForProduct(productId);
    rankingCache.set(productId, pending);
    return pending;
  };

  const items: ItemDecision[] = await Promise.all(data.items.map(async (item) => {
    const pricing = previewByItem.get(item.id);
    const supplierRanking = item.produtoMatchId ? await rankingFor(item.produtoMatchId) : [];
    const topSupplier = supplierRanking[0];
    const freshness = classifyFreshness(pricing?.costUpdatedAt ?? topSupplier?.updatedAt ?? null);
    const matchScore = safeNumber(item.matchScore);
    const minMarginPercent = preview.defaultMarginPercent;
    const sale = pricing?.unitPrice ?? null;
    const maxPurchasePrice = sale == null
      ? null
      : calculateMaxPurchasePrice({
          targetSale: sale,
          minMarginPercent,
          freightValue: pricing?.freightValue ?? 0,
          taxValue: pricing?.taxValue ?? 0,
        }).maxPurchasePrice;

    const reasons: Array<{ severity: QuotationRiskLevel; text: string }> = [];
    if (!item.produtoMatchId) reasons.push({ severity: "red", text: "Produto ainda sem match." });
    if (item.produtoMatchId && !item.matchConfirmado) reasons.push({ severity: "yellow", text: "Match ainda não confirmado." });
    if (matchScore != null && matchScore < 0.75) reasons.push({ severity: "red", text: `Confiança baixa (${Math.round(matchScore * 100)}%).` });
    else if (matchScore != null && matchScore < 0.92) reasons.push({ severity: "yellow", text: `Match requer revisão (${Math.round(matchScore * 100)}%).` });
    if (!pricing?.custoUnitario) reasons.push({ severity: "red", text: "Custo real não confirmado." });
    if (pricing?.belowCost) reasons.push({ severity: "red", text: "Preço de venda abaixo do custo." });
    if (pricing?.marginPercent != null && pricing.marginPercent + 0.01 < minMarginPercent) {
      reasons.push({ severity: "red", text: `Margem ${pricing.marginPercent.toFixed(1)}% abaixo do mínimo de ${minMarginPercent.toFixed(1)}%.` });
    }
    if (freshness.status === "stale") reasons.push({ severity: "yellow", text: `Preço desatualizado há ${freshness.daysOld ?? "?"} dias.` });
    else if (freshness.status === "unknown" && item.produtoMatchId) reasons.push({ severity: "yellow", text: "Data do preço não confirmada." });
    if (item.produtoMatchId && supplierRanking.length === 0) reasons.push({ severity: "yellow", text: "Sem ofertas recentes de fornecedores para comparar." });
    if (topSupplier?.availability && normalizeText(topSupplier.availability).includes("indispon")) reasons.push({ severity: "red", text: "Melhor fornecedor sinaliza indisponibilidade." });
    if (reasons.length === 0) reasons.push({ severity: "green", text: "Match, custo, margem e fonte sem bloqueios detectados." });

    return {
      itemId: item.id,
      numeroItem: item.numeroItem,
      descricao: item.descricao,
      productId: item.produtoMatchId,
      productName: item.productName ?? null,
      matchScore,
      matchConfirmed: Boolean(item.matchConfirmado),
      cost: pricing?.custoUnitario ?? null,
      sale,
      marginPercent: pricing?.marginPercent ?? null,
      minMarginPercent,
      maxPurchasePrice,
      priceFreshness: freshness.status,
      priceAgeDays: freshness.daysOld,
      risk: riskLevel(reasons),
      riskReasons: reasons.map((reason) => reason.text),
      memory: memoryByItem.get(item.id) ?? [],
      supplierRanking,
    };
  }));

  const resolved = items.filter((item) => item.risk === "green").length;
  const needsReview = items.filter((item) => item.risk === "yellow").length;
  const blocked = items.filter((item) => item.risk === "red").length;

  return {
    quotationId,
    items,
    totals: {
      totalItems: items.length,
      resolved,
      needsReview,
      blocked,
      unmatched: preview.unmatchedItems,
      withoutCost: preview.itemsSemCusto,
      totalBaseCost: preview.totalBaseCost,
      totalFreight: preview.totalFreight,
      totalTaxes: preview.totalTaxes,
      totalCost: preview.totalCost,
      totalSale: preview.totalSale,
      totalProfit: preview.totalProfit,
      effectiveMarginPercent: preview.effectiveMarginPercent,
      canGenerate: preview.canGenerate && blocked === 0,
    },
  };
}

export async function resolveQuotationIntelligently(quotationId: number, userId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível.");
  const data = await getEmailQuotationWithItems(quotationId);
  if (!data) throw new Error("Cotação não encontrada.");

  const memoryRows = await getQuotationMatchMemory(quotationId);
  const memoryByItem = new Map(memoryRows.map((row) => [row.itemId, row.candidates]));
  const similarRows = await suggestSimilarItems(quotationId);
  const similarByItem = new Map(similarRows.map((row) => [row.itemId, row.candidates]));

  let autoResolved = 0;
  const decisions: Array<{ itemId: number; productId: number; source: "memory" | "similar"; confidence: number }> = [];

  for (const item of data.items) {
    if (item.produtoMatchId && item.matchConfirmado) continue;
    const memory = memoryByItem.get(item.id)?.[0];
    const similar = similarByItem.get(item.id)?.[0];
    const chosen = memory && memory.confidence >= AUTO_MEMORY_THRESHOLD
      ? { productId: memory.productId, price: memory.lastCost == null ? null : String(memory.lastCost), confidence: memory.confidence, source: "memory" as const }
      : similar && similar.score >= AUTO_SUGGESTION_THRESHOLD
        ? { productId: similar.id, price: similar.price ?? null, confidence: similar.score, source: "similar" as const }
        : null;
    if (!chosen) continue;

    await db.transaction(async (tx) => {
      await tx
        .update(emailQuotationItems)
        .set({
          produtoMatchId: chosen.productId,
          matchScore: String(Number(chosen.confidence.toFixed(4))),
          matchMethod: "nome",
          matchConfirmado: true,
          matchAuto: true,
          precoSugerido: chosen.price,
        })
        .where(eq(emailQuotationItems.id, item.id));
      await tx.insert(auditLogs).values({
        userId: userId ?? null,
        action: "AUTO_MATCH_CONFIRMED",
        entity: "email_quotation_items",
        entityId: item.id,
        origin: "system",
        summary: `Match resolvido por ${chosen.source === "memory" ? "memória operacional" : "similaridade"} com ${Math.round(chosen.confidence * 100)}% de confiança`,
        changes: { productId: chosen.productId, source: chosen.source, confidence: chosen.confidence } as any,
      });
    });
    autoResolved += 1;
    decisions.push({ itemId: item.id, productId: chosen.productId, source: chosen.source, confidence: chosen.confidence });
  }

  const summary = await getQuotationDecisionSummary(quotationId);
  await db.update(emailQuotations).set({ status: "revisao" }).where(eq(emailQuotations.id, quotationId));

  return { quotationId, autoResolved, decisions, summary };
}
