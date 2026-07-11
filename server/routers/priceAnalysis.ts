import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import {
  getPriceVariationsBySupplier,
  getPriceHistory,
  getSupplierComparison,
  getTopPriceVariations,
} from "../services/priceAnalysisService";

export const priceAnalysisRouter = router({
  /**
   * Obtém variações de preço por fornecedor
   */
  getVariationsBySupplier: protectedProcedure
    .input(
      z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      })
    )
    .query(async ({ input }) => {
      const variations = await getPriceVariationsBySupplier(
        input.startDate,
        input.endDate
      );
      return variations;
    }),

  /**
   * Obtém histórico de preços para gráfico de série temporal
   */
  getPriceHistory: protectedProcedure
    .input(
      z.object({
        supplierId: z.number().optional(),
        daysBack: z.number().default(30),
      })
    )
    .query(async ({ input }) => {
      const history = await getPriceHistory(input.supplierId, input.daysBack);
      return history;
    }),

  /**
   * Obtém comparação de preços entre fornecedores
   */
  getSupplierComparison: protectedProcedure.query(async () => {
    const comparison = await getSupplierComparison();
    return comparison;
  }),

  /**
   * Obtém produtos com maior variação de preço
   */
  getTopVariations: protectedProcedure
    .input(
      z.object({
        limit: z.number().default(10),
      })
    )
    .query(async ({ input }) => {
      const variations = await getTopPriceVariations(input.limit);
      return variations;
    }),
});
