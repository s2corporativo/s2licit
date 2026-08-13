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
    // Um servidor IMAP travado não pode pendurar o job de sincronização:
    // limites explícitos de saudação e de socket.
    greetingTimeout: 20_000,
    socketTimeout: 60_000,
    // Silencia o logger verboso do imapflow
    logger: false as const,
  };
}

const MAILBOX = process.env.IMAP_MAILBOX ?? "INBOX";

/**
 * Busca uma única mensagem da caixa pelo Message-ID (não altera flags —
 * usado pelo reprocessamento de cotações já importadas).
 */
export async function fetchEmailByMessageId(
  messageId: string,
): Promise<FetchedEmail | null> {
  if (!isImapConfigured()) return null;
  const client = new ImapFlow(imapConfig());
  await client.connect();
  try {
    const lock = await client.getMailboxLock(MAILBOX);
    try {
      const uids = await client.search(
        { header: { "message-id": messageId } },
        { uid: true },
      );
      const uidArr = Array.isArray(uids) ? uids : [];
      const uid = uidArr[uidArr.length - 1];
      if (!uid) return null;
      const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!msg || !msg.source) return null;
      const parsed = await simpleParser(msg.source);
      const fromValue = parsed.from?.value?.[0];
      return {
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
      };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

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
      // O filtro de seleção (remetentes/assunto de cotação) roda sobre os
      // envelopes primeiro: busca-se até 4x o limite de UIDs para compensar
      // os descartados, garantindo que o resultado contenha e-mails válidos.
      const { matchesQuotationFilter } = await import("./emailQuotationFilterService");
      const uidsToProbe = uids.slice(-(limit * 4));
      const selected: number[] = [];
      for (const uid of uidsToProbe) {
        const probeMsg = await client.fetchOne(String(uid), { envelope: true }, { uid: true });
        if (!probeMsg || !("envelope" in probeMsg)) continue;
        const env = probeMsg.envelope;
        const probe: FetchedEmail = {
          messageId: `uid-${uid}@probe`,
          from: { address: env?.from?.[0]?.address, name: env?.from?.[0]?.name },
          subject: env?.subject ?? "(sem assunto)",
          date: env?.date ?? null,
          text: "",
          attachments: [],
        };
        if (matchesQuotationFilter(probe)) selected.push(uid);
        if (selected.length >= limit) break;
      }

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
