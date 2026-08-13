import dotenv from "dotenv";
dotenv.config({ path: "/opt/s2licit/.env" });
import mysql from "mysql2/promise";
import {
  extractItemsFromAttachment,
  extractItemsFromText,
  isProcessableQuotationAttachment,
} from "../server/services/emailQuotationExtractor";
import { matchQuotationItems } from "../server/services/emailQuotationMatchingService";
import { fetchEmailByMessageId } from "../server/services/emailInboxService";

const mysqlUrl =
  process.env.DATABASE_URL ??
  `mysql://${process.env.MYSQL_USER}:${process.env.MYSQL_PASSWORD}@127.0.0.1:3306/${process.env.MYSQL_DATABASE}`;

async function main() {
  const conn = await mysql.createConnection({ uri: mysqlUrl });
  try {
    const id = Number(process.argv[2] ?? 765);
    const [q] = await conn.query<
      {
        messageId: string;
        bodyText: string;
        status: string;
      }[]
    >("SELECT `messageId`, `bodyText`, `status` FROM `email_quotations` WHERE `id` = ? LIMIT 1", [id]);
    if (q.length === 0) {
      console.log("Cotação não encontrada:", id);
      process.exit(1);
    }
    const row = q[0];
    // Busca o e-mail original no Gmail via IMAP para obter os anexos (o banco guarda bodyText).
    const found = await fetchEmailByMessageId(row.messageId);
    if (!found) {
      console.log(
        "E-mail não localizado na caixa (mensagem já pode estar fora da INBOX ou marcada)",
      );
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
      items = await extractItemsFromText(row.bodyText ?? "");
      sourceType = "body";
    }
    const matches = await matchQuotationItems(items);
    const matchedCount = matches.filter((m) => m.produtoMatchId != null).length;
    // Remove itens antigos e reinsere
    await conn.query("DELETE FROM `email_quotation_items` WHERE `quotationId` = ?", [id]);
    await conn.query(
      "INSERT INTO `email_quotation_items` (`quotationId`,`numeroItem`,`descricao`,`quantidade`,`unidade`,`codigoCatalogo`,`produtoMatchId`,`matchScore`,`matchMethod`,`matchConfirmado`,`precoSugerido`) VALUES ?",
      [
        items.map((item, idx) => [
          id,
          item.numeroItem ?? idx + 1,
          (item.descricao ?? "").slice(0, 65000),
          item.quantidade != null ? String(item.quantidade) : null,
          item.unidade ?? null,
          item.codigoCatalogo ?? null,
          matches[idx].produtoMatchId,
          matches[idx].matchScore != null ? String(matches[idx].matchScore) : null,
          matches[idx].matchMethod,
          0,
          matches[idx].precoSugerido,
        ]),
      ],
    );
    await conn.query(
      "UPDATE `email_quotations` SET `totalItems` = ?, `matchedItems` = ?, `sourceType` = ?, `sourceFilename` = ?, `status` = ? WHERE `id` = ?",
      [items.length, matchedCount, sourceType, sourceFilename, items.length > 0 ? "revisao" : "nova", id],
    );
    console.log(
      `REPROCESS_OK id=${id} itens=${items.length} matched=${matchedCount} source=${sourceType}`,
    );
    process.exit(0);
  } finally {
    await conn.end();
  }
}
main().catch((e) => {
  console.error("ERRO:", e?.message ?? e);
  process.exit(1);
});
