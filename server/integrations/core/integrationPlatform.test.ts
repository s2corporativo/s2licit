import { describe, expect, it } from "vitest";
import { IntegrationError, statusFromError } from "./integrationError";
import { failureResult, successResult } from "./integrationResult";
import { listIntegrations } from "./integrationRegistry";
import { estatisticasPreco, type PncpItemResultado } from "../../connectors/pncpConnector";

describe("integration platform result semantics", () => {
  it("distinguishes a valid empty response from an upstream failure", () => {
    const startedAt = Date.now();
    const empty = successResult({
      source: "pncp",
      operation: "search",
      data: [] as unknown[],
      startedAt,
    });
    expect(empty.status).toBe("NO_RESULTS");
    expect(empty.data).toEqual([]);

    const error = new IntegrationError("upstream unavailable", {
      type: "UPSTREAM",
      retryable: true,
      upstreamStatus: 503,
    });
    const failed = failureResult({
      source: "pncp",
      operation: "search",
      data: [] as unknown[],
      startedAt,
      error,
    });
    expect(failed.status).toBe("UNAVAILABLE");
    expect(failed.error?.retryable).toBe(true);
    expect(failed.error?.upstreamStatus).toBe(503);
  });

  it("maps contract drift to CONTRACT_ERROR", () => {
    const error = new IntegrationError("schema changed", {
      type: "CONTRACT",
      retryable: false,
    });
    expect(statusFromError(error)).toBe("CONTRACT_ERROR");
  });
});

describe("integration registry", () => {
  it("contains the critical public procurement sources without duplicates", () => {
    const definitions = listIntegrations();
    const codes = definitions.map((item) => item.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toEqual(expect.arrayContaining(["pncp", "comprasgov", "brasilapi", "fiemg"]));
    expect(definitions.find((item) => item.code === "pncp")?.transport).toBe("REST_API");
    expect(definitions.find((item) => item.code === "fiemg")?.transport).toBe("HTML_SOURCE");
  });
});

describe("PNCP price statistics", () => {
  const result = (value: number): PncpItemResultado => ({
    numeroItem: 1,
    fornecedorNome: "Fornecedor",
    fornecedorCnpjCpf: null,
    quantidadeHomologada: 1,
    valorUnitarioHomologado: value,
    valorTotalHomologado: value,
    dataResultado: null,
  });

  it("computes median and average from valid homologated prices", () => {
    const stats = estatisticasPreco([result(10), result(20), result(30), result(40)]);
    expect(stats.amostras).toBe(4);
    expect(stats.media).toBe(25);
    expect(stats.mediana).toBe(25);
    expect(stats.minimo).toBe(10);
    expect(stats.maximo).toBe(40);
  });

  it("drops strong IQR outliers when the sample is large enough", () => {
    const values = [10, 10, 11, 11, 12, 12, 13, 13, 500];
    const stats = estatisticasPreco(values.map(result));
    expect(stats.maximo).not.toBe(500);
    expect(stats.amostras).toBeLessThan(values.length);
  });

  it("returns null statistics for missing usable values", () => {
    const stats = estatisticasPreco([]);
    expect(stats).toEqual({ amostras: 0, media: null, minimo: null, maximo: null, mediana: null });
  });
});
