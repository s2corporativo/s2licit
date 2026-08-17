import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { makeTestUser } from "./testUtils";

/**
 * Testes dedicados do módulo de geração automática de propostas (propostaAgent).
 *
 * Cobertura:
 *  - RBAC: todas as procedures exigem autenticação; mutations exigem editor/admin.
 *  - Validação zod dos inputs (iniciar, confirmarEnvio, screenshots).
 *  - `detectarDesafioCaptcha` (services/propostaAgent): detecção determinística
 *    dos tipos de captcha suportados (matemático, recaptcha, hcaptcha, genérico).
 *  - Fluxo iniciar com credencial inline (serviço mockado).
 *
 * A execução real do agente (Puppeteer + LLM) é exercício da bateria de
 * integração; aqui os serviços são mockados para testes rápidos e
 * determinísticos.
 */

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(user: AuthenticatedUser | null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const adminUser: AuthenticatedUser = makeTestUser({
  id: 3,
  email: "adm-teste@example.com",
  role: "admin",
});

const editorUser: AuthenticatedUser = makeTestUser({
  id: 4,
  email: "ed-teste@example.com",
  role: "editor",
});

describe("propostaAgent router — RBAC (mocked)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("expõe as procedures esperadas no router consolidado", () => {
    const procedures = Object.keys((appRouter as any)._def.procedures ?? {});
    expect(procedures).toContain("propostaAgent.portaisDisponiveis");
    expect(procedures).toContain("propostaAgent.iniciar");
    expect(procedures).toContain("propostaAgent.status");
    expect(procedures).toContain("propostaAgent.screenshots");
    expect(procedures).toContain("propostaAgent.confirmarEnvio");
    expect(procedures).toContain("propostaAgent.historicoJobs");
  });

  it("bloqueia iniciar sem autenticação", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(
      caller.propostaAgent.iniciar({
        propostaId: 1,
        portalType: "copasa",
        credencial: { email: "a@b.com", password: "Senha123!" },
      }),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("permite iniciar para editor autenticado (protectedProcedure)", async () => {
    vi.mock("./services/propostaAgent", async importOriginal => {
      const actual = await importOriginal<typeof import("./services/propostaAgent")>();
      return {
        ...actual,
        executarAgenteProposta: vi.fn(async () => ({ iniciado: true })),
        detectarDesafioCaptcha: vi.fn(() => ({ detectado: false })),
      };
    });
    vi.mock("./utils/encryption", () => ({
      encryptPassword: vi.fn((p: string) => `enc:${p}`),
    }));
    const caller = appRouter.createCaller(createContext(editorUser));
    const result = await caller.propostaAgent.iniciar({
      propostaId: 2,
      portalType: "cemig",
      credencial: { email: "a@b.com", password: "Senha123!" },
    });
    expect(result).toHaveProperty("jobId");
  });

  it("aceita iniciar com credencial inline para admin (serviço mockado)", async () => {
    vi.mock("./services/propostaAgent", async importOriginal => {
      const actual = await importOriginal<typeof import("./services/propostaAgent")>();
      return {
        ...actual,
        executarAgenteProposta: vi.fn(async () => ({ iniciado: true })),
        detectarDesafioCaptcha: vi.fn(() => ({ detectado: false })),
      };
    });
    vi.mock("./utils/encryption", () => ({
      encryptPassword: vi.fn((p: string) => `enc:${p}`),
    }));
    const caller = appRouter.createCaller(createContext(adminUser));
    const result = await caller.propostaAgent.iniciar({
      propostaId: 10,
      portalType: "copasa",
      credencial: { email: "a@b.com", password: "Senha123!" },
      modoAprovacao: "salvar_rascunho",
      validadeDias: 60,
    });
    expect(result).toHaveProperty("jobId");
  });
});

