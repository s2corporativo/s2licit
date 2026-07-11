/**
 * Envio de mensagens por WhatsApp via API Cloud da Meta (WhatsApp Business).
 *
 * Configuração por ambiente (opcional — sem ela, o envio é desabilitado):
 *   WHATSAPP_PHONE_ID     — ID do número remetente (Meta)
 *   WHATSAPP_TOKEN        — token de acesso permanente
 *   WHATSAPP_TO           — número(s) destino (E.164, ex.: 5531999998888; vírgula p/ vários)
 *   WHATSAPP_API_VERSION  — versão da Graph API (padrão v21.0)
 *
 * Alternativa genérica (webhook próprio/Twilio/Z-API):
 *   WHATSAPP_WEBHOOK_URL  — se definido, o texto é enviado como POST {to, message}
 */

export function isWhatsappConfigured(): boolean {
  return Boolean(
    (process.env.WHATSAPP_PHONE_ID && process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_TO) ||
      (process.env.WHATSAPP_WEBHOOK_URL && process.env.WHATSAPP_TO),
  );
}

function destinos(): string[] {
  return (process.env.WHATSAPP_TO ?? "")
    .split(",")
    .map((s) => s.replace(/\D/g, ""))
    .filter(Boolean);
}

/**
 * Envia uma mensagem de texto por WhatsApp. Retorna true se ao menos um
 * destino recebeu. Nunca lança — degrada com log (best-effort).
 */
export async function enviarWhatsapp(mensagem: string): Promise<boolean> {
  if (!isWhatsappConfigured()) return false;
  const tos = destinos();
  if (tos.length === 0) return false;

  // Modo webhook genérico
  if (process.env.WHATSAPP_WEBHOOK_URL) {
    try {
      let ok = false;
      for (const to of tos) {
        const res = await fetch(process.env.WHATSAPP_WEBHOOK_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ to, message: mensagem }),
        });
        ok = ok || res.ok;
      }
      return ok;
    } catch (err) {
      console.warn("[WhatsApp] Falha no webhook:", (err as Error).message);
      return false;
    }
  }

  // Modo Meta Cloud API
  const version = process.env.WHATSAPP_API_VERSION ?? "v21.0";
  const url = `https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_ID}/messages`;
  let entregue = false;
  for (const to of tos) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: mensagem.slice(0, 4096) },
        }),
      });
      if (res.ok) entregue = true;
      else console.warn(`[WhatsApp] Envio para ${to} falhou (${res.status}).`);
    } catch (err) {
      console.warn(`[WhatsApp] Erro ao enviar para ${to}:`, (err as Error).message);
    }
  }
  return entregue;
}
