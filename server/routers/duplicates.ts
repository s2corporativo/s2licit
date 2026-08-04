import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { products, duplicateExceptions } from "../../drizzle/schema";
import { eq, or, and } from "drizzle-orm";
import { logger } from "../_core/logger";
import { jaroWinklerSimilarity as canonicalJaroWinklerSimilarity } from "../matching/productMatcher";

function pairKey(id1: number, id2: number): string {
  return id1 < id2 ? `${id1}:${id2}` : `${id2}:${id1}`;
}

/** Carrega os pares marcados como "não duplicados" como um Set para checagem O(1). */
async function loadExceptionPairs(db: NonNullable<Awaited<ReturnType<typeof getDb>>>): Promise<Set<string>> {
  const rows = await db.select({ productId1: duplicateExceptions.productId1, productId2: duplicateExceptions.productId2 }).from(duplicateExceptions);
  return new Set(rows.map((r) => pairKey(r.productId1, r.productId2)));
}

/**
 * Similaridade Jaro-Winkler (0-1, 1 = idêntico), case-insensitive.
 * Delega para matching/productMatcher.ts#jaroWinklerSimilarity — este
 * arquivo tinha sua própria cópia do algoritmo com um bug real: a janela
 * de match (`maxDist`) não usava Math.floor, divergindo do algoritmo
 * padrão para strings de tamanho ímpar (ex.: par com maior comprimento 5
 * dava janela 1.5 em vez de 1). A versão canônica é a implementação
 * correta (com Math.floor) já usada e testada em 4 outros pontos do
 * matching de produtos.
 */
function jaroWinklerSimilarity(s1: string, s2: string): number {
  return canonicalJaroWinklerSimilarity(s1.toLowerCase().trim(), s2.toLowerCase().trim());
}

