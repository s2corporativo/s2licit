import { describe, it, expect } from "vitest";
import { findUnquotedHashInDotenv } from "./env";

describe("findUnquotedHashInDotenv", () => {
  it("aponta uma chave cujo valor tem # sem aspas", () => {
    const raw = "ADMIN_PASSWORD=SenhaAdmin#2026\n";
    expect(findUnquotedHashInDotenv(raw)).toEqual(["ADMIN_PASSWORD"]);
  });

  it("não aponta um valor com # protegido por aspas duplas ou simples", () => {
    const raw = [
      'ADMIN_PASSWORD="SenhaAdmin#2026"',
      "OUTRA_CHAVE='valor#comHash'",
    ].join("\n");
    expect(findUnquotedHashInDotenv(raw)).toEqual([]);
  });

  it("ignora linhas de comentário e valores sem #", () => {
    const raw = [
      "# comentário com # dentro, não é uma variável",
      "SAFE_VALUE=nada_de_especial",
      "",
    ].join("\n");
    expect(findUnquotedHashInDotenv(raw)).toEqual([]);
  });

  it("relata todas as chaves afetadas, na ordem em que aparecem", () => {
    const raw = [
      "JWT_SECRET=abc#123",
      "DATABASE_URL=mysql://user:pass@host/db",
      "ENCRYPTION_KEY=xyz#789",
    ].join("\n");
    expect(findUnquotedHashInDotenv(raw)).toEqual(["JWT_SECRET", "ENCRYPTION_KEY"]);
  });
});
