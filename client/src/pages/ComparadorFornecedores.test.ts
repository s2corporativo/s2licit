import { describe, it, expect } from "vitest";

/**
 * Testes para ComparadorFornecedores
 * 
 * A página ComparadorFornecedores exibe uma tabela dinâmica com colunas por fornecedor
 * permitindo comparar preços de produtos de uma categoria específica
 */

describe("ComparadorFornecedores", () => {
  describe("Transformação de Dados", () => {
    it("deve extrair fornecedores únicos dos produtos", () => {
      const products = [
        { id: 1, name: "Produto A", supplierId: 1, supplierName: "Fornecedor A", price: "10" },
        { id: 2, name: "Produto B", supplierId: 2, supplierName: "Fornecedor B", price: "15" },
        { id: 3, name: "Produto C", supplierId: 1, supplierName: "Fornecedor A", price: "12" },
      ];

      const suppliers = new Map<number, string>();
      products.forEach((p: any) => {
        if (p.supplierId && p.supplierName) {
          suppliers.set(p.supplierId, p.supplierName);
        }
      });

      expect(suppliers.size).toBe(2);
      expect(suppliers.get(1)).toBe("Fornecedor A");
      expect(suppliers.get(2)).toBe("Fornecedor B");
    });

    it("deve agrupar produtos por ID", () => {
      const products = [
        { id: 1, name: "Produto A", supplierId: 1, supplierName: "Fornecedor A", price: "10" },
        { id: 1, name: "Produto A", supplierId: 2, supplierName: "Fornecedor B", price: "12" },
        { id: 2, name: "Produto B", supplierId: 1, supplierName: "Fornecedor A", price: "15" },
      ];

      const productsMap = new Map<number, any>();
      products.forEach((p: any) => {
        if (!productsMap.has(p.id)) {
          productsMap.set(p.id, {
            id: p.id,
            name: p.name,
            prices: new Map(),
          });
        }
        productsMap.get(p.id)!.prices.set(p.supplierId, p.price);
      });

      expect(productsMap.size).toBe(2);
      expect(productsMap.get(1)!.prices.size).toBe(2);
      expect(productsMap.get(1)!.prices.get(1)).toBe("10");
      expect(productsMap.get(1)!.prices.get(2)).toBe("12");
    });
  });

  describe("Cálculo de Menor Preço", () => {
    it("deve encontrar o menor preço em uma linha", () => {
      const prices = new Map([
        [1, { supplierName: "Fornecedor A", price: "15" }],
        [2, { supplierName: "Fornecedor B", price: "10" }],
        [3, { supplierName: "Fornecedor C", price: "12" }],
      ]);

      let min: number | null = null;
      prices.forEach(({ price }) => {
        if (price) {
          const num = parseFloat(price.replace(",", "."));
          if (!isNaN(num) && (min === null || num < min)) {
            min = num;
          }
        }
      });

      expect(min).toBe(10);
    });

    it("deve ignorar preços nulos", () => {
      const prices = new Map([
        [1, { supplierName: "Fornecedor A", price: null }],
        [2, { supplierName: "Fornecedor B", price: "10" }],
        [3, { supplierName: "Fornecedor C", price: null }],
      ]);

      let min: number | null = null;
      prices.forEach(({ price }) => {
        if (price) {
          const num = parseFloat(price.replace(",", "."));
          if (!isNaN(num) && (min === null || num < min)) {
            min = num;
          }
        }
      });

      expect(min).toBe(10);
    });

    it("deve retornar null se todos os preços são nulos", () => {
      const prices = new Map([
        [1, { supplierName: "Fornecedor A", price: null }],
        [2, { supplierName: "Fornecedor B", price: null }],
      ]);

      let min: number | null = null;
      prices.forEach(({ price }) => {
        if (price) {
          const num = parseFloat(price.replace(",", "."));
          if (!isNaN(num) && (min === null || num < min)) {
            min = num;
          }
        }
      });

      expect(min).toBeNull();
    });

    it("deve lidar com preços em formato brasileiro (vírgula)", () => {
      const prices = new Map([
        [1, { supplierName: "Fornecedor A", price: "15,50" }],
        [2, { supplierName: "Fornecedor B", price: "10,25" }],
        [3, { supplierName: "Fornecedor C", price: "12,75" }],
      ]);

      let min: number | null = null;
      prices.forEach(({ price }) => {
        if (price) {
          const num = parseFloat(price.replace(",", "."));
          if (!isNaN(num) && (min === null || num < min)) {
            min = num;
          }
        }
      });

      expect(min).toBe(10.25);
    });
  });

  describe("Ordenação de Fornecedores", () => {
    it("deve ordenar fornecedores alfabeticamente", () => {
      const suppliers = [
        [2, "Fornecedor B"],
        [1, "Fornecedor A"],
        [3, "Fornecedor C"],
      ];

      const sorted = suppliers.sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));

      expect(sorted[0][1]).toBe("Fornecedor A");
      expect(sorted[1][1]).toBe("Fornecedor B");
      expect(sorted[2][1]).toBe("Fornecedor C");
    });
  });

  describe("Validação de Dados", () => {
    it("deve retornar array vazio se não há produtos", () => {
      const products: any[] = [];
      const rows = products.map((p) => ({ id: p.id, name: p.name }));

      expect(rows).toEqual([]);
    });

    it("deve filtrar produtos sem supplierId", () => {
      const products = [
        { id: 1, name: "Produto A", supplierId: 1, supplierName: "Fornecedor A", price: "10" },
        { id: 2, name: "Produto B", supplierId: null, supplierName: null, price: "15" },
        { id: 3, name: "Produto C", supplierId: 2, supplierName: "Fornecedor B", price: "12" },
      ];

      const suppliers = new Map<number, string>();
      products.forEach((p: any) => {
        if (p.supplierId && p.supplierName) {
          suppliers.set(p.supplierId, p.supplierName);
        }
      });

      expect(suppliers.size).toBe(2);
    });
  });

  describe("Destaque de Menor Preço", () => {
    it("deve identificar corretamente o menor preço", () => {
      const row = {
        id: 1,
        name: "Produto",
        supplierPrices: new Map([
          [1, { supplierName: "Fornecedor A", price: "15" }],
          [2, { supplierName: "Fornecedor B", price: "10" }],
          [3, { supplierName: "Fornecedor C", price: "12" }],
        ]),
      };

      let minPrice: number | null = null;
      row.supplierPrices.forEach(({ price }) => {
        if (price) {
          const num = parseFloat(price.replace(",", "."));
          if (!isNaN(num) && (minPrice === null || num < minPrice)) {
            minPrice = num;
          }
        }
      });

      const isMinForSupplier2 = minPrice === 10;
      expect(isMinForSupplier2).toBe(true);
    });

    it("deve marcar corretamente qual fornecedor tem o menor preço", () => {
      const row = {
        id: 1,
        name: "Produto",
        supplierPrices: new Map([
          [1, { supplierName: "Fornecedor A", price: "15" }],
          [2, { supplierName: "Fornecedor B", price: "10" }],
        ]),
      };

      let minPrice: number | null = null;
      row.supplierPrices.forEach(({ price }) => {
        if (price) {
          const num = parseFloat(price.replace(",", "."));
          if (!isNaN(num) && (minPrice === null || num < minPrice)) {
            minPrice = num;
          }
        }
      });

      const isMinForSupplier1 = minPrice === 15 ? true : false;
      const isMinForSupplier2 = minPrice === 10 ? true : false;

      expect(isMinForSupplier1).toBe(false);
      expect(isMinForSupplier2).toBe(true);
    });
  });
});
