/**
 * emailConfigService: configuração de e-mail (IMAP/SMTP) pela interface.
 *
 * A linha única de `email_settings` (senhas no cofre AES-256-GCM) tem
 * precedência sobre as variáveis de ambiente. Para não reescrever os
 * consumidores síncronos (emailInboxService/emailSenderService leem
 * process.env), a config do banco é APLICADA em process.env no boot e a cada
 * salvamento — env real fica como fallback de instalações antigas.
 */
import { eq } from "drizzle-orm";
import { emailSettings, type EmailSettings } from "../../drizzle/schema";
import { getDb } from "../db";
import { encryptPassword, decryptPassword } from "../utils/encryption";
import { logger } from "../_core/logger";

export type EmailConfigInput = {
  imapHost?: string | null;
  imapPort?: number | null;
  imapUser?: string | null;
  /** Vazio/undefined = manter a senha atual */
  imapPassword?: string | null;
  imapTls?: boolean;
  imapMailbox?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  smtpPassword?: string | null;
  smtpSecure?: boolean;
  smtpFrom?: string | null;
  /** Remetentes aceitos (um por linha ou separados por ";") */
  senderFilter?: string | null;
  /** Palavras-chave de assunto aceitas (um por linha ou separadas por ";") */
  subjectKeywordFilter?: string | null;
};

async function getRow(): Promise<EmailSettings | null> {
  const db = await getDb().catch(() => null);
  if (!db) return null;
  const [row] = await db.select().from(emailSettings).limit(1);
  return row ?? null;
}

/** Config efetiva (para exibição — sem senhas) e origem de cada bloco. */
export async function getEmailConfigView() {
  const row = await getRow();
  const dbImap = Boolean(row?.imapHost);
  const dbSmtp = Boolean(row?.smtpHost);
  return {
    imap: {
      host: (dbImap ? row?.imapHost : process.env.IMAP_HOST) ?? "",
      port: dbImap ? row?.imapPort ?? 993 : Number(process.env.IMAP_PORT ?? 993),
      user: (dbImap ? row?.imapUser : process.env.IMAP_USER) ?? "",
      tls: dbImap ? Boolean(row?.imapTls) : (process.env.IMAP_TLS ?? "true") !== "false",
      mailbox: (dbImap ? row?.imapMailbox : process.env.IMAP_MAILBOX) ?? "INBOX",
      hasPassword: dbImap ? Boolean(row?.imapPasswordEnc) : Boolean(process.env.IMAP_PASSWORD),
      origem: dbImap ? ("interface" as const) : process.env.IMAP_HOST ? ("ambiente" as const) : ("nao_configurado" as const),
    },
    smtp: {
      host: (dbSmtp ? row?.smtpHost : process.env.SMTP_HOST) ?? "",
      port: dbSmtp ? row?.smtpPort ?? 587 : Number(process.env.SMTP_PORT ?? 587),
      user: (dbSmtp ? row?.smtpUser : process.env.SMTP_USER) ?? "",
      secure: dbSmtp ? Boolean(row?.smtpSecure) : (process.env.SMTP_SECURE ?? "false") === "true",
      from: (dbSmtp ? row?.smtpFrom : process.env.SMTP_FROM) ?? "",
      hasPassword: dbSmtp ? Boolean(row?.smtpPasswordEnc) : Boolean(process.env.SMTP_PASSWORD),
      origem: dbSmtp ? ("interface" as const) : process.env.SMTP_HOST ? ("ambiente" as const) : ("nao_configurado" as const),
    },
    filtroEmail: {
      remetentes: (row?.senderFilter ?? process.env.EMAIL_FILTER_SENDERS ?? "") as string,
      assunto: (row?.subjectKeywordFilter ?? process.env.EMAIL_FILTER_SUBJECT_KEYWORDS ?? "") as string,
      origem: row?.senderFilter != null || row?.subjectKeywordFilter != null ? ("interface" as const) : ("padrao" as const),
    },
  };
}

