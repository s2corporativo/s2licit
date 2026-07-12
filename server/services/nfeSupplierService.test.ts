import { describe, it, expect } from "vitest";
import {
  findOrCreateSupplier,
  calculatePriceUpdates,
  generateSupplierImportSummary,
  validateSupplierData,
  detectPriceAnomalies,
  generateSupplierStats,
} from "./nfeSupplierService";

const mockSuppliers = [
  { id: "sup1", name: "Fornecedor A", cnpj: "12345678901234" },
  { id: "sup2", name: "Fornecedor B", cnpj: "98765432109876" },
];

const mockNfeResult = {
  nfeNumber: "12345678",
  supplierName: "Fornecedor Teste",
  supplierCnpj: "11111111111111",
  products: [
    {
      id: "1",
      productName: "Amoxicilina 500mg",
      quantity: 100,
      unitPrice: 15.5,
      totalPrice: 1550,
      matchStatus: "update" as const,
    },
    {
      id: "2",
      productName: "Dipirona 500mg",
      quantity: 200,
      unitPrice: 5.25,
      totalPrice: 1050,
      matchStatus: "new" as const,
    },
  ],
  stats: {
    total: 2,
    new: 1,
    update: 1,
    duplicate: 0,
    unknown: 0,
  },
};

describe("nfeSupplierService", () => {
  describe("findOrCreateSupplier", () => {
    it("should find supplier by CNPJ", async () => {
      const result = await findOrCreateSupplier(
        "Fornecedor A",
        "12345678901234",
        mockSuppliers
      );

      expect(result.id).toBe("sup1");
      expect(result.isNew).toBe(false);
    });

    it("should find supplier by name", async () => {
      const result = await findOrCreateSupplier(
        "Fornecedor A",
        "00000000000000",
        mockSuppliers
      );

      expect(result.id).toBe("sup1");
      expect(result.isNew).toBe(false);
    });

    it("should create new supplier if not found", async () => {
      const result = await findOrCreateSupplier(
        "Novo Fornecedor",
        "55555555555555",
        mockSuppliers
      );

      expect(result.isNew).toBe(true);
      expect(result.id).toContain("supplier_");
    });
  });

  describe("calculatePriceUpdates", () => {
    it("should calculate price changes correctly", () => {
      const products = [
        { productId: "1", supplierId: "sup1", oldPrice: 10, newPrice: 12 },
        { productId: "2", supplierId: "sup1", oldPrice: 20, newPrice: 18 },
      ];

      const updates = calculatePriceUpdates(products);

      expect(updates[0].priceChange).toBe(2);
      expect(updates[0].priceChangePercentage).toBe(20);
      expect(updates[1].priceChange).toBe(-2);
      expect(updates[1].priceChangePercentage).toBe(-10);
    });
  });

  describe("validateSupplierData", () => {
    it("should validate correct supplier data", () => {
      const validation = validateSupplierData("Fornecedor Teste", "12345678901234");

      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);
    });

    it("should detect missing supplier name", () => {
      const validation = validateSupplierData("", "12345678901234");

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes("Nome") || e.includes("nome"))).toBe(true);
    });

    it("should detect invalid CNPJ", () => {
      const validation = validateSupplierData("Fornecedor", "123");

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes("CNPJ"))).toBe(true);
    });
  });

  describe("detectPriceAnomalies", () => {
    it("should detect price spikes", () => {
      const priceUpdates = [
        {
          productId: "1",
          supplierId: "sup1",
          oldPrice: 10,
          newPrice: 60,
          priceChange: 50,
          priceChangePercentage: 500,
        },
      ];

      const anomalies = detectPriceAnomalies(priceUpdates, 50);

      expect(anomalies.length).toBe(1);
      expect(anomalies[0].type).toBe("spike");
    });

    it("should detect price drops", () => {
      const priceUpdates = [
        {
          productId: "1",
          supplierId: "sup1",
          oldPrice: 100,
          newPrice: 40,
          priceChange: -60,
          priceChangePercentage: -60,
        },
      ];

      const anomalies = detectPriceAnomalies(priceUpdates, 50);

      expect(anomalies.length).toBe(1);
      expect(anomalies[0].type).toBe("drop");
    });
  });

  describe("generateSupplierStats", () => {
    it("should generate correct statistics", () => {
      const priceUpdates = [
        {
          productId: "1",
          supplierId: "sup1",
          oldPrice: 10,
          newPrice: 12,
          priceChange: 2,
          priceChangePercentage: 20,
        },
      ];

      const stats = generateSupplierStats(mockNfeResult, priceUpdates);

      expect(stats.totalProducts).toBe(2);
      expect(stats.newProducts).toBe(1);
      expect(stats.updatedProducts).toBe(1);
      expect(stats.totalValue).toBe(2600);
      expect(stats.priceRangeMin).toBe(5.25);
      expect(stats.priceRangeMax).toBe(15.5);
    });
  });

  describe("generateSupplierImportSummary", () => {
    it("should generate import summary", () => {
      const priceUpdates = [
        {
          productId: "1",
          supplierId: "sup1",
          oldPrice: 10,
          newPrice: 12,
          priceChange: 2,
          priceChangePercentage: 20,
        },
      ];

      const summary = generateSupplierImportSummary(mockNfeResult, "sup1", priceUpdates);

      expect(summary).toContain("Fornecedor Teste");
      expect(summary).toContain("12345678");
      expect(summary).toContain("Produtos novos: 1");
      expect(summary).toContain("Produtos com preço atualizado: 1");
    });
  });
});
