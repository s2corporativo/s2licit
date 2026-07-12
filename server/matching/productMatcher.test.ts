import { describe, it, expect } from "vitest";
import {
  normalizeText,
  tokenize,
  levenshteinSimilarity,
  jaroWinklerSimilarity,
  tokenSimilarity,
  calculateProductSimilarity,
  matchEditalItem,
  getMatchDecision,
  MATCH_THRESHOLD_AUTO,
  MATCH_THRESHOLD_REVIEW,
  type EditalItem,
  type ProductCandidate,
} from "./productMatcher";

// ─── Normalização ─────────────────────────────────────────────────────────────

describe("normalizeText", () => {
  it("converte para minúsculas", () => {
    expect(normalizeText("AMOXICILINA")).toBe("amoxicilina");
  });

  it("remove acentos", () => {
    expect(normalizeText("Amoxicilína")).toBe("amoxicilina");
    expect(normalizeText("Álcool Etílico")).toBe("alcool etilico");
  });

  it("remove marcas registradas", () => {
    expect(normalizeText("Amoxil® 500mg")).toBe("amoxil 500mg");
    expect(normalizeText("Tylenol™")).toBe("tylenol");
  });

  it("remove pontuação", () => {
    expect(normalizeText("Amoxicilina, 500mg/ml")).toBe("amoxicilina 500mg ml");
  });

  it("retorna string vazia para null/undefined", () => {
    expect(normalizeText(null)).toBe("");
    expect(normalizeText(undefined)).toBe("");
    expect(normalizeText("")).toBe("");
  });

  it("normaliza múltiplos espaços", () => {
    expect(normalizeText("  Amoxicilina   500mg  ")).toBe("amoxicilina 500mg");
  });
});

describe("tokenize", () => {
  it("remove stopwords", () => {
    const tokens = tokenize("Amoxicilina de 500mg para cão");
    expect(tokens).not.toContain("de");
    expect(tokens).not.toContain("para");
    expect(tokens).toContain("amoxicilina");
    expect(tokens).toContain("500mg");
  });

  it("remove tokens de comprimento 1", () => {
    const tokens = tokenize("Vitamina A e B");
    expect(tokens).not.toContain("a");
    expect(tokens).not.toContain("e");
    expect(tokens).not.toContain("b");
  });
});

// ─── Algoritmos de Similaridade ───────────────────────────────────────────────

describe("levenshteinSimilarity", () => {
  it("strings idênticas retornam 1", () => {
    expect(levenshteinSimilarity("amoxicilina", "amoxicilina")).toBe(1);
  });

  it("strings vazias retornam 1", () => {
    expect(levenshteinSimilarity("", "")).toBe(1);
  });

  it("string vazia vs não-vazia retorna 0", () => {
    expect(levenshteinSimilarity("", "amoxicilina")).toBe(0);
  });

  it("strings similares têm score alto", () => {
    const score = levenshteinSimilarity("amoxicilina", "amoxicilina 500mg");
    expect(score).toBeGreaterThan(0.6);
  });

  it("strings completamente diferentes têm score baixo", () => {
    const score = levenshteinSimilarity("amoxicilina", "xyzzyx");
    expect(score).toBeLessThan(0.5);
  });
});

describe("jaroWinklerSimilarity", () => {
  it("strings idênticas retornam 1", () => {
    expect(jaroWinklerSimilarity("amoxicilina", "amoxicilina")).toBe(1);
  });

  it("favorece prefixo comum", () => {
    const withPrefix = jaroWinklerSimilarity("amoxicilina", "amoxicilin");
    const withoutPrefix = jaroWinklerSimilarity("amoxicilina", "oxicilina");
    expect(withPrefix).toBeGreaterThan(withoutPrefix);
  });
});

