import { getDb } from "../db";
import { notificationWebhooks, notificationHistory } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

export interface NotificationPayload {
  type: "nfe_import" | "capture_complete" | "enrichment_complete" | "error";
  title: string;
  message: string;
  data?: Record<string, any>;
  severity?: "info" | "warning" | "error";
}

/**
 * Envia notificação via webhook (Slack/Email)
 */
export async function sendNotification(
  supplierId: number,
  payload: NotificationPayload
): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");

    // Buscar webhooks configurados para este fornecedor
    const webhooks = await db
      .select()
      .from(notificationWebhooks)
      .where(
        and(
          eq(notificationWebhooks.supplierId, supplierId),
          eq(notificationWebhooks.isActive, true)
        )
      );

    let notificationSent = false;

    for (const webhook of webhooks) {
      try {
        // Preparar payload baseado no tipo de webhook
        let webhookPayload: any;

        if (webhook.type === "slack") {
          webhookPayload = {
            text: payload.title,
            blocks: [
              {
                type: "header",
                text: {
                  type: "plain_text",
                  text: payload.title,
                },
              },
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: payload.message,
                },
              },
              {
                type: "context",
                elements: [
                  {
                    type: "mrkdwn",
                    text: `*Tipo:* ${payload.type} | *Severidade:* ${payload.severity || "info"}`,
                  },
                ],
              },
            ],
          };

          if (payload.data) {
            const dataText = Object.entries(payload.data)
              .map(([key, value]) => `*${key}:* ${value}`)
              .join("\n");

            webhookPayload.blocks.push({
              type: "section",
              text: {
                type: "mrkdwn",
                text: dataText,
              },
            });
          }
        } else if (webhook.type === "email") {
          // Para email, usar o serviço de notificação built-in
          webhookPayload = {
            to: webhook.webhookUrl, // URL contém o email
            subject: payload.title,
            body: `
${payload.message}

---
Tipo: ${payload.type}
Severidade: ${payload.severity || "info"}
Data: ${new Date().toLocaleString("pt-BR")}

${
  payload.data
    ? Object.entries(payload.data)
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n")
    : ""
}
            `,
          };
        }

        // Enviar webhook
        const response = await fetch(webhook.webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(webhookPayload),
        });

        if (response.ok) {
          notificationSent = true;

          // Registrar no histórico
          await db.insert(notificationHistory).values({
            supplierId,
            webhookId: webhook.id,
            type: payload.type,
            title: payload.title,
            message: payload.message,
            status: "sent",
            sentAt: new Date(),
          });
        } else {
          // Registrar erro
          await db.insert(notificationHistory).values({
            supplierId,
            webhookId: webhook.id,
            type: payload.type,
            title: payload.title,
            message: payload.message,
            status: "failed",
            errorMessage: `HTTP ${response.status}: ${response.statusText}`,
            sentAt: new Date(),
          });
        }
      } catch (error) {
        console.error("[Notification] Erro ao enviar webhook:", error);

        // Registrar erro
        await db.insert(notificationHistory).values({
          supplierId,
          webhookId: webhook.id,
          type: payload.type,
          title: payload.title,
          message: payload.message,
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "Unknown error",
          sentAt: new Date(),
        });
      }
    }

    return notificationSent;
  } catch (error) {
    console.error("[Notification] Erro ao processar notificação:", error);
    return false;
  }
}

/**
 * Registra webhook para fornecedor
 */
export async function registerWebhook(
  supplierId: number,
  type: "slack" | "email",
  webhookUrl: string,
  name?: string
): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");

    // Validar URL
    try {
      new URL(webhookUrl);
    } catch {
      throw new Error("URL inválida");
    }

    // Verificar se webhook já existe
    const existing = await db
      .select()
      .from(notificationWebhooks)
      .where(
        and(
          eq(notificationWebhooks.supplierId, supplierId),
          eq(notificationWebhooks.webhookUrl, webhookUrl)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      throw new Error("Webhook já registrado");
    }

    // Registrar webhook
    await db.insert(notificationWebhooks).values({
      supplierId,
      type,
      webhookUrl,
      name: name || `${type} - ${new Date().toLocaleString("pt-BR")}`,
      isActive: true,
      createdAt: new Date(),
    });

    return true;
  } catch (error) {
    console.error("[Notification] Erro ao registrar webhook:", error);
    return false;
  }
}

/**
 * Desativa webhook
 */
export async function deactivateWebhook(
  webhookId: number
): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");

    await db
      .update(notificationWebhooks)
      .set({ isActive: false })
      .where(eq(notificationWebhooks.id, webhookId));

    return true;
  } catch (error) {
    console.error("[Notification] Erro ao desativar webhook:", error);
    return false;
  }
}

/**
 * Obtém histórico de notificações
 */
export async function getNotificationHistory(
  supplierId: number,
  limit: number = 50
): Promise<any[]> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");

    const history = await db
      .select()
      .from(notificationHistory)
      .where(eq(notificationHistory.supplierId, supplierId))
      .orderBy((t) => t.sentAt)
      .limit(limit);

    return history;
  } catch (error) {
    console.error("[Notification] Erro ao obter histórico:", error);
    return [];
  }
}
