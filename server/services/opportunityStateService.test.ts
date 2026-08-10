import { describe, expect, it } from "vitest";
import { canEvidenceAdvance } from "./opportunityStateService";

describe("downstream evidence gating", () => {
  it("does not allow operational evidence to skip decision and proposal phases", () => {
    expect(canEvidenceAdvance("triagem", "entrega")).toBe(false);
    expect(canEvidenceAdvance("analise", "entrega")).toBe(false);
    expect(canEvidenceAdvance("precificacao", "faturamento")).toBe(false);
  });

  it("allows strong downstream evidence only after the minimum coherent phase", () => {
    expect(canEvidenceAdvance("proposta", "enviada")).toBe(true);
    expect(canEvidenceAdvance("enviada", "contrato")).toBe(true);
    expect(canEvidenceAdvance("contrato", "entrega")).toBe(true);
    expect(canEvidenceAdvance("contrato", "faturamento")).toBe(true);
    expect(canEvidenceAdvance("faturamento", "recebimento")).toBe(true);
  });

  it("never reopens final stages or regresses", () => {
    expect(canEvidenceAdvance("cancelada", "entrega")).toBe(false);
    expect(canEvidenceAdvance("recebimento", "faturamento")).toBe(false);
  });
});
