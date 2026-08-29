import { describe, it, expect } from "vitest";
import {
  AUTH_DISABLED_EMAIL,
  AUTH_DISABLED_NAME,
  AUTH_DISABLED_OPEN_ID,
} from "./authDisabled";

describe("AUTH_DISABLED", () => {
  it("expõe a flag authDisabled como boolean", async () => {
    const { ENV } = await import("./env");
    expect(typeof ENV.authDisabled).toBe("boolean");
  });

  it("a identidade do bypass é marcada de forma inequívoca na auditoria", () => {
    // O rastro precisa deixar claro que a ação veio do modo sem autenticação,
    // em vez de se passar por uma pessoa real.
    expect(AUTH_DISABLED_NAME).toBe("[AUTH_DISABLED]");
    expect(AUTH_DISABLED_OPEN_ID).toBe("auth-disabled-local");
    // .invalid é reservado por RFC 2606: nunca colide com um e-mail real nem é
    // roteável, então o usuário do bypass não pode receber mensagem do sistema.
    expect(AUTH_DISABLED_EMAIL.endsWith(".invalid")).toBe(true);
  });

  it("não usa id sintético: o bypass precisa de uma linha real de users", async () => {
    // Regressão: com id -1 todo INSERT em coluna com FK para users.id falhava
    // com errno 1452 (audit_logs, capture_batches, agenticseek_buscas...), e
    // como o fluxo grava em duas tabelas sem transação a linha de negócio ficava
    // gravada enquanto a auditoria falhava — HTTP 500 e nenhum rastro.
    const src = await import("node:fs").then(fs =>
      fs.readFileSync(new URL("./authDisabled.ts", import.meta.url), "utf8")
    );
    expect(src).toContain("users.openId");
    expect(src).not.toMatch(/id:\s*-1/);
  });

  it("a guarda de produção existe e cita AUTH_DISABLED", async () => {
    const src = await import("node:fs").then(fs =>
      fs.readFileSync(new URL("./env.ts", import.meta.url), "utf8")
    );
    expect(src).toContain("AUTH_DISABLED=true não é permitido em produção");
    expect(src).toContain("ENV.authDisabled && ENV.isProduction");
  });
});
