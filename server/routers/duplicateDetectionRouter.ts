import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  approveMerge,
  getProductDuplicateProfile,
  ignoreResult,
  listPotentialDuplicates,
  runFullDuplicateDetection,
} from "../services/duplicateDetectionService";

export const duplicateDetectionRouter = router({
  runScan: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(20).max(1000).default(400),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      return runFullDuplicateDetection({
        triggeredByUserId: ctx.user.id,
        limit: input.limit,
      });
    }),

  listResults: publicProcedure
    .input(
      z.object({
        classification: z.enum(["all", "confirmed", "probable", "review", "distinct"]).default("all"),
        runId: z.number().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input }) => {
      return listPotentialDuplicates(input);
    }),

  listGroups: publicProcedure
    .input(
      z.object({
        runId: z.number().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input }) => {
      const rows = await listPotentialDuplicates({
        classification: "all",
        runId: input.runId,
        page: input.page,
        pageSize: input.pageSize,
      });

      const grouped = new Map<string, typeof rows>();
      for (const row of rows) {
        const key = `${row.primaryProductId}-${row.classification}`;
        const current = grouped.get(key) ?? [];
        current.push(row);
        grouped.set(key, current);
      }

      return [...grouped.entries()].map(([key, items]) => ({
        key,
        classification: items[0]?.classification ?? "review",
        scoreMax: Math.max(...items.map((item) => Number(item.score ?? 0))),
        items,
      }));
    }),

  approveMerge: protectedProcedure
    .input(z.object({ resultId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      return approveMerge({ resultId: input.resultId, performedByUserId: ctx.user.id });
    }),

  ignoreResult: protectedProcedure
    .input(z.object({ resultId: z.number(), markDistinct: z.boolean().default(false) }))
    .mutation(async ({ input, ctx }) => {
      return ignoreResult({ resultId: input.resultId, performedByUserId: ctx.user.id, markDistinct: input.markDistinct });
    }),

  getProductDuplicateProfile: publicProcedure
    .input(z.object({ productId: z.number() }))
    .query(async ({ input }) => {
      const rows = await getProductDuplicateProfile(input.productId);
      return rows.filter((row) => row.primaryProductId === input.productId || row.secondaryProductId === input.productId);
    }),
});
