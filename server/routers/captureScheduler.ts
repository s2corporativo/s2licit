import { TRPCError } from "@trpc/server";
import { editorProcedure, protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import {
  stopScheduledCapture,
  getSchedulerStatus,
  monitorCaptureHealth,
} from "../services/captureSchedulerService";

function captureUnavailable(): never {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message:
      "O agendador legado foi desativado porque não executava captura real. Use Captura Inteligente ou o Agente de Preços.",
  });
}

export const captureSchedulerRouter = router({
  /**
   * Inicia captura manual para um fornecedor
   */
  startCapture: editorProcedure
    .input(z.object({ supplierId: z.number() }))
    .mutation(captureUnavailable),

  /**
   * Agenda captura periódica
   */
  scheduleCapture: editorProcedure
    .input(
      z.object({
        supplierId: z.number(),
        frequencyHours: z.number().default(24),
      })
    )
    .mutation(captureUnavailable),

  /**
   * Para agendamento de captura
   */
  stopCapture: editorProcedure
    .input(z.object({ supplierId: z.number() }))
    .mutation(async ({ input }) => {
      stopScheduledCapture(input.supplierId);
      return { success: true };
    }),

  /**
   * Reprocessa capturas falhadas
   */
  reprocessFailures: editorProcedure
    .input(
      z.object({
        supplierId: z.number().optional(),
        maxRetries: z.number().default(3),
      })
    )
    .mutation(captureUnavailable),

  /**
   * Limpa logs antigos
   */
  cleanupLogs: editorProcedure
    .input(z.object({ daysToKeep: z.number().default(30) }))
    .mutation(captureUnavailable),

  /**
   * Obtém status de agendamentos
   */
  getStatus: protectedProcedure.query(async () => {
    return getSchedulerStatus();
  }),

  /**
   * Monitora saúde de capturas
   */
  getHealth: protectedProcedure.query(async () => {
    return await monitorCaptureHealth();
  }),
});
