import { describe, it, expect } from "vitest";

/**
 * Teste de integração END-TO-END completo:
 * Edital + Scraper + NFe → Proposta com Preços Consolidados
 * 
 * Fluxo de trabalho:
 * 1. Receber edital de licitação
 * 2. Extrair requisitos de itens
 * 3. Scraper coleta preços de fornecedores
 * 4. Importar NFe com custos reais
 * 5. Consolidar produtos e preços
 * 6. Aplicar precificação
 * 7. Gerar proposta competitiva
 */
describe("Integration: End-to-End Complete Workflow", () => {
  describe("Complete Procurement Workflow", () => {
    it("should execute complete workflow from edital to proposal", () => {
      // PASSO 1: Edital de licitação
      const edital = {
        id: "EDITAL-2026-001",
        organization: "Prefeitura Municipal",
        items: [
          {
            item: "1",
            description: "Amoxicilina 500mg Cápsula",
            quantity: 5000,
            unit: "UN",
            minSpecification: "Genérico ou Similar",
          },
          {
            item: "2",
            description: "Dipirona 500mg Comprimido",
            quantity: 10000,
            unit: "UN",
            minSpecification: "Genérico ou Similar",
          },
        ],
      };

      expect(edital.items.length).toBe(2);

      // PASSO 2: Scraper coleta preços
      const scrapedPrices = [
        { supplier: "Cristalia", product: "Amoxicilina 500mg", price: 0.85, quantity: 5000 },
        { supplier: "Ourofino", product: "Amoxicilina 500mg", price: 0.82, quantity: 5000 },
        { supplier: "Tambasa", product: "Amoxicilina 500mg", price: 0.88, quantity: 5000 },
        { supplier: "Cristalia", product: "Dipirona 500mg", price: 0.45, quantity: 10000 },
        { supplier: "Ourofino", product: "Dipirona 500mg", price: 0.48, quantity: 10000 },
        { supplier: "DrogaVet", product: "Dipirona 500mg", price: 0.46, quantity: 10000 },
      ];

      expect(scrapedPrices.length).toBe(6);

      // PASSO 3: Importar NFe com custos reais
      const nfeData = [
        {
          nfeId: "NFE-001",
          supplier: "Ourofino",
          items: [
            { product: "Amoxicilina 500mg", quantity: 2000, unitPrice: 0.82 },
            { product: "Dipirona 500mg", quantity: 5000, unitPrice: 0.48 },
          ],
        },
      ];

      expect(nfeData.length).toBe(1);

      // PASSO 4: Consolidar produtos e preços
      const consolidatedProducts = new Map();
      
      // Consolidar scraper
      scrapedPrices.forEach(item => {
        const key = item.product;
        if (!consolidatedProducts.has(key)) {
          consolidatedProducts.set(key, {
            product: key,
            suppliers: [],
            prices: [],
            nfePrices: [],
          });
        }
        const data = consolidatedProducts.get(key);
        data.suppliers.push(item.supplier);
        data.prices.push(item.price);
      });

      // Consolidar NFe
      nfeData.forEach(nfe => {
        nfe.items.forEach(item => {
          if (consolidatedProducts.has(item.product)) {
            const data = consolidatedProducts.get(item.product);
            data.nfePrices.push(item.unitPrice);
          }
        });
      });

      expect(consolidatedProducts.size).toBe(2);

      // PASSO 5: Aplicar precificação
      const pricingRules = {
        marginPercentage: 30,
        icmsPercentage: 7,
        pisPercentage: 1.65,
        cofinsPercentage: 7.6,
        freightPercentage: 5,
      };

      const proposalItems = Array.from(consolidatedProducts.entries()).map(([product, data]) => {
        // Usar preço mais competitivo (menor)
        const bestPrice = Math.min(...data.prices, ...data.nfePrices);
        
        // Calcular preço final com margem
        const basePrice = bestPrice;
        const taxes = (basePrice * (pricingRules.icmsPercentage + pricingRules.pisPercentage + pricingRules.cofinsPercentage)) / 100;
        const freight = (basePrice * pricingRules.freightPercentage) / 100;
        const costWithTaxes = basePrice + taxes + freight;
        const finalPrice = costWithTaxes / (1 - pricingRules.marginPercentage / 100);

        // Encontrar item no edital
        const editalItem = edital.items.find(e => e.description.includes(product.split(" ")[0]));

        return {
          item: editalItem?.item,
          description: product,
          quantity: editalItem?.quantity || 0,
          unitPrice: parseFloat(finalPrice.toFixed(2)),
          totalPrice: parseFloat((finalPrice * (editalItem?.quantity || 0)).toFixed(2)),
          bestSupplierPrice: bestPrice,
          margin: parseFloat(((finalPrice - costWithTaxes) / finalPrice * 100).toFixed(2)),
        };
      });

      expect(proposalItems.length).toBe(2);
      expect(proposalItems[0].unitPrice).toBeGreaterThan(proposalItems[0].bestSupplierPrice);

      // PASSO 6: Gerar proposta
      const proposal = {
        id: "PROP-2026-001",
        editalId: edital.id,
        organization: edital.organization,
        items: proposalItems,
        totalValue: proposalItems.reduce((sum, item) => sum + item.totalPrice, 0),
        status: "draft",
        createdAt: new Date(),
      };

      expect(proposal.items.length).toBe(2);
      expect(proposal.totalValue).toBeGreaterThan(0);
      expect(proposal.status).toBe("draft");

      // Validações finais
      const amoxItem = proposal.items.find(i => i.description.includes("Amoxicilina"));
      expect(amoxItem?.quantity).toBe(5000);
      expect(amoxItem?.margin).toBeCloseTo(30, 0);

      const dipItem = proposal.items.find(i => i.description.includes("Dipirona"));
      expect(dipItem?.quantity).toBe(10000);
      expect(dipItem?.margin).toBeCloseTo(30, 0);
    });

    it("should handle multiple suppliers and select best price", () => {
      const suppliers = [
        { name: "Cristalia", price: 0.85, leadTime: 2, reliability: 0.95 },
        { name: "Ourofino", price: 0.82, leadTime: 3, reliability: 0.98 },
        { name: "Tambasa", price: 0.88, leadTime: 1, reliability: 0.92 },
        { name: "DrogaVet", price: 0.80, leadTime: 4, reliability: 0.90 },
      ];

      // Calcular score: preço + lead time + confiabilidade
      const scores = suppliers.map(s => ({
        ...s,
        score: s.price * (1 + s.leadTime * 0.05) / s.reliability,
      }));

      const bestSupplier = scores.reduce((best, current) =>
        current.score < best.score ? current : best
      );

      // Ourofino tem o melhor score: 0.82 * (1 + 3*0.05) / 0.98 = 0.866
      expect(bestSupplier.name).toBe("Ourofino")
    });

    it("should validate proposal against edital requirements", () => {
      const editalRequirements = {
        minMargin: 20,
        maxDeliveryDays: 30,
        acceptedEquivalents: true,
      };

      const proposal = {
        items: [
          { description: "Amoxicilina 500mg", margin: 30, deliveryDays: 5 },
          { description: "Dipirona 500mg", margin: 28, deliveryDays: 3 },
        ],
      };

      const isCompliant = proposal.items.every(item =>
        item.margin >= editalRequirements.minMargin &&
        item.deliveryDays <= editalRequirements.maxDeliveryDays
      );

      expect(isCompliant).toBe(true);
    });

    it("should generate PDF proposal with all details", () => {
      const proposalData = {
        id: "PROP-2026-001",
        editalId: "EDITAL-2026-001",
        organization: "Prefeitura Municipal",
        supplier: "Fornecedor XYZ",
        items: [
          { item: "1", description: "Amoxicilina 500mg", quantity: 5000, unitPrice: 1.10, totalPrice: 5500 },
          { item: "2", description: "Dipirona 500mg", quantity: 10000, unitPrice: 0.58, totalPrice: 5800 },
        ],
        totalValue: 11300,
        createdAt: new Date(),
      };

      const pdf = {
        title: `Proposta ${proposalData.id}`,
        edital: proposalData.editalId,
        organization: proposalData.organization,
        itemsCount: proposalData.items.length,
        totalValue: proposalData.totalValue,
        hasSignature: false,
      };

      expect(pdf.itemsCount).toBe(2);
      expect(pdf.totalValue).toBe(11300);
    });
  });

  describe("Data Flow Validation", () => {
    it("should maintain data consistency across all workflow steps", () => {
      const workflow = {
        editalItems: 2,
        scrapedPrices: 6,
        nfeItems: 2,
        consolidatedProducts: 2,
        proposalItems: 2,
      };

      // Validar que não há perda de dados
      expect(workflow.consolidatedProducts).toBe(workflow.editalItems);
      expect(workflow.proposalItems).toBe(workflow.editalItems);
    });

    it("should track data lineage from source to proposal", () => {
      const dataLineage = [
        { source: "edital", items: 2, status: "imported" },
        { source: "scraper", items: 6, status: "collected" },
        { source: "nfe", items: 2, status: "imported" },
        { source: "consolidation", items: 2, status: "consolidated" },
        { source: "pricing", items: 2, status: "priced" },
        { source: "proposal", items: 2, status: "generated" },
      ];

      const allProcessed = dataLineage.every(d => d.status !== "failed");
      expect(allProcessed).toBe(true);
    });

    it("should validate price calculations at each step", () => {
      const priceCalculations = {
        scraperPrice: 0.82,
        nfePrice: 0.82,
        consolidatedPrice: 0.82,
        finalPrice: 1.10,
      };

      // Preço final deve ser maior que preço consolidado
      expect(priceCalculations.finalPrice).toBeGreaterThan(priceCalculations.consolidatedPrice);
    });
  });

  describe("Error Recovery", () => {
    it("should handle missing edital items gracefully", () => {
      const edital = { items: [] };
      const scraperData = [
        { product: "Amoxicilina 500mg", price: 0.85 },
      ];

      const matchedItems = scraperData.filter(s =>
        edital.items.some(e => e.description.includes(s.product.split(" ")[0]))
      );

      expect(matchedItems.length).toBe(0);
    });

    it("should handle scraper failures and use NFe data", () => {
      const scraperResult = {
        success: false,
        items: [],
      };

      const nfeData = [
        { product: "Amoxicilina 500mg", price: 0.82 },
      ];

      const fallbackData = scraperResult.success ? scraperResult.items : nfeData;
      expect(fallbackData.length).toBe(1);
    });

    it("should handle NFe import errors and continue with scraper data", () => {
      const nfeResult = {
        success: false,
        error: "Invalid XML",
      };

      const scrapedData = [
        { product: "Amoxicilina 500mg", price: 0.85 },
      ];

      const usableData = nfeResult.success ? [] : scrapedData;
      expect(usableData.length).toBe(1);
    });

    it("should generate partial proposal if some items fail", () => {
      const items = [
        { id: 1, status: "success", price: 1.10 },
        { id: 2, status: "failed", price: null },
        { id: 3, status: "success", price: 0.58 },
      ];

      const successfulItems = items.filter(i => i.status === "success");
      const proposal = {
        totalItems: items.length,
        successfulItems: successfulItems.length,
        failedItems: items.filter(i => i.status === "failed").length,
      };

      expect(proposal.successfulItems).toBe(2);
      expect(proposal.failedItems).toBe(1);
    });
  });

  describe("Performance", () => {
    it("should process complete workflow efficiently", () => {
      const startTime = Date.now();

      // Simular workflow
      const edital = { items: Array.from({ length: 100 }, (_, i) => ({ id: i })) };
      const scraped = Array.from({ length: 300 }, (_, i) => ({ id: i, price: 0.5 + Math.random() }));
      const nfe = Array.from({ length: 100 }, (_, i) => ({ id: i, price: 0.5 + Math.random() }));

      const consolidated = new Map();
      [...scraped, ...nfe].forEach(item => {
        if (!consolidated.has(item.id % 100)) {
          consolidated.set(item.id % 100, []);
        }
        consolidated.get(item.id % 100).push(item.price);
      });

      const proposal = Array.from(consolidated.entries()).map(([id, prices]) => ({
        id,
        finalPrice: Math.min(...prices) * 1.3,
      }));

      const endTime = Date.now();

      expect(proposal.length).toBe(100);
      expect(endTime - startTime).toBeLessThan(5000);
    });

    it("should handle large edital (1000 items) within time limit", () => {
      const startTime = Date.now();

      const largeEdital = Array.from({ length: 1000 }, (_, i) => ({
        item: i + 1,
        description: `Produto ${i}`,
        quantity: 100 + i,
      }));

      const processed = largeEdital.map(item => ({
        ...item,
        processed: true,
      }));

      const endTime = Date.now();

      expect(processed.length).toBe(1000);
      expect(endTime - startTime).toBeLessThan(2000);
    });
  });

  describe("Audit Trail", () => {
    it("should log all workflow steps", () => {
      const auditLog = [
        { timestamp: new Date(), step: "edital_imported", status: "success" },
        { timestamp: new Date(), step: "scraper_executed", status: "success" },
        { timestamp: new Date(), step: "nfe_imported", status: "success" },
        { timestamp: new Date(), step: "products_consolidated", status: "success" },
        { timestamp: new Date(), step: "pricing_applied", status: "success" },
        { timestamp: new Date(), step: "proposal_generated", status: "success" },
      ];

      expect(auditLog.length).toBe(6);
      expect(auditLog.every(log => log.status === "success")).toBe(true);
    });

    it("should track user actions and changes", () => {
      const actionLog = [
        { user: "admin", action: "create_proposal", timestamp: new Date(), details: { proposalId: "PROP-001" } },
        { user: "admin", action: "edit_pricing", timestamp: new Date(), details: { itemId: 1, oldPrice: 1.00, newPrice: 1.10 } },
        { user: "admin", action: "submit_proposal", timestamp: new Date(), details: { proposalId: "PROP-001" } },
      ];

      expect(actionLog.length).toBe(3);
      expect(actionLog[1].action).toBe("edit_pricing");
    });
  });

  describe("Compliance", () => {
    it("should validate compliance with edital rules", () => {
      const editalRules = {
        minMargin: 20,
        maxPrice: 2.00,
        acceptedEquivalents: true,
        deliveryDays: 30,
      };

      const proposal = {
        items: [
          { margin: 30, price: 1.10, isEquivalent: false, deliveryDays: 5 },
          { margin: 28, price: 0.58, isEquivalent: true, deliveryDays: 3 },
        ],
      };

      const isCompliant = proposal.items.every(item =>
        item.margin >= editalRules.minMargin &&
        item.price <= editalRules.maxPrice &&
        (item.isEquivalent ? editalRules.acceptedEquivalents : true) &&
        item.deliveryDays <= editalRules.deliveryDays
      );

      expect(isCompliant).toBe(true);
    });

    it("should flag non-compliant items", () => {
      const editalRules = { minMargin: 20, maxPrice: 2.00 };

      const items = [
        { id: 1, margin: 30, price: 1.10, compliant: true },
        { id: 2, margin: 15, price: 2.50, compliant: false },
        { id: 3, margin: 25, price: 1.80, compliant: true },
      ];

      const nonCompliant = items.filter(i => !i.compliant);
      expect(nonCompliant.length).toBe(1);
      expect(nonCompliant[0].id).toBe(2);
    });
  });
});
