import { describe, expect, it } from "vitest";
import { validateScrapedPrice } from "./scraperPriceGuard";

describe("scraperPriceGuard", () => {
  it("bloqueia queda extrema típica de seletor incorreto", () => {
    const r = validateScrapedPrice({ previousPrice: 120, capturedPrice: 1.2 });
    expect(r.accepted).toBe(false);
  });
  it("aceita variação plausível", () => {
    const r = validateScrapedPrice({ previousPrice: 100, capturedPrice: 110 });
    expect(r.accepted).toBe(true);
  });
});
