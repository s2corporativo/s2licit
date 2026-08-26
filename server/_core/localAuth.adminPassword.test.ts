import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regressão do incidente de 25/08/2026: o administrador trocava a senha pela
 * tela de usuários e, no restart seguinte, voltava a ser barrado — o boot
 * reescrevia o hash com ADMIN_PASSWORD em silêncio. Ao insistir com a senha
 * nova, caía no bloqueio por tentativas inválidas.
 */

const updateCalls: Array<Record<string, unknown>> = [];
const insertCalls: Array<Record<string, unknown>> = [];
let usuarioExistente: Record<string, unknown> | undefined;

const db = {
  select: () => ({
    from: () => ({ where: () => ({ limit: async () => (usuarioExistente ? [usuarioExistente] : []) }) }),
  }),
  update: () => ({
    set: (valores: Record<string, unknown>) => {
      updateCalls.push(valores);
      return { where: async () => undefined };
    },
  }),
  insert: () => ({
    values: async (valores: Record<string, unknown>) => {
      insertCalls.push(valores);
    },
  }),
};

vi.mock("../db", () => ({ getDb: vi.fn(async () => db) }));
vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// vi.mock é içado acima das declarações — vi.hoisted mantém o objeto acessível.
const ENV_MOCK = vi.hoisted(() => ({
  adminEmail: "adm@vetmg.com.br",
  adminPassword: "SenhaDoEnv123",
  adminPasswordForceReset: false,
}));
vi.mock("./env", () => ({ ENV: ENV_MOCK }));

import { ensureAdminUser } from "./localAuth";
import { credentialEncryptionService } from "../services/credentialEncryptionService";

const HASH_DA_SENHA_NOVA = credentialEncryptionService.hashPassword("SenhaTrocadaNaInterface");

beforeEach(() => {
  updateCalls.length = 0;
  insertCalls.length = 0;
  ENV_MOCK.adminPasswordForceReset = false;
  usuarioExistente = undefined;
});

describe("ensureAdminUser", () => {
  it("cria o administrador quando ele ainda não existe", async () => {
    await ensureAdminUser();
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].email).toBe("adm@vetmg.com.br");
    expect(insertCalls[0].role).toBe("admin");
  });

  it("define a senha de um admin que ainda não tem hash e já libera a conta", async () => {
    usuarioExistente = { id: 1, passwordHash: null };
    await ensureAdminUser();
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].passwordHash).toEqual(expect.stringContaining("scrypt:"));
    expect(updateCalls[0].failedLoginAttempts).toBe(0);
    expect(updateCalls[0].lockedUntil).toBeNull();
  });

  it("PRESERVA a senha trocada na interface — não reescreve o hash no boot", async () => {
    usuarioExistente = { id: 1, passwordHash: HASH_DA_SENHA_NOVA };
    await ensureAdminUser();
    expect(updateCalls).toHaveLength(0);
  });

  it("sobrescreve a senha somente com ADMIN_PASSWORD_FORCE_RESET=true, e desbloqueia junto", async () => {
    usuarioExistente = { id: 1, passwordHash: HASH_DA_SENHA_NOVA };
    ENV_MOCK.adminPasswordForceReset = true;
    await ensureAdminUser();
    expect(updateCalls).toHaveLength(1);
    const set = updateCalls[0];
    expect(credentialEncryptionService.verifyPassword("SenhaDoEnv123", set.passwordHash as string)).toBe(true);
    expect(set.failedLoginAttempts).toBe(0);
    expect(set.lockedUntil).toBeNull();
  });

  it("não faz nada quando a senha em uso já é a do .env", async () => {
    usuarioExistente = { id: 1, passwordHash: credentialEncryptionService.hashPassword("SenhaDoEnv123") };
    await ensureAdminUser();
    expect(updateCalls).toHaveLength(0);
  });
});
