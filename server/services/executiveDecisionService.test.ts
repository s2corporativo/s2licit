import { describe, expect, it } from "vitest";
import { evaluateExecutiveDecision } from "./executiveDecisionService";

describe("evaluateExecutiveDecision", () => {
  it("recomenda GO para oportunidade robusta", () => {
    const result = evaluateExecutiveDecision({
      marginPercent: 22,
      supplierCoveragePercent: 95,
      documentationReadinessPercent: 100,
      deliveryConfidencePercent: 90,
      workingCapitalCoveragePercent: 100,
      competitionLevel: "medium",
      deadlineDays: 10,
      legalRisk: "low",
      taxRisk: "low",
      operationalRisk: "low",
    });

    expect(result.recommendation).toBe("go");
    expect(result.score).toBeGreaterThanOrEqual(72);
    expect(result.blockers).toEqual([]);
  });

  it("bloqueia quando documentação, fornecedor e capital são insuficientes", () => {
    const result = evaluateExecutiveDecision({
      marginPercent: 18,
      supplierCoveragePercent: 30,
      documentationReadinessPercent: 40,
      deliveryConfidencePercent: 80,
      workingCapitalCoveragePercent: 20,
      competitionLevel: "low",
      deadlineDays: 7,
      legalRisk: "low",
      taxRisk: "low",
      operationalRisk: "medium",
    });

    expect(result.recommendation).toBe("no_go");
    expect(result.blockers.length).toBeGreaterThanOrEqual(3);
  });

  it("recomenda cautela em cenário intermediário sem bloqueio", () => {
    const result = evaluateExecutiveDecision({
      marginPercent: 11,
      supplierCoveragePercent: 70,
      documentationReadinessPercent: 75,
      deliveryConfidencePercent: 70,
      workingCapitalCoveragePercent: 65,
      competitionLevel: "high",
      deadlineDays: 4,
      legalRisk: "medium",
      taxRisk: "medium",
      operationalRisk: "medium",
    });

    expect(result.recommendation).toBe("caution");
    expect(result.blockers).toEqual([]);
  });

  it("trata prazo vencido como bloqueio absoluto", () => {
    const result = evaluateExecutiveDecision({
      marginPercent: 30,
      supplierCoveragePercent: 100,
      documentationReadinessPercent: 100,
      deliveryConfidencePercent: 100,
      workingCapitalCoveragePercent: 100,
      competitionLevel: "low",
      deadlineDays: -1,
      legalRisk: "low",
      taxRisk: "low",
      operationalRisk: "low",
    });

    expect(result.recommendation).toBe("no_go");
    expect(result.blockers).toContain("O prazo da oportunidade já venceu.");
  });
});
