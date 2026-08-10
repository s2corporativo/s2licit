import { describe, expect, it } from "vitest";
import {
  calculateQuotationTotals,
  generateQuotationPdf,
  validateQuotationData,
  type QuotationPdfData,
} from "./quotationPdfGeneratorService";

function baseData(): QuotationPdfData {
  return {
    number: "ORÇ-001",
    date: new Date("2026-08-10T12:00:00Z"),
    validUntil: new Date("2026-09-09T12:00:00Z"),
    clientName: "Cliente Teste",
    items: [
      { productName: "Produto A", quantity: 2, unitPrice: 100, totalPrice: 200 },
      { productName: "Produto B", quantity: 3, unitPrice: 50, totalPrice: 150 },
    ],
    subtotal: 350,
    total: 350,
    company: { name: "Empresa Teste" },
  };
}

describe("quotationPdfGeneratorService", () => {
  describe("validateQuotationData", () => {
    it("aceita um orçamento comercial consistente", () => {
      expect(validateQuotationData(baseData())).toEqual({ valid: true, errors: [] });
    });

    it("rejeita campos obrigatórios e totais não positivos", () => {
      const data = baseData();
      data.number = "";
      data.items = [];
      data.subtotal = 0;
      data.total = 0;
      data.company.name = "";

      const result = validateQuotationData(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Número do orçamento é obrigatório");
      expect(result.errors).toContain("Orçamento deve ter pelo menos um item");
      expect(result.errors).toContain("Subtotal deve ser maior que zero");
      expect(result.errors).toContain("Total deve ser maior que zero");
      expect(result.errors).toContain("Dados da empresa são obrigatórios");
    });

    it("rejeita total declarado do item divergente de quantidade x unitário", () => {
      const data = baseData();
      data.items[0].totalPrice = 199;
      const result = validateQuotationData(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some((error) => error.includes("Total divergente"))).toBe(true);
    });

    it("rejeita subtotal do documento divergente da soma dos itens", () => {
      const data = baseData();
      data.subtotal = 349;
      data.total = 349;
      const result = validateQuotationData(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Subtotal diverge da soma dos itens");
    });
  });

  describe("calculateQuotationTotals", () => {
    it("calcula subtotal com precisão monetária", () => {
      const result = calculateQuotationTotals([
        { productName: "Produto A", quantity: 2, unitPrice: 19.99 },
        { productName: "Produto B", quantity: 1, unitPrice: 50.01 },
      ]);
      expect(result).toEqual({ subtotal: 89.99, itemCount: 2 });
    });

    it("retorna zero para lista vazia", () => {
      expect(calculateQuotationTotals([])).toEqual({ subtotal: 0, itemCount: 0 });
    });
  });

  describe("generateQuotationPdf", () => {
    it("gera um PDF válido com dados mínimos", async () => {
      const data = baseData();
      const pdf = await generateQuotationPdf(data);
      expect(pdf).toBeInstanceOf(Buffer);
      expect(pdf.length).toBeGreaterThan(0);
      expect(pdf.toString("ascii", 0, 4)).toBe("%PDF");
    });

    it("pagina um orçamento longo sem perder a validade estrutural do PDF", async () => {
      const items = Array.from({ length: 80 }, (_, index) => ({
        productName: `Produto ${index + 1} com descrição suficientemente longa para testar paginação`,
        quantity: 1,
        unitPrice: 10,
        totalPrice: 10,
      }));
      const data: QuotationPdfData = {
        ...baseData(),
        items,
        subtotal: 800,
        total: 800,
      };
      const pdf = await generateQuotationPdf(data);
      expect(pdf.toString("ascii", 0, 4)).toBe("%PDF");
      expect(pdf.length).toBeGreaterThan(1_000);
    });
  });
});
