/**
 * Extração de texto de documentos para IA.
 *
 * PDFs com camada de texto usam pdf-parse. Páginas sem texto pesquisável podem
 * passar por OCR local (Poppler + Tesseract), com limites explícitos de bytes,
 * páginas, tempo e concorrência. Marcadores [PÁGINA N] preservam evidência.
 */
import { TRPCError } from "@trpc/server";
import { execFile } from "node:child_process";
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { logger } from "../_core/logger";

const execFileAsync = promisify(execFile);
const MIN_USEFUL_PAGE_CHARS = 30;
const MIN_USEFUL_DOCUMENT_CHARS = 50;
const DEFAULT_MAX_FILE_MB = 25;
const DEFAULT_OCR_MAX_PAGES = 80;
const DEFAULT_OCR_DPI = 180;
const DEFAULT_OCR_TIMEOUT_MS = 180_000;
const DEFAULT_OCR_CONCURRENCY = 1;

export type ExtractedDocument = {
  text: string;
  totalChars: number;
  pageCount?: number;
  ocrUsed: boolean;
  ocrPages: number[];
  truncated: boolean;
};

type PdfPage = { text?: string | null };
type PdfParseResult = {
  text?: string | null;
  pages?: PdfPage[] | null;
};

class AsyncSemaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly capacity: number) {}

  async acquire(): Promise<() => void> {
    if (this.active < this.capacity) {
      this.active += 1;
      return () => this.release();
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active += 1;
    return () => this.release();
  }

  private release(): void {
    this.active = Math.max(0, this.active - 1);
    this.queue.shift()?.();
  }
}

const OCR_SEMAPHORE = new AsyncSemaphore(
  Math.max(
    1,
    Math.min(
      Number(process.env.DOCUMENT_OCR_CONCURRENCY ?? DEFAULT_OCR_CONCURRENCY) || DEFAULT_OCR_CONCURRENCY,
      2,
    ),
  ),
);

function envInteger(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? Math.max(min, Math.min(Math.trunc(value), max)) : fallback;
}

function ocrEnabled(): boolean {
  const value = process.env.DOCUMENT_OCR_ENABLED;
  return value !== "false" && value !== "0";
}

function maxFileBytes(): number {
  return envInteger("DOCUMENT_MAX_FILE_MB", DEFAULT_MAX_FILE_MB, 1, 50) * 1024 * 1024;
}

function maxOcrPages(): number {
  return envInteger("DOCUMENT_OCR_MAX_PAGES", DEFAULT_OCR_MAX_PAGES, 1, 300);
}

function ocrDpi(): number {
  return envInteger("DOCUMENT_OCR_DPI", DEFAULT_OCR_DPI, 120, 300);
}

function ocrTimeoutMs(): number {
  return envInteger("DOCUMENT_OCR_TIMEOUT_MS", DEFAULT_OCR_TIMEOUT_MS, 30_000, 600_000);
}

/**
 * Mede o payload base64 sem criar uma segunda string sanitizada em memória.
 * Também rejeita padding no meio e caracteres incompatíveis antes do decode.
 */
export function approximateDecodedBytes(base64: string): number {
  let significantLength = 0;
  let padding = 0;
  let sawPadding = false;

  for (let index = 0; index < base64.length; index += 1) {
    const code = base64.charCodeAt(index);
    const isWhitespace = code === 9 || code === 10 || code === 13 || code === 32;
    if (isWhitespace) continue;

    significantLength += 1;
    if (code === 61) {
      sawPadding = true;
      padding += 1;
      if (padding > 2) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Conteúdo base64 inválido." });
      }
      continue;
    }

    const isAlphaNumeric =
      (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122);
    const isBase64Symbol = code === 43 || code === 47 || code === 45 || code === 95;
    if (!isAlphaNumeric || !isBase64Symbol && !isAlphaNumeric || sawPadding) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Conteúdo base64 inválido." });
    }
  }

  if (significantLength === 0) return 0;
  if (significantLength % 4 === 1 || (padding > 0 && significantLength % 4 !== 0)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Conteúdo base64 inválido." });
  }
  return Math.max(0, Math.floor((significantLength * 3) / 4) - padding);
}

