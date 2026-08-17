vi.mock("./connectors/pncpConnector", () => ({
  buscarLicitacoesMultiModalidade: vi.fn(async () => ({ data: [], totalRegistros: 0, totalPaginas: 1 })),
  buscarItensPNCP: vi.fn(async () => []),
  buscarResultadosItemPNCP: vi.fn(async () => []),
  normalizePncpLicitacao: (lic: any) => lic,
}));
vi.mock("./connectors/comprasGovConnector", () => ({
  buscarLicitacoesComprasGov: vi.fn(async () => []),
}));
vi.mock("./connectors/fiemgConnector", () => ({
  buscarLicitacoesFiemg: vi.fn(async () => []),
}));
vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getDb: vi.fn(() => ({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            then: vi.fn(() => Promise.resolve([])),
          })),
        })),
      })),
    })),
  };
});
import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { makeTestUser } from "./testUtils";

/**
 * Testes dedicados do radar de licitações (pncpRadar).
 *
 * Cobertura:
 *  - RBAC: todas as procedures exigem autenticação (protectedProcedure).
 *  - Validação zod:
 *      * buscarOportunidades — uf deve ter 2 caracteres (AA-BR), modalidade válida;
 *      * itensDaLicitacao — cnpj 14 dígitos, ano 2020..2100, sequencial positivo;
 *      * precoHomologado — id positivo.
 *  - Fluxo buscarOportunidades com conectores mockados (PNCP/Compras.gov/FIEMG).
 *
 * As chamadas reais aos portais públicos (PNCP, Compras.gov, FIEMG) dependem de
 * serviços externos e são exercidas pela bateria de integração; aqui os
 * conectores são mockados para testes rápidos e determinísticos.
 */

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(user: AuthenticatedUser | null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const editorUser: AuthenticatedUser = makeTestUser({
  id: 4,
  email: "ed-teste@example.com",
  role: "editor",
});

describe("pncpRadar router — RBAC e procedures (mocked)", () => {
  it("expõe as procedures esperadas no router consolidado", () => {
    const procedures = Object.keys((appRouter as any)._def.procedures ?? {});
    expect(procedures).toContain("pncpRadar.buscarOportunidades");
    expect(procedures).toContain("pncpRadar.itensDaLicitacao");
    expect(procedures).toContain("pncpRadar.precoHomologado");
  });

  it("bloqueia busca sem autenticação", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(
      caller.pncpRadar.buscarOportunidades({
        uf: "MG",
        modalidades: [8, 6],
      }),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("rejeita UF com formato inválido", async () => {
    const caller = appRouter.createCaller(createContext(editorUser));
    await expect(
      caller.pncpRadar.buscarOportunidades({
        uf: "MINAS",
        modalidades: [8],
      }),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("rejeita modalidade não inteira no input", async () => {
    const caller = appRouter.createCaller(createContext(editorUser));
    await expect(
      (caller.pncpRadar.buscarOportunidades as any)({
        uf: "MG",
        modalidades: [8.5],
      }),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("executa busca com UF válida e retorna array (conectores mockados)", async () => {
    const caller = appRouter.createCaller(createContext(editorUser));
    const result = await caller.pncpRadar.buscarOportunidades({
      uf: "MG",
      modalidades: [8, 6],
      fontes: ["pncp"],
    });
    expect(result).toHaveProperty("oportunidades");
    expect(Array.isArray(result.oportunidades)).toBe(true);
  });
});

describe("pncpRadar router — validação de itens da licitação", () => {
  it("rejeita CNPJ com menos de 14 dígitos", async () => {
    const caller = appRouter.createCaller(createContext(editorUser));
    await expect(
      caller.pncpRadar.itensDaLicitacao({
        cnpj: "1234567800",
        ano: 2026,
        sequencial: 123,
      }),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("rejeita ano fora do intervalo 2020..2100", async () => {
    const caller = appRouter.createCaller(createContext(editorUser));
    await expect(
      caller.pncpRadar.itensDaLicitacao({
        cnpj: "12345678000199",
        ano: 2010,
        sequencial: 123,
      }),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("rejeita sequencial não positivo em itensDaLicitacao", async () => {
    const caller = appRouter.createCaller(createContext(editorUser));
    await expect(
      caller.pncpRadar.itensDaLicitacao({
        cnpj: "12345678000199",
        ano: 2026,
        sequencial: 0,
      }),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("rejeita precoHomologado com numeroItem não positivo", async () => {
    const caller = appRouter.createCaller(createContext(editorUser));
    await expect(
      caller.pncpRadar.precoHomologado({
        cnpj: "12345678000199",
        ano: 2026,
        sequencial: 123,
        numeroItem: 0,
      }),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("consulta itens com input válido e retorna array (db mockado)", async () => {
    const caller = appRouter.createCaller(createContext(editorUser));
    const result = await caller.pncpRadar.itensDaLicitacao({
      cnpj: "12345678000199",
      ano: 2026,
      sequencial: 123,
    });
    expect(result).toHaveProperty("itens");
    expect(Array.isArray(result.itens)).toBe(true);
  });
});
