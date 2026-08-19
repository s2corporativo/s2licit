import nodemailer from "nodemailer";

/**
 * Envio de e-mail (SMTP) exclusivamente para comunicação operacional:
 * resposta de cotações e envio de propostas.
 *
 * Avisos/relatórios automáticos do sistema por e-mail estão desativados para
 * evitar excesso de mensagens. Alertas devem permanecer nos canais internos
 * e/ou WhatsApp quando configurado.
 *
 * Configuração por ambiente (opcional — sem ela, o envio é desabilitado):
 *   SMTP_HOST, SMTP_PORT (padrão 587), SMTP_USER, SMTP_PASSWORD,
 *   SMTP_SECURE ("true" força TLS na conexão), SMTP_FROM (remetente).
 */

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

function buildTransport() {
  const port = Number(process.env.SMTP_PORT ?? 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port,
    secure: (process.env.SMTP_SECURE ?? (port === 465 ? "true" : "false")) === "true",
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASSWORD!,
    },
  });
}

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
}

/**
 * Bloqueia mensagens automáticas de aviso/relatório sem interferir no SMTP
 * usado para responder cotações e encaminhar propostas comerciais.
 */
function isAutomaticSystemNotice(subject: string): boolean {
  const normalized = subject.trim().toLocaleLowerCase("pt-BR");
  return (
    normalized.startsWith("relatório diário s2 licit") ||
    normalized.startsWith("relatorio diario s2 licit") ||
    normalized.startsWith("alertas do dia — sistema s2") ||
    normalized.startsWith("alertas do dia - sistema s2")
  );
}

export async function sendEmail(input: SendEmailInput): Promise<{ messageId: string }> {
  if (isAutomaticSystemNotice(input.subject)) {
    // Retorno intencional sem SMTP: mantém compatibilidade com os chamadores
    // antigos enquanto elimina definitivamente o envio desses avisos.
    return { messageId: "automatic-system-email-disabled" };
  }

  if (!isSmtpConfigured()) {
    throw new Error(
      "SMTP não configurado. Defina SMTP_HOST, SMTP_USER e SMTP_PASSWORD no ambiente.",
    );
  }
  const transport = buildTransport();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER!;
  const info = await transport.sendMail({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    attachments: input.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  });
  return { messageId: info.messageId };
}
