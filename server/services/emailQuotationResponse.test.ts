import { describe, it, expect } from "vitest";
import { applyMargin } from "./emailQuotationResponseService";

describe("applyMargin (margem sobre venda)", () => {
  it("usa a fórmula custo/(1-m), igual ao PricingService", () => {
    // custo 100, margem 30% -> 142,857... (margem real 30%)
    expect(applyMargin(100, 30)).toBeCloseTo(142.857, 2);
    // NÃO o markup 130 (que daria só 23,1% de margem real)
    expect(applyMargin(100, 30)).not.toBeCloseTo(130, 1);
  });

  it("margem 0 retorna o custo e margem negativa é rejeitada", () => {
    expect(applyMargin(100, 0)).toBe(100);
    expect(() => applyMargin(50, -5)).toThrow();
  });

  it("rejeita margem >= 100%", () => {
    expect(() => applyMargin(100, 100)).toThrow();
    expect(() => applyMargin(100, 150)).toThrow();
  });

  it("a margem real resultante bate com a configurada", () => {
    const custo = 80;
    const venda = applyMargin(custo, 25);
    const margemReal = (venda - custo) / venda; // lucro / preço de venda
    expect(margemReal).toBeCloseTo(0.25, 4);
  });
});
