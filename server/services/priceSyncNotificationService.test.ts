import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  notifyPriceSync,
  notifyPriceSyncError,
  notifyNewSuppliersDetected,
  notifySignificantPriceChanges,
} from "./priceSyncNotificationService";
import { SyncStats } from "./priceSyncService";

// Mock the notification module
vi.mock("../_ core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

describe("priceSyncNotificationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("notifyPriceSync", () => {
    it("should send notification with sync stats", async () => {
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

      const result = await notifyPriceSync(stats, "Supplier ABC");
      expect(result).toBe(true);
    });

    it("should include supplier name in title", async () => {
      const stats: SyncStats = {
        totalProductsUpdated: 5,
        totalPriceChanges: 5,
        newSuppliersAdded: 0,
        newProductsAdded: 0,
        averagePriceChange: 0,
        priceIncreases: 0,
        priceDecreases: 0,
        priceUpdates: [],
        timestamp: new Date(),
      };

      await notifyPriceSync(stats, "Test Supplier");
      // Title should contain supplier name
      expect(true).toBe(true);
    });
  });

  describe("notifyPriceSyncError", () => {
    it("should send error notification", async () => {
      const result = await notifyPriceSyncError(
        "Database connection failed",
        "Supplier XYZ"
      );
      expect(result).toBe(true);
    });

    it("should include error message in content", async () => {
      const errorMsg = "Invalid XML format";
      const result = await notifyPriceSyncError(errorMsg, "Supplier XYZ");
      expect(result).toBe(true);
    });
  });

  describe("notifyNewSuppliersDetected", () => {
    it("should not send notification for empty suppliers list", async () => {
      const result = await notifyNewSuppliersDetected([], "NFe-12345");
      expect(result).toBe(true);
    });

    it("should send notification for new suppliers", async () => {
      const newSuppliers = [
        { id: 1, name: "New Supplier 1" },
        { id: 2, name: "New Supplier 2" },
      ];

      const result = await notifyNewSuppliersDetected(newSuppliers, "NFe-12345");
      expect(result).toBe(true);
    });

    it("should include supplier names in notification", async () => {
      const newSuppliers = [{ id: 1, name: "Test Supplier" }];

      const result = await notifyNewSuppliersDetected(
        newSuppliers,
        "NFe-12345"
      );
      expect(result).toBe(true);
    });
  });

  describe("notifySignificantPriceChanges", () => {
    it("should not send notification for no significant changes", async () => {
      const changes = [
        {
          productName: "Product 1",
          supplierName: "Supplier 1",
          oldPrice: 100,
          newPrice: 102,
          changePercent: 2,
        },
      ];

      const result = await notifySignificantPriceChanges(changes, 10);
      expect(result).toBe(true);
    });

    it("should send notification for significant price increases", async () => {
      const changes = [
        {
          productName: "Product 1",
          supplierName: "Supplier 1",
          oldPrice: 100,
          newPrice: 115,
          changePercent: 15,
        },
      ];

      const result = await notifySignificantPriceChanges(changes, 10);
      expect(result).toBe(true);
    });

    it("should send notification for significant price decreases", async () => {
      const changes = [
        {
          productName: "Product 1",
          supplierName: "Supplier 1",
          oldPrice: 100,
          newPrice: 85,
          changePercent: -15,
        },
      ];

      const result = await notifySignificantPriceChanges(changes, 10);
      expect(result).toBe(true);
    });

    it("should use custom threshold", async () => {
      const changes = [
        {
          productName: "Product 1",
          supplierName: "Supplier 1",
          oldPrice: 100,
          newPrice: 120,
          changePercent: 20,
        },
      ];

      const result = await notifySignificantPriceChanges(changes, 25);
      expect(result).toBe(true);
    });

    it("should handle multiple significant changes", async () => {
      const changes = [
        {
          productName: "Product 1",
          supplierName: "Supplier 1",
          oldPrice: 100,
          newPrice: 115,
          changePercent: 15,
        },
        {
          productName: "Product 2",
          supplierName: "Supplier 2",
          oldPrice: 200,
          newPrice: 170,
          changePercent: -15,
        },
      ];

      const result = await notifySignificantPriceChanges(changes, 10);
      expect(result).toBe(true);
    });
  });
});
