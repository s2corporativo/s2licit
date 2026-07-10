import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const captureMocks = vi.hoisted(() => ({
  createCaptureBatch: vi.fn(),
  getCaptureBatch: vi.fn(),
  listCaptureBatches: vi.fn(),
  updateCapturedProductStatus: vi.fn(),
}));

vi.mock("./services/intelligentCaptureService", () => captureMocks);

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(user: AuthenticatedUser | null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const editorUser: AuthenticatedUser = {
  id: 7,
  openId: "editor-open-id",
  email: "editor@example.com",
  name: "Editor",
  loginMethod: "google",
  role: "editor",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

describe("intelligentCaptureRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lista lotes capturados em endpoint público", async () => {
    captureMocks.listCaptureBatches.mockResolvedValue([{ id: 1, sourceType: "xml" }]);

    const caller = appRouter.createCaller(createContext(null));
    const result = await caller.intelligentCapture.listBatches({ limit: 5 });

    expect(captureMocks.listCaptureBatches).toHaveBeenCalledWith(5);
    expect(result).toEqual([{ id: 1, sourceType: "xml" }]);
  });

  it("bloqueia criação de lote sem autenticação", async () => {
    const caller = appRouter.createCaller(createContext(null));

    await expect(
      caller.intelligentCapture.createBatch({
        sourceType: "xml",
        products: [{ name: "Produto teste" }],
      }),
    ).rejects.toBeInstanceOf(TRPCError);

    expect(captureMocks.createCaptureBatch).not.toHaveBeenCalled();
  });

  it("cria lote autenticado usando o usuário da sessão como fallback", async () => {
    captureMocks.createCaptureBatch.mockResolvedValue({ batch: { id: 55 }, products: [], logs: [] });

    const caller = appRouter.createCaller(createContext(editorUser));
    const result = await caller.intelligentCapture.createBatch({
      sourceType: "xml",
      sourceLabel: "Arquivo XML de fornecedor",
      products: [{ name: "Vacina XYZ", duplicateSignal: "possible" }],
    });

    expect(captureMocks.createCaptureBatch).toHaveBeenCalledWith({
      sourceType: "xml",
      sourceLabel: "Arquivo XML de fornecedor",
      products: [{ name: "Vacina XYZ", duplicateSignal: "possible" }],
      createdByUserId: 7,
    });
    expect(result.batch.id).toBe(55);
  });
});
