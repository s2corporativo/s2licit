/**
 * totp.ts
 *
 * Autenticação multifator por TOTP (RFC 6238 / HOTP RFC 4226), implementada
 * com node:crypto — sem dependência externa. Base32 (RFC 4648) para o segredo.
 *
 * Puro e testável; validado contra os vetores de teste da RFC 6238.
 */

import { createHmac, randomBytes } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str: string): Buffer {
  const clean = str.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Gera um segredo TOTP aleatório em Base32 (20 bytes = 160 bits). */
export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

/** HOTP (RFC 4226): código de `digits` dígitos para um contador. */
export function hotp(secretBase32: string, counter: number, digits = 6): string {
  const key = base32Decode(secretBase32);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(bin % 10 ** digits).padStart(digits, "0");
}

/** TOTP (RFC 6238): código para o instante `timeMs` (epoch ms). */
export function totp(secretBase32: string, timeMs: number, step = 30, digits = 6): string {
  const counter = Math.floor(timeMs / 1000 / step);
  return hotp(secretBase32, counter, digits);
}

/**
 * Verifica um token TOTP, tolerando ±`window` passos de defasagem de relógio.
 */
export function verifyTotp(
  secretBase32: string,
  token: string,
  timeMs: number,
  window = 1,
  step = 30,
  digits = 6,
): boolean {
  if (!secretBase32 || !token || !/^\d+$/.test(token)) return false;
  const alvo = token.padStart(digits, "0");
  const counter = Math.floor(timeMs / 1000 / step);
  for (let w = -window; w <= window; w++) {
    if (hotp(secretBase32, counter + w, digits) === alvo) return true;
  }
  return false;
}

/** URI otpauth:// para configurar em apps autenticadores (Google Auth, Authy). */
export function otpauthUri(secretBase32: string, opts: { issuer: string; account: string }): string {
  const label = encodeURIComponent(`${opts.issuer}:${opts.account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer: opts.issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
