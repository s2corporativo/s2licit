import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  protectSupplierSessionValue,
  revealSupplierSessionValue,
} from "./supplierSessionService";

const previousEncryptionKey = process.env.ENCRYPTION_KEY;

beforeAll(() => {
  process.env.ENCRYPTION_KEY = "test-session-encryption-key-with-more-than-32-characters";
});

afterAll(() => {
  if (previousEncryptionKey === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = previousEncryptionKey;
});

describe("criptografia de sessões de fornecedores", () => {
  it("protege o valor antes de persistir e restaura para uso interno", () => {
    const plaintext = '{"session":"segredo"}';
    const protectedValue = protectSupplierSessionValue(plaintext);

    expect(protectedValue).toMatch(/^enc:v1:/);
    expect(protectedValue).not.toContain(plaintext);
    expect(revealSupplierSessionValue(protectedValue)).toBe(plaintext);
  });

  it("mantém compatibilidade com registro legado em texto puro", () => {
    expect(revealSupplierSessionValue("cookie-legado=abc")).toBe("cookie-legado=abc");
  });

  it("trata valores ausentes sem gerar ciphertext inválido", () => {
    expect(protectSupplierSessionValue(undefined)).toBeNull();
    expect(revealSupplierSessionValue(null)).toBeNull();
  });
});
