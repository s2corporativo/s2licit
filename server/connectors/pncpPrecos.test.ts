import { describe, it, expect } from "vitest";
import { estatisticasPreco, type PncpItemResultado } from "./pncpConnector";

function r(valor: number | null): PncpItemResultado {
  return {
    numeroItem: 1,
    fornecedorNome: "F",
    fornecedorCnpjCpf: null,
    quantidadeHomologada: null,
    valorUnitarioHomologado: valor,
    valorTotalHomologado: null,
    dataResultado: null,
  };
}

describe("estatisticasPreco", () => {
  it("retorna zeros quando não há valores válidos", () => {
    expect(estatisticasPreco([])).toEqual({
      amostras: 0, media: null, minimo: null, maximo: null, mediana: null,
    });
    expect(estatisticasPreco([r(null), r(0), r(-5)]).amostras).toBe(0);
  });

  it("calcula média, mínimo, máximo e mediana (ímpar)", () => {
    const s = estatisticasPreco([r(10), r(20), r(30)]);
    expect(s).toMatchObject({ amostras: 3, media: 20, minimo: 10, maximo: 30, mediana: 20 });
  });

  it("calcula mediana com número par de amostras", () => {
    const s = estatisticasPreco([r(10), r(20), r(30), r(40)]);
    expect(s.mediana).toBe(25);
    expect(s.media).toBe(25);
  });

  it("ignora valores nulos e não positivos", () => {
    const s = estatisticasPreco([r(100), r(null), r(0), r(200)]);
    expect(s.amostras).toBe(2);
    expect(s.minimo).toBe(100);
    expect(s.maximo).toBe(200);
  });
});
