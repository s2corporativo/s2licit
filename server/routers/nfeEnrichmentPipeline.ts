import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { processNfeEnrichmentPipeline } from "../services/nfeEnrichmentPipelineService";

export const nfeEnrichmentPipelineRouter = router({
  /**
   * O pipeline atual é síncrono: a chamada só retorna quando todos os produtos
   * terminaram. Portanto, não há job em segundo plano para consultar/cancelar.
   */
  startEnrichmentPipeline: protectedProcedure
    .input(
      z.object({
        productIds: z.array(z.number().int().positive()).min(1).max(300),
        supplierId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const result = await processNfeEnrichmentPipeline(input.productIds, input.supplierId);
        return {
          success: result.failed === 0,
          partial: result.failed > 0 && result.enriched > 0,
          message: `Pipeline concluído: ${result.enriched} enriquecido(s), ${result.matched} match(es), ${result.failed} erro(s)`,
          ...result,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Erro ao executar pipeline",
        });
      }
    }),

  getPipelineStatus: protectedProcedure
    .input(z.object({ productIds: z.array(z.number()).optional() }).optional())
    .query(() => {
      throw new TRPCError({
        code: "METHOD_NOT_SUPPORTED",
        message: "O pipeline é síncrono e não possui execução pendente para consulta. O resultado é devolvido pela própria chamada de início.",
      });
    }),

  cancelPipeline: protectedProcedure.mutation(() => {
    throw new TRPCError({
      code: "METHOD_NOT_SUPPORTED",
      message: "Não há job em segundo plano para cancelar. A opção será reativada somente após implantação de fila persistente.",
    });
  }),
});
