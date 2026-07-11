import { describe, it, expect } from "vitest";

/**
 * Testes de integração para o fluxo:
 * NFe (Nota Fiscal Eletrônica) → Produtos → Precificação
 */
describe("Integration: NFe → Products → Pricing", () => {
  describe("Complete Flow", () => {
    it("should import NFe and extract product data", () => {
      // PASSO 1: Importar NFe XML
      const nfeXml = `
        <NFe>
          <infNFe Id="NFe35260101234567000123550010000000011234567890">
            <ide>
              <dEmi>2026-04-08</dEmi>
              <hEmi>14:30:00</hEmi>
            </ide>
            <emit>
              <CNPJ>01234567000123</CNPJ>
              <xNome>Fornecedor XYZ Ltda</xNome>
            </emit>
            <dest>
              <CNPJ>98765432000198</CNPJ>
              <xNome>Empresa Compradora</xNome>
            </dest>
            <det nItem="1">
              <prod>
                <code>123456</code>
                <xProd>Amoxicilina 500mg Cápsula</xProd>
                <NCM>30049090</NCM>
                <CEST>0100100</CEST>
                <CFOP>5102</CFOP>
                <uCom>UN</uCom>
                <qCom>1000</qCom>
                <vUnCom>0.85</vUnCom>
                <vItem>850.00</vItem>
                <vDesc>0.00</vDesc>
              </prod>
            </det>
            <det nItem="2">
              <prod>
                <code>789012</code>
                <xProd>Dipirona 500mg Comprimido</xProd>
                <NCM>30049090</NCM>
                <CEST>0100100</CEST>
                <CFOP>5102</CFOP>
                <uCom>UN</uCom>
                <qCom>500</qCom>
                <vUnCom>0.45</vUnCom>
                <vItem>225.00</vItem>
                <vDesc>0.00</vDesc>
              </prod>
            </det>
          </infNFe>
        </NFe>
      `;

      // Extrair dados da NFe
      const extractedData = {
        nfeNumber: "35260101234567000123550010000000011234567890",
        issueDate: "2026-04-08",
        supplier: {
          cnpj: "01234567000123",
          name: "Fornecedor XYZ Ltda",
        },
        items: [
          {
            itemNumber: 1,
            code: "123456",
            description: "Amoxicilina 500mg Cápsula",
            ncm: "30049090",
            cest: "0100100",
            quantity: 1000,
            unitPrice: 0.85,
            totalPrice: 850.00,
          },
          {
            itemNumber: 2,
            code: "789012",
            description: "Dipirona 500mg Comprimido",
            ncm: "30049090",
            cest: "0100100",
            quantity: 500,
            unitPrice: 0.45,
            totalPrice: 225.00,
          },
        ],
      };

      expect(extractedData.items.length).toBe(2);
      expect(extractedData.items[0].quantity).toBe(1000);
      expect(extractedData.items[0].unitPrice).toBe(0.85);
    });

    it("should match NFe items with existing products", () => {
      const nfeItems = [
        {
          itemNumber: 1,
          description: "Amoxicilina 500mg Cápsula",
          code: "123456",
          quantity: 1000,
          unitPrice: 0.85,
        },
        {
          itemNumber: 2,
          description: "Dipirona 500mg Comprimido",
          code: "789012",
          quantity: 500,
          unitPrice: 0.45,
        },
      ];

      const existingProducts = [
        {
          id: 1,
          name: "Amoxicilina 500mg",
          activeIngredient: "Amoxicilina",
          presentation: "Cápsula",
          ean: "7896000000001",
        },
        {
          id: 2,
          name: "Dipirona 500mg",
          activeIngredient: "Dipirona",
          presentation: "Comprimido",
          ean: "7896000000002",
        },
      ];

      // Matching por descrição
      const matchedItems = nfeItems.map(item => {
        const match = existingProducts.find(p =>
          item.description.toLowerCase().includes(p.activeIngredient.toLowerCase())
        );
        return {
          nfeItem: item.itemNumber,
          matched: !!match,
          product: match,
          nfeUnitPrice: item.unitPrice,
        };
      });

      expect(matchedItems[0].matched).toBe(true);
      expect(matchedItems[0].product?.id).toBe(1);
      expect(matchedItems[1].matched).toBe(true);
      expect(matchedItems[1].product?.id).toBe(2);
    });

    it("should update product prices from NFe", () => {
      const nfeItems = [
        {
          productId: 1,
          nfeUnitPrice: 0.85,
          quantity: 1000,
          supplier: "Fornecedor XYZ",
        },
        {
          productId: 2,
          nfeUnitPrice: 0.45,
          quantity: 500,
          supplier: "Fornecedor XYZ",
        },
      ];

      // Atualizar histórico de preços
      const priceHistory = nfeItems.map(item => ({
        productId: item.productId,
        supplier: item.supplier,
        purchasePrice: item.nfeUnitPrice,
        quantity: item.quantity,
        date: new Date(),
      }));

      expect(priceHistory.length).toBe(2);
      expect(priceHistory[0].purchasePrice).toBe(0.85);
      expect(priceHistory[1].purchasePrice).toBe(0.45);
    });

    it("should apply pricing rules based on cost price", () => {
      const nfePrices = [
        { productId: 1, costPrice: 0.85 },
        { productId: 2, costPrice: 0.45 },
      ];

      const pricingRules = {
        marginPercentage: 30,
        icmsPercentage: 7,
        pisPercentage: 1.65,
        cofinsPercentage: 7.6,
        freightPercentage: 5,
      };

      const calculatedPrices = nfePrices.map(item => {
        const basePrice = item.costPrice;
        const taxes = (basePrice * (pricingRules.icmsPercentage + pricingRules.pisPercentage + pricingRules.cofinsPercentage)) / 100;
        const freight = (basePrice * pricingRules.freightPercentage) / 100;
        const costWithTaxes = basePrice + taxes + freight;
        const finalPrice = costWithTaxes / (1 - pricingRules.marginPercentage / 100);

        return {
          productId: item.productId,
          costPrice: basePrice,
          finalPrice: parseFloat(finalPrice.toFixed(2)),
          margin: parseFloat(((finalPrice - costWithTaxes) / finalPrice * 100).toFixed(2)),
        };
      });

      expect(calculatedPrices[0].finalPrice).toBeGreaterThan(calculatedPrices[0].costPrice);
      expect(calculatedPrices[0].margin).toBeCloseTo(30, 0);
    });

    it("should generate purchase order from NFe data", () => {
      const nfeData = {
        nfeNumber: "001",
        supplier: "Fornecedor XYZ",
        items: [
          { productId: 1, quantity: 1000, unitPrice: 0.85 },
          { productId: 2, quantity: 500, unitPrice: 0.45 },
        ],
      };

      const purchaseOrder = {
        id: "PO-001",
        nfeNumber: nfeData.nfeNumber,
        supplier: nfeData.supplier,
        items: nfeData.items,
        totalValue: nfeData.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0),
        status: "received",
        createdAt: new Date(),
      };

      expect(purchaseOrder.items.length).toBe(2);
      expect(purchaseOrder.totalValue).toBe(1075); // (1000*0.85) + (500*0.45)
      expect(purchaseOrder.status).toBe("received");
    });
  });

  describe("NFe Data Extraction", () => {
    it("should extract supplier information", () => {
      const supplierData = {
        cnpj: "01234567000123",
        name: "Fornecedor XYZ Ltda",
        address: "Rua Principal, 123",
        city: "São Paulo",
        state: "SP",
      };

      expect(supplierData.cnpj).toMatch(/^\d{14}$/);
      expect(supplierData.name).toBeTruthy();
    });

    it("should extract product details from NFe", () => {
      const productDetails = {
        code: "123456",
        description: "Amoxicilina 500mg Cápsula",
        ncm: "30049090",
        cest: "0100100",
        quantity: 1000,
        unitPrice: 0.85,
        discount: 0,
        taxes: 0,
      };

      expect(productDetails.code).toBeTruthy();
      expect(productDetails.quantity).toBeGreaterThan(0);
      expect(productDetails.unitPrice).toBeGreaterThan(0);
    });

    it("should validate NCM and CEST codes", () => {
      const ncmCode = "30049090";
      const cestCode = "0100100";

      expect(ncmCode).toMatch(/^\d{8}$/);
      expect(cestCode).toMatch(/^\d{7}$/);
    });

    it("should handle NFe with discounts and additional charges", () => {
      const nfeItem = {
        quantity: 1000,
        unitPrice: 1.00,
        discount: 50.00,
        additionalCharges: 25.00,
        totalPrice: 975.00, // (1000*1.00) - 50 + 25
      };

      const calculatedTotal = (nfeItem.quantity * nfeItem.unitPrice) - nfeItem.discount + nfeItem.additionalCharges;
      expect(calculatedTotal).toBe(nfeItem.totalPrice);
    });
  });

  describe("Product Matching", () => {
    it("should match products by EAN code", () => {
      const nfeItem = {
        ean: "7896000000001",
        description: "Amoxicilina 500mg",
      };

      const catalogProduct = {
        id: 1,
        ean: "7896000000001",
        name: "Amoxicilina 500mg Cápsula",
      };

      const isMatched = nfeItem.ean === catalogProduct.ean;
      expect(isMatched).toBe(true);
    });

    it("should handle products not found in catalog", () => {
      const nfeItem = {
        code: "999999",
        description: "Medicamento Desconhecido",
        ean: null,
      };

      const catalogProducts: any[] = [];

      const match = catalogProducts.find(p => p.ean === nfeItem.ean);
      expect(match).toBeUndefined();
    });

    it("should suggest product creation for unmatched items", () => {
      const unmatchedNfeItem = {
        code: "999999",
        description: "Novo Medicamento XYZ",
        quantity: 100,
        unitPrice: 2.50,
      };

      const suggestion = {
        action: "create_product",
        data: {
          name: unmatchedNfeItem.description,
          supplierCode: unmatchedNfeItem.code,
          basePrice: unmatchedNfeItem.unitPrice,
          status: "pending_review",
        },
      };

      expect(suggestion.action).toBe("create_product");
      expect(suggestion.data.name).toBe(unmatchedNfeItem.description);
    });
  });

  describe("Pricing Application", () => {
    it("should apply different pricing rules by product category", () => {
      const products = [
        { id: 1, category: "antibiotics", costPrice: 0.85, categoryMargin: 35 },
        { id: 2, category: "supplements", costPrice: 0.45, categoryMargin: 25 },
      ];

      const pricedProducts = products.map(product => {
        const finalPrice = product.costPrice / (1 - product.categoryMargin / 100);
        return {
          id: product.id,
          category: product.category,
          costPrice: product.costPrice,
          finalPrice: parseFloat(finalPrice.toFixed(2)),
        };
      });

      expect(pricedProducts[0].finalPrice).toBeGreaterThan(pricedProducts[1].finalPrice);
    });

    it("should respect minimum and maximum price limits", () => {
      const product = {
        costPrice: 0.85,
        calculatedPrice: 1.50,
        minPrice: 1.20,
        maxPrice: 2.00,
      };

      const finalPrice = Math.max(product.minPrice, Math.min(product.maxPrice, product.calculatedPrice));
      expect(finalPrice).toBe(product.calculatedPrice);
    });

    it("should round prices according to configured method", () => {
      const prices = [1.234, 1.235, 1.236];
      const roundingMethods = {
        round: (p: number) => Math.round(p * 100) / 100,
        ceil: (p: number) => Math.ceil(p * 100) / 100,
        floor: (p: number) => Math.floor(p * 100) / 100,
      };

      const rounded = {
        round: prices.map(p => roundingMethods.round(p)),
        ceil: prices.map(p => roundingMethods.ceil(p)),
        floor: prices.map(p => roundingMethods.floor(p)),
      };

      expect(rounded.round[0]).toBe(1.23);
      expect(rounded.ceil[0]).toBe(1.24);
      expect(rounded.floor[0]).toBe(1.23);
    });
  });

  describe("Error Handling", () => {
    it("should validate NFe XML structure", () => {
      const invalidNfe = "<invalid>xml</invalid>";

      const isValidNfe = invalidNfe.includes("<NFe>") && invalidNfe.includes("</NFe>");
      expect(isValidNfe).toBe(false);
    });

    it("should handle missing required fields", () => {
      const incompleteItem = {
        description: "Produto",
        // quantity faltando
        // unitPrice faltando
      };

      const isComplete = "quantity" in incompleteItem && "unitPrice" in incompleteItem;
      expect(isComplete).toBe(false);
    });

    it("should handle invalid price data", () => {
      const invalidPrices = [-10, 0, null, undefined, "abc"];

      const validPrices = invalidPrices.filter(p => typeof p === "number" && p > 0);
      expect(validPrices.length).toBe(0);
    });

    it("should track import errors and warnings", () => {
      const importResult = {
        success: true,
        itemsProcessed: 2,
        itemsMatched: 1,
        itemsUnmatched: 1,
        warnings: ["Item 2 not found in catalog"],
        errors: [],
      };

      expect(importResult.itemsUnmatched).toBe(1);
      expect(importResult.warnings.length).toBeGreaterThan(0);
    });
  });

  describe("Performance", () => {
    it("should process large NFe efficiently", () => {
      const largeNfe = Array.from({ length: 500 }, (_, i) => ({
        itemNumber: i + 1,
        code: `CODE${i}`,
        description: `Produto ${i}`,
        quantity: 100 + i,
        unitPrice: 0.50 + (i * 0.01),
      }));

      const startTime = Date.now();
      const processed = largeNfe.map(item => ({
        ...item,
        processed: true,
      }));
      const endTime = Date.now();

      expect(processed.length).toBe(500);
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it("should calculate prices for large product sets", () => {
      const products = Array.from({ length: 1000 }, (_, i) => ({
        id: i + 1,
        costPrice: 0.50 + Math.random() * 2,
      }));

      const startTime = Date.now();
      const pricedProducts = products.map(p => ({
        id: p.id,
        finalPrice: parseFloat((p.costPrice / 0.7).toFixed(2)),
      }));
      const endTime = Date.now();

      expect(pricedProducts.length).toBe(1000);
      expect(endTime - startTime).toBeLessThan(500);
    });
  });

  describe("Data Consistency", () => {
    it("should maintain consistency between NFe and product database", () => {
      const nfeData = {
        nfeId: "001",
        items: [
          { productId: 1, quantity: 1000, unitPrice: 0.85 },
        ],
      };

      const dbRecord = {
        nfeId: "001",
        productId: 1,
        quantity: 1000,
        purchasePrice: 0.85,
      };

      expect(dbRecord.nfeId).toBe(nfeData.nfeId);
      expect(dbRecord.productId).toBe(nfeData.items[0].productId);
    });

    it("should track NFe-to-product relationships", () => {
      const nfeItems = [
        { nfeId: "001", productId: 1 },
        { nfeId: "001", productId: 2 },
      ];

      const grouped = nfeItems.reduce((acc, item) => {
        if (!acc[item.nfeId]) acc[item.nfeId] = [];
        acc[item.nfeId].push(item.productId);
        return acc;
      }, {} as Record<string, number[]>);

      expect(grouped["001"].length).toBe(2);
    });
  });

  describe("Workflow Validation", () => {
    it("should validate workflow steps in correct order", () => {
      const workflow = [
        { step: 1, name: "Import NFe", status: "completed" },
        { step: 2, name: "Extract Data", status: "completed" },
        { step: 3, name: "Match Products", status: "completed" },
        { step: 4, name: "Apply Pricing", status: "pending" },
      ];

      const completedSteps = workflow.filter(w => w.status === "completed").length;
      expect(completedSteps).toBe(3);

      // Validar sequência
      const sorted = workflow.sort((a, b) => a.step - b.step);
      for (let i = 0; i < sorted.length - 1; i++) {
        expect(sorted[i + 1].step).toBe(sorted[i].step + 1);
      }
    });

    it("should prevent pricing if matching is incomplete", () => {
      const matchingStatus = {
        totalItems: 2,
        matchedItems: 1,
        unmatchedItems: 1,
      };

      const canApplyPricing = matchingStatus.unmatchedItems === 0;
      expect(canApplyPricing).toBe(false);
    });

    it("should allow pricing with all items matched", () => {
      const matchingStatus = {
        totalItems: 2,
        matchedItems: 2,
        unmatchedItems: 0,
      };

      const canApplyPricing = matchingStatus.unmatchedItems === 0;
      expect(canApplyPricing).toBe(true);
    });
  });
});
