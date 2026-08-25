import { describe, expect, it } from "vitest";
import { assertSafeDeployUser } from "./deploySecurityPolicy";

describe("deploySecurityPolicy", () => {
  it("rejeita root", () => expect(() => assertSafeDeployUser("root")).toThrow(/root/));
});
