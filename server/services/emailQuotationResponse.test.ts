import { describe, expect, it } from "vitest";

import { applyMargin } from "./emailQuotationResponseService";

describe("applyMargin (margem sobre venda)", () => {
  it("usa custo dividido pela parcela restante da receita", () => {
    expect(applyMargin(100, 30)).toBeCloseTo(142.857, 2);
    expect(applyMargin(100, 30)).not.toBeCloseTo(130, 1);
  });

  it("mantem o custo quando a margem e zero", () => {
    expect(applyMargin(100, 0)).toBe(100);
  });

  it("recusa custo ou margem fora do dominio permitido", () => {
    expect(() => applyMargin(0, 20)).toThrow();
    expect(() => applyMargin(50, -5)).toThrow();
    expect(() => applyMargin(100, 100)).toThrow();
    expect(() => applyMargin(100, 150)).toThrow();
  });

  it("produz a margem real configurada", () => {
    const cost = 80;
    const salePrice = applyMargin(cost, 25);
    const actualMargin = (salePrice - cost) / salePrice;

    expect(actualMargin).toBeCloseTo(0.25, 4);
  });
});
