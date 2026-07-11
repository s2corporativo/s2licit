import { describe, expect, it } from "vitest";
import { parsePrecoBR } from "./number";

describe("parsePrecoBR", () => {
  it("converte formato pt-BR com milhar e decimal", () => {
    expect(parsePrecoBR("1.234,56")).toBe(1234.56);
  });

  it("converte decimal com vírgula", () => {
    expect(parsePrecoBR("12,5")).toBe(12.5);
  });

  it("mantém formato US com ponto decimal", () => {
    expect(parsePrecoBR("1234.56")).toBe(1234.56);
  });

  it("interpreta ponto seguido de 3 dígitos como milhar", () => {
    expect(parsePrecoBR("1.234")).toBe(1234);
  });

  it("remove prefixo R$ e espaços", () => {
    expect(parsePrecoBR("R$ 2.500,00")).toBe(2500);
  });

  it("converte inteiro simples", () => {
    expect(parsePrecoBR("10")).toBe(10);
  });

  it("retorna null para string vazia", () => {
    expect(parsePrecoBR("")).toBeNull();
  });

  it("retorna número puro diretamente", () => {
    expect(parsePrecoBR(42.9)).toBe(42.9);
  });

  it("converte múltiplos pontos como milhar", () => {
    expect(parsePrecoBR("1.234.567")).toBe(1234567);
  });

  it("retorna null para valor não parseável", () => {
    expect(parsePrecoBR("abc")).toBeNull();
    expect(parsePrecoBR(NaN)).toBeNull();
  });
});
