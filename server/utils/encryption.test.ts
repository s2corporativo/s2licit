import { beforeAll, describe, expect, it } from "vitest";
import { decryptPassword, encryptPassword } from "./encryption";

beforeAll(() => {
  process.env.ENCRYPTION_KEY = "chave-de-teste-suficientemente-longa";
});

describe("encryptPassword/decryptPassword", () => {
  it("faz round-trip de um valor cifrado", () => {
    const cifrado = encryptPassword("minha-senha-secreta");
    expect(cifrado.split(":")).toHaveLength(3);
    expect(decryptPassword(cifrado)).toBe("minha-senha-secreta");
  });

  it("devolve e-mail em texto plano inalterado (legado sem cifra)", () => {
    // '@' e '.' não são base64 — não pode ser decodificado em lixo binário
    expect(decryptPassword("usuario@fornecedor.com.br")).toBe("usuario@fornecedor.com.br");
  });

  it("decodifica base64 legado válido que faz round-trip", () => {
    const legado = Buffer.from("senha-antiga", "utf8").toString("base64");
    expect(decryptPassword(legado)).toBe("senha-antiga");
  });

  it("devolve inalterada string alfanumérica que não é base64 intencional", () => {
    // "Fornecedor01" é base64-decodável mas não round-tripa com padding
    const valor = "Fornecedor01!";
    expect(decryptPassword(valor)).toBe(valor);
  });
});