export const duplicatesRouter = router({
  /**
   * Detectar produtos duplicados
   * Retorna grupos de produtos com similaridade > 0.7 em nome + concentração
   */
  detectDuplicates: protectedProcedure
    .input(z.object({ 
      minSimilarity: z.number().min(0).max(1).default(0.7),
      limit: z.number().min(1).max(1000).default(100)
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");

      const allProducts = await db
        .select()
        .from(products)
        .where(eq(products.isActive, "yes"))
        .limit(1000);

      const exceptions = await loadExceptionPairs(db);

      const duplicateGroups: Array<{
        groupId: string;
        products: Array<{
          id: number;
          name: string;
          concentration: string | null;
          presentation: string | null;
          manufacturer: string | null;
          similarity: number;
        }>;
        similarity: number;
      }> = [];

      const processed = new Set<number>();

      for (let i = 0; i < allProducts.length; i++) {
        if (processed.has(allProducts[i].id)) continue;

        const group = [allProducts[i]];
        processed.add(allProducts[i].id);

        for (let j = i + 1; j < allProducts.length; j++) {
          if (processed.has(allProducts[j].id)) continue;
          if (exceptions.has(pairKey(allProducts[i].id, allProducts[j].id))) continue;

          const nameSimilarity = jaroWinklerSimilarity(
            allProducts[i].name,
            allProducts[j].name
          );

          // Se concentração é similar ou ambas vazias
          const concSimilarity = 
            (!allProducts[i].concentration && !allProducts[j].concentration) ? 1 :
            (allProducts[i].concentration && allProducts[j].concentration) ?
              jaroWinklerSimilarity(
                allProducts[i].concentration || "",
                allProducts[j].concentration || ""
              ) : 0;

          // Score combinado: 60% nome + 40% concentração
          const combinedScore = nameSimilarity * 0.6 + concSimilarity * 0.4;

          if (combinedScore >= input.minSimilarity) {
            group.push(allProducts[j]);
            processed.add(allProducts[j].id);
          }
        }

        if (group.length > 1) {
          const avgSimilarity = group.reduce((sum, p, idx) => {
            if (idx === 0) return 0;
            return sum + jaroWinklerSimilarity(group[0].name, p.name);
          }, 0) / (group.length - 1);

          duplicateGroups.push({
            groupId: `group_${Date.now()}_${Math.random()}`,
            products: group.map((p) => ({
              id: p.id,
              name: p.name,
              concentration: p.concentration,
              presentation: p.presentation,
              manufacturer: p.manufacturer,
              similarity: jaroWinklerSimilarity(group[0].name, p.name),
            })),
            similarity: avgSimilarity,
          });
        }
      }

      return duplicateGroups.slice(0, input.limit);
    }),

  /**
   * Mesclar dois produtos em um
   * Mantém o produto principal e atualiza referências do secundário
   */
  mergeDuplicates: protectedProcedure
    .input(z.object({
      primaryProductId: z.number(),
      secondaryProductId: z.number(),
      keepFields: z.array(z.string()).optional(), // Campos do secundário a manter
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");

      const primary = await db
        .select()
        .from(products)
        .where(eq(products.id, input.primaryProductId))
        .then((rows) => rows[0]);

      const secondary = await db
        .select()
        .from(products)
        .where(eq(products.id, input.secondaryProductId))
        .then((rows) => rows[0]);

      if (!primary || !secondary) {
        throw new Error("Um ou ambos os produtos não encontrados");
      }

      // Mesclar campos: manter valores do primário, preencher vazios com secundário
      let merged = {
        ...primary,
        activeIngredient: primary.activeIngredient || secondary.activeIngredient,
        concentration: primary.concentration || secondary.concentration,
        presentation: primary.presentation || secondary.presentation,
        manufacturer: primary.manufacturer || secondary.manufacturer,
        imageUrl: primary.imageUrl || secondary.imageUrl,
        productUrl: primary.productUrl || secondary.productUrl,
        barcode: primary.barcode || secondary.barcode,
        mapa: primary.mapa || secondary.mapa,
      };

      // Se campos importantes estão vazios, usar LLM para consolidar
      if (!merged.activeIngredient || !merged.concentration) {
        try {
          const { invokeLLM } = await import("../_core/llm");
          const response = await invokeLLM({
            messages: [
              {
                role: "system",
                content: "Você é um especialista em catálogo de produtos (veterinários, humanos, materiais de construção e insumos). Consolide as informações dos produtos duplicados, retornando JSON.",
              },
              {
                role: "user",
                content: `Produto 1: ${JSON.stringify(primary)}\nProduto 2: ${JSON.stringify(secondary)}\n\nRetorne JSON com: activeIngredient, concentration, manufacturer`,
              },
            ],
          });
          try {
            const content = typeof response.choices[0].message.content === 'string' 
              ? response.choices[0].message.content 
              : JSON.stringify(response.choices[0].message.content);
            const consolidated = JSON.parse(content || "{}");
            merged.activeIngredient = consolidated.activeIngredient || merged.activeIngredient;
            merged.concentration = consolidated.concentration || merged.concentration;
            merged.manufacturer = consolidated.manufacturer || merged.manufacturer;
          } catch (e) {
            logger.error("Erro ao parsear resposta LLM:", e);
          }
        } catch (e) {
          logger.error("Erro ao consolidar com LLM:", e);
        }
      }

      // Atualizar produto primário
      await db
        .update(products)
        .set(merged)
        .where(eq(products.id, input.primaryProductId));

      // Desativar produto secundário (não deletar para manter histórico),
      // com carimbo de quando e para onde foi fundido
      await db
        .update(products)
        .set({ isActive: "no", deletedAt: new Date(), mergedIntoId: input.primaryProductId })
        .where(eq(products.id, input.secondaryProductId));

      return {
        success: true,
        primaryProductId: input.primaryProductId,
        secondaryProductId: input.secondaryProductId,
        message: "Produtos mesclados com sucesso",
      };
    }),

  /**
   * Substituir referências de um produto por outro
   * Útil quando um produto é claramente duplicado
   */
  replaceProduct: protectedProcedure
    .input(z.object({
      oldProductId: z.number(),
      newProductId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");

      // Desativar produto antigo, com carimbo de quando e para onde apontou
      await db
        .update(products)
        .set({ isActive: "no", deletedAt: new Date(), mergedIntoId: input.newProductId })
        .where(eq(products.id, input.oldProductId));

      return {
        success: true,
        oldProductId: input.oldProductId,
        newProductId: input.newProductId,
        message: "Produto substituído com sucesso",
      };
    }),

  /**
   * Marcar dois produtos como "não duplicados"
   * Adiciona à tabela de exceções para não aparecer novamente
   */
  markAsNotDuplicate: protectedProcedure
    .input(z.object({
      productId1: z.number(),
      productId2: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");

      if (input.productId1 === input.productId2) {
        throw new Error("Não é possível marcar um produto como não duplicado dele mesmo");
      }

      const existing = await db
        .select({ id: duplicateExceptions.id })
        .from(duplicateExceptions)
        .where(
          or(
            and(eq(duplicateExceptions.productId1, input.productId1), eq(duplicateExceptions.productId2, input.productId2)),
            and(eq(duplicateExceptions.productId1, input.productId2), eq(duplicateExceptions.productId2, input.productId1))
          )
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(duplicateExceptions).values({
          productId1: input.productId1,
          productId2: input.productId2,
        });
      }

      return {
        success: true,
        message: "Marcado como não duplicado",
      };
    }),

  /**
   * Listar todos os grupos de duplicados detectados
   * Com paginação e filtros
   */
  listDuplicateGroups: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
      minSimilarity: z.number().min(0).max(1).default(0.7),
    }))
    .query(async ({ input }) => {
      // Reutilizar detectDuplicates com limite
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");

      const allProducts = await db
        .select()
        .from(products)
        .where(eq(products.isActive, "yes"));

      const exceptions = await loadExceptionPairs(db);

      const duplicateGroups: Array<{
        groupId: string;
        count: number;
        similarity: number;
        products: Array<{
          id: number;
          name: string;
          concentration: string | null;
        }>;
      }> = [];

      const processed = new Set<number>();

      for (let i = 0; i < allProducts.length; i++) {
        if (processed.has(allProducts[i].id)) continue;

        const group = [allProducts[i]];
        processed.add(allProducts[i].id);

        for (let j = i + 1; j < allProducts.length; j++) {
          if (processed.has(allProducts[j].id)) continue;
          if (exceptions.has(pairKey(allProducts[i].id, allProducts[j].id))) continue;

          const nameSimilarity = jaroWinklerSimilarity(
            allProducts[i].name,
            allProducts[j].name
          );

          if (nameSimilarity >= input.minSimilarity) {
            group.push(allProducts[j]);
            processed.add(allProducts[j].id);
          }
        }

        if (group.length > 1) {
          const avgSimilarity = group.reduce((sum, p, idx) => {
            if (idx === 0) return 0;
            return sum + jaroWinklerSimilarity(group[0].name, p.name);
          }, 0) / (group.length - 1);

          duplicateGroups.push({
            groupId: `group_${i}`,
            count: group.length,
            similarity: avgSimilarity,
            products: group.map((p) => ({
              id: p.id,
              name: p.name,
              concentration: p.concentration,
            })),
          });
        }
      }

      const start = (input.page - 1) * input.pageSize;
      const end = start + input.pageSize;

      return {
        groups: duplicateGroups.slice(start, end),
        total: duplicateGroups.length,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(duplicateGroups.length / input.pageSize),
      };
    }),

  /**
   * Obter estatísticas de duplicados
   */
  getDuplicateStats: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");

      const allProducts = await db
        .select()
        .from(products)
        .where(eq(products.isActive, "yes"));

      let totalDuplicateGroups = 0;
      let totalDuplicateProducts = 0;
      const processed = new Set<number>();

      for (let i = 0; i < allProducts.length; i++) {
        if (processed.has(allProducts[i].id)) continue;

        let groupSize = 1;
        processed.add(allProducts[i].id);

        for (let j = i + 1; j < allProducts.length; j++) {
          if (processed.has(allProducts[j].id)) continue;

          const similarity = jaroWinklerSimilarity(
            allProducts[i].name,
            allProducts[j].name
          );

          if (similarity >= 0.7) {
            groupSize++;
            processed.add(allProducts[j].id);
          }
        }

        if (groupSize > 1) {
          totalDuplicateGroups++;
          totalDuplicateProducts += groupSize;
        }
      }

      return {
        totalProducts: allProducts.length,
        totalDuplicateGroups,
        totalDuplicateProducts,
        duplicatePercentage: (totalDuplicateProducts / allProducts.length * 100).toFixed(2),
      };
    }),
});
