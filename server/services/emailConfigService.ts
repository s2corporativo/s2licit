/**
 * Configuração de e-mail (IMAP/SMTP) administrável pela interface.
 *
 * Senhas permanecem criptografadas em `email_settings`; a configuração efetiva
 * é resolvida em runtime pelo CredentialResolver, sem escrever em process.env.
 */
import { eq } from "drizzle-orm";
import { emailSettings, type EmailSettings } from "../../drizzle/schema";
import { getDb } from "../db";
import { encryptPassword } from "../utils/encryption";
import {
  getEmailRuntimeConfig,
  invalidateCredentialCache,
  resolveCredentialWithOrigin,
} from "../integrations/core/credentialResolver";

export type EmailConfigInput = {
  imapHost?: string | null;
  imapPort?: number | null;
  imapUser?: string | null;
  imapPassword?: string | null;
  imapTls?: boolean;
  imapMailbox?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  smtpPassword?: string | null;
  smtpSecure?: boolean;
  smtpFrom?: string | null;
};

async function getRow(): Promise<EmailSettings | null> {
  const db = await getDb().catch(() => null);
  if (!db) return null;
  const [row] = await db.select().from(emailSettings).limit(1);
  return row ?? null;
}

export async function getEmailConfigView() {
  const row = await getRow();
  const runtime = await getEmailRuntimeConfig();
  const imapOrigin = await resolveCredentialWithOrigin("IMAP_HOST");
  const smtpOrigin = await resolveCredentialWithOrigin("SMTP_HOST");
  return {
    imap: {
      host: runtime.imap.host,
      port: runtime.imap.port,
      user: runtime.imap.user,
      tls: runtime.imap.tls,
      mailbox: runtime.imap.mailbox,
      hasPassword: Boolean(runtime.imap.password),
      origem: imapOrigin.origin,
    },
    smtp: {
      host: runtime.smtp.host,
      port: runtime.smtp.port,
      user: runtime.smtp.user,
      secure: runtime.smtp.secure,
      from: runtime.smtp.from,
      hasPassword: Boolean(runtime.smtp.password),
      origem: smtpOrigin.origin,
    },
    hasInterfaceOverride: Boolean(row),
  };
}

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
  };
  if (row) {
    await db.update(emailSettings).set(values).where(eq(emailSettings.id, row.id));
  } else {
    await db.insert(emailSettings).values(values);
  }
  invalidateCredentialCache();
}

/** Remove overrides da interface e restaura integralmente o ambiente de boot. */
export async function resetEmailConfig(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.delete(emailSettings);
  invalidateCredentialCache();
}

/** Compatibilidade com o boot antigo; não injeta variáveis no processo. */
export async function applyEmailConfigFromDb(): Promise<void> {
  invalidateCredentialCache();
}

export async function testImapConnection(): Promise<{ ok: boolean; detalhe: string }> {
  const config = (await getEmailRuntimeConfig()).imap;
  if (!config.host || !config.user || !config.password) {
    return { ok: false, detalhe: "IMAP não configurado (preencha servidor, usuário e senha e salve antes de testar)." };
  }
  try {
    const { ImapFlow } = await import("imapflow");
    const client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.tls,
      auth: { user: config.user, pass: config.password },
      logger: false,
      socketTimeout: 20_000,
      greetingTimeout: 20_000,
    });
    await client.connect();
    await client.logout();
    return { ok: true, detalhe: `Conectado a ${config.host} como ${config.user}.` };
  } catch (err) {
    return { ok: false, detalhe: (err as Error).message };
  }
}

export async function testSmtpConnection(): Promise<{ ok: boolean; detalhe: string }> {
  const config = (await getEmailRuntimeConfig()).smtp;
  if (!config.host || !config.user || !config.password) {
    return { ok: false, detalhe: "SMTP não configurado (preencha servidor, usuário e senha e salve antes de testar)." };
  }
  try {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.password },
      connectionTimeout: 20_000,
    });
    await transport.verify();
    return { ok: true, detalhe: `Conectado a ${config.host} como ${config.user}.` };
  } catch (err) {
    return { ok: false, detalhe: (err as Error).message };
  }
}
