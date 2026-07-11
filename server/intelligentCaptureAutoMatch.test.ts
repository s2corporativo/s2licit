import { describe, expect, it } from "vitest";
import {
  buildBatchMatchingSummary,
  resolveAutomaticMatch,
  type CapturedInputProduct,
  type CatalogProduct,
} from "./services/intelligentCaptureService";

describe("intelligentCapture automatic matching", () => {
  const catalog: CatalogProduct[] = [
    {
      id: 101,
      name: "Amoxicilina 50mg Comprimido",
      manufacturer: "Vet Pharma",
      barcode: "7891234567890",
      ean: null,
      gtin: null,
      concentration: "50mg",
      presentation: "Comprimido",
      activeIngredient: "Amoxicilina",
      description: "Antibiótico veterinário",
    },
    {
      id: 202,
      name: "Dipirona Gotas 20ml",
      manufacturer: "Saude Animal",
      barcode: null,
      ean: "7890001112223",
      gtin: null,
      concentration: "500mg/ml",
      presentation: "Frasco 20ml",
      activeIngredient: "Dipirona",
      description: "Analgésico veterinário",
    },
  ];

  it("prioriza correspondência exata por código de barras", () => {
    const captured: CapturedInputProduct = {
      name: "Amoxicilina 50mg Comprimido",
      barcode: "7891234567890",
    };

    const result = resolveAutomaticMatch(captured, catalog);

    expect(result.matchedProductId).toBe(101);
    expect(result.duplicateSignal).toBe("confirmed");
    expect(result.actionSuggestion).toBe("update");
    expect(result.matchType).toBe("barcode");
  });

  it("gera revisão provável para nome altamente similar sem código exato", () => {
    const captured: CapturedInputProduct = {
      name: "Dipirona gotas 20 ml",
      manufacturer: "Saude Animal",
      presentation: "Frasco 20ml",
    };

    const result = resolveAutomaticMatch(captured, catalog);

    expect(result.matchedProductId).toBe(202);
    expect(["probable", "possible"]).toContain(result.duplicateSignal);
    expect(result.actionSuggestion).toBe("review");
    expect(result.matchScore).toBeGreaterThanOrEqual(0.7);
  });

  it("resume corretamente os sinais de correspondência do lote", () => {
    const summary = buildBatchMatchingSummary([
      { name: "A", matchedProductId: 1, duplicateSignal: "confirmed" },
      { name: "B", matchedProductId: 2, duplicateSignal: "probable" },
      { name: "C", matchedProductId: 3, duplicateSignal: "possible" },
      { name: "D" },
    ]);

    expect(summary).toEqual({
      totalProcessed: 4,
      totalMatched: 3,
      confirmed: 1,
      probable: 1,
      possible: 1,
      unmatched: 1,
    });
  });
});
