import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { MarginOptimizationService } from "../services/marginOptimizationService";

export const marginOptimizationRouter = router({
  suggestMargin: adminProcedure
    .input(z.object({
      categoryId: z.number(),
      volume: z.number().min(0),
      avgCost: z.number().positive(),
      currentMargin: z.number().min(0),
      competitorMargin: z.number().min(0),
      seasonalFactor: z.number().min(0.5).max(2),
      profitHistory: z.array(z.number()).default([]),
    }))
    .query(({ input }: { input: any }) => {
      const result = MarginOptimizationService.calculateOptimalMargin({
        categoryId: input.categoryId,
        volume: input.volume,
        avgCost: input.avgCost,
        currentMargin: input.currentMargin,
        competitorMargin: input.competitorMargin,
        seasonalFactor: input.seasonalFactor,
        profitHistory: input.profitHistory,
      });
      return result;
    }),

  batchOptimize: adminProcedure
    .input(z.array(z.object({
      categoryId: z.number(),
      volume: z.number().min(0),
      avgCost: z.number().positive(),
      currentMargin: z.number().min(0),
      competitorMargin: z.number().min(0),
      seasonalFactor: z.number().min(0.5).max(2),
      profitHistory: z.array(z.number()).default([]),
    })))
    .query(({ input }: { input: any }) => {
      return MarginOptimizationService.batchOptimizeMargins(input);
    }),
});
