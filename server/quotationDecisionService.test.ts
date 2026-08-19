import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn(), getCompanySettings: vi.fn() }));
vi.mock("./db/_client", () => ({ getDb: vi.fn() }));

import { calculateMaxPurchasePrice, classifyFreshness } from "./services/quotationDecisionService";

describe("quotationDecisionService", () => {
  it("calcula o teto de compra preservando margem, frete e tributos", () => {
    expect(calculateMaxPurchasePrice({
      targetSale: 100,
      minMarginPercent: 20,
      freightValue: 5,
      taxValue: 3,
    })).toMatchObject({
      maxLandedCost: 80,
      maxPurchasePrice: 72,
    });
  });

  it("nunca retorna teto de compra negativo", () => {
    expect(calculateMaxPurchasePrice({
      targetSale: 10,
      minMarginPercent: 50,
      freightValue: 8,
      taxValue: 4,
    }).maxPurchasePrice).toBe(0);
  });

  it("classifica preço recente, em atenção e vencido", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    expect(classifyFreshness(new Date(now - 2 * 86_400_000)).status).toBe("fresh");
    expect(classifyFreshness(new Date(now - 15 * 86_400_000)).status).toBe("attention");
    expect(classifyFreshness(new Date(now - 45 * 86_400_000)).status).toBe("stale");
    expect(classifyFreshness(null).status).toBe("unknown");
    vi.restoreAllMocks();
  });
});
