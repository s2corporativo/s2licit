import { describe, expect, it } from "vitest";
import {
  assertTransitionAllowed,
  getAllowedTransitions,
  parseOpportunityDecision,
} from "./opportunityWorkflowService";

describe("opportunityWorkflowService", () => {
  it("lê a decisão mais recente do histórico", () => {
    const decision = parseOpportunityDecision([
      {
        justificativa: "[DECISAO:GO] Catálogo e prazo validados",
        usuario: "Operador",
        createdAt: new Date("2026-07-14T10:00:00Z"),
      },
      {
        justificativa: "Criada pelo Radar",
        usuario: "sistema",
        createdAt: new Date("2026-07-14T09:00:00Z"),
      },
    ]);

    expect(decision).toMatchObject({
      value: "go",
      reason: "Catálogo e prazo validados",
      actor: "Operador",
    });
  });

  it("reconhece NO-GO", () => {
    expect(
      parseOpportunityDecision([
        { justificativa: "[DECISAO:NO_GO] Prazo inviável", usuario: "Operador" },
      ]),
    ).toMatchObject({ value: "no_go", reason: "Prazo inviável" });
  });

  it("ignora eventos comuns", () => {
    expect(parseOpportunityDecision([{ justificativa: "Movida para análise" }])).toBeNull();
  });

  it("oferece somente as próximas etapas válidas", () => {
    expect(getAllowedTransitions("analise")).toEqual([
      "cotacao",
      "precificacao",
      "perdida",
      "cancelada",
    ]);
    expect(getAllowedTransitions("encerrada")).toEqual([]);
  });

  it("bloqueia saltos no funil", () => {
    expect(() => assertTransitionAllowed("triagem", "proposta")).toThrow(
      "Movimentação inválida",
    );
    expect(() => assertTransitionAllowed("proposta", "enviada")).not.toThrow();
  });
});

