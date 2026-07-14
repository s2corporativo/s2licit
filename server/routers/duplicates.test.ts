import { describe, it, expect, vi, beforeEach } from "vitest";
import { products, duplicateExceptions } from "../../drizzle/schema";

/** Simula um query builder do drizzle encadeável (`.where()`/`.limit()`) e "thenable". */
function makeQueryBuilder(data: unknown[]): any {
  const builder: any = Promise.resolve(data);
  builder.where = vi.fn(() => makeQueryBuilder(data));
  builder.limit = vi.fn(() => makeQueryBuilder(data));
  return builder;
}

let productsData: any[] = [];
let exceptionsData: any[] = [];
const insertedExceptions: any[] = [];

const mockFrom = vi.fn((table: unknown) => {
  if (table === duplicateExceptions) return makeQueryBuilder(exceptionsData);
  if (table === products) return makeQueryBuilder(productsData);
  return makeQueryBuilder([]);
});
const mockSelect = vi.fn(() => ({ from: mockFrom }));
const mockValues = vi.fn((vals: any) => {
  insertedExceptions.push(vals);
  return Promise.resolve({});
});
const mockInsert = vi.fn(() => ({ values: mockValues }));

vi.mock("../db", () => ({
  getDb: vi.fn(async () => ({ select: mockSelect, insert: mockInsert })),
}));

import { duplicatesRouter } from "./duplicates";

function caller() {
  return duplicatesRouter.createCaller({ user: { id: "test" } } as any);
}

describe("duplicatesRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productsData = [];
    exceptionsData = [];
    insertedExceptions.length = 0;
  });

  describe("markAsNotDuplicate", () => {
    it("persiste o par na tabela de exceções quando ainda não existe", async () => {
      exceptionsData = [];

      const result = await caller().markAsNotDuplicate({ productId1: 1, productId2: 2 });

      expect(result.success).toBe(true);
      expect(insertedExceptions).toEqual([{ productId1: 1, productId2: 2 }]);
    });

    it("não insere duplicado quando o par já existe (em qualquer ordem)", async () => {
      exceptionsData = [{ id: 99 }];

      await caller().markAsNotDuplicate({ productId1: 2, productId2: 1 });

      expect(insertedExceptions).toEqual([]);
    });

    it("rejeita marcar um produto como não duplicado dele mesmo", async () => {
      await expect(caller().markAsNotDuplicate({ productId1: 5, productId2: 5 })).rejects.toThrow();
      expect(insertedExceptions).toEqual([]);
    });
  });

  describe("detectDuplicates", () => {
    it("não agrupa produtos cujo par está marcado como exceção", async () => {
      productsData = [
        { id: 1, name: "Amoxicilina 500mg", concentration: "500mg", presentation: null, manufacturer: null, isActive: "yes" },
        { id: 2, name: "Amoxicilina 500 mg", concentration: "500mg", presentation: null, manufacturer: null, isActive: "yes" },
      ];
      exceptionsData = [{ productId1: 1, productId2: 2 }];

      const result = await caller().detectDuplicates({ minSimilarity: 0.7, limit: 100 });

      expect(result).toEqual([]);
    });

    it("agrupa produtos similares quando não há exceção registrada", async () => {
      productsData = [
        { id: 1, name: "Amoxicilina 500mg", concentration: "500mg", presentation: null, manufacturer: null, isActive: "yes" },
        { id: 2, name: "Amoxicilina 500 mg", concentration: "500mg", presentation: null, manufacturer: null, isActive: "yes" },
      ];
      exceptionsData = [];

      const result = await caller().detectDuplicates({ minSimilarity: 0.7, limit: 100 });

      expect(result.length).toBe(1);
      expect(result[0].products.map((p) => p.id).sort()).toEqual([1, 2]);
    });
  });

  describe("listDuplicateGroups", () => {
    it("não agrupa produtos cujo par está marcado como exceção", async () => {
      productsData = [
        { id: 1, name: "Amoxicilina 500mg", concentration: "500mg", isActive: "yes" },
        { id: 2, name: "Amoxicilina 500 mg", concentration: "500mg", isActive: "yes" },
      ];
      exceptionsData = [{ productId1: 1, productId2: 2 }];

      const result = await caller().listDuplicateGroups({ page: 1, pageSize: 20, minSimilarity: 0.7 });

      expect(result.groups).toEqual([]);
      expect(result.total).toBe(0);
    });
  });
});
