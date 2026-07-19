import { describe, expect, it } from "vitest";
import { calculateSalePrice, findProposalPricingIssues } from "./pricingSafety";

describe("pricingSafety — cobertura ampliada", () => {
  it("calcula margem e despesas percentuais sobre a receita", () => {
    expect(calculateSalePrice({ cost: 70, marginPercent: 20, revenueCostPercent: 10 })).toBeCloseTo(100, 8);
  });

  it("inclui custo fixo unitário antes de aplicar o divisor", () => {
    expect(calculateSalePrice({ cost: 70, fixedUnitCost: 10, marginPercent: 20 })).toBeCloseTo(100, 8);
  });

  it("rejeita soma de margem e despesas igual ou superior a 100%", () => {
    expect(() => calculateSalePrice({ cost: 100, marginPercent: 60, revenueCostPercent: 40 })).toThrow(/inferior a 100%/);
  });

  it("identifica simultaneamente quantidade e preço inválidos", () => {
    const issues = findProposalPricingIssues([{ id: 5, productName: "Produto", quantity: 0, suggestedPrice: null }]);
    expect(issues.map((issue) => issue.code)).toEqual(["invalid_quantity", "missing_sale_price"]);
  });
});
