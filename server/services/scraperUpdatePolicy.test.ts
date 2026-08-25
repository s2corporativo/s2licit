import { describe, expect, it } from "vitest";
import { scraperMayUpdateCost } from "./scraperUpdatePolicy";

describe("scraperUpdatePolicy", () => {
  it("bloqueia captura sem proveniência", () => {
    const r = scraperMayUpdateCost({ previousPrice: 100, capturedPrice: 101 });
    expect(r.accepted).toBe(false);
  });
});
