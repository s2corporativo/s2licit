import { describe, it, expect } from "vitest";
import { classificarValidade } from "./certidoes";

describe("classificarValidade", () => {
  const hoje = new Date("2026-07-11T12:00:00Z");

  it("marca como vencida quando a validade já passou", () => {
    expect(classificarValidade(new Date("2026-07-01"), hoje)).toBe("vencida");
  });

  it("marca como vence_em_breve dentro da janela de alerta", () => {
    expect(classificarValidade(new Date("2026-07-25"), hoje, 30)).toBe("vence_em_breve");
  });

  it("marca como válida além da janela de alerta", () => {
    expect(classificarValidade(new Date("2026-12-01"), hoje, 30)).toBe("valida");
  });

  it("respeita uma janela de alerta customizada", () => {
    // Vence em ~14 dias; com janela de 7, ainda é "valida".
    expect(classificarValidade(new Date("2026-07-25"), hoje, 7)).toBe("valida");
  });

  it("trata o próprio dia de vencimento como vence_em_breve (não vencida)", () => {
    expect(classificarValidade(new Date("2026-07-11T23:00:00Z"), hoje, 30)).toBe("vence_em_breve");
  });
});
