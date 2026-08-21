/** Testes das operações em massa do catálogo. */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./_client", () => ({ getDb: vi.fn(), resetDb: vi.fn() }));

import { products } from "../../drizzle/schema";
import {
  __bulkTest,
  bulkArchiveProducts,
  bulkReactivateProducts,
  bulkUpdateProducts,
  type BulkUpdateData,
} from "./bulkOperations";
import { getDb } from "./_client";

function makeMockDb(affected = 1) {
  const setCalls: Array<{ setRows: Record<string, unknown>; whereArg: unknown }> = [];
  const tx = {
    update: vi.fn(() => ({
      set: vi.fn((rows: Record<string, unknown>) => ({
        where: vi.fn((whereArg: unknown) => {
          setCalls.push({ setRows: rows, whereArg });
          return Promise.resolve([{ affectedRows: affected }]);
        }),
      })),
    })),
  };
  const db = {
    ...tx,
    transaction: vi.fn(async (callback: (inner: typeof tx) => Promise<void>) => callback(tx)),
  };
  return { db, tx, setCalls };
}

beforeEach(() => vi.clearAllMocks());

describe("bulkUpdateProducts", () => {
  it("aplica set-based apenas os campos informados dentro de transação", async () => {
    const { db, tx, setCalls } = makeMockDb(3);
    vi.mocked(getDb).mockResolvedValue(db as never);
    const updated = await bulkUpdateProducts([1, 2, 3], { name: "Novo Nome", price: "12.50" });
    expect(updated).toBe(3);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledWith(products);
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0].setRows).toEqual({ name: "Novo Nome", price: "12.50" });
  });

  it("divide catálogos grandes em chunks de 500 sem perder atomicidade", async () => {
    const { db, setCalls } = makeMockDb(500);
    vi.mocked(getDb).mockResolvedValue(db as never);
    const ids = Array.from({ length: 1_203 }, (_, i) => i + 1);
    const updated = await bulkUpdateProducts(ids, { manufacturer: "Lab" });
    expect(updated).toBe(1_203);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(setCalls).toHaveLength(3);
    expect(__bulkTest.BULK_CHUNK_SIZE).toBe(500);
  });

  it("deduplica IDs antes de executar o lote", async () => {
    const { db, setCalls } = makeMockDb(2);
    vi.mocked(getDb).mockResolvedValue(db as never);
    expect(await bulkUpdateProducts([1, 1, 2], { unit: "UN" })).toBe(2);
    expect(setCalls).toHaveLength(1);
  });

  it("retorna 0 para lista vazia", async () => {
    const { db, tx } = makeMockDb();
    vi.mocked(getDb).mockResolvedValue(db as never);
    expect(await bulkUpdateProducts([], { name: "X" })).toBe(0);
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("limpa explicitamente campos permitidos, inclusive frete e tributos", async () => {
    const { db, setCalls } = makeMockDb(2);
    vi.mocked(getDb).mockResolvedValue(db as never);
    await bulkUpdateProducts(
      [10, 20],
      { informacaoTecnica: "nova info" },
      { clearFields: ["description", "codigoFornecedor", "freightValue", "taxValue"] },
    );
    expect(setCalls[0].setRows).toEqual({
      informacaoTecnica: "nova info",
      description: null,
      codigoFornecedor: null,
      freightValue: null,
      taxValue: null,
    });
  });

  it("rejeita campos não permitidos em clearFields", async () => {
    const { db, setCalls } = makeMockDb();
    vi.mocked(getDb).mockResolvedValue(db as never);
    await bulkUpdateProducts([1], {}, { clearFields: ["id", "createdAt", "name"] });
    expect(setCalls[0].setRows).toEqual({ name: null });
  });

  it("executa ajuste percentual set-based e bloqueia fator não positivo", async () => {
    const { db, setCalls } = makeMockDb(2);
    vi.mocked(getDb).mockResolvedValue(db as never);
    await bulkUpdateProducts([1, 2], { priceAdjustPercent: 10 });
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0].setRows).toHaveProperty("price");
    await expect(bulkUpdateProducts([1], { priceAdjustPercent: -100 })).rejects.toThrow(/zero ou negativo/i);
  });

  it("combina atualização de campos e ajuste percentual", async () => {
    const { db, setCalls } = makeMockDb();
    vi.mocked(getDb).mockResolvedValue(db as never);
    await bulkUpdateProducts([1], { stock: "50", priceAdjustPercent: -5 });
    expect(setCalls).toHaveLength(2);
    expect(setCalls[0].setRows).toEqual({ stock: "50" });
    expect(setCalls[1].setRows).toHaveProperty("price");
  });

  it("converte freightValue/taxValue string para número e rejeita inválido", async () => {
    const { db, setCalls } = makeMockDb();
    vi.mocked(getDb).mockResolvedValue(db as never);
    await bulkUpdateProducts([1], { freightValue: "12,30" as unknown, taxValue: "5.5" } as BulkUpdateData);
    expect(setCalls[0].setRows).toEqual({ freightValue: 12.3, taxValue: 5.5 });
    await expect(bulkUpdateProducts([1], { freightValue: "abc" })).rejects.toThrow(/freightValue/);
  });
});

describe("bulkArchiveProducts / bulkReactivateProducts", () => {
  it("arquiva em soft-delete com timestamp", async () => {
    const { db, setCalls } = makeMockDb(3);
    vi.mocked(getDb).mockResolvedValue(db as never);
    expect(await bulkArchiveProducts([1, 2, 3])).toBe(3);
    expect(setCalls[0].setRows.isActive).toBe("no");
    expect(setCalls[0].setRows.deletedAt).toBeInstanceOf(Date);
  });

  it("reativa limpando deletedAt e preserva o gate de mergedIntoId no WHERE", async () => {
    const { db, setCalls } = makeMockDb(2);
    vi.mocked(getDb).mockResolvedValue(db as never);
    expect(await bulkReactivateProducts([4, 5])).toBe(2);
    expect(setCalls[0].setRows).toEqual({ isActive: "yes", deletedAt: null });
    expect(setCalls[0].whereArg).toBeDefined();
  });

  it("operação vazia não abre transação", async () => {
    const { db } = makeMockDb();
    vi.mocked(getDb).mockResolvedValue(db as never);
    expect(await bulkArchiveProducts([])).toBe(0);
    expect(await bulkReactivateProducts([])).toBe(0);
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
