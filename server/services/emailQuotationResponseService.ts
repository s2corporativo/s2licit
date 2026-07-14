import { getCompanySettings } from "../db";
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
 * por e-mail. Somente itens com match confirmado e custo positivo podem
 * participar. A margem é calculada sobre a receita, nunca como markup.
 */

export interface BuildResponseResult {
  pdfBase64: string;
  total: number;
  itemCount: number;
  itemsSemPreco: number;
  marginPercent: number;
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

export async function buildQuotationResponse(
  quotationId: number,
  options?: { marginPercent?: number; validDays?: number },
): Promise<BuildResponseResult> {
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

  const unconfirmedItems = data.items.filter(
    (item) => item.produtoMatchId == null || item.matchConfirmado !== true,
  );
  if (unconfirmedItems.length > 0) {
    throw new Error(
      `Cotação bloqueada: confirme o match de ${unconfirmedItems.length} item(ns) antes de gerar ou enviar o orçamento.`,
    );
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

  const pdfItems: QuotationItem[] = data.items.map((item) => {
    const base = Number(item.precoSugerido);
    const quantity = item.quantidade != null ? Number(item.quantidade) : 1;
    const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
    const unitPrice = Number(applyMargin(base, marginPercent).toFixed(2));

    return {
      productName: item.descricao,
      quantity: safeQuantity,
      unitPrice,
      totalPrice: unitPrice * safeQuantity,
    };
  });

  const { subtotal } = calculateQuotationTotals(pdfItems);
  const validDays = options?.validDays ?? 30;

  const pdfData: QuotationPdfData = {
    number: `COT-${quotationId}`,
    date: new Date(),
    validUntil: new Date(Date.now() + validDays * 24 * 60 * 60 * 1000),
    clientName: data.quotation.orgao ?? data.quotation.fromName ?? undefined,
    clientEmail: data.quotation.fromAddress ?? undefined,
    items: pdfItems,
    subtotal,
    total: subtotal,
    notes: data.quotation.subject
      ? `Em resposta à solicitação: ${data.quotation.subject}`
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
    marginPercent,
  };
}
