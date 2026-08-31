/**
 * browserUseConnector.test.ts
 *
 * Só as funções PURAS (sem I/O) — mesmo padrão de comprasGov.test.ts /
 * fiemg.test.ts / pncpPrecos.test.ts: sem rede, sem subprocesso, sem banco.
 * As guardas de legalidade/custo/educação/fragilidade do PROMPT 2 são
 * exportadas como funções puras exatamente para isto: dar pra testar o
 * comportamento de decisão sem precisar simular banco ou processo Python.
 */
import { describe, expect, test } from "vitest";
import {
  alvoTemConformidadeVerificada,
  caminhoPermitidoPorRobots,
  calcularTaxaSucesso,
  custoEstourouTeto,
  normalizeBrowserUseLicitacao,
  resultadoValido,
  respeitaIntervaloMinimo,
  taxaAbaixoDoLimiar,
} from "./browserUseConnector";

describe("alvoTemConformidadeVerificada — guarda de legalidade", () => {
  test("portal sem termsVerifiedAt NÃO é coletado, mesmo com enabled=true", () => {
    expect(alvoTemConformidadeVerificada({ enabled: true, termsVerifiedAt: null })).toBe(false);
  });

  test("portal desabilitado NÃO é coletado, mesmo com termos verificados", () => {
    expect(alvoTemConformidadeVerificada({ enabled: false, termsVerifiedAt: new Date() })).toBe(false);
  });

  test("portal habilitado E com termos verificados passa", () => {
    expect(alvoTemConformidadeVerificada({ enabled: true, termsVerifiedAt: new Date() })).toBe(true);
  });

  test("aceita termsVerifiedAt como string (vindo do banco)", () => {
    expect(alvoTemConformidadeVerificada({ enabled: true, termsVerifiedAt: "2026-01-01T00:00:00Z" })).toBe(
      true
    );
  });
});

describe("respeitaIntervaloMinimo — guarda de educação", () => {
  test("nunca rodou (null) — sempre libera", () => {
    expect(respeitaIntervaloMinimo(3600, null)).toBe(true);
  });

  test("intervalo não atingido — bloqueia", () => {
    const agora = new Date("2026-01-01T12:00:00Z");
    const ultimaExecucao = new Date("2026-01-01T11:50:00Z"); // 10 min atrás
    expect(respeitaIntervaloMinimo(3600, ultimaExecucao, agora)).toBe(false); // exige 1h
  });

  test("intervalo atingido — libera", () => {
    const agora = new Date("2026-01-01T13:00:00Z");
    const ultimaExecucao = new Date("2026-01-01T11:50:00Z"); // 70 min atrás
    expect(respeitaIntervaloMinimo(3600, ultimaExecucao, agora)).toBe(true);
  });

  test("exatamente no limite — libera (>=)", () => {
    const agora = new Date("2026-01-01T13:00:00Z");
    const ultimaExecucao = new Date("2026-01-01T12:00:00Z"); // exatos 3600s
    expect(respeitaIntervaloMinimo(3600, ultimaExecucao, agora)).toBe(true);
  });
});

describe("custoEstourouTeto — guarda de custo", () => {
  test("dentro do teto — não estourou", () => {
    expect(custoEstourouTeto(0.8, 1.0)).toBe(false);
  });

  test("igual ao teto — não estourou (só > estoura)", () => {
    expect(custoEstourouTeto(1.0, 1.0)).toBe(false);
  });

  test("acima do teto — estourou", () => {
    expect(custoEstourouTeto(1.5, 1.0)).toBe(true);
  });
});

describe("resultadoValido / calcularTaxaSucesso / taxaAbaixoDoLimiar — guarda de fragilidade", () => {
  const REQUIRED = ["objeto", "orgao"];

  test("resultado com todos os campos obrigatórios preenchidos é válido", () => {
    expect(resultadoValido({ objeto: "Aquisição de seringas", orgao: "Prefeitura X" }, REQUIRED)).toBe(
      true
    );
  });

  test("resultado faltando um campo obrigatório é inválido", () => {
    expect(resultadoValido({ objeto: "Aquisição de seringas", orgao: "" }, REQUIRED)).toBe(false);
  });

  test("resultado com campo obrigatório ausente (não só vazio) é inválido", () => {
    expect(resultadoValido({ objeto: "Aquisição de seringas" }, REQUIRED)).toBe(false);
  });

  test("campo obrigatório só com espaços conta como ausente", () => {
    expect(resultadoValido({ objeto: "x", orgao: "   " }, REQUIRED)).toBe(false);
  });

  test("nenhum resultado encontrado — taxa 100% (nada pra falhar), não dispara alerta", () => {
    const taxa = calcularTaxaSucesso(0, 0);
    expect(taxa).toBe(1);
    expect(taxaAbaixoDoLimiar(taxa, 0.5)).toBe(false);
  });

  test("metade dos resultados inválidos, limiar 50% — não dispara (igual não é abaixo)", () => {
    const taxa = calcularTaxaSucesso(4, 2);
    expect(taxa).toBe(0.5);
    expect(taxaAbaixoDoLimiar(taxa, 0.5)).toBe(false);
  });

  test("maioria dos resultados inválidos — dispara alerta de fragilidade", () => {
    const taxa = calcularTaxaSucesso(10, 2); // 20% válidos
    expect(taxaAbaixoDoLimiar(taxa, 0.5)).toBe(true);
  });
});

