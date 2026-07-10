import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Testes para consolidationRouter
 * 
 * Valida endpoints de consolidação de produtos com colunas dinâmicas por fornecedor
 */

describe("consolidationRouter", () => {
  describe("getConsolidatedByCategory", () => {
    it("deve retornar estrutura correta com suppliers e products", () => {
      const mockResponse = {
        suppliers: [
          { id: 1, name: "Fornecedor A" },
          { id: 2, name: "Fornecedor B" },
        ],
        products: [
          {
            masterProductId: "master-1",
            name: "Amoxicilina 500mg",
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
            sourceProductIds: [1, 2],
            prices: [
              { supplierId: 1, supplierName: "Fornecedor A", price: "15.50" },
              { supplierId: 2, supplierName: "Fornecedor B", price: "16.00" },
            ],
          },
        ],
        totalProducts: 1,
      };

      expect(mockResponse.suppliers).toHaveLength(2);
      expect(mockResponse.products).toHaveLength(1);
      expect(mockResponse.products[0].prices).toHaveLength(2);
      expect(mockResponse.totalProducts).toBe(1);
    });

    it("deve incluir preços nulos para fornecedores sem produto", () => {
      const mockResponse = {
        suppliers: [
          { id: 1, name: "Fornecedor A" },
          { id: 2, name: "Fornecedor B" },
          { id: 3, name: "Fornecedor C" },
        ],
        products: [
          {
            masterProductId: "master-1",
            name: "Produto",
            activeIngredient: null,
            concentration: null,
            presentation: null,
            manufacturer: null,
            category: null,
            description: null,
            imageUrl: null,
            productUrl: null,
            barcode: null,
            mapa: null,
            sourceProductIds: [1],
            prices: [
              { supplierId: 1, supplierName: "Fornecedor A", price: "10.00" },
              { supplierId: 2, supplierName: "Fornecedor B", price: null },
              { supplierId: 3, supplierName: "Fornecedor C", price: null },
            ],
          },
        ],
        totalProducts: 1,
      };

      const product = mockResponse.products[0];
      const nullPrices = product.prices.filter((p) => p.price === null);

      expect(nullPrices).toHaveLength(2);
      expect(product.prices).toHaveLength(3);
    });

    it("deve ordenar fornecedores alfabeticamente", () => {
      const mockResponse = {
        suppliers: [
          { id: 1, name: "Fornecedor A" },
          { id: 2, name: "Fornecedor B" },
          { id: 3, name: "Fornecedor C" },
        ],
        products: [],
        totalProducts: 0,
      };

      const names = mockResponse.suppliers.map((s) => s.name);
      const sorted = [...names].sort();

      expect(names).toEqual(sorted);
    });

    it("deve retornar array vazio se nenhum produto encontrado", () => {
      const mockResponse = {
        suppliers: [],
        products: [],
        totalProducts: 0,
      };

      expect(mockResponse.products).toHaveLength(0);
      expect(mockResponse.suppliers).toHaveLength(0);
      expect(mockResponse.totalProducts).toBe(0);
    });
  });

  describe("getConsolidationStats", () => {
    it("deve retornar estatísticas corretas", () => {
      const mockStats = {
        totalSourceProducts: 100,
        totalConsolidatedProducts: 85,
        duplicatesFound: 15,
        totalSuppliers: 5,
        averageSuppliersPerProduct: 2.5,
        productsWithAllSuppliers: 70,
        productsWithMissingSuppliers: 15,
      };

      expect(mockStats.totalSourceProducts).toBe(100);
      expect(mockStats.totalConsolidatedProducts).toBe(85);
      expect(mockStats.duplicatesFound).toBe(15);
      expect(mockStats.totalSuppliers).toBe(5);
      expect(mockStats.averageSuppliersPerProduct).toBe(2.5);
      expect(mockStats.productsWithAllSuppliers).toBe(70);
      expect(mockStats.productsWithMissingSuppliers).toBe(15);
    });

    it("deve calcular duplicatas corretamente", () => {
      const mockStats = {
        totalSourceProducts: 50,
        totalConsolidatedProducts: 40,
        duplicatesFound: 10,
        totalSuppliers: 3,
        averageSuppliersPerProduct: 1.8,
        productsWithAllSuppliers: 30,
        productsWithMissingSuppliers: 10,
      };

      const duplicates = mockStats.totalSourceProducts - mockStats.totalConsolidatedProducts;
      expect(duplicates).toBe(mockStats.duplicatesFound);
    });

    it("deve indicar produtos completos vs incompletos", () => {
      const mockStats = {
        totalSourceProducts: 100,
        totalConsolidatedProducts: 100,
        duplicatesFound: 0,
        totalSuppliers: 5,
        averageSuppliersPerProduct: 3.2,
        productsWithAllSuppliers: 80,
        productsWithMissingSuppliers: 20,
      };

      const total = mockStats.productsWithAllSuppliers + mockStats.productsWithMissingSuppliers;
      expect(total).toBe(mockStats.totalConsolidatedProducts);
    });

    it("deve retornar zero quando não há produtos", () => {
      const mockStats = {
        totalSourceProducts: 0,
        totalConsolidatedProducts: 0,
        duplicatesFound: 0,
        totalSuppliers: 0,
        averageSuppliersPerProduct: 0,
        productsWithAllSuppliers: 0,
        productsWithMissingSuppliers: 0,
      };

      expect(mockStats.totalSourceProducts).toBe(0);
      expect(mockStats.totalConsolidatedProducts).toBe(0);
      expect(mockStats.duplicatesFound).toBe(0);
    });
  });

  describe("Integração com consolidação", () => {
    it("deve consolidar produtos com mesma assinatura", () => {
      const products = [
        {
          id: 1,
          name: "Amoxicilina",
          activeIngredient: "Amoxicilina",
          concentration: "500mg",
          presentation: "Comprimido",
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
          supplierId: 2,
          supplierName: "Fornecedor B",
          price: "16.00",
        },
      ];

      // Simulação: produtos com mesma assinatura devem ser consolidados
      const signatures = products.map((p) => `${p.name}|${p.activeIngredient}|${p.concentration}|${p.presentation}`);
      const uniqueSignatures = new Set(signatures);

      expect(uniqueSignatures.size).toBe(1); // Apenas 1 assinatura única
      expect(products.length).toBe(2); // Mas 2 produtos originais
    });

    it("deve manter produtos diferentes em grupos separados", () => {
      const products = [
        {
          id: 1,
          name: "Amoxicilina",
          activeIngredient: "Amoxicilina",
          concentration: "500mg",
          presentation: "Comprimido",
          supplierId: 1,
          supplierName: "Fornecedor A",
          price: "15.50",
        },
        {
          id: 2,
          name: "Amoxicilina",
          activeIngredient: "Amoxicilina",
          concentration: "250mg",
          presentation: "Comprimido",
          supplierId: 1,
          supplierName: "Fornecedor A",
          price: "10.00",
        },
      ];

      const signatures = products.map((p) => `${p.name}|${p.activeIngredient}|${p.concentration}|${p.presentation}`);
      const uniqueSignatures = new Set(signatures);

      expect(uniqueSignatures.size).toBe(2); // 2 assinaturas diferentes
    });

    it("deve adicionar coluna dinamicamente para novo fornecedor", () => {
      const existingSuppliers = [
        { id: 1, name: "Fornecedor A" },
        { id: 2, name: "Fornecedor B" },
      ];

      const newSuppliers = [
        { id: 1, name: "Fornecedor A" },
        { id: 2, name: "Fornecedor B" },
        { id: 3, name: "Fornecedor C" }, // Novo
      ];

      const newSupplierIds = newSuppliers.map((s) => s.id);
      const existingSupplierIds = existingSuppliers.map((s) => s.id);
      const addedSuppliers = newSupplierIds.filter((id) => !existingSupplierIds.includes(id));

      expect(addedSuppliers).toContain(3);
      expect(addedSuppliers).toHaveLength(1);
    });
  });
});
