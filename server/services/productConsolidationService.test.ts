import { describe, it, expect } from "vitest";
import {
  generateProductSignature,
  calculateProductSimilarity,
  groupProductsBySignature,
  updateSupplierPrice,
  extractUniqueSuppliers,
  isConsolidationCandidate,
  detectNewSuppliers,
  type ProductSignature,
  type ConsolidatedProduct,
} from "./productConsolidationService";

describe("productConsolidationService", () => {
  describe("generateProductSignature", () => {
    it("deve gerar assinatura consistente para o mesmo produto", () => {
      const product: ProductSignature = {
        name: "Amoxicilina",
        activeIngredient: "Amoxicilina Trihidratada",
        concentration: "500mg",
        presentation: "Comprimido",
      };

      const sig1 = generateProductSignature(product);
      const sig2 = generateProductSignature(product);

      expect(sig1).toBe(sig2);
    });

    it("deve normalizar espaços e maiúsculas", () => {
      const product1: ProductSignature = {
        name: "  AMOXICILINA  ",
        activeIngredient: "Amoxicilina Trihidratada",
        concentration: "500mg",
        presentation: "Comprimido",
      };

      const product2: ProductSignature = {
        name: "amoxicilina",
        activeIngredient: "amoxicilina trihidratada",
        concentration: "500mg",
        presentation: "comprimido",
      };

      const sig1 = generateProductSignature(product1);
      const sig2 = generateProductSignature(product2);

      expect(sig1).toBe(sig2);
    });

    it("deve lidar com campos nulos", () => {
      const product: ProductSignature = {
        name: "Produto",
        activeIngredient: null,
        concentration: undefined,
        presentation: null,
      };

      const sig = generateProductSignature(product);
      expect(sig).toContain("produto");
    });
  });

  describe("calculateProductSimilarity", () => {
    it("deve retornar 1 para assinaturas idênticas", () => {
      const sig = "amoxicilina|amoxicilinaatrihidratada|500mg|comprimido";
      const similarity = calculateProductSimilarity(sig, sig);

      expect(similarity).toBe(1);
    });

    it("deve retornar score parcial para assinaturas similares", () => {
      const sig1 = "amoxicilina|amoxicilinaatrihidratada|500mg|comprimido";
      const sig2 = "amoxicilina|amoxicilinaatrihidratada|250mg|comprimido";

      const similarity = calculateProductSimilarity(sig1, sig2);
      expect(similarity).toBeGreaterThan(0.5);
      expect(similarity).toBeLessThan(1);
    });

    it("deve retornar score baixo para assinaturas completamente diferentes", () => {
      const sig1 = "amoxicilina|amoxicilinaatrihidratada|500mg|comprimido";
      const sig2 = "dipirona|dipirona|500mg|comprimido";

      const similarity = calculateProductSimilarity(sig1, sig2);
      expect(similarity).toBeLessThanOrEqual(0.5);
    });
  });

  describe("groupProductsBySignature", () => {
    it("deve agrupar produtos com mesma assinatura", () => {
      const products = [
        {
          id: 1,
          name: "Amoxicilina",
          activeIngredient: "Amoxicilina",
          concentration: "500mg",
          presentation: "Comprimido",
          manufacturer: "Lab A",
          category: "Medicamentos",
          description: null,
          imageUrl: null,
          productUrl: null,
          barcode: null,
          mapa: null,
          supplierId: 1,
          supplierName: "Fornecedor A",
          price: "15.50",
        },
        {
          id: 2,
          name: "Amoxicilina",
          activeIngredient: "Amoxicilina",
          concentration: "500mg",
          presentation: "Comprimido",
          manufacturer: "Lab A",
          category: "Medicamentos",
          description: null,
          imageUrl: null,
          productUrl: null,
          barcode: null,
          mapa: null,
          supplierId: 2,
          supplierName: "Fornecedor B",
          price: "16.00",
        },
      ];

      const grouped = groupProductsBySignature(products);

      expect(grouped.size).toBe(1);
      const consolidated = Array.from(grouped.values())[0];
      expect(consolidated.pricesBySupplier.size).toBe(2);
      expect(consolidated.sourceProductIds).toContain(1);
      expect(consolidated.sourceProductIds).toContain(2);
    });

    it("deve manter produtos diferentes em grupos separados", () => {
      const products = [
        {
          id: 1,
          name: "Amoxicilina",
          activeIngredient: "Amoxicilina",
          concentration: "500mg",
          presentation: "Comprimido",
          manufacturer: "Lab A",
          category: "Medicamentos",
          description: null,
          imageUrl: null,
          productUrl: null,
          barcode: null,
          mapa: null,
          supplierId: 1,
          supplierName: "Fornecedor A",
          price: "15.50",
        },
        {
          id: 2,
          name: "Dipirona",
          activeIngredient: "Dipirona",
          concentration: "500mg",
          presentation: "Comprimido",
          manufacturer: "Lab B",
          category: "Medicamentos",
          description: null,
          imageUrl: null,
          productUrl: null,
          barcode: null,
          mapa: null,
          supplierId: 1,
          supplierName: "Fornecedor A",
          price: "5.00",
        },
      ];

      const grouped = groupProductsBySignature(products);

      expect(grouped.size).toBe(2);
    });
  });

  describe("updateSupplierPrice", () => {
    it("deve adicionar novo preço de fornecedor", () => {
      const consolidated: ConsolidatedProduct = {
        masterProductId: "master-1",
        name: "Amoxicilina",
        activeIngredient: "Amoxicilina",
        concentration: "500mg",
        presentation: "Comprimido",
        manufacturer: null,
        category: null,
        description: null,
        imageUrl: null,
        productUrl: null,
        barcode: null,
        mapa: null,
        pricesBySupplier: new Map(),
        sourceProductIds: [1],
      };

      updateSupplierPrice(consolidated, 1, "Fornecedor A", "15.50");

      expect(consolidated.pricesBySupplier.size).toBe(1);
      expect(consolidated.pricesBySupplier.get(1)?.price).toBe("15.50");
    });

    it("deve atualizar preço existente de fornecedor", () => {
      const consolidated: ConsolidatedProduct = {
        masterProductId: "master-1",
        name: "Amoxicilina",
        activeIngredient: "Amoxicilina",
        concentration: "500mg",
        presentation: "Comprimido",
        manufacturer: null,
        category: null,
        description: null,
        imageUrl: null,
        productUrl: null,
        barcode: null,
        mapa: null,
        pricesBySupplier: new Map([[1, { supplierName: "Fornecedor A", price: "15.50" }]]),
        sourceProductIds: [1],
      };

      updateSupplierPrice(consolidated, 1, "Fornecedor A", "14.50");

      expect(consolidated.pricesBySupplier.size).toBe(1);
      expect(consolidated.pricesBySupplier.get(1)?.price).toBe("14.50");
    });
  });

  describe("extractUniqueSuppliers", () => {
    it("deve extrair fornecedores únicos", () => {
      const consolidated: ConsolidatedProduct[] = [
        {
          masterProductId: "master-1",
          name: "Amoxicilina",
          activeIngredient: "Amoxicilina",
          concentration: "500mg",
          presentation: "Comprimido",
          manufacturer: null,
          category: null,
          description: null,
          imageUrl: null,
          productUrl: null,
          barcode: null,
          mapa: null,
          pricesBySupplier: new Map([
            [1, { supplierName: "Fornecedor A", price: "15.50" }],
            [2, { supplierName: "Fornecedor B", price: "16.00" }],
          ]),
          sourceProductIds: [1, 2],
        },
      ];

      const suppliers = extractUniqueSuppliers(consolidated);

      expect(suppliers.length).toBe(2);
      expect(suppliers[0].name).toBe("Fornecedor A");
      expect(suppliers[1].name).toBe("Fornecedor B");
    });
  });

  describe("isConsolidationCandidate", () => {
    it("deve retornar true para produtos similares", () => {
      const product1: ProductSignature = {
        name: "Amoxicilina",
        activeIngredient: "Amoxicilina",
        concentration: "500mg",
        presentation: "Comprimido",
      };

      const product2: ProductSignature = {
        name: "Amoxicilina",
        activeIngredient: "Amoxicilina",
        concentration: "500mg",
        presentation: "Comprimido",
      };

      expect(isConsolidationCandidate(product1, product2)).toBe(true);
    });

    it("deve retornar false para produtos diferentes", () => {
      const product1: ProductSignature = {
        name: "Amoxicilina",
        activeIngredient: "Amoxicilina",
        concentration: "500mg",
        presentation: "Comprimido",
      };

      const product2: ProductSignature = {
        name: "Dipirona",
        activeIngredient: "Dipirona",
        concentration: "500mg",
        presentation: "Comprimido",
      };

      expect(isConsolidationCandidate(product1, product2)).toBe(false);
    });

    it("deve retornar false se um produto não tem nome", () => {
      const product1: ProductSignature = {
        name: "Amoxicilina",
        activeIngredient: "Amoxicilina",
        concentration: "500mg",
        presentation: "Comprimido",
      };

      const product2: ProductSignature = {
        name: "",
        activeIngredient: "Amoxicilina",
        concentration: "500mg",
        presentation: "Comprimido",
      };

      expect(isConsolidationCandidate(product1, product2)).toBe(false);
    });
  });

  describe("detectNewSuppliers", () => {
    it("deve detectar novos fornecedores", () => {
      const existing: ConsolidatedProduct[] = [
        {
          masterProductId: "master-1",
          name: "Amoxicilina",
          activeIngredient: "Amoxicilina",
          concentration: "500mg",
          presentation: "Comprimido",
          manufacturer: null,
          category: null,
          description: null,
          imageUrl: null,
          productUrl: null,
          barcode: null,
          mapa: null,
          pricesBySupplier: new Map([[1, { supplierName: "Fornecedor A", price: "15.50" }]]),
          sourceProductIds: [1],
        },
      ];

      const newProducts = [
        { supplierId: 1, supplierName: "Fornecedor A" },
        { supplierId: 2, supplierName: "Fornecedor B" },
        { supplierId: 3, supplierName: "Fornecedor C" },
      ];

      const newSuppliers = detectNewSuppliers(existing, newProducts);

      expect(newSuppliers.length).toBe(2);
      expect(newSuppliers[0].id).toBe(2);
      expect(newSuppliers[1].id).toBe(3);
    });

    it("deve retornar array vazio se não há novos fornecedores", () => {
      const existing: ConsolidatedProduct[] = [
        {
          masterProductId: "master-1",
          name: "Amoxicilina",
          activeIngredient: "Amoxicilina",
          concentration: "500mg",
          presentation: "Comprimido",
          manufacturer: null,
          category: null,
          description: null,
          imageUrl: null,
          productUrl: null,
          barcode: null,
          mapa: null,
          pricesBySupplier: new Map([
            [1, { supplierName: "Fornecedor A", price: "15.50" }],
            [2, { supplierName: "Fornecedor B", price: "16.00" }],
          ]),
          sourceProductIds: [1, 2],
        },
      ];

      const newProducts = [
        { supplierId: 1, supplierName: "Fornecedor A" },
        { supplierId: 2, supplierName: "Fornecedor B" },
      ];

      const newSuppliers = detectNewSuppliers(existing, newProducts);

      expect(newSuppliers.length).toBe(0);
    });
  });
});
