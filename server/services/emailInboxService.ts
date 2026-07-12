import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

/**
 * Conector IMAP para buscar e-mails de pedido de cotação.
 *
 * Configuração por ambiente (todas opcionais — sem elas, a sincronização
 * apenas informa que o IMAP não está configurado):
 *   IMAP_HOST, IMAP_PORT (padrão 993), IMAP_USER, IMAP_PASSWORD,
 *   IMAP_TLS (padrão "true"), IMAP_MAILBOX (padrão "INBOX").
 */

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

export function isImapConfigured(): boolean {
  return Boolean(
    process.env.IMAP_HOST && process.env.IMAP_USER && process.env.IMAP_PASSWORD,
  );
}

function imapConfig() {
  return {
    host: process.env.IMAP_HOST!,
    port: Number(process.env.IMAP_PORT ?? 993),
    secure: (process.env.IMAP_TLS ?? "true") !== "false",
    auth: {
      user: process.env.IMAP_USER!,
      pass: process.env.IMAP_PASSWORD!,
    },
    // Silencia o logger verboso do imapflow
    logger: false as const,
  };
}

const MAILBOX = process.env.IMAP_MAILBOX ?? "INBOX";

/**
 * Busca e-mails não lidos da caixa de entrada. Por padrão marca como lidos
 * para não reprocessar (a deduplicação também é feita por Message-ID no banco).
 */
export async function fetchUnseenEmails(options?: {
  limit?: number;
  markSeen?: boolean;
}): Promise<FetchedEmail[]> {
  if (!isImapConfigured()) {
    throw new Error(
      "IMAP não configurado. Defina IMAP_HOST, IMAP_USER e IMAP_PASSWORD no ambiente.",
    );
  }

  const limit = options?.limit ?? 25;
  const markSeen = options?.markSeen ?? true;
  const client = new ImapFlow(imapConfig());
  const emails: FetchedEmail[] = [];

  await client.connect();
  try {
    const lock = await client.getMailboxLock(MAILBOX);
    try {
      // UIDs das mensagens não lidas
      const searchResult = await client.search({ seen: false }, { uid: true });
      const uids = Array.isArray(searchResult) ? searchResult : [];
      const selected = uids.slice(-limit); // as mais recentes

      for (const uid of selected) {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!msg || !msg.source) continue;

        const parsed = await simpleParser(msg.source);
        const fromValue = parsed.from?.value?.[0];

        emails.push({
          messageId: parsed.messageId ?? `uid-${uid}@${process.env.IMAP_HOST}`,
          from: { address: fromValue?.address, name: fromValue?.name },
          subject: parsed.subject ?? "(sem assunto)",
          date: parsed.date ?? null,
          text: parsed.text ?? "",
          attachments: (parsed.attachments ?? []).map((a) => ({
            filename: a.filename ?? "anexo",
            contentType: a.contentType ?? "application/octet-stream",
            content: a.content as Buffer,
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
