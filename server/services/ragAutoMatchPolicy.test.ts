import { describe, expect, it } from "vitest";
import { mayAutoMatchRag } from "./ragAutoMatchPolicy";

describe("ragAutoMatchPolicy", () => {
  it("bloqueia score alto quando requisito técnico diverge", () => {
    const r = mayAutoMatchRag({
      semanticScore: 0.99,
      threshold: 0.9,
      request: { tipoCatalogo: "medicamento_humano", activeIngredient: "x", concentration: "10mg" },
      candidate: { activeIngredient: "x", concentration: "20mg" },
    });
    expect(r.autoMatch).toBe(false);
  });
});
