import { describe, it, expect } from "vitest";
import {
  calculateStringSimilarity,
  matchProductToMaster,
  findSimilarMasterProducts,
  calculateMatchingStats,
  groupProductsByMaster,
  type MasterProductMatch,
} from "./productMatchingService";

describe("productMatchingService", () => {
  const mockMasterProducts: MasterProductMatch[] = [
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
    {
      id: 3,
      name: "Ibuprofeno 200mg",
      ean: "7891234567892",
      codigoMapa: "PA0012347/2019",
      concentration: "200mg",
      presentation: "Comprimido",
      manufacturer: "Pharma Lab",
    },
  ];

  describe("calculateStringSimilarity", () => {
    it("should return 1 for identical strings", () => {
      const similarity = calculateStringSimilarity("Amoxicilina", "Amoxicilina");
      expect(similarity).toBe(1);
    });

    it("should return 1 for identical strings with different case", () => {
      const similarity = calculateStringSimilarity("AMOXICILINA", "amoxicilina");
      expect(similarity).toBe(1);
    });

    it("should return high similarity for similar strings", () => {
      const similarity = calculateStringSimilarity("Amoxicilina", "Amoxicilina 500mg");
      expect(similarity).toBeGreaterThan(0.6);
    });

    it("should return 0 for empty strings", () => {
      const similarity = calculateStringSimilarity("", "test");
      expect(similarity).toBe(0);
    });

    it("should calculate Levenshtein distance correctly", () => {
      const similarity = calculateStringSimilarity("Amoxicilina", "Amoxicilina");
      expect(similarity).toBe(1);
    });
  });

  describe("matchProductToMaster", () => {
    it("should match by EAN with priority", async () => {
      const product = {
        name: "Some Product",
        ean: "7891234567890",
        codigoMapa: null,
        concentration: null,
        presentation: null,
      };

      const match = await matchProductToMaster(product, mockMasterProducts);
      expect(match).not.toBeNull();
      expect(match?.matchType).toBe("ean");
      expect(match?.similarity).toBe(1);
      expect(match?.masterProduct.id).toBe(1);
    });

    it("should match by MAPA code", async () => {
      const product = {
        name: "Some Product",
        ean: null,
        codigoMapa: "PA0012346/2019",
        concentration: null,
        presentation: null,
      };

      const match = await matchProductToMaster(product, mockMasterProducts);
      expect(match).not.toBeNull();
      expect(match?.matchType).toBe("mapa");
      expect(match?.masterProduct.id).toBe(2);
    });

    it("should match by name + concentration + presentation", async () => {
      const product = {
        name: "Amoxicilina",
        ean: null,
        codigoMapa: null,
        concentration: "500mg",
        presentation: "Cápsula",
      };

      const match = await matchProductToMaster(product, mockMasterProducts);
      expect(match).not.toBeNull();
      expect(match?.matchType).toBe("name_concentration_presentation");
      expect(match?.masterProduct.id).toBe(1);
    });

    it("should match by name similarity", async () => {
      const product = {
        name: "Amoxicilina 500",
        ean: null,
        codigoMapa: null,
        concentration: null,
        presentation: null,
      };

      const match = await matchProductToMaster(product, mockMasterProducts, 0.7);
      expect(match).not.toBeNull();
      expect(match?.matchType).toBe("name_similarity");
      expect(match?.similarity).toBeGreaterThan(0.7);
    });

    it("should return null for no match", async () => {
      const product = {
        name: "Unknown Product XYZ",
        ean: null,
        codigoMapa: null,
        concentration: null,
        presentation: null,
      };

      const match = await matchProductToMaster(product, mockMasterProducts, 0.9);
      expect(match).toBeNull();
    });
  });

  describe("findSimilarMasterProducts", () => {
    it("should find similar products", async () => {
      const product = {
        name: "Amoxicilina",
        concentration: "500mg",
        presentation: "Cápsula",
      };

      const matches = await findSimilarMasterProducts(product, mockMasterProducts, 0.5, 5);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].masterProduct.name).toContain("Amoxicilina");
    });

    it("should limit results", async () => {
      const product = {
        name: "Product",
        concentration: null,
        presentation: null,
      };

      const matches = await findSimilarMasterProducts(product, mockMasterProducts, 0.1, 2);
      expect(matches.length).toBeLessThanOrEqual(2);
    });

    it("should sort by similarity descending", async () => {
      const product = {
        name: "Amoxicilina",
        concentration: null,
        presentation: null,
      };

      const matches = await findSimilarMasterProducts(product, mockMasterProducts, 0.5, 5);
      for (let i = 0; i < matches.length - 1; i++) {
        expect(matches[i].similarity).toBeGreaterThanOrEqual(matches[i + 1].similarity);
      }
    });
  });

  describe("calculateMatchingStats", () => {
    it("should calculate stats correctly", async () => {
      const products = [
        { name: "Amoxicilina 500mg", ean: "7891234567890", codigoMapa: null, concentration: null, presentation: null },
        { name: "Dipirona", ean: null, codigoMapa: "PA0012346/2019", concentration: null, presentation: null },
        { name: "Unknown Product", ean: null, codigoMapa: null, concentration: null, presentation: null },
      ];

      const stats = await calculateMatchingStats(products, mockMasterProducts);
      expect(stats.totalProducts).toBe(3);
      expect(stats.matchedByEan).toBeGreaterThanOrEqual(0);
      expect(stats.matchedByMapa).toBeGreaterThanOrEqual(0);
    });

    it("should calculate average similarity", async () => {
      const products = [
        { name: "Amoxicilina 500mg", ean: "7891234567890", codigoMapa: null, concentration: null, presentation: null },
      ];

      const stats = await calculateMatchingStats(products, mockMasterProducts);
      expect(stats.averageSimilarity).toBeGreaterThanOrEqual(0);
      expect(stats.averageSimilarity).toBeLessThanOrEqual(1);
    });
  });

  describe("groupProductsByMaster", () => {
    it("should group products by master product", async () => {
      const products = [
        { name: "Amoxicilina 500mg", ean: "7891234567890", codigoMapa: null, concentration: null, presentation: null, manufacturer: null },
        { name: "Amoxicilina", ean: null, codigoMapa: "PA0012345/2019", concentration: null, presentation: null, manufacturer: null },
        { name: "Dipirona", ean: null, codigoMapa: "PA0012346/2019", concentration: null, presentation: null, manufacturer: null },
      ];

      const groupings = await groupProductsByMaster(products, mockMasterProducts);
      expect(groupings.length).toBeGreaterThan(0);
      expect(groupings[0].products.length).toBeGreaterThan(0);
    });

    it("should group multiple products under same master", async () => {
      const products = [
        { name: "Amoxicilina 500mg", ean: "7891234567890", codigoMapa: null, concentration: null, presentation: null, manufacturer: null },
        { name: "Amoxicilina", ean: null, codigoMapa: "PA0012345/2019", concentration: null, presentation: null, manufacturer: null },
      ];

      const groupings = await groupProductsByMaster(products, mockMasterProducts);
      const amoxGrouping = groupings.find(g => g.masterProduct.id === 1);
      expect(amoxGrouping?.products.length).toBe(2);
    });

    it("should handle empty product list", async () => {
      const groupings = await groupProductsByMaster([], mockMasterProducts);
      expect(groupings.length).toBe(0);
    });
  });
});
