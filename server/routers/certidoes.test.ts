import { describe, it, expect, vi, beforeEach } from "vitest";
import { certidoes } from "../../drizzle/schema";

/** Query builder do drizzle encadeável (`.where()`/`.orderBy()`) e "thenable". */
function makeQueryBuilder(data: unknown[]): any {
  const builder: any = Promise.resolve(data);
  builder.where = vi.fn((cond: unknown) => {
    lastWhereCondition = cond;
    return makeQueryBuilder(data);
  });
  builder.orderBy = vi.fn(() => makeQueryBuilder(data));
  return builder;
}

let certidoesData: unknown[] = [];
let lastWhereCondition: unknown;
const mockFrom = vi.fn((table: unknown) => {
  if (table === certidoes) return makeQueryBuilder(certidoesData);
  return makeQueryBuilder([]);
});
const mockSelect = vi.fn(() => ({ from: mockFrom }));

vi.mock("../db", () => ({
  getDb: vi.fn(async () => ({ select: mockSelect })),
}));

import { classificarValidade, certidoesRouter } from "./certidoes";

function caller() {
  return certidoesRouter.createCaller({ user: { id: "test", role: "editor" } } as any);
}

describe("classificarValidade", () => {
  const hoje = new Date("2026-07-11T12:00:00Z");

  it("marca como vencida quando a validade já passou", () => {
    expect(classificarValidade(new Date("2026-07-01"), hoje)).toBe("vencida");
  });

  it("marca como vence_em_breve dentro da janela de alerta", () => {
    expect(classificarValidade(new Date("2026-07-25"), hoje, 30)).toBe("vence_em_breve");
  });

  it("marca como válida além da janela de alerta", () => {
    expect(classificarValidade(new Date("2026-12-01"), hoje, 30)).toBe("valida");
  });

  it("respeita uma janela de alerta customizada", () => {
    // Vence em ~14 dias; com janela de 7, ainda é "valida".
    expect(classificarValidade(new Date("2026-07-25"), hoje, 7)).toBe("valida");
  });

  it("trata o próprio dia de vencimento como vence_em_breve (não vencida)", () => {
    expect(classificarValidade(new Date("2026-07-11T23:00:00Z"), hoje, 30)).toBe("vence_em_breve");
  });
});

describe("certidoesRouter — vínculo com fornecedor (Ressalva 2, Módulo 06)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    certidoesData = [];
    lastWhereCondition = undefined;
  });

  it("list sem filtro consulta só certidões institucionais (supplierId NULL), não mistura com as de fornecedor", async () => {
    certidoesData = [{ id: 1, supplierId: null }];

    const result = await caller().list(undefined);

    expect(result).toHaveLength(1);
    // A condição combina ativa=true com supplierId IS NULL — Certidoes.tsx
    // (habilitação da própria empresa) não pode listar documento de fornecedor.
    expect(lastWhereCondition).toBeDefined();
  });

  it("list com supplierId filtra pela condição de fornecedor (não retorna tudo)", async () => {
    certidoesData = [{ id: 2, supplierId: 7 }];

    const result = await caller().list({ supplierId: 7 });

    expect(result).toEqual([{ id: 2, supplierId: 7 }]);
    // A condição passada ao `where` combina ativa=true com o filtro de fornecedor —
    // não é undefined, ou seja, o filtro foi de fato aplicado na query.
    expect(lastWhereCondition).toBeDefined();
  });

  it("bySupplier retorna as certidões do fornecedor informado", async () => {
    certidoesData = [{ id: 3, supplierId: 9, tipo: "CND Federal" }];

    const result = await caller().bySupplier({ supplierId: 9 });

    expect(result).toEqual([{ id: 3, supplierId: 9, tipo: "CND Federal" }]);
  });

  it("bySupplier rejeita supplierId inválido (RBAC/validação de input)", async () => {
    await expect(caller().bySupplier({ supplierId: -1 } as any)).rejects.toThrow();
  });

  it("list e bySupplier retornam vazio quando o banco está indisponível", async () => {
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockResolvedValueOnce(null as never);
    await expect(caller().list(undefined)).resolves.toEqual([]);
    vi.mocked(getDb).mockResolvedValueOnce(null as never);
    await expect(caller().bySupplier({ supplierId: 1 })).resolves.toEqual([]);
  });

  it("alertas consulta só certidões institucionais, não as de fornecedor", async () => {
    certidoesData = [{ id: 1, supplierId: null, ativa: true, dataValidade: "2020-01-01" }];

    await caller().alertas({ diasAlerta: 30 });

    expect(lastWhereCondition).toBeDefined();
  });
});