function assertInputSize(fileBase64: string): void {
  const bytes = approximateDecodedBytes(fileBase64);
  const limit = maxFileBytes();
  if (bytes > limit) {
    throw new TRPCError({
      code: "PAYLOAD_TOO_LARGE",
      message: `Documento excede o limite de ${Math.round(limit / 1024 / 1024)} MB.`,
    });
  }
}

async function pdfPageCount(pdfPath: string): Promise<number> {
  const { stdout } = await execFileAsync("pdfinfo", [pdfPath], {
    timeout: 15_000,
    maxBuffer: 512 * 1024,
  });
  const match = String(stdout).match(/^Pages:\s+(\d+)\s*$/im);
  const count = Number(match?.[1] ?? 0);
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error("Não foi possível determinar o número de páginas do PDF.");
  }
  return count;
}

async function ocrSinglePage(
  pdfPath: string,
  dir: string,
  pageNumber: number,
  remainingMs: number,
): Promise<string> {
  if (remainingMs <= 0) throw new Error("Tempo total de OCR excedido.");
  const prefix = join(dir, `page-${pageNumber}`);
  const imagePath = `${prefix}.jpg`;
  const commandTimeout = Math.min(45_000, remainingMs);

  try {
    await execFileAsync(
      "pdftoppm",
      [
        "-jpeg",
        "-singlefile",
        "-r",
        String(ocrDpi()),
        "-f",
        String(pageNumber),
        "-l",
        String(pageNumber),
        pdfPath,
        prefix,
      ],
      { timeout: commandTimeout, maxBuffer: 512 * 1024 },
    );
    const { stdout } = await execFileAsync(
      "tesseract",
      [imagePath, "stdout", "-l", "por+eng", "--psm", "6"],
      {
        timeout: Math.min(45_000, remainingMs),
        maxBuffer: 12 * 1024 * 1024,
      },
    );
    return String(stdout ?? "").trim();
  } finally {
    await unlink(imagePath).catch(() => undefined);
  }
}

async function ocrPdfPages(
  buffer: Buffer,
  requestedPages?: number[],
): Promise<{
  pageTexts: Map<number, string>;
  pageCount: number;
  truncated: boolean;
}> {
  const release = await OCR_SEMAPHORE.acquire();
  const dir = await mkdtemp(join(tmpdir(), "s2-ocr-"));
  const pdfPath = join(dir, "document.pdf");
  const startedAt = Date.now();
  const timeout = ocrTimeoutMs();

  try {
    await writeFile(pdfPath, buffer);
    const pageCount = await pdfPageCount(pdfPath);
    const maxPages = maxOcrPages();
    const pages = requestedPages?.length
      ? [...new Set(requestedPages.filter((page) => page >= 1 && page <= pageCount))]
      : Array.from({ length: Math.min(pageCount, maxPages) }, (_, index) => index + 1);
    const selected = pages.filter((page) => page <= maxPages);
    const truncated = requestedPages?.length
      ? pages.some((page) => page > maxPages)
      : pageCount > maxPages;

    const pageTexts = new Map<number, string>();
    for (const pageNumber of selected) {
      const elapsed = Date.now() - startedAt;
      const remaining = timeout - elapsed;
      if (remaining <= 0) {
        throw new Error(`OCR excedeu o orçamento total de ${timeout} ms.`);
      }
      pageTexts.set(
        pageNumber,
        await ocrSinglePage(pdfPath, dir, pageNumber, remaining),
      );
    }
    return { pageTexts, pageCount, truncated };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    release();
  }
}

function pageMarkedText(pageNumber: number, text: string): string {
  return `[PÁGINA ${pageNumber}]\n${text.trim()}`;
}

