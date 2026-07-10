import { describe, it, expect } from "vitest";
import {
  calculateSyncStats,
  comparePriceSnapshots,
  generateSyncSummary,
  PriceUpdate,
  SyncStats,
} from "./priceSyncService";

describe("priceSyncService", () => {
  describe("calculateSyncStats", () => {
    it("should calculate stats from empty updates", () => {
      const stats = calculateSyncStats([]);
      expect(stats.totalProductsUpdated).toBe(0);
      expect(stats.totalPriceChanges).toBe(0);
      expect(stats.newSuppliersAdded).toBe(0);
      expect(stats.averagePriceChange).toBe(0);
    });

    it("should count unique products", () => {
      const updates: PriceUpdate[] = [
        {
          productId: 1,
          productName: "Product 1",
          supplierId: 1,
          supplierName: "Supplier 1",
          oldPrice: 100,
          newPrice: 110,
          priceChange: 10,
          isNewSupplier: false,
          isNewProduct: false,
        },
        {
          productId: 1,
          productName: "Product 1",
          supplierId: 2,
          supplierName: "Supplier 2",
          oldPrice: 105,
          newPrice: 115,
          priceChange: 9.52,
          isNewSupplier: false,
          isNewProduct: false,
        },
      ];

      const stats = calculateSyncStats(updates);
      expect(stats.totalProductsUpdated).toBe(1);
      expect(stats.totalPriceChanges).toBe(2);
    });

    it("should count new suppliers", () => {
      const updates: PriceUpdate[] = [
        {
          productId: 1,
          productName: "Product 1",
          supplierId: 1,
          supplierName: "Supplier 1",
          oldPrice: null,
          newPrice: 100,
          priceChange: null,
          isNewSupplier: true,
          isNewProduct: false,
        },
        {
          productId: 2,
          productName: "Product 2",
          supplierId: 2,
          supplierName: "Supplier 2",
          oldPrice: null,
          newPrice: 200,
          priceChange: null,
          isNewSupplier: true,
          isNewProduct: false,
        },
      ];

      const stats = calculateSyncStats(updates);
      expect(stats.newSuppliersAdded).toBe(2);
    });

    it("should calculate price increases and decreases", () => {
      const updates: PriceUpdate[] = [
        {
          productId: 1,
          productName: "Product 1",
          supplierId: 1,
          supplierName: "Supplier 1",
          oldPrice: 100,
          newPrice: 110,
          priceChange: 10,
          isNewSupplier: false,
          isNewProduct: false,
        },
        {
          productId: 2,
          productName: "Product 2",
          supplierId: 1,
          supplierName: "Supplier 1",
          oldPrice: 100,
          newPrice: 90,
          priceChange: -10,
          isNewSupplier: false,
          isNewProduct: false,
        },
      ];

      const stats = calculateSyncStats(updates);
      expect(stats.priceIncreases).toBe(1);
      expect(stats.priceDecreases).toBe(1);
    });

    it("should calculate average price change", () => {
      const updates: PriceUpdate[] = [
        {
          productId: 1,
          productName: "Product 1",
          supplierId: 1,
          supplierName: "Supplier 1",
          oldPrice: 100,
          newPrice: 110,
          priceChange: 10,
          isNewSupplier: false,
          isNewProduct: false,
        },
        {
          productId: 2,
          productName: "Product 2",
          supplierId: 1,
          supplierName: "Supplier 1",
          oldPrice: 100,
          newPrice: 120,
          priceChange: 20,
          isNewSupplier: false,
          isNewProduct: false,
        },
      ];

      const stats = calculateSyncStats(updates);
      expect(stats.averagePriceChange).toBe(15);
    });
  });

  describe("comparePriceSnapshots", () => {
    it("should detect new products", () => {
      const before = new Map<number, Map<number, number>>();
      const after = new Map<number, Map<number, number>>();

      const supplierPrices = new Map<number, number>();
      supplierPrices.set(1, 100);
      after.set(1, supplierPrices);

      const updates = comparePriceSnapshots(before, after);
      expect(updates.length).toBe(1);
      expect(updates[0].isNewProduct).toBe(true);
      expect(updates[0].isNewSupplier).toBe(true);
    });

    it("should detect price changes", () => {
      const before = new Map<number, Map<number, number>>();
      const beforeSuppliers = new Map<number, number>();
      beforeSuppliers.set(1, 100);
      before.set(1, beforeSuppliers);

      const after = new Map<number, Map<number, number>>();
      const afterSuppliers = new Map<number, number>();
      afterSuppliers.set(1, 110);
      after.set(1, afterSuppliers);

      const updates = comparePriceSnapshots(before, after);
      expect(updates.length).toBe(1);
      expect(updates[0].oldPrice).toBe(100);
      expect(updates[0].newPrice).toBe(110);
      expect(updates[0].priceChange).toBe(10);
    });

    it("should detect new suppliers for existing products", () => {
      const before = new Map<number, Map<number, number>>();
      const beforeSuppliers = new Map<number, number>();
      beforeSuppliers.set(1, 100);
      before.set(1, beforeSuppliers);

      const after = new Map<number, Map<number, number>>();
      const afterSuppliers = new Map<number, number>();
      afterSuppliers.set(1, 100);
      afterSuppliers.set(2, 95);
      after.set(1, afterSuppliers);

      const updates = comparePriceSnapshots(before, after);
      expect(updates.length).toBe(1);
      expect(updates[0].supplierId).toBe(2);
      expect(updates[0].isNewSupplier).toBe(true);
      expect(updates[0].oldPrice).toBeNull();
    });
  });

  describe("generateSyncSummary", () => {
    it("should generate summary with basic stats", () => {
      const stats: SyncStats = {
        totalProductsUpdated: 10,
        totalPriceChanges: 15,
        newSuppliersAdded: 2,
        newProductsAdded: 0,
        averagePriceChange: 5.5,
        priceIncreases: 10,
        priceDecreases: 5,
        priceUpdates: [],
        timestamp: new Date(),
      };

      const summary = generateSyncSummary(stats);
      expect(summary).toContain("10 produtos atualizados");
      expect(summary).toContain("15 mudanças de preço");
      expect(summary).toContain("2 novos fornecedores");
      expect(summary).toContain("10 aumentos de preço");
      expect(summary).toContain("5 reduções de preço");
      expect(summary).toContain("5.50%");
    });

    it("should show upward arrow for positive average change", () => {
      const stats: SyncStats = {
        totalProductsUpdated: 5,
        totalPriceChanges: 5,
        newSuppliersAdded: 0,
        newProductsAdded: 0,
        averagePriceChange: 3.5,
        priceIncreases: 5,
        priceDecreases: 0,
        priceUpdates: [],
        timestamp: new Date(),
      };

      const summary = generateSyncSummary(stats);
      expect(summary).toContain("↑");
    });

    it("should show downward arrow for negative average change", () => {
      const stats: SyncStats = {
        totalProductsUpdated: 5,
        totalPriceChanges: 5,
        newSuppliersAdded: 0,
        newProductsAdded: 0,
        averagePriceChange: -2.5,
        priceIncreases: 0,
        priceDecreases: 5,
        priceUpdates: [],
        timestamp: new Date(),
      };

      const summary = generateSyncSummary(stats);
      expect(summary).toContain("↓");
    });
  });
});
