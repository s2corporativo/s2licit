import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { notificationHistory, notificationWebhooks } from "../../drizzle/schema";
import { isSmtpConfigured, sendEmail } from "./emailSenderService";

export interface NotificationPayload {
  type: "nfe_import" | "capture_complete" | "enrichment_complete" | "error";
  title: string;
  message: string;
  data?: Record<string, unknown>;
  severity?: "info" | "warning" | "error";
}

export type NotificationChannel = "slack" | "email";

const SLACK_HOSTS = new Set(["hooks.slack.com", "hooks.slack-gov.com"]);

/**
 * Valida e normaliza o destino sem permitir que um webhook seja usado para
 * acessar localhost, metadados de nuvem ou serviços internos da VPS.
 */
export function validateNotificationDestination(
  type: NotificationChannel,
  destination: string,
): string {
  const value = destination.trim();

  if (type === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw new Error("Endereço de e-mail inválido");
    }
    return value.toLowerCase();
  }

  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("O webhook do Slack deve usar HTTPS");
  }
  if (!SLACK_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error("Use um webhook oficial do Slack (hooks.slack.com)");
  }
  return url.toString();
}

/** Nunca devolve o token secreto embutido na URL do Slack. */
export function maskNotificationDestination(type: NotificationChannel, destination: string): string {
  if (type === "email") return destination;
  try {
    const url = new URL(destination);
    return `${url.origin}/••••••••`;
  } catch {
    return "Webhook configurado";
  }
}

function notificationText(payload: NotificationPayload): string {
  const details = payload.data
    ? Object.entries(payload.data)
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join("\n")
    : "";

  return [
    payload.message,
    "",
    "---",
    `Tipo: ${payload.type}`,
    `Severidade: ${payload.severity || "info"}`,
    `Data: ${new Date().toLocaleString("pt-BR")}`,
    details,
  ]
    .filter(Boolean)
    .join("\n");
}

function slackPayload(payload: NotificationPayload) {
  const blocks: Array<Record<string, unknown>> = [
    {
      type: "header",
      text: { type: "plain_text", text: payload.title.slice(0, 150) },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: payload.message.slice(0, 3000) },
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
  ];

  if (payload.data) {
    const dataText = Object.entries(payload.data)
      .map(([key, value]) => `*${key}:* ${String(value)}`)
      .join("\n")
      .slice(0, 3000);
    if (dataText) {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: dataText },
      });
    }
  }

  return { text: payload.title.slice(0, 200), blocks };
}

async function recordNotification(
  db: any,
  input: {
    supplierId: number;
    webhookId: number;
    payload: NotificationPayload;
    status: "sent" | "failed";
    errorMessage?: string;
  },
): Promise<void> {
  await db.insert(notificationHistory).values({
    supplierId: input.supplierId,
    webhookId: input.webhookId,
    type: input.payload.type,
    title: input.payload.title,
    message: input.payload.message,
    status: input.status,
    errorMessage: input.errorMessage?.slice(0, 1000),
    sentAt: new Date(),
  });
}

/** Envia notificações pelos canais ativos do fornecedor. */
export async function sendNotification(
  supplierId: number,
  payload: NotificationPayload,
): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");

    const webhooks = await db
      .select()
      .from(notificationWebhooks)
      .where(
        and(
          eq(notificationWebhooks.supplierId, supplierId),
          eq(notificationWebhooks.isActive, true),
        ),
      );

    let notificationSent = false;

    for (const webhook of webhooks) {
      try {
        const type = webhook.type as NotificationChannel;
        const destination = validateNotificationDestination(type, webhook.webhookUrl);

        if (type === "email") {
          if (!isSmtpConfigured()) {
            throw new Error("SMTP não configurado");
          }
          await sendEmail({
            to: destination,
            subject: payload.title.slice(0, 200),
            text: notificationText(payload),
          });
        } else {
          const response = await fetch(destination, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(slackPayload(payload)),
            signal: AbortSignal.timeout(15_000),
            redirect: "error",
          });
          if (!response.ok) {
            throw new Error(`Slack respondeu HTTP ${response.status}`);
          }
        }

        notificationSent = true;
        await recordNotification(db, {
          supplierId,
          webhookId: webhook.id,
          payload,
          status: "sent",
        });
      } catch (error) {
        console.error("[Notification] Erro ao enviar notificação:", error);
        await recordNotification(db, {
          supplierId,
          webhookId: webhook.id,
          payload,
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "Erro desconhecido",
        });
      }
    }

    return notificationSent;
  } catch (error) {
    console.error("[Notification] Erro ao processar notificação:", error);
    return false;
  }
}

/** Registra um canal de notificação para o fornecedor. */
export async function registerWebhook(
  supplierId: number,
  type: NotificationChannel,
  destination: string,
  name?: string,
): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");
    const normalized = validateNotificationDestination(type, destination);

    const existing = await db
      .select()
      .from(notificationWebhooks)
      .where(
        and(
          eq(notificationWebhooks.supplierId, supplierId),
          eq(notificationWebhooks.webhookUrl, normalized),
        ),
      )
      .limit(1);

    if (existing.length > 0) throw new Error("Canal já registrado");

    await db.insert(notificationWebhooks).values({
      supplierId,
      type,
      webhookUrl: normalized,
      name: name || `${type} - ${new Date().toLocaleString("pt-BR")}`,
      isActive: true,
      createdAt: new Date(),
    });

    return true;
  } catch (error) {
    console.error("[Notification] Erro ao registrar canal:", error);
    return false;
  }
}

export async function deactivateWebhook(webhookId: number): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");
    await db
      .update(notificationWebhooks)
      .set({ isActive: false })
      .where(eq(notificationWebhooks.id, webhookId));
    return true;
  } catch (error) {
    console.error("[Notification] Erro ao desativar canal:", error);
    return false;
  }
}

export async function getNotificationHistory(
  supplierId: number,
  limit = 50,
): Promise<any[]> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");
    return db
      .select()
      .from(notificationHistory)
      .where(eq(notificationHistory.supplierId, supplierId))
      .orderBy(desc(notificationHistory.sentAt))
      .limit(Math.min(Math.max(limit, 1), 200));
  } catch (error) {
    console.error("[Notification] Erro ao obter histórico:", error);
    return [];
  }
}
