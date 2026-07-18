import { beforeAll, describe, expect, it, vi } from "vitest";
import { getDb } from "../db";
import { reclassificacaoRouter } from "./reclassificacao";

function caller() {
  return reclassificacaoRouter.createCaller({
    user: { id: "test", role: "editor" },
  } as any);
}

describe("reclassificacaoRouter (fluxo por produto unificado)", () => {
  let db: any;

  beforeAll(async () => {
    db = await getDb();
  });

  describe("listProductsNeedingReclassification", () => {
    it("deve retornar lista vazia quando db é null", async () => {
      vi.mock("../db", () => ({
        getDb: vi.fn().mockResolvedValue(null),
      }));

      const result = await caller().listProductsNeedingReclassification({
        limit: 50,
        offset: 0,
      });

      expect(result.products).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it("deve retornar produtos sem categoria", async () => {
      if (!db) return;

      const result = await caller().listProductsNeedingReclassification({
        limit: 50,
        offset: 0,
      });

      expect(Array.isArray(result.products)).toBe(true);
      expect(typeof result.total).toBe("number");
      expect(typeof result.hasMore).toBe("boolean");
    });

    it("deve respeitar limit e offset", async () => {
      if (!db) return;

      const result1 = await caller().listProductsNeedingReclassification({ limit: 10, offset: 0 });
      const result2 = await caller().listProductsNeedingReclassification({ limit: 10, offset: 10 });

      expect(result1.products.length).toBeLessThanOrEqual(10);
      expect(result2.products.length).toBeLessThanOrEqual(10);
    });
  });

  describe("reclassifyBatch", () => {
    it("deve retornar erro quando db é null", async () => {
      const result = await caller().suggestReclassification({ productIds: [1, 2, 3] });

      expect(result.suggestions).toEqual({});
      expect(result.errors[0]).toBe("Database connection failed");
      expect(result.processed).toBe(0);
      expect(result.failed).toBe(1);
    });

    it("deve validar tamanho máximo de batch", async () => {
      const largeArray = Array.from({ length: 51 }, (_, i) => i + 1);
      await expect(caller().suggestReclassification({ productIds: largeArray })).rejects.toBeDefined();
    });

    it("deve validar tamanho mínimo de batch", async () => {
      await expect(caller().suggestReclassification({ productIds: [] })).rejects.toBeDefined();
    });
  });

  describe("applySuggestions", () => {
    it("deve retornar 0 quando db é null", async () => {
      const result = await caller().applySuggestions({
        suggestions: {
          "1": "Medicamentos Veterinários",
          "2": "Medicamentos Humanos",
        },
      });

      expect(result.applied).toBe(0);
      expect(result.total).toBe(0);
    });

    it("deve validar categorias válidas", async () => {
      const result = await caller().applySuggestions({
        suggestions: {
          "1": "Categoria Inválida",
          "2": "Medicamentos Humanos",
        },
      });

      expect(result.total).toBeLessThanOrEqual(1);
    });
  });

  describe("getReclassificationStats", () => {
    it("deve retornar stats quando db é null", async () => {
      const result = await caller().getReclassificationStats();

      expect(result.needsReclassification).toBe(0);
      expect(result.byCategory).toEqual({});
      expect(Array.isArray(result.categories)).toBe(true);
      expect(result.categories.length).toBe(5);
    });

    it("deve incluir todas as 5 categorias estratégicas", async () => {
      const result = await caller().getReclassificationStats();
      const expectedCategories = [
        "Medicamentos Veterinários",
        "Medicamentos Humanos",
        "Produtos Agro",
        "Insumos",
        "Materiais Diversos",
      ];

      for (const category of expectedCategories) {
        expect(result.categories).toContain(category);
      }
    });

    it("deve retornar byCategory como Record<string, number>", async () => {
      const result = await caller().getReclassificationStats();

      expect(typeof result.byCategory).toBe("object");
      for (const [key, value] of Object.entries(result.byCategory)) {
        expect(typeof key).toBe("string");
        expect(typeof value).toBe("number");
      }
    });
  });

  describe("Validações de entrada", () => {
    it("listProductsNeedingReclassification deve aceitar limit e offset opcionais", async () => {
      const result = await caller().listProductsNeedingReclassification({});

      expect(result).toBeDefined();
      expect(result.products).toBeDefined();
      expect(result.total).toBeDefined();
    });

    it("reclassifyBatch deve rejeitar array vazio", async () => {
      await expect(caller().suggestReclassification({ productIds: [] })).rejects.toBeDefined();
    });

    it("applySuggestions deve aceitar suggestions vazio", async () => {
      const result = await caller().applySuggestions({ suggestions: {} });

      expect(result.applied).toBe(0);
      expect(result.total).toBe(0);
    });
  });

  describe("Tipos de retorno", () => {
    it("listProductsNeedingReclassification deve retornar tipo correto", async () => {
      const result = await caller().listProductsNeedingReclassification({ limit: 50, offset: 0 });

      expect(result).toHaveProperty("products");
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("hasMore");
      expect(typeof result.total).toBe("number");
      expect(typeof result.hasMore).toBe("boolean");
    });

    it("reclassifyBatch deve retornar suggestions e errors", async () => {
      const result = await caller().suggestReclassification({ productIds: [1] });

      expect(result).toHaveProperty("suggestions");
      expect(result).toHaveProperty("errors");
      expect(result).toHaveProperty("processed");
      expect(result).toHaveProperty("failed");
      expect(typeof result.processed).toBe("number");
      expect(typeof result.failed).toBe("number");
    });

    it("applySuggestions deve retornar applied e total", async () => {
      const result = await caller().applySuggestions({
        suggestions: { "1": "Medicamentos Veterinários" },
      });

      expect(result).toHaveProperty("applied");
      expect(result).toHaveProperty("total");
      expect(typeof result.applied).toBe("number");
      expect(typeof result.total).toBe("number");
    });

    it("getReclassificationStats deve retornar stats completo", async () => {
      const result = await caller().getReclassificationStats();

      expect(result).toHaveProperty("needsReclassification");
      expect(result).toHaveProperty("byCategory");
      expect(result).toHaveProperty("categories");
      expect(typeof result.needsReclassification).toBe("number");
      expect(Array.isArray(result.categories)).toBe(true);
    });
  });
});
