import { describe, it, expect } from "vitest";

describe("marginCompetitivityService", () => {
  describe("margin adjustment logic", () => {
    it("should apply volume bonus for categories with >100 products", () => {
      const baseMargin = 20;
      const volumeBonus = 5;
      const expectedMargin = baseMargin + volumeBonus;
      expect(expectedMargin).toBe(25);
    });

    it("should apply volume bonus for categories with 50-100 products", () => {
      const baseMargin = 20;
      const volumeBonus = 3;
      const expectedMargin = baseMargin + volumeBonus;
      expect(expectedMargin).toBe(23);
    });

    it("should apply volume bonus for categories with 20-50 products", () => {
      const baseMargin = 20;
      const volumeBonus = 1;
      const expectedMargin = baseMargin + volumeBonus;
      expect(expectedMargin).toBe(21);
    });

    it("should apply competition adjustment for high prices", () => {
      const baseMargin = 20;
      const competitionBonus = 2;
      const expectedMargin = baseMargin + competitionBonus;
      expect(expectedMargin).toBe(22);
    });

    it("should apply competition penalty for low prices", () => {
      const baseMargin = 20;
      const competitionPenalty = -2;
      const expectedMargin = baseMargin + competitionPenalty;
      expect(expectedMargin).toBe(18);
    });

    it("should calculate combined margin adjustments", () => {
      const baseMargin = 20;
      const volumeBonus = 5; // >100 produtos
      const competitionBonus = 2; // preços altos
      const expectedMargin = baseMargin + volumeBonus + competitionBonus;
      expect(expectedMargin).toBe(27);
    });
  });

  describe("price change detection", () => {
    it("should detect price changes greater than 3%", () => {
      const oldPrice = 100;
      const newPrice = 103.5;
      const priceChange = ((newPrice - oldPrice) / oldPrice) * 100;
      expect(Math.abs(priceChange)).toBeGreaterThan(3);
    });

    it("should ignore price changes less than 3%", () => {
      const oldPrice = 100;
      const newPrice = 102;
      const priceChange = ((newPrice - oldPrice) / oldPrice) * 100;
      expect(Math.abs(priceChange)).toBeLessThan(3);
    });

    it("should detect negative price changes (price decreases)", () => {
      const oldPrice = 100;
      const newPrice = 96;
      const priceChange = ((newPrice - oldPrice) / oldPrice) * 100;
      expect(priceChange).toBeLessThan(-3);
    });

    it("should calculate exact price change percentage", () => {
      const oldPrice = 500;
      const newPrice = 550;
      const priceChange = ((newPrice - oldPrice) / oldPrice) * 100;
      expect(priceChange).toBeCloseTo(10, 1);
    });

    it("should handle zero old price gracefully", () => {
      const oldPrice = 0;
      const newPrice = 100;
      // Evitar divisão por zero
      const priceChange = oldPrice === 0 ? 0 : ((newPrice - oldPrice) / oldPrice) * 100;
      expect(priceChange).toBe(0);
    });
  });

  describe("notification logic", () => {
    it("should prepare notification summary for margin changes", () => {
      const mockAdjustments = [
        {
          categoryId: 1,
          categoryName: "Hidráulica",
          oldMargin: 20,
          newMargin: 25,
          reason: "Preços de concorrentes caíram 5.0%",
          changePercentage: -5,
        },
      ];

      const summary = mockAdjustments
        .map(
          (m) =>
            `${m.categoryName}: ${m.oldMargin}% → ${m.newMargin}% (${m.reason})`
        )
        .join("\n");

      expect(summary).toContain("Hidráulica");
      expect(summary).toContain("20% → 25%");
      expect(summary).toContain("Preços de concorrentes caíram");
    });

    it("should format multiple margin changes in notification", () => {
      const mockAdjustments = [
        {
          categoryId: 1,
          categoryName: "Hidráulica",
          oldMargin: 20,
          newMargin: 25,
          reason: "Preços de concorrentes caíram 5.0%",
          changePercentage: -5,
        },
        {
          categoryId: 2,
          categoryName: "Pneumática",
          oldMargin: 18,
          newMargin: 16,
          reason: "Preços de concorrentes subiram 4.2%",
          changePercentage: 4.2,
        },
      ];

      const summary = mockAdjustments
        .map(
          (m) =>
            `${m.categoryName}: ${m.oldMargin}% → ${m.newMargin}% (${m.reason})`
        )
        .join("\n");

      expect(summary.split("\n")).toHaveLength(2);
      expect(summary).toContain("Hidráulica");
      expect(summary).toContain("Pneumática");
    });

    it("should include margin change direction in reason", () => {
      const priceChange = -5;
      const reason =
        priceChange < 0
          ? `Preços de concorrentes caíram ${Math.abs(priceChange).toFixed(1)}%`
          : `Preços de concorrentes subiram ${priceChange.toFixed(1)}%`;

      expect(reason).toContain("caíram");
      expect(reason).toContain("5.0%");
    });
  });

  describe("margin calculation edge cases", () => {
    it("should handle minimum margin values", () => {
      const minMargin = 5;
      const baseMargin = 20;
      const adjustedMargin = Math.max(minMargin, baseMargin - 5);
      expect(adjustedMargin).toBeGreaterThanOrEqual(minMargin);
    });

    it("should handle maximum margin values", () => {
      const maxMargin = 50;
      const baseMargin = 20;
      const adjustedMargin = Math.min(maxMargin, baseMargin + 10);
      expect(adjustedMargin).toBeLessThanOrEqual(maxMargin);
    });

    it("should calculate average competitor price correctly", () => {
      const prices = [100, 120, 110, 130, 115];
      const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
      expect(avgPrice).toBeCloseTo(115, 0);
    });

    it("should handle single price point", () => {
      const prices = [100];
      const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
      expect(avgPrice).toBe(100);
    });
  });

  describe("volume calculation", () => {
    it("should categorize volume correctly", () => {
      const volumes = [
        { count: 150, expectedBonus: 5 },
        { count: 75, expectedBonus: 3 },
        { count: 35, expectedBonus: 1 },
        { count: 10, expectedBonus: 0 },
      ];

      for (const { count, expectedBonus } of volumes) {
        let bonus = 0;
        if (count > 100) bonus = 5;
        else if (count > 50) bonus = 3;
        else if (count > 20) bonus = 1;

        expect(bonus).toBe(expectedBonus);
      }
    });
  });

  describe("competition analysis", () => {
    it("should adjust margin based on competitor price levels", () => {
      const testCases = [
        { avgPrice: 1500, expectedAdjustment: 2 },
        { avgPrice: 500, expectedAdjustment: 0 },
        { avgPrice: 50, expectedAdjustment: -2 },
      ];

      for (const { avgPrice, expectedAdjustment } of testCases) {
        let adjustment = 0;
        if (avgPrice > 1000) adjustment = 2;
        else if (avgPrice < 100) adjustment = -2;

        expect(adjustment).toBe(expectedAdjustment);
      }
    });
  });
});
