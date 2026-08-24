import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

describe("quotationDecision router", () => {
  it("expõe decisão, aprendizado, proteção, lote e inteligência comercial", () => {
    const procedures = Object.keys((appRouter as any)._def.procedures ?? {});
    for (const name of [
      "quotationDecision.summary",
      "quotationDecision.matchMemory",
      "quotationDecision.supplierRanking",
      "quotationDecision.supplierScore",
      "quotationDecision.maxPurchasePrice",
      "quotationDecision.protection",
      "quotationDecision.commercialIntelligence",
      "quotationDecision.feedback",
      "quotationDecision.refreshPrices",
      "quotationDecision.bulkAction",
      "quotationDecision.resolve",
    ]) expect(procedures).toContain(name);
  });
});
