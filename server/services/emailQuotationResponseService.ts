import { inArray } from "drizzle-orm";
import { getDb, getCompanySettings } from "../db";
import { products } from "../../drizzle/schema";
import { getActiveCategoryPricingRules } from "../db/categoryPricingQueries";
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

export interface PricingPreviewItem {
  quotationItemId: number;
  produtoMatchId: number | null;
  descricao: string;
  productName: string | null;
  supplierName: string | null;
  quantidade: number;
  unidade: string | null;
  custoUnitario: number | null;
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
 * Preview tolerante a itens incompletos. É usado pela tela operacional para
 * mostrar custo, venda, margem e totais antes de gerar a proposta, sem obrigar
 * o operador a sair da cotação.
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

  let unmatchedItems = 0;
  let itemsSemCusto = 0;
  let manualPriceItems = 0;
  let categoryOverrides = 0;

  const items: PricingPreviewItem[] = data.items.map((item) => {
    const quantidade = quantityOf(item.quantidade);
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
        custoUnitario: null,
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

    const costCandidate = Number(item.precoSugerido ?? item.productPrice);
    if (!Number.isFinite(costCandidate) || costCandidate <= 0) {
      itemsSemCusto++;
      return {
        quotationItemId: item.id,
        produtoMatchId: item.produtoMatchId,
        descricao: item.descricao,
        productName: item.productName ?? null,
        supplierName: item.supplierName ?? null,
        quantidade,
        unidade: item.unidade,
        custoUnitario: null,
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
      custoUnitario: Number(costCandidate.toFixed(4)),
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
  const totalSale = items.reduce((sum, item) => sum + (item.totalPrice ?? 0), 0);
  const totalProfit = totalSale - totalCost;
  const effectiveMarginPercent = totalSale > 0 ? (totalProfit / totalSale) * 100 : 0;

  return {
    items,
    defaultMarginPercent,
    totalCost: Number(totalCost.toFixed(2)),
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
