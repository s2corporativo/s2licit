import { describe, it, expect } from "vitest";
import {
  generateQuotationPdf,
  validateQuotationData,
  calculateQuotationTotals,
  type QuotationPdfData,
} from "./quotationPdfGeneratorService";

describe("quotationPdfGeneratorService", () => {
  describe("validateQuotationData", () => {
    it("should validate valid quotation data", () => {
      const data: QuotationPdfData = {
        number: "ORÇ-001",
        date: new Date(),
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        clientName: "Cliente Teste",
        items: [
          {
            productName: "Produto A",
            quantity: 2,
            unitPrice: 100,
            totalPrice: 200,
          },
        ],
        subtotal: 200,
        total: 200,
        company: {
          name: "Empresa Teste",
        },
      };

      const result = validateQuotationData(data);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject quotation without number", () => {
      const data: QuotationPdfData = {
        number: "",
        date: new Date(),
        validUntil: new Date(),
        items: [
          {
            productName: "Produto A",
            quantity: 1,
            unitPrice: 100,
            totalPrice: 100,
          },
        ],
        subtotal: 100,
        total: 100,
        company: { name: "Empresa" },
      };

      const result = validateQuotationData(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Número do orçamento é obrigatório");
    });

    it("should reject quotation without items", () => {
      const data: QuotationPdfData = {
        number: "ORÇ-001",
        date: new Date(),
        validUntil: new Date(),
        items: [],
        subtotal: 0,
        total: 0,
        company: { name: "Empresa" },
      };

      const result = validateQuotationData(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Orçamento deve ter pelo menos um item"
      );
    });

    it("should reject quotation with zero total", () => {
      const data: QuotationPdfData = {
        number: "ORÇ-001",
        date: new Date(),
        validUntil: new Date(),
        items: [
          {
            productName: "Produto A",
            quantity: 1,
            unitPrice: 0,
            totalPrice: 0,
          },
        ],
        subtotal: 0,
        total: 0,
        company: { name: "Empresa" },
      };

      const result = validateQuotationData(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Total do orçamento deve ser maior que zero"
      );
    });

    it("should reject quotation without company data", () => {
      const data: QuotationPdfData = {
        number: "ORÇ-001",
        date: new Date(),
        validUntil: new Date(),
        items: [
          {
            productName: "Produto A",
            quantity: 1,
            unitPrice: 100,
            totalPrice: 100,
          },
        ],
        subtotal: 100,
        total: 100,
        company: { name: "" },
      };

      const result = validateQuotationData(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Dados da empresa são obrigatórios");
    });
  });

  describe("calculateQuotationTotals", () => {
    it("should calculate subtotal correctly", () => {
      const items = [
        { productName: "Produto A", quantity: 2, unitPrice: 100 },
        { productName: "Produto B", quantity: 3, unitPrice: 50 },
      ];

      const result = calculateQuotationTotals(items);
      expect(result.subtotal).toBe(350); // (2 * 100) + (3 * 50)
      expect(result.itemCount).toBe(2);
    });

    it("should calculate empty items", () => {
      const items: any[] = [];

      const result = calculateQuotationTotals(items);
      expect(result.subtotal).toBe(0);
      expect(result.itemCount).toBe(0);
    });

    it("should calculate single item", () => {
      const items = [{ productName: "Produto A", quantity: 5, unitPrice: 25 }];

      const result = calculateQuotationTotals(items);
      expect(result.subtotal).toBe(125);
      expect(result.itemCount).toBe(1);
    });

    it("should handle decimal prices", () => {
      const items = [
        { productName: "Produto A", quantity: 2, unitPrice: 19.99 },
        { productName: "Produto B", quantity: 1, unitPrice: 50.01 },
      ];

      const result = calculateQuotationTotals(items);
      expect(result.subtotal).toBeCloseTo(89.99, 2);
      expect(result.itemCount).toBe(2);
    });
  });

  describe("generateQuotationPdf", () => {
    it("should generate PDF buffer successfully", async () => {
      const data: QuotationPdfData = {
        number: "ORÇ-001",
        date: new Date(),
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        clientName: "Cliente Teste",
        clientEmail: "cliente@teste.com",
        clientPhone: "(11) 9999-9999",
        items: [
          {
            productName: "Produto A",
            quantity: 2,
            unitPrice: 100,
            totalPrice: 200,
          },
          {
            productName: "Produto B",
            quantity: 1,
            unitPrice: 150,
            totalPrice: 150,
          },
        ],
        subtotal: 350,
        discount: 50,
        tax: 35,
        total: 335,
        notes: "Válido por 30 dias",
        company: {
          name: "Empresa Teste LTDA",
          cnpj: "12.345.678/0001-90",
          address: "Rua Teste, 123 - São Paulo, SP",
          phone: "(11) 3333-3333",
          email: "empresa@teste.com",
          bankAccount: "Banco: 001 | Agência: 1234 | Conta: 567890",
        },
      };

      const pdf = await generateQuotationPdf(data);

      expect(pdf).toBeInstanceOf(Buffer);
      expect(pdf.length).toBeGreaterThan(0);
      // PDF files start with %PDF
      expect(pdf.toString("ascii", 0, 4)).toBe("%PDF");
    });

    it("should generate PDF with minimal data", async () => {
      const data: QuotationPdfData = {
        number: "ORÇ-002",
        date: new Date(),
        validUntil: new Date(),
        items: [
          {
            productName: "Produto Teste",
            quantity: 1,
            unitPrice: 100,
            totalPrice: 100,
          },
        ],
        subtotal: 100,
        total: 100,
        company: {
          name: "Empresa",
        },
      };

      const pdf = await generateQuotationPdf(data);

      expect(pdf).toBeInstanceOf(Buffer);
      expect(pdf.length).toBeGreaterThan(0);
      expect(pdf.toString("ascii", 0, 4)).toBe("%PDF");
    });

    it("should generate PDF with discount and tax", async () => {
      const data: QuotationPdfData = {
        number: "ORÇ-003",
        date: new Date(),
        validUntil: new Date(),
        items: [
          {
            productName: "Produto A",
            quantity: 10,
            unitPrice: 100,
            totalPrice: 1000,
          },
        ],
        subtotal: 1000,
        discount: 100,
        tax: 50,
        total: 950,
        company: {
          name: "Empresa Teste",
        },
      };

      const pdf = await generateQuotationPdf(data);

      expect(pdf).toBeInstanceOf(Buffer);
      expect(pdf.length).toBeGreaterThan(0);
      expect(pdf.toString("ascii", 0, 4)).toBe("%PDF");
    });

    it("should generate PDF with multiple items", async () => {
      const items = Array.from({ length: 10 }, (_, i) => ({
        productName: `Produto ${i + 1}`,
        quantity: i + 1,
        unitPrice: (i + 1) * 10,
        totalPrice: (i + 1) * (i + 1) * 10,
      }));

      const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);

      const data: QuotationPdfData = {
        number: "ORÇ-004",
        date: new Date(),
        validUntil: new Date(),
        items,
        subtotal,
        total: subtotal,
        company: {
          name: "Empresa Teste",
        },
      };

      const pdf = await generateQuotationPdf(data);

      expect(pdf).toBeInstanceOf(Buffer);
      expect(pdf.length).toBeGreaterThan(0);
      expect(pdf.toString("ascii", 0, 4)).toBe("%PDF");
    });

    it("should generate PDF with special characters in product names", async () => {
      const data: QuotationPdfData = {
        number: "ORÇ-005",
        date: new Date(),
        validUntil: new Date(),
        items: [
          {
            productName: "Produto com Acentuação & Símbolos (R$)",
            quantity: 1,
            unitPrice: 100,
            totalPrice: 100,
          },
        ],
        subtotal: 100,
        total: 100,
        company: {
          name: "Empresa com Acentuação",
        },
      };

      const pdf = await generateQuotationPdf(data);

      expect(pdf).toBeInstanceOf(Buffer);
      expect(pdf.length).toBeGreaterThan(0);
      expect(pdf.toString("ascii", 0, 4)).toBe("%PDF");
    });
  });
});
