import { describe, expect, it } from "vitest";
import { calculateSalePrice } from "../services/pricingSafety";

// Teste rápido da lógica de valor de venda manual por item na proposta:
// simula o trecho exato do createProposal (edital.ts, ~linhas 586-596)
// para os três cenários: sem manual, manual válido e manual inválido.

function resolveSalePrice(opts: {
  costPrice: number;
  marginPercent?: number;
  itemSalePriceManual?: string | null;
  itemNumero?: number;
}): number | "INVALIDO" {
  const rawManual = (opts.itemSalePriceManual ?? "").trim();
  const manualPrice = rawManual ? parseFloat(rawManual.replace(",", ".")) : null;
  if (manualPrice !== null && (!Number.isFinite(manualPrice) || manualPrice <= 0)) {
    return "INVALIDO";
  }
  return manualPrice !== null
    ? manualPrice
    : calculateSalePrice({ cost: opts.costPrice, marginPercent: opts.marginPercent ?? 0 });
}

describe("valor de venda manual por item (createProposal)", () => {
  it("sem manual usa o cálculo automático de margem sobre o custo", () => {
    // custo R$ 100,00 com margem padrão da função (sem percentual → default)
    const automatic = calculateSalePrice({ cost: 100, marginPercent: 30 });
    const resolved = resolveSalePrice({ costPrice: 100, marginPercent: 30 });
    expect(resolved).toBe(automatic);
    expect(resolved).toBeGreaterThan(100);
  });

  it("manual válido substitui o cálculo automático, mesmo com margem configurada", () => {
    const manual = resolveSalePrice({
      costPrice: 100,
      marginPercent: 30,
      itemSalePriceManual: "149.90",
    });
    expect(manual).toBe(149.9);
    expect(manual).not.toBe(calculateSalePrice({ cost: 100, marginPercent: 30 }));
  });

  it("manual com vírgula como separador decimal é aceito", () => {
    expect(resolveSalePrice({ costPrice: 100, itemSalePriceManual: "149,90" })).toBe(149.9);
  });

  it("manual zerado ou negativo é rejeitado", () => {
    expect(resolveSalePrice({ costPrice: 100, itemSalePriceManual: "0" })).toBe("INVALIDO");
    expect(resolveSalePrice({ costPrice: 100, itemSalePriceManual: "-10" })).toBe("INVALIDO");
    expect(resolveSalePrice({ costPrice: 100, itemSalePriceManual: "abc" })).toBe("INVALIDO");
  });

  it("manual nulo/undefined/vazio comporta como ausência", () => {
    expect(resolveSalePrice({ costPrice: 100, marginPercent: 30, itemSalePriceManual: null })).toBe(calculateSalePrice({ cost: 100, marginPercent: 30 }));
    expect(resolveSalePrice({ costPrice: 100, marginPercent: 30, itemSalePriceManual: undefined })).toBe(calculateSalePrice({ cost: 100, marginPercent: 30 }));
    expect(resolveSalePrice({ costPrice: 100, marginPercent: 30, itemSalePriceManual: "" })).toBe(calculateSalePrice({ cost: 100, marginPercent: 30 }));
  });

  it("valor manual é preservado com 2 casas no suggestedPrice da proposta", () => {
    const resolved = resolveSalePrice({ costPrice: 50, itemSalePriceManual: "99.999" });
    expect(Number(resolved).toFixed(2)).toBe("100.00");
  });
});
