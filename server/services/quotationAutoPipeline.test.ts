import { afterEach, describe, expect, it } from "vitest";
import {
  autoConfirmThreshold,
  isAutoPipelineEnabled,
  isAutoSendEnabled,
  shouldAutoConfirm,
  type AutoConfirmCandidate,
} from "./quotationAutoPipelineService";
import { portalTypeForSource } from "./portalAuthenticatedDiscoveryService";

function item(partial: Partial<AutoConfirmCandidate>): AutoConfirmCandidate {
  return {
    matchConfirmado: false,
    matchMethod: "nome",
    matchScore: "0.95",
    produtoMatchId: 10,
    precoSugerido: "12.50",
    ...partial,
  };
}

afterEach(() => {
  delete process.env.QUOTATION_AUTO_CONFIRM_THRESHOLD;
  delete process.env.QUOTATION_AUTO_PIPELINE_ENABLED;
  delete process.env.QUOTATION_AUTO_SEND_ENABLED;
});

describe("shouldAutoConfirm", () => {
  it("confirma match determinístico por código (CATMAS/CATMAT)", () => {
    expect(shouldAutoConfirm(item({ matchMethod: "catmas", matchScore: "1" }))).toBe(true);
    expect(shouldAutoConfirm(item({ matchMethod: "catmat", matchScore: "1" }))).toBe(true);
  });

  it("confirma match por nome somente acima do limiar de alta confiança", () => {
    expect(shouldAutoConfirm(item({ matchScore: "0.95" }), 0.92)).toBe(true);
    expect(shouldAutoConfirm(item({ matchScore: "0.90" }), 0.92)).toBe(false);
    // O limiar padrão (0.92) é mais exigente que o de sugestão (0.68):
    // sugestões medianas ficam para revisão humana.
    expect(shouldAutoConfirm(item({ matchScore: "0.70" }))).toBe(false);
  });

  it("nunca reconfirma item já confirmado", () => {
    expect(shouldAutoConfirm(item({ matchConfirmado: true, matchMethod: "catmas" }))).toBe(false);
  });

  it("bloqueia sem produto casado ou sem preço de custo positivo", () => {
    expect(shouldAutoConfirm(item({ produtoMatchId: null }))).toBe(false);
    expect(shouldAutoConfirm(item({ precoSugerido: null }))).toBe(false);
    expect(shouldAutoConfirm(item({ precoSugerido: "0" }))).toBe(false);
    expect(shouldAutoConfirm(item({ precoSugerido: "-5" }))).toBe(false);
  });

  it("match manual ou nenhum é decisão humana — nunca automático", () => {
    expect(shouldAutoConfirm(item({ matchMethod: "manual", matchScore: "1" }))).toBe(false);
    expect(shouldAutoConfirm(item({ matchMethod: "nenhum", matchScore: null }))).toBe(false);
  });
});

describe("configuração por ambiente", () => {
  it("limiar padrão 0.92; valores fora de [0.5, 1] são ignorados", () => {
    expect(autoConfirmThreshold()).toBe(0.92);
    process.env.QUOTATION_AUTO_CONFIRM_THRESHOLD = "0.85";
    expect(autoConfirmThreshold()).toBe(0.85);
    process.env.QUOTATION_AUTO_CONFIRM_THRESHOLD = "0.2";
    expect(autoConfirmThreshold()).toBe(0.92);
    process.env.QUOTATION_AUTO_CONFIRM_THRESHOLD = "abc";
    expect(autoConfirmThreshold()).toBe(0.92);
  });

  it("pipeline ligado por padrão; desligável com false/0", () => {
    expect(isAutoPipelineEnabled()).toBe(true);
    process.env.QUOTATION_AUTO_PIPELINE_ENABLED = "false";
    expect(isAutoPipelineEnabled()).toBe(false);
    process.env.QUOTATION_AUTO_PIPELINE_ENABLED = "0";
    expect(isAutoPipelineEnabled()).toBe(false);
  });

  it("auto-envio DESLIGADO por padrão — exige opt-in explícito", () => {
    expect(isAutoSendEnabled()).toBe(false);
    process.env.QUOTATION_AUTO_SEND_ENABLED = "1";
    expect(isAutoSendEnabled()).toBe(false); // só "true" liga
    process.env.QUOTATION_AUTO_SEND_ENABLED = "true";
    expect(isAutoSendEnabled()).toBe(true);
  });
});

describe("portalTypeForSource (radar → cofre de credenciais)", () => {
  it("mapeia os portais com automação de login", () => {
    expect(portalTypeForSource("funarbe")).toBe("funarbe");
    expect(portalTypeForSource("comprasmg")).toBe("comprasmg");
    expect(portalTypeForSource("fiemg")).toBe("fiemg");
    expect(portalTypeForSource("fundep")).toBe("fundep");
    expect(portalTypeForSource("copasa")).toBe("copasa");
  });

  it("CEMIG ainda não tem automação de login — retorna null", () => {
    expect(portalTypeForSource("cemig")).toBeNull();
  });
});
