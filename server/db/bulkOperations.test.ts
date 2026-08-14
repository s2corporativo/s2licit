/**
 * Testes do módulo de operações em massa (bulkOperations).
 *
 * Cobertura: contrato de tipos, lógica de habilitação/limpeza de campos e
 * comportamento set-based simulado via mocks da camada drizzle/getDb.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock do módulo irmão _client (getDb) ANTES do import do módulo testado
vi.mock("./_client", () => ({ getDb: vi.fn(), resetDb: vi.fn() }));

import { products } from "../../drizzle/schema";
import {
  bulkArchiveProducts,
  bulkReactivateProducts,
  bulkUpdateProducts,
  type BulkUpdateData,
} from "./bulkOperations";
import { getDb } from "./_client";

function makeMockDb() {
  const setCalls: Array<{ setRows: Record<string, unknown>; whereArg: unknown }> = [];
  const db = {
    update: vi.fn(() => ({
      set: vi.fn((rows: Record<string, unknown>) => ({
        where: vi.fn((whereArg: unknown) => {
          setCalls.push({ setRows: rows, whereArg });
          return Promise.resolve(undefined);
        }),
      })),
    })),
  };
  return { db, setCalls };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("bulkUpdateProducts", () => {
  it("aplica set-based apenas os campos informados", async () => {
    const { db, setCalls } = makeMockDb();
    vi.mocked(getDb).mockResolvedValue(db as never);
    const updated = await bulkUpdateProducts([1, 2, 3], { name: "Novo Nome", price: "12.50" });
    expect(updated).toBe(3);
    expect(db.update).toHaveBeenCalledWith(products);
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0].setRows).toEqual({ name: "Novo Nome", price: "12.50" });
  });

  it("ignora dados vazios e retorna 0 para lista vazia", async () => {
    const { db } = makeMockDb();
    vi.mocked(getDb).mockResolvedValue(db as never);
    const updated = await bulkUpdateProducts([], { name: "X" });
    expect(updated).toBe(0);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("limpa explicitamente os campos em clearFields (SET NULL)", async () => {
    const { db, setCalls } = makeMockDb();
    vi.mocked(getDb).mockResolvedValue(db as never);
    await bulkUpdateProducts(
      [10, 20],
      { informacaoTecnica: "nova info" },
      { clearFields: ["description", "codigoFornecedor"] }
    );
    expect(setCalls[0].setRows).toEqual({
      informacaoTecnica: "nova info",
      description: null,
      codigoFornecedor: null,
    });
  });

  it("rejeita campos não permitidos em clearFields", async () => {
    const { db, setCalls } = makeMockDb();
    vi.mocked(getDb).mockResolvedValue(db as never);
    await bulkUpdateProducts([1], {}, { clearFields: ["id", "createdAt", "name"] });
    // apenas "name" é limpo (id/createdAt não constam do catálogo CLEARABLE_FIELDS)
    expect(setCalls[0].setRows).toEqual({ name: null });
  });

  it("executa priceAdjustPercent em uma única instrução set-based", async () => {
    const { db, setCalls } = makeMockDb();
    vi.mocked(getDb).mockResolvedValue(db as never);
    await bulkUpdateProducts([1, 2], { priceAdjustPercent: 10 });
    expect(db.update).toHaveBeenCalledWith(products);
    // setRows vazio não chama update; priceAdjust chama uma segunda vez
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0].setRows).toHaveProperty("price");
  });

  it("combina atualização de campos e ajuste percentual (duas instruções)", async () => {
    const { db, setCalls } = makeMockDb();
    vi.mocked(getDb).mockResolvedValue(db as never);
    await bulkUpdateProducts([1], { stock: "50", priceAdjustPercent: -5 });
    expect(setCalls).toHaveLength(2);
    expect(setCalls[0].setRows).toEqual({ stock: "50" });
    expect(setCalls[1].setRows).toHaveProperty("price");
  });

  it("converte freightValue/taxValue string para número", async () => {
    const { db, setCalls } = makeMockDb();
    vi.mocked(getDb).mockResolvedValue(db as never);
    await bulkUpdateProducts([1], { freightValue: "12,30" as unknown, taxValue: "5.5" } as BulkUpdateData);
    expect(setCalls[0].setRows).toEqual({ freightValue: 12.3, taxValue: 5.5 });
  });

  it("registra isActive yes/no diretamente", async () => {
    const { db, setCalls } = makeMockDb();
    vi.mocked(getDb).mockResolvedValue(db as never);
    await bulkUpdateProducts([1], { isActive: "no" });
    expect(setCalls[0].setRows).toEqual({ isActive: "no" });
  });
});

describe("bulkArchiveProducts / bulkReactivateProducts", () => {
  it("arquivamento é set-based com isActive no", async () => {
    const { db, setCalls } = makeMockDb();
    vi.mocked(getDb).mockResolvedValue(db as never);
    const archived = await bulkArchiveProducts([1, 2, 3]);
    expect(archived).toBe(3);
    expect(setCalls[0].setRows).toEqual({ isActive: "no" });
  });

  it("reativação é set-based com isActive yes", async () => {
    const { db, setCalls } = makeMockDb();
    vi.mocked(getDb).mockResolvedValue(db as never);
    const reactivated = await bulkReactivateProducts([4, 5]);
    expect(reactivated).toBe(2);
    expect(setCalls[0].setRows).toEqual({ isActive: "yes" });
  });

  it("operação vazia não executa SQL", async () => {
    const { db } = makeMockDb();
    vi.mocked(getDb).mockResolvedValue(db as never);
    expect(await bulkArchiveProducts([])).toBe(0);
    expect(await bulkReactivateProducts([])).toBe(0);
    expect(db.update).not.toHaveBeenCalled();
  });
});
