import { describe, expect, it } from "vitest";
import {
  PricingValidationError,
  assertProposalPricingReady,
  calculateSalePrice,
  findProposalPricingIssues,
  getExplicitSalePrice,
} from "./pricingSafety";

describe("calculateSalePrice", () => {
  it("calcula margem sobre a receita, não markup sobre custo", () => {
    expect(calculateSalePrice({ cost: 100, marginPercent: 30 })).toBeCloseTo(
      142.857,
      3,
    );
  });

  it("considera despesas percentuais sobre a receita sem duplicar bases", () => {
    expect(
      calculateSalePrice({
        cost: 100,
        marginPercent: 20,
        revenueCostPercent: 10,
      }),
    ).toBeCloseTo(142.857, 3);
  });

  it("considera custo fixo unitário", () => {
    expect(
      calculateSalePrice({
        cost: 100,
        fixedUnitCost: 20,
        marginPercent: 20,
      }),
    ).toBe(150);
  });

  it("rejeita custo inválido e percentuais impossíveis", () => {
    expect(() => calculateSalePrice({ cost: 0, marginPercent: 20 })).toThrow(
      /custo unitário/i,
    );
    expect(() =>
      calculateSalePrice({
        cost: 100,
        marginPercent: 60,
        revenueCostPercent: 40,
      }),
    ).toThrow(/inferior a 100%/i);
    expect(() =>
      calculateSalePrice({ cost: 100, marginPercent: -1 }),
    ).toThrow(/margem/i);
  });
});

describe("segurança de preço da proposta", () => {
  it("aceita somente preço de venda explícito e quantidade positiva", () => {
    const item = {
      id: 1,
      productName: "Produto A",
      quantity: 2,
      suggestedPrice: "149.90",
    };
    expect(findProposalPricingIssues([item])).toEqual([]);
    expect(getExplicitSalePrice(item)).toBe(149.9);
    expect(() => assertProposalPricingReady([item])).not.toThrow();
  });

  it("não usa custo como fallback quando o preço de venda está ausente", () => {
    const issues = findProposalPricingIssues([
      {
        id: 2,
        productName: "Produto sem venda",
        quantity: 1,
        suggestedPrice: null,
      },
    ]);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_sale_price" }),
      ]),
    );
    expect(() =>
      assertProposalPricingReady([
        {
          id: 2,
          productName: "Produto sem venda",
          quantity: 1,
          suggestedPrice: null,
        },
      ]),
    ).toThrow(PricingValidationError);
  });

  it("bloqueia proposta vazia, preço zero e quantidade inválida", () => {
    expect(findProposalPricingIssues([])[0]?.code).toBe("empty_proposal");
    const issues = findProposalPricingIssues([
      { id: 3, productName: "Produto B", quantity: 0, suggestedPrice: "0" },
    ]);
    expect(issues.map((issue) => issue.code)).toEqual([
      "invalid_quantity",
      "missing_sale_price",
    ]);
  });
});
