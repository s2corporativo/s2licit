/**
 * Configuração de e-mail (IMAP/SMTP) administrável pela interface.
 *
 * Cada protocolo é tratado como um grupo credencial atômico. Ao criar o
 * primeiro override de um grupo, os campos efetivos atuais são materializados
 * juntos e a senha é recriptografada no banco, evitando misturar host de uma
 * origem com senha de outra.
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

type EmailInputKey = keyof EmailConfigInput;
const IMAP_INPUT_KEYS: readonly EmailInputKey[] = [
  "imapHost",
  "imapPort",
  "imapUser",
  "imapPassword",
  "imapTls",
  "imapMailbox",
];
const SMTP_INPUT_KEYS: readonly EmailInputKey[] = [
  "smtpHost",
  "smtpPort",
  "smtpUser",
  "smtpPassword",
  "smtpSecure",
  "smtpFrom",
];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hasAnyInput(input: EmailConfigInput, keys: readonly EmailInputKey[]): boolean {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(input, key));
}

function normalizeText(value: string | null | undefined, fallback: string): string {
  return value == null ? fallback : value.trim();
}

function validateHost(host: string, label: string): void {
  if (!host) throw new Error(`${label}: servidor é obrigatório.`);
  if (/\s/.test(host) || host.includes("://") || host.includes("/")) {
    throw new Error(`${label}: informe somente o hostname/IP, sem protocolo, caminho ou espaços.`);
  }
}

function validatePort(port: number, label: string): void {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${label}: porta deve estar entre 1 e 65535.`);
  }
}

async function getRow(): Promise<EmailSettings | null> {
  const db = await getDb().catch(() => null);
  if (!db) return null;
  const [row] = await db.select().from(emailSettings).limit(1);
  return row ?? null;
}

export async function getEmailConfigView() {
  const [row, runtime, imapOrigin, smtpOrigin] = await Promise.all([
    getRow(),
    getEmailRuntimeConfig(),
    resolveCredentialWithOrigin("IMAP_HOST"),
    resolveCredentialWithOrigin("SMTP_HOST"),
  ]);
  return {
    imap: {
      host: runtime.imap.host,
      port: runtime.imap.port,
      user: runtime.imap.user,
      tls: runtime.imap.tls,
      mailbox: runtime.imap.mailbox,
      hasPassword: Boolean(runtime.imap.password),
      origem: imapOrigin.origin,
      hasInterfaceOverride: Boolean(row?.imapHost),
    },
    smtp: {
      host: runtime.smtp.host,
      port: runtime.smtp.port,
      user: runtime.smtp.user,
      secure: runtime.smtp.secure,
      from: runtime.smtp.from,
      hasPassword: Boolean(runtime.smtp.password),
      origem: smtpOrigin.origin,
      hasInterfaceOverride: Boolean(row?.smtpHost),
    },
    hasInterfaceOverride: Boolean(row?.imapHost || row?.smtpHost),
  };
}

export async function saveEmailConfig(input: EmailConfigInput): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  const [row] = await db.select().from(emailSettings).limit(1);
  const existing = row ?? null;
  const runtime = await getEmailRuntimeConfig();
  const touchesImap = hasAnyInput(input, IMAP_INPUT_KEYS);
  const touchesSmtp = hasAnyInput(input, SMTP_INPUT_KEYS);
  if (!touchesImap && !touchesSmtp) return;

  const values = {
    imapHost: existing?.imapHost ?? null,
    imapPort: existing?.imapPort ?? null,
    imapUser: existing?.imapUser ?? null,
    imapPasswordEnc: existing?.imapPasswordEnc ?? null,
    imapTls: existing?.imapTls ?? true,
    imapMailbox: existing?.imapMailbox ?? null,
    smtpHost: existing?.smtpHost ?? null,
    smtpPort: existing?.smtpPort ?? null,
    smtpUser: existing?.smtpUser ?? null,
    smtpPasswordEnc: existing?.smtpPasswordEnc ?? null,
    smtpSecure: existing?.smtpSecure ?? false,
    smtpFrom: existing?.smtpFrom ?? null,
  };

  if (touchesImap) {
    const host = normalizeText(input.imapHost, existing?.imapHost ?? runtime.imap.host);
    const user = normalizeText(input.imapUser, existing?.imapUser ?? runtime.imap.user);
    const mailbox = normalizeText(
      input.imapMailbox,
      existing?.imapMailbox ?? (runtime.imap.mailbox || "INBOX"),
    );
    const port = input.imapPort ?? existing?.imapPort ?? runtime.imap.port;
    const tls = input.imapTls ?? existing?.imapTls ?? runtime.imap.tls;
    const explicitPassword = input.imapPassword?.trim();
    const passwordEnc = explicitPassword
      ? encryptPassword(explicitPassword)
      : existing?.imapPasswordEnc ?? (runtime.imap.password ? encryptPassword(runtime.imap.password) : null);

    validateHost(host, "IMAP");
    validatePort(port, "IMAP");
    if (!user) throw new Error("IMAP: usuário é obrigatório.");
    if (!passwordEnc) throw new Error("IMAP: senha é obrigatória para criar o override do protocolo.");
    if (!mailbox) throw new Error("IMAP: pasta é obrigatória.");

    values.imapHost = host;
    values.imapPort = port;
    values.imapUser = user;
    values.imapPasswordEnc = passwordEnc;
    values.imapTls = tls;
    values.imapMailbox = mailbox;
  }

  if (touchesSmtp) {
    const host = normalizeText(input.smtpHost, existing?.smtpHost ?? runtime.smtp.host);
    const user = normalizeText(input.smtpUser, existing?.smtpUser ?? runtime.smtp.user);
    const from = normalizeText(
      input.smtpFrom,
      existing?.smtpFrom ?? (runtime.smtp.from || user),
    );
    const port = input.smtpPort ?? existing?.smtpPort ?? runtime.smtp.port;
    const secure = input.smtpSecure ?? existing?.smtpSecure ?? runtime.smtp.secure;
    const explicitPassword = input.smtpPassword?.trim();
    const passwordEnc = explicitPassword
      ? encryptPassword(explicitPassword)
      : existing?.smtpPasswordEnc ?? (runtime.smtp.password ? encryptPassword(runtime.smtp.password) : null);

    validateHost(host, "SMTP");
    validatePort(port, "SMTP");
    if (!user) throw new Error("SMTP: usuário é obrigatório.");
    if (!passwordEnc) throw new Error("SMTP: senha é obrigatória para criar o override do protocolo.");
    if (!from) throw new Error("SMTP: remetente é obrigatório.");

    values.smtpHost = host;
    values.smtpPort = port;
    values.smtpUser = user;
    values.smtpPasswordEnc = passwordEnc;
    values.smtpSecure = secure;
    values.smtpFrom = from;
  }

  if (existing) {
    await db.update(emailSettings).set(values).where(eq(emailSettings.id, existing.id));
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
  } catch (error) {
    return { ok: false, detalhe: errorMessage(error) };
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
      greetingTimeout: 20_000,
      socketTimeout: 20_000,
    });
    await transport.verify();
    transport.close();
    return { ok: true, detalhe: `Conectado a ${config.host} como ${config.user}.` };
  } catch (error) {
    return { ok: false, detalhe: errorMessage(error) };
  }
}
