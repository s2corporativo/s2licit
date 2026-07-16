import { describe, expect, it } from "vitest";
import { calcularCustoTotal } from "./custoTotalService";

describe("custoTotalService", () => {
  it("rateia fretes e extras pela quantidade", () => {
    const r = calcularCustoTotal({
      precoProdutoUnit: 10,
      quantidade: 100,
      freteEntradaTotal: 200,   // 2/un
      freteSaidaTotal: 100,     // 1/un
      outrosCustosTotal: 50,    // 0,50/un
    });
    expect(r.custoUnitarioReal).toBe(13.5);
    expect(r.custoLoteReal).toBe(1350);
  });

  it("preço mínimo cobre custo + impostos + margem mínima", () => {
    const r = calcularCustoTotal({
      precoProdutoUnit: 70,
      quantidade: 1,
      impostosPct: 6,
      margemMinimaPct: 10,
    });
    // preco = 70 / (1 - 0.16) = 83.33
    expect(r.precoMinimoUnit).toBe(83.33);
    // conferência: margem líquida no preço mínimo ≈ margem mínima
    expect(r.margemLiquidaEm(83.33)).toBeCloseTo(10, 0);
  });

  it("retorna null e alerta quando percentuais + margem >= 100%", () => {
    const r = calcularCustoTotal({
      precoProdutoUnit: 70,
      quantidade: 1,
      impostosPct: 60,
      margemMinimaPct: 45,
    });
    expect(r.precoMinimoUnit).toBeNull();
    expect(r.alertas.join(" ")).toContain("inviável");
  });

  it("alerta quando frete passa de 30% do produto", () => {
    const r = calcularCustoTotal({
      precoProdutoUnit: 10,
      quantidade: 10,
      freteEntradaTotal: 50, // 5/un = 50% do produto
    });
    expect(r.alertas.join(" ")).toContain("30%");
  });

  it("margemLiquidaEm calcula a margem real num preço dado", () => {
    const r = calcularCustoTotal({ precoProdutoUnit: 70, quantidade: 1, impostosPct: 6 });
    // preço 100: líquido 94, lucro 24 → 24%
    expect(r.margemLiquidaEm(100)).toBe(24);
  });

  it("§8: expõe a quebra de embalagem e alerta de sobra sem alterar o custo por padrão", () => {
    // Solicita 100, caixa com 30 → 4 caixas (120), sobra 20.
    const r = calcularCustoTotal({
      precoProdutoUnit: 10,
      quantidade: 100,
      unidadesPorEmbalagem: 30,
    });
    expect(r.embalagem?.embalagensNecessarias).toBe(4);
    expect(r.embalagem?.sobra).toBe(20);
    expect(r.alertas.join(" ")).toContain("sobra de 20");
    // Padrão: não repassa a sobra → custo por unidade inalterado.
    expect(r.custoUnitarioReal).toBe(10);
  });

  it("§8: amortiza a sobra no custo quando carregarSobraNaVenda é true", () => {
    // 4 caixas × 30 × R$10 = R$1200 para 100 unidades → 12/un.
    const r = calcularCustoTotal({
      precoProdutoUnit: 10,
      quantidade: 100,
      unidadesPorEmbalagem: 30,
      carregarSobraNaVenda: true,
    });
    expect(r.custoUnitarioReal).toBe(12);
  });

  it("§8: sem sobra não gera alerta nem altera o custo", () => {
    const r = calcularCustoTotal({
      precoProdutoUnit: 10,
      quantidade: 100,
      unidadesPorEmbalagem: 10,
      carregarSobraNaVenda: true,
    });
    expect(r.embalagem?.sobra).toBe(0);
    expect(r.custoUnitarioReal).toBe(10);
    expect(r.alertas.join(" ")).not.toContain("sobra");
  });
});
