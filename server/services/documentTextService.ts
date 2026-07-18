/**
 * documentTextService: extração de texto de documentos (PDF, DOCX, TXT) para
 * consumo por IA. Centraliza o que estava embutido no router de editais para
 * ser reaproveitado pela análise jurídica.
 */
import { TRPCError } from "@trpc/server";

export type ExtractedDocument = {
  text: string;
  totalChars: number;
};

/** Extrai texto de um arquivo em base64 conforme o tipo. */
export async function extractDocumentText(input: {
  fileBase64: string;
  fileName: string;
  mimeType: string;
}): Promise<ExtractedDocument> {
  const buffer = Buffer.from(input.fileBase64, "base64");
  const lower = input.fileName.toLowerCase();
  let text = "";

  if (input.mimeType === "application/pdf" || lower.endsWith(".pdf")) {
    try {
      const { PDFParse } = await import("pdf-parse");
      const parser = new (PDFParse as any)({ data: buffer });
      const result = await parser.getText();
      if (typeof result === "string") {
        text = result;
      } else if (result && typeof result === "object") {
        text = result.text ?? result.pages?.map((p: any) => p.text).join("\n") ?? "";
      }
    } catch (e) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao ler PDF: " + String(e) });
    }
  } else if (
    input.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } catch (e) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao ler DOCX: " + String(e) });
    }
  } else if (input.mimeType.startsWith("text/") || lower.endsWith(".txt")) {
    text = buffer.toString("utf-8");
  } else {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Formato não suportado. Use PDF, DOCX ou TXT." });
  }

  if (!text || text.trim().length < 50) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Não foi possível extrair texto do arquivo. Se for um PDF escaneado (imagem), converta para texto antes.",
    });
  }

  return { text, totalChars: text.length };
}
