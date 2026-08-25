import { describe, expect, it } from "vitest";
import { nextRagBatch } from "./ragRetrievalPolicy";

describe("ragRetrievalPolicy", () => {
  it("pagina depois do último productId", () => {
    expect(nextRagBatch(123, 1000)).toEqual({ afterProductId: 123, limit: 1000 });
  });
});
