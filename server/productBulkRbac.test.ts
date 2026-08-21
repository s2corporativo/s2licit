import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { makeTestUser } from "./testUtils";

function context(role: "user" | "editor" | "admin"): TrpcContext {
  return {
    user: makeTestUser({ id: 99, role }),
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("RBAC de operações massivas de produtos", () => {
  it("bloqueia usuário básico antes de executar edição/arquivo/reativação/merge", async () => {
    const caller = appRouter.createCaller(context("user"));
    await expect(caller.products.bulkUpdate({ ids: [1], manufacturer: "X" })).rejects.toBeInstanceOf(TRPCError);
    await expect(caller.products.bulkArchive({ ids: [1] })).rejects.toBeInstanceOf(TRPCError);
    await expect(caller.products.bulkReactivate({ ids: [1] })).rejects.toBeInstanceOf(TRPCError);
    await expect(caller.products.bulkResolveDuplicates({ ids: [1, 2] })).rejects.toBeInstanceOf(TRPCError);
    await expect(caller.productBulk.mergeDuplicateGroups({ groups: [{ masterId: 1, duplicateIds: [2] }] })).rejects.toBeInstanceOf(TRPCError);
  });
});
