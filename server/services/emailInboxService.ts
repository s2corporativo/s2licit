import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { getEmailRuntimeConfig } from "../integrations/core/credentialResolver";

const MAX_FETCH_LIMIT = 50;
const MAX_MESSAGE_BYTES = 16 * 1024 * 1024;
const MAX_BATCH_BYTES = 48 * 1024 * 1024;
const MAX_ATTACHMENTS = 20;
const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;

export interface FetchedAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface FetchedEmail {
  uid: number;
  mailbox: string;
  messageId: string;
  from: { address?: string; name?: string };
  subject: string;
  date: Date | null;
  text: string;
  attachments: FetchedAttachment[];
}

export interface RejectedEmail {
  uid: number;
  reason: string;
}

export interface FetchUnseenEmailsResult {
  emails: FetchedEmail[];
  rejected: RejectedEmail[];
}

function createClient(config: Awaited<ReturnType<typeof getEmailRuntimeConfig>>["imap"]): ImapFlow {
  return new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.tls,
    auth: { user: config.user, pass: config.password },
    greetingTimeout: 20_000,
    socketTimeout: 60_000,
    logger: false as const,
  });
}

function validateAttachments(attachments: FetchedAttachment[]): void {
  if (attachments.length > MAX_ATTACHMENTS) {
    throw new Error(`Mensagem possui ${attachments.length} anexos; limite operacional é ${MAX_ATTACHMENTS}.`);
  }
  let total = 0;
  for (const attachment of attachments) {
    const bytes = attachment.content.length;
    if (bytes > MAX_ATTACHMENT_BYTES) {
      throw new Error(
        `Anexo ${attachment.filename} possui ${bytes} bytes; limite por anexo é ${MAX_ATTACHMENT_BYTES}.`,
      );
    }
    total += bytes;
  }
  if (total > MAX_BATCH_BYTES) {
    throw new Error(`Anexos da mensagem excedem o limite agregado de ${MAX_BATCH_BYTES} bytes.`);
  }
}

export async function isImapConfigured(): Promise<boolean> {
  const config = (await getEmailRuntimeConfig()).imap;
  return Boolean(config.host && config.user && config.password);
}

/**
 * Busca e-mails não lidos sem alterar flags. O pipeline de negócio confirma
 * `\\Seen` somente depois da persistência/deduplicação, garantindo semântica
 * at-least-once. Memória do lote é limitada a MAX_BATCH_BYTES.
 */
export async function fetchUnseenEmails(options?: { limit?: number }): Promise<FetchUnseenEmailsResult> {
  const config = (await getEmailRuntimeConfig()).imap;
  if (!config.host || !config.user || !config.password) {
    throw new Error(
      "IMAP não configurado. Cadastre servidor, usuário e senha na Central de Integrações.",
    );
  }

  const requestedLimit = options?.limit ?? 25;
  const limit = Math.max(1, Math.min(MAX_FETCH_LIMIT, Math.floor(requestedLimit)));
  const client = createClient(config);
  const emails: FetchedEmail[] = [];
  const rejected: RejectedEmail[] = [];
  let batchBytes = 0;

  await client.connect();
  try {
    const lock = await client.getMailboxLock(config.mailbox);
    try {
      const searchResult = await client.search({ seen: false }, { uid: true });
      const uids = Array.isArray(searchResult) ? searchResult : [];
      const selected = uids.slice(-limit);

      for (const uid of selected) {
        try {
          const metadata = await client.fetchOne(String(uid), { size: true }, { uid: true });
          if (!metadata || typeof metadata !== "object") {
            rejected.push({ uid, reason: "Metadados IMAP indisponíveis." });
            continue;
          }
          const declaredSize = Number(metadata.size ?? 0);
          if (Number.isFinite(declaredSize) && declaredSize > MAX_MESSAGE_BYTES) {
            rejected.push({
              uid,
              reason: `Mensagem possui ${declaredSize} bytes; limite é ${MAX_MESSAGE_BYTES}.`,
            });
            continue;
          }
          if (batchBytes + Math.max(0, declaredSize) > MAX_BATCH_BYTES) {
            rejected.push({ uid, reason: "Limite de memória do lote atingido; mensagem ficará para o próximo ciclo." });
            break;
          }

          const message = await client.fetchOne(
            String(uid),
            { source: { start: 0, maxLength: MAX_MESSAGE_BYTES + 1 } },
            { uid: true },
          );
          if (!message || typeof message !== "object" || !message.source) {
            rejected.push({ uid, reason: "Fonte RFC822 indisponível." });
            continue;
          }
          if (message.source.length > MAX_MESSAGE_BYTES) {
            rejected.push({ uid, reason: `Mensagem excedeu ${MAX_MESSAGE_BYTES} bytes durante o download.` });
            continue;
          }
          if (batchBytes + message.source.length > MAX_BATCH_BYTES) {
            rejected.push({ uid, reason: "Limite de memória do lote atingido; mensagem ficará para o próximo ciclo." });
            break;
          }

          const parsed = await simpleParser(message.source);
          const fromValue = parsed.from?.value?.[0];
          const attachments: FetchedAttachment[] = (parsed.attachments ?? []).map((attachment) => ({
            filename: attachment.filename ?? "anexo",
            contentType: attachment.contentType ?? "application/octet-stream",
            content: attachment.content,
          }));
          validateAttachments(attachments);
          batchBytes += message.source.length;

          emails.push({
            uid,
            mailbox: config.mailbox,
            messageId: parsed.messageId ?? `uid-${uid}@${config.host}`,
            from: { address: fromValue?.address, name: fromValue?.name },
            subject: parsed.subject ?? "(sem assunto)",
            date: parsed.date ?? null,
            text: parsed.text ?? "",
            attachments,
          });
        } catch (error) {
          rejected.push({
            uid,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }

  return { emails, rejected };
}

/**
 * Confirma em lote apenas UIDs que o pipeline já persistiu ou deduplicou.
 * Uma falha de ACK é segura: a próxima sincronização verá o e-mail novamente e
 * a deduplicação por Message-ID impedirá uma segunda importação.
 */
export async function acknowledgeEmailsSeen(uids: number[], mailbox?: string): Promise<void> {
  const uniqueUids = Array.from(new Set(uids.filter((uid) => Number.isSafeInteger(uid) && uid > 0))).slice(0, MAX_FETCH_LIMIT);
  if (!uniqueUids.length) return;

  const config = (await getEmailRuntimeConfig()).imap;
  if (!config.host || !config.user || !config.password) {
    throw new Error("IMAP deixou de estar configurado antes da confirmação das mensagens.");
  }
  const targetMailbox = mailbox?.trim() || config.mailbox;
  const client = createClient(config);
  await client.connect();
  try {
    const lock = await client.getMailboxLock(targetMailbox);
    try {
      await client.messageFlagsAdd(uniqueUids, ["\\Seen"], { uid: true, silent: true });
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
}
