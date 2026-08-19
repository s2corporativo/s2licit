import { describe, expect, it } from "vitest";
import { canAutoConfirmQuotationMatch } from "./quotationAutomationPolicy";

describe("quotationAutomationPolicy", () => {
  it("não auto-confirma nome mesmo com score alto", () => {
    expect(canAutoConfirmQuotationMatch({ matchMethod: "nome", matchScore: 0.999, productId: 1, cost: 10 })).toBe(false);
  });
  it("auto-confirma CATMAT com custo", () => {
    expect(canAutoConfirmQuotationMatch({ matchMethod: "catmat", matchScore: 1, productId: 1, cost: 10 })).toBe(true);
  });
});
