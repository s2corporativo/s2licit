import { describe, it, expect, vi, beforeEach } from "vitest";
import { products, productSupplierOffers } from "../../drizzle/schema";

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

vi.mock("../db", () => ({
  getDb: vi.fn(async () => ({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  })),
  recordPriceHistory: vi.fn(async () => {}),
}));

import { ScraperEngine } from "./scraperEngine";
import { recordPriceHistory } from "../db";

describe("ScraperEngine.matchAndUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("importa como produto novo um item raspado sem EAN, código ou nome compatível no catálogo", async () => {
    mockInsert.mockImplementation((table: unknown) => ({
      values: vi.fn(async () =>
        table === products ? [{ insertId: 501 }] : [{}],
      ),
    }));

    const engine = new ScraperEngine();
    const result = await engine.matchAndUpdate(
      [{ name: "Zx", price: 42.5 }],
      7,
      "Fornecedor Teste",
    );

    expect(result.matched).toBe(0);
    expect(result.newProducts).toBe(1);
    expect(result.errors).toEqual([]);
    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(mockInsert).toHaveBeenCalledWith(products);
    expect(mockInsert).toHaveBeenCalledWith(productSupplierOffers);
    expect(recordPriceHistory).toHaveBeenCalledWith({
      productId: 501,
      supplierId: 7,
      price: "42.5",
    });
  });

  it("não importa produto novo quando o item raspado já bate com um produto existente pelo EAN", async () => {
    // Ambas as consultas SELECT do caminho "matched" (produto por EAN, oferta já
    // existente) retornam algo, então o fluxo deve atualizar, não inserir.
    const mockLimit = vi.fn(async () => [{ id: 9 }]);
    const mockWhere = vi.fn(() => ({ limit: mockLimit }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));
    mockSelect.mockImplementation(() => ({ from: mockFrom }));
    mockUpdate.mockImplementation(() => ({
      set: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
    }));

    const engine = new ScraperEngine();
    const result = await engine.matchAndUpdate(
      [{ name: "Produto Existente", ean: "789000000", price: 10 }],
      7,
      "Fornecedor Teste",
    );

    expect(result.matched).toBe(1);
    expect(result.newProducts).toBe(0);
    // Produto e oferta já existiam — nenhuma nova linha deve ser inserida em
    // products nem em product_supplier_offers, só atualizações.
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(productSupplierOffers);
    expect(mockUpdate).toHaveBeenCalledWith(products);
  });
});
