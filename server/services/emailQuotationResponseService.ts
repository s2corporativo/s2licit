import { inArray } from "drizzle-orm";
import { getDb } from "../db";
import { getCompanySettings } from "../db";
import { products } from "../../drizzle/schema";
import { getActiveSanctionsByProductIds } from "../db/sanctions";
import { getActiveCategoryPricingRules } from "../db/categoryPricingQueries";
import { getEmailQuotationWithItems } from "./emailQuotationSyncService";
import {
  calculateQuotationTotals,
  generateQuotationPdf,
  type QuotationItem,
  type QuotationPdfData,
} from "./quotationPdfGeneratorService";
import { calculateSalePrice } from "./pricingSafety";

/**
 * Monta e gera o PDF de orçamento-resposta a partir de uma cotação recebida
 * por e-mail. Somente itens com produto vinculado (match) e custo positivo
 * podem participar — a vinculação já é considerada confirmação do match.
 * A margem é calculada sobre a receita, nunca como markup.
 *
 * Margem por categoria: quando o produto casado pertence a uma categoria com
 * regra de precificação ativa (tela Regras por Categoria), a margem daquela
 * regra prevalece sobre a margem padrão da empresa/parâmetro — por exemplo,
 * medicamento e material de limpeza podem ter margens diferentes na mesma
 * proposta. Itens sem regra de categoria usam a margem padrão normalmente.
 */

export interface BuildResponseResult {
  pdfBase64: string;
  total: number;
  itemCount: number;
  itemsSemPreco: number;
  /** Margem padrão usada como base (empresa ou parâmetro informado). */
  marginPercent: number;
  /** Margem efetiva real (lucro/venda) considerando eventuais overrides por categoria. */
  effectiveMarginPercent: number;
  /** Quantos itens usaram margem de categoria em vez da margem padrão. */
  categoryOverrides: number;
}

/**
 * Aplica margem SOBRE O PREÇO DE VENDA (mesma fórmula do PricingService):
 *   precoVenda = custo / (1 - margem%/100)
 * Ex.: custo 100, margem 30% → 142,86 (margem real 30%), e não 130 (markup,
 * que daria só 23,1% de margem real). Margem ≥ 100% é inválida.
 */
export function applyMargin(basePrice: number, marginPercent: number): number {
  return calculateSalePrice({ cost: basePrice, marginPercent });
}

/**
 * Resolve a margem de um item: a regra de categoria ativa prevalece sobre a
 * margem padrão. Pura e testável — recebe as regras já carregadas (por
 * categoryId) em vez de consultar o banco.
 */
export function resolveItemMarginPercent(
  categoryId: number | null | undefined,
  rulesByCategoryId: Map<number, number>,
  defaultMarginPercent: number,
): number {
  if (categoryId == null) return defaultMarginPercent;
  const override = rulesByCategoryId.get(categoryId);
  return override != null ? override : defaultMarginPercent;
}

/** Carrega as regras de margem por categoria ativas, já num Map categoryId→margem. */
async function loadActiveMarginRulesByCategory(): Promise<Map<number, number>> {
  const rules = await getActiveCategoryPricingRules();
  const map = new Map<number, number>();
  for (const rule of rules) {
    const margin = Number(rule.marginPercentage);
    if (Number.isFinite(margin)) map.set(rule.categoryId, margin);
  }
  return map;
}

/** Carrega categoryId dos produtos casados, em lote (productId → categoryId). */
async function loadProductCategories(
  productIds: Array<number | null>,
): Promise<Map<number, number | null>> {
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
}

export interface PricedQuotationResult {
  quotation: NonNullable<Awaited<ReturnType<typeof getEmailQuotationWithItems>>>["quotation"];
  items: PricedQuotationItem[];
  subtotal: number;
  marginPercent: number;
  effectiveMarginPercent: number;
  categoryOverrides: number;
}

