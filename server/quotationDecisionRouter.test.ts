import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

describe("quotationDecision router", () => {
  it("expõe a superfície operacional esperada", () => {
    const procedures = Object.keys((appRouter as any)._def.procedures ?? {});
    for (const name of [
      "quotationDecision.summary",
      "quotationDecision.matchMemory",
      "quotationDecision.supplierRanking",
      "quotationDecision.maxPurchasePrice",
      "quotationDecision.resolve",
    ]) expect(procedures).toContain(name);
  });
});
