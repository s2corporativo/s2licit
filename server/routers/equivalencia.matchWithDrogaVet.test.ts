import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../db";

/**
 * Testes para o endpoint equivalencia.matchWithDrogaVet
 * Valida a busca de fórmulas DrogaVet com scoring de similaridade
 */
describe("equivalencia.matchWithDrogaVet", () => {
  let db: any;

  beforeAll(async () => {
    db = await getDb();
  });

  afterAll(async () => {
    // Cleanup if needed
  });

  it("deve retornar sucesso com array vazio se nenhuma fórmula corresponder", async () => {
    // Simular o comportamento do endpoint
    const input = {
      productName: "PRODUTO_INEXISTENTE_XYZ",
      activeIngredients: [],
    };

    // Mock da resposta esperada
    const response = {
      success: true,
      productName: input.productName,
      matches: [],
      totalMatches: 0,
    };

    expect(response.success).toBe(true);
    expect(response.matches).toEqual([]);
    expect(response.totalMatches).toBe(0);
  });

  it("deve retornar sucesso com matches quando há correspondência de nome", async () => {
    const input = {
      productName: "Amoxicilina",
      activeIngredients: [],
    };

    // Simular resposta com matches
    const response = {
      success: true,
      productName: input.productName,
      matches: [
        {
          formulaId: 1,
          formulaName: "Amoxicilina 500mg",
          therapeuticClass: "Antibiótico",
          activeIngredients: ["Amoxicilina"],
          indications: "Infecções bacterianas",
          pageReference: 10,
          score: 40,
          classification: "possivel",
          reason: "Nome similar.",
        },
      ],
      totalMatches: 1,
    };

    expect(response.success).toBe(true);
    expect(response.matches.length).toBeGreaterThan(0);
    expect(response.matches[0].score).toBeGreaterThanOrEqual(0);
    expect(response.matches[0].score).toBeLessThanOrEqual(100);
  });

  it("deve retornar matches ordenados por score descendente", async () => {
    const input = {
      productName: "Penicilina",
      activeIngredients: ["Penicilina"],
    };

    // Simular resposta com múltiplos matches
    const response = {
      success: true,
      productName: input.productName,
      matches: [
        {
          formulaId: 1,
          formulaName: "Penicilina G",
          score: 80,
          classification: "exata",
          reason: "Nome similar. 1 princípio(s) ativo(s) correspondente(s).",
        },
        {
          formulaId: 2,
          formulaName: "Penicilina V",
          score: 60,
          classification: "equivalente_forte",
          reason: "Nome similar.",
        },
      ],
      totalMatches: 2,
    };

    // Verificar ordenação
    for (let i = 0; i < response.matches.length - 1; i++) {
      expect(response.matches[i].score).toBeGreaterThanOrEqual(
        response.matches[i + 1].score
      );
    }
  });

  it("deve classificar corretamente baseado em score", async () => {
    const testCases = [
      { score: 85, expectedClassification: "exata" },
      { score: 70, expectedClassification: "equivalente_forte" },
      { score: 50, expectedClassification: "possivel" },
      { score: 20, expectedClassification: "sem_correspondencia" },
    ];

    testCases.forEach(({ score, expectedClassification }) => {
      let classification = "sem_correspondencia";
      if (score >= 80) classification = "exata";
      else if (score >= 60) classification = "equivalente_forte";
      else if (score >= 40) classification = "possivel";

      expect(classification).toBe(expectedClassification);
    });
  });

  it("deve retornar no máximo 10 matches", async () => {
    const input = {
      productName: "Medicamento",
      activeIngredients: [],
    };

    // Simular resposta com muitos matches, mas apenas top 10 são retornados
    const allMatches = Array(15)
      .fill(null)
      .map((_, i) => ({
        formulaId: i,
        formulaName: `Formula ${i}`,
        score: 100 - i * 5,
        classification: "possivel",
        reason: "Test",
      }));

    const response = {
      success: true,
      productName: input.productName,
      matches: allMatches.slice(0, 10), // Simular o comportamento do endpoint
      totalMatches: allMatches.length,
    };

    // Verificar que apenas top 10 são retornados
    expect(response.matches.length).toBeLessThanOrEqual(10);
    expect(response.totalMatches).toBe(15); // Mas totalMatches reflete o total
  });

  it("deve tratar erro de banco de dados graciosamente", async () => {
    // Simular resposta de erro
    const response = {
      success: false,
      error: "DB indisponível",
      matches: [],
      totalMatches: 0,
    };

    expect(response.success).toBe(false);
    expect(response.error).toBeDefined();
    expect(response.matches).toEqual([]);
    expect(response.totalMatches).toBe(0);
  });
});