/**
 * Calcula o preço de venda de cada item de uma cotação (margem por categoria
 * quando houver regra ativa, senão a margem padrão). Núcleo compartilhado
 * pelo PDF de orçamento (`buildQuotationResponse`) e pelo "preencher no
 * portal" (`quotationPortalHandoffService`) — os dois preços devem ser
 * exatamente os mesmos.
 */
export async function priceQuotationItems(
  quotationId: number,
  options?: { marginPercent?: number },
): Promise<PricedQuotationResult> {
  const data = await getEmailQuotationWithItems(quotationId);
  if (!data) throw new Error("Cotação não encontrada.");

  const company = await getCompanySettings();
  const configuredMargin = Number(company?.minMarginPercent ?? "15");
  const marginPercent =
    options?.marginPercent != null
      ? options.marginPercent
      : Number.isFinite(configuredMargin)
        ? configuredMargin
        : 15;

  if (data.items.length === 0) {
    throw new Error("A cotação não possui itens para responder.");
  }

  // Simplificação (2026-08-16): o match é considerado confirmado sempre que
  // há um produto vinculado (produtoMatchId != null) — a vinculação já é um
  // ato de confirmação. O bloqueio persiste APENAS para itens sem nenhum
  // produto associado, quando não há custo nem margem possíveis.
  const unconfirmedItems = data.items.filter((item) => item.produtoMatchId == null);
  if (unconfirmedItems.length > 0) {
    throw new Error(
      `Cotação bloqueada: confirme o match de ${unconfirmedItems.length} item(ns) antes de gerar ou enviar o orçamento.`,
    );
  }

  // Sanções ativas (Lei 14.133/21, art. 155): se algum produto vinculado aos
  // itens pertence a fornecedor com penalidade ativa e vigente, o operador é
  // alertado antes de gerar o orçamento. Exige confirmação explícita, pois
  // a decisão de participar do certame é do cliente.
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

  const invalidPriceItems = data.items.filter((item) => {
    const price = Number(item.precoSugerido);
    return !Number.isFinite(price) || price <= 0;
  });
  if (invalidPriceItems.length > 0) {
    throw new Error(
      `Cotação bloqueada: informe custo positivo para ${invalidPriceItems.length} item(ns).`,
    );
  }

  const marginRulesByCategory = await loadActiveMarginRulesByCategory();
  const categoryByProductId = await loadProductCategories(
    data.items.map((item) => item.produtoMatchId),
  );

  let categoryOverrides = 0;
  let totalCusto = 0;
  const items: PricedQuotationItem[] = data.items.map((item) => {
    const base = Number(item.precoSugerido);
    const quantity = item.quantidade != null ? Number(item.quantidade) : 1;
    const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
    const categoryId = item.produtoMatchId != null ? categoryByProductId.get(item.produtoMatchId) : null;
    const itemMargin = resolveItemMarginPercent(categoryId, marginRulesByCategory, marginPercent);
    // Conta a regra de categoria APLICADA, não a mudança de número: uma
    // regra ativa cuja margem coincide com a padrão ainda é um override
    // (decisão explícita da categoria), só não muda o preço final.
    if (categoryId != null && marginRulesByCategory.has(categoryId)) categoryOverrides++;
    const unitPrice = Number(applyMargin(base, itemMargin).toFixed(2));
    totalCusto += base * safeQuantity;

    return {
      quotationItemId: item.id,
      produtoMatchId: item.produtoMatchId,
      descricao: item.descricao,
      quantidade: safeQuantity,
      unidade: item.unidade,
      custoUnitario: base,
      unitPrice,
      totalPrice: unitPrice * safeQuantity,
      marginPercent: itemMargin,
    };
  });

  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const effectiveMarginPercent = subtotal > 0 ? ((subtotal - totalCusto) / subtotal) * 100 : marginPercent;

  return {
    quotation: data.quotation,
    items,
    subtotal: Number(subtotal.toFixed(2)),
    marginPercent,
    effectiveMarginPercent: Number(effectiveMarginPercent.toFixed(2)),
    categoryOverrides,
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
  };
}
