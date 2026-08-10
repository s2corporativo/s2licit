import { describe, expect, it } from "vitest";
import { installmentAmounts } from "./proposalLifecycleService";

describe("proposal installments", () => {
  it("distributes cents without losing or creating money", () => {
    const installments = installmentAmounts(10_000, 3);
    expect(installments).toEqual([3334, 3333, 3333]);
    expect(installments.reduce((sum, value) => sum + value, 0)).toBe(10_000);
  });

  it("blocks zero-value installments", () => {
    expect(() => installmentAmounts(2, 3)).toThrow();
  });
});
