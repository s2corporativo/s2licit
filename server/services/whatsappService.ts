/**
 * Envio de WhatsApp via Meta Cloud API ou webhook genérico.
 * Configuração efetiva vem do CredentialResolver (banco criptografado com
 * fallback imutável do ambiente), sem mutar process.env.
 */
import { logger } from "../_core/logger";
import { getWhatsappRuntimeConfig } from "../integrations/core/credentialResolver";
import { externalHttpRequest } from "../integrations/core/externalHttpClient";

export async function isWhatsappConfigured(): Promise<boolean> {
  const config = await getWhatsappRuntimeConfig();
  return Boolean(
    config.to &&
      ((config.phoneId && config.token) || config.webhookUrl),
  );
}

function destinos(raw: string): string[] {
  return raw
    .split(",")
    .map((value) => value.replace(/\D/g, ""))
    .filter(Boolean);
}

/**
 * Envia uma mensagem de texto por WhatsApp. Best-effort: retorna true se ao
 * menos um destino recebeu e registra falhas pela plataforma de integrações.
 */
export async function enviarWhatsapp(mensagem: string): Promise<boolean> {
  const config = await getWhatsappRuntimeConfig();
  const tos = destinos(config.to);
  if (tos.length === 0) return false;

  if (config.webhookUrl) {
    let ok = false;
    for (const to of tos) {
      const result = await externalHttpRequest({
        source: "whatsapp",
        operation: "send-webhook",
        url: config.webhookUrl,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to, message: mensagem }),
        expected: "any",
        timeoutMs: 20_000,
        // Envio de mensagem não é idempotente: sem retry automático.
        idempotent: false,
      });
      if (result.ok) ok = true;
      else logger.warn(`[WhatsApp] Webhook falhou para ${to}: ${result.error?.message ?? result.statusCode}`);
    }
    return ok;
  }

  if (!config.phoneId || !config.token) return false;
  const url = `https://graph.facebook.com/${config.apiVersion}/${config.phoneId}/messages`;
  let entregue = false;
  for (const to of tos) {
    const result = await externalHttpRequest({
      source: "whatsapp",
      operation: "send-meta-message",
      url,
      method: "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: mensagem.slice(0, 4096) },
      }),
      expected: "json",
      timeoutMs: 20_000,
      idempotent: false,
    });
    if (result.ok) entregue = true;
    else logger.warn(`[WhatsApp] Envio para ${to} falhou: ${result.error?.message ?? result.statusCode}`);
  }
  return entregue;
}
