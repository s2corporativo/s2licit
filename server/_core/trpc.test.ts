import { describe, expect, it } from "vitest";
import type { User } from "../../drizzle/schema";
import type { TrpcContext } from "./context";
import { protectedProcedure, router } from "./trpc";

const permissionsRouter = router({
  read: protectedProcedure.query(() => "read-ok"),
  write: protectedProcedure.mutation(() => "write-ok"),
});

function userWithRole(role: User["role"]): User {
  const now = new Date();
  return {
    id: 1,
    openId: `test:${role}`,
    name: "Usuário de teste",
    email: null,
    loginMethod: "test",
    passwordHash: null,
    role,
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
}

function callerFor(role: User["role"] | null) {
  const context: TrpcContext = {
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    user: role ? userWithRole(role) : null,
  };
  return permissionsRouter.createCaller(context);
}

describe("invariante central de permissões tRPC", () => {
  it("bloqueia consultas sem autenticação", async () => {
    await expect(callerFor(null).read()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("permite consulta para Viewer", async () => {
    await expect(callerFor("viewer").read()).resolves.toBe("read-ok");
  });

  it.each(["user", "viewer"] as const)("bloqueia mutação para %s", async role => {
    await expect(callerFor(role).write()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each(["editor", "admin"] as const)("permite mutação para %s", async role => {
    await expect(callerFor(role).write()).resolves.toBe("write-ok");
  });
});
