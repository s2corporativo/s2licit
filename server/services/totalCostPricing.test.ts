import { describe, expect, it } from "vitest";
import { calculateQuotationSalePrice } from "./totalCostPricing";

describe("totalCostPricing", () => {
  it("considera custo, frete, tributo e margem", () => {
    const r = calculateQuotationSalePrice({ productCost: 100, freightUnit: 5, taxPercent: 10, marginPercent: 20 });
    expect(r.salePrice).toBeCloseTo(150, 5);
    expect(r.acquisitionCost).toBe(105);
  });
});
