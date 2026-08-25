import { describe, expect, it } from "vitest";
import { assertMigrationImmutable } from "./migrationImmutabilityPolicy";

describe("migrationImmutabilityPolicy", () => {
  it("falha quando hash aplicado muda", () => {
    expect(() => assertMigrationImmutable(
      { createdAt: 1, hash: "abc" },
      { createdAt: 1, hash: "def" },
    )).toThrow(/drift/i);
  });
});
