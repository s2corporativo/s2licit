import { describe, it, expect } from "vitest";
import {
  processImportedProductsWithMatching,
  calculateImportMatchingStats,
  groupMatchingResultsByAction,
  validateImportedProductsForMatching,
  detectDuplicatesInImportBatch,
  consolidateSupplierPricesForDuplicates,
  generateImportMatchingReport,
  type ImportedProduct,
  type MatchingResult,
} from "./importMatchingService";

describe("importMatchingService", () => {
  const mockMasterProducts = [
    {
      id: 1,
      name: "Amoxicilina 500mg",
      ean: "7891234567890",
      codigoMapa: "PA0012345/2019",
      concentration: "500mg",
      presentation: "Cápsula",
      manufacturer: "Pharma Lab",
    },
    {
      id: 2,
      name: "Dipirona 500mg",
      ean: "7891234567891",
      codigoMapa: "PA0012346/2019",
      concentration: "500mg",
      presentation: "Comprimido",
      manufacturer: "Pharma Lab",
    },
  ];

  const mockImportedProducts: ImportedProduct[] = [
    {
      name: "Amoxicilina 500mg",
      ean: "7891234567890",
      concentration: "500mg",
      presentation: "Cápsula",
      price: 15.5,
      supplierId: 1,
      supplierName: "Fornecedor A",
    },
    {
      name: "Dipirona",
      ean: null,
      codigoMapa: "PA0012346/2019",
      concentration: "500mg",
      presentation: "Comprimido",
      price: 5.0,
      supplierId: 2,
      supplierName: "Fornecedor B",
    },
    {
      name: "Novo Produto",
      ean: null,
      codigoMapa: null,
      concentration: null,
      presentation: null,
      price: 20.0,
      supplierId: 1,
      supplierName: "Fornecedor A",
    },
  ];

  describe("processImportedProductsWithMatching", () => {
    it("should match products by EAN", async () => {
      const existingProducts = new Map();
      const results = await processImportedProductsWithMatching(
        [mockImportedProducts[0]],
        mockMasterProducts,
        existingProducts
      );

      expect(results).toHaveLength(1);
      expect(results[0].matchType).toBe("ean");
      expect(results[0].masterProductId).toBe(1);
    });

    it("should match products by MAPA", async () => {
      const existingProducts = new Map();
      const results = await processImportedProductsWithMatching(
        [mockImportedProducts[1]],
        mockMasterProducts,
        existingProducts
      );

      expect(results).toHaveLength(1);
      expect(results[0].matchType).toBe("mapa");
      expect(results[0].masterProductId).toBe(2);
    });

    it("should create new product when no match found", async () => {
      const existingProducts = new Map();
      const results = await processImportedProductsWithMatching(
        [mockImportedProducts[2]],
        mockMasterProducts,
        existingProducts
      );

      expect(results).toHaveLength(1);
      expect(results[0].action).toBe("create");
      expect(results[0].matchType).toBe("no_match");
    });

    it("should update product when match found and product exists", async () => {
      const existingProducts = new Map([[1, { id: 1, name: "Amoxicilina 500mg" }]]);
      const results = await processImportedProductsWithMatching(
        [mockImportedProducts[0]],
        mockMasterProducts,
        existingProducts
      );

      expect(results).toHaveLength(1);
      expect(results[0].action).toBe("update");
    });
  });

  describe("calculateImportMatchingStats", () => {
    it("should calculate stats correctly", async () => {
      const results: MatchingResult[] = [
        {
          importedProduct: mockImportedProducts[0],
          masterProductId: 1,
          matchType: "ean",
          similarity: 1,
          action: "update",
        },
        {
          importedProduct: mockImportedProducts[1],
          masterProductId: 2,
          matchType: "mapa",
          similarity: 1,
          action: "create",
        },
        {
          importedProduct: mockImportedProducts[2],
          matchType: "no_match",
          similarity: 0,
          action: "create",
        },
      ];

      const stats = await calculateImportMatchingStats(results);

      expect(stats.totalImported).toBe(3);
      expect(stats.newProducts).toBe(2);
      expect(stats.updatedProducts).toBe(1);
      expect(stats.matchedByEan).toBe(1);
      expect(stats.matchedByMapa).toBe(1);
      expect(stats.noMatches).toBe(1);
      expect(stats.averageSimilarity).toBeGreaterThan(0.6);
    });
  });

  describe("groupMatchingResultsByAction", () => {
    it("should group results by action", async () => {
      const results: MatchingResult[] = [
        {
          importedProduct: mockImportedProducts[0],
          masterProductId: 1,
          matchType: "ean",
          similarity: 1,
          action: "update",
        },
        {
          importedProduct: mockImportedProducts[1],
          masterProductId: 2,
          matchType: "mapa",
          similarity: 1,
          action: "create",
        },
        {
          importedProduct: mockImportedProducts[2],
          matchType: "no_match",
          similarity: 0,
          action: "skip",
        },
      ];

      const grouped = groupMatchingResultsByAction(results);

      expect(grouped.create).toHaveLength(1);
      expect(grouped.update).toHaveLength(1);
      expect(grouped.skip).toHaveLength(1);
    });
  });

  describe("validateImportedProductsForMatching", () => {
    it("should validate products correctly", () => {
      const products: ImportedProduct[] = [
        { name: "Valid Product", concentration: "500mg" },
        { name: "", concentration: "500mg" },
        { name: "No Data Product", ean: null, codigoMapa: null, concentration: null },
      ];

      const { valid, invalid } = validateImportedProductsForMatching(products);

      expect(valid).toHaveLength(1);
      expect(invalid).toHaveLength(2);
    });

    it("should accept products with EAN", () => {
      const products: ImportedProduct[] = [{ name: "Product", ean: "1234567890" }];

      const { valid, invalid } = validateImportedProductsForMatching(products);

      expect(valid).toHaveLength(1);
      expect(invalid).toHaveLength(0);
    });
  });

  describe("detectDuplicatesInImportBatch", () => {
    it("should detect duplicates", () => {
      const products: ImportedProduct[] = [
        { name: "Amoxicilina", concentration: "500mg", presentation: "Cápsula" },
        { name: "Amoxicilina", concentration: "500mg", presentation: "Cápsula" },
        { name: "Dipirona", concentration: "500mg", presentation: "Comprimido" },
      ];

      const { unique, duplicates } = detectDuplicatesInImportBatch(products);

      expect(unique).toHaveLength(2);
      expect(duplicates).toHaveLength(1);
    });

    it("should not flag different concentrations as duplicates", () => {
      const products: ImportedProduct[] = [
        { name: "Amoxicilina", concentration: "500mg", presentation: "Cápsula" },
        { name: "Amoxicilina", concentration: "250mg", presentation: "Cápsula" },
      ];

      const { unique, duplicates } = detectDuplicatesInImportBatch(products);

      expect(unique).toHaveLength(2);
      expect(duplicates).toHaveLength(0);
    });
  });

  describe("consolidateSupplierPricesForDuplicates", () => {
    it("should consolidate prices for duplicates", () => {
      const products: ImportedProduct[] = [
        {
          name: "Amoxicilina",
          concentration: "500mg",
          presentation: "Cápsula",
          price: 15.5,
          supplierId: 1,
          supplierName: "Fornecedor A",
        },
        {
          name: "Amoxicilina",
          concentration: "500mg",
          presentation: "Cápsula",
          price: 14.0,
          supplierId: 2,
          supplierName: "Fornecedor B",
        },
      ];

      const duplicates = [
        { product: products[1], duplicateOf: "Amoxicilina" },
      ];

      const consolidated = consolidateSupplierPricesForDuplicates(products, duplicates);

      expect(consolidated.size).toBeGreaterThan(0);
      const key = Array.from(consolidated.keys())[0];
      expect(consolidated.get(key)).toHaveLength(2);
    });
  });

  describe("generateImportMatchingReport", () => {
    it("should generate report correctly", async () => {
      const results: MatchingResult[] = [
        {
          importedProduct: mockImportedProducts[0],
          masterProductId: 1,
          matchType: "ean",
          similarity: 1,
          action: "update",
        },
      ];

      const stats = await calculateImportMatchingStats(results);
      const report = await generateImportMatchingReport(results, stats, 0, ["Warning 1"], ["Error 1"]);

      expect(report.timestamp).toBeDefined();
      expect(report.totalProcessed).toBe(1);
      expect(report.stats).toBeDefined();
      expect(report.warnings).toHaveLength(1);
      expect(report.errors).toHaveLength(1);
    });
  });
});
