import { describe, it, expect } from "vitest";
import { calcularEmbalagem, escolherMelhorEmbalagem } from "./packagingService";

describe("calcularEmbalagem — embalagem fechada (§8)", () => {
  it("arredonda para cima o número de embalagens e calcula a sobra", () => {
    // Solicita 100 unidades, caixa com 30 → 4 caixas (120), sobra 20.
    const r = calcularEmbalagem({
      quantidadeSolicitada: 100,
      unidadesPorEmbalagem: 30,
      precoUnitario: 2,
    });
    expect(r.embalagensNecessarias).toBe(4);
    expect(r.quantidadeTotalFornecida).toBe(120);
    expect(r.sobra).toBe(20);
    expect(r.custoUnitario).toBe(2);
    expect(r.custoTotal).toBe(240); // 4 caixas * (30 * 2)
    expect(r.fracionado).toBe(false);
  });

  it("não gera sobra quando a quantidade é múltipla da embalagem", () => {
    const r = calcularEmbalagem({
      quantidadeSolicitada: 100,
      unidadesPorEmbalagem: 10,
      precoEmbalagem: 25,
    });
    expect(r.embalagensNecessarias).toBe(10);
    expect(r.quantidadeTotalFornecida).toBe(100);
    expect(r.sobra).toBe(0);
    expect(r.custoUnitario).toBe(2.5); // 25 / 10
    expect(r.custoTotal).toBe(250);
  });

  it("deriva o custo total a partir do preço da embalagem", () => {
    // Solicita 7, pacote com 5, pacote custa 12 → 2 pacotes (10), sobra 3.
    const r = calcularEmbalagem({
      quantidadeSolicitada: 7,
      unidadesPorEmbalagem: 5,
      precoEmbalagem: 12,
    });
    expect(r.embalagensNecessarias).toBe(2);
    expect(r.quantidadeTotalFornecida).toBe(10);
    expect(r.sobra).toBe(3);
    expect(r.custoTotal).toBe(24);
    expect(r.custoUnitario).toBe(2.4);
  });
});

describe("calcularEmbalagem — fracionável", () => {
  it("compra exatamente o solicitado quando fracionar é permitido", () => {
    const r = calcularEmbalagem({
      quantidadeSolicitada: 7,
      unidadesPorEmbalagem: 5,
      precoEmbalagem: 12,
      permitirFracionar: true,
    });
    expect(r.quantidadeTotalFornecida).toBe(7);
    expect(r.sobra).toBe(0);
    expect(r.custoTotal).toBe(16.8); // 7 * (12/5)
    expect(r.fracionado).toBe(true);
  });

  it("embalagem unitária nunca gera sobra", () => {
    const r = calcularEmbalagem({
      quantidadeSolicitada: 13,
      unidadesPorEmbalagem: 1,
      precoUnitario: 3,
    });
    expect(r.embalagensNecessarias).toBe(13);
    expect(r.sobra).toBe(0);
    expect(r.custoTotal).toBe(39);
  });
});

describe("calcularEmbalagem — validação", () => {
  it("rejeita quantidade negativa, embalagem < 1 e ausência de preço", () => {
    expect(() => calcularEmbalagem({ quantidadeSolicitada: -1, unidadesPorEmbalagem: 10, precoUnitario: 1 })).toThrow();
    expect(() => calcularEmbalagem({ quantidadeSolicitada: 10, unidadesPorEmbalagem: 0, precoUnitario: 1 })).toThrow();
    expect(() => calcularEmbalagem({ quantidadeSolicitada: 10, unidadesPorEmbalagem: 10 })).toThrow();
  });
});

describe("escolherMelhorEmbalagem (§8)", () => {
  it("escolhe a apresentação de menor custo total", () => {
    // Solicita 100 unidades. Opções do fornecedor:
    //  - caixa 10 a R$ 11 (unit 1,10) → 10 caixas = R$ 110
    //  - caixa 20 a R$ 19 (unit 0,95) → 5 caixas  = R$ 95  ← melhor
    //  - pacote 50 a R$ 52 (unit 1,04) → 2 pacotes = R$ 104
    const best = escolherMelhorEmbalagem(100, [
      { unidadesPorEmbalagem: 10, precoEmbalagem: 11, apresentacao: "Caixa 10" },
      { unidadesPorEmbalagem: 20, precoEmbalagem: 19, apresentacao: "Caixa 20" },
      { unidadesPorEmbalagem: 50, precoEmbalagem: 52, apresentacao: "Pacote 50" },
    ]);
    expect(best?.apresentacao).toBe("Caixa 20");
    expect(best?.custoTotal).toBe(95);
    expect(best?.sobra).toBe(0);
  });

  it("desempata por menor sobra quando o custo total é igual", () => {
    // Solicita 10. Duas opções custam o mesmo total, mas uma sobra menos.
    const best = escolherMelhorEmbalagem(10, [
      { unidadesPorEmbalagem: 12, precoEmbalagem: 24, apresentacao: "Caixa 12" }, // 1 caixa=24, sobra 2
      { unidadesPorEmbalagem: 10, precoEmbalagem: 24, apresentacao: "Caixa 10" }, // 1 caixa=24, sobra 0
    ]);
    expect(best?.apresentacao).toBe("Caixa 10");
  });

  it("retorna null sem opções válidas", () => {
    expect(escolherMelhorEmbalagem(10, [])).toBeNull();
    expect(escolherMelhorEmbalagem(10, [{ unidadesPorEmbalagem: 5 }])).toBeNull();
  });
});
