import { afterEach, describe, expect, it } from "vitest";
import { calculateSalePrice } from "./pricingSafety";

const oldTax = process.env.PRICING_DEFAULT_TAX_PERCENT;
const oldFreight = process.env.PRICING_DEFAULT_FREIGHT_UNIT;

afterEach(() => {
  process.env.PRICING_DEFAULT_TAX_PERCENT = oldTax;
  process.env.PRICING_DEFAULT_FREIGHT_UNIT = oldFreight;
});

describe("pricing defaults", () => {
  it("inclui tributo e frete quando o chamador omite parâmetros", () => {
    process.env.PRICING_DEFAULT_TAX_PERCENT = "10";
    process.env.PRICING_DEFAULT_FREIGHT_UNIT = "5";
    const price = calculateSalePrice({ cost: 100, marginPercent: 20 });
    expect(price).toBeCloseTo(150, 5);
  });
});
