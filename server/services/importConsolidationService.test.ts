import { describe, it, expect } from "vitest";
import {
  detectDuplicatesInBatch,
  groupProductsBySupplierInBatch,
  prepareConsolidatedForImport,
  calculateConsolidationStats,
  type ImportProduct,
} from "./importConsolidationService";

describe("importConsolidationService", () => {
  describe("detectDuplicatesInBatch", () => {
    it("deve detectar duplicatas no lote", () => {
      const products: ImportProduct[] = [
        {
          name: "Amoxicilina",
          activeIngredient: "Amoxicilina",
          concentration: "500mg",
          presentation: "Comprimido",
          supplierId: 1,
          supplierName: "Fornecedor A",
          price: "15.50",
        },
        {
          name: "Amoxicilina",
          activeIngredient: "Amoxicilina",
          concentration: "500mg",
          presentation: "Comprimido",
          supplierId: 2,
          supplierName: "Fornecedor B",
          price: "16.00",
        },
        {
          name: "Dipirona",
          activeIngredient: "Dipirona",
          concentration: "500mg",
          presentation: "Comprimido",
          supplierId: 1,
          supplierName: "Fornecedor A",
          price: "5.00",
        },
      ];

      const report = detectDuplicatesInBatch(products);

      expect(report.totalProductsInImport).toBe(3);
      expect(report.uniqueProducts).toBe(2);
      expect(report.duplicatesFound).toBe(1);
    });

    it("deve retornar 0 duplicatas se todos produtos são diferentes", () => {
      const products: ImportProduct[] = [
        {
          name: "Produto A",
          concentration: "100mg",
          supplierId: 1,
          price: "10.00",
        },
        {
          name: "Produto B",
          concentration: "200mg",
          supplierId: 1,
          price: "15.00",
        },
      ];

      const report = detectDuplicatesInBatch(products);

      expect(report.duplicatesFound).toBe(0);
      expect(report.uniqueProducts).toBe(2);
    });

    it("deve agrupar fornecedores corretamente", () => {
      const products: ImportProduct[] = [
        {
          name: "Produto",
          concentration: "500mg",
          supplierId: 1,
          supplierName: "Fornecedor A",
          price: "10.00",
        },
        {
          name: "Produto",
          concentration: "500mg",
          supplierId: 2,
          supplierName: "Fornecedor B",
          price: "12.00",
        },
        {
          name: "Produto",
          concentration: "500mg",
          supplierId: 3,
          supplierName: "Fornecedor C",
          price: "11.00",
        },
      ];

      const report = detectDuplicatesInBatch(products);

      expect(report.consolidatedGroups).toHaveLength(1);
      expect(report.consolidatedGroups[0].suppliers).toHaveLength(3);
    });
  });

  describe("groupProductsBySupplierInBatch", () => {
    it("deve agrupar produtos por fornecedor", () => {
      const products: ImportProduct[] = [
        {
          name: "Produto",
          concentration: "500mg",
          supplierId: 1,
          supplierName: "Fornecedor A",
          price: "10.00",
        },
        {
          name: "Produto",
          concentration: "500mg",
          supplierId: 1,
          supplierName: "Fornecedor A",
          price: "10.00",
        },
        {
          name: "Produto",
          concentration: "500mg",
          supplierId: 2,
          supplierName: "Fornecedor B",
          price: "12.00",
        },
      ];

      const grouped = groupProductsBySupplierInBatch(products);

      expect(grouped.size).toBe(1); // Uma assinatura única
      const supplierGroups = grouped.values().next().value;
      expect(supplierGroups.size).toBe(2); // Dois fornecedores
      expect(supplierGroups.get(1)).toHaveLength(2);
      expect(supplierGroups.get(2)).toHaveLength(1);
    });
  });

  describe("prepareConsolidatedForImport", () => {
    it("deve preparar produtos consolidados para importação", () => {
      const products: ImportProduct[] = [
        {
          name: "Amoxicilina",
          activeIngredient: "Amoxicilina",
          concentration: "500mg",
          presentation: "Comprimido",
          supplierId: 1,
          supplierName: "Fornecedor A",
          price: "15.50",
        },
        {
          name: "Amoxicilina",
          activeIngredient: "Amoxicilina",
          concentration: "500mg",
          presentation: "Comprimido",
          supplierId: 2,
          supplierName: "Fornecedor B",
          price: "16.00",
        },
      ];

      const consolidated = prepareConsolidatedForImport(products);

      expect(consolidated).toHaveLength(1);
      expect(consolidated[0].consolidatedPrices.size).toBe(2);
      expect(consolidated[0].consolidatedPrices.get(1)).toBe("15.50");
      expect(consolidated[0].consolidatedPrices.get(2)).toBe("16.00");
    });

    it("deve manter apenas um produto por grupo de duplicatas", () => {
      const products: ImportProduct[] = [
        {
          name: "Produto",
          concentration: "100mg",
          supplierId: 1,
          price: "10.00",
        },
        {
          name: "Produto",
          concentration: "100mg",
          supplierId: 1,
          price: "10.00",
        },
        {
          name: "Produto",
          concentration: "100mg",
          supplierId: 2,
          price: "11.00",
        },
      ];

      const consolidated = prepareConsolidatedForImport(products);

      expect(consolidated).toHaveLength(1);
    });
  });

  describe("calculateConsolidationStats", () => {
    it("deve calcular taxa de consolidação corretamente", () => {
      const report = {
        totalProductsInImport: 100,
        uniqueProducts: 85,
        duplicatesFound: 15,
        consolidatedGroups: [
          {
            signature: "sig1",
            masterName: "Produto 1",
            count: 2,
            suppliers: [
              { id: 1, name: "Fornecedor A", price: "10" },
              { id: 2, name: "Fornecedor B", price: "12" },
            ],
          },
        ],
        newSuppliers: [
          { id: 1, name: "Fornecedor A" },
          { id: 2, name: "Fornecedor B" },
        ],
      };

      const stats = calculateConsolidationStats(report);

      expect(stats.consolidationRate).toBe(15);
      expect(stats.totalUniqueSuppliers).toBe(2);
    });

    it("deve calcular média de fornecedores por produto", () => {
      const report = {
        totalProductsInImport: 10,
        uniqueProducts: 10,
        duplicatesFound: 0,
        consolidatedGroups: [
          {
            signature: "sig1",
            masterName: "Produto 1",
            count: 1,
            suppliers: [
              { id: 1, name: "Fornecedor A", price: "10" },
              { id: 2, name: "Fornecedor B", price: "12" },
            ],
          },
          {
            signature: "sig2",
            masterName: "Produto 2",
            count: 1,
            suppliers: [
              { id: 1, name: "Fornecedor A", price: "15" },
              { id: 2, name: "Fornecedor B", price: "16" },
              { id: 3, name: "Fornecedor C", price: "14" },
            ],
          },
        ],
        newSuppliers: [
          { id: 1, name: "Fornecedor A" },
          { id: 2, name: "Fornecedor B" },
          { id: 3, name: "Fornecedor C" },
        ],
      };

      const stats = calculateConsolidationStats(report);

      expect(stats.avgSuppliersPerProduct).toBe(2.5);
    });

    it("deve contar produtos com múltiplos fornecedores", () => {
      const report = {
        totalProductsInImport: 10,
        uniqueProducts: 10,
        duplicatesFound: 0,
        consolidatedGroups: [
          {
            signature: "sig1",
            masterName: "Produto 1",
            count: 1,
            suppliers: [{ id: 1, name: "Fornecedor A", price: "10" }],
          },
          {
            signature: "sig2",
            masterName: "Produto 2",
            count: 1,
            suppliers: [
              { id: 1, name: "Fornecedor A", price: "15" },
              { id: 2, name: "Fornecedor B", price: "16" },
            ],
          },
        ],
        newSuppliers: [
          { id: 1, name: "Fornecedor A" },
          { id: 2, name: "Fornecedor B" },
        ],
      };

      const stats = calculateConsolidationStats(report);

      expect(stats.productsWithMultipleSuppliers).toBe(1);
    });
  });
});
