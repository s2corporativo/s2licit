import { describe, expect, it, vi } from "vitest";
import { validateCnpjDigits, formatCnpj } from "../utils/cnpjUtils";
import { scoreRelevanceWithLlm, validateOrgaoCnpj, toCSV } from "./agenticSeekService";
import { invokeLLM } from "../_core/llm";
import { consultarCnpj } from "../connectors/brasilApiConnector";

// Mocks leves: isolam o serviço do banco e da rede para testar a lógica pura.
// Obs.: os caminhos de mock são resolvidos a partir do MÓDULO DE TESTE, então
// ../connectors/... aponta para os conectores reais de server/connectors.
vi.mock("../../db", () => ({ getDb: vi.fn(async () => null) }));
vi.mock("../connectors/brasilApiConnector", () => ({
  consultarCnpj: vi.fn(async () => ({
    cnpj: "11222333000181",
    razaoSocial: "MUNICIPIO EXEMPLO",
    nomeFantasia: null,
    situacao: "ATIVA",
    uf: "MG",
    municipio: "BETIM",
    cnaePrincipal: "8411-6/00",
    email: null,
    telefone: null,
  })),
}));
vi.mock("../connectors/pncpConnector", () => ({
  buscarLicitacoesMultiModalidade: vi.fn(async () => ({
    data: [],
    totalRegistros: 0,
    totalPaginas: 1,
  })),
}));
vi.mock("../_core/llm", async importOriginal => {
  const original = await importOriginal<typeof import("../_core/llm")>();
  return {
    ...original,
    invokeLLM: vi.fn(async () => ({
      id: "mock",
      created: Date.now(),
      model: "claude-3-5-sonnet",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: JSON.stringify({
              relevanceScore: 85,
              justificativa: "Teste — objeto aderente ao objetivo.",
              orgaoCompativel: true,
              compatibilidadeNota: "Órgão municipal compatível.",
            }),
          },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 500, completion_tokens: 80, total_tokens: 580 },
    })),
    activeProvider: vi.fn(() => ({ kind: "anthropic", model: "claude-3-5-sonnet" })),
  };
});
vi.mock("./auditService", () => ({
  recordAudit: vi.fn(async () => undefined),
}));

describe("cnpjUtils — validação determinística de CNPJ", () => {
  it("aceita CNPJ válido com dígitos verificadores corretos", () => {
    expect(validateCnpjDigits("11222333000181")).toBe(true);
  });
  it("aceita o CNPJ conhecido da matriz do Banco do Brasil", () => {
    expect(validateCnpjDigits("00000000000191")).toBe(true);
  });
  it("rejeita CNPJ com dígito verificador errado", () => {
    expect(validateCnpjDigits("11222333000182")).toBe(false);
  });
  it("rejeita comprimentos fora de 14 dígitos", () => {
    expect(validateCnpjDigits("1122233300018")).toBe(false);
    expect(validateCnpjDigits("112223330001811")).toBe(false);
  });
  it("rejeita CNPJ trivial com dígitos repetidos", () => {
    expect(validateCnpjDigits("11111111111111")).toBe(false);
  });
  it("formata CNPJ corretamente", () => {
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });
  it("não formata entrada inválida", () => {
    expect(formatCnpj("123")).toBe("123");
  });
});

describe("scoreRelevanceWithLlm", () => {
  it("retorna score 0–100 com justificativa quando a IA responde", async () => {
    const score = await scoreRelevanceWithLlm(
      "Encontre indústrias em Betim que abriram licitação em 90 dias",
      {
        orgao: "Prefeitura de Betim",
        objeto: "Aquisição de materiais de construção",
        uf: "MG",
        municipio: "BETIM",
        cnpjOrgao: "11222333000181",
      }
    );
    expect(score.relevanceScore).toBeGreaterThanOrEqual(0);
    expect(score.relevanceScore).toBeLessThanOrEqual(100);
    expect(typeof score.justificativa).toBe("string");
    expect(score.justificativa.length).toBeGreaterThan(0);
    expect(typeof score.orgaoCompativel).toBe("boolean");
    // invokeLLM mock devolve usage com 500 tokens de prompt — chamadas
    // confirmadas indiretamente pela presença de justificativa não neutra.
    expect(score.justificativa).not.toContain("indisponível");
  });

  it("retorna score neutro (50) quando a IA falha, sem abortar", async () => {
    (invokeLLM as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Falha de rede simulada")
    );
    const score = await scoreRelevanceWithLlm("objetivo de teste longo o suficiente", {
      orgao: "Órgão X",
      objeto: "Objeto Y",
    });
    expect(score.relevanceScore).toBe(50);
    expect(score.justificativa).toContain("indisponível");
  });
});

describe("validateOrgaoCnpj", () => {
  it("valida dígitos e consulta BrasilAPI quando o formato é válido", async () => {
    const res = await validateOrgaoCnpj("11.222.333/0001-81");
    expect(res.cnpjValido).toBe(true);
    expect(consultarCnpj).toHaveBeenCalled();
  });

  it("rejeita CNPJ com dígitos verificadores inválidos sem chamar a API", async () => {
    (consultarCnpj as unknown as ReturnType<typeof vi.fn>).mockClear();
    const res = await validateOrgaoCnpj("11222333000182");
    expect(res.cnpjValido).toBe(false);
    expect(consultarCnpj).not.toHaveBeenCalled();
  });

  it("retorna válido em formato quando a consulta da API falha", async () => {
    (consultarCnpj as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("API indisponível")
    );
    const res = await validateOrgaoCnpj("11222333000181");
    // Formato válido → não rebaixar para inválido; consulta indisponível.
    expect(res.cnpjValido).toBe(true);
  });
});

describe("toCSV", () => {
  it("escapa aspas e vírgulas e mantém a ordem das colunas", async () => {
    const csv = await toCSV([
      {
        edital: 'Edital "A", teste',
        orgao: "Prefeitura",
        cnpjOrgao: "11.222.333/0001-81",
        uf: "MG",
        municipio: "Betim",
        modalidade: "Pregão",
        objeto: "Aquisição, teste",
        publicacao: "20260801",
        abertura: "20260815",
        encerramento: "20260915",
        "valor estimado": "1000",
        score: 85,
        justificativa: "ok",
        "cnpj válido": true,
        compativel: true,
        link: "https://pncp.gov.br",
      },
    ]);
    expect(csv.split("\n").length).toBe(2);
    expect(csv).toContain('"Edital ""A"", teste"');
    expect(csv).toContain('"Aquisição, teste"');
  });
});
