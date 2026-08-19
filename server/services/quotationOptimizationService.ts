import { and, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import {
  auditLogs,
  categories,
  emailQuotationItems,
  emailQuotations,
  products,
  scraperConfigs,
  suppliers,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { getPriceHistory } from "../db/supplierPrices";
import { recordAudit } from "./auditService";
import { getEmailQuotationWithItems } from "./emailQuotationSyncService";
import { previewQuotationPricing } from "./emailQuotationResponseService";
import { calculateSalePrice } from "./pricingSafety";
import { getQuotationItemSalePrices, setQuotationItemSalePrice } from "./quotationItemPricingService";
import {
  classifyFreshness,
  getQuotationDecisionSummary,
  rankSuppliersForProduct,
} from "./quotationDecisionService";
import { executarScraper } from "./scraperEngine";
import { expandAndSyncTambasaCatalog } from "./tambasaCatalogService";

export type FeedbackKind =
  | "match_approved"
  | "product_selected"
  | "product_rejected"
  | "supplier_selected"
  | "supplier_rejected"
  | "sale_adjusted";

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export async function recordQuotationFeedback(input: {
  quotationId: number;
  itemId: number;
  kind: FeedbackKind;
  productId?: number | null;
  supplierId?: number | null;
  previousProductId?: number | null;
  previousSupplierId?: number | null;
  value?: number | null;
  note?: string | null;
  userId?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível.");
  const [item] = await db
    .select({ quotationId: emailQuotationItems.quotationId })
    .from(emailQuotationItems)
    .where(eq(emailQuotationItems.id, input.itemId))
    .limit(1);
  if (!item || item.quotationId !== input.quotationId) throw new Error("Item não pertence à cotação informada.");

  await recordAudit({
    userId: input.userId ?? null,
    action: "QUOTATION_FEEDBACK",
    entity: "email_quotation_items",
    entityId: input.itemId,
    origin: "operator",
    summary: `Feedback de cotação: ${input.kind}`,
    changes: {
      quotationId: input.quotationId,
      kind: input.kind,
      productId: input.productId ?? null,
      supplierId: input.supplierId ?? null,
      previousProductId: input.previousProductId ?? null,
      previousSupplierId: input.previousSupplierId ?? null,
      value: input.value ?? null,
      note: input.note ?? null,
    },
  });
  return { ok: true };
}

type FeedbackCount = { positive: number; negative: number };

async function feedbackBySupplier() {
  const db = await getDb();
  const result = new Map<number, FeedbackCount>();
  if (!db) return result;
  const rows = await db
    .select({ changes: auditLogs.changes })
    .from(auditLogs)
    .where(eq(auditLogs.action, "QUOTATION_FEEDBACK"))
    .orderBy(desc(auditLogs.createdAt))
    .limit(2000);

  const bump = (id: number, positive: boolean) => {
    const current = result.get(id) ?? { positive: 0, negative: 0 };
    if (positive) current.positive++;
    else current.negative++;
    result.set(id, current);
  };

  for (const row of rows) {
    const change = (row.changes ?? {}) as Record<string, unknown>;
    const kind = String(change.kind ?? "");
    const supplierId = num(change.supplierId);
    const previousSupplierId = num(change.previousSupplierId);
    if (supplierId && ["match_approved", "product_selected", "supplier_selected"].includes(kind)) bump(supplierId, true);
    if (supplierId && kind === "supplier_rejected") bump(supplierId, false);
    if (previousSupplierId && kind === "supplier_selected") bump(previousSupplierId, false);
  }
  return result;
}

async function supplierOutcomes(supplierIds: number[]) {
  const db = await getDb();
  const result = new Map<number, { uses: number; wins: number; losses: number }>();
  if (!db || !supplierIds.length) return result;
  const rows = await db
    .select({ supplierId: products.supplierId, resultado: emailQuotations.resultado })
    .from(emailQuotationItems)
    .innerJoin(products, eq(emailQuotationItems.produtoMatchId, products.id))
    .innerJoin(emailQuotations, eq(emailQuotationItems.quotationId, emailQuotations.id))
    .where(inArray(products.supplierId, supplierIds))
    .orderBy(desc(emailQuotations.receivedAt))
    .limit(3000);
  for (const row of rows) {
    if (!row.supplierId) continue;
    const current = result.get(row.supplierId) ?? { uses: 0, wins: 0, losses: 0 };
    current.uses++;
    if (row.resultado === "ganhou") current.wins++;
    if (row.resultado === "perdeu") current.losses++;
    result.set(row.supplierId, current);
  }
  return result;
}

export async function getEnhancedSupplierScore(productId: number) {
  const ranking = await rankSuppliersForProduct(productId);
  const feedback = await feedbackBySupplier();
  const outcomes = await supplierOutcomes(ranking.map((row) => row.supplierId));
  return ranking.map((row) => {
    const fb = feedback.get(row.supplierId) ?? { positive: 0, negative: 0 };
    const outcome = outcomes.get(row.supplierId) ?? { uses: 0, wins: 0, losses: 0 };
    const decided = outcome.wins + outcome.losses;
    const winRate = decided ? (outcome.wins / decided) * 100 : 50;
    const preference = fb.positive + fb.negative
      ? Math.max(0, Math.min(100, 50 + (fb.positive - fb.negative) * 12.5))
      : 50;
    const reliability = Math.max(0, Math.min(100,
      row.scoreBreakdown.availability * 0.45 +
      row.scoreBreakdown.freshness * 0.20 +
      winRate * 0.25 +
      preference * 0.10,
    ));
    const finalScore =
      row.scoreBreakdown.cost * 0.30 +
      row.scoreBreakdown.availability * 0.15 +
      row.scoreBreakdown.freshness * 0.10 +
      winRate * 0.15 +
      reliability * 0.15 +
      preference * 0.15;
    return {
      ...row,
      finalScore: Number(finalScore.toFixed(1)),
      winRate: Number(winRate.toFixed(1)),
      reliability: Number(reliability.toFixed(1)),
      operatorPreference: Number(preference.toFixed(1)),
      uses: outcome.uses,
      positiveFeedback: fb.positive,
      negativeFeedback: fb.negative,
    };
  }).sort((a, b) => b.finalScore - a.finalScore || (a.landedCost ?? Infinity) - (b.landedCost ?? Infinity))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export async function getCommercialProtection(quotationId: number) {
  const db = await getDb();
  const summary = await getQuotationDecisionSummary(quotationId);
  const data = await getEmailQuotationWithItems(quotationId);
  if (!data) throw new Error("Cotação não encontrada.");
  const alerts: Array<{ severity: "red" | "yellow" | "info"; code: string; message: string; itemId?: number }> = [];

  for (const item of summary.items) {
    if (item.marginPercent != null && item.marginPercent < item.minMarginPercent) {
      alerts.push({ severity: "red", code: "margin_below_minimum", itemId: item.itemId, message: `Item ${item.numeroItem ?? item.itemId}: margem ${item.marginPercent.toFixed(1)}% abaixo do mínimo de ${item.minMarginPercent.toFixed(1)}%.` });
    }
    if (["stale", "unknown"].includes(item.priceFreshness)) {
      alerts.push({ severity: "yellow", code: "stale_price", itemId: item.itemId, message: `Item ${item.numeroItem ?? item.itemId}: custo precisa ser atualizado antes da proposta.` });
    }
    const best = item.supplierRanking[0];
    if (best && (best.stock === 0 || /indispon|ruptura/i.test(best.availability ?? ""))) {
      alerts.push({ severity: "red", code: "supplier_unavailable", itemId: item.itemId, message: `Item ${item.numeroItem ?? item.itemId}: melhor fornecedor está sem disponibilidade confirmada.` });
    }
    if (best?.landedCost != null && item.cost != null && item.cost > 0 && best.landedCost < item.cost * 0.95) {
      alerts.push({ severity: "info", code: "cheaper_supplier", itemId: item.itemId, message: `Item ${item.numeroItem ?? item.itemId}: existe fonte com economia estimada de R$ ${(item.cost - best.landedCost).toFixed(2)} por unidade.` });
    }
  }

  let predictedWinningValue: number | null = null;
  let historicalSamples = 0;
  if (db && data.quotation.orgao) {
    const history = await db
      .select({ valorVencedor: emailQuotations.valorVencedor })
      .from(emailQuotations)
      .where(and(
        eq(emailQuotations.orgao, data.quotation.orgao),
        ne(emailQuotations.id, quotationId),
        isNotNull(emailQuotations.valorVencedor),
      ))
      .orderBy(desc(emailQuotations.resultadoEm))
      .limit(30);
    const values = history.map((row) => num(row.valorVencedor)).filter((value): value is number => value != null && value > 0);
    historicalSamples = values.length;
    predictedWinningValue = median(values);
  }
  if (predictedWinningValue != null && summary.totals.totalSale > predictedWinningValue * 1.05) {
    const gap = ((summary.totals.totalSale - predictedWinningValue) / predictedWinningValue) * 100;
    alerts.unshift({ severity: "red", code: "above_historical_winner", message: `Preço total está ${gap.toFixed(1)}% acima da mediana histórica vencedora deste órgão.` });
  }
  return {
    alerts,
    red: alerts.filter((alert) => alert.severity === "red").length,
    yellow: alerts.filter((alert) => alert.severity === "yellow").length,
    info: alerts.filter((alert) => alert.severity === "info").length,
    predictedWinningValue: predictedWinningValue == null ? null : Number(predictedWinningValue.toFixed(2)),
    historicalSamples,
    canProceed: alerts.every((alert) => alert.severity !== "red"),
  };
}

export async function refreshStaleQuotationPrices(quotationId: number, userId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível.");
  const summary = await getQuotationDecisionSummary(quotationId);
  const stale = summary.items.filter((item) => item.productId && ["stale", "unknown"].includes(item.priceFreshness));
  const supplierIds = new Set<number>();
  for (const item of stale) {
    if (!item.productId) continue;
    const ranking = await rankSuppliersForProduct(item.productId);
    ranking.slice(0, 3).forEach((row) => supplierIds.add(row.supplierId));
  }
  if (!supplierIds.size) return { staleItems: stale.length, initiated: 0, skippedRecent: 0, suppliers: [] as number[] };

  const configs = await db
    .select({ id: scraperConfigs.id, supplierId: scraperConfigs.supplierId, scraperType: scraperConfigs.scraperType, lastRunAt: scraperConfigs.lastRunAt })
    .from(scraperConfigs)
    .where(and(
      inArray(scraperConfigs.supplierId, [...supplierIds]),
      eq(scraperConfigs.enabled, "yes"),
      eq(scraperConfigs.tosAprovado, true),
    ));
  const now = Date.now();
  const eligible = configs.filter((cfg) => !cfg.lastRunAt || now - new Date(cfg.lastRunAt).getTime() > 30 * 60 * 1000);
  for (const cfg of eligible) {
    const job = cfg.scraperType.toLowerCase() === "tambasa"
      ? expandAndSyncTambasaCatalog(cfg.id).then((result) => result.scraper)
      : executarScraper(cfg.id);
    void job.catch(() => undefined);
  }
  await recordAudit({
    userId: userId ?? null,
    action: "QUOTATION_PRICE_REFRESH_REQUESTED",
    entity: "email_quotations",
    entityId: quotationId,
    origin: "system",
    summary: `${eligible.length} fonte(s) autorizada(s) acionada(s) para atualizar preços vencidos`,
    changes: { staleItems: stale.length, supplierIds: [...supplierIds], scraperConfigIds: eligible.map((cfg) => cfg.id) },
  });
  return { staleItems: stale.length, initiated: eligible.length, skippedRecent: configs.length - eligible.length, suppliers: [...supplierIds] };
}

export type BulkQuotationAction = "approve_safe" | "use_best_supplier" | "apply_margin" | "refresh_prices";

export async function runQuotationBulkAction(input: {
  quotationId: number;
  itemIds: number[];
  action: BulkQuotationAction;
  value?: number;
  userId?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível.");
  const selected = new Set(input.itemIds);
  const summary = await getQuotationDecisionSummary(input.quotationId);
  const target = summary.items.filter((item) => !selected.size || selected.has(item.itemId));
  let affected = 0;

  if (input.action === "approve_safe") {
    for (const item of target.filter((row) => row.risk === "green" && row.productId && !row.matchConfirmed)) {
      await db.update(emailQuotationItems).set({ matchConfirmado: true, matchAuto: false }).where(eq(emailQuotationItems.id, item.itemId));
      affected++;
    }
  }
  if (input.action === "use_best_supplier") {
    for (const item of target.filter((row) => row.productId)) {
      const best = (await getEnhancedSupplierScore(item.productId!))[0];
      if (best?.effectivePrice == null) continue;
      await db.update(emailQuotationItems).set({ precoSugerido: String(best.effectivePrice) }).where(eq(emailQuotationItems.id, item.itemId));
      affected++;
    }
  }
  if (input.action === "apply_margin") {
    const margin = input.value;
    if (margin == null || !Number.isFinite(margin) || margin < 0 || margin >= 100) throw new Error("Margem inválida.");
    const preview = await previewQuotationPricing(input.quotationId);
    for (const item of preview.items.filter((row) => (!selected.size || selected.has(row.quotationItemId)) && row.custoUnitario != null)) {
      const sale = calculateSalePrice({ cost: item.custoUnitario!, marginPercent: margin });
      await setQuotationItemSalePrice(item.quotationItemId, Number(sale.toFixed(2)));
      affected++;
    }
  }
  if (input.action === "refresh_prices") {
    affected = (await refreshStaleQuotationPrices(input.quotationId, input.userId)).initiated;
  }
  await recordAudit({
    userId: input.userId ?? null,
    action: "QUOTATION_BULK_ACTION",
    entity: "email_quotations",
    entityId: input.quotationId,
    origin: "operator",
    summary: `Ação em lote ${input.action}: ${affected} registro(s) afetado(s)`,
    changes: { action: input.action, itemIds: input.itemIds.slice(0, 500), value: input.value ?? null, affected },
  });
  return { affected };
}

type Aggregate = {
  id: number;
  name: string;
  uses: number;
  wins: number;
  losses: number;
  marginSum: number;
  marginN: number;
  supplierId?: number | null;
};

export async function getCommercialIntelligence() {
  const db = await getDb();
  if (!db) return { overview: { decided: 0, winRate: 0, avgMargin: 0, avgLossGap: null as number | null }, topProducts: [], topSuppliers: [], categories: [], priorityPriceUpdates: [] };
  const rows = await db
    .select({
      itemId: emailQuotationItems.id,
      descricao: emailQuotationItems.descricao,
      productId: products.id,
      productName: products.name,
      productPrice: products.price,
      supplierId: products.supplierId,
      supplierName: suppliers.name,
      categoryId: products.categoryId,
      categoryName: categories.name,
      cost: emailQuotationItems.precoSugerido,
      resultado: emailQuotations.resultado,
    })
    .from(emailQuotationItems)
    .leftJoin(products, eq(emailQuotationItems.produtoMatchId, products.id))
    .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .innerJoin(emailQuotations, eq(emailQuotationItems.quotationId, emailQuotations.id))
    .orderBy(desc(emailQuotations.receivedAt))
    .limit(2500);
  const salePrices = await getQuotationItemSalePrices(rows.map((row) => row.itemId));
  const productMap = new Map<number, Aggregate>();
  const supplierMap = new Map<number, Aggregate>();
  const categoryMap = new Map<number, Aggregate>();
  const bump = (map: Map<number, Aggregate>, id: number, name: string, resultado: string, margin: number | null, supplierId?: number | null) => {
    const agg = map.get(id) ?? { id, name, uses: 0, wins: 0, losses: 0, marginSum: 0, marginN: 0, supplierId };
    agg.uses++;
    if (resultado === "ganhou") agg.wins++;
    if (resultado === "perdeu") agg.losses++;
    if (margin != null) { agg.marginSum += margin; agg.marginN++; }
    map.set(id, agg);
  };
  for (const row of rows) {
    const cost = num(row.cost ?? row.productPrice);
    const sale = num(salePrices.get(row.itemId));
    const margin = cost != null && sale != null && sale > 0 ? ((sale - cost) / sale) * 100 : null;
    if (row.productId) bump(productMap, row.productId, row.productName ?? row.descricao, row.resultado, margin, row.supplierId);
    if (row.supplierId) bump(supplierMap, row.supplierId, row.supplierName ?? `Fornecedor ${row.supplierId}`, row.resultado, margin);
    if (row.categoryId) bump(categoryMap, row.categoryId, row.categoryName ?? `Categoria ${row.categoryId}`, row.resultado, margin);
  }
  const format = (agg: Aggregate) => {
    const decided = agg.wins + agg.losses;
    return {
      id: agg.id,
      name: agg.name,
      uses: agg.uses,
      wins: agg.wins,
      losses: agg.losses,
      winRate: decided ? Number(((agg.wins / decided) * 100).toFixed(1)) : 0,
      avgMargin: agg.marginN ? Number((agg.marginSum / agg.marginN).toFixed(1)) : null,
      supplierId: agg.supplierId ?? null,
    };
  };
  const topProducts = [...productMap.values()].map(format).sort((a, b) => b.wins - a.wins || b.uses - a.uses).slice(0, 12);
  const topSuppliers = [...supplierMap.values()].map(format).sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || b.uses - a.uses).slice(0, 12);
  const categoryRows = [...categoryMap.values()].map(format).sort((a, b) => b.wins - a.wins || b.uses - a.uses).slice(0, 12);
  const priorityPriceUpdates = (await Promise.all(topProducts.map(async (product) => {
    const supplierId = productMap.get(product.id)?.supplierId;
    if (!supplierId) return null;
    const history = await getPriceHistory(product.id, supplierId, 1);
    const state = classifyFreshness(history[0]?.recordedAt ?? null);
    return { productId: product.id, name: product.name, uses: product.uses, wins: product.wins, priority: product.uses + product.wins * 3, freshness: state.status, daysOld: state.daysOld };
  }))).filter((row): row is NonNullable<typeof row> => row != null && ["stale", "unknown", "attention"].includes(row.freshness))
    .sort((a, b) => b.priority - a.priority).slice(0, 10);

  const quotations = await db.select({ resultado: emailQuotations.resultado, valorProposto: emailQuotations.valorProposto, valorVencedor: emailQuotations.valorVencedor })
    .from(emailQuotations).orderBy(desc(emailQuotations.receivedAt)).limit(1000);
  const decided = quotations.filter((row) => row.resultado === "ganhou" || row.resultado === "perdeu");
  const wins = decided.filter((row) => row.resultado === "ganhou").length;
  const gaps = decided.map((row) => {
    if (row.resultado !== "perdeu") return null;
    const proposed = num(row.valorProposto); const winner = num(row.valorVencedor);
    return proposed != null && winner != null && winner > 0 ? ((proposed - winner) / winner) * 100 : null;
  }).filter((value): value is number => value != null);
  const margins = rows.map((row) => {
    const cost = num(row.cost ?? row.productPrice); const sale = num(salePrices.get(row.itemId));
    return cost != null && sale != null && sale > 0 ? ((sale - cost) / sale) * 100 : null;
  }).filter((value): value is number => value != null);
  return {
    overview: {
      decided: decided.length,
      winRate: decided.length ? Number(((wins / decided.length) * 100).toFixed(1)) : 0,
      avgMargin: margins.length ? Number((margins.reduce((a, b) => a + b, 0) / margins.length).toFixed(1)) : 0,
      avgLossGap: gaps.length ? Number((gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1)) : null,
    },
    topProducts,
    topSuppliers,
    categories: categoryRows,
    priorityPriceUpdates,
  };
}
