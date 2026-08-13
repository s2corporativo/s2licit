import dotenv from "dotenv";
dotenv.config({ path: "/opt/s2licit/.env" });
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../drizzle/schema.ts";
import { eq } from "drizzle-orm";
import {
  extractItemsFromAttachment,
  isProcessableQuotationAttachment,
} from "../server/services/emailQuotationExtractor";
import { matchQuotationItems } from "../server/services/emailQuotationMatchingService";
import { fetchEmailByMessageId } from "../server/services/emailInboxService";

const mysqlUrl =
  process.env.DATABASE_URL ??
  `mysql://${process.env.MYSQL_USER}:${process.env.MYSQL_PASSWORD}@127.0.0.1:3306/${process.env.MYSQL_DATABASE}`;

async function main() {
  const db = drizzle(mysql.createConnection({ uri: mysqlUrl }), { schema });
  const id = Number(process.argv[2] ?? 765);
  const q = await db
    .select()
    .from(schema.emailQuotations)
    .where(eq(schema.emailQuotations.id, id))
    .limit(1);
  if (q.length === 0) {
    console.log("Cotação não encontrada:", id);
    process.exit(1);
  }
  const row = q[0];
  // Busca o e-mail original no Gmail via IMAP para obter os anexos (o banco guarda bodyText).
  const found = await fetchEmailByMessageId(row.messageId);
  if (!found) {
    console.log("E-mail não localizado na caixa (mensagem já pode estar fora da INBOX ou marcada)");
    process.exit(1);
  }
  let items: any[] = [];
  let sourceType = "body";
  let sourceFilename: string | null = null;
  const candidatos = (found.attachments ?? []).filter((a: any) =>
    isProcessableQuotationAttachment(a.filename, a.contentType),
  );
  for (const att of candidatos) {
    try {
      const extracted = await extractItemsFromAttachment(
        att.content,
        att.filename,
        att.contentType,
      );
      if (extracted.items.length === 0) continue;
      items = extracted.items;
      sourceType = extracted.sourceType;
      sourceFilename = att.filename;
      break;
    } catch (e) {
      console.log("Anexo falhou:", att.filename, (e as Error).message);
    }
  }
  console.log(`Itens extraídos: ${items.length} (${sourceType}, ${sourceFilename ?? "corpo"})`);
  if (items.length === 0) {
    items = await (await import("../server/services/emailQuotationExtractor")).extractItemsFromText(row.bodyText ?? "");
    sourceType = "body";
  }
  const matches = await matchQuotationItems(items);
  const matchedCount = matches.filter((m) => m.produtoMatchId != null).length;
  // Remove itens antigos e reinsere
  await db
    .delete(schema.emailQuotationItems)
    .where(eq(schema.emailQuotationItems.quotationId, id));
  await db.insert(schema.emailQuotationItems).values(
    items.map((item, idx) => ({
      quotationId: id,
      numeroItem: item.numeroItem ?? idx + 1,
      descricao: (item.descricao ?? "").slice(0, 65000),
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
  await db
    .update(schema.emailQuotations)
    .set({
      totalItems: items.length,
      matchedItems: matchedCount,
      sourceType,
      sourceFilename,
      status: items.length > 0 ? "revisao" : "nova",
    })
    .where(eq(schema.emailQuotations.id, id));
  console.log(`REPROCESS_OK id=${id} itens=${items.length} matched=${matchedCount} source=${sourceType}`);
  process.exit(0);
}
main().catch((e) => {
  console.error("ERRO:", e?.message ?? e);
  process.exit(1);
});
