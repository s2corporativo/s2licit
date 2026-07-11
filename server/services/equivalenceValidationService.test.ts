import { describe, it, expect, vi, beforeEach } from "vitest";

// Funções internas para teste
function normalizeValue(value: string | undefined): string {
  if (!value) return "";
  return value.trim().toLowerCase().replace(/[,]/g, ".");
}

function calculateAttributeScore(
  refValue: string | undefined,
  candValue: string | undefined,
  weight: number = 1
): { score: number; match: boolean } {
  if (!refValue || !candValue) return { score: 0, match: false };

  const ref = normalizeValue(refValue);
  const cand = normalizeValue(candValue);

  if (ref === cand) return { score: 100 * weight, match: true };
  if (cand.includes(ref) || ref.includes(cand)) return { score: 75 * weight, match: true };

  const refNum = parseFloat(ref.match(/[\d.]+/)?.[0] || "");
  const candNum = parseFloat(cand.match(/[\d.]+/)?.[0] || "");

  if (!isNaN(refNum) && !isNaN(candNum)) {
    const diff = Math.abs(refNum - candNum) / refNum;
    if (diff <= 0.05) return { score: 90 * weight, match: true };
    if (diff <= 0.1) return { score: 70 * weight, match: true };
    if (diff <= 0.2) return { score: 50 * weight, match: true };
  }

  return { score: 0, match: false };
}



describe("equivalenceValidationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("normalizeValue", () => {
    it("deve normalizar valores com espaços", () => {
      expect(normalizeValue("  10 mg  ")).toBe("10 mg");
    });

    it("deve converter para minúsculas", () => {
      expect(normalizeValue("10 MG")).toBe("10 mg");
    });

    it("deve substituir vírgulas por pontos", () => {
      expect(normalizeValue("10,5 mg")).toBe("10.5 mg");
    });

    it("deve retornar string vazia para undefined", () => {
      expect(normalizeValue(undefined)).toBe("");
    });

    it("deve retornar string vazia para null", () => {
      expect(normalizeValue(null as any)).toBe("");
    });
  });

  describe("calculateAttributeScore", () => {
    it("deve retornar 100 para valores idênticos", () => {
      const result = calculateAttributeScore("10 mg", "10 mg", 1);
      expect(result.score).toBe(100);
      expect(result.match).toBe(true);
    });

    it("deve retornar 75 para substring match", () => {
      const result = calculateAttributeScore("10 mg/mL", "10 mg", 1);
      expect(result.score).toBe(75);
      expect(result.match).toBe(true);
    });

    it("deve retornar 90 para diferença numérica de 5%", () => {
      const result = calculateAttributeScore("10 mg", "10.5 mg", 1);
      expect(result.score).toBe(90);
      expect(result.match).toBe(true);
    });

    it("deve retornar 70 para diferença numérica de 10%", () => {
      const result = calculateAttributeScore("10 mg", "11 mg", 1);
      expect(result.score).toBe(70);
      expect(result.match).toBe(true);
    });

    it("deve retornar 50 para diferença numérica de 20%", () => {
      const result = calculateAttributeScore("10 mg", "12 mg", 1);
      expect(result.score).toBe(50);
      expect(result.match).toBe(true);
    });

    it("deve retornar 0 para valores muito diferentes", () => {
      const result = calculateAttributeScore("10 mg", "50 mg", 1);
      expect(result.score).toBe(0);
      expect(result.match).toBe(false);
    });

    it("deve retornar 0 para valores ausentes", () => {
      const result = calculateAttributeScore(undefined, "10 mg", 1);
      expect(result.score).toBe(0);
      expect(result.match).toBe(false);
    });

    it("deve aplicar weight ao score", () => {
      const result = calculateAttributeScore("10 mg", "10 mg", 2);
      expect(result.score).toBe(200);
      expect(result.match).toBe(true);
    });
  });



  describe("Score Calculation Logic", () => {
    it("deve calcular score correto para múltiplos atributos", () => {
      const activeIngredientScore = calculateAttributeScore(
        "Amoxicilina",
        "Amoxicilina",
        40
      );
      const concentrationScore = calculateAttributeScore("500 mg", "500 mg", 35);
      const presentationScore = calculateAttributeScore(
        "Comprimido",
        "Comprimido",
        25
      );

      const totalScore =
        (activeIngredientScore.score +
          concentrationScore.score +
          presentationScore.score) /
        100;

      expect(totalScore).toBe(100);
    });

    it("deve penalizar atributos ausentes", () => {
      const activeIngredientScore = calculateAttributeScore(
        "Amoxicilina",
        "Amoxicilina",
        40
      );
      const concentrationScore = calculateAttributeScore("500 mg", undefined, 35);
      const presentationScore = calculateAttributeScore(
        "Comprimido",
        "Comprimido",
        25
      );

      const totalScore =
        (activeIngredientScore.score +
          concentrationScore.score +
          presentationScore.score) /
        100;

      expect(totalScore).toBeLessThan(100);
      expect(totalScore).toBeGreaterThan(0);
    });
  });
});
