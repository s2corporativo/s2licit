import { editorProcedure, protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb, mergeProductGroup } from "../db";
import { products, duplicateExceptions } from "../../drizzle/schema";
import { eq, or, and } from "drizzle-orm";
import { jaroWinklerSimilarity as canonicalJaroWinklerSimilarity } from "../matching/productMatcher";
import { recordAudit } from "../services/auditService";

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
 * Delega para matching/productMatcher.ts#jaroWinklerSimilarity.
 */
function jaroWinklerSimilarity(s1: string, s2: string): number {
  return canonicalJaroWinklerSimilarity(s1.toLowerCase().trim(), s2.toLowerCase().trim());
}

export const duplicatesRouter = router({
  /** Detectar produtos duplicados. */
  detectDuplicates: protectedProcedure
    .input(z.object({
      minSimilarity: z.number().min(0).max(1).default(0.7),
      limit: z.number().min(1).max(1000).default(100),
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

          const nameSimilarity = jaroWinklerSimilarity(allProducts[i].name, allProducts[j].name);
          const concSimilarity =
            (!allProducts[i].concentration && !allProducts[j].concentration)
              ? 1
              : (allProducts[i].concentration && allProducts[j].concentration)
                ? jaroWinklerSimilarity(allProducts[i].concentration || "", allProducts[j].concentration || "")
                : 0;
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
   * Mescla dois produtos usando o merge canônico transacional, que preserva
   * histórico e redireciona propostas, equivalências, ofertas e preços.
   */
  mergeDuplicates: editorProcedure
    .input(z.object({
      primaryProductId: z.number().int().positive(),
      secondaryProductId: z.number().int().positive(),
      keepFields: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (input.primaryProductId === input.secondaryProductId) {
        throw new Error("Produto mestre e duplicado precisam ser diferentes");
      }
      const result = await mergeProductGroup(input.primaryProductId, [input.secondaryProductId]);
      await recordAudit({
        userId: ctx.user?.id ?? null,
        action: "product_merge",
        entity: "products",
        entityId: input.primaryProductId,
        origin: "operator",
        summary: `Produto ${input.secondaryProductId} mesclado no mestre ${input.primaryProductId}`,
        changes: {
          masterId: input.primaryProductId,
          duplicateIds: [input.secondaryProductId],
          merged: result.merged,
          redirected: result.redirected,
        },
      });
      return {
        success: true,
        primaryProductId: input.primaryProductId,
        secondaryProductId: input.secondaryProductId,
        merged: result.merged,
        redirected: result.redirected,
        message: "Produtos mesclados com sucesso e referências preservadas",
      };
    }),

  /** Substitui um produto antigo por outro usando o mesmo merge transacional. */
  replaceProduct: editorProcedure
    .input(z.object({
      oldProductId: z.number().int().positive(),
      newProductId: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (input.oldProductId === input.newProductId) {
        throw new Error("Produto antigo e novo precisam ser diferentes");
      }
      const result = await mergeProductGroup(input.newProductId, [input.oldProductId]);
      await recordAudit({
        userId: ctx.user?.id ?? null,
        action: "product_replace",
        entity: "products",
        entityId: input.newProductId,
        origin: "operator",
        summary: `Produto ${input.oldProductId} substituído pelo mestre ${input.newProductId}`,
        changes: {
          oldProductId: input.oldProductId,
          newProductId: input.newProductId,
          merged: result.merged,
          redirected: result.redirected,
        },
      });
      return {
        success: true,
        oldProductId: input.oldProductId,
        newProductId: input.newProductId,
        merged: result.merged,
        redirected: result.redirected,
        message: "Produto substituído com sucesso e referências preservadas",
      };
    }),

  /** Marca dois produtos como não duplicados. */
  markAsNotDuplicate: editorProcedure
    .input(z.object({
      productId1: z.number().int().positive(),
      productId2: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
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
            and(eq(duplicateExceptions.productId1, input.productId2), eq(duplicateExceptions.productId2, input.productId1)),
          ),
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(duplicateExceptions).values({
          productId1: input.productId1,
          productId2: input.productId2,
        });
        await recordAudit({
          userId: ctx.user?.id ?? null,
          action: "product_duplicate_exception",
          entity: "products",
          entityId: input.productId1,
          origin: "operator",
          summary: `Produtos ${input.productId1} e ${input.productId2} marcados como distintos`,
          changes: { productId1: input.productId1, productId2: input.productId2 },
        });
      }

      return { success: true, message: "Marcado como não duplicado" };
    }),

  /** Listar grupos de duplicados detectados com paginação. */
  listDuplicateGroups: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
      minSimilarity: z.number().min(0).max(1).default(0.7),
    }))
    .query(async ({ input }) => {
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
        products: Array<{ id: number; name: string; concentration: string | null }>;
      }> = [];
      const processed = new Set<number>();

      for (let i = 0; i < allProducts.length; i++) {
        if (processed.has(allProducts[i].id)) continue;
        const group = [allProducts[i]];
        processed.add(allProducts[i].id);

        for (let j = i + 1; j < allProducts.length; j++) {
          if (processed.has(allProducts[j].id)) continue;
          if (exceptions.has(pairKey(allProducts[i].id, allProducts[j].id))) continue;
          const nameSimilarity = jaroWinklerSimilarity(allProducts[i].name, allProducts[j].name);
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
            products: group.map((p) => ({ id: p.id, name: p.name, concentration: p.concentration })),
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

  /** Obter estatísticas de duplicados. */
  getDuplicateStats: protectedProcedure.query(async () => {
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
        const similarity = jaroWinklerSimilarity(allProducts[i].name, allProducts[j].name);
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
      duplicatePercentage: allProducts.length > 0
        ? (totalDuplicateProducts / allProducts.length * 100).toFixed(2)
        : "0.00",
    };
  }),
});