async function extractPdf(buffer: Buffer): Promise<ExtractedDocument> {
  let parsed: PdfParseResult | null = null;
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new (PDFParse as unknown as new (options: { data: Buffer }) => {
      getText(): Promise<PdfParseResult | string>;
    })({ data: buffer });
    const result = await parser.getText();
    parsed = typeof result === "string" ? { text: result } : result;
  } catch (error) {
    logger.warn("[DocumentText] Falha na camada textual do PDF; OCR será avaliado", error);
  }

  const nativePages = Array.isArray(parsed?.pages) ? parsed.pages : [];
  if (nativePages.length > 0) {
    const pageTexts = nativePages.map((page) => String(page?.text ?? "").trim());
    const pagesNeedingOcr = pageTexts
      .map((text, index) => ({ text, page: index + 1 }))
      .filter((entry) => entry.text.length < MIN_USEFUL_PAGE_CHARS)
      .map((entry) => entry.page);

    let ocrPages = new Map<number, string>();
    let truncated = false;
    if (pagesNeedingOcr.length > 0 && ocrEnabled()) {
      try {
        const ocr = await ocrPdfPages(buffer, pagesNeedingOcr);
        ocrPages = ocr.pageTexts;
        truncated = ocr.truncated;
      } catch (error) {
        logger.error("[DocumentText] OCR parcial do PDF falhou", error);
      }
    }

    const text = pageTexts
      .map((nativeText, index) => {
        const pageNumber = index + 1;
        const selected = nativeText.length >= MIN_USEFUL_PAGE_CHARS
          ? nativeText
          : ocrPages.get(pageNumber) ?? nativeText;
        return pageMarkedText(pageNumber, selected);
      })
      .join("\n\n");

    if (text.replace(/\[PÁGINA \d+\]/g, "").trim().length >= MIN_USEFUL_DOCUMENT_CHARS) {
      return {
        text,
        totalChars: text.length,
        pageCount: nativePages.length,
        ocrUsed: ocrPages.size > 0,
        ocrPages: [...ocrPages.keys()],
        truncated,
      };
    }
  }

  const nativeText = String(parsed?.text ?? "").trim();
  if (nativeText.length >= MIN_USEFUL_DOCUMENT_CHARS) {
    return {
      text: nativeText,
      totalChars: nativeText.length,
      ocrUsed: false,
      ocrPages: [],
      truncated: false,
    };
  }

  if (!ocrEnabled()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "PDF sem texto pesquisável e OCR local desativado.",
    });
  }

  try {
    const ocr = await ocrPdfPages(buffer);
    const text = [...ocr.pageTexts.entries()]
      .sort(([a], [b]) => a - b)
      .map(([pageNumber, pageText]) => pageMarkedText(pageNumber, pageText))
      .join("\n\n");
    if (text.replace(/\[PÁGINA \d+\]/g, "").trim().length < MIN_USEFUL_DOCUMENT_CHARS) {
      throw new Error("OCR não encontrou conteúdo textual suficiente.");
    }
    return {
      text,
      totalChars: text.length,
      pageCount: ocr.pageCount,
      ocrUsed: true,
      ocrPages: [...ocr.pageTexts.keys()],
      truncated: ocr.truncated,
    };
  } catch (error) {
    logger.error("[DocumentText] OCR completo do PDF falhou", error);
    throw new TRPCError({
      code: "UNPROCESSABLE_CONTENT",
      message: "Não foi possível interpretar o PDF com segurança.",
    });
  }
}

/** Extrai texto de um arquivo em base64 conforme o tipo. */
export async function extractDocumentText(input: {
  fileBase64: string;
  fileName: string;
  mimeType: string;
}): Promise<ExtractedDocument> {
  assertInputSize(input.fileBase64);
  const buffer = Buffer.from(input.fileBase64, "base64");
  const lower = input.fileName.toLowerCase();

  if (input.mimeType === "application/pdf" || lower.endsWith(".pdf")) {
    return extractPdf(buffer);
  }

  let text = "";
  if (
    input.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } catch (error) {
      logger.error("[DocumentText] Falha ao ler DOCX", error);
      throw new TRPCError({
        code: "UNPROCESSABLE_CONTENT",
        message: "Não foi possível interpretar o DOCX.",
      });
    }
  } else if (input.mimeType.startsWith("text/") || lower.endsWith(".txt")) {
    text = buffer.toString("utf-8");
  } else {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Formato não suportado. Use PDF, DOCX ou TXT.",
    });
  }

  const normalized = text.trim();
  if (normalized.length < MIN_USEFUL_DOCUMENT_CHARS) {
    throw new TRPCError({
      code: "UNPROCESSABLE_CONTENT",
      message: "Não foi possível extrair conteúdo textual suficiente do documento.",
    });
  }

  return {
    text: normalized,
    totalChars: normalized.length,
    ocrUsed: false,
    ocrPages: [],
    truncated: false,
  };
}
