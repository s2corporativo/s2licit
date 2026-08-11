import { describe, expect, it } from "vitest";
import { cellToText } from "./cellText";
import { parsePrecoBR } from "../server/utils/number";

describe("cellToText", () => {
  it("mantém texto e trata vazios", () => {
    expect(cellToText("Dipirona 500mg")).toBe("Dipirona 500mg");
    expect(cellToText("")).toBe("");
    expect(cellToText(null)).toBe("");
    expect(cellToText(undefined)).toBe("");
  });

  it("converte inteiros sem alterar o valor (EAN, códigos)", () => {
    expect(cellToText(7891234567890)).toBe("7891234567890");
    expect(cellToText(0)).toBe("0");
    expect(cellToText(-5)).toBe("-5");
  });

  it("converte decimais com vírgula pt-BR", () => {
    expect(cellToText(12.5)).toBe("12,5");
    expect(cellToText(1234.56)).toBe("1234,56");
    expect(cellToText(1234.567)).toBe("1234,567");
  });

  it("evita notação científica em decimais muito pequenos", () => {
    expect(cellToText(0.0000001)).toBe("0,0000001");
  });

  it("descarta números não finitos", () => {
    expect(cellToText(Number.NaN)).toBe("");
    expect(cellToText(Number.POSITIVE_INFINITY)).toBe("");
  });

  it("formata datas em pt-BR sem deslocar o dia", () => {
    expect(cellToText(new Date("2026-08-10T00:00:00Z"))).toBe("10/08/2026");
    expect(cellToText(new Date("data inválida"))).toBe("");
  });

  it("converte booleanos", () => {
    expect(cellToText(true)).toBe("true");
    expect(cellToText(false)).toBe("false");
  });
});

describe("cellToText + parsePrecoBR", () => {
  it("preserva o valor de células numéricas de preço", () => {
    const precos = [12.5, 1234.56, 1234.567, 0.99, 7, 1500];
    for (const preco of precos) {
      expect(parsePrecoBR(cellToText(preco))).toBeCloseTo(preco, 6);
    }
  });
});
