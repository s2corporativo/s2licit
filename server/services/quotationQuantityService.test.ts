import { describe, expect, it } from "vitest";
import { preserveProposalQuantity } from "./quotationQuantityService";

describe("preserveProposalQuantity", () => {
  it("preserva quantidade inteira", () => {
    expect(preserveProposalQuantity(7)).toBe(7);
  });

  it("preserva quantidade fracionária sem subfornecer nem inflar", () => {
    expect(preserveProposalQuantity(1.4)).toBe(1.4);
    expect(preserveProposalQuantity(2.75)).toBe(2.75);
    expect(preserveProposalQuantity(0.125)).toBe(0.125);
    expect(preserveProposalQuantity(0.0001)).toBe(0.0001);
  });

  it("rejeita precisão acima do contrato do banco em vez de arredondar", () => {
    expect(() => preserveProposalQuantity(1.23456)).toThrow(/4 casas decimais/);
  });

  it("rejeita quantidade inválida em vez de inventar valor", () => {
    expect(() => preserveProposalQuantity(0)).toThrow(/Quantidade/);
    expect(() => preserveProposalQuantity(-2)).toThrow(/Quantidade/);
    expect(() => preserveProposalQuantity(Number.NaN)).toThrow(/Quantidade/);
    expect(() => preserveProposalQuantity(Number.POSITIVE_INFINITY)).toThrow(/Quantidade/);
  });
});
