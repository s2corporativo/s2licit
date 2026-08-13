import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  extractIngredientCandidates,
  suggestSimilarItems,
  SIMILAR_SUGGEST_THRESHOLD,
  MAX_CANDIDATES_PER_ITEM,
} from "./emailQuotationSimilarService";

// Mocks de banco (camada drizzle)
vi.mock("../db/_client", () => ({
  getDb: vi.fn(),
}));
vi.mock("../db/_helpers", () => ({
  escapeLike: (s: string) => s,
}));
vi.mock("drizzle-orm", async (importOriginal) => {
  const real = await importOriginal<typeof import("drizzle-orm")>();
  return { ...real, and: (...args: any[]) => args, eq: () => null, gt: () => null, like: () => null, or: () => null, asc: () => null };
});
vi.mock("../../drizzle/schema", () => ({
  emailQuotationItems: {},
  products: {},
  suppliers: {},
  categories: {},
}));
// calculateStringSimilarity é importada de productMatchingService, que depende de
// matching/productMatcher. Mockamos o módulo inteiro.
vi.mock("./productMatchingService", () => ({
  calculateStringSimilarity: (a: string, b: string) => {
    if (!a || !b) return 0;
    const na = a.toLowerCase().trim();
    const nb = b.toLowerCase().trim();
    if (na === nb) return 1;
    return 0.9; // valor acima do threshold de sugestão para testar ordenação
  },
}));

import { getDb } from "../db/_client";

function makeCatalog(rows: any[]) {
  return rows;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("extractIngredientCandidates", () => {
  it("extrai termos candidatos de 5+ caracteres, ignorando palavras de suporte", () => {
    const desc = "DIPROPIONATO DE BETAMETASONA 1MG COMPRIMIDO 30 UND";
    const cands = extractIngredientCandidates(desc);
    expect(cands).toContain("dipropionato");
    expect(cands).toContain("betametasona");
    expect(cands).not.toContain("comprimido");
    expect(cands).not.toContain("mg");
  });

  it("retorna vazio para descricao vazia", () => {
    expect(extractIngredientCandidates("")).toEqual([]);
    expect(extractIngredientCandidates("")).toEqual([]);
  });

  it("limita a 2 candidatos", () => {
    const desc = "ALBENDAZOL MEBOENDAZOL FENBENDAZOL PRAZIQUANTEL 50MG";
    expect(extractIngredientCandidates(desc).length).toBeLessThanOrEqual(2);
  });
});

describe("suggestSimilarItems", () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  };

  it("retorna vazio quando não há itens sem match", async () => {
    (getDb as any).mockResolvedValue(mockDb);
    mockDb.where.mockResolvedValueOnce([
      { id: 1, numeroItem: 1, descricao: "ITEM A", produtoMatchId: 10, matchMethod: "nome" },
    ]);
    const result = await suggestSimilarItems(42);
    expect(result).toEqual([]);
  });

  it("sugere por similaridade de nome quando não há principio ativo no catalogo", async () => {
    (getDb as any).mockResolvedValue(mockDb);
    // 1a chamada: itens sem match; 2a+ chamadas: paginacao do catalogo
    mockDb.where.mockResolvedValueOnce([
      { id: 1, numeroItem: 1, descricao: "IBUPROFENO 600MG", produtoMatchId: null, matchMethod: "nenhum" },
    ]);
    const catalog = makeCatalog([
      { id: 100, name: "IBUPROFENO 600 MG COM REV", activeIngredient: null, manufacturer: "F1", concentration: "600MG", presentation: "COM REV", price: "5.00", priceUnit: "CX", supplierName: "Sup A", categoryName: "Humanos" },
      { id: 101, name: "PARACETAMOL 750MG", activeIngredient: null, manufacturer: "F2", concentration: "750MG", presentation: "COM", price: "3.00", priceUnit: "CX", supplierName: "Sup B", categoryName: "Humanos" },
    ]);
    mockDb.limit.mockImplementation(async () => catalog);
    const result = await suggestSimilarItems(42);
    expect(result).toHaveLength(1);
    expect(result[0].candidates.length).toBeGreaterThan(0);
    expect(result[0].candidates[0].score).toBeGreaterThanOrEqual(SIMILAR_SUGGEST_THRESHOLD);
    // ordenado por score decrescente
    const scores = result[0].candidates.map((c) => c.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(result[0].candidates.length).toBeLessThanOrEqual(MAX_CANDIDATES_PER_ITEM);
  });

  it("prioriza candidatos por principio ativo identificado na descricao", async () => {
    (getDb as any).mockResolvedValue(mockDb);
    mockDb.where.mockResolvedValueOnce([
      { id: 1, numeroItem: 1, descricao: "ALBENDAZOL 400MG SUSPENSAO ORAL 30ML", produtoMatchId: null, matchMethod: "nenhum" },
    ]);
    const catalog = makeCatalog([
      { id: 100, name: "VERMIFUGO X 500MG", activeIngredient: "ALBENDAZOL", manufacturer: "F1", concentration: "500MG", presentation: "SUSP", price: "8.00", priceUnit: "CX", supplierName: "Sup A", categoryName: "Veterinários" },
    ]);
    mockDb.limit.mockImplementation(async () => catalog);
    const result = await suggestSimilarItems(42);
    expect(result[0].candidates[0].method).toBe("principioAtivo");
    expect(result[0].candidates[0].id).toBe(100);
  });

  it("retorna vazio sem banco", async () => {
    (getDb as any).mockResolvedValue(null);
    const result = await suggestSimilarItems(42);
    expect(result).toEqual([]);
  });
});
