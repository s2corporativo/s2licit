import { describe, it, expect } from "vitest";
import { nextLockoutState, isAccountLocked, MAX_FAILED_LOGINS, LOCKOUT_MS } from "./localAuth";

const NOW = 1_700_000_000_000;

describe("nextLockoutState", () => {
  it("incrementa o contador sem bloquear antes do limite", () => {
    const r = nextLockoutState(0, NOW);
    expect(r.failedLoginAttempts).toBe(1);
    expect(r.lockedUntil).toBeNull();
  });

  it("bloqueia exatamente ao atingir o limite e zera o contador", () => {
    const r = nextLockoutState(MAX_FAILED_LOGINS - 1, NOW);
    expect(r.failedLoginAttempts).toBe(0);
    expect(r.lockedUntil).not.toBeNull();
    expect(r.lockedUntil!.getTime()).toBe(NOW + LOCKOUT_MS);
  });

  it("trata contador nulo/indefinido como zero", () => {
    expect(nextLockoutState(undefined as unknown as number, NOW).failedLoginAttempts).toBe(1);
  });
});

describe("isAccountLocked", () => {
  it("considera bloqueada quando lockedUntil está no futuro", () => {
    expect(isAccountLocked(new Date(NOW + 1000), NOW)).toBe(true);
  });

  it("não considera bloqueada quando expirou ou é nulo", () => {
    expect(isAccountLocked(new Date(NOW - 1000), NOW)).toBe(false);
    expect(isAccountLocked(null, NOW)).toBe(false);
    expect(isAccountLocked(undefined, NOW)).toBe(false);
  });

  it("aceita lockedUntil como string ISO (round-trip do banco)", () => {
    expect(isAccountLocked(new Date(NOW + 5000).toISOString() as unknown as Date, NOW)).toBe(true);
  });
});
