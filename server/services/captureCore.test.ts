import { describe, expect, it } from "vitest";
import { FORNECEDOR_CONFIGS } from "./scraperPresets";
import { chooseCaptureMode, getConnectorCapabilities } from "./captureConnectorCapabilities";
import {
  capturePresentationCompatible,
  evaluateCapturePriceChange,
  evaluateCaptureQuality,
  normalizeCaptureAvailability,
  normalizeCaptureEan,
} from "./captureCoreService";
import {
  matchCapturedProduct,
  type CaptureMatchingContext,
  type CaptureProductMatchRecord,
} from "./captureMatchingService";

describe("Capture Core — capacidades", () => {
  it("não oferece full scan para Bartofil e Basso Pancotte", () => {
    for (const type of ["bartofil", "bassopancotte"] as const) {
      const capabilities = getConnectorCapabilities(type, FORNECEDOR_CONFIGS[type]);
      expect(capabilities.fullCatalog).toBe(false);
      expect(capabilities.search).toBe(true);
      expect(capabilities.method).toBe("hybrid");
    }
  });

  it("preserva refresh multi-termo em conector search-only", () => {
    const capabilities = getConnectorCapabilities("bartofil", FORNECEDOR_CONFIGS.bartofil);
    expect(chooseCaptureMode("refresh", capabilities, "SKU-1\nSKU-2")).toBe("refresh");
  });

  it("recusa full scan impossível", () => {
    const capabilities = getConnectorCapabilities("bartofil", FORNECEDOR_CONFIGS.bartofil);
    expect(() => chooseCaptureMode("full", capabilities)).toThrow(/não suporta varredura integral/i);
  });
});

describe("Capture Core — normalização e segurança de identidade", () => {
  it("EAN aceita apenas 8 a 14 dígitos", () => {
    expect(normalizeCaptureEan("789 1234-567890")).toBe("7891234567890");
    expect(normalizeCaptureEan("123")).toBeNull();
  });

  it("não trata disponibilidade ausente como disponível", () => {
    expect(normalizeCaptureAvailability(undefined, undefined)).toBe("unknown");
    expect(normalizeCaptureAvailability(undefined, 0)).toBe("out_of_stock");
    expect(normalizeCaptureAvailability(undefined, 3)).toBe("limited");
  });

  it("bloqueia apresentações quantitativamente incompatíveis", () => {
    expect(capturePresentationCompatible(
      "Amoxicilina 500 mg caixa 10 comprimidos",
      "Amoxicilina 500 mg caixa 20 comprimidos",
    )).toBe(false);
    expect(capturePresentationCompatible(
      "Amoxicilina 500 mg caixa 10 comprimidos",
      "Amoxicilina 500mg 10 comprimidos",
    )).toBe(true);
  });

  it("bloqueia SKU duplicado no mesmo fornecedor em vez de adotar last-write-wins", async () => {
    const product: CaptureProductMatchRecord = {
      id: 10,
      supplierId: 1,
      name: "Produto teste",
      normalizedName: "produto teste",
      primaryEan: null,
      code: null,
      supplierCode: null,
      manufacturer: null,
      presentation: null,
      unit: null,
      price: "10.00",
      imageUrl: null,
    };

    const context: CaptureMatchingContext = {
      supplierId: 1,
      productsById: new Map([[product.id, product]]),
      productByEan: new Map(),
      productsByToken: new Map(),
      offerBySupplierCode: new Map([["SKU-DUP", null]]),
      offerByProductId: new Map(),
      ai: {
        supplierId: 1,
        loadedAt: new Date(),
        learnedByNormalizedName: new Map(),
        examples: [],
      },
    };

    const result = await matchCapturedProduct(
      { name: "Produto teste", price: 10, code: "sku-dup" },
      context,
    );

    expect(result.actionHint).toBe("blocked");
    expect(result.deterministic).toBe(false);
    expect(result.reason).toMatch(/SKU duplicado/i);
  });
});

describe("Capture Core — quality gates", () => {
  it("quarentena captura integral vazia", () => {
    const result = evaluateCaptureQuality({ mode: "full", captured: 0, baseline: 20_000 });
    expect(result.quarantine).toBe(true);
    expect(result.score).toBe(0);
  });

  it("não transforma busca seletiva sem resultado em falha estrutural", () => {
    const result = evaluateCaptureQuality({ mode: "search", captured: 0, baseline: 20_000 });
    expect(result.quarantine).toBe(false);
    expect(result.score).toBe(70);
    expect(result.reasons.join(" ")).toMatch(/atenção|seletiva/i);
  });

  it("quarentena queda estrutural maior que 50% do baseline", () => {
    const result = evaluateCaptureQuality({ mode: "full", captured: 4_000, baseline: 10_000 });
    expect(result.quarantine).toBe(true);
    expect(result.reasons.join(" ")).toMatch(/cobertura/i);
  });

  it("não usa baseline de catálogo total para busca seletiva", () => {
    const result = evaluateCaptureQuality({ mode: "refresh", captured: 2, baseline: 10_000 });
    expect(result.quarantine).toBe(false);
  });
});

describe("Capture Core — anomalia de preço", () => {
  it("aceita alteração pequena", () => {
    expect(evaluateCapturePriceChange(110, 100).level).toBe("ok");
  });

  it("manda alteração grande para revisão", () => {
    expect(evaluateCapturePriceChange(170, 100).level).toBe("review");
  });

  it("bloqueia provável erro de parsing extremo", () => {
    expect(evaluateCapturePriceChange(450, 100).level).toBe("block");
  });

  it("bloqueia preço inválido", () => {
    expect(evaluateCapturePriceChange(0, 100).level).toBe("block");
  });
});
