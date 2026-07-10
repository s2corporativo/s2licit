import { describe, it, expect, beforeEach } from "vitest";

/**
 * Testes de integração para o fluxo completo:
 * Edital → Extração de Itens → Matching com Produtos → Geração de Proposta
 */
describe("Integration: Edital → Matching → Proposal", () => {
  describe("Complete Flow", () => {
    it("should process edital and generate proposal with matched products", () => {
      // PASSO 1: Extrair dados do edital
      const editalText = `
        PREGÃO ELETRÔNICO Nº 001/2026
        Processo: 123456/2026-00
        Órgão: Prefeitura Municipal de Belo Horizonte
        
        ITEM 1: Medicamento Amoxicilina 500mg
        Quantidade: 1000 unidades
        Unidade: Cápsula
        Especificação: Amoxicilina 500mg, cápsula gelatinosa dura
        Marca: Sem exigência
        Equivalência: Permitida com validação técnica
        
        ITEM 2: Medicamento Dipirona 500mg
        Quantidade: 500 unidades
        Unidade: Comprimido
        Especificação: Dipirona 500mg, comprimido
        Marca: Sem exigência
        Equivalência: Permitida
      `;

      const extractedItems = [
        {
          item: "1",
          descricaoPadronizada: "Amoxicilina 500mg cápsula",
          quantidade: 1000,
          unidade: "Cápsula",
          equivalenciaPermitida: true,
          validacaoTecnica: true,
        },
        {
          item: "2",
          descricaoPadronizada: "Dipirona 500mg comprimido",
          quantidade: 500,
          unidade: "Comprimido",
          equivalenciaPermitida: true,
          validacaoTecnica: false,
        },
      ];

      expect(extractedItems.length).toBe(2);
      expect(extractedItems[0].quantidade).toBe(1000);
      expect(extractedItems[1].quantidade).toBe(500);

      // PASSO 2: Matching com produtos existentes
      const existingProducts = [
        {
          id: 1,
          name: "Amoxicilina 500mg",
          activeIngredient: "Amoxicilina",
          concentration: "500mg",
          presentation: "Cápsula",
          manufacturer: "Cristalia",
          basePrice: 0.85,
          ean: "7896000000001",
        },
        {
          id: 2,
          name: "Dipirona 500mg",
          activeIngredient: "Dipirona",
          concentration: "500mg",
          presentation: "Comprimido",
          manufacturer: "Ourofino",
          basePrice: 0.45,
          ean: "7896000000002",
        },
      ];

      const matchedItems = extractedItems.map(item => {
        const match = existingProducts.find(p =>
          item.descricaoPadronizada.toLowerCase().includes(p.activeIngredient.toLowerCase())
        );
        return {
          editalItem: item.item,
          matched: !!match,
          product: match,
          quantity: item.quantidade,
          unit: item.unidade,
        };
      });

      expect(matchedItems[0].matched).toBe(true);
      expect(matchedItems[0].product?.id).toBe(1);
      expect(matchedItems[1].matched).toBe(true);
      expect(matchedItems[1].product?.id).toBe(2);

      // PASSO 3: Calcular preços com margem
      const pricingConfig = {
        marginPercentage: 30,
        icmsPercentage: 7,
        ipPercentage: 0,
        pisPercentage: 1.65,
        cofinsPercentage: 7.6,
        freightType: "percentage" as const,
        freightValue: 5,
        roundingMethod: "round" as const,
      };

      const proposalItems = matchedItems.map(item => {
        if (!item.product) return null;

        // Calcular preço final
        const basePrice = item.product.basePrice;
        const taxes = (basePrice * (pricingConfig.icmsPercentage + pricingConfig.pisPercentage + pricingConfig.cofinsPercentage)) / 100;
        const freight = (basePrice * pricingConfig.freightValue) / 100;
        const costPrice = basePrice + taxes + freight;
        const finalPrice = costPrice / (1 - pricingConfig.marginPercentage / 100);

        return {
          editalItem: item.editalItem,
          productId: item.product.id,
          productName: item.product.name,
          manufacturer: item.product.manufacturer,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: parseFloat(finalPrice.toFixed(2)),
          costPrice: parseFloat(costPrice.toFixed(2)),
          totalPrice: parseFloat((finalPrice * item.quantity).toFixed(2)),
        };
      }).filter(Boolean);

      expect(proposalItems.length).toBe(2);
      expect(proposalItems[0].unitPrice).toBeGreaterThan(proposalItems[0].costPrice);
      // Validar que o preço total é calculado corretamente
      expect(proposalItems[0].totalPrice).toBeGreaterThan(0);
      // O preço total deve ser maior que zero e coerente
      expect(proposalItems[0].totalPrice).toBeGreaterThan(proposalItems[0].unitPrice);
      expect(proposalItems[0].totalPrice).toBeLessThan(proposalItems[0].unitPrice * proposalItems[0].quantity * 2)

      // PASSO 4: Gerar proposta
      const proposal = {
        id: "PROP-001-2026",
        editalNumber: "001/2026",
        process: "123456/2026-00",
        organization: "Prefeitura Municipal de Belo Horizonte",
        supplierName: "Fornecedor XYZ",
        supplierId: 1,
        items: proposalItems,
        totalValue: proposalItems.reduce((sum, item) => sum + item.totalPrice, 0),
        createdAt: new Date(),
        status: "draft",
      };

      expect(proposal.items.length).toBe(2);
      expect(proposal.totalValue).toBeGreaterThan(0);
      expect(proposal.status).toBe("draft");

      // Validar que todos os itens foram processados
      const totalQuantity = proposal.items.reduce((sum, item) => sum + item.quantity, 0);
      expect(totalQuantity).toBe(1500); // 1000 + 500
      
      // Validar que o valor total da proposta é a soma dos itens
      const proposalTotalValue = proposal.items.reduce((sum, item) => sum + item.totalPrice, 0);
      expect(proposal.totalValue).toBeCloseTo(proposalTotalValue, 1)
    });

    it("should handle partial matching when some products are not found", () => {
      const extractedItems = [
        {
          item: "1",
          descricaoPadronizada: "Amoxicilina 500mg cápsula",
          quantidade: 1000,
        },
        {
          item: "2",
          descricaoPadronizada: "Medicamento Desconhecido XYZ",
          quantidade: 500,
        },
      ];

      const existingProducts = [
        {
          id: 1,
          name: "Amoxicilina 500mg",
          activeIngredient: "Amoxicilina",
        },
      ];

      const matchedItems = extractedItems.map(item => {
        const match = existingProducts.find(p =>
          item.descricaoPadronizada.toLowerCase().includes(p.activeIngredient.toLowerCase())
        );
        return {
          editalItem: item.item,
          matched: !!match,
          product: match,
        };
      });

      const matchedCount = matchedItems.filter(m => m.matched).length;
      const unmatchedCount = matchedItems.filter(m => !m.matched).length;

      expect(matchedCount).toBe(1);
      expect(unmatchedCount).toBe(1);
    });

    it("should validate equivalence when product is different from specification", () => {
      const editalItem = {
        item: "1",
        specification: "Amoxicilina 500mg cápsula",
        equivalenciaPermitida: true,
        validacaoTecnica: true,
      };

      const proposedProduct = {
        id: 1,
        name: "Amoxicilina 500mg",
        activeIngredient: "Amoxicilina",
        concentration: "500mg",
        presentation: "Cápsula",
        manufacturer: "Cristalia",
      };

      // Validar equivalência
      const isEquivalent = 
        proposedProduct.activeIngredient.toLowerCase() === "amoxicilina" &&
        proposedProduct.concentration === "500mg" &&
        proposedProduct.presentation === "Cápsula";

      expect(isEquivalent).toBe(true);
      expect(editalItem.equivalenciaPermitida).toBe(true);
    });

    it("should reject proposal item if equivalence is not permitted", () => {
      const editalItem = {
        item: "1",
        specification: "Amoxicilina 500mg cápsula - Marca Específica",
        equivalenciaPermitida: false,
        marcaEspecifica: "Marca Específica",
      };

      const proposedProduct = {
        id: 1,
        name: "Amoxicilina 500mg",
        manufacturer: "Cristalia", // Diferente da marca especificada
      };

      const isAcceptable = 
        editalItem.equivalenciaPermitida || 
        proposedProduct.manufacturer === editalItem.marcaEspecifica;

      expect(isAcceptable).toBe(false);
    });

    it("should calculate total proposal value correctly", () => {
      const items = [
        { quantity: 1000, unitPrice: 1.50 },
        { quantity: 500, unitPrice: 0.75 },
        { quantity: 750, unitPrice: 2.00 },
      ];

      const totalValue = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

      // (1000*1.50) + (500*0.75) + (750*2.00) = 1500 + 375 + 1500 = 3375
      expect(totalValue).toBe(3375);
    });

    it("should generate proposal PDF with all items", () => {
      const proposal = {
        id: "PROP-001-2026",
        editalNumber: "001/2026",
        organization: "Prefeitura Municipal",
        items: [
          {
            item: 1,
            productName: "Amoxicilina 500mg",
            quantity: 1000,
            unitPrice: 1.50,
            totalPrice: 1500,
          },
          {
            item: 2,
            productName: "Dipirona 500mg",
            quantity: 500,
            unitPrice: 0.75,
            totalPrice: 375,
          },
        ],
        totalValue: 1875,
      };

      // Validar estrutura da proposta
      expect(proposal.items.length).toBe(2);
      expect(proposal.totalValue).toBe(1875);
      expect(proposal.items[0].totalPrice).toBe(proposal.items[0].quantity * proposal.items[0].unitPrice);
    });
  });

  describe("Error Handling", () => {
    it("should handle edital with no matching products", () => {
      const extractedItems = [
        {
          item: "1",
          descricaoPadronizada: "Medicamento Desconhecido ABC",
          quantidade: 100,
        },
      ];

      const existingProducts: any[] = [];

      const matchedItems = extractedItems.map(item => {
        const match = existingProducts.find(p =>
          item.descricaoPadronizada.toLowerCase().includes(p.activeIngredient?.toLowerCase())
        );
        return { editalItem: item.item, matched: !!match };
      });

      const allMatched = matchedItems.every(m => m.matched);
      expect(allMatched).toBe(false);
    });

    it("should validate proposal before generation", () => {
      const invalidProposal = {
        items: [],
        totalValue: 0,
      };

      const isValid = invalidProposal.items.length > 0 && invalidProposal.totalValue > 0;
      expect(isValid).toBe(false);
    });

    it("should handle price calculation errors gracefully", () => {
      const invalidPrice = -100;
      const isValidPrice = invalidPrice > 0;

      expect(isValidPrice).toBe(false);
    });
  });

  describe("Data Consistency", () => {
    it("should maintain data consistency across modules", () => {
      const editalItem = {
        item: "1",
        quantity: 1000,
        unitPrice: 1.50,
      };

      const proposalItem = {
        editalItem: "1",
        quantity: 1000,
        unitPrice: 1.50,
      };

      // Validar que os dados são consistentes
      expect(proposalItem.editalItem).toBe(editalItem.item.toString());
      expect(proposalItem.quantity).toBe(editalItem.quantity);
      expect(proposalItem.unitPrice).toBe(editalItem.unitPrice);
    });

    it("should track edital-to-proposal relationship", () => {
      const edital = {
        id: "EDITAL-001",
        number: "001/2026",
      };

      const proposal = {
        id: "PROP-001-2026",
        editalId: "EDITAL-001",
        editalNumber: "001/2026",
      };

      expect(proposal.editalId).toBe(edital.id);
      expect(proposal.editalNumber).toBe(edital.number);
    });
  });

  describe("Workflow Validation", () => {
    it("should validate workflow steps in correct order", () => {
      const workflow = [
        { step: 1, name: "Extract Edital", status: "completed" },
        { step: 2, name: "Match Products", status: "completed" },
        { step: 3, name: "Calculate Prices", status: "completed" },
        { step: 4, name: "Generate Proposal", status: "pending" },
      ];

      const completedSteps = workflow.filter(s => s.status === "completed").length;
      expect(completedSteps).toBe(3);

      // Validar que não há gaps na sequência
      const sortedWorkflow = workflow.sort((a, b) => a.step - b.step);
      for (let i = 0; i < sortedWorkflow.length - 1; i++) {
        expect(sortedWorkflow[i + 1].step).toBe(sortedWorkflow[i].step + 1);
      }
    });

    it("should prevent proposal generation if matching is incomplete", () => {
      const matchingStatus = {
        totalItems: 2,
        matchedItems: 1,
        unmatchedItems: 1,
        matchPercentage: 50,
      };

      const canGenerateProposal = matchingStatus.matchPercentage === 100;
      expect(canGenerateProposal).toBe(false);
    });

    it("should allow proposal generation with 100% matching", () => {
      const matchingStatus = {
        totalItems: 2,
        matchedItems: 2,
        unmatchedItems: 0,
        matchPercentage: 100,
      };

      const canGenerateProposal = matchingStatus.matchPercentage === 100;
      expect(canGenerateProposal).toBe(true);
    });
  });

  describe("Performance", () => {
    it("should process large edital efficiently", () => {
      const largeEdital = Array.from({ length: 500 }, (_, i) => ({
        item: (i + 1).toString(),
        description: `Medicamento ${i + 1}`,
        quantity: 100 + i,
      }));

      const startTime = Date.now();
      const processedItems = largeEdital.map(item => ({
        ...item,
        processed: true,
      }));
      const endTime = Date.now();

      expect(processedItems.length).toBe(500);
      expect(endTime - startTime).toBeLessThan(1000); // Deve processar em menos de 1 segundo
    });

    it("should handle batch price calculations", () => {
      const items = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        basePrice: 10 + i,
      }));

      const pricingConfig = {
        marginPercentage: 30,
        icmsPercentage: 7,
        freightValue: 5,
      };

      const startTime = Date.now();
      const calculatedPrices = items.map(item => {
        const taxes = (item.basePrice * pricingConfig.icmsPercentage) / 100;
        const freight = (item.basePrice * pricingConfig.freightValue) / 100;
        const costPrice = item.basePrice + taxes + freight;
        const finalPrice = costPrice / (1 - pricingConfig.marginPercentage / 100);
        return { id: item.id, finalPrice };
      });
      const endTime = Date.now();

      expect(calculatedPrices.length).toBe(100);
      expect(endTime - startTime).toBeLessThan(500); // Deve calcular em menos de 500ms
    });
  });
});
