import { router, protectedProcedure, editorProcedure } from "../_core/trpc";
import { z } from "zod";
import { processNfeEnrichmentPipeline } from "../services/nfeEnrichmentPipelineService";

export const nfeEnrichmentPipelineRouter = router({
  /**
   * Inicia pipeline de enriquecimento para produtos importados de NF-e
   */
  startEnrichmentPipeline: protectedProcedure
    .input(
      z.object({
        productIds: z.array(z.number()),
        supplierId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const result = await processNfeEnrichmentPipeline(input.productIds, input.supplierId);

        return {
          success: true,
          message: `Pipeline concluído: ${result.enriched} enriquecido(s), ${result.matched} match(es), ${result.failed} erro(s)`,
          ...result,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Erro ao iniciar pipeline",
        };
      }
    }),

  /**
   * Obtém status do pipeline de enriquecimento
   */
  getPipelineStatus: protectedProcedure
    .input(z.object({ productIds: z.array(z.number()) }))
    .query(async ({ input }) => {
      // TODO: Implementar rastreamento de status
      return {
        status: "idle",
        processed: 0,
        enriched: 0,
        matched: 0,
        failed: 0,
      };
    }),

  /**
   * Cancela pipeline em execução
   */
  cancelPipeline: editorProcedure.mutation(async () => {
    // TODO: Implementar cancelamento
    return { success: true, message: "Pipeline cancelado" };
  }),
});