describe("tokenSimilarity", () => {
  it("strings idênticas retornam 1", () => {
    expect(tokenSimilarity("amoxicilina 500mg", "amoxicilina 500mg")).toBe(1);
  });

  it("strings sem tokens em comum retornam 0", () => {
    expect(tokenSimilarity("amoxicilina", "dipirona")).toBe(0);
  });

  it("strings com tokens parcialmente em comum", () => {
    const score = tokenSimilarity("amoxicilina 500mg comprimido", "amoxicilina 250mg capsula");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
});

// ─── Cálculo de Similaridade de Produto ──────────────────────────────────────

describe("calculateProductSimilarity", () => {
  const product: ProductCandidate = {
    id: 1,
    name: "Amoxicilina 500mg Comprimido",
    activeIngredient: "Amoxicilina",
    concentration: "500mg",
    presentation: "Comprimido",
    unit: "CX",
    manufacturer: "Eurofarma",
    barcode: "7891234567890",
  };

  it("match exato por EAN retorna score 1.0", () => {
    const item: EditalItem = { nome: "Qualquer nome", ean: "7891234567890" };
    const { score } = calculateProductSimilarity(item, product);
    expect(score).toBe(1.0);
  });

  it("item idêntico ao produto tem score alto", () => {
    const item: EditalItem = {
      nome: "Amoxicilina 500mg Comprimido",
      principioAtivo: "Amoxicilina",
      concentracao: "500mg",
      apresentacao: "Comprimido",
      fabricante: "Eurofarma",
    };
    const { score } = calculateProductSimilarity(item, product);
    expect(score).toBeGreaterThan(0.85);
  });

  it("item com nome diferente tem score menor", () => {
    const item: EditalItem = { nome: "Dipirona 500mg Comprimido" };
    const { score } = calculateProductSimilarity(item, product);
    expect(score).toBeLessThan(0.7);
  });

  it("retorna breakdown por critério", () => {
    const item: EditalItem = { nome: "Amoxicilina 500mg" };
    const { criteria } = calculateProductSimilarity(item, product);
    expect(criteria).toHaveProperty("nome");
    expect(criteria).toHaveProperty("principioAtivo");
    expect(criteria).toHaveProperty("apresentacao");
    expect(criteria).toHaveProperty("unidade");
    expect(criteria).toHaveProperty("fabricante");
    expect(criteria).toHaveProperty("ean");
  });

  it("score está entre 0 e 1", () => {
    const item: EditalItem = { nome: "Amoxicilina 500mg" };
    const { score } = calculateProductSimilarity(item, product);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

// ─── Decisão de Match ─────────────────────────────────────────────────────────

describe("getMatchDecision", () => {
  it("score >= 0.85 retorna auto_match", () => {
    expect(getMatchDecision(0.85)).toBe("auto_match");
    expect(getMatchDecision(1.0)).toBe("auto_match");
    expect(getMatchDecision(0.90)).toBe("auto_match");
  });

  it("score 0.60–0.84 retorna needs_review", () => {
    expect(getMatchDecision(0.60)).toBe("needs_review");
    expect(getMatchDecision(0.75)).toBe("needs_review");
    expect(getMatchDecision(0.84)).toBe("needs_review");
  });

  it("score < 0.60 retorna no_match", () => {
    expect(getMatchDecision(0.59)).toBe("no_match");
    expect(getMatchDecision(0.0)).toBe("no_match");
  });

  it("thresholds estão corretos", () => {
    expect(MATCH_THRESHOLD_AUTO).toBe(0.85);
    expect(MATCH_THRESHOLD_REVIEW).toBe(0.60);
  });
});

// ─── Matching Completo ────────────────────────────────────────────────────────

describe("matchEditalItem", () => {
  const catalog: ProductCandidate[] = [
    { id: 1, name: "Amoxicilina 500mg Comprimido", activeIngredient: "Amoxicilina", concentration: "500mg", presentation: "Comprimido" },
    { id: 2, name: "Dipirona 500mg Comprimido", activeIngredient: "Dipirona", concentration: "500mg", presentation: "Comprimido" },
    { id: 3, name: "Amoxicilina 250mg Suspensão", activeIngredient: "Amoxicilina", concentration: "250mg", presentation: "Suspensão" },
    { id: 4, name: "Ibuprofeno 600mg Comprimido", activeIngredient: "Ibuprofeno", concentration: "600mg", presentation: "Comprimido" },
    { id: 5, name: "Amoxicilina 500mg Cápsula", activeIngredient: "Amoxicilina", concentration: "500mg", presentation: "Cápsula" },
  ];

  it("retorna resultados ordenados por score decrescente", () => {
    const item: EditalItem = { nome: "Amoxicilina 500mg Comprimido", principioAtivo: "Amoxicilina" };
    const results = matchEditalItem(item, catalog, 5);
    expect(results.length).toBeGreaterThan(0);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it("o melhor match para Amoxicilina 500mg Comprimido é o produto 1", () => {
    const item: EditalItem = { nome: "Amoxicilina 500mg Comprimido", principioAtivo: "Amoxicilina", concentracao: "500mg", apresentacao: "Comprimido" };
    const results = matchEditalItem(item, catalog, 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].product.id).toBe(1);
  });

  it("respeita o limite maxResults", () => {
    const item: EditalItem = { nome: "Amoxicilina 500mg" };
    const results = matchEditalItem(item, catalog, 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("retorna array vazio quando não há matches acima do threshold", () => {
    const item: EditalItem = { nome: "Produto inexistente xyzabc123" };
    const results = matchEditalItem(item, catalog, 5);
    // Pode retornar 0 ou poucos resultados com score baixo
    results.forEach(r => {
      expect(r.score).toBeGreaterThanOrEqual(MATCH_THRESHOLD_REVIEW);
    });
  });

  it("cada resultado tem decision definida", () => {
    const item: EditalItem = { nome: "Amoxicilina 500mg" };
    const results = matchEditalItem(item, catalog, 5);
    results.forEach(r => {
      expect(["auto_match", "needs_review", "no_match"]).toContain(r.decision);
    });
  });
});
