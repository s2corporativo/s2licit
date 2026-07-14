import { editorProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { processNfeEnrichmentPipeline } from "../services/nfeEnrichmentPipelineService";

export const nfeEnrichmentPipelineRouter = router({
  /**
   * Inicia pipeline de enriquecimento para produtos importados de NF-e
   */
  startEnrichmentPipeline: editorProcedure
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
});
