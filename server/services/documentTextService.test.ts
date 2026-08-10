import { describe, expect, it } from "vitest";
import { approximateDecodedBytes } from "./documentTextService";

describe("document base64 sizing", () => {
  it("calculates decoded bytes without materializing a sanitized copy", () => {
    expect(approximateDecodedBytes("TQ==")).toBe(1);
    expect(approximateDecodedBytes("TWE=")).toBe(2);
    expect(approximateDecodedBytes("TWFu")).toBe(3);
    expect(approximateDecodedBytes("/ + 8 =".replace(/ /g, ""))).toBe(2);
  });

  it("accepts whitespace between base64 groups", () => {
    expect(approximateDecodedBytes("T W\nF u\r\n")).toBe(3);
  });

  it("rejects padding in the middle and invalid characters", () => {
    expect(() => approximateDecodedBytes("T=Fu")).toThrow();
    expect(() => approximateDecodedBytes("TWFu$" )).toThrow();
  });
});
