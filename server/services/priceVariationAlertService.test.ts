import { describe, it, expect } from "vitest";
import {
  calculateVariationPercentage,
  determineSeverity,
  shouldTriggerAlert,
  createPriceVariationAlert,
  filterAlertsBySeverity,
  getCriticalAlerts,
  groupAlertsByProduct,
  calculateAlertStats,
  generateAlertSummary,
  acknowledgeAlert,
  acknowledgeAlerts,
  type PriceAlertConfig,
  type PriceVariationAlert,
} from "./priceVariationAlertService";

describe("priceVariationAlertService", () => {
  describe("calculateVariationPercentage", () => {
    it("should calculate positive variation correctly", () => {
      const result = calculateVariationPercentage(100, 110);
      expect(result).toBe(10);
    });

    it("should calculate negative variation correctly", () => {
      const result = calculateVariationPercentage(100, 90);
      expect(result).toBe(-10);
    });

    it("should handle zero previous price", () => {
      const result = calculateVariationPercentage(0, 100);
      expect(result).toBe(0);
    });

    it("should calculate large variations", () => {
      const result = calculateVariationPercentage(100, 250);
      expect(result).toBe(150);
    });
  });

  describe("determineSeverity", () => {
    const config: PriceAlertConfig = {
      lowVariationThreshold: 5,
      mediumVariationThreshold: 10,
      highVariationThreshold: 20,
      criticalVariationThreshold: 30,
      enableNotifications: true,
      notifyOnIncrease: true,
      notifyOnDecrease: true,
    };

    it("should return low severity for small variations", () => {
      expect(determineSeverity(3, config)).toBe("low");
      expect(determineSeverity(5, config)).toBe("low");
    });

    it("should return medium severity for medium variations", () => {
      expect(determineSeverity(10, config)).toBe("medium");
      expect(determineSeverity(15, config)).toBe("medium");
    });

    it("should return high severity for high variations", () => {
      expect(determineSeverity(20, config)).toBe("high");
      expect(determineSeverity(25, config)).toBe("high");
    });

    it("should return critical severity for critical variations", () => {
      expect(determineSeverity(30, config)).toBe("critical");
      expect(determineSeverity(50, config)).toBe("critical");
    });

    it("should handle negative variations", () => {
      expect(determineSeverity(-5, config)).toBe("low");
      expect(determineSeverity(-30, config)).toBe("critical");
    });
  });

  describe("shouldTriggerAlert", () => {
    const config: PriceAlertConfig = {
      lowVariationThreshold: 5,
      mediumVariationThreshold: 10,
      highVariationThreshold: 20,
      criticalVariationThreshold: 30,
      enableNotifications: true,
      notifyOnIncrease: true,
      notifyOnDecrease: true,
    };

    it("should trigger alert for variation above threshold", () => {
      expect(shouldTriggerAlert(10, "increase", config)).toBe(true);
      expect(shouldTriggerAlert(-10, "decrease", config)).toBe(true);
    });

    it("should not trigger alert for variation below threshold", () => {
      expect(shouldTriggerAlert(2, "increase", config)).toBe(false);
    });

    it("should respect notifyOnIncrease setting", () => {
      const configNoIncrease = { ...config, notifyOnIncrease: false };
      expect(shouldTriggerAlert(10, "increase", configNoIncrease)).toBe(false);
      expect(shouldTriggerAlert(-10, "decrease", configNoIncrease)).toBe(true);
    });

    it("should respect notifyOnDecrease setting", () => {
      const configNoDecrease = { ...config, notifyOnDecrease: false };
      expect(shouldTriggerAlert(10, "increase", configNoDecrease)).toBe(true);
      expect(shouldTriggerAlert(-10, "decrease", configNoDecrease)).toBe(false);
    });

    it("should not trigger alert if notifications disabled", () => {
      const configDisabled = { ...config, enableNotifications: false };
      expect(shouldTriggerAlert(50, "increase", configDisabled)).toBe(false);
    });
  });

  describe("createPriceVariationAlert", () => {
    it("should create alert with increase variation", () => {
      const alert = createPriceVariationAlert(1, "Product A", 100, 110);
      expect(alert.productId).toBe(1);
      expect(alert.productName).toBe("Product A");
      expect(alert.previousPrice).toBe(100);
      expect(alert.currentPrice).toBe(110);
      expect(alert.variationPercentage).toBe(10);
      expect(alert.variationType).toBe("increase");
      expect(alert.severity).toBe("medium");
      expect(alert.acknowledged).toBe(false);
    });

    it("should create alert with decrease variation", () => {
      const alert = createPriceVariationAlert(1, "Product A", 100, 70);
      expect(alert.variationType).toBe("decrease");
      expect(alert.variationPercentage).toBe(-30);
      expect(alert.severity).toBe("critical");
    });

    it("should include supplier information", () => {
      const alert = createPriceVariationAlert(1, "Product A", 100, 110, 5, "Supplier X");
      expect(alert.supplierId).toBe(5);
      expect(alert.supplierName).toBe("Supplier X");
    });

    it("should use custom config", () => {
      const customConfig: PriceAlertConfig = {
        lowVariationThreshold: 20,
        mediumVariationThreshold: 30,
        highVariationThreshold: 40,
        criticalVariationThreshold: 50,
        enableNotifications: true,
        notifyOnIncrease: true,
        notifyOnDecrease: true,
      };
      const alert = createPriceVariationAlert(1, "Product A", 100, 110, undefined, undefined, customConfig);
      expect(alert.severity).toBe("low");
    });
  });

  describe("filterAlertsBySeverity", () => {
    const alerts: PriceVariationAlert[] = [
      {
        productId: 1,
        productName: "A",
        previousPrice: 100,
        currentPrice: 110,
        variationPercentage: 10,
        variationType: "increase",
        severity: "low",
        createdAt: new Date(),
        acknowledged: false,
      },
      {
        productId: 2,
        productName: "B",
        previousPrice: 100,
        currentPrice: 150,
        variationPercentage: 50,
        variationType: "increase",
        severity: "critical",
        createdAt: new Date(),
        acknowledged: false,
      },
    ];

    it("should filter alerts by severity", () => {
      const critical = filterAlertsBySeverity(alerts, "critical");
      expect(critical).toHaveLength(1);
      expect(critical[0].productId).toBe(2);
    });
  });

  describe("getCriticalAlerts", () => {
    const alerts: PriceVariationAlert[] = [
      {
        productId: 1,
        productName: "A",
        previousPrice: 100,
        currentPrice: 110,
        variationPercentage: 10,
        variationType: "increase",
        severity: "low",
        createdAt: new Date(),
        acknowledged: false,
      },
      {
        productId: 2,
        productName: "B",
        previousPrice: 100,
        currentPrice: 150,
        variationPercentage: 50,
        variationType: "increase",
        severity: "critical",
        createdAt: new Date(),
        acknowledged: false,
      },
    ];

    it("should return only critical alerts", () => {
      const critical = getCriticalAlerts(alerts);
      expect(critical).toHaveLength(1);
      expect(critical[0].severity).toBe("critical");
    });
  });

  describe("groupAlertsByProduct", () => {
    const alerts: PriceVariationAlert[] = [
      {
        productId: 1,
        productName: "A",
        previousPrice: 100,
        currentPrice: 110,
        variationPercentage: 10,
        variationType: "increase",
        severity: "low",
        createdAt: new Date(),
        acknowledged: false,
      },
      {
        productId: 1,
        productName: "A",
        previousPrice: 110,
        currentPrice: 120,
        variationPercentage: 9,
        variationType: "increase",
        severity: "low",
        createdAt: new Date(),
        acknowledged: false,
      },
    ];

    it("should group alerts by product ID", () => {
      const grouped = groupAlertsByProduct(alerts);
      expect(grouped.size).toBe(1);
      expect(grouped.get(1)).toHaveLength(2);
    });
  });

  describe("calculateAlertStats", () => {
    const alerts: PriceVariationAlert[] = [
      {
        productId: 1,
        productName: "A",
        previousPrice: 100,
        currentPrice: 110,
        variationPercentage: 10,
        variationType: "increase",
        severity: "low",
        createdAt: new Date(),
        acknowledged: false,
      },
      {
        productId: 2,
        productName: "B",
        previousPrice: 100,
        currentPrice: 150,
        variationPercentage: 50,
        variationType: "increase",
        severity: "critical",
        createdAt: new Date(),
        acknowledged: true,
      },
    ];

    it("should calculate correct statistics", () => {
      const stats = calculateAlertStats(alerts);
      expect(stats.total).toBe(2);
      expect(stats.critical).toBe(1);
      expect(stats.low).toBe(1);
      expect(stats.acknowledged).toBe(1);
      expect(stats.unacknowledged).toBe(1);
      expect(stats.averageVariation).toBe(30);
      expect(stats.maxVariation).toBe(50);
      expect(stats.minVariation).toBe(10);
    });
  });

  describe("generateAlertSummary", () => {
    const alerts: PriceVariationAlert[] = [
      {
        productId: 1,
        productName: "Product A",
        previousPrice: 100,
        currentPrice: 150,
        variationPercentage: 50,
        variationType: "increase",
        severity: "critical",
        createdAt: new Date(),
        acknowledged: false,
      },
    ];

    it("should generate summary with critical alerts", () => {
      const summary = generateAlertSummary(alerts);
      expect(summary).toContain("RESUMO DE ALERTAS");
      expect(summary).toContain("Total de alertas: 1");
      expect(summary).toContain("Críticos: 1");
      expect(summary).toContain("Product A");
    });
  });

  describe("acknowledgeAlert", () => {
    const alert: PriceVariationAlert = {
      productId: 1,
      productName: "A",
      previousPrice: 100,
      currentPrice: 110,
      variationPercentage: 10,
      variationType: "increase",
      severity: "low",
      createdAt: new Date(),
      acknowledged: false,
    };

    it("should mark alert as acknowledged", () => {
      const acknowledged = acknowledgeAlert(alert);
      expect(acknowledged.acknowledged).toBe(true);
    });

    it("should not modify original alert", () => {
      acknowledgeAlert(alert);
      expect(alert.acknowledged).toBe(false);
    });
  });

  describe("acknowledgeAlerts", () => {
    const alerts: PriceVariationAlert[] = [
      {
        productId: 1,
        productName: "A",
        previousPrice: 100,
        currentPrice: 110,
        variationPercentage: 10,
        variationType: "increase",
        severity: "low",
        createdAt: new Date(),
        acknowledged: false,
      },
      {
        productId: 2,
        productName: "B",
        previousPrice: 100,
        currentPrice: 120,
        variationPercentage: 20,
        variationType: "increase",
        severity: "high",
        createdAt: new Date(),
        acknowledged: false,
      },
    ];

    it("should acknowledge all alerts", () => {
      const acknowledged = acknowledgeAlerts(alerts);
      expect(acknowledged).toHaveLength(2);
      expect(acknowledged.every(a => a.acknowledged)).toBe(true);
    });
  });
});
