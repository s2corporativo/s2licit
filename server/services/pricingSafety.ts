import { calcularPrecoDivisor } from "./precoUnificado";

export type MonetaryValue = string | number | null | undefined;

export interface SalePriceInput {
  cost: MonetaryValue;
  marginPercent: number;
  revenueCostPercent?: number;
  fixedUnitCost?: MonetaryValue;
}

export interface ProposalSaleItem {
  id?: number | null;
  productName?: string | null;
  quantity?: number | null;
  suggestedPrice?: MonetaryValue;
}

export type PricingIssueCode =
  | "empty_proposal"
  | "invalid_quantity"
  | "missing_sale_price";

export interface PricingIssue {
  code: PricingIssueCode;
  itemId?: number | null;
  itemName?: string | null;
  message: string;
}

function toFiniteNumber(value: MonetaryValue): number {
  if (value === null || value === undefined || value === "") return Number.NaN;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function assertPercent(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value >= 100) {
    throw new Error(`${name} deve estar entre 0% e menos de 100%.`);
  }
}

/**
 * Calcula preço de venda quando margem e despesas percentuais incidem sobre
 * a receita: preço = (custo + custo fixo unitário) / (1 - despesas - margem).
 *
 * Não use revenueCostPercent para tributos com bases diferentes. Nesses casos,
 * o cálculo deve ser modelado separadamente antes de chegar a esta função.
 */
export function calculateSalePrice({
  cost,
  marginPercent,
  revenueCostPercent = 0,
  fixedUnitCost = 0,
}: SalePriceInput): number {
  const costValue = toFiniteNumber(cost);
  const fixedCostValue = toFiniteNumber(fixedUnitCost);

  if (!Number.isFinite(costValue) || costValue <= 0) {
    throw new Error("Custo unitário deve ser um valor positivo.");
  }
  if (!Number.isFinite(fixedCostValue) || fixedCostValue < 0) {
    throw new Error("Custo fixo unitário não pode ser negativo.");
  }

  assertPercent("Margem", marginPercent);
  assertPercent("Despesas percentuais", revenueCostPercent);

  const preco = calcularPrecoDivisor({
    custo: costValue,
    margemPct: marginPercent,
    impostosPct: revenueCostPercent,
    freteUnit: fixedCostValue,
  });
  if (preco === null) {
    throw new Error(
      "A soma da margem com as despesas percentuais deve ser inferior a 100%.",
    );
  }

  return preco;
}

export function findProposalPricingIssues(
  items: ProposalSaleItem[],
): PricingIssue[] {
  if (items.length === 0) {
    return [{
      code: "empty_proposal",
      message: "A proposta não possui itens.",
    }];
  }

  const issues: PricingIssue[] = [];
  for (const item of items) {
    const itemLabel = item.productName?.trim() || `item ${item.id ?? "sem identificação"}`;
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      issues.push({
        code: "invalid_quantity",
        itemId: item.id,
        itemName: item.productName,
        message: `${itemLabel}: quantidade inválida.`,
      });
    }

    const salePrice = toFiniteNumber(item.suggestedPrice);
    if (!Number.isFinite(salePrice) || salePrice <= 0) {
      issues.push({
        code: "missing_sale_price",
        itemId: item.id,
        itemName: item.productName,
        message: `${itemLabel}: informe um preço de venda positivo.`,
      });
    }
  }

  return issues;
}

export class PricingValidationError extends Error {
  readonly issues: PricingIssue[];

  constructor(issues: PricingIssue[]) {
    const preview = issues.slice(0, 3).map((issue) => issue.message).join(" ");
    const suffix = issues.length > 3 ? ` (+${issues.length - 3} pendência(s))` : "";
    super(`Proposta bloqueada por preço incompleto. ${preview}${suffix}`);
    this.name = "PricingValidationError";
    this.issues = issues;
  }
}

export function assertProposalPricingReady(items: ProposalSaleItem[]): void {
  const issues = findProposalPricingIssues(items);
  if (issues.length > 0) throw new PricingValidationError(issues);
}

export function getExplicitSalePrice(item: ProposalSaleItem): number {
  const issues = findProposalPricingIssues([item]);
  if (issues.length > 0) throw new PricingValidationError(issues);
  return toFiniteNumber(item.suggestedPrice);
}
