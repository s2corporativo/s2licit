import { describe, it, expect } from "vitest";
import { PricingService, PricingConfiguration } from "./pricingService";

describe("PricingService", () => {
  const baseConfig: PricingConfiguration = {
    supplierId: 1,
    region: "Nacional",
    icmsPercentage: 18,
    ipPercentage: 0,
    pisPercentage: 1.65,
    cofinsPercentage: 7.6,
    freightType: "fixed",
    freightValue: 10,
    marginPercentage: 30,
    roundingMethod: "round",
  };

  describe("calculatePrice", () => {
    it("should calculate final price with all taxes and freight", () => {
      const result = PricingService.calculatePrice(100, baseConfig);

      // Impostos POR DENTRO (% sobre a venda): 27.25% de 257.31 ≈ 70.12
      expect(result.totalTaxAmount).toBeCloseTo(70.12, 1);

      // Frete: 10
      expect(result.freightAmount).toBe(10);

      // Custo de aquisição = 100 + 10 = 110; divisor = 1 - (27.25+30)/100 = 0.4275
      // finalPrice = 110 / 0.4275 = 257.31 (a venda cobre imposto sobre a venda)
      expect(result.finalPrice).toBeCloseTo(257.31, 1);
      // priceBeforeMargin = custo+frete+imposto = 110 + 70.12 = 180.12
      expect(result.priceBeforeMargin).toBeCloseTo(180.12, 1);
      // marginAmount = 257.31 - 180.12 = 77.19 → 30% da venda
      expect(result.marginAmount).toBeCloseTo(77.19, 1);
    });

    it("should handle percentage-based freight", () => {
      const configWithPercentFreight: PricingConfiguration = {
        ...baseConfig,
        freightType: "percentage",
        freightValue: 5, // 5% de frete
      };

      const result = PricingService.calculatePrice(100, configWithPercentFreight);

      // Frete: 100 * 5% = 5
      expect(result.freightAmount).toBe(5);
    });

    it("should respect minimum price limit", () => {
      const configWithMinPrice: PricingConfiguration = {
        ...baseConfig,
        minPrice: 300, // acima do preço natural (~257.31) para exercer o piso
      };

      const result = PricingService.calculatePrice(100, configWithMinPrice);

      // Preço final deve ser elevado ao mínimo 300
      expect(result.finalPrice).toBe(300);
    });

    it("should respect maximum price limit", () => {
      const configWithMaxPrice: PricingConfiguration = {
        ...baseConfig,
        maxPrice: 150,
      };

      const result = PricingService.calculatePrice(100, configWithMaxPrice);

      // Preço final deve ser no máximo 150
      expect(result.finalPrice).toBe(150);
    });

    it("should throw error for invalid base price", () => {
      expect(() => PricingService.calculatePrice(0, baseConfig)).toThrow();
      expect(() => PricingService.calculatePrice(-10, baseConfig)).toThrow();
    });

    it("should handle zero taxes and freight", () => {
      const simpleConfig: PricingConfiguration = {
        ...baseConfig,
        icmsPercentage: 0,
        ipPercentage: 0,
        pisPercentage: 0,
        cofinsPercentage: 0,
        freightValue: 0,
      };

      const result = PricingService.calculatePrice(100, simpleConfig);

      // Sem impostos e frete: custo = 100
      // MARGEM REAL 30%: finalPrice = 100 / (1 - 0.30) = 142.86
      // Verificar: (142.86 - 100) / 142.86 ≈ 30% ✓
      expect(result.finalPrice).toBeCloseTo(142.86, 1);
    });

    it("should apply correct rounding method (ceil)", () => {
      const configCeil: PricingConfiguration = {
        ...baseConfig,
        roundingMethod: "ceil",
      };

      const result = PricingService.calculatePrice(100, configCeil);

      // Resultado deve ser arredondado para cima
      expect(result.finalPrice).toBeGreaterThanOrEqual(178.43);
    });

    it("should apply correct rounding method (floor)", () => {
      const configFloor: PricingConfiguration = {
        ...baseConfig,
        roundingMethod: "floor",
      };

      const result = PricingService.calculatePrice(100, configFloor);

      // Resultado deve ser arredondado para baixo (floor) — natural ~257.31
      expect(result.finalPrice).toBeLessThanOrEqual(257.31);
      expect(result.finalPrice).toBeGreaterThanOrEqual(257.29);
    })
  });

  describe("calculateBatchPrices", () => {
    it("should calculate prices for multiple products", () => {
      const products = [
        { id: 1, basePrice: 100 },
        { id: 2, basePrice: 200 },
        { id: 3, basePrice: 50 },
      ];

      const results = PricingService.calculateBatchPrices(products, baseConfig);

      expect(results).toHaveLength(3);
      expect(results[0].id).toBe(1);
      expect(results[1].id).toBe(2);
      expect(results[2].id).toBe(3);
      expect(results[0].calculation.finalPrice).toBeGreaterThan(0);
    });
  });

  describe("validateConfig", () => {
    it("should validate correct configuration", () => {
      const errors = PricingService.validateConfig(baseConfig);
      expect(errors).toHaveLength(0);
    });

    it("should detect missing supplierId", () => {
      const invalidConfig = { ...baseConfig, supplierId: undefined };
      const errors = PricingService.validateConfig(invalidConfig);
      expect(errors).toContain("supplierId é obrigatório");
    });

    it("should detect negative percentages", () => {
      const invalidConfig = { ...baseConfig, marginPercentage: -10 };
      const errors = PricingService.validateConfig(invalidConfig);
      expect(errors.length).toBeGreaterThan(0);
    });

    it("should detect minPrice > maxPrice", () => {
      const invalidConfig = {
        ...baseConfig,
        minPrice: 200,
        maxPrice: 100,
      };
      const errors = PricingService.validateConfig(invalidConfig);
      expect(errors).toContain("minPrice não pode ser maior que maxPrice");
    });
  });

  describe("calculateSavings", () => {
    it("should calculate savings when new price is lower", () => {
      const result = PricingService.calculateSavings(100, 80);

      expect(result.savingsAmount).toBe(20);
      expect(result.savingsPercentage).toBe(20);
      expect(result.isIncrease).toBe(false);
    });

    it("should calculate increase when new price is higher", () => {
      const result = PricingService.calculateSavings(100, 130);

      expect(result.savingsAmount).toBe(-30);
      expect(result.savingsPercentage).toBe(-30);
      expect(result.isIncrease).toBe(true);
    });
  });

  describe("getDefaultConfig", () => {
    it("should return default configuration", () => {
      const config = PricingService.getDefaultConfig(5);

      expect(config.supplierId).toBe(5);
      expect(config.region).toBe("Nacional");
      expect(config.marginPercentage).toBe(30);
      expect(config.icmsPercentage).toBe(0);
      expect(config.freightType).toBe("fixed");
    });
  });
});
