import { desc, eq } from "drizzle-orm";
import { emailQuotationItems, emailQuotations } from "../../drizzle/schema";
import { getDb, withDatabaseAdvisoryLock } from "../db";
import {
  acknowledgeEmailsSeen,
  fetchUnseenEmails,
  isImapConfigured,
  type FetchedEmail,
} from "./emailInboxService";
import {
  extractItemsFromAttachment,
  extractItemsFromText,
  type ExtractedItem,
} from "./emailQuotationExtractor";
import { matchQuotationItems } from "./emailQuotationMatchingService";

const PROCESSABLE_ATTACHMENT = /\.(xlsx|xls|csv|pdf|docx)$/i;
const DEFAULT_SYNC_LIMIT = 25;
const MAX_SYNC_LIMIT = 50;

export type EmailQuotationStatus =
  | "nova"
  | "processando"
  | "revisao"
  | "respondida"
  | "descartada"
  | "erro";

export interface SyncResult {
  imapConfigured: boolean;
  fetched: number;
  imported: number;
  skipped: number;
  acknowledged: number;
  rejected: number;
  busy: boolean;
  errors: string[];
}

interface PersistedQuotation {
  quotationId: number;
  duplicate: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function insertIdFromResult(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  if (!header || typeof header !== "object" || !("insertId" in header)) {
    throw new Error("Banco não retornou o ID da cotação inserida.");
  }
  const id = Number((header as { insertId?: unknown }).insertId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error("ID inválido retornado ao inserir cotação.");
  }
  return id;
}

async function extractEmailItems(email: FetchedEmail): Promise<{
  items: ExtractedItem[];
  sourceType: "spreadsheet" | "pdf" | "docx" | "body";
  sourceFilename: string | null;
}> {
  const attachment = email.attachments.find((item) => PROCESSABLE_ATTACHMENT.test(item.filename));
  if (attachment) {
    const extracted = await extractItemsFromAttachment(
      attachment.content,
      attachment.filename,
      attachment.contentType,
    );
    if (extracted.items.length > 0) {
      return {
        items: extracted.items,
        sourceType: extracted.sourceType,
        sourceFilename: attachment.filename,
      };
    }
  }

  return {
    items: await extractItemsFromText(email.text),
    sourceType: "body",
    sourceFilename: null,
  };
}

async function persistQuotation(
  email: FetchedEmail,
  items: ExtractedItem[],
  sourceType: "spreadsheet" | "pdf" | "docx" | "body",
  sourceFilename: string | null,
): Promise<PersistedQuotation> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  const existing = await db
    .select({ id: emailQuotations.id })
    .from(emailQuotations)
    .where(eq(emailQuotations.messageId, email.messageId))
    .limit(1);
  if (existing.length > 0) return { quotationId: existing[0].id, duplicate: true };

  const matches = await matchQuotationItems(items);
  const matchedCount = matches.filter((match) => match?.produtoMatchId != null).length;

  return db.transaction(async (tx) => {
    // Revalida dentro da transação para proteger contra uma segunda execução
    // concorrente que tenha persistido o mesmo Message-ID após a primeira leitura.
    const duplicate = await tx
      .select({ id: emailQuotations.id })
      .from(emailQuotations)
      .where(eq(emailQuotations.messageId, email.messageId))
      .limit(1);
    if (duplicate.length > 0) return { quotationId: duplicate[0].id, duplicate: true };

    const insertResult = await tx.insert(emailQuotations).values({
      messageId: email.messageId,
      fromAddress: email.from.address ?? null,
      fromName: email.from.name ?? null,
      subject: email.subject.slice(0, 512),
      orgao: guessOrgao(email.from.name, email.from.address, email.subject),
      bodyText: email.text.slice(0, 65_000),
      receivedAt: email.date ?? new Date(),
      sourceType,
      sourceFilename,
      status: items.length > 0 ? "revisao" : "nova",
      totalItems: items.length,
      matchedItems: matchedCount,
    });
    const quotationId = insertIdFromResult(insertResult);

    if (items.length > 0) {
      await tx.insert(emailQuotationItems).values(
        items.map((item, index) => {
          const match = matches[index];
          return {
            quotationId,
            numeroItem: item.numeroItem ?? index + 1,
            descricao: item.descricao.slice(0, 65_000),
            quantidade: item.quantidade != null ? String(item.quantidade) : null,
            unidade: item.unidade ?? null,
            codigoCatalogo: item.codigoCatalogo ?? null,
            produtoMatchId: match?.produtoMatchId ?? null,
            matchScore: match?.matchScore != null ? String(match.matchScore) : null,
            matchMethod: match?.matchMethod ?? null,
            matchConfirmado: false,
            precoSugerido: match?.precoSugerido ?? null,
          };
        }),
      );
    }

    return { quotationId, duplicate: false };
  });
}

