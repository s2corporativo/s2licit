import { describe, it, expect } from "vitest";
import {
  classificarCompatibilidade,
  normalizarScore,
  LIMIAR_AUTO,
  LIMIAR_SEM_VALIDACAO,
} from "./matchClassification";

describe("normalizarScore", () => {
  it("aceita fração e percentual", () => {
    expect(normalizarScore(0.87)).toBeCloseTo(0.87);
    expect(normalizarScore(87)).toBeCloseTo(0.87);
    expect(normalizarScore(100)).toBe(1);
  });
  it("satura fora do intervalo e trata inválidos", () => {
    expect(normalizarScore(150)).toBe(1);
    expect(normalizarScore(-5)).toBe(0);
    expect(normalizarScore(NaN)).toBe(0);
  });
});

describe("classificarCompatibilidade — faixas da §6", () => {
  it("100% → exata, uso automático", () => {
    const r = classificarCompatibilidade(1);
    expect(r.classe).toBe("exata");
    expect(r.usoAutomaticoPermitido).toBe(true);
    expect(r.naoUsarAutomaticamente).toBe(false);
  });

  it("90–99% → equivalente, uso automático sem validação", () => {
    const r = classificarCompatibilidade(0.95);
    expect(r.classe).toBe("equivalente");
    expect(r.usoAutomaticoPermitido).toBe(true);
    expect(r.exigeValidacaoHumana).toBe(false);
  });

  it("75–89% → provável, EXIGE validação humana (não automático)", () => {
    const r = classificarCompatibilidade(0.8);
    expect(r.classe).toBe("provavel");
    expect(r.usoAutomaticoPermitido).toBe(false);
    expect(r.exigeValidacaoHumana).toBe(true);
    expect(r.naoUsarAutomaticamente).toBe(false);
  });

  it("abaixo de 75% → não usar automaticamente", () => {
    const parcial = classificarCompatibilidade(0.7);
    expect(parcial.classe).toBe("parcial");
    expect(parcial.naoUsarAutomaticamente).toBe(true);

    const incompat = classificarCompatibilidade(0.4);
    expect(incompat.classe).toBe("incompativel");
    expect(incompat.naoUsarAutomaticamente).toBe(true);
  });

  it("respeita exatamente os limiares de fronteira", () => {
    expect(classificarCompatibilidade(LIMIAR_AUTO).exigeValidacaoHumana).toBe(true); // 0.75
    expect(classificarCompatibilidade(LIMIAR_AUTO - 0.001).naoUsarAutomaticamente).toBe(true);
    expect(classificarCompatibilidade(LIMIAR_SEM_VALIDACAO).usoAutomaticoPermitido).toBe(true); // 0.90
    expect(classificarCompatibilidade(LIMIAR_SEM_VALIDACAO - 0.001).usoAutomaticoPermitido).toBe(false);
  });
});

describe("classificarCompatibilidade — disponibilidade", () => {
  it("não encontrado força classe e bloqueia automação", () => {
    const r = classificarCompatibilidade(0.99, "nao_encontrado");
    expect(r.classe).toBe("nao_encontrado");
    expect(r.usoAutomaticoPermitido).toBe(false);
    expect(r.naoUsarAutomaticamente).toBe(true);
  });

  it("indisponível preserva o percentual mas bloqueia automação", () => {
    const r = classificarCompatibilidade(0.97, "indisponivel");
    expect(r.classe).toBe("indisponivel");
    expect(r.percentual).toBe(97);
    expect(r.usoAutomaticoPermitido).toBe(false);
  });
});
