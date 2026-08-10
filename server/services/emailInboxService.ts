import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { getEmailRuntimeConfig } from "../integrations/core/credentialResolver";

export interface FetchedAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface FetchedEmail {
  messageId: string;
  from: { address?: string; name?: string };
  subject: string;
  date: Date | null;
  text: string;
  attachments: FetchedAttachment[];
}

export async function isImapConfigured(): Promise<boolean> {
  const config = (await getEmailRuntimeConfig()).imap;
  return Boolean(config.host && config.user && config.password);
}

/**
 * Busca e-mails não lidos usando a configuração efetiva no momento da chamada.
 * Inclusive a mailbox é resolvida dinamicamente — não fica mais congelada no
 * import do módulo.
 */
export async function fetchUnseenEmails(options?: {
  limit?: number;
  markSeen?: boolean;
}): Promise<FetchedEmail[]> {
  const config = (await getEmailRuntimeConfig()).imap;
  if (!config.host || !config.user || !config.password) {
    throw new Error(
      "IMAP não configurado. Cadastre servidor, usuário e senha na Central de Integrações.",
    );
  }

  const limit = options?.limit ?? 25;
  const markSeen = options?.markSeen ?? true;
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.tls,
    auth: { user: config.user, pass: config.password },
    greetingTimeout: 20_000,
    socketTimeout: 60_000,
    logger: false as const,
  });
  const emails: FetchedEmail[] = [];

  await client.connect();
  try {
    const lock = await client.getMailboxLock(config.mailbox);
    try {
      const searchResult = await client.search({ seen: false }, { uid: true });
      const uids = Array.isArray(searchResult) ? searchResult : [];
      const selected = uids.slice(-limit);

      for (const uid of selected) {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!msg || !msg.source) continue;

        const parsed = await simpleParser(msg.source);
        const fromValue = parsed.from?.value?.[0];

        emails.push({
          messageId: parsed.messageId ?? `uid-${uid}@${config.host}`,
          from: { address: fromValue?.address, name: fromValue?.name },
          subject: parsed.subject ?? "(sem assunto)",
          date: parsed.date ?? null,
          text: parsed.text ?? "",
          attachments: (parsed.attachments ?? []).map((attachment) => ({
            filename: attachment.filename ?? "anexo",
            contentType: attachment.contentType ?? "application/octet-stream",
            content: attachment.content as Buffer,
          })),
        });

        if (markSeen) {
          await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  return emails;
}
