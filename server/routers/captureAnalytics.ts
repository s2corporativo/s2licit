import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import {
  getCaptureStats,
  getSupplierMetrics,
  getCaptureHistory,
  getMostChangedProducts,
  getPriceTrends,
  getSuccessRateByPeriod,
  getStatusDistribution,
} from "../services/captureAnalyticsService";

export const captureAnalyticsRouter = router({
  /**
   * Obtém estatísticas gerais
   */
  getStats: protectedProcedure
    .input(
      z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      })
    )
    .query(async ({ input }) => {
      return await getCaptureStats(input.startDate, input.endDate);
    }),

  /**
   * Obtém métricas por fornecedor
   */
  getSupplierMetrics: protectedProcedure
    .input(
      z.object({
        supplierId: z.number().optional(),
        limit: z.number().default(10),
      })
    )
    .query(async ({ input }) => {
      return await getSupplierMetrics(input.supplierId, input.limit);
    }),

  /**
   * Obtém histórico de capturas
   */
  getHistory: protectedProcedure
    .input(
      z.object({
        supplierId: z.number().optional(),
        limit: z.number().default(50),
      })
    )
    .query(async ({ input }) => {
      return await getCaptureHistory(input.supplierId, input.limit);
    }),

  /**
   * Obtém produtos mais alterados
   */
  getMostChanged: protectedProcedure
    .input(z.object({ limit: z.number().default(20) }))
    .query(async ({ input }) => {
      return await getMostChangedProducts(input.limit);
    }),

  /**
   * Obtém tendências de preço
   */
  getPriceTrends: protectedProcedure
    .input(z.object({ limit: z.number().default(20) }))
    .query(async ({ input }) => {
      return await getPriceTrends(input.limit);
    }),

  /**
   * Obtém taxa de sucesso por período
   */
  getSuccessRate: protectedProcedure
    .input(z.object({ periodDays: z.number().default(7) }))
    .query(async ({ input }) => {
      return await getSuccessRateByPeriod(input.periodDays);
    }),

  /**
   * Obtém distribuição de status
   */
  getStatusDistribution: protectedProcedure.query(async () => {
    return await getStatusDistribution();
  }),
});
