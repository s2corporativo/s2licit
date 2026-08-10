import { describe, expect, it } from "vitest";
import { splitLegalDocument } from "./legalDocAnalysisService";

describe("legal document chunking", () => {
  it("preserves overlap between adjacent chunks", () => {
    const text = "A".repeat(55_000) + "B".repeat(55_000);
    const result = splitLegalDocument(text);

    expect(result.chunks.length).toBeGreaterThan(1);
    expect(result.chunks[0].slice(-2_000)).toBe(result.chunks[1].slice(0, 2_000));
    expect(result.truncated).toBe(false);
  });

  it("reports incomplete coverage instead of silently dropping the tail", () => {
    const text = "X".repeat(55_000 * 20);
    const result = splitLegalDocument(text);

    expect(result.chunks).toHaveLength(16);
    expect(result.totalChunks).toBeGreaterThan(result.chunks.length);
    expect(result.truncated).toBe(true);
  });
});
