import { calculateSalePrice } from "./pricingSafety";

export interface TotalCostPricingInput {
  productCost: number;
  freightUnit?: number;
  otherFixedUnitCosts?: number;
  taxPercent?: number;
  marginPercent: number;
}

export interface TotalCostPricingResult {
  acquisitionCost: number;
  revenueCostPercent: number;
  salePrice: number;
  marginPercent: number;
}

/**
 * Único adaptador permitido para preço automático de cotações. Frete e outros
 * custos fixos entram no numerador; tributos estimados e margem incidem sobre
 * a receita pelo divisor. Não substitui apuração fiscal/contábil definitiva.
 */
export function calculateQuotationSalePrice(input: TotalCostPricingInput): TotalCostPricingResult {
  const freight = Number(input.freightUnit ?? 0);
  const other = Number(input.otherFixedUnitCosts ?? 0);
  const tax = Number(input.taxPercent ?? 0);
  if (![input.productCost, freight, other, tax, input.marginPercent].every(Number.isFinite)) {
    throw new Error("Parâmetros de precificação inválidos.");
  }
  if (input.productCost <= 0 || freight < 0 || other < 0 || tax < 0) {
    throw new Error("Custos e tributos devem ser valores válidos e não negativos.");
  }
  const fixedUnitCost = freight + other;
  const salePrice = calculateSalePrice({
    cost: input.productCost,
    fixedUnitCost,
    revenueCostPercent: tax,
    marginPercent: input.marginPercent,
  });
  return {
    acquisitionCost: input.productCost + fixedUnitCost,
    revenueCostPercent: tax,
    salePrice,
    marginPercent: input.marginPercent,
  };
}
