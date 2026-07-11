import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import {
  startCaptureForSupplier,
  scheduleSupplierCapture,
  stopScheduledCapture,
  reprocessFailedCaptures,
  cleanupOldCaptureLogs,
  getSchedulerStatus,
  monitorCaptureHealth,
} from "../services/captureSchedulerService";

export const captureSchedulerRouter = router({
  /**
   * Inicia captura manual para um fornecedor
   */
  startCapture: protectedProcedure
    .input(z.object({ supplierId: z.number() }))
    .mutation(async ({ input }) => {
      return await startCaptureForSupplier(input.supplierId);
    }),

  /**
   * Agenda captura periódica
   */
  scheduleCapture: protectedProcedure
    .input(
      z.object({
        supplierId: z.number(),
        frequencyHours: z.number().default(24),
      })
    )
    .mutation(async ({ input }) => {
      await scheduleSupplierCapture(input.supplierId, input.frequencyHours);
      return { success: true };
    }),

  /**
   * Para agendamento de captura
   */
  stopCapture: protectedProcedure
    .input(z.object({ supplierId: z.number() }))
    .mutation(async ({ input }) => {
      stopScheduledCapture(input.supplierId);
      return { success: true };
    }),

  /**
   * Reprocessa capturas falhadas
   */
  reprocessFailures: protectedProcedure
    .input(
      z.object({
        supplierId: z.number().optional(),
        maxRetries: z.number().default(3),
      })
    )
    .mutation(async ({ input }) => {
      return await reprocessFailedCaptures(
        input.supplierId,
        input.maxRetries
      );
    }),

  /**
   * Limpa logs antigos
   */
  cleanupLogs: protectedProcedure
    .input(z.object({ daysToKeep: z.number().default(30) }))
    .mutation(async ({ input }) => {
      const cleaned = await cleanupOldCaptureLogs(input.daysToKeep);
      return { cleaned };
    }),

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
