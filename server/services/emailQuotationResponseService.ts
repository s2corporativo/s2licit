import { getCompanySettings } from "../db";
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
}

export function applyMargin(basePrice: number, marginPercent: number): number {
  return calculateSalePrice({ cost: basePrice, marginPercent });
}

function resolveMarginPercent(requested: number | undefined, configured: number): number {
  const value = requested ?? configured;
  if (!Number.isFinite(value) || value < 0 || value >= 100) {
    throw new Error("Margem inválida. Use valor entre 0 e 99,99%.");
  }
  return value;
}

function resolveValidDays(requested: number | undefined): number {
  const value = requested ?? 30;
  if (!Number.isInteger(value) || value < 1 || value > 365) {
    throw new Error("Validade inválida. Use de 1 a 365 dias.");
  }
  return value;
}

export async function buildQuotationResponse(
  quotationId: number,
  options?: { marginPercent?: number; validDays?: number },
): Promise<BuildResponseResult> {
  if (!Number.isInteger(quotationId) || quotationId <= 0) {
    throw new Error("Identificador de cotação inválido.");
  }

  const data = await getEmailQuotationWithItems(quotationId);
  if (!data) throw new Error("Cotação não encontrada.");

  const company = await getCompanySettings();
  const configuredMargin = Number(company?.minMarginPercent ?? "15");
  const safeConfiguredMargin = Number.isFinite(configuredMargin) ? configuredMargin : 15;
  const marginPercent = resolveMarginPercent(options?.marginPercent, safeConfiguredMargin);
  const validDays = resolveValidDays(options?.validDays);

  if (data.items.length === 0) {
    throw new Error("A cotação não possui itens para responder.");
  }
  if (data.items.length > 1000) {
    throw new Error("A cotação excede o limite operacional de 1.000 itens por documento.");
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

  const pdfItems: QuotationItem[] = data.items.map((item, index) => {
    const base = Number(item.precoSugerido);
    const quantity = item.quantidade != null ? Number(item.quantidade) : 1;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Cotação bloqueada: quantidade inválida no item ${index + 1}.`);
    }
    const unitPrice = Number(applyMargin(base, marginPercent).toFixed(2));
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw new Error(`Cotação bloqueada: preço de venda inválido no item ${index + 1}.`);
    }

    return {
      productName: item.descricao,
      quantity,
      unitPrice,
      totalPrice: Number((unitPrice * quantity).toFixed(2)),
    };
  });

  const { subtotal } = calculateQuotationTotals(pdfItems);
  if (!Number.isFinite(subtotal) || subtotal <= 0) {
    throw new Error("Cotação bloqueada: total comercial inválido.");
  }

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
