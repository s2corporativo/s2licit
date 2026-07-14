import { describe, expect, it } from "vitest";

import {
  PricingValidationError,
  assertProposalPricingReady,
  calculateSalePrice,
  findProposalPricingIssues,
  getExplicitSalePrice,
} from "./pricingSafety";

describe("pricingSafety", () => {
  it("calcula o preco quando a margem incide sobre a receita", () => {
    expect(calculateSalePrice({ cost: 100, marginPercent: 20 })).toBe(125);
  });

  it("considera custo fixo e despesas percentuais", () => {
    expect(
      calculateSalePrice({
        cost: 100,
        fixedUnitCost: 10,
        marginPercent: 20,
        revenueCostPercent: 10,
      }),
    ).toBeCloseTo(157.142857, 6);
  });

  it("recusa custo unitario invalido", () => {
    expect(() => calculateSalePrice({ cost: 0, marginPercent: 20 })).toThrow(
      "Custo unitário deve ser um valor positivo",
    );
  });

  it("recusa margem e despesas que consumam toda a receita", () => {
    expect(() =>
      calculateSalePrice({
        cost: 100,
        marginPercent: 60,
        revenueCostPercent: 40,
      }),
    ).toThrow("deve ser inferior a 100%");
  });

  it("identifica quantidade invalida e preco ausente", () => {
    expect(
      findProposalPricingIssues([
        { id: 7, productName: "Produto teste", quantity: 0 },
      ]).map((issue) => issue.code),
    ).toEqual(["invalid_quantity", "missing_sale_price"]);
  });

  it("aceita proposta com quantidade e preco de venda positivos", () => {
    expect(() =>
      assertProposalPricingReady([
        {
          id: 7,
          productName: "Produto teste",
          quantity: 2,
          suggestedPrice: "49.90",
        },
      ]),
    ).not.toThrow();
  });

  it("bloqueia leitura de preco implicito ou ausente", () => {
    expect(() =>
      getExplicitSalePrice({ id: 7, productName: "Produto teste", quantity: 1 }),
    ).toThrow(PricingValidationError);
  });

  it("retorna o preco explicito validado", () => {
    expect(
      getExplicitSalePrice({ quantity: 1, suggestedPrice: "49.90" }),
    ).toBe(49.9);
  });
});
