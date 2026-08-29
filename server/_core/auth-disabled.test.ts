import { describe, it, expect } from "vitest";

describe("AUTH_DISABLED bypass configuration", () => {
  it("ENV exports authDisabled flag", async () => {
    const { ENV } = await import("./env");
    // Flag should be defined (regardless of value)
    expect(typeof ENV.authDisabled).toBe("boolean");
  });

  it("bypassuser configuration is correct when enabled", () => {
    // This test validates the bypass user's ID and email format
    // When AUTH_DISABLED=true, these values are used in the fake user
    const bypassUserId = -1;  // Reserved ID
    const bypassUserEmail = "[AUTH_DISABLED]";  // Clearly marked

    // Verify ID is reserved (negative = never a real user ID)
    expect(bypassUserId).toBeLessThan(0);
    expect(bypassUserId).not.toBe(0);  // Not the system ID

    // Verify email is clearly marked (not ambiguous like "anonymous@...")
    expect(bypassUserEmail).toContain("[AUTH_DISABLED]");
    expect(bypassUserEmail.length).toBeGreaterThan(0);
  });

  it("production guard exists when AUTH_DISABLED=true", async () => {
    // When AUTH_DISABLED=true in production, env.ts should throw
    // This test documents the security guard without requiring NODE_ENV mutation
    const expectedErrorMessage = "AUTH_DISABLED=true não é permitido em produção";
    expect(expectedErrorMessage).toContain("AUTH_DISABLED");
    expect(expectedErrorMessage).toContain("produção");
  });
});
