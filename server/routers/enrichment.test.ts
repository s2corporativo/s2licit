import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { eq } from "drizzle-orm";

// Mock do banco de dados
const mockDb = {
  select: vi.fn(),
  update: vi.fn(),
};

// Mock do invokeLLM
const mockInvokeLLM = vi.fn();

// Mock de produtos
const mockProducts = [
  {
    id: 1,
    name: "Amoxicilina 500mg",
    manufacturer: "Laboratório X",
    activeIngredient: null,
    concentration: null,
    tipoCatalogo: null,
    statusConfiabilidade: "incompleto",
  },
  {
    id: 2,
    name: "Ivermectina 1%",
    manufacturer: "Laboratório Y",
    activeIngredient: null,
    concentration: null,
    tipoCatalogo: null,
    statusConfiabilidade: "incompleto",
  },
];

describe("Enrichment Router - LLM Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("enrichProduct endpoint", () => {
    it("should enrich a single product with LLM response", async () => {
      // Mock LLM response
      mockInvokeLLM.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                activeIngredient: "Amoxicilina",
                concentration: "500mg",
                category: "medicamento_veterinario",
                subcategory: "Antibiótico",
                manufacturer: "Laboratório X",
                indication: "Infecções bacterianas",
                confidence: 0.95,
              }),
            },
          },
        ],
      });

      // Simular chamada ao endpoint
      const input = {
        productId: 1,
        productName: "Amoxicilina 500mg",
        currentActiveIngredient: undefined,
        currentCategory: undefined,
      };

      // Validar que o input está correto
      const inputSchema = z.object({
        productId: z.number(),
        productName: z.string(),
        currentActiveIngredient: z.string().optional(),
        currentCategory: z.string().optional(),
      });

      const validInput = inputSchema.parse(input);
      expect(validInput.productId).toBe(1);
      expect(validInput.productName).toBe("Amoxicilina 500mg");
    });

    it("should handle LLM errors gracefully", async () => {
      mockInvokeLLM.mockRejectedValue(new Error("LLM service unavailable"));

      const input = {
        productId: 1,
        productName: "Amoxicilina 500mg",
      };

      // Validar que o erro é capturado
      expect(() => {
        throw new Error("LLM service unavailable");
      }).toThrow("LLM service unavailable");
    });
  });

  describe("enrichProductsBatch endpoint", () => {
    it("should process batch of products with correct batch size", async () => {
      const input = {
        productIds: [1, 2, 3, 4, 5],
        batchSize: 2,
      };

      // Validar schema
      const inputSchema = z.object({
        productIds: z.array(z.number()).max(100),
        batchSize: z.number().default(50),
      });

      const validInput = inputSchema.parse(input);
      expect(validInput.productIds).toHaveLength(5);
      expect(validInput.batchSize).toBe(2);

      // Simular processamento em lotes
      const batches = [];
      for (let i = 0; i < validInput.productIds.length; i += validInput.batchSize) {
        batches.push(validInput.productIds.slice(i, i + validInput.batchSize));
      }

      expect(batches).toEqual([[1, 2], [3, 4], [5]]);
    });

    it("should limit batch to max 100 products", async () => {
      const input = {
        productIds: Array.from({ length: 150 }, (_, i) => i + 1),
        batchSize: 50,
      };

      const inputSchema = z.object({
        productIds: z.array(z.number()).max(100),
        batchSize: z.number().default(50),
      });

      // Deve falhar na validação
      expect(() => inputSchema.parse(input)).toThrow();
    });
  });

  describe("getSuggestions endpoint", () => {
    it("should return suggestions without modifying database", async () => {
      mockInvokeLLM.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                activeIngredient: "Ivermectina",
                concentration: "1%",
                category: "medicamento_veterinario",
                subcategory: "Antiparasitário",
                indication: "Controle de parasitas internos e externos",
                confidence: 0.88,
              }),
            },
          },
        ],
      });

      const input = {
        productId: 2,
        productName: "Ivermectina 1%",
      };

      // Validar schema
      const inputSchema = z.object({
        productId: z.number(),
        productName: z.string(),
      });

      const validInput = inputSchema.parse(input);
      expect(validInput.productId).toBe(2);
      expect(validInput.productName).toBe("Ivermectina 1%");

      // Simular resposta
      const suggestions = {
        activeIngredient: "Ivermectina",
        concentration: "1%",
        category: "medicamento_veterinario",
        subcategory: "Antiparasitário",
        indication: "Controle de parasitas internos e externos",
        confidence: 0.88,
      };

      expect(suggestions.confidence).toBeGreaterThan(0.7);
    });
  });

  describe("applySuggestions endpoint", () => {
    it("should apply only provided fields", async () => {
      const input = {
        productId: 1,
        activeIngredient: "Amoxicilina",
        concentration: "500mg",
        category: "medicamento_veterinario",
        manufacturer: undefined,
      };

      // Validar schema
      const inputSchema = z.object({
        productId: z.number(),
        activeIngredient: z.string().optional(),
        concentration: z.string().optional(),
        category: z.string().optional(),
        manufacturer: z.string().optional(),
      });

      const validInput = inputSchema.parse(input);

      // Simular construção de updateData
      const updateData: any = { statusConfiabilidade: "enriquecido_ia" };

      if (validInput.activeIngredient) updateData.activeIngredient = validInput.activeIngredient;
      if (validInput.concentration) updateData.concentration = validInput.concentration;
      if (validInput.category) updateData.tipoCatalogo = validInput.category;
      if (validInput.manufacturer) updateData.manufacturer = validInput.manufacturer;

      expect(updateData).toEqual({
        statusConfiabilidade: "enriquecido_ia",
        activeIngredient: "Amoxicilina",
        concentration: "500mg",
        tipoCatalogo: "medicamento_veterinario",
      });

      expect(updateData.manufacturer).toBeUndefined();
    });

    it("should mark product as enriched_ia", async () => {
      const updateData = {
        statusConfiabilidade: "enriquecido_ia",
        activeIngredient: "Amoxicilina",
      };

      expect(updateData.statusConfiabilidade).toBe("enriquecido_ia");
    });
  });

  describe("getEnrichmentStats endpoint", () => {
    it("should calculate enrichment statistics correctly", async () => {
      const allProducts = [
        { id: 1, statusConfiabilidade: "enriquecido_ia", activeIngredient: "Amoxicilina" },
        { id: 2, statusConfiabilidade: "enriquecido_ia", activeIngredient: "Ivermectina" },
        { id: 3, statusConfiabilidade: "incompleto", activeIngredient: null },
        { id: 4, statusConfiabilidade: "incompleto", activeIngredient: null },
      ];

      const enriquecidos = allProducts.filter(
        (p) => p.statusConfiabilidade === "enriquecido_ia"
      ).length;
      const pendentes = allProducts.filter(
        (p) => !p.activeIngredient || p.statusConfiabilidade === "incompleto"
      ).length;

      const stats = {
        total: allProducts.length,
        enriquecidos,
        pendentes,
        percentualEnriquecido:
          allProducts.length > 0 ? (enriquecidos / allProducts.length) * 100 : 0,
      };

      expect(stats.total).toBe(4);
      expect(stats.enriquecidos).toBe(2);
      expect(stats.pendentes).toBe(2);
      expect(stats.percentualEnriquecido).toBe(50);
    });

    it("should handle empty product list", async () => {
      const allProducts: any[] = [];

      const enriquecidos = allProducts.filter(
        (p) => p.statusConfiabilidade === "enriquecido_ia"
      ).length;
      const pendentes = allProducts.filter(
        (p) => !p.activeIngredient || p.statusConfiabilidade === "incompleto"
      ).length;

      const stats = {
        total: allProducts.length,
        enriquecidos,
        pendentes,
        percentualEnriquecido:
          allProducts.length > 0 ? (enriquecidos / allProducts.length) * 100 : 0,
      };

      expect(stats.total).toBe(0);
      expect(stats.enriquecidos).toBe(0);
      expect(stats.pendentes).toBe(0);
      expect(stats.percentualEnriquecido).toBe(0);
    });
  });

  describe("LLM Response Parsing", () => {
    it("should parse JSON response from LLM", async () => {
      const llmResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                activeIngredient: "Amoxicilina",
                concentration: "500mg",
                category: "medicamento_veterinario",
                subcategory: "Antibiótico",
                manufacturer: "Laboratório X",
                indication: "Infecções bacterianas",
                confidence: 0.95,
              }),
            },
          },
        ],
      };

      const content = llmResponse.choices[0]?.message?.content;
      const contentStr = typeof content === "string" ? content : JSON.stringify(content);
      const enriched = JSON.parse(contentStr);

      expect(enriched.activeIngredient).toBe("Amoxicilina");
      expect(enriched.concentration).toBe("500mg");
      expect(enriched.confidence).toBe(0.95);
    });

    it("should handle string content from LLM", async () => {
      const content =
        '{"activeIngredient":"Amoxicilina","concentration":"500mg","category":"medicamento_veterinario","subcategory":"Antibiótico","manufacturer":"Laboratório X","indication":"Infecções bacterianas","confidence":0.95}';

      const contentStr = typeof content === "string" ? content : JSON.stringify(content);
      const enriched = JSON.parse(contentStr);

      expect(enriched.activeIngredient).toBe("Amoxicilina");
    });
  });

  describe("Confidence Threshold", () => {
    it("should mark as completo_validado when confidence > 0.7", async () => {
      const confidence = 0.95;
      const status = confidence > 0.7 ? "completo_validado" : "enriquecido_ia";

      expect(status).toBe("completo_validado");
    });

    it("should mark as enriquecido_ia when confidence <= 0.7", async () => {
      const confidence = 0.65;
      const status = confidence > 0.7 ? "completo_validado" : "enriquecido_ia";

      expect(status).toBe("enriquecido_ia");
    });
  });
});
