import { describe, expect, it } from "vitest";
import { ragSemanticScoreAloneMayAutoMatch } from "../services/ragSafetyDefaults";

describe("RAG safety", () => {
  it("não permite auto-match apenas por score", () => {
    expect(ragSemanticScoreAloneMayAutoMatch()).toBe(false);
  });
});
