import { describe, expect, it } from "vitest";
import { enforceCriticalTechnicalGuards } from "./equivalenceGuardService";
import type { EquivalenceCandidate, EquivalenceReference } from "./equivalenceCompendiumService";

function candidate(overrides: Partial<EquivalenceCandidate> = {}): EquivalenceCandidate {
  return {
    id: 1,
    name: "Produto teste",
    activeIngredient: "Ivermectina",
    concentration: "10 mg/mL",
    pharmaceuticalForm: "solução injetável",
    presentation: "frasco 50 mL",
    manufacturer: "Laboratório X",
    therapeuticClass: "antiparasitário",
    targetSpecies: "bovinos",
    administrationRoute: "subcutânea",
    regulatoryType: "MAPA",
    regulatoryNumber: "12345",
    catmatCode: null,
    catmasCode: null,
    ncm: null,
    technicalScore: 95,
    status: "APROVADO",
    breakdown: {},
    bestOffer: null,
    offerCount: 0,
    ...overrides,
  };
}

const reference: EquivalenceReference = {
  name: "Ivermectina 10 mg/mL injetável",
  activeIngredient: "Ivermectina",
  concentration: "10 mg/mL",
  pharmaceuticalForm: "solução injetável",
  administrationRoute: "subcutânea",
};

describe("enforceCriticalTechnicalGuards", () => {
  it("mantém candidato tecnicamente compatível", () => {
    const [result] = enforceCriticalTechnicalGuards(reference, [candidate()]);
    expect(result.status).toBe("APROVADO");
    expect(result.aiAssessment).toBeUndefined();
  });

  it("bloqueia princípio ativo diferente mesmo com score alto", () => {
    const [result] = enforceCriticalTechnicalGuards(reference, [candidate({ activeIngredient: "Doramectina", technicalScore: 99 })]);
    expect(result.status).toBe("DIVERGENTE");
    expect(result.aiAssessment?.decision).toBe("rejected");
    expect(result.aiAssessment?.criticalDivergences).toContain("Princípio ativo incompatível");
  });

  it("bloqueia concentração com unidade diferente", () => {
    const [result] = enforceCriticalTechnicalGuards(reference, [candidate({ concentration: "10 mcg/mL" })]);
    expect(result.status).toBe("DIVERGENTE");
    expect(result.aiAssessment?.criticalDivergences).toContain("Concentração/unidade incompatível");
  });

  it("bloqueia concentração materialmente diferente na mesma unidade", () => {
    const [result] = enforceCriticalTechnicalGuards(reference, [candidate({ concentration: "20 mg/mL" })]);
    expect(result.status).toBe("DIVERGENTE");
  });

  it("bloqueia via de administração incompatível", () => {
    const [result] = enforceCriticalTechnicalGuards(reference, [candidate({ administrationRoute: "oral" })]);
    expect(result.status).toBe("DIVERGENTE");
    expect(result.aiAssessment?.criticalDivergences).toContain("Via de administração incompatível");
  });
});
