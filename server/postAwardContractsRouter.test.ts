import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const serviceMocks = vi.hoisted(() => ({
  listPostAwardContracts: vi.fn(),
  getPostAwardContract: vi.fn(),
  getContractsDashboard: vi.fn(),
  createPostAwardContract: vi.fn(),
  updatePostAwardContract: vi.fn(),
  registerContractMovement: vi.fn(),
  registerContractReajuste: vi.fn(),
}));

vi.mock("./services/postAwardContractsService", () => serviceMocks);

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(user: AuthenticatedUser | null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const adminUser: AuthenticatedUser = {
  id: 1,
  openId: "admin-open-id",
  email: "admin@example.com",
  name: "Administrador",
  loginMethod: "google",
  role: "admin",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

describe("postAwardContractsRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna dashboard do módulo de contratos para usuário autenticado", async () => {
    serviceMocks.getContractsDashboard.mockResolvedValue({
      totalContratos: 3,
      contratosAtivos: 2,
      saldoTotal: "15000.00",
      valorGlobal: "40000.00",
      proximosVencimentos: [],
    });

    const caller = appRouter.createCaller(createContext(adminUser));
    const result = await caller.postAwardContracts.dashboard();

    expect(serviceMocks.getContractsDashboard).toHaveBeenCalledTimes(1);
    expect(result.totalContratos).toBe(3);
    expect(result.contratosAtivos).toBe(2);
  });

  it("lista contratos com filtros para usuário autenticado", async () => {
    serviceMocks.listPostAwardContracts.mockResolvedValue([
      { id: 10, contractNumber: "CT-001/2026", status: "active" },
    ]);

    const caller = appRouter.createCaller(createContext(adminUser));
    const result = await caller.postAwardContracts.list({ status: "active", orgId: 7 });

    expect(serviceMocks.listPostAwardContracts).toHaveBeenCalledWith({ status: "active", orgId: 7 });
    expect(result).toHaveLength(1);
  });

  it("bloqueia criação de contrato sem autenticação", async () => {
    const caller = appRouter.createCaller(createContext(null));

    await expect(
      caller.postAwardContracts.create({ contractNumber: "CT-002/2026" }),
    ).rejects.toBeInstanceOf(TRPCError);

    expect(serviceMocks.createPostAwardContract).not.toHaveBeenCalled();
  });

  it("permite criação autenticada de contrato", async () => {
    serviceMocks.createPostAwardContract.mockResolvedValue(99);

    const caller = appRouter.createCaller(createContext(adminUser));
    const result = await caller.postAwardContracts.create({
      contractNumber: "CT-099/2026",
      status: "draft",
      valueGlobal: "1000.00",
    });

    expect(serviceMocks.createPostAwardContract).toHaveBeenCalledWith({
      contractNumber: "CT-099/2026",
      status: "draft",
      valueGlobal: "1000.00",
    });
    expect(result).toBe(99);
  });
});
