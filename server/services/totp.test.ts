import { describe, it, expect } from "vitest";
import { base32Encode, base32Decode, totp, verifyTotp, generateTotpSecret, otpauthUri } from "./totp";

// Vetor de teste da RFC 6238 (segredo ASCII "12345678901234567890", SHA1).
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("base32", () => {
  it("faz round-trip de bytes arbitrários", () => {
    const buf = Buffer.from([0, 1, 2, 250, 255, 128, 42]);
    expect(base32Decode(base32Encode(buf))).toEqual(buf);
  });

  it("codifica o segredo padrão da RFC 6238", () => {
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });
});

describe("totp — vetores da RFC 6238 (6 dígitos)", () => {
  it("T=59s → 287082", () => {
    expect(totp(RFC_SECRET, 59_000)).toBe("287082");
  });
  it("T=1111111109s → 081804", () => {
    expect(totp(RFC_SECRET, 1_111_111_109_000)).toBe("081804");
  });
  it("T=1234567890s → 005924", () => {
    expect(totp(RFC_SECRET, 1_234_567_890_000)).toBe("005924");
  });
});

describe("verifyTotp", () => {
  it("aceita o código do instante atual", () => {
    const t = 1_700_000_000_000;
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, t), t)).toBe(true);
  });

  it("tolera defasagem de ±1 passo (30s)", () => {
    const t = 1_700_000_000_000;
    const codigoAnterior = totp(RFC_SECRET, t - 30_000);
    expect(verifyTotp(RFC_SECRET, codigoAnterior, t)).toBe(true);
  });

  it("rejeita código errado, vazio ou não numérico", () => {
    const t = 1_700_000_000_000;
    expect(verifyTotp(RFC_SECRET, "000000", t, 0)).toBe(false);
    expect(verifyTotp(RFC_SECRET, "", t)).toBe(false);
    expect(verifyTotp(RFC_SECRET, "abc", t)).toBe(false);
    expect(verifyTotp("", "123456", t)).toBe(false);
  });
});

describe("generateTotpSecret / otpauthUri", () => {
  it("gera segredos base32 válidos e distintos", () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).not.toBe(b);
    expect(/^[A-Z2-7]+$/.test(a)).toBe(true);
    const t = 1_700_000_000_000;
    expect(verifyTotp(a, totp(a, t), t)).toBe(true);
  });

  it("monta a URI otpauth com emissor e conta", () => {
    const uri = otpauthUri("ABC234", { issuer: "Sistema S2", account: "admin@example.com" });
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("secret=ABC234");
    expect(uri).toContain("issuer=Sistema+S2");
  });
});
