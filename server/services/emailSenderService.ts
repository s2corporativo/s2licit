import nodemailer from "nodemailer";
import { getEmailRuntimeConfig } from "../integrations/core/credentialResolver";

export async function isSmtpConfigured(): Promise<boolean> {
  const config = (await getEmailRuntimeConfig()).smtp;
  return Boolean(config.host && config.user && config.password);
}

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
}

export async function sendEmail(input: SendEmailInput): Promise<{ messageId: string }> {
  const config = (await getEmailRuntimeConfig()).smtp;
  if (!config.host || !config.user || !config.password) {
    throw new Error(
      "SMTP não configurado. Cadastre servidor, usuário e senha na Central de Integrações.",
    );
  }

  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 20_000,
  });
  const info = await transport.sendMail({
    from: config.from || config.user,
    to: input.to,
    subject: input.subject,
    text: input.text,
    attachments: input.attachments?.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.content,
      contentType: attachment.contentType,
    })),
  });
  return { messageId: info.messageId };
}
