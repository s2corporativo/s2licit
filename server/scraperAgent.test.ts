import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { makeTestUser } from "./testUtils";
import { buildSearchUrl } from "./services/scraperEngine";

/**
 * Testes dedicados do módulo de captura automática por fornecedor (scraperAgent).
 *
 * Cobertura:
 *  - `buildSearchUrl` (services/scraperEngine): substituição determinística de
 *    {q}/{termo} no template de URL, sem dupla codificação e com separador correto.
 *  - Robustez de entrada (termos com caracteres especiais, espaços, aspas).
 *  - RBAC do router: admin executa; editor bloqueado nas procedures admin-only.
 *  - Validação zod do input de cadastro de credencial.
 *
 * Os caminhos com banco real (listar/historico) são exercidos pela bateria de
 * integração existente; os mocks mantêm estes testes rápidos e determinísticos.
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

describe("buildSearchUrl (scraperEngine)", () => {
  it("substitui {q} pelo termo codificado", () => {
    expect(buildSearchUrl("https://ex.com/busca?q={q}", "florfenicol")).toBe(
      "https://ex.com/busca?q=florfenicol",
    );
  });

  it("substitui {termo} (case insensitive) pelo termo codificado", () => {
    expect(buildSearchUrl("https://ex.com/?termo={TERMO}", "ciprovet")).toBe(
      "https://ex.com/?termo=ciprovet",
    );
  });

  it("encoda caracteres especiais e espaços", () => {
    const url = buildSearchUrl("https://ex.com/?q={q}", "sulfato de neomicina + zinc");
    expect(url).not.toContain(" ");
    expect(url).toContain("sulfato%20de%20neomicina%20%2B%20zinc");
  });

  it("adiciona q= com separador correto quando o template não tem placeholder", () => {
    expect(buildSearchUrl("https://ex.com/busca", "ivermectina")).toBe(
      "https://ex.com/busca?q=ivermectina",
    );
    expect(buildSearchUrl("https://ex.com/busca?cat=med", "ivermectina")).toBe(
      "https://ex.com/busca?cat=med&q=ivermectina",
    );
  });

  it("troca todas as ocorrências de {q}", () => {
    expect(buildSearchUrl("https://ex.com/{q}/detalhe?q={q}", "a+b")).toBe(
      "https://ex.com/a%2Bb/detalhe?q=a%2Bb",
    );
  });

  it("aceita termo vazio após trim sem quebrar a URL", () => {
    const url = buildSearchUrl("https://ex.com/busca?q={q}", "   ");
    expect(url.startsWith("https://ex.com/busca?q=")).toBe(true);
  });
});

describe("scraperAgent router — RBAC e validação (mocked)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("expõe as procedures esperadas no router consolidado", () => {
    const procedures = Object.keys((appRouter as any)._def.procedures ?? {});
    expect(procedures).toContain("scraperAgent.listar");
    expect(procedures).toContain("scraperAgent.cadastrar");
    expect(procedures).toContain("scraperAgent.executar");
    expect(procedures).toContain("scraperAgent.testarConexao");
    expect(procedures).toContain("scraperAgent.executarTodos");
  });

  it("rejeita cadastro de credencial com senha vazia (validação zod)", async () => {
    const caller = appRouter.createCaller(createContext(adminUser));
    await expect(
      caller.scraperAgent.cadastrar({
        supplierId: 1,
        scraperType: "web",
        email: "usuario@test",
        password: "",
        scheduleTime: "08:00",
      }),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("bloqueia edição de credenciais para editor (admin-only)", async () => {
    const caller = appRouter.createCaller(createContext(editorUser));
    await expect(
      caller.scraperAgent.deletar({ id: 1 }),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("bloqueia execução em massa para editor (admin-only)", async () => {
    const caller = appRouter.createCaller(createContext(editorUser));
    await expect(caller.scraperAgent.executarTodos()).rejects.toBeInstanceOf(TRPCError);
  });

  it("bloqueia listagem sem autenticação", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(caller.scraperAgent.listar()).rejects.toBeInstanceOf(TRPCError);
  });
});

describe("detectarDesafioCaptcha (propostaAgent)", () => {
  it("detecta desafio matemático no texto da página", async () => {
    const { detectarDesafioCaptcha } = await import("./services/propostaAgent");
    const r = detectarDesafioCaptcha("Quanto é 6 - 4? Digite o resultado:");
    expect(r.detectado).toBe(true);
    expect(r.tipo).toBe("captcha_matematico");
  });

  it("não detecta desafio em página sem captcha", async () => {
    const { detectarDesafioCaptcha } = await import("./services/propostaAgent");
    const r = detectarDesafioCaptcha("Página de login normal do fornecedor");
    expect(r.detectado).toBe(false);
  });
});
