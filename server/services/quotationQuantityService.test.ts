import { describe, expect, it } from "vitest";
import { normalizeProposalQuantity } from "./quotationQuantityService";

describe("normalizeProposalQuantity", () => {
  it("preserva quantidade inteira positiva", () => {
    expect(normalizeProposalQuantity(7)).toBe(7);
  });

  it("arredonda quantidade fracionária para cima", () => {
    expect(normalizeProposalQuantity(1.01)).toBe(2);
    expect(normalizeProposalQuantity(1.4)).toBe(2);
    expect(normalizeProposalQuantity(2.99)).toBe(3);
  });

  it("nunca retorna menos de uma unidade", () => {
    expect(normalizeProposalQuantity(0)).toBe(1);
    expect(normalizeProposalQuantity(-2)).toBe(1);
    expect(normalizeProposalQuantity(Number.NaN)).toBe(1);
  });
});
