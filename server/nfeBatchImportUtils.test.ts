import { describe, expect, it } from "vitest";
import { summarizeBatchImportResults, summarizeBatchPreview } from "./services/nfeBatchImportUtils";

describe("nfeBatchImportUtils", () => {
  it("resume corretamente o preview do lote", () => {
    const summary = summarizeBatchPreview([
      { status: "ready", productsCount: 10, totalValue: 150.5 },
      { status: "error", productsCount: 0, totalValue: 0 },
      { status: "ready", productsCount: 2, totalValue: 49.9 },
    ]);

    expect(summary).toEqual({
      totalFiles: 3,
      validFiles: 2,
      invalidFiles: 1,
      totalProducts: 12,
      totalValue: 200.4,
    });
  });

  it("resume corretamente o resultado da importação em lote", () => {
    const summary = summarizeBatchImportResults([
      { status: "imported", importedProducts: 4 },
      { status: "failed", importedProducts: 0 },
      { status: "imported", importedProducts: 7 },
    ]);

    expect(summary).toEqual({
      processedFiles: 3,
      importedFiles: 2,
      failedFiles: 1,
      importedProducts: 11,
    });
  });
});
