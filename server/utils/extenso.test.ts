import { describe, it, expect } from "vitest";
import { valorPorExtenso, inteiroPorExtenso } from "./extenso";

describe("valorPorExtenso", () => {
  it("converte inteiros básicos", () => {
    expect(inteiroPorExtenso(0)).toBe("zero");
    expect(inteiroPorExtenso(1)).toBe("um");
    expect(inteiroPorExtenso(100)).toBe("cem");
    expect(inteiroPorExtenso(101)).toBe("cento e um");
    expect(inteiroPorExtenso(1000)).toBe("mil");
    expect(inteiroPorExtenso(2000)).toBe("dois mil");
  });

  it("converte valores monetários", () => {
    expect(valorPorExtenso(0)).toBe("zero real");
    expect(valorPorExtenso(1)).toBe("um real");
    expect(valorPorExtenso(2)).toBe("dois reais");
    expect(valorPorExtenso(0.5)).toBe("cinquenta centavos");
    expect(valorPorExtenso(1.01)).toBe("um real e um centavo");
    expect(valorPorExtenso(1234.5)).toBe(
      "mil duzentos e trinta e quatro reais e cinquenta centavos",
    );
  });

  it("trata negativos", () => {
    expect(valorPorExtenso(-10)).toBe("menos dez reais");
  });
});
