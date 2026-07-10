import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { products } from "../../drizzle/schema";
import { eq, isNull, or, inArray } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";

const CATEGORIES = [
  "Medicamentos Veterinários",
  "Medicamentos Humanos",
  "Produtos Agro",
  "Insumos",
  "Materiais Diversos",
];

export const reclassificationRouter = router({
  // Listar produtos sem categoria
  listProductsNeedingReclassification: protectedProcedure
    .input(
      z.object({
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input }: { input: { limit: number; offset: number } }) => {
      const db = await getDb();
      if (!db) {
        return {
          products: [],
          total: 0,
          hasMore: false,
        };
      }
      const rows = await db
        .select()
        .from(products)
        .where(
          or(
            isNull(products.categoryId),
            eq(products.categoryId, 0)
          )
        )
        .limit(input.limit)
        .offset(input.offset);

      const total = await db
        .select({ count: products.id })
        .from(products)
        .where(
          or(
            isNull(products.categoryId),
            eq(products.categoryId, 0)
          )
        );

      return {
        products: rows,
        total: total[0]?.count || 0,
        hasMore: (input.offset + input.limit) < (total[0]?.count || 0),
      };
    }),  // Sugerir reclassificação usando IA
  suggestReclassification: protectedProcedure
    .input(
      z.object({
        productIds: z.array(z.number()).min(1).max(50),
      })
    )
    .mutation(async ({ input }: { input: { productIds: number[] } }) => {
      const db = await getDb();
      if (!db) {
        return {
          suggestions: {},
          errors: { 0: "Database connection failed" },
          processed: 0,
          failed: 1,
        };
      }
      const productsToClassify = await db
        .select()
        .from(products)
        .where(inArray(products.id, input.productIds));

      const suggestions: Record<number, string> = {};
      const errors: Record<number, string> = {};

      for (const product of productsToClassify) {
        try {
          const prompt = `Classifique o seguinte produto em uma das categorias: ${CATEGORIES.join(", ")}.

Produto: ${product.name}
Apresentação: ${product.presentation || "N/A"}
Princípio Ativo: ${product.activeIngredient || "N/A"}
Fabricante: ${product.manufacturer || "N/A"}

Responda apenas com o nome da categoria, sem explicações.`;

          const response = await invokeLLM({
            messages: [
              {
                role: "system",
                content:
                  "Você é um especialista em classificação de produtos. Classifique o produto em uma das categorias fornecidas.",
              },
              {
                role: "user",
                content: prompt,
              },
            ],
          });

          const content = response.choices[0]?.message?.content;
          const categoryText = typeof content === "string" ? content.trim() : "Materiais Diversos";
          const category = categoryText || "Materiais Diversos";

          // Validar se a categoria é válida
          if (CATEGORIES.includes(category)) {
            suggestions[product.id] = category;
          } else {
            suggestions[product.id] = "Materiais Diversos";
          }
        } catch (error) {
          errors[product.id] = error instanceof Error ? error.message : "Erro desconhecido";
        }
      }

      return {
        suggestions,
        errors,
        processed: Object.keys(suggestions).length,
        failed: Object.keys(errors).length,
      };
    }),

  // Aplicar sugestões de reclassificação
  applySuggestions: protectedProcedure
    .input(
      z.object({
        suggestions: z.record(z.string(), z.string()),
      })
    )
    .mutation(async ({ input }: { input: { suggestions: Record<string, string> } }) => {
      const db = await getDb();
      if (!db) {
        return {
          applied: 0,
          total: 0,
        };
      }
      const updates: Array<{ id: number; category: string }> = [];

      for (const [productIdStr, category] of Object.entries(input.suggestions)) {
        const productId = parseInt(productIdStr, 10);
        if (!isNaN(productId) && typeof category === 'string' && CATEGORIES.includes(category)) {
          updates.push({ id: productId, category });
        }
      }

      let applied = 0;
      for (const update of updates) {
        try {
          await db
            .update(products)
            .set({ categoryId: parseInt(update.category, 10) })
            .where(eq(products.id, update.id));
          applied++;
        } catch (error) {
          console.error(`Erro ao atualizar produto ${update.id}:`, error);
        }
      }

      return {
        applied,
        total: updates.length,
      };
    }),

  // Obter estatísticas de reclassificação
  getReclassificationStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      return {
        needsReclassification: 0,
        byCategory: {},
        categories: CATEGORIES,
      };
    }
    const needsReclassification = await db
      .select({ count: products.id })
      .from(products)
      .where(
        or(
          isNull(products.categoryId),
          eq(products.categoryId, 0)
        )
      );

    const byCategory = await db
      .select({
        categoryId: products.categoryId,
        count: products.id,
      })
      .from(products);

    const categoryStats: Record<string, number> = {};
    for (const row of byCategory) {
      const cat = row.categoryId?.toString() || "Sem Categoria";
      categoryStats[cat] = (categoryStats[cat] || 0) + 1;
    }

    return {
      needsReclassification: needsReclassification[0]?.count || 0,
      byCategory: categoryStats,
      categories: CATEGORIES,
    };
  }),
});
