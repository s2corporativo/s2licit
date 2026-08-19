import { describe, expect, it } from "vitest";
import { undatedCostBlocksAutomation } from "./costAutomationPolicy";

describe("costAutomationPolicy", () => {
  it("bloqueia por padrão", () => {
    const old = process.env.PRICE_UNDATED_REQUIRES_CONFIRMATION;
    delete process.env.PRICE_UNDATED_REQUIRES_CONFIRMATION;
    try { expect(undatedCostBlocksAutomation()).toBe(true); }
    finally { process.env.PRICE_UNDATED_REQUIRES_CONFIRMATION = old; }
  });
});
