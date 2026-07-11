import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { emailQuotationItems, emailQuotations } from "../../drizzle/schema";
import { fetchUnseenEmails, isImapConfigured } from "./emailInboxService";
import {
  extractItemsFromAttachment,
  extractItemsFromText,
  type ExtractedItem,
} from "./emailQuotationExtractor";
import { matchQuotationItems } from "./emailQuotationMatchingService";

/**
 * Orquestra a ingestão de cotações por e-mail:
 * busca não lidos → extrai itens (anexo ou corpo) → cruza com o catálogo →
 * persiste como cotação em revisão. Deduplica por Message-ID.
 */

const PROCESSABLE_ATTACHMENT = /\.(xlsx|xls|csv|pdf|docx)$/i;

export interface SyncResult {
  imapConfigured: boolean;
  fetched: number;
  imported: number;
  skipped: number;
  errors: string[];
}

export async function syncEmailQuotations(options?: { limit?: number }): Promise<SyncResult> {
  const result: SyncResult = {
    imapConfigured: isImapConfigured(),
    fetched: 0,
    imported: 0,
    skipped: 0,
    errors: [],
  };

  if (!result.imapConfigured) {
    result.errors.push("IMAP não configurado (defina IMAP_HOST, IMAP_USER, IMAP_PASSWORD).");
    return result;
  }

  const db = await getDb();
  if (!db) {
    result.errors.push("Banco de dados indisponível.");
    return result;
  }

  const emails = await fetchUnseenEmails({ limit: options?.limit ?? 25 });
  result.fetched = emails.length;

  for (const email of emails) {
    try {
      // Deduplicação por Message-ID
      const existing = await db
        .select({ id: emailQuotations.id })
        .from(emailQuotations)
        .where(eq(emailQuotations.messageId, email.messageId))
        .limit(1);
      if (existing.length > 0) {
        result.skipped++;
        continue;
      }

      // Extrai itens: prioriza anexos processáveis; senão, o corpo.
      let items: ExtractedItem[] = [];
      let sourceType: "spreadsheet" | "pdf" | "docx" | "body" = "body";
      let sourceFilename: string | null = null;

      const attachment = email.attachments.find((a) => PROCESSABLE_ATTACHMENT.test(a.filename));
      if (attachment) {
        const extracted = await extractItemsFromAttachment(
          attachment.content,
          attachment.filename,
          attachment.contentType,
        );
        items = extracted.items;
        sourceType = extracted.sourceType;
        sourceFilename = attachment.filename;
      }
      if (items.length === 0) {
        items = await extractItemsFromText(email.text);
        sourceType = "body";
        sourceFilename = null;
      }

      const matches = await matchQuotationItems(items);
      const matchedCount = matches.filter((m) => m.produtoMatchId != null).length;

      const [inserted] = await db.insert(emailQuotations).values({
        messageId: email.messageId,
        fromAddress: email.from.address ?? null,
        fromName: email.from.name ?? null,
        subject: email.subject.slice(0, 512),
        orgao: guessOrgao(email.from.name, email.from.address, email.subject),
        bodyText: email.text.slice(0, 65000),
        receivedAt: email.date ?? new Date(),
        sourceType,
        sourceFilename,
        status: items.length > 0 ? "revisao" : "nova",
        totalItems: items.length,
        matchedItems: matchedCount,
      });

      const quotationId = (inserted as any).insertId as number;

      if (items.length > 0) {
        await db.insert(emailQuotationItems).values(
          items.map((item, idx) => ({
            quotationId,
            numeroItem: item.numeroItem ?? idx + 1,
            descricao: item.descricao.slice(0, 65000),
            quantidade: item.quantidade != null ? String(item.quantidade) : null,
            unidade: item.unidade ?? null,
            codigoCatalogo: item.codigoCatalogo ?? null,
            produtoMatchId: matches[idx].produtoMatchId,
            matchScore: matches[idx].matchScore != null ? String(matches[idx].matchScore) : null,
            matchMethod: matches[idx].matchMethod,
            matchConfirmado: false,
            precoSugerido: matches[idx].precoSugerido,
          })),
        );
      }

      result.imported++;
    } catch (err) {
      result.errors.push(`${email.subject}: ${(err as Error).message}`);
    }
  }

  return result;
}

/** Heurística simples para identificar o órgão pelo remetente/assunto. */
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

/** Lista cotações recebidas, mais recentes primeiro. */
export async function listEmailQuotations(status?: string) {
  const db = await getDb();
  if (!db) return [];
  const base = db.select().from(emailQuotations);
  const rows = status
    ? await base.where(eq(emailQuotations.status, status as any)).orderBy(desc(emailQuotations.receivedAt))
    : await base.orderBy(desc(emailQuotations.receivedAt)).limit(200);
  return rows;
}

/** Detalhe de uma cotação com seus itens. */
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
