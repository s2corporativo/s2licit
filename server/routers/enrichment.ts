import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { products, categories } from "../../drizzle/schema";
import { eq, isNull, and, or } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";

/**
 * Schema de resposta do LLM para enriquecimento de produto
 */
const EnrichmentResponseSchema = z.object({
  activeIngredient: z.string().describe("Princípio ativo principal do produto"),
  concentration: z.string().describe("Concentração/dosagem (ex: 500mg, 10%)"),
  category: z.string().describe("Categoria do produto (medicamento_veterinario, medicamento_humano, produto_nao_medicamentoso, material_insumo_equipamento)"),
  subcategory: z.string().describe("Subcategoria (ex: Antibiótico, Antiparasitário, Vacina)"),
  manufacturer: z.string().describe("Fabricante do produto"),
  indication: z.string().describe("Indicação terapêutica ou uso do produto"),
  confidence: z.number().min(0).max(1).describe("Confiança da classificação (0-1)"),
});

type EnrichmentResponse = z.infer<typeof EnrichmentResponseSchema>;

/**
 * Enriquece um produto individual com IA.
 * Lógica compartilhada entre enrichProduct e enrichProductsBatch
 * (chamada direta, sem depender de caller do tRPC).
 */
async function enrichSingleProduct(input: {
  productId: number;
  productName: string;
  currentActiveIngredient?: string;
  currentCategory?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");

  // Buscar produto
  const product = await db
    .select()
    .from(products)
    .where(eq(products.id, input.productId))
    .limit(1);

  if (!product[0]) {
    throw new Error(`Produto ${input.productId} não encontrado`);
  }

  const prod = product[0];

  // Preparar prompt para LLM
  const prompt = `Analise o seguinte produto veterinário/farmacêutico e extraia as informações solicitadas:

Nome do Produto: ${input.productName}
Fabricante Atual: ${prod.manufacturer || "Não informado"}
Categoria Atual: ${input.currentCategory || "Não informada"}
Princípio Ativo Atual: ${input.currentActiveIngredient || "Não informado"}

Por favor, forneça:
1. Princípio ativo principal (nome técnico)
2. Concentração/dosagem
3. Categoria (medicamento_veterinario, medicamento_humano, produto_nao_medicamentoso, material_insumo_equipamento)
4. Subcategoria (ex: Antibiótico, Antiparasitário, Vacina, Analgésico, etc)
5. Fabricante
6. Indicação terapêutica ou uso
7. Confiança da classificação (0-1)

Responda em JSON válido.`;

      try {
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content:
                "Você é um especialista em farmacologia veterinária e medicamentos. Classifique produtos com precisão.",
            },
            { role: "user", content: prompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "product_enrichment",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  activeIngredient: { type: "string" },
                  concentration: { type: "string" },
                  category: { type: "string" },
                  subcategory: { type: "string" },
                  manufacturer: { type: "string" },
                  indication: { type: "string" },
                  confidence: { type: "number" },
                },
                required: [
                  "activeIngredient",
                  "concentration",
                  "category",
                  "subcategory",
                  "manufacturer",
                  "indication",
                  "confidence",
                ],
                additionalProperties: false,
              },
            },
          } as any,
        });

        // Extrair resposta JSON
        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error("Resposta vazia do LLM");

        const contentStr = typeof content === "string" ? content : JSON.stringify(content);
        const enriched: EnrichmentResponse = JSON.parse(contentStr);

        // Validar resposta
        const validated = EnrichmentResponseSchema.parse(enriched);

        // Atualizar produto no banco
        await db
          .update(products)
          .set({
            activeIngredient: validated.activeIngredient,
            concentration: validated.concentration,
            tipoCatalogo: validated.category as any,
            manufacturer: validated.manufacturer,
            statusConfiabilidade: "enriquecido_ia",
          })
          .where(eq(products.id, input.productId));

        return {
          success: true,
          productId: input.productId,
          enrichment: validated,
        };
      } catch (error) {
        return {
          success: false as const,
          productId: input.productId,
          error: (error as Error).message,
        };
      }
}

