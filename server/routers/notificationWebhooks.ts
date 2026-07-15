import { editorProcedure, router } from "../_core/trpc";
import { z } from "zod";
import {
  deactivateWebhook,
  getNotificationHistory,
  maskNotificationDestination,
  registerWebhook,
  sendNotification,
  validateNotificationDestination,
  type NotificationChannel,
} from "../services/notificationService";
import { getDb } from "../db";
import { notificationWebhooks } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

const registerInput = z.discriminatedUnion("type", [
  z.object({
    supplierId: z.number().int().positive(),
    type: z.literal("slack"),
    webhookUrl: z.string().url(),
    name: z.string().max(128).optional(),
  }),
  z.object({
    supplierId: z.number().int().positive(),
    type: z.literal("email"),
    webhookUrl: z.string().email(),
    name: z.string().max(128).optional(),
  }),
]);

export const notificationWebhooksRouter = router({
  register: editorProcedure.input(registerInput).mutation(async ({ input }) => {
    // Validação duplicada na borda e no serviço: o serviço também pode ser
    // chamado por jobs internos sem passar pelo tRPC.
    validateNotificationDestination(input.type, input.webhookUrl);
    const success = await registerWebhook(
      input.supplierId,
      input.type,
      input.webhookUrl,
      input.name,
    );

    return {
      success,
      message: success
        ? "Canal de notificação registrado com sucesso"
        : "Não foi possível registrar o canal de notificação",
    };
  }),

  /** Lista canais sem expor o token secreto presente na URL do Slack. */
  list: editorProcedure
    .input(z.object({ supplierId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const rows = await db
        .select()
        .from(notificationWebhooks)
        .where(eq(notificationWebhooks.supplierId, input.supplierId));

      return rows.map((row) => ({
        id: row.id,
        supplierId: row.supplierId,
        type: row.type,
        name: row.name,
        isActive: row.isActive,
        createdAt: row.createdAt,
        webhookUrl: maskNotificationDestination(
          row.type as NotificationChannel,
          row.webhookUrl,
        ),
      }));
    }),

  deactivate: editorProcedure
    .input(z.object({ webhookId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const success = await deactivateWebhook(input.webhookId);
      return {
        success,
        message: success
          ? "Canal de notificação desativado"
          : "Não foi possível desativar o canal",
      };
    }),

  history: editorProcedure
    .input(
      z.object({
        supplierId: z.number().int().positive(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
    )
    .query(({ input }) => getNotificationHistory(input.supplierId, input.limit ?? 50)),

  test: editorProcedure
    .input(z.object({ supplierId: z.number().int().positive() }))
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
          : "Nenhum canal conseguiu entregar a notificação de teste",
      };
    }),
});
