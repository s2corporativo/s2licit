export interface BatchPreviewSummaryInput {
  status: "ready" | "error";
  productsCount: number;
  totalValue: number;
}

export interface BatchImportSummaryInput {
  status: "imported" | "failed";
  importedProducts: number;
}

export function summarizeBatchPreview(items: BatchPreviewSummaryInput[]) {
  return {
    totalFiles: items.length,
    validFiles: items.filter((item) => item.status === "ready").length,
    invalidFiles: items.filter((item) => item.status === "error").length,
    totalProducts: items
      .filter((item) => item.status === "ready")
      .reduce((sum, item) => sum + item.productsCount, 0),
    totalValue: items
      .filter((item) => item.status === "ready")
      .reduce((sum, item) => sum + item.totalValue, 0),
  };
}

export function summarizeBatchImportResults(items: BatchImportSummaryInput[]) {
  return {
    processedFiles: items.length,
    importedFiles: items.filter((item) => item.status === "imported").length,
    failedFiles: items.filter((item) => item.status === "failed").length,
    importedProducts: items.reduce((sum, item) => sum + item.importedProducts, 0),
  };
}
