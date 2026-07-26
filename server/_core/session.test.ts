import { beforeAll, describe, expect, it } from "vitest";

// Garante segredo de sessão determinístico antes de importar o sdk.
beforeAll(() => {
  process.env.JWT_SECRET = "segredo-de-teste-suficientemente-longo-123456";
});

describe("sessão: assinar → verificar (round-trip)", () => {
  it("aceita a sessão mesmo sem VITE_APP_ID no ambiente", async () => {
    delete process.env.VITE_APP_ID; // simula a VPS (sem a variável da Manus)
    const { sdk } = await import("./sdk");
    const token = await sdk.createSessionToken("local:admin@example.com", { name: "Administrador" });
    const sessao = await sdk.verifySession(token);
    expect(sessao).not.toBeNull();
    expect(sessao?.openId).toBe("local:admin@example.com");
  });

  it("aceita a sessão mesmo quando o usuário não tem nome", async () => {
    const { sdk } = await import("./sdk");
    const token = await sdk.createSessionToken("local:sem-nome@example.com", { name: "" });
    const sessao = await sdk.verifySession(token);
    expect(sessao?.openId).toBe("local:sem-nome@example.com");
  });

  it("rejeita cookie ausente ou inválido", async () => {
    const { sdk } = await import("./sdk");
    expect(await sdk.verifySession(undefined)).toBeNull();
    expect(await sdk.verifySession("token-falso")).toBeNull();
  });
});