/** Salva (upsert da linha única), criptografando senhas novas. */
export async function saveEmailConfig(input: EmailConfigInput): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const row = await getRow();
  const values = {
    imapHost: input.imapHost ?? row?.imapHost ?? null,
    imapPort: input.imapPort ?? row?.imapPort ?? null,
    imapUser: input.imapUser ?? row?.imapUser ?? null,
    imapPasswordEnc: input.imapPassword
      ? encryptPassword(input.imapPassword)
      : row?.imapPasswordEnc ?? null,
    imapTls: input.imapTls ?? row?.imapTls ?? true,
    imapMailbox: input.imapMailbox ?? row?.imapMailbox ?? null,
    smtpHost: input.smtpHost ?? row?.smtpHost ?? null,
    smtpPort: input.smtpPort ?? row?.smtpPort ?? null,
    smtpUser: input.smtpUser ?? row?.smtpUser ?? null,
    smtpPasswordEnc: input.smtpPassword
      ? encryptPassword(input.smtpPassword)
      : row?.smtpPasswordEnc ?? null,
    smtpSecure: input.smtpSecure ?? row?.smtpSecure ?? false,
    smtpFrom: input.smtpFrom ?? row?.smtpFrom ?? null,
    senderFilter: input.senderFilter ?? row?.senderFilter ?? null,
    subjectKeywordFilter: input.subjectKeywordFilter ?? row?.subjectKeywordFilter ?? null,
  };
  if (row) {
    await db.update(emailSettings).set(values).where(eq(emailSettings.id, row.id));
  } else {
    await db.insert(emailSettings).values(values);
  }
  await applyEmailConfigFromDb();
}

/**
 * Aplica a config do banco em process.env (consumida pelos serviços de
 * e-mail). Chamado no boot e após cada salvamento.
 */
export async function applyEmailConfigFromDb(): Promise<void> {
  try {
    const row = await getRow();
    if (!row) return;
    if (row.imapHost) {
      process.env.IMAP_HOST = row.imapHost;
      if (row.imapPort) process.env.IMAP_PORT = String(row.imapPort);
      if (row.imapUser) process.env.IMAP_USER = row.imapUser;
      if (row.imapPasswordEnc) process.env.IMAP_PASSWORD = decryptPassword(row.imapPasswordEnc);
      process.env.IMAP_TLS = row.imapTls ? "true" : "false";
      if (row.imapMailbox) process.env.IMAP_MAILBOX = row.imapMailbox;
    }
    if (row.smtpHost) {
      process.env.SMTP_HOST = row.smtpHost;
      if (row.smtpPort) process.env.SMTP_PORT = String(row.smtpPort);
      if (row.smtpUser) process.env.SMTP_USER = row.smtpUser;
      if (row.smtpPasswordEnc) process.env.SMTP_PASSWORD = decryptPassword(row.smtpPasswordEnc);
      process.env.SMTP_SECURE = row.smtpSecure ? "true" : "false";
      if (row.smtpFrom) process.env.SMTP_FROM = row.smtpFrom;
    }
    // Filtro de seleção de e-mails: vazio significa "usar os padrões de assunto".
    process.env.EMAIL_FILTER_SENDERS = row.senderFilter ?? "";
    process.env.EMAIL_FILTER_SUBJECT_KEYWORDS = row.subjectKeywordFilter ?? "";
    const { logFilterCriteria } = await import("./emailQuotationFilterService");
    logFilterCriteria();
    logger.info("[EmailConfig] Configuração de e-mail da interface aplicada.");
  } catch (err) {
    logger.error("[EmailConfig] Falha ao aplicar configuração do banco:", err);
  }
}

/** Testa a conexão IMAP com a config efetiva. */
export async function testImapConnection(): Promise<{ ok: boolean; detalhe: string }> {
  if (!process.env.IMAP_HOST || !process.env.IMAP_USER || !process.env.IMAP_PASSWORD) {
    return { ok: false, detalhe: "IMAP não configurado (preencha servidor, usuário e senha e salve antes de testar)." };
  }
  try {
    const { ImapFlow } = await import("imapflow");
    const client = new ImapFlow({
      host: process.env.IMAP_HOST,
      port: Number(process.env.IMAP_PORT ?? 993),
      secure: (process.env.IMAP_TLS ?? "true") !== "false",
      auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASSWORD },
      logger: false,
      socketTimeout: 20000,
      greetingTimeout: 20000,
    });
    await client.connect();
    await client.logout();
    return { ok: true, detalhe: `Conectado a ${process.env.IMAP_HOST} como ${process.env.IMAP_USER}.` };
  } catch (err) {
    return { ok: false, detalhe: (err as Error).message };
  }
}

/** Testa a conexão SMTP com a config efetiva (verify do nodemailer). */
export async function testSmtpConnection(): Promise<{ ok: boolean; detalhe: string }> {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    return { ok: false, detalhe: "SMTP não configurado (preencha servidor, usuário e senha e salve antes de testar)." };
  }
  try {
    const nodemailer = await import("nodemailer");
    const port = Number(process.env.SMTP_PORT ?? 587);
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: (process.env.SMTP_SECURE ?? (port === 465 ? "true" : "false")) === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      connectionTimeout: 20000,
    });
    await transport.verify();
    return { ok: true, detalhe: `Conectado a ${process.env.SMTP_HOST} como ${process.env.SMTP_USER}.` };
  } catch (err) {
    return { ok: false, detalhe: (err as Error).message };
  }
}
