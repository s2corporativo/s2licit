import { describe, expect, it } from "vitest";
import { rankSupplierOffers } from "./supplierRankingService";

describe("supplierRankingService — ordenação", () => {
  it("desempata pelo menor preço efetivo quando os scores coincidem", () => {
    const now = new Date("2026-07-18T12:00:00Z");
    const ranked = rankSupplierOffers([
      { offerId: 1, supplierId: 1, supplierName: "A", regularPrice: 110, stock: 10, availability: "disponível", updatedAt: now, scraperStatus: "success" },
      { offerId: 2, supplierId: 2, supplierName: "B", regularPrice: 100, stock: 10, availability: "disponível", updatedAt: now, scraperStatus: "success" },
    ], now);
    expect(ranked[0].supplierName).toBe("B");
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 2]);
  });
});
