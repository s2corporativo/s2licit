import { describe, expect, it } from "vitest";
import { editorProcedure, protectedProcedure, router } from "./trpc";

const testRouter = router({
  read: protectedProcedure.query(() => "ok"),
  write: protectedProcedure.mutation(() => "saved"),
  editorRead: editorProcedure.query(() => "editor-ok"),
});

function caller(role: "user" | "viewer" | "editor" | "admin" | null) {
  return testRouter.createCaller({
    user: role
      ? {
          id: 1,
          openId: `test-${role}`,
          name: role,
          email: `${role}@example.com`,
          role,
        }
      : null,
  } as any);
}

describe("RBAC global do tRPC", () => {
  it("permite leitura para usuário autenticado", async () => {
    await expect(caller("viewer").read()).resolves.toBe("ok");
  });

  it("nega leitura para anônimo", async () => {
    await expect(caller(null).read()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it.each(["user", "viewer"] as const)("nega mutação para perfil %s", async (role) => {
    await expect(caller(role).write()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each(["editor", "admin"] as const)("permite mutação para perfil %s", async (role) => {
    await expect(caller(role).write()).resolves.toBe("saved");
  });

  it.each(["user", "viewer"] as const)(
    "nega consulta sensível de editor para perfil %s",
    async (role) => {
      await expect(caller(role).editorRead()).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
  );

  it.each(["editor", "admin"] as const)(
    "permite consulta sensível para perfil %s",
    async (role) => {
      await expect(caller(role).editorRead()).resolves.toBe("editor-ok");
    },
  );
});
