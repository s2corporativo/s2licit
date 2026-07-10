import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import {
  sendNotification,
  registerWebhook,
  deactivateWebhook,
  getNotificationHistory,
} from "../services/notificationService";
import { getDb } from "../db";
import { notificationWebhooks } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const notificationWebhooksRouter = router({
  /**
   * Registrar novo webhook
   */
  register: protectedProcedure
    .input(
      z.object({
        supplierId: z.number(),
        type: z.enum(["slack", "email"]),
        webhookUrl: z.string().url(),
        name: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const success = await registerWebhook(
        input.supplierId,
        input.type,
        input.webhookUrl,
        input.name
      );

      return {
        success,
        message: success
          ? "Webhook registrado com sucesso"
          : "Erro ao registrar webhook",
      };
    }),

  /**
   * Listar webhooks de um fornecedor
   */
  list: protectedProcedure
    .input(z.object({ supplierId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      const webhooks = await db
        .select()
        .from(notificationWebhooks)
        .where(eq(notificationWebhooks.supplierId, input.supplierId));

      return webhooks;
    }),

  /**
   * Desativar webhook
   */
  deactivate: protectedProcedure
    .input(z.object({ webhookId: z.number() }))
    .mutation(async ({ input }) => {
      const success = await deactivateWebhook(input.webhookId);

      return {
        success,
        message: success
          ? "Webhook desativado com sucesso"
          : "Erro ao desativar webhook",
      };
    }),

  /**
   * Obter histórico de notificações
   */
  history: protectedProcedure
    .input(z.object({ supplierId: z.number(), limit: z.number().optional() }))
    .query(async ({ input }) => {
      const history = await getNotificationHistory(
        input.supplierId,
        input.limit || 50
      );

      return history;
    }),

  /**
   * Enviar notificação de teste
   */
  test: protectedProcedure
    .input(z.object({ supplierId: z.number() }))
    .mutation(async ({ input }) => {
      const success = await sendNotification(input.supplierId, {
        type: "error",
        title: "Teste de Notificação",
        message: "Esta é uma notificação de teste do sistema S2.",
        severity: "info",
        data: {
          timestamp: new Date().toLocaleString("pt-BR"),
          environment: "test",
        },
      });

      return {
        success,
        message: success
          ? "Notificação de teste enviada"
          : "Erro ao enviar notificação de teste",
      };
    }),
});
