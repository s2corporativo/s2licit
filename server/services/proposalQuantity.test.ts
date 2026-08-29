import { describe, expect, it } from "vitest";
import {
  isValidProposalQuantity,
  parseProposalQuantity,
} from "./proposalQuantity";

describe("proposal quantity contract", () => {
  it("preserva quantidades inteiras e fracionárias", () => {
    expect(parseProposalQuantity(7)).toBe(7);
    expect(parseProposalQuantity(1.4)).toBe(1.4);
    expect(parseProposalQuantity(0.5)).toBe(0.5);
    expect(parseProposalQuantity("2.125")).toBe(2.125);
  });

  it("aceita a precisão contratual de quatro casas", () => {
    expect(parseProposalQuantity(0.0001)).toBe(0.0001);
    expect(parseProposalQuantity(12.3456)).toBe(12.3456);
  });

  it("rejeita valores que exigiriam arredondamento silencioso", () => {
    expect(() => parseProposalQuantity(1.23456)).toThrow(/4 casas decimais/);
  });

  it("rejeita zero, negativos e não finitos", () => {
    for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isValidProposalQuantity(value)).toBe(false);
    }
  });
});
