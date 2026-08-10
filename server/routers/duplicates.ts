import { and, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { duplicateExceptions, products } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { findDuplicateGroups, mergeProductGroup } from "../db/duplicateMerge";
import { combinedStringSimilarity } from "../matching/productMatcher";

function pairKey(a: number, b: number) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export const duplicatesRouter = router({
  detectDuplicates: protectedProcedure
    .input(z.object({
      minSimilarity: z.number().min(0).max(1).default(0.7),
      limit: z.number().min(1).max(1000).default(100),
    }))
    .query(async ({ input }) => {
      const groups = await findDuplicateGroups({ threshold: Math.max(0.5, input.minSimilarity), limit: input.limit });
      return groups.map((group) => ({
        groupId: `canonical_${group.groupId}`,
        similarity: group.similarity,
        products: group.products.map((product, index) => ({
          id: product.id,
          name: product.name,
          concentration: product.concentration,
          presentation: product.presentation,
          manufacturer: null as string | null,
          similarity: index === 0 ? 1 : combinedStringSimilarity(group.products[0].name, product.name),
        })),
      }));
    }),

  mergeDuplicates: protectedProcedure
    .input(z.object({
      primaryProductId: z.number().int().positive(),
      secondaryProductId: z.number().int().positive(),
      keepFields: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await mergeProductGroup(input.primaryProductId, [input.secondaryProductId]);
      return {
        success: true,
        primaryProductId: input.primaryProductId,
        secondaryProductId: input.secondaryProductId,
        message: "Produtos mesclados pelo motor canônico",
        ...result,
      };
    }),

  replaceProduct: protectedProcedure
    .input(z.object({ oldProductId: z.number().int().positive(), newProductId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const result = await mergeProductGroup(input.newProductId, [input.oldProductId]);
      return { success: true, oldProductId: input.oldProductId, newProductId: input.newProductId, message: "Produto substituído pelo merge canônico", ...result };
    }),

  markAsNotDuplicate: protectedProcedure
    .input(z.object({ productId1: z.number().int().positive(), productId2: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      if (input.productId1 === input.productId2) throw new Error("Não é possível marcar um produto como não duplicado dele mesmo");
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");
      const existing = await db.select({ id: duplicateExceptions.id }).from(duplicateExceptions).where(or(
        and(eq(duplicateExceptions.productId1, input.productId1), eq(duplicateExceptions.productId2, input.productId2)),
        and(eq(duplicateExceptions.productId1, input.productId2), eq(duplicateExceptions.productId2, input.productId1)),
      )).limit(1);
      if (!existing.length) {
        const [a, b] = input.productId1 < input.productId2 ? [input.productId1, input.productId2] : [input.productId2, input.productId1];
        await db.insert(duplicateExceptions).values({ productId1: a, productId2: b });
      }
      return { success: true, pair: pairKey(input.productId1, input.productId2), message: "Exceção persistida no motor canônico" };
    }),

  listDuplicateGroups: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
      minSimilarity: z.number().min(0).max(1).default(0.7),
    }))
    .query(async ({ input }) => {
      const maxNeeded = Math.min(input.page * input.pageSize + 200, 1000);
      const detected = await findDuplicateGroups({ threshold: Math.max(0.5, input.minSimilarity), limit: maxNeeded });
      const start = (input.page - 1) * input.pageSize;
      const groups = detected.slice(start, start + input.pageSize).map((group) => ({
        groupId: `canonical_${group.groupId}`,
        count: group.products.length,
        similarity: group.similarity,
        products: group.products.map((product) => ({ id: product.id, name: product.name, concentration: product.concentration })),
      }));
      return {
        groups,
        total: detected.length,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(detected.length / input.pageSize),
        truncated: detected.length >= maxNeeded,
      };
    }),

  getDuplicateStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB indisponível");
    const groups = await findDuplicateGroups({ threshold: 0.7, limit: 1000 });
    const affected = new Set(groups.flatMap((group) => group.products.map((product) => product.id)));
    const [totalRows] = await db.select({ total: sql<number>`COUNT(*)` }).from(products).where(eq(products.isActive, "yes"));
    const totalProducts = Number(totalRows?.total ?? 0);
    return {
      totalProducts,
      totalDuplicateGroups: groups.length,
      totalDuplicateProducts: affected.size,
      duplicatePercentage: totalProducts > 0 ? ((affected.size / totalProducts) * 100).toFixed(2) : "0.00",
      truncated: groups.length >= 1000,
    };
  }),
});
