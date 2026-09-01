import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestUser } from "../testUtils";
import { AUTO_LOGIN_OPEN_ID, getAutoLoginUser, resetAutoLoginCache } from "./autoLogin";
import { createContext } from "./context";

vi.mock("../db", () => ({ getDb: vi.fn() }));
vi.mock("./sdk", () => ({
  sdk: { authenticateRequest: vi.fn().mockRejectedValue(new Error("sem sessão")) },
}));

import { getDb } from "../db";

const autoUser = makeTestUser({
  id: 42,
  openId: AUTO_LOGIN_OPEN_ID,
  name: "Acesso Livre",
  loginMethod: "none",
  role: "admin",
});

/** Banco fake: cada chamada a select() consome o próximo resultado da fila. */
function makeFakeDb(selectResults: (typeof autoUser)[][]) {
  const inserted: unknown[] = [];
  let selectCalls = 0;
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => selectResults[Math.min(selectCalls++, selectResults.length - 1)],
        }),
      }),
    }),
    insert: () => ({
      values: async (v: unknown) => {
        inserted.push(v);
      },
    }),
  };
  return { db, inserted, selectCallCount: () => selectCalls };
}

beforeEach(() => {
  resetAutoLoginCache();
  vi.mocked(getDb).mockReset();
});

describe("getAutoLoginUser", () => {
  it("devolve o usuário existente e cacheia em memória", async () => {
    const { db, selectCallCount } = makeFakeDb([[autoUser]]);
    vi.mocked(getDb).mockResolvedValue(db as never);

    const first = await getAutoLoginUser();
    const second = await getAutoLoginUser();

    expect(first?.openId).toBe(AUTO_LOGIN_OPEN_ID);
    expect(first?.role).toBe("admin");
    expect(second).toBe(first);
    expect(selectCallCount()).toBe(1);
  });

  it("cria a linha quando ausente e devolve o registro criado", async () => {
    const { db, inserted } = makeFakeDb([[], [autoUser]]);
    vi.mocked(getDb).mockResolvedValue(db as never);

    const user = await getAutoLoginUser();

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ openId: AUTO_LOGIN_OPEN_ID, role: "admin" });
    expect(user?.id).toBe(42);
  });

  it("devolve null sem banco disponível", async () => {
    vi.mocked(getDb).mockResolvedValue(null as never);
    expect(await getAutoLoginUser()).toBeNull();
  });
});

describe("createContext sem sessão (login desativado)", () => {
  it("injeta o usuário de acesso livre como admin", async () => {
    const { db } = makeFakeDb([[autoUser]]);
    vi.mocked(getDb).mockResolvedValue(db as never);

    const ctx = await createContext({
      req: { protocol: "https", headers: {} },
      res: {},
    } as never);

    expect(ctx.user?.openId).toBe(AUTO_LOGIN_OPEN_ID);
    expect(ctx.user?.role).toBe("admin");
  });
});
