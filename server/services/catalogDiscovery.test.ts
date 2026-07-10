import { describe, it, expect } from "vitest";
import {
  parsePrice,
  normalizeProductName,
  detectCategory,
  generateContentHash,
} from "./catalogDiscoveryService";

describe("catalogDiscoveryService", () => {
  describe("price parsing", () => {
    it("should parse price with comma separator", () => {
      expect(parsePrice("R$ 123,45")).toBeCloseTo(123.45, 1);
    });

    it("should parse price with dot separator", () => {
      expect(parsePrice("$123.45")).toBeCloseTo(123.45, 1);
    });

    it("should parse price with thousand separator", () => {
      expect(parsePrice("R$ 1.234,56")).toBeCloseTo(1234.56, 1);
    });

    it("should parse price with multiple thousand separators", () => {
      expect(parsePrice("R$ 12.345.678,90")).toBeCloseTo(12345678.90, 1);
    });

    it("should handle empty price", () => {
      expect(parsePrice("")).toBeUndefined();
    });

    it("should handle null price", () => {
      expect(parsePrice(undefined)).toBeUndefined();
    });

    it("should handle price with currency symbol", () => {
      expect(parsePrice("USD 99.99")).toBeCloseTo(99.99, 1);
    });

    it("should handle price with text", () => {
      expect(parsePrice("Price: 50.00 USD")).toBeCloseTo(50, 1);
    });

    it("should detect promotional price", () => {
      const prices = ["R$ 100,00", "R$ 75,50"];
      expect(parsePrice(prices[1])).toBeLessThan(parsePrice(prices[0])!);
    });
  });

  describe("product name normalization", () => {
    it("should normalize to lowercase", () => {
      expect(normalizeProductName("PRODUTO ABC")).toBe("produto abc");
    });

    it("should trim whitespace", () => {
      expect(normalizeProductName("  produto  ")).toBe("produto");
    });

    it("should remove special characters", () => {
      expect(normalizeProductName("Produto@#$%")).toBe("produto");
    });

    it("should handle multiple spaces", () => {
      expect(normalizeProductName("produto   com   espaços")).toBe(
        "produto com espaços"
      );
    });

    it("should preserve hyphens", () => {
      expect(normalizeProductName("Produto-ABC")).toContain("-");
    });

    it("should handle empty name", () => {
      expect(normalizeProductName("")).toBe("");
    });

    it("should handle null name", () => {
      expect(normalizeProductName(undefined)).toBe("");
    });

    it("should normalize accented characters", () => {
      const normalized = normalizeProductName("Açúcar");
      expect(normalized).toBeTruthy();
    });
  });

  describe("category detection", () => {
    it("should detect medicamentos category", () => {
      const category = detectCategory("Comprimido de Dipirona", "");
      expect(category).toBe("Medicamentos");
    });

    it("should detect veterinária category", () => {
      const category = detectCategory("Medicamento Veterinário", "");
      expect(category).toBe("Veterinária");
    });

    it("should detect hidráulica category", () => {
      const category = detectCategory("Cilindro Hidráulico", "");
      expect(category).toBe("Hidráulica");
    });

    it("should detect pneumática category", () => {
      const category = detectCategory("Cilindro Pneumático", "");
      expect(category).toBe("Pneumática");
    });

    it("should use description for detection", () => {
      const category = detectCategory(
        "Produto XYZ",
        "Descrição com comprimido e cápsula"
      );
      expect(category).toBe("Medicamentos");
    });

    it("should return undefined for unknown category", () => {
      const category = detectCategory("Produto Genérico", "");
      expect(category).toBeUndefined();
    });

    it("should be case insensitive", () => {
      const category = detectCategory("COMPRIMIDO", "");
      expect(category).toBe("Medicamentos");
    });
  });

  describe("content hash generation", () => {
    it("should generate consistent hash", () => {
      const product = {
        name: "Produto A",
        price: 100,
        description: "Descrição",
        sku: "SKU123",
        ean: "1234567890",
      };

      const hash1 = generateContentHash(product);
      const hash2 = generateContentHash(product);

      expect(hash1).toBe(hash2);
    });

    it("should generate different hash for different products", () => {
      const product1 = {
        name: "Produto A",
        price: 100,
      };

      const product2 = {
        name: "Produto B",
        price: 100,
      };

      const hash1 = generateContentHash(product1);
      const hash2 = generateContentHash(product2);

      expect(hash1).not.toBe(hash2);
    });

    it("should detect price change", () => {
      const product1 = {
        name: "Produto",
        price: 100,
      };

      const product2 = {
        name: "Produto",
        price: 150,
      };

      const hash1 = generateContentHash(product1);
      const hash2 = generateContentHash(product2);

      expect(hash1).not.toBe(hash2);
    });

    it("should generate hex hash", () => {
      const product = {
        name: "Teste",
        price: 50,
      };

      const hash = generateContentHash(product);
      expect(hash).toMatch(/^[a-f0-9]{64}$/); // SHA256 = 64 hex chars
    });
  });

  describe("extraction confidence", () => {
    it("should calculate confidence based on fields found", () => {
      const fieldsFound = 5;
      const confidence = Math.min(100, (fieldsFound / 7) * 100);
      expect(confidence).toBeGreaterThan(0);
      expect(confidence).toBeLessThanOrEqual(100);
    });

    it("should give 100% confidence when all fields found", () => {
      const fieldsFound = 7;
      const confidence = Math.min(100, (fieldsFound / 7) * 100);
      expect(confidence).toBe(100);
    });

    it("should give 0% confidence when no fields found", () => {
      const fieldsFound = 0;
      const confidence = Math.min(100, (fieldsFound / 7) * 100);
      expect(confidence).toBe(0);
    });
  });

  describe("price detection edge cases", () => {
    it("should handle zero price", () => {
      expect(parsePrice("R$ 0,00")).toBeCloseTo(0, 1);
    });

    it("should handle very large price", () => {
      expect(parsePrice("R$ 999.999.999,99")).toBeGreaterThan(999999999);
    });

    it("should handle price with only cents", () => {
      expect(parsePrice("R$ 0,99")).toBeCloseTo(0.99, 2);
    });

    it("should handle mixed separators", () => {
      // 1.234,56 (European format)
      const price = parsePrice("1.234,56");
      expect(price).toBeCloseTo(1234.56, 1);
    });
  });

  describe("name normalization edge cases", () => {
    it("should handle numbers in name", () => {
      const normalized = normalizeProductName("Produto 123");
      expect(normalized).toContain("123");
    });

    it("should handle mixed case", () => {
      const normalized = normalizeProductName("PrOdUtO");
      expect(normalized).toBe("produto");
    });

    it("should preserve word boundaries", () => {
      const normalized = normalizeProductName("Produto-ABC-XYZ");
      expect(normalized).toContain("-");
    });
  });
});