export const enrichmentRouter = router({
  /**
   * Enriquecer um produto individual com IA
   * Extrai: princípio ativo, concentração, categoria, subcategoria, fabricante, indicação
   */
  enrichProduct: protectedProcedure
    .input(
      z.object({
        productId: z.number(),
        productName: z.string(),
        currentActiveIngredient: z.string().optional(),
        currentCategory: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return enrichSingleProduct(input);
    }),

  /**
   * Enriquecer múltiplos produtos em lote
   * Processa em lotes de 50 para não sobrecarregar LLM
   */
  enrichProductsBatch: protectedProcedure
    .input(
      z.object({
        productIds: z.array(z.number()).max(100),
        batchSize: z.number().default(50),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");

      const results = [];
      const errors = [];

      // Processar em lotes
      for (let i = 0; i < input.productIds.length; i += input.batchSize) {
        const batch = input.productIds.slice(i, i + input.batchSize);

        for (const productId of batch) {
          try {
            const product = await db
              .select()
              .from(products)
              .where(eq(products.id, productId))
              .limit(1);

            if (!product[0]) {
              errors.push({
                productId,
                error: "Produto não encontrado",
              });
              continue;
            }

            const prod = product[0];

            // Chamar enriquecimento individual (função compartilhada, sem caller do tRPC)
            const enrichResult = await enrichSingleProduct({
              productId,
              productName: prod.name,
              currentActiveIngredient: prod.activeIngredient || undefined,
              currentCategory: prod.tipoCatalogo || undefined,
            });

            results.push(enrichResult);
          } catch (error) {
            errors.push({
              productId,
              error: (error as Error).message,
            });
          }
        }

        // Aguardar entre lotes para não sobrecarregar
        if (i + input.batchSize < input.productIds.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      return {
        total: input.productIds.length,
        successful: results.filter((r) => r.success).length,
        failed: errors.length,
        results,
        errors,
      };
    }),

  /**
   * Listar produtos sem princípio ativo ou categoria
   * Para identificar quais precisam enriquecimento
   */
  listProductsNeedingEnrichment: protectedProcedure
    .input(
      z.object({
        limit: z.number().default(100),
        offset: z.number().default(0),
        filterType: z.enum(["missing_active_ingredient", "missing_category", "both"]).default("both"),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");

      let whereCondition: any = eq(products.isActive, "yes");

      // tipoCatalogo é NOT NULL com default "produto_nao_medicamentoso":
      // categoria "faltando" = ainda no valor default (ou NULL em dados legados)
      const missingCategoryCondition = or(
        isNull(products.tipoCatalogo),
        eq(products.tipoCatalogo, "produto_nao_medicamentoso")
      );

      if (input.filterType === "missing_active_ingredient") {
        whereCondition = and(eq(products.isActive, "yes"), isNull(products.activeIngredient));
      } else if (input.filterType === "missing_category") {
        whereCondition = and(eq(products.isActive, "yes"), missingCategoryCondition);
      } else {
        // both
        whereCondition = and(
          eq(products.isActive, "yes"),
          isNull(products.activeIngredient),
          missingCategoryCondition
        );
      }

      const results = await db
        .select()
        .from(products)
        .where(whereCondition)
        .limit(input.limit)
        .offset(input.offset);

      return {
        total: results.length,
        products: results.map((p) => ({
          id: p.id,
          name: p.name,
          manufacturer: p.manufacturer,
          activeIngredient: p.activeIngredient,
          tipoCatalogo: p.tipoCatalogo,
          statusConfiabilidade: p.statusConfiabilidade,
        })),
      };
    }),

  /**
   * Obter sugestões de enriquecimento para um produto
   * Sem aplicar automaticamente, apenas retorna sugestões
   */
  getSuggestions: protectedProcedure
    .input(
      z.object({
        productId: z.number(),
        productName: z.string(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");

      const product = await db
        .select()
        .from(products)
        .where(eq(products.id, input.productId))
        .limit(1);

      if (!product[0]) {
        throw new Error(`Produto ${input.productId} não encontrado`);
      }

      const prod = product[0];

      const prompt = `Analise o seguinte produto e sugira enriquecimento:

Nome: ${input.productName}
Fabricante: ${prod.manufacturer || "Não informado"}
Princípio Ativo: ${prod.activeIngredient || "Não informado"}
Categoria: ${prod.tipoCatalogo || "Não informada"}

Forneça sugestões de:
1. Princípio ativo (se não preenchido)
2. Concentração/dosagem
3. Categoria
4. Subcategoria
5. Indicação terapêutica
6. Confiança (0-1)`;

      try {
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content:
                "Você é um especialista em farmacologia veterinária. Forneça sugestões de classificação de produtos.",
            },
            { role: "user", content: prompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "product_suggestions",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  activeIngredient: { type: "string" },
                  concentration: { type: "string" },
                  category: { type: "string" },
                  subcategory: { type: "string" },
                  indication: { type: "string" },
                  confidence: { type: "number" },
                },
                required: [
                  "activeIngredient",
                  "concentration",
                  "category",
                  "subcategory",
                  "indication",
                  "confidence",
                ],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error("Resposta vazia do LLM");

        const contentStr = typeof content === "string" ? content : JSON.stringify(content);
        const suggestions = JSON.parse(contentStr);

        return {
          productId: input.productId,
          productName: input.productName,
          suggestions,
        };
      } catch (error) {
        return {
          productId: input.productId,
          productName: input.productName,
          error: (error as Error).message,
        };
      }
    }),

  /**
   * Aplicar sugestões de enriquecimento aprovadas pelo usuário
   */
  applySuggestions: protectedProcedure
    .input(
      z.object({
        productId: z.number(),
        activeIngredient: z.string().optional(),
        concentration: z.string().optional(),
        category: z.string().optional(),
        manufacturer: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");

      const updateData: any = {
        statusConfiabilidade: "enriquecido_ia",
      };

      if (input.activeIngredient) updateData.activeIngredient = input.activeIngredient;
      if (input.concentration) updateData.concentration = input.concentration;
      if (input.category) updateData.tipoCatalogo = input.category;
      if (input.manufacturer) updateData.manufacturer = input.manufacturer;

      await db
        .update(products)
        .set(updateData)
        .where(eq(products.id, input.productId));

      return { success: true, productId: input.productId };
    }),

  /**
   * Estatísticas de enriquecimento
   * Retorna quantidade de produtos enriquecidos, pendentes, etc
   */
  getEnrichmentStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB indisponível");

    const allProducts = await db
      .select({
        id: products.id,
        statusConfiabilidade: products.statusConfiabilidade,
        activeIngredient: products.activeIngredient,
      })
      .from(products)
      .where(eq(products.isActive, "yes"));

    const enriquecidos = allProducts.filter(
      (p) => p.statusConfiabilidade === "enriquecido_ia"
    ).length;
    const pendentes = allProducts.filter(
      (p) => !p.activeIngredient || p.statusConfiabilidade === "incompleto"
    ).length;

    return {
      total: allProducts.length,
      enriquecidos,
      pendentes,
      percentualEnriquecido:
        allProducts.length > 0 ? (enriquecidos / allProducts.length) * 100 : 0,
    };
  }),
});

export type EnrichmentRouter = typeof enrichmentRouter;