describe("caminhoPermitidoPorRobots — guarda de educação (robots.txt)", () => {
  const UA = "S2LicitBrowserUseBot/1.0 (+https://s2.com.br/bots)";

  test("robots.txt vazio libera qualquer caminho", () => {
    expect(caminhoPermitidoPorRobots("", "/licitacoes", UA)).toBe(true);
  });

  test("Disallow: / sob User-agent: * bloqueia tudo", () => {
    const robots = "User-agent: *\nDisallow: /";
    expect(caminhoPermitidoPorRobots(robots, "/licitacoes", UA)).toBe(false);
  });

  test("Disallow de um path específico bloqueia só aquele path", () => {
    const robots = "User-agent: *\nDisallow: /admin\nAllow: /licitacoes";
    expect(caminhoPermitidoPorRobots(robots, "/admin/painel", UA)).toBe(false);
    expect(caminhoPermitidoPorRobots(robots, "/licitacoes", UA)).toBe(true);
  });

  test("regra mais específica (caminho mais longo) vence", () => {
    const robots = "User-agent: *\nDisallow: /licitacoes\nAllow: /licitacoes/publicas";
    expect(caminhoPermitidoPorRobots(robots, "/licitacoes/privadas", UA)).toBe(false);
    expect(caminhoPermitidoPorRobots(robots, "/licitacoes/publicas", UA)).toBe(true);
  });

  test("grupo nomeado do nosso agente tem prioridade sobre o *", () => {
    const robots = "User-agent: *\nDisallow: /\nUser-agent: S2LicitBrowserUseBot\nDisallow:";
    expect(caminhoPermitidoPorRobots(robots, "/licitacoes", UA)).toBe(true);
  });

  test("sem grupo aplicável (nem * nem o nosso agente) libera", () => {
    const robots = "User-agent: Googlebot\nDisallow: /";
    expect(caminhoPermitidoPorRobots(robots, "/licitacoes", UA)).toBe(true);
  });

  test("Disallow vazio (sem valor) não bloqueia nada", () => {
    const robots = "User-agent: *\nDisallow:";
    expect(caminhoPermitidoPorRobots(robots, "/qualquer-coisa", UA)).toBe(true);
  });
});

describe("normalizeBrowserUseLicitacao — pura, mesmo contrato dos demais connectors", () => {
  test("mapeia campos brutos para NormalizedLicitacao", () => {
    const raw = {
      objeto: "Aquisição de medicamentos",
      orgao: "Prefeitura Municipal de Exemplo",
      uf: "mg",
      dataAbertura: "2026-03-01",
      valorEstimado: "150000.50",
      link: "https://portal.exemplo.gov.br/edital/123",
      numero: "001/2026",
    };
    const normalizado = normalizeBrowserUseLicitacao(raw, "portal-exemplo");

    expect(normalizado.source).toBe("browseruse:portal-exemplo");
    expect(normalizado.orgao).toBe("Prefeitura Municipal de Exemplo");
    expect(normalizado.objeto).toBe("Aquisição de medicamentos");
    expect(normalizado.uf).toBe("MG");
    expect(normalizado.valorEstimado).toBe(150000.5);
    expect(normalizado.links).toEqual(["https://portal.exemplo.gov.br/edital/123"]);
    expect(normalizado.dataAbertura?.toISOString().slice(0, 10)).toBe("2026-03-01");
    expect(normalizado.dedupeKey).toBeTruthy();
  });

  test("payload vazio/mínimo nunca lança — mesmo princípio à prova de falha dos demais connectors", () => {
    expect(() => normalizeBrowserUseLicitacao({}, "portal-vazio")).not.toThrow();
    const normalizado = normalizeBrowserUseLicitacao({}, "portal-vazio");
    expect(normalizado.objeto).toBe("");
    expect(normalizado.valorEstimado).toBe(0);
    expect(normalizado.dataAbertura).toBeNull();
    expect(normalizado.links).toEqual([]);
  });

  test("data de abertura inválida vira null, não Invalid Date", () => {
    const normalizado = normalizeBrowserUseLicitacao({ dataAbertura: "não é uma data" }, "portal-x");
    expect(normalizado.dataAbertura).toBeNull();
  });
});
