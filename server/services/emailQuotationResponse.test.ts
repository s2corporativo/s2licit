import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRecordPriceHistory = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../db/landedCost", () => ({
  recordPriceHistory: mockRecordPriceHistory,
}));

// Sem histórico anterior por padrão — cada teste que precisar simular
// deduplicação (mesmo valor já gravado) sobrescreve com mockResolvedValueOnce.
const mockGetPriceHistory = vi.hoisted(() =>
  vi.fn(async (): Promise<Array<{ origem: string | null; price: string | null; freightValue: string | null; taxValue: string | null }>> => []),
);
vi.mock("../db/supplierPrices", () => ({
  getPriceHistory: mockGetPriceHistory,
}));

import {
  applyMargin,
  resolveItemMarginPercent,
  recordQuotationPriceHistory,
} from "./emailQuotationResponseService";

describe("applyMargin (margem sobre venda)", () => {
  it("usa a fórmula custo/(1-m), igual ao PricingService", () => {
    // custo 100, margem 30% -> 142,857... (margem real 30%)
    expect(applyMargin(100, 30)).toBeCloseTo(142.857, 2);
    // NÃO o markup 130 (que daria só 23,1% de margem real)
    expect(applyMargin(100, 30)).not.toBeCloseTo(130, 1);
  });

  it("margem 0 retorna o custo e margem negativa é rejeitada", () => {
    expect(applyMargin(100, 0)).toBe(100);
    expect(() => applyMargin(50, -5)).toThrow();
  });

  it("rejeita margem >= 100%", () => {
    expect(() => applyMargin(100, 100)).toThrow();
    expect(() => applyMargin(100, 150)).toThrow();
  });

  it("a margem real resultante bate com a configurada", () => {
    const custo = 80;
    const venda = applyMargin(custo, 25);
    const margemReal = (venda - custo) / venda; // lucro / preço de venda
    expect(margemReal).toBeCloseTo(0.25, 4);
  });
});

describe("resolveItemMarginPercent (margem por categoria)", () => {
  it("usa a margem da categoria quando há regra ativa", () => {
    const regras = new Map([[10, 40]]);
    expect(resolveItemMarginPercent(10, regras, 15)).toBe(40);
  });

  it("cai para a margem padrão sem regra de categoria", () => {
    const regras = new Map([[10, 40]]);
    expect(resolveItemMarginPercent(20, regras, 15)).toBe(15);
    expect(resolveItemMarginPercent(null, regras, 15)).toBe(15);
    expect(resolveItemMarginPercent(undefined, regras, 15)).toBe(15);
  });

  it("categoria sem produto casado (categoryId null) nunca ganha override", () => {
    const regras = new Map([[10, 40]]);
    expect(resolveItemMarginPercent(null, regras, 15)).toBe(15);
  });
});

describe("recordQuotationPriceHistory (Ressalva 3, Módulo 06 — gatilho cotação recebida)", () => {
  beforeEach(() => {
    mockRecordPriceHistory.mockClear();
    mockGetPriceHistory.mockClear();
    mockGetPriceHistory.mockResolvedValue([]);
  });

  function raw(productSupplierId: number | null, id = 1) {
    return { id, productSupplierId } as any;
  }

  function preview(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      quotationItemId: 1,
      produtoMatchId: 10,
      descricao: "Item",
      productName: "Produto",
      supplierName: "Fornecedor",
      quantidade: 1,
      unidade: "un",
      baseCost: 42.5,
      freightValue: 3,
      taxValue: 2,
      custoUnitario: null,
      costSource: "match",
      costUpdatedAt: null,
      unitPrice: null,
      totalCost: null,
      totalPrice: null,
      marginPercent: null,
      pricingMode: "automatic",
      hasCategoryRule: false,
      belowCost: false,
      ...overrides,
    } as any;
  }

  it("grava histórico quando o custo vem de match com fornecedor identificado", async () => {
    await recordQuotationPriceHistory([raw(7)], [preview({ costSource: "match" })]);

    expect(mockRecordPriceHistory).toHaveBeenCalledTimes(1);
    expect(mockRecordPriceHistory).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 10, supplierId: 7, price: "42.5", origem: "cotacao_recebida" }),
    );
  });

  it("grava também quando o custo vem do catálogo", async () => {
    await recordQuotationPriceHistory([raw(7)], [preview({ costSource: "catalog" })]);
    expect(mockRecordPriceHistory).toHaveBeenCalledTimes(1);
  });

  it("NÃO grava quando o custo vem do próprio histórico (evita realimentar em loop)", async () => {
    await recordQuotationPriceHistory([raw(7)], [preview({ costSource: "history" })]);
    expect(mockRecordPriceHistory).not.toHaveBeenCalled();
  });

  it("NÃO grava sem produto casado (produtoMatchId null)", async () => {
    await recordQuotationPriceHistory([raw(7)], [preview({ produtoMatchId: null })]);
    expect(mockRecordPriceHistory).not.toHaveBeenCalled();
  });

  it("NÃO grava sem fornecedor identificado (productSupplierId null)", async () => {
    await recordQuotationPriceHistory([raw(null)], [preview()]);
    expect(mockRecordPriceHistory).not.toHaveBeenCalled();
  });

  it("NÃO grava quando não há custo base", async () => {
    await recordQuotationPriceHistory([raw(7)], [preview({ baseCost: null })]);
    expect(mockRecordPriceHistory).not.toHaveBeenCalled();
  });

  it("é melhor esforço — falha ao gravar não propaga exceção", async () => {
    mockRecordPriceHistory.mockRejectedValueOnce(new Error("falha simulada de banco"));
    await expect(
      recordQuotationPriceHistory([raw(7)], [preview({ costSource: "match" })]),
    ).resolves.toBeUndefined();
  });

  it("processa múltiplos itens, gravando só os elegíveis", async () => {
    await recordQuotationPriceHistory(
      [raw(7, 1), raw(null, 2), raw(9, 3)],
      [
        preview({ quotationItemId: 1, costSource: "match" }),
        preview({ quotationItemId: 2, costSource: "match" }),
        preview({ quotationItemId: 3, costSource: "history" }),
      ],
    );
    expect(mockRecordPriceHistory).toHaveBeenCalledTimes(1);
  });

  it("não repete a gravação quando o último registro já tem exatamente o mesmo valor (regeneração de PDF)", async () => {
    mockGetPriceHistory.mockResolvedValueOnce([
      { origem: "cotacao_recebida", price: "42.50", freightValue: "3.00", taxValue: "2.00" },
    ]);

    await recordQuotationPriceHistory([raw(7)], [preview({ costSource: "match" })]);

    expect(mockRecordPriceHistory).not.toHaveBeenCalled();
  });

  it("grava de novo quando o custo mudou desde o último registro", async () => {
    mockGetPriceHistory.mockResolvedValueOnce([
      { origem: "cotacao_recebida", price: "99.00", freightValue: "3.00", taxValue: "2.00" },
    ]);

    await recordQuotationPriceHistory([raw(7)], [preview({ costSource: "match" })]);

    expect(mockRecordPriceHistory).toHaveBeenCalledTimes(1);
  });

  it("grava de novo quando o último registro veio de outra origem (import/scraping/manual)", async () => {
    mockGetPriceHistory.mockResolvedValueOnce([
      { origem: "import", price: "42.50", freightValue: "3.00", taxValue: "2.00" },
    ]);

    await recordQuotationPriceHistory([raw(7)], [preview({ costSource: "match" })]);

    expect(mockRecordPriceHistory).toHaveBeenCalledTimes(1);
  });
});
