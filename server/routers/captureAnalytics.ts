import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import {
  getCaptureStats,
  getSupplierMetrics,
  getCaptureHistory,
  getSuccessRateByPeriod,
  getStatusDistribution,
} from "../services/captureAnalyticsService";

export const captureAnalyticsRouter = router({
  getStats: protectedProcedure
    .input(
      z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      }),
    )
    .query(async ({ input }) => {
      const stats = await getCaptureStats(input.startDate, input.endDate);
      return {
        totalCaptures: stats.totalCaptures,
        successfulCaptures: stats.successfulCaptures,
        failedCaptures: stats.failedCaptures,
        successRate: stats.successRate,
        averageDuration: stats.averageDuration,
        totalProductsCaptured: stats.totalProductsCaptured,
        unavailableMetrics: [
          "totalProductsEnriched",
          "totalProductsApproved",
          "totalProductsRejected",
        ],
      };
    }),

  getSupplierMetrics: protectedProcedure
    .input(
      z.object({
        supplierId: z.number().optional(),
        limit: z.number().int().min(1).max(100).default(10),
      }),
    )
    .query(({ input }) => getSupplierMetrics(input.supplierId, input.limit)),

  getHistory: protectedProcedure
    .input(
      z.object({
        supplierId: z.number().optional(),
        limit: z.number().int().min(1).max(500).default(50),
      }),
    )
    .query(({ input }) => getCaptureHistory(input.supplierId, input.limit)),

  getMostChanged: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(() => {
      throw new TRPCError({
        code: "METHOD_NOT_SUPPORTED",
        message: "Métrica indisponível: ainda não existe histórico auditável de alterações por captura.",
      });
    }),

  getPriceTrends: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(() => {
      throw new TRPCError({
        code: "METHOD_NOT_SUPPORTED",
        message: "Use o módulo Análise de Preços, que consulta a tabela real de histórico de preços.",
      });
    }),

  getSuccessRate: protectedProcedure
    .input(z.object({ periodDays: z.number().int().min(1).max(365).default(7) }))
    .query(({ input }) => getSuccessRateByPeriod(input.periodDays)),

  getStatusDistribution: protectedProcedure.query(() => getStatusDistribution()),
});
