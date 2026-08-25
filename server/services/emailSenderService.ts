import nodemailer from "nodemailer";

/**
 * Envio SMTP exclusivamente para comunicação operacional: resposta de
 * cotações e propostas. Avisos/relatórios automáticos são rejeitados antes de
 * abrir conexão SMTP.
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
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASSWORD! },
  });
}

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
}

export class AutomaticSystemEmailDisabledError extends Error {
  constructor() {
    super("Avisos e relatórios automáticos por e-mail estão desativados no S2 Licit.");
    this.name = "AutomaticSystemEmailDisabledError";
  }
}

function isAutomaticSystemNotice(subject: string): boolean {
  const normalized = subject.trim().toLocaleLowerCase("pt-BR");
  return (
    normalized.startsWith("relatório diário s2 licit") ||
    normalized.startsWith("relatorio diario s2 licit") ||
    normalized.startsWith("alertas do dia — sistema s2") ||
    normalized.startsWith("alertas do dia - sistema s2") ||
    normalized.includes("relatório automático s2") ||
    normalized.includes("relatorio automatico s2")
  );
}

export async function sendEmail(input: SendEmailInput): Promise<{ messageId: string }> {
  if (isAutomaticSystemNotice(input.subject)) {
    // Erro explícito: o chamador não pode registrar falsamente "enviado".
    throw new AutomaticSystemEmailDisabledError();
  }

  if (!isSmtpConfigured()) {
    throw new Error("SMTP não configurado. Defina SMTP_HOST, SMTP_USER e SMTP_PASSWORD no ambiente.");
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
