import { describe, expect, it } from "vitest";
import { buildProductDigest, buildQueryDigest, cosineSimilarity } from "./digest";

describe("buildProductDigest", () => {
  it("compõe o digest com todos os campos técnicos", () => {
    const digest = buildProductDigest({
      name: "FLORVET 300mg",
      activeIngredient: "florfenicol",
      concentration: "300 mg/ml",
      pharmaceuticalForm: "solução injetável",
      viaAdministracao: "intramuscular",
      especieAnimal: "bovino",
      classeTerapeutica: "antibiótico",
      manufacturer: "Bayer",
      description: "Antibiótico de amplo espectro",
    });
    expect(digest).toContain("produto: florvet 300mg");
    expect(digest).toContain("principio ativo: florfenicol");
    expect(digest).toContain("concentracao: 300 mg ml");
    expect(digest).toContain("forma: solucao injetavel");
    expect(digest).toContain("via: intramuscular");
    expect(digest).toContain("especie: bovino");
    expect(digest).toContain("classe terapeutica: antibiotico");
    expect(digest).toContain("fabricante: bayer");
  });

  it("omite campos nulos sem deixar placeholders", () => {
    const digest = buildProductDigest({ name: "Produto Mínimo" });
    expect(digest).toBe("produto: produto minimo");
    expect(digest).not.toContain("principio ativo");
  });

  it("aplica o Normalization Engine oficial (acentos e minúsculas)", () => {
    const digest = buildProductDigest({
      name: "AMOXICILINA + CLAVULANATO 500mg",
      manufacturer: "Zoetis",
    });
    expect(digest).not.toContain("Í");
    expect(digest).toContain("amoxicilina clavulanato");
  });
});

describe("buildQueryDigest", () => {
  it("prefixa a consulta com rótulo canônico", () => {
    const d = buildQueryDigest("Florfenicol 300mg injetável para bovinos");
    expect(d).toMatch(/^consulta:/);
    expect(d).toContain("florfenicol 300mg");
  });

  it("rejeita consulta vazia", () => {
    expect(() => buildQueryDigest("   ")).toThrow();
  });
});

describe("cosineSimilarity", () => {
  it("retorna 1 para vetores idênticos normalizados", () => {
    expect(cosineSimilarity([0.5, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5])).toBeCloseTo(1);
  });

  it("retorna 0 para vetores ortogonais", () => {
    expect(cosineSimilarity([1, 0, 0, 0], [0, 1, 0, 0])).toBeCloseTo(0);
  });

  it("retorna -1 para vetores opostos", () => {
    expect(cosineSimilarity([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1);
  });

  it("lança erro com vetores de tamanhos incompatíveis", () => {
    expect(() => cosineSimilarity([1, 0], [1, 0, 0])).toThrow();
  });

  it("lança erro com vetores vazios", () => {
    expect(() => cosineSimilarity([], [])).toThrow();
  });

  it("calcula valor intermediário correto", () => {
    // 45 graus entre (1,0) e (1,1)/|·| → cos = 1/√2
    const result = cosineSimilarity([1, 0], [1, 1]);
    expect(result).toBeCloseTo(Math.SQRT1_2, 10);
  });
});
