import nodemailer from "nodemailer";

/**
 * Envio SMTP central. O caller pode fornecer Message-ID determinístico para
 * correlação/auditoria de efeitos externos (especialmente proposta comercial).
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
  messageId?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
}

export async function sendEmail(input: SendEmailInput): Promise<{ messageId: string }> {
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
    ...(input.messageId ? { messageId: input.messageId } : {}),
    attachments: input.attachments?.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.content,
      contentType: attachment.contentType,
    })),
  });
  return { messageId: info.messageId || input.messageId || "" };
}
