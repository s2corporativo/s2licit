import { describe, it, expect } from "vitest";
import { findUnquotedHashInDotenv } from "./env";

/**
 * Bug reproduzido de ponta a ponta: com `ADMIN_PASSWORD=Senha#2026` (sem
 * aspas) no `.env`, o dotenv carrega apenas `"Senha"` em `process.env` — sem
 * erro, sem aviso. O boot grava o hash de `"Senha"`, e a pessoa que digita a
 * senha real (`"Senha#2026"`) na tela de login nunca entra: `.env` e o hash
 * no banco "batem" entre si, só não com o que ela de fato digita. É
 * plausivelmente a causa de "e-mail e senha não aceitos para login" quando a
 * senha configurada tem `#` — comum em senha forte.
 */
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
