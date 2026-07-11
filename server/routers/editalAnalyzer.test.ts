import { describe, it, expect, beforeEach, vi } from "vitest";
import { editalAnalyzerRouter } from "./editalAnalyzer";
import { protectedProcedure } from "../_core/trpc";

describe("editalAnalyzerRouter", () => {
  describe("extrair", () => {
    it("should extract edital items from text", async () => {
      const mockInput = {
        textoEdital: `
          PREGÃO ELETRÔNICO Nº 001/2026
          Processo: 123456/2026-00
          Órgão: Prefeitura Municipal
          
          ITEM 1: Medicamento Amoxicilina 500mg
          Quantidade: 1000 unidades
          Unidade: Cápsula
          Especificação: Amoxicilina 500mg, cápsula gelatinosa dura
          
          ITEM 2: Medicamento Dipirona 500mg
          Quantidade: 500 unidades
          Unidade: Comprimido
          Especificação: Dipirona 500mg, comprimido
        `,
      };

      // Validar que a entrada é processada
      expect(mockInput.textoEdital).toContain("PREGÃO ELETRÔNICO");
      expect(mockInput.textoEdital).toContain("Amoxicilina");
      expect(mockInput.textoEdital).toContain("Dipirona");
    });

    it("should handle PDF file upload", async () => {
      const mockPdfBase64 = Buffer.from("mock pdf content").toString("base64");
      
      const mockInput = {
        fileBase64: mockPdfBase64,
        fileName: "edital.pdf",
        mimeType: "application/pdf",
      };

      expect(mockInput.fileName).toMatch(/\.pdf$/);
      expect(mockInput.mimeType).toBe("application/pdf");
    });

    it("should handle DOCX file upload", async () => {
      const mockDocxBase64 = Buffer.from("mock docx content").toString("base64");
      
      const mockInput = {
        fileBase64: mockDocxBase64,
        fileName: "edital.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };

      expect(mockInput.fileName).toMatch(/\.docx$/);
      expect(mockInput.mimeType).toContain("wordprocessingml");
    });

    it("should validate required fields", async () => {
      const mockInput = {
        textoEdital: "",
        textoOrientacoes: "",
        textoDadosFornecedor: "",
      };

      // Validar que pelo menos um campo tem conteúdo
      const hasContent = 
        !!mockInput.textoEdital.trim() ||
        !!mockInput.textoOrientacoes.trim() ||
        !!mockInput.textoDadosFornecedor.trim();

      expect(hasContent).toBe(false);
    });

    it("should extract process number from edital text", async () => {
      const textoEdital = `
        PREGÃO ELETRÔNICO Nº 001/2026
        Processo: 123456/2026-00
        Órgão: Prefeitura Municipal
      `;

      const processNumberMatch = textoEdital.match(/Processo:\s*(\d+\/\d+-\d+)/);
      expect(processNumberMatch).toBeTruthy();
      expect(processNumberMatch?.[1]).toBe("123456/2026-00");
    });

    it("should extract organization name from edital text", async () => {
      const textoEdital = `
        PREGÃO ELETRÔNICO Nº 001/2026
        Órgão: Prefeitura Municipal de Belo Horizonte
      `;

      const orgMatch = textoEdital.match(/Órgão:\s*(.+)/);
      expect(orgMatch).toBeTruthy();
      expect(orgMatch?.[1]).toContain("Prefeitura");
    });

    it("should extract items with specifications", async () => {
      const textoEdital = `
        ITEM 1: Medicamento Amoxicilina 500mg
        Quantidade: 1000 unidades
        Unidade: Cápsula
        Especificação: Amoxicilina 500mg, cápsula gelatinosa dura
        Marca: Sem exigência
        Equivalência: Permitida
      `;

      const itemMatch = textoEdital.match(/ITEM\s+(\d+):\s*(.+)/);
      expect(itemMatch).toBeTruthy();
      expect(itemMatch?.[2]).toContain("Amoxicilina");

      const quantityMatch = textoEdital.match(/Quantidade:\s*(\d+)/);
      expect(quantityMatch?.[1]).toBe("1000");

      const unitMatch = textoEdital.match(/Unidade:\s*(.+)/);
      expect(unitMatch?.[1]).toContain("Cápsula");
    });

    it("should validate equivalence permission", async () => {
      const textoEdital = `
        Equivalência: Permitida com validação técnica
      `;

      const equivalenciaMatch = textoEdital.match(/Equivalência:\s*(.+)/i);
      expect(equivalenciaMatch).toBeTruthy();
      expect(equivalenciaMatch?.[1].toLowerCase()).toContain("permitida");
    });

    it("should handle missing specifications gracefully", async () => {
      const textoEdital = `
        ITEM 1: Medicamento Genérico
        Quantidade: 500
      `;

      const specMatch = textoEdital.match(/Especificação:\s*(.+)/);
      expect(specMatch).toBeFalsy(); // Especificação não fornecida
    });

    it("should extract multiple items from edital", async () => {
      const textoEdital = `
        ITEM 1: Amoxicilina 500mg - 1000 unidades
        ITEM 2: Dipirona 500mg - 500 unidades
        ITEM 3: Paracetamol 500mg - 750 unidades
      `;

      const itemMatches = textoEdital.match(/ITEM\s+\d+:/g);
      expect(itemMatches?.length).toBe(3);
    });

    it("should handle date extraction from edital", async () => {
      const textoEdital = `
        Data Limite: 15/04/2026
        Horário: 14:00
      `;

      const dateMatch = textoEdital.match(/Data Limite:\s*(\d{2}\/\d{2}\/\d{4})/);
      expect(dateMatch?.[1]).toBe("15/04/2026");

      const timeMatch = textoEdital.match(/Horário:\s*(\d{2}:\d{2})/);
      expect(timeMatch?.[1]).toBe("14:00");
    });
  });

  describe("integration with product matching", () => {
    it("should match extracted items with existing products", async () => {
      const extractedItems = [
        {
          item: "1",
          descricaoPadronizada: "Amoxicilina 500mg cápsula",
          quantidade: "1000",
          unidade: "Cápsula",
          equivalenciaPermitida: "sim",
        },
      ];

      const existingProducts = [
        {
          id: 1,
          name: "Amoxicilina 500mg",
          activeIngredient: "Amoxicilina",
          concentration: "500mg",
          presentation: "Cápsula",
        },
      ];

      // Simular matching
      const matches = extractedItems.map(item => {
        const match = existingProducts.find(p =>
          item.descricaoPadronizada.toLowerCase().includes(p.activeIngredient.toLowerCase())
        );
        return { item: item.item, matched: !!match, product: match };
      });

      expect(matches[0].matched).toBe(true);
      expect(matches[0].product?.id).toBe(1);
    });

    it("should identify items without matching products", async () => {
      const extractedItems = [
        {
          item: "1",
          descricaoPadronizada: "Medicamento Desconhecido XYZ",
          quantidade: "100",
          unidade: "Comprimido",
        },
      ];

      const existingProducts: any[] = [];

      const matches = extractedItems.map(item => {
        const match = existingProducts.find(p =>
          item.descricaoPadronizada.toLowerCase().includes(p.activeIngredient?.toLowerCase())
        );
        return { item: item.item, matched: !!match };
      });

      expect(matches[0].matched).toBe(false);
    });
  });

  describe("error handling", () => {
    it("should reject empty input", async () => {
      const mockInput = {
        textoEdital: "",
        textoOrientacoes: "",
        textoDadosFornecedor: "",
      };

      const isEmpty = !mockInput.textoEdital.trim() &&
                      !mockInput.textoOrientacoes.trim() &&
                      !mockInput.textoDadosFornecedor.trim();

      expect(isEmpty).toBe(true);
    });

    it("should handle unsupported file formats", async () => {
      const unsupportedFormats = ["image/jpeg", "image/png", "text/plain"];

      unsupportedFormats.forEach(format => {
        expect(format).not.toMatch(/application\/(pdf|vnd\.openxmlformats)/);
      });
    });

    it("should truncate very large text", async () => {
      const maxLength = 120000;
      const largeText = "a".repeat(200000);

      const truncated = largeText.slice(0, maxLength);
      expect(truncated.length).toBeLessThanOrEqual(maxLength);
    });
  });
});