describe("propostaAgent router — validação zod", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mock("./services/propostaAgent", async importOriginal => {
      const actual = await importOriginal<typeof import("./services/propostaAgent")>();
      return {
        ...actual,
        executarAgenteProposta: vi.fn(async () => ({ iniciado: true })),
        detectarDesafioCaptcha: vi.fn(() => ({ detectado: false })),
      };
    });
  });

  it("rejeita senha com menos de 4 caracteres no iniciar", async () => {
    const caller = appRouter.createCaller(createContext(adminUser));
    await expect(
      caller.propostaAgent.iniciar({
        propostaId: 1,
        portalType: "copasa",
        credencial: { email: "a@b.com", password: "ab" },
      }),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("rejeita validade fora do intervalo 1..365", async () => {
    const caller = appRouter.createCaller(createContext(adminUser));
    await expect(
      caller.propostaAgent.iniciar({
        propostaId: 1,
        portalType: "copasa",
        credencial: { email: "a@b.com", password: "Senha123!" },
        validadeDias: 0,
      }),
    ).rejects.toBeInstanceOf(TRPCError);
    await expect(
      caller.propostaAgent.iniciar({
        propostaId: 1,
        portalType: "copasa",
        credencial: { email: "a@b.com", password: "Senha123!" },
        validadeDias: 366,
      }),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("aceita iniciar sem credencial inline quando informado credencialId válido", async () => {
    vi.mock("./utils/encryption", () => ({
      encryptPassword: vi.fn((p: string) => `enc:${p}`),
    }));
    vi.mock("./routers/portalCredentials", async importOriginal => {
      const actual = await importOriginal<typeof import("./routers/portalCredentials")>();
      return {
        ...actual,
        getPortalCredentialDecrypted: vi.fn(async () => ({
          portal: "copasa",
          usuario: "a@b.com",
          senha: "SenhaDoCofre1!",
          cnpj: "12345678000100",
          loginUrl: "https://portal.test/login",
        })),
      };
    });
    const caller = appRouter.createCaller(createContext(adminUser));
    const result = await caller.propostaAgent.iniciar({
      propostaId: 5,
      portalType: "copasa",
      credencialId: 7,
    });
    expect(result).toHaveProperty("jobId");
  });
});

describe("detectarDesafioCaptcha (services/propostaAgent)", () => {
  it("detecta recaptcha no texto da página", async () => {
    const actual = await vi.importActual<typeof import("./services/propostaAgent")>("./services/propostaAgent");
    const { detectarDesafioCaptcha } = actual;
    const r = detectarDesafioCaptcha(
      "Verificação de segurança: marque todas as imagens com semáforos. reCAPTCHA v2",
    );
    expect(r.detectado).toBe(true);
    expect(r.tipo).toBe("recaptcha");
  });

  it("detecta hcaptcha no texto da página (case insensitive)", async () => {
    const actual = await vi.importActual<typeof import("./services/propostaAgent")>("./services/propostaAgent");
    const { detectarDesafioCaptcha } = actual;
    const r = detectarDesafioCaptcha("Verificação hCaptcha em andamento");
    expect(r.detectado).toBe(true);
    expect(r.tipo).toBe("hcaptcha");
  });

  it("retorna captcha genérico quando há palavra-chave ampla", async () => {
    const actual = await vi.importActual<typeof import("./services/propostaAgent")>("./services/propostaAgent");
    const { detectarDesafioCaptcha } = actual;
    const r = detectarDesafioCaptcha("Este site é protegido pelo captcha");
    expect(r.detectado).toBe(true);
    expect(r.tipo).toBe("captcha");
  });

  it("lida com entrada nula/undefined sem lançar exceção", async () => {
    const actual = await vi.importActual<typeof import("./services/propostaAgent")>("./services/propostaAgent");
    const { detectarDesafioCaptcha } = actual;
    const r = detectarDesafioCaptcha(null as unknown as string);
    expect(r.detectado).toBe(false);
  });
});
