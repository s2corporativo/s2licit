/**
 * Extração de texto de documentos para IA.
 *
 * PDFs com camada de texto usam pdf-parse. Se o PDF for essencialmente imagem,
 * o runtime pode executar OCR local (Poppler + Tesseract) sem enviar o arquivo
 * a serviços externos. Marcadores [PÁGINA N] preservam a origem para evidência.
 */
import { TRPCError } from "@trpc/server";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { logger } from "../_core/logger";

const execFileAsync = promisify(execFile);

export type ExtractedDocument = {
  text: string;
  totalChars: number;
  pageCount?: number;
  ocrUsed?: boolean;
};

function ocrEnabled(): boolean {
  const value = process.env.DOCUMENT_OCR_ENABLED;
  return value !== "false" && value !== "0";
}

function maxOcrPages(): number {
  const requested = Number(process.env.DOCUMENT_OCR_MAX_PAGES ?? 80);
  return Number.isFinite(requested) ? Math.max(1, Math.min(Math.trunc(requested), 300)) : 80;
}

function ocrDpi(): number {
  const requested = Number(process.env.DOCUMENT_OCR_DPI ?? 180);
  return Number.isFinite(requested) ? Math.max(120, Math.min(Math.trunc(requested), 300)) : 180;
}

async function ocrPdfLocally(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  const dir = await mkdtemp(join(tmpdir(), "s2-ocr-"));
  const pdfPath = join(dir, "document.pdf");
  const prefix = join(dir, "page");
  try {
    await writeFile(pdfPath, buffer);
    await execFileAsync(
      "pdftoppm",
      ["-jpeg", "-r", String(ocrDpi()), "-f", "1", "-l", String(maxOcrPages()), pdfPath, prefix],
      { timeout: 120_000, maxBuffer: 2 * 1024 * 1024 },
    );
    const images = (await readdir(dir))
      .filter((name) => /^page-\d+\.jpg$/i.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (images.length === 0) throw new Error("Poppler não gerou páginas para OCR.");

    const pages: string[] = [];
    for (let index = 0; index < images.length; index++) {
      const { stdout } = await execFileAsync(
        "tesseract",
        [join(dir, images[index]), "stdout", "-l", "por+eng", "--psm", "6"],
        { timeout: 90_000, maxBuffer: 12 * 1024 * 1024 },
      );
      const pageText = String(stdout ?? "").trim();
      pages.push(`[PÁGINA ${index + 1}]\n${pageText}`);
    }
    return { text: pages.join("\n\n"), pageCount: images.length };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Extrai texto de um arquivo em base64 conforme o tipo. */
export async function extractDocumentText(input: {
  fileBase64: string;
  fileName: string;
  mimeType: string;
}): Promise<ExtractedDocument> {
  const buffer = Buffer.from(input.fileBase64, "base64");
  const lower = input.fileName.toLowerCase();
  let text = "";
  let pageCount: number | undefined;
  let ocrUsed = false;

  if (input.mimeType === "application/pdf" || lower.endsWith(".pdf")) {
    try {
      const { PDFParse } = await import("pdf-parse");
      const parser = new (PDFParse as any)({ data: buffer });
      const result = await parser.getText();
      if (typeof result === "string") {
        text = result;
      } else if (result && typeof result === "object") {
        const pages = Array.isArray(result.pages) ? result.pages : [];
        pageCount = pages.length || undefined;
        if (pages.length > 0) {
          text = pages
            .map((page: any, index: number) => `[PÁGINA ${index + 1}]\n${String(page?.text ?? "").trim()}`)
            .join("\n\n");
        } else {
          text = result.text ?? "";
        }
      }
    } catch (error) {
      logger.warn("[DocumentText] Extração textual do PDF falhou; avaliando OCR", (error as Error).message);
    }

    if ((!text || text.trim().length < 50) && ocrEnabled()) {
      try {
        const ocr = await ocrPdfLocally(buffer);
        text = ocr.text;
        pageCount = ocr.pageCount;
        ocrUsed = true;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `PDF sem texto pesquisável e OCR local falhou: ${(error as Error).message}`,
        });
      }
    }
  } else if (
    input.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } catch (error) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao ler DOCX: " + String(error) });
    }
  } else if (input.mimeType.startsWith("text/") || lower.endsWith(".txt")) {
    text = buffer.toString("utf-8");
  } else {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Formato não suportado. Use PDF, DOCX ou TXT." });
  }

  if (!text || text.trim().length < 50) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Não foi possível extrair conteúdo textual suficiente do documento.",
    });
  }

  return { text, totalChars: text.length, pageCount, ocrUsed };
}
