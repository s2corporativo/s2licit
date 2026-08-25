import { describe, expect, it } from "vitest";
import { evaluateCostFreshness } from "./priceFreshnessPolicy";

describe("priceFreshnessPolicy", () => {
  it("exige confirmação para custo sem data", () => {
    const result = evaluateCostFreshness({ origin: "nfe", consultedAt: null, maxAgeHours: 24 });
    expect(result.fresh).toBe(false);
    expect(result.requiresHumanConfirmation).toBe(true);
  });

  it("considera vencido custo além da janela", () => {
    const result = evaluateCostFreshness({
      origin: "live_query",
      consultedAt: new Date(Date.now() - 48 * 3_600_000),
      maxAgeHours: 24,
    });
    expect(result.fresh).toBe(false);
  });
});
