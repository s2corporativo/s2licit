import { getCompanySettings } from "../db";
import { getEmailQuotationWithItems } from "./emailQuotationSyncService";
import {
  calculateQuotationTotals,
  generateQuotationPdf,
  type QuotationItem,
  type QuotationPdfData,
} from "./quotationPdfGeneratorService";

/**
 * Monta e gera o PDF de orçamento-resposta a partir de uma cotação recebida
 * por e-mail, aplicando a margem sobre o preço de cada produto casado.
 *
 * Preço de venda = precoBase * (1 + margem%/100). A margem usada é a
 * informada (override) ou a margem mínima cadastrada na empresa.
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
  if (marginPercent >= 100) {
    throw new Error("Margem não pode ser 100% ou superior.");
  }
  if (marginPercent <= 0) return basePrice;
  return basePrice / (1 - marginPercent / 100);
}

export async function buildQuotationResponse(
  quotationId: number,
  options?: { marginPercent?: number; validDays?: number },
): Promise<BuildResponseResult> {
  const data = await getEmailQuotationWithItems(quotationId);
  if (!data) throw new Error("Cotação não encontrada.");

  const company = await getCompanySettings();
  const marginPercent =
    options?.marginPercent != null
      ? options.marginPercent
      : Number(company?.minMarginPercent ?? "15") || 15;

  // Considera itens com produto associado (confirmado ou sugerido).
  const usableItems = data.items.filter((i) => i.produtoMatchId != null);

  let itemsSemPreco = 0;
  const pdfItems: QuotationItem[] = usableItems.map((item) => {
    const base = item.precoSugerido != null ? Number(item.precoSugerido) : NaN;
    const quantity = item.quantidade != null ? Number(item.quantidade) : 1;
    let unitPrice = 0;
    if (!isNaN(base) && base > 0) {
      unitPrice = Number(applyMargin(base, marginPercent).toFixed(2));
    } else {
      itemsSemPreco++;
    }
    return {
      productName: item.descricao,
      quantity: quantity > 0 ? quantity : 1,
      unitPrice,
      totalPrice: unitPrice * (quantity > 0 ? quantity : 1),
    };
  });

  if (pdfItems.length === 0) {
    throw new Error(
      "Nenhum item com produto associado. Confirme os matches antes de gerar o orçamento.",
    );
  }

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
    itemsSemPreco,
    marginPercent,
  };
}
