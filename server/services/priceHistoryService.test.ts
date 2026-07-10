import { describe, it, expect } from "vitest";
import {
  comparePriceHistories,
  getHighlightColor,
  formatPriceChange,
  isSignificantChange,
} from "./priceHistoryService";

describe("priceHistoryService", () => {
  describe("comparePriceHistories", () => {
    it("should detect price increases", () => {
      const before = new Map([
        [
          1,
          new Map([
            [1, 100],
            [2, 200],
          ]),
        ],
      ]);

      const after = new Map([
        [
          1,
          new Map([
            [1, 110],
            [2, 200],
          ]),
        ],
      ]);

      const productNames = new Map([[1, "Product 1"]]);
      const supplierNames = new Map([
        [1, "Supplier 1"],
        [2, "Supplier 2"],
      ]);

      const events = comparePriceHistories(
        before,
        after,
        productNames,
        supplierNames
      );

      expect(events).toHaveLength(1);
      expect(events[0].changePercent).toBe(10);
      expect(events[0].isIncrease).toBe(true);
    });

    it("should detect price decreases", () => {
      const before = new Map([
        [
          1,
          new Map([
            [1, 100],
            [2, 200],
          ]),
        ],
      ]);

      const after = new Map([
        [
          1,
          new Map([
            [1, 90],
            [2, 200],
          ]),
        ],
      ]);

      const productNames = new Map([[1, "Product 1"]]);
      const supplierNames = new Map([
        [1, "Supplier 1"],
        [2, "Supplier 2"],
      ]);

      const events = comparePriceHistories(
        before,
        after,
        productNames,
        supplierNames
      );

      expect(events).toHaveLength(1);
      expect(events[0].changePercent).toBe(-10);
      expect(events[0].isIncrease).toBe(false);
    });

    it("should ignore unchanged prices", () => {
      const before = new Map([
        [
          1,
          new Map([
            [1, 100],
            [2, 200],
          ]),
        ],
      ]);

      const after = new Map([
        [
          1,
          new Map([
            [1, 100],
            [2, 200],
          ]),
        ],
      ]);

      const productNames = new Map([[1, "Product 1"]]);
      const supplierNames = new Map([
        [1, "Supplier 1"],
        [2, "Supplier 2"],
      ]);

      const events = comparePriceHistories(
        before,
        after,
        productNames,
        supplierNames
      );

      expect(events).toHaveLength(0);
    });

    it("should handle multiple products and suppliers", () => {
      const before = new Map([
        [
          1,
          new Map([
            [1, 100],
            [2, 200],
          ]),
        ],
        [
          2,
          new Map([
            [1, 300],
            [2, 400],
          ]),
        ],
      ]);

      const after = new Map([
        [
          1,
          new Map([
            [1, 110],
            [2, 200],
          ]),
        ],
        [
          2,
          new Map([
            [1, 300],
            [2, 380],
          ]),
        ],
      ]);

      const productNames = new Map([
        [1, "Product 1"],
        [2, "Product 2"],
      ]);
      const supplierNames = new Map([
        [1, "Supplier 1"],
        [2, "Supplier 2"],
      ]);

      const events = comparePriceHistories(
        before,
        after,
        productNames,
        supplierNames
      );

      expect(events).toHaveLength(2);
      expect(events[0].changePercent).toBe(10);
      expect(events[1].changePercent).toBe(-5);
    });
  });

  describe("getHighlightColor", () => {
    it("should return increase for positive change", () => {
      const color = getHighlightColor(5);
      expect(color).toBe("increase");
    });

    it("should return decrease for negative change", () => {
      const color = getHighlightColor(-5);
      expect(color).toBe("decrease");
    });

    it("should return neutral for zero change", () => {
      const color = getHighlightColor(0);
      expect(color).toBe("neutral");
    });

    it("should return neutral for null change", () => {
      const color = getHighlightColor(null);
      expect(color).toBe("neutral");
    });
  });

  describe("formatPriceChange", () => {
    it("should format positive change", () => {
      const formatted = formatPriceChange(10, 50);
      expect(formatted).toContain("↑");
      expect(formatted).toContain("+");
      expect(formatted).toContain("10.00%");
      expect(formatted).toContain("50.00");
    });

    it("should format negative change", () => {
      const formatted = formatPriceChange(-10, -50);
      expect(formatted).toContain("↓");
      expect(formatted).toContain("10.00%");
      expect(formatted).toContain("50.00");
    });

    it("should return dash for null values", () => {
      const formatted = formatPriceChange(null, null);
      expect(formatted).toBe("—");
    });
  });

  describe("isSignificantChange", () => {
    it("should detect significant increase", () => {
      const significant = isSignificantChange(10, 5);
      expect(significant).toBe(true);
    });

    it("should detect significant decrease", () => {
      const significant = isSignificantChange(-10, 5);
      expect(significant).toBe(true);
    });

    it("should not detect insignificant change", () => {
      const significant = isSignificantChange(2, 5);
      expect(significant).toBe(false);
    });

    it("should use default threshold", () => {
      const significant = isSignificantChange(5);
      expect(significant).toBe(true);
    });

    it("should return false for null change", () => {
      const significant = isSignificantChange(null, 5);
      expect(significant).toBe(false);
    });
  });
});
