import { inArray } from "drizzle-orm";
import { getDb, getCompanySettings } from "../db";
import { products } from "../../drizzle/schema";
import { getActiveSanctionsByProductIds } from "../db/sanctions";
import { getActiveCategoryPricingRules } from "../db/categoryPricingQueries";
import { calcLandedCost, recordPriceHistory } from "../db/landedCost";
import { getPriceHistory } from "../db/supplierPrices";
import { logger } from "../_core/logger";
import { getEmailQuotationWithItems } from "./emailQuotationSyncService";
import {
  calculateQuotationTotals,
  generateQuotationPdf,
  type QuotationItem,
  type QuotationPdfData,
} from "./quotationPdfGeneratorService";
import { calculateSalePrice } from "./pricingSafety";

export interface BuildResponseResult {
  pdfBase64: string;
  total: number;
  itemCount: number;
  itemsSemPreco: number;
  marginPercent: number;
  effectiveMarginPercent: number;
  categoryOverrides: number;
  manualPriceItems: number;
}

export function applyMargin(basePrice: number, marginPercent: number): number {
  return calculateSalePrice({ cost: basePrice, marginPercent });
}

export function resolveItemMarginPercent(
  categoryId: number | null | undefined,
  rulesByCategoryId: Map<number, number>,
  defaultMarginPercent: number,
): number {
  if (categoryId == null) return defaultMarginPercent;
  const override = rulesByCategoryId.get(categoryId);
  return override != null ? override : defaultMarginPercent;
}

async function loadActiveMarginRulesByCategory(): Promise<Map<number, number>> {
  const rules = await getActiveCategoryPricingRules();
  const map = new Map<number, number>();
  for (const rule of rules) {
    const margin = Number(rule.marginPercentage);
    if (Number.isFinite(margin)) map.set(rule.categoryId, margin);
  }
  return map;
}

async function loadProductCategories(productIds: Array<number | null>): Promise<Map<number, number | null>> {
  const ids = [...new Set(productIds.filter((id): id is number => id != null))];
  const map = new Map<number, number | null>();
  if (ids.length === 0) return map;
  const db = await getDb();
  if (!db) return map;
  const rows = await db
    .select({ id: products.id, categoryId: products.categoryId })
    .from(products)
    .where(inArray(products.id, ids));
  for (const row of rows) map.set(row.id, row.categoryId ?? null);
  return map;
}

