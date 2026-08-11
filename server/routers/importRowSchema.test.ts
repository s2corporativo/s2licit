import { describe, expect, it } from "vitest";
import { importRowSchema } from "./importsGroup";
import { parsePrecoBR } from "../utils/number";

describe("importRowSchema", () => {
  it("aceita células numéricas de preço vindas da planilha", () => {
    const parsed = importRowSchema.parse({ nome: "Dipirona 500mg", preco: 12.5 });

    expect(parsed.preco).toBe("12,5");
    expect(parsePrecoBR(parsed.preco!)).toBe(12.5);
  });

  it("preserva o valor de preços com centavos e milhar", () => {
    expect(parsePrecoBR(importRowSchema.parse({ nome: "A", preco: 1234.56 }).preco!)).toBe(1234.56);
    expect(parsePrecoBR(importRowSchema.parse({ nome: "A", preco: 1500 }).preco!)).toBe(1500);
  });

  it("aceita EAN e códigos numéricos sem notação científica", () => {
    const parsed = importRowSchema.parse({
      nome: "Produto",
      ean: 7891234567890,
      codigoMapa: 12345,
    });

    expect(parsed.ean).toBe("7891234567890");
    expect(parsed.codigoMapa).toBe("12345");
  });

  it("aceita nome numérico convertendo para texto", () => {
    expect(importRowSchema.parse({ nome: 12345 }).nome).toBe("12345");
  });

  it("trata null como ausência de valor", () => {
    const parsed = importRowSchema.parse({ nome: "Produto", preco: null, ean: null });

    expect(parsed.preco).toBeUndefined();
    expect(parsed.ean).toBeUndefined();
  });

  it("mantém strings intactas", () => {
    const parsed = importRowSchema.parse({
      nome: "Amoxicilina 500mg",
      preco: "R$ 1.234,56",
      apresentacao: "Frasco 30cp",
    });

    expect(parsed.nome).toBe("Amoxicilina 500mg");
    expect(parsed.preco).toBe("R$ 1.234,56");
    expect(parsed.apresentacao).toBe("Frasco 30cp");
  });

  it("mantém nome vazio para que a linha seja descartada no processamento", () => {
    expect(importRowSchema.parse({ nome: "" }).nome).toBe("");
  });

  it("converte preços por fornecedor informados como número", () => {
    const parsed = importRowSchema.parse({
      nome: "Produto",
      precosFornecedor: { "Fornecedor A": 99.9, "Fornecedor B": "R$ 120,00" },
    });

    expect(parsed.precosFornecedor).toEqual({ "Fornecedor A": "99,9", "Fornecedor B": "R$ 120,00" });
  });

  it("rejeita linha sem nome", () => {
    expect(() => importRowSchema.parse({ preco: 10 })).toThrow();
  });
});
