import { describe, it, expect } from "vitest";
import { sugerirPreco } from "./precificacaoInteligenteService";

// Config simples: sem impostos nem frete, para isolar a lógica de margem.
const configZero = {
  supplierId: 1,
  region: "Nacional",
  icmsPercentage: 0,
  ipPercentage: 0,
  pisPercentage: 0,
  cofinsPercentage: 0,
  freightType: "fixed" as const,
  freightValue: 0,
  roundingMethod: "round" as const,
};

describe("sugerirPreco", () => {
  it("piso e alvo seguem a fórmula de margem sobre venda", () => {
    const s = sugerirPreco({ custo: 100, config: configZero, margemMinima: 10, margemDesejada: 30 });
    // piso: 100/(1-0.10)=111,11 ; alvo: 100/(1-0.30)=142,86
    expect(s.piso).toBeCloseTo(111.11, 1);
    expect(s.alvo).toBeCloseTo(142.86, 1);
  });

  it("sem histórico, sugere o alvo", () => {
    const s = sugerirPreco({ custo: 100, config: configZero, margemMinima: 10, margemDesejada: 30 });
    expect(s.sugerido).toBeCloseTo(s.alvo, 2);
    expect(s.baseHistorica).toBeNull();
  });

  it("com histórico entre piso e alvo, mira 2% abaixo da mediana", () => {
    const s = sugerirPreco({
      custo: 100,
      config: configZero,
      margemMinima: 10,
      margemDesejada: 30,
      estatisticasHomologado: { amostras: 5, media: 130, minimo: 120, maximo: 145, mediana: 130 },
    });
    // 130*0.98 = 127,4 — entre piso (111,11) e alvo (142,86)
    expect(s.sugerido).toBeCloseTo(127.4, 1);
    expect(s.baseHistorica).toBe(130);
  });

  it("com histórico ABAIXO do piso, alerta de prejuízo e não desce do piso", () => {
    const s = sugerirPreco({
      custo: 100,
      config: configZero,
      margemMinima: 10,
      margemDesejada: 30,
      estatisticasHomologado: { amostras: 3, media: 90, minimo: 80, maximo: 100, mediana: 90 },
    });
    expect(s.alerta).toMatch(/ABAIXO do seu preço-piso/i);
    expect(s.sugerido).toBeGreaterThanOrEqual(s.piso);
  });

  it("nunca sugere abaixo do piso nem acima do alvo", () => {
    const s = sugerirPreco({
      custo: 50,
      config: configZero,
      margemMinima: 15,
      margemDesejada: 40,
      estatisticasHomologado: { amostras: 10, media: 200, minimo: 180, maximo: 220, mediana: 200 },
    });
    // mediana altíssima -> travado no alvo
    expect(s.sugerido).toBeLessThanOrEqual(s.alvo + 0.01);
    expect(s.sugerido).toBeGreaterThanOrEqual(s.piso - 0.01);
  });

  it("a margem no preço sugerido fica entre a mínima e a desejada", () => {
    const s = sugerirPreco({
      custo: 100,
      config: configZero,
      margemMinima: 10,
      margemDesejada: 30,
      estatisticasHomologado: { amostras: 5, media: 125, minimo: 115, maximo: 135, mediana: 125 },
    });
    expect(s.margemNoSugerido).toBeGreaterThanOrEqual(10 - 0.5);
    expect(s.margemNoSugerido).toBeLessThanOrEqual(30 + 0.5);
  });
});