function quantityOf(value: string | null): number {
  const n = value != null ? Number(value) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function actualMarginPercent(cost: number, sale: number): number {
  if (!Number.isFinite(cost) || !Number.isFinite(sale) || sale <= 0) return 0;
  return ((sale - cost) / sale) * 100;
}

function positiveOrZero(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

type CostComponents = {
  baseCost: number | null;
  freightValue: number;
  taxValue: number;
  landedCost: number | null;
  costSource: "match" | "catalog" | "history" | "none";
  costUpdatedAt: Date | null;
};

/**
 * Resolve o custo auditável do item. O preço capturado no momento do match
 * continua tendo prioridade para não alterar silenciosamente uma cotação já
 * em revisão. Frete/tributos usam o histórico do mesmo fornecedor quando
 * disponível e caem nos campos atuais do produto como fallback.
 */
async function resolveCostComponents(item: Awaited<ReturnType<typeof getEmailQuotationWithItems>> extends infer T
  ? T extends { items: Array<infer I> } ? I : never
  : never): Promise<CostComponents> {
  if (!item || item.produtoMatchId == null) {
    return { baseCost: null, freightValue: 0, taxValue: 0, landedCost: null, costSource: "none", costUpdatedAt: null };
  }

  let latestHistory: any | null = null;
  if (item.productSupplierId != null) {
    try {
      const history = await getPriceHistory(item.produtoMatchId, item.productSupplierId, 1);
      latestHistory = history[0] ?? null;
    } catch {
      latestHistory = null;
    }
  }

  const matchCost = Number(item.precoSugerido);
  const catalogCost = Number(item.productPrice);
  const historyCost = Number(latestHistory?.price);

  const baseCost = Number.isFinite(matchCost) && matchCost > 0
    ? matchCost
    : Number.isFinite(historyCost) && historyCost > 0
      ? historyCost
      : Number.isFinite(catalogCost) && catalogCost > 0
        ? catalogCost
        : null;

  const costSource: CostComponents["costSource"] =
    Number.isFinite(matchCost) && matchCost > 0
      ? "match"
      : Number.isFinite(historyCost) && historyCost > 0
        ? "history"
        : Number.isFinite(catalogCost) && catalogCost > 0
          ? "catalog"
          : "none";

  const freightValue = positiveOrZero(latestHistory?.freightValue ?? item.productFreightValue);
  const taxValue = positiveOrZero(latestHistory?.taxValue ?? item.productTaxValue);
  const landed = baseCost == null
    ? null
    : calcLandedCost(String(baseCost), String(freightValue), String(taxValue));

  return {
    baseCost,
    freightValue,
    taxValue,
    landedCost: landed != null ? Number(landed.toFixed(4)) : null,
    costSource,
    costUpdatedAt: latestHistory?.recordedAt ? new Date(latestHistory.recordedAt) : null,
  };
}

export interface PricingPreviewItem {
  quotationItemId: number;
  produtoMatchId: number | null;
  descricao: string;
  productName: string | null;
  supplierName: string | null;
  quantidade: number;
  unidade: string | null;
  baseCost: number | null;
  freightValue: number;
  taxValue: number;
  custoUnitario: number | null;
  costSource: "match" | "catalog" | "history" | "none";
  costUpdatedAt: Date | null;
  unitPrice: number | null;
  totalCost: number | null;
  totalPrice: number | null;
  marginPercent: number | null;
  pricingMode: "automatic" | "manual" | "blocked";
  hasCategoryRule: boolean;
  belowCost: boolean;
  blocker: "sem_match" | "sem_custo" | null;
}

export interface QuotationPricingPreview {
  items: PricingPreviewItem[];
  defaultMarginPercent: number;
  totalCost: number;
  totalBaseCost: number;
  totalFreight: number;
  totalTaxes: number;
  totalSale: number;
  totalProfit: number;
  effectiveMarginPercent: number;
  unmatchedItems: number;
  itemsSemCusto: number;
  manualPriceItems: number;
  categoryOverrides: number;
  canGenerate: boolean;
}

/**
 * Preview tolerante a itens incompletos. A tela mostra preço de aquisição,
 * frete, tributos, custo real, venda, margem e totais antes da proposta.
 */
export async function previewQuotationPricing(
  quotationId: number,
  options?: { marginPercent?: number },
): Promise<QuotationPricingPreview> {
  const data = await getEmailQuotationWithItems(quotationId);
  if (!data) throw new Error("Cotação não encontrada.");

  const company = await getCompanySettings();
  const configuredMargin = Number(company?.minMarginPercent ?? "15");
  const defaultMarginPercent =
    options?.marginPercent != null
      ? options.marginPercent
      : Number.isFinite(configuredMargin)
        ? configuredMargin
        : 15;

  const marginRulesByCategory = await loadActiveMarginRulesByCategory();
  const categoryByProductId = await loadProductCategories(data.items.map((item) => item.produtoMatchId));
  const costComponents = await Promise.all(data.items.map((item) => resolveCostComponents(item as any)));

  let unmatchedItems = 0;
  let itemsSemCusto = 0;
  let manualPriceItems = 0;
  let categoryOverrides = 0;

  const items: PricingPreviewItem[] = data.items.map((item, index) => {
    const quantidade = quantityOf(item.quantidade);
    const cost = costComponents[index];
    if (item.produtoMatchId == null) {
      unmatchedItems++;
      return {
        quotationItemId: item.id,
        produtoMatchId: null,
        descricao: item.descricao,
        productName: item.productName ?? null,
        supplierName: item.supplierName ?? null,
        quantidade,
        unidade: item.unidade,
        baseCost: null,
        freightValue: 0,
        taxValue: 0,
        custoUnitario: null,
        costSource: "none",
        costUpdatedAt: null,
        unitPrice: null,
        totalCost: null,
        totalPrice: null,
        marginPercent: null,
        pricingMode: "blocked",
        hasCategoryRule: false,
        belowCost: false,
        blocker: "sem_match",
      };
    }

    const costCandidate = cost.landedCost;
    if (costCandidate == null || !Number.isFinite(costCandidate) || costCandidate <= 0) {
      itemsSemCusto++;
      return {
        quotationItemId: item.id,
        produtoMatchId: item.produtoMatchId,
        descricao: item.descricao,
        productName: item.productName ?? null,
        supplierName: item.supplierName ?? null,
        quantidade,
        unidade: item.unidade,
        baseCost: cost.baseCost,
        freightValue: cost.freightValue,
        taxValue: cost.taxValue,
        custoUnitario: null,
        costSource: cost.costSource,
        costUpdatedAt: cost.costUpdatedAt,
        unitPrice: null,
        totalCost: null,
        totalPrice: null,
        marginPercent: null,
        pricingMode: "blocked",
        hasCategoryRule: false,
        belowCost: false,
        blocker: "sem_custo",
      };
    }

    const categoryId = categoryByProductId.get(item.produtoMatchId) ?? null;
    const categoryMargin = resolveItemMarginPercent(categoryId, marginRulesByCategory, defaultMarginPercent);
    const hasCategoryRule = categoryId != null && marginRulesByCategory.has(categoryId);
    const manualCandidate = item.precoVendaManual != null ? Number(item.precoVendaManual) : NaN;
    const isManual = Number.isFinite(manualCandidate) && manualCandidate > 0;
    const unitPrice = Number((isManual ? manualCandidate : applyMargin(costCandidate, categoryMargin)).toFixed(2));
    const marginPercent = Number(actualMarginPercent(costCandidate, unitPrice).toFixed(2));

    if (isManual) manualPriceItems++;
    else if (hasCategoryRule) categoryOverrides++;

    return {
      quotationItemId: item.id,
      produtoMatchId: item.produtoMatchId,
      descricao: item.descricao,
      productName: item.productName ?? null,
      supplierName: item.supplierName ?? null,
      quantidade,
      unidade: item.unidade,
      baseCost: cost.baseCost != null ? Number(cost.baseCost.toFixed(4)) : null,
      freightValue: Number(cost.freightValue.toFixed(4)),
      taxValue: Number(cost.taxValue.toFixed(4)),
      custoUnitario: Number(costCandidate.toFixed(4)),
      costSource: cost.costSource,
      costUpdatedAt: cost.costUpdatedAt,
      unitPrice,
      totalCost: Number((costCandidate * quantidade).toFixed(2)),
      totalPrice: Number((unitPrice * quantidade).toFixed(2)),
      marginPercent,
      pricingMode: isManual ? "manual" : "automatic",
      hasCategoryRule,
      belowCost: unitPrice < costCandidate,
      blocker: null,
    };
  });

  const totalCost = items.reduce((sum, item) => sum + (item.totalCost ?? 0), 0);
  const totalBaseCost = items.reduce((sum, item) => sum + ((item.baseCost ?? 0) * item.quantidade), 0);
  const totalFreight = items.reduce((sum, item) => sum + (item.freightValue * item.quantidade), 0);
  const totalTaxes = items.reduce((sum, item) => sum + (item.taxValue * item.quantidade), 0);
  const totalSale = items.reduce((sum, item) => sum + (item.totalPrice ?? 0), 0);
  const totalProfit = totalSale - totalCost;
  const effectiveMarginPercent = totalSale > 0 ? (totalProfit / totalSale) * 100 : 0;

  return {
    items,
    defaultMarginPercent,
    totalCost: Number(totalCost.toFixed(2)),
    totalBaseCost: Number(totalBaseCost.toFixed(2)),
    totalFreight: Number(totalFreight.toFixed(2)),
    totalTaxes: Number(totalTaxes.toFixed(2)),
    totalSale: Number(totalSale.toFixed(2)),
    totalProfit: Number(totalProfit.toFixed(2)),
    effectiveMarginPercent: Number(effectiveMarginPercent.toFixed(2)),
    unmatchedItems,
    itemsSemCusto,
    manualPriceItems,
    categoryOverrides,
    canGenerate: items.length > 0 && unmatchedItems === 0 && itemsSemCusto === 0,
  };
}

export interface PricedQuotationItem {
  quotationItemId: number;
  produtoMatchId: number | null;
  descricao: string;
  quantidade: number;
  unidade: string | null;
  custoUnitario: number;
  unitPrice: number;
  totalPrice: number;
  marginPercent: number;
  pricingMode: "automatic" | "manual";
}

export interface PricedQuotationResult {
  quotation: NonNullable<Awaited<ReturnType<typeof getEmailQuotationWithItems>>>["quotation"];
  items: PricedQuotationItem[];
  subtotal: number;
  marginPercent: number;
  effectiveMarginPercent: number;
  categoryOverrides: number;
  manualPriceItems: number;
}

/**
 * Registra no histórico de preços por fornecedor (Ressalva 3, Módulo 06) o
 * custo capturado ao gerar o orçamento — gatilho "cotação recebida". Só
 * grava quando o custo veio do match/catálogo (nunca do próprio histórico,
 * para não realimentar o mesmo valor em loop) e há fornecedor identificado.
 * Melhor esforço: uma falha aqui nunca deve impedir a geração do orçamento.
 */
export async function recordQuotationPriceHistory(
  rawItems: NonNullable<Awaited<ReturnType<typeof getEmailQuotationWithItems>>>["items"],
  previewItems: PricingPreviewItem[],
): Promise<void> {
  for (let i = 0; i < previewItems.length; i++) {
    const preview = previewItems[i];
    const raw = rawItems[i];
    if (!raw || preview.produtoMatchId == null || raw.productSupplierId == null) continue;
    if (preview.costSource !== "match" && preview.costSource !== "catalog") continue;
    if (preview.baseCost == null) continue;
    try {
      await recordPriceHistory({
        productId: preview.produtoMatchId,
        supplierId: raw.productSupplierId,
        price: String(preview.baseCost),
        freightValue: preview.freightValue ? String(preview.freightValue) : null,
        taxValue: preview.taxValue ? String(preview.taxValue) : null,
        origem: "cotacao_recebida",
      });
    } catch (err) {
      logger.warn(
        "[emailQuotationResponseService] Falha ao registrar histórico de preço:",
        (err as Error).message,
      );
    }
  }
}

export async function priceQuotationItems(
  quotationId: number,
  options?: { marginPercent?: number },
): Promise<PricedQuotationResult> {
  const data = await getEmailQuotationWithItems(quotationId);
  if (!data) throw new Error("Cotação não encontrada.");
  if (data.items.length === 0) throw new Error("A cotação não possui itens para responder.");

  const preview = await previewQuotationPricing(quotationId, options);
  if (preview.unmatchedItems > 0) {
    throw new Error(
      `Cotação bloqueada: selecione o produto de ${preview.unmatchedItems} item(ns) antes de gerar ou enviar o orçamento.`,
    );
  }
  if (preview.itemsSemCusto > 0) {
    throw new Error(
      `Cotação bloqueada: informe custo positivo para ${preview.itemsSemCusto} item(ns).`,
    );
  }

  const matchedProductIds = data.items
    .map((item) => item.produtoMatchId)
    .filter((id): id is number => id != null);
  if (matchedProductIds.length > 0) {
    const sanctionsByProduct = await getActiveSanctionsByProductIds(matchedProductIds);
    const affected = [...sanctionsByProduct.entries()];
    if (affected.length > 0) {
      const detalhes = affected
        .map(
          ([productName, sanc]) =>
            `• ${productName}: fornecedor ${sanc.fornecedor} — ${sanc.penalidade} (${sanc.orgao}, processo ${sanc.processo ?? "não informado"})`,
        )
        .join("\n");
      throw new Error(
        `Atenção: há fornecedor com sanção ATIVA vinculada a ${affected.length} produto(ns) desta cotação:\n${detalhes}\nRevise a situação antes de gerar ou enviar o orçamento.`,
      );
    }
  }

  const items: PricedQuotationItem[] = preview.items.map((item) => ({
    quotationItemId: item.quotationItemId,
    produtoMatchId: item.produtoMatchId,
    descricao: item.descricao,
    quantidade: item.quantidade,
    unidade: item.unidade,
    custoUnitario: item.custoUnitario!,
    unitPrice: item.unitPrice!,
    totalPrice: item.totalPrice!,
    marginPercent: item.marginPercent!,
    pricingMode: item.pricingMode as "automatic" | "manual",
  }));

  await recordQuotationPriceHistory(data.items, preview.items);

  return {
    quotation: data.quotation,
    items,
    subtotal: preview.totalSale,
    marginPercent: preview.defaultMarginPercent,
    effectiveMarginPercent: preview.effectiveMarginPercent,
    categoryOverrides: preview.categoryOverrides,
    manualPriceItems: preview.manualPriceItems,
  };
}

export async function buildQuotationResponse(
  quotationId: number,
  options?: { marginPercent?: number; validDays?: number },
): Promise<BuildResponseResult> {
  const priced = await priceQuotationItems(quotationId, { marginPercent: options?.marginPercent });
  const company = await getCompanySettings();

  const pdfItems: QuotationItem[] = priced.items.map((item) => ({
    productName: item.descricao,
    quantity: item.quantidade,
    unitPrice: item.unitPrice,
    totalPrice: item.totalPrice,
  }));

  const { subtotal } = calculateQuotationTotals(pdfItems);
  const validDays = options?.validDays ?? 30;

  const pdfData: QuotationPdfData = {
    number: `COT-${quotationId}`,
    date: new Date(),
    validUntil: new Date(Date.now() + validDays * 24 * 60 * 60 * 1000),
    clientName: priced.quotation.orgao ?? priced.quotation.fromName ?? undefined,
    clientEmail: priced.quotation.fromAddress ?? undefined,
    items: pdfItems,
    subtotal,
    total: subtotal,
    notes: priced.quotation.subject
      ? `Em resposta à solicitação: ${priced.quotation.subject}`
      : undefined,
    company: {
      name: company?.name || "Empresa não configurada",
      cnpj: company?.cnpj ?? undefined,
      address: company?.address ?? undefined,
      phone: company?.phone ?? undefined,
      email: company?.email ?? undefined,
      logoUrl: company?.logoUrl ?? undefined,
      bankAccount: company?.bankInfo ?? undefined,
    },
  };

  const pdfBuffer = await generateQuotationPdf(pdfData);

  return {
    pdfBase64: pdfBuffer.toString("base64"),
    total: subtotal,
    itemCount: pdfItems.length,
    itemsSemPreco: 0,
    marginPercent: priced.marginPercent,
    effectiveMarginPercent: priced.effectiveMarginPercent,
    categoryOverrides: priced.categoryOverrides,
    manualPriceItems: priced.manualPriceItems,
  };
}
