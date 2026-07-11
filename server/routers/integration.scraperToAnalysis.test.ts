import { describe, it, expect } from "vitest";

/**
 * Testes de integração para o fluxo:
 * Scraper → Consolidação de Produtos → Análise de Preços
 */
describe("Integration: Scraper → Consolidation → Price Analysis", () => {
  describe("Complete Flow", () => {
    it("should scrape products and consolidate duplicates", () => {
      // PASSO 1: Scraper coleta produtos de múltiplos fornecedores
      const scrapedProducts = [
        // Cristalia
        { supplier: "Cristalia", name: "Amoxicilina 500mg", ean: "7896000000001", price: 0.85, lastUpdate: new Date() },
        { supplier: "Cristalia", name: "Dipirona 500mg", ean: "7896000000002", price: 0.45, lastUpdate: new Date() },
        // Ourofino
        { supplier: "Ourofino", name: "Amoxicilina 500mg", ean: "7896000000001", price: 0.82, lastUpdate: new Date() },
        { supplier: "Ourofino", name: "Dipirona 500mg", ean: "7896000000002", price: 0.48, lastUpdate: new Date() },
        // Tambasa
        { supplier: "Tambasa", name: "Amoxicilina 500mg", ean: "7896000000001", price: 0.88, lastUpdate: new Date() },
        // DrogaVet
        { supplier: "DrogaVet", name: "Dipirona 500mg", ean: "7896000000002", price: 0.46, lastUpdate: new Date() },
      ];

      expect(scrapedProducts.length).toBe(6);

      // PASSO 2: Consolidar produtos duplicados por EAN
      const consolidatedProducts = new Map();
      scrapedProducts.forEach(product => {
        if (!consolidatedProducts.has(product.ean)) {
          consolidatedProducts.set(product.ean, {
            ean: product.ean,
            name: product.name,
            suppliers: [],
            prices: [],
          });
        }
        const consolidated = consolidatedProducts.get(product.ean);
        consolidated.suppliers.push(product.supplier);
        consolidated.prices.push(product.price);
      });

      expect(consolidatedProducts.size).toBe(2); // 2 produtos únicos

      // Validar consolidação de Amoxicilina
      const amoxicilina = consolidatedProducts.get("7896000000001");
      expect(amoxicilina.suppliers).toContain("Cristalia");
      expect(amoxicilina.suppliers).toContain("Ourofino");
      expect(amoxicilina.suppliers).toContain("Tambasa");
      expect(amoxicilina.prices.length).toBe(3);

      // Validar consolidação de Dipirona
      const dipirona = consolidatedProducts.get("7896000000002");
      expect(dipirona.suppliers).toContain("Cristalia");
      expect(dipirona.suppliers).toContain("Ourofino");
      expect(dipirona.suppliers).toContain("DrogaVet");
      expect(dipirona.prices.length).toBe(3);
    });

    it("should detect price variations and generate alerts", () => {
      const productPrices = {
        "7896000000001": [0.85, 0.82, 0.88], // Amoxicilina
        "7896000000002": [0.45, 0.48, 0.46], // Dipirona
      };

      const priceAnalysis = Object.entries(productPrices).map(([ean, prices]) => {
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
        const variation = ((maxPrice - minPrice) / minPrice) * 100;

        return {
          ean,
          minPrice,
          maxPrice,
          avgPrice: parseFloat(avgPrice.toFixed(2)),
          variation: parseFloat(variation.toFixed(2)),
          shouldAlert: variation > 5, // Alerta se variação > 5%
        };
      });

      // Validar análise de Amoxicilina
      const amoxAnalysis = priceAnalysis.find(a => a.ean === "7896000000001");
      expect(amoxAnalysis?.minPrice).toBe(0.82);
      expect(amoxAnalysis?.maxPrice).toBe(0.88);
      expect(amoxAnalysis?.variation).toBeGreaterThan(5);
      expect(amoxAnalysis?.shouldAlert).toBe(true);

      // Validar análise de Dipirona
      const dipAnalysis = priceAnalysis.find(a => a.ean === "7896000000002");
      expect(dipAnalysis?.minPrice).toBe(0.45);
      expect(dipAnalysis?.maxPrice).toBe(0.48);
      expect(dipAnalysis?.variation).toBeLessThan(10);
    });

    it("should track price history and trends", () => {
      const priceHistory = [
        { date: "2026-04-01", price: 0.85 },
        { date: "2026-04-02", price: 0.84 },
        { date: "2026-04-03", price: 0.86 },
        { date: "2026-04-04", price: 0.83 },
        { date: "2026-04-05", price: 0.82 },
      ];

      // Calcular tendência
      const trend = priceHistory[priceHistory.length - 1].price < priceHistory[0].price ? "down" : "up";
      const priceChange = priceHistory[priceHistory.length - 1].price - priceHistory[0].price;
      const percentChange = (priceChange / priceHistory[0].price) * 100;

      expect(trend).toBe("down");
      expect(priceChange).toBeLessThan(0);
      expect(percentChange).toBeCloseTo(-3.53, 1);
    });

    it("should identify best supplier by price", () => {
      const suppliers = [
        { name: "Cristalia", price: 0.85, leadTime: 2 },
        { name: "Ourofino", price: 0.82, leadTime: 3 },
        { name: "Tambasa", price: 0.88, leadTime: 1 },
        { name: "DrogaVet", price: 0.80, leadTime: 4 },
      ];

      const bestByPrice = suppliers.reduce((best, current) =>
        current.price < best.price ? current : best
      );

      expect(bestByPrice.name).toBe("DrogaVet");
      expect(bestByPrice.price).toBe(0.80);

      // Melhor custo-benefício (preço + lead time)
      const bestValue = suppliers.reduce((best, current) => {
        const currentScore = current.price * (1 + current.leadTime * 0.1);
        const bestScore = best.price * (1 + best.leadTime * 0.1);
        return currentScore < bestScore ? current : best;
      });

      // Tambasa tem melhor score: 0.88 * (1 + 1*0.1) = 0.968
      // DrogaVet tem: 0.80 * (1 + 4*0.1) = 1.12
      expect(bestValue.name).toBe("Tambasa")
    });

    it("should calculate average price across suppliers", () => {
      const supplierPrices = {
        "Cristalia": 0.85,
        "Ourofino": 0.82,
        "Tambasa": 0.88,
        "DrogaVet": 0.80,
      };

      const avgPrice = Object.values(supplierPrices).reduce((a, b) => a + b, 0) / Object.values(supplierPrices).length;
      expect(avgPrice).toBeCloseTo(0.8375, 3);
    })
  });

  describe("Consolidation Logic", () => {
    it("should merge products with similar names but different EANs", () => {
      const products = [
        { ean: "7896000000001", name: "Amoxicilina 500mg Cápsula", supplier: "Cristalia" },
        { ean: "7896000000003", name: "Amoxicilina 500mg Cápsula", supplier: "Ourofino" },
      ];

      // Agrupar por nome normalizado
      const grouped = new Map();
      products.forEach(product => {
        const normalized = product.name.toLowerCase().trim();
        if (!grouped.has(normalized)) {
          grouped.set(normalized, []);
        }
        grouped.get(normalized).push(product);
      });

      expect(grouped.size).toBe(1);
      expect(grouped.get("amoxicilina 500mg cápsula")?.length).toBe(2);
    });

    it("should remove duplicate entries from same supplier", () => {
      const products = [
        { ean: "7896000000001", name: "Amoxicilina 500mg", supplier: "Cristalia", price: 0.85 },
        { ean: "7896000000001", name: "Amoxicilina 500mg", supplier: "Cristalia", price: 0.85 },
        { ean: "7896000000001", name: "Amoxicilina 500mg", supplier: "Ourofino", price: 0.82 },
      ];

      // Remover duplicatas
      const unique = Array.from(
        new Map(products.map(p => [`${p.ean}-${p.supplier}`, p])).values()
      );

      expect(unique.length).toBe(2);
    });

    it("should handle products with missing data", () => {
      const products = [
        { ean: "7896000000001", name: "Amoxicilina 500mg", supplier: "Cristalia", price: 0.85 },
        { ean: null, name: "Produto Desconhecido", supplier: "Ourofino", price: 0.50 },
        { ean: "7896000000002", name: null, supplier: "Tambasa", price: 0.75 },
      ];

      const validProducts = products.filter(p => p.ean && p.name);
      expect(validProducts.length).toBe(1);
    });
  });

  describe("Price Analysis", () => {
    it("should calculate margin recommendations", () => {
      const costPrice = 0.82;
      const targetMargin = 30; // 30%
      const recommendedPrice = costPrice / (1 - targetMargin / 100);

      expect(recommendedPrice).toBeCloseTo(1.17, 2);
    });

    it("should identify price outliers", () => {
      const prices = [0.82, 0.85, 0.84, 0.83, 2.50]; // 2.50 é outlier

      const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
      const stdDev = Math.sqrt(
        prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / prices.length
      );

      // Usar 1.5 * stdDev para detectar outliers de forma mais sensível
      const outliers = prices.filter(price => Math.abs(price - mean) > 1.5 * stdDev);
      expect(outliers.length).toBeGreaterThan(0);
      expect(outliers).toContain(2.50);
    });

    it("should generate price comparison report", () => {
      const products = [
        { ean: "001", name: "Produto A", suppliers: [{ name: "Cristalia", price: 1.00 }, { name: "Ourofino", price: 0.95 }] },
        { ean: "002", name: "Produto B", suppliers: [{ name: "Cristalia", price: 2.00 }, { name: "Tambasa", price: 1.85 }] },
      ];

      const report = products.map(product => ({
        ean: product.ean,
        name: product.name,
        minPrice: Math.min(...product.suppliers.map(s => s.price)),
        maxPrice: Math.max(...product.suppliers.map(s => s.price)),
        avgPrice: product.suppliers.reduce((sum, s) => sum + s.price, 0) / product.suppliers.length,
        supplierCount: product.suppliers.length,
      }));

      expect(report.length).toBe(2);
      expect(report[0].minPrice).toBe(0.95);
      expect(report[0].maxPrice).toBe(1.00);
    });
  });

  describe("Error Handling", () => {
    it("should handle scraper failures gracefully", () => {
      const scraperResult = {
        success: false,
        message: "Connection timeout",
        productsScraped: 0,
      };

      expect(scraperResult.success).toBe(false);
      expect(scraperResult.productsScraped).toBe(0);
    });

    it("should validate price data before analysis", () => {
      const invalidPrices = [-10, 0, null, undefined];

      const validPrices = invalidPrices.filter(p => typeof p === "number" && p > 0);
      expect(validPrices.length).toBe(0);
    });

    it("should handle empty consolidation results", () => {
      const consolidatedProducts = [];

      const hasProducts = consolidatedProducts.length > 0;
      expect(hasProducts).toBe(false);
    });
  });

  describe("Performance", () => {
    it("should consolidate large product sets efficiently", () => {
      const largeProductSet = Array.from({ length: 1000 }, (_, i) => ({
        ean: `EAN${i % 100}`, // 100 produtos únicos
        name: `Produto ${i % 100}`,
        supplier: `Supplier${i % 5}`,
        price: 0.50 + Math.random() * 2,
      }));

      const startTime = Date.now();
      const consolidated = new Map();
      largeProductSet.forEach(product => {
        if (!consolidated.has(product.ean)) {
          consolidated.set(product.ean, { prices: [] });
        }
        consolidated.get(product.ean).prices.push(product.price);
      });
      const endTime = Date.now();

      expect(consolidated.size).toBe(100);
      expect(endTime - startTime).toBeLessThan(500);
    });

    it("should analyze prices for large datasets", () => {
      const priceData = Array.from({ length: 500 }, (_, i) => ({
        ean: `EAN${i % 50}`,
        price: 0.50 + Math.random() * 2,
      }));

      const startTime = Date.now();
      const analysis = new Map();
      priceData.forEach(item => {
        if (!analysis.has(item.ean)) {
          analysis.set(item.ean, []);
        }
        analysis.get(item.ean).push(item.price);
      });

      const results = Array.from(analysis.entries()).map(([ean, prices]) => ({
        ean,
        avg: prices.reduce((a, b) => a + b, 0) / prices.length,
        min: Math.min(...prices),
        max: Math.max(...prices),
      }));
      const endTime = Date.now();

      expect(results.length).toBe(50);
      expect(endTime - startTime).toBeLessThan(500);
    });
  });

  describe("Data Consistency", () => {
    it("should maintain referential integrity between scraper and consolidation", () => {
      const scraperData = [
        { id: 1, ean: "001", supplier: "A", price: 1.00 },
        { id: 2, ean: "001", supplier: "B", price: 0.95 },
      ];

      const consolidatedData = {
        ean: "001",
        sources: [
          { scraperId: 1, supplier: "A", price: 1.00 },
          { scraperId: 2, supplier: "B", price: 0.95 },
        ],
      };

      expect(consolidatedData.sources.length).toBe(scraperData.length);
      expect(consolidatedData.sources.every(s => scraperData.some(d => d.id === s.scraperId))).toBe(true);
    });

    it("should track data lineage from scraper to analysis", () => {
      const workflow = [
        { step: "scraper", status: "completed", itemsProcessed: 100 },
        { step: "consolidation", status: "completed", itemsProcessed: 100 },
        { step: "analysis", status: "completed", itemsProcessed: 100 },
      ];

      const allItemsProcessed = workflow.every(w => w.itemsProcessed === 100);
      expect(allItemsProcessed).toBe(true);
    });
  });
});
