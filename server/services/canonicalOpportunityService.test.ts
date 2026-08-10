import { describe, expect, it } from "vitest";
import { macroEtapa, nextActionForStage } from "./canonicalOpportunityService";

describe("canonical opportunity mapping", () => {
  it("reduces detailed stages into five operator macro stages", () => {
    expect(macroEtapa("triagem")).toBe("entrada");
    expect(macroEtapa("precificacao")).toBe("analise");
    expect(macroEtapa("habilitacao")).toBe("proposta");
    expect(macroEtapa("faturamento")).toBe("execucao");
    expect(macroEtapa("encerrada")).toBe("concluida");
    expect(macroEtapa("perdida")).toBe("concluida");
  });

  it("keeps the operator focused on one next action", () => {
    expect(nextActionForStage("triagem")?.code).toBe("decidir");
    expect(nextActionForStage("analise")?.code).toBe("analisar");
    expect(nextActionForStage("precificacao")?.code).toBe("precificar");
    expect(nextActionForStage("contrato")?.code).toBe("pedido");
    expect(nextActionForStage("recebimento")?.code).toBe("recebimento");
    expect(nextActionForStage("encerrada")).toBeNull();
  });
});