async function runSync(limit: number): Promise<SyncResult> {
  const result: SyncResult = {
    imapConfigured: await isImapConfigured(),
    fetched: 0,
    imported: 0,
    skipped: 0,
    acknowledged: 0,
    rejected: 0,
    busy: false,
    errors: [],
  };

  if (!result.imapConfigured) {
    result.errors.push("IMAP não configurado. Cadastre servidor, usuário e senha na Central de Integrações.");
    return result;
  }
  const db = await getDb();
  if (!db) {
    result.errors.push("Banco de dados indisponível.");
    return result;
  }

  const fetched = await fetchUnseenEmails({ limit });
  result.fetched = fetched.emails.length;
  result.rejected = fetched.rejected.length;
  for (const rejected of fetched.rejected) {
    result.errors.push(`UID ${rejected.uid}: ${rejected.reason}`);
  }

  const ackByMailbox = new Map<string, number[]>();
  const scheduleAck = (email: FetchedEmail) => {
    const list = ackByMailbox.get(email.mailbox) ?? [];
    list.push(email.uid);
    ackByMailbox.set(email.mailbox, list);
  };

  for (const email of fetched.emails) {
    try {
      const existing = await db
        .select({ id: emailQuotations.id })
        .from(emailQuotations)
        .where(eq(emailQuotations.messageId, email.messageId))
        .limit(1);
      if (existing.length > 0) {
        result.skipped += 1;
        scheduleAck(email);
        continue;
      }

      const extracted = await extractEmailItems(email);
      const persisted = await persistQuotation(
        email,
        extracted.items,
        extracted.sourceType,
        extracted.sourceFilename,
      );
      if (persisted.duplicate) result.skipped += 1;
      else result.imported += 1;
      scheduleAck(email);
    } catch (error) {
      result.errors.push(`${email.subject}: ${errorMessage(error)}`);
    }
  }

  for (const [mailbox, uids] of ackByMailbox) {
    try {
      await acknowledgeEmailsSeen(uids, mailbox);
      result.acknowledged += uids.length;
    } catch (error) {
      // Seguro por design: itens já persistidos serão deduplicados pelo
      // Message-ID na próxima execução e então receberão nova tentativa de ACK.
      result.errors.push(`Falha ao confirmar ${uids.length} mensagem(ns) em ${mailbox}: ${errorMessage(error)}`);
    }
  }

  return result;
}

/**
 * Orquestra a ingestão com exclusão mútua distribuída. Scheduler e execução
 * manual não processam a mesma caixa simultaneamente em réplicas diferentes.
 */
export async function syncEmailQuotations(options?: { limit?: number }): Promise<SyncResult> {
  const requested = options?.limit ?? DEFAULT_SYNC_LIMIT;
  const limit = Math.max(1, Math.min(MAX_SYNC_LIMIT, Math.floor(requested)));
  const locked = await withDatabaseAdvisoryLock(
    "email-quotation-ingestion",
    () => runSync(limit),
    0,
  );
  if (locked.acquired && locked.result) return locked.result;
  return {
    imapConfigured: await isImapConfigured(),
    fetched: 0,
    imported: 0,
    skipped: 0,
    acknowledged: 0,
    rejected: 0,
    busy: true,
    errors: ["Outra sincronização de e-mail já está em execução."],
  };
}

function guessOrgao(name?: string, address?: string, subject?: string): string | null {
  const haystack = `${name ?? ""} ${address ?? ""} ${subject ?? ""}`.toLowerCase();
  const known: Array<[string, string]> = [
    ["copasa", "COPASA"],
    ["cemig", "CEMIG"],
    ["funarb", "FUNARB"],
    ["compras.mg", "Compras MG"],
    ["planejamento.mg", "Compras MG"],
    ["prefeitura", "Prefeitura"],
  ];
  for (const [needle, label] of known) {
    if (haystack.includes(needle)) return label;
  }
  return name || null;
}

export async function listEmailQuotations(status?: EmailQuotationStatus) {
  const db = await getDb();
  if (!db) return [];
  const base = db.select().from(emailQuotations);
  return status
    ? base.where(eq(emailQuotations.status, status)).orderBy(desc(emailQuotations.receivedAt)).limit(200)
    : base.orderBy(desc(emailQuotations.receivedAt)).limit(200);
}

export async function getEmailQuotationWithItems(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [quotation] = await db.select().from(emailQuotations).where(eq(emailQuotations.id, id)).limit(1);
  if (!quotation) return null;
  const items = await db
    .select()
    .from(emailQuotationItems)
    .where(eq(emailQuotationItems.quotationId, id));
  return { quotation, items };
}
