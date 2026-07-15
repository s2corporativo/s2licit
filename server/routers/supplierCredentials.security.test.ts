import { describe, expect, it } from "vitest";
import {
  MASKED_CREDENTIAL_VALUE,
  normalizeSupplierPasswordUpdate,
  sanitizeSupplierCredential,
} from "./supplierCredentials";

describe("segurança das credenciais de fornecedores", () => {
  it("nunca serializa a senha descriptografada para o cliente", () => {
    const credential = sanitizeSupplierCredential({
      id: 1,
      email: "compras@example.com",
      password: "senha-real-super-secreta",
    });

    expect(credential.password).toBe(MASKED_CREDENTIAL_VALUE);
    expect(JSON.stringify(credential)).not.toContain("senha-real-super-secreta");
  });

  it("mantém campo vazio quando não existe senha armazenada", () => {
    expect(sanitizeSupplierCredential({ password: "" }).password).toBe("");
  });

  it("interpreta a máscara da interface como manter a senha atual", () => {
    expect(normalizeSupplierPasswordUpdate(MASKED_CREDENTIAL_VALUE)).toBeUndefined();
  });

  it("ignora atualização vazia e preserva uma nova senha real", () => {
    expect(normalizeSupplierPasswordUpdate("   ")).toBeUndefined();
    expect(normalizeSupplierPasswordUpdate(" nova-senha ")).toBe("nova-senha");
  });
});
