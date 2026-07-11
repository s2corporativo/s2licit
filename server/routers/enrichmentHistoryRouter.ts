import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { enrichmentHistoryService } from "../services/enrichmentHistoryService";
import { TRPCError } from "@trpc/server";

export const enrichmentHistoryRouter = router({
  // Criar nova execução de enriquecimento
  createExecution: protectedProcedure
    .input(
      z.object({
        source: z.enum(["nfe_import", "manual", "batch_job", "api"]),
        totalProducts: z.number().int().min(0),
        metadata: z.record(z.string(), z.any()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const executionId = await enrichmentHistoryService.createExecution(
          input.source,
          input.totalProducts,
          input.metadata
        );
        return { executionId, success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create enrichment execution: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Atualizar status de execução
  updateExecutionStatus: protectedProcedure
    .input(
      z.object({
        executionId: z.string().uuid(),
        status: z.enum(["pending", "running", "completed", "failed"]),
        successCount: z.number().int().min(0).optional(),
        failureCount: z.number().int().min(0).optional(),
        skippedCount: z.number().int().min(0).optional(),
        averageConfidenceScore: z.number().min(0).max(100).optional(),
        errorMessage: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        await enrichmentHistoryService.updateExecutionStatus(input.executionId, input.status, {
          successCount: input.successCount,
          failureCount: input.failureCount,
          skippedCount: input.skippedCount,
          averageConfidenceScore: input.averageConfidenceScore,
          errorMessage: input.errorMessage,
        });
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to update execution status: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Adicionar resultado de enriquecimento
  addResult: protectedProcedure
    .input(
      z.object({
        executionId: z.string().uuid(),
        productId: z.number().int().positive(),
        fieldName: z.string().min(1),
        originalValue: z.string().nullable(),
        suggestedValue: z.string().nullable(),
        confidenceScore: z.number().min(0).max(100),
      })
    )
    .mutation(async ({ input }) => {
      try {
        await enrichmentHistoryService.addResult(
          input.executionId,
          input.productId,
          input.fieldName,
          input.originalValue,
          input.suggestedValue,
          input.confidenceScore
        );
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to add enrichment result: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Aprovar resultado
  approveResult: protectedProcedure
    .input(
      z.object({
        resultId: z.number().int().positive(),
        appliedValue: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        await enrichmentHistoryService.approveResult(input.resultId, input.appliedValue);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to approve result: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Rejeitar resultado
  rejectResult: protectedProcedure
    .input(
      z.object({
        resultId: z.number().int().positive(),
        reviewNotes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        await enrichmentHistoryService.rejectResult(input.resultId, input.reviewNotes);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to reject result: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Aplicar resultado
  applyResult: protectedProcedure
    .input(
      z.object({
        resultId: z.number().int().positive(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        await enrichmentHistoryService.applyResult(input.resultId);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to apply result: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Listar execuções com filtros
  listExecutions: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
        source: z.enum(["nfe_import", "manual", "batch_job", "api"]).optional(),
        status: z.enum(["pending", "running", "completed", "failed"]).optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const result = await enrichmentHistoryService.listExecutions(input.limit, input.offset, {
          source: input.source,
          status: input.status,
          startDate: input.startDate,
          endDate: input.endDate,
        });
        return result;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to list executions: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Obter detalhes de uma execução
  getExecutionDetail: protectedProcedure
    .input(
      z.object({
        executionId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      try {
        const detail = await enrichmentHistoryService.getExecutionDetail(input.executionId);
        if (!detail) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Execution not found",
          });
        }
        return detail;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to get execution detail: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Obter estatísticas gerais
  getStats: protectedProcedure.query(async () => {
    try {
      return await enrichmentHistoryService.getStats();
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to get stats: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }),

  // Obter resultados de uma execução
  getResultsByExecution: protectedProcedure
    .input(
      z.object({
        executionId: z.string().uuid(),
        status: z.enum(["pending", "approved", "rejected", "applied"]).optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        return await enrichmentHistoryService.getResultsByExecution(input.executionId, input.status);
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to get results: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Obter execuções por intervalo de datas
  getExecutionsByDateRange: protectedProcedure
    .input(
      z.object({
        startDate: z.date(),
        endDate: z.date(),
      })
    )
    .query(async ({ input }) => {
      try {
        return await enrichmentHistoryService.getExecutionsByDateRange(input.startDate, input.endDate);
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to get executions by date range: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Obter execuções por fonte
  getExecutionsBySource: protectedProcedure
    .input(
      z.object({
        source: z.enum(["nfe_import", "manual", "batch_job", "api"]),
      })
    )
    .query(async ({ input }) => {
      try {
        return await enrichmentHistoryService.getExecutionsBySource(input.source);
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to get executions by source: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),
});
