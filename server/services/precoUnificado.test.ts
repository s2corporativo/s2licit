import { describe, expect, it } from "vitest";
import { calcularPrecoDivisor, precoFinalUnificado } from "./precoUnificado";

describe("calcularPrecoDivisor (núcleo único usado por precoUnificado, pricingSafety, custoTotalService e PricingService)", () => {
  it("calcula margem sobre a receita, não markup sobre o custo", () => {
    // custo 100, margem 30% → preço deve dar 30% de margem líquida sobre a
    // venda (142,857...), não 130 (que seria markup e daria só 23,1% real).
    expect(calcularPrecoDivisor({ custo: 100, margemPct: 30 })).toBeCloseTo(142.857, 3);
  });

  it("soma impostos e margem no mesmo divisor sem duplicar bases", () => {
    expect(
      calcularPrecoDivisor({ custo: 100, margemPct: 20, impostosPct: 10 })
    ).toBeCloseTo(142.857, 3);
  });

  it("inclui frete no numerador (frete também recebe margem, como custo de aquisição)", () => {
    expect(calcularPrecoDivisor({ custo: 100, freteUnit: 20, margemPct: 20 })).toBe(150);
  });

  it("retorna null quando impostos + margem somam 100% ou mais da venda", () => {
    expect(calcularPrecoDivisor({ custo: 100, margemPct: 60, impostosPct: 40 })).toBeNull();
    expect(calcularPrecoDivisor({ custo: 100, margemPct: 100 })).toBeNull();
  });

  it("mesmo item com os mesmos parâmetros produz o mesmo preço em qualquer chamador", () => {
    const entrada = { custo: 250, margemPct: 25, impostosPct: 12, freteUnit: 15 };
    const a = calcularPrecoDivisor(entrada);
    const b = calcularPrecoDivisor({ ...entrada });
    expect(a).toBe(b);
    expect(a).not.toBeNull();
  });
});

describe("precoFinalUnificado", () => {
  it("arredonda o resultado a 2 casas decimais", () => {
    expect(precoFinalUnificado({ custo: 100, margemPct: 30 })).toBe(142.86);
  });

  it("retorna null quando a operação é inviável", () => {
    expect(precoFinalUnificado({ custo: 100, margemPct: 60, impostosPct: 45 })).toBeNull();
  });
});
