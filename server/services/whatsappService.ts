import { z } from "zod";
import { logger } from "../_core/logger";
import { getWhatsappRuntimeConfig } from "../integrations/core/credentialResolver";
import { externalHttpRequest } from "../integrations/core/externalHttpClient";

const MAX_DESTINATIONS = 20;
const SEND_CONCURRENCY = 4;
const MAX_MESSAGE_CHARS = 4_096;

const MetaSendResponseSchema = z.object({
  messages: z.array(z.object({ id: z.string().min(1) }).passthrough()).min(1),
}).passthrough();

type MetaSendResponse = z.infer<typeof MetaSendResponseSchema>;

export async function isWhatsappConfigured(): Promise<boolean> {
  const config = await getWhatsappRuntimeConfig();
  return Boolean(config.to && ((config.phoneId && config.token) || config.webhookUrl));
}

function destinations(raw: string): string[] {
  const unique = Array.from(
    new Set(
      raw
        .split(",")
        .map((value) => value.replace(/\D/g, ""))
        .filter((value) => value.length >= 10 && value.length <= 15),
    ),
  );
  if (unique.length > MAX_DESTINATIONS) {
    throw new Error(`WhatsApp suporta no máximo ${MAX_DESTINATIONS} destinatários por operação.`);
  }
  return unique;
}

function maskPhone(phone: string): string {
  return phone.length <= 4 ? "****" : `${"*".repeat(Math.min(8, phone.length - 4))}${phone.slice(-4)}`;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function sendWebhook(url: string, to: string, message: string): Promise<boolean> {
  const result = await externalHttpRequest<unknown>({
    source: "whatsapp",
    operation: "send-webhook",
    url,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ to, message }),
    expected: "any",
    timeoutMs: 20_000,
    deadlineMs: 20_000,
    maxRetries: 0,
    idempotent: false,
    maxBodyBytes: 512 * 1024,
  });
  if (!result.ok) {
    logger.warn(
      `[WhatsApp] Webhook falhou para ${maskPhone(to)}: ${result.error?.message ?? result.statusCode}`,
    );
  }
  return result.ok;
}

async function sendMeta(
  url: string,
  token: string,
  to: string,
  message: string,
): Promise<boolean> {
  const result = await externalHttpRequest<MetaSendResponse>({
    source: "whatsapp",
    operation: "send-meta-message",
    url,
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: message },
    }),
    expected: "json",
    timeoutMs: 20_000,
    deadlineMs: 20_000,
    maxRetries: 0,
    idempotent: false,
    maxBodyBytes: 512 * 1024,
    validator: (payload) => MetaSendResponseSchema.parse(payload),
  });
  if (!result.ok) {
    logger.warn(
      `[WhatsApp] Meta Cloud API falhou para ${maskPhone(to)}: ${result.error?.message ?? result.statusCode}`,
    );
  }
  return result.ok;
}

/**
 * Envia texto por WhatsApp em fanout limitado. POST não recebe retry automático
 * porque o provedor não fornece uma chave de idempotência padronizada aqui.
 * Com N<=20 e concorrência 4, memória é O(N) limitada e a latência tende a
 * ceil(N/4) ondas em vez de N timeouts sequenciais.
 */
export async function enviarWhatsapp(mensagem: string): Promise<boolean> {
  const message = mensagem.trim().slice(0, MAX_MESSAGE_CHARS);
  if (!message) return false;

  const config = await getWhatsappRuntimeConfig();
  const tos = destinations(config.to);
  if (!tos.length) return false;

  let results: boolean[];
  if (config.webhookUrl) {
    results = await mapWithConcurrency(tos, SEND_CONCURRENCY, (to) =>
      sendWebhook(config.webhookUrl, to, message),
    );
  } else {
    if (!config.phoneId || !config.token) return false;
    const url = `https://graph.facebook.com/${config.apiVersion}/${encodeURIComponent(config.phoneId)}/messages`;
    results = await mapWithConcurrency(tos, SEND_CONCURRENCY, (to) =>
      sendMeta(url, config.token, to, message),
    );
  }

  return results.some(Boolean);
}
