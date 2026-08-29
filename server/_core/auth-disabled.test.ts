import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
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

  // env.ts decide no import e ENV é singleton: cada combinação precisa de um
  // processo próprio para ser observada de verdade.
  function bypassAtivoCom(nodeEnv: string | undefined): "ativo" | "inativo" | "bloqueado" {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      AUTH_DISABLED: "true",
      JWT_SECRET: "x".repeat(40),
      DATABASE_URL: "mysql://u:p@127.0.0.1:3306/x",
    };
    if (nodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = nodeEnv;
    const r = spawnSync(
      process.execPath,
      ["--import", "tsx", "-e",
       "import('./server/_core/env.ts').then(m=>console.log('R='+m.ENV.authDisabled)).catch(()=>console.log('R=throw'))"],
      { env, encoding: "utf8", cwd: process.cwd() }
    );
    const out = `${r.stdout}${r.stderr}`;
    if (/R=throw/.test(out)) return "bloqueado";
    return /R=true/.test(out) ? "ativo" : "inativo";
  }

  it("libera o bypass por lista de permissão: só com NODE_ENV=development", () => {
    expect(bypassAtivoCom("development")).toBe("ativo");
    // Regressão: a guarda antiga só barrava a string exata "production", então
    // staging, um typo e — o caso mais provável — NODE_ENV ausente subiam o
    // sistema com admin aberto e sem nenhum aviso.
    expect(bypassAtivoCom("staging")).toBe("inativo");
    expect(bypassAtivoCom("prod")).toBe("inativo");
    expect(bypassAtivoCom(undefined)).toBe("inativo");
  }, 60_000);

  it("em produção o pedido é erro fatal, não um bypass silencioso", () => {
    expect(bypassAtivoCom("production")).toBe("bloqueado");
  }, 30_000);

  it("a guarda de produção existe e cita AUTH_DISABLED", async () => {
    const src = await import("node:fs").then(fs =>
      fs.readFileSync(new URL("./env.ts", import.meta.url), "utf8")
    );
    expect(src).toContain("AUTH_DISABLED=true não é permitido em produção");
    expect(src).toContain("authDisabledRequested && isProduction");
    // A conjunção é o coração do fail-closed: se alguém a afrouxar, este teste cai.
    expect(src).toContain("authDisabledRequested && isDevelopment");
  });
});
