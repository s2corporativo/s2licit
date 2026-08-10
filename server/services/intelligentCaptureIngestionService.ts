import path from "node:path";
import { readSheetAsObjects } from "../utils/spreadsheet";
import { parsePrecoBR } from "../utils/number";
import { parseStringPromise } from "xml2js";
import { parseNfeXml } from "./nfeParserService";
import {
  detectCategory,
  discoverCatalogPages,
  extractProductData,
  normalizeProductName,
} from "./catalogDiscoveryService";

export type CaptureSourceType =
  | "url"
  | "html"
  | "pdf"
  | "spreadsheet"
  | "xml"
  | "docx"
  | "text"
  | "image";

export type CaptureProductInput = {
  name: string;
  brand?: string | null;
  manufacturer?: string | null;
  description?: string | null;
  presentation?: string | null;
  barcode?: string | null;
  sku?: string | null;
  price?: string | number | null;
  unit?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  productUrl?: string | null;
  regulatoryData?: Record<string, unknown> | null;
  rawPayload?: Record<string, unknown> | null;
  confidence?: Array<{
    fieldName: string;
    confidenceScore: string | number;
    extractionMethod?: string | null;
    sourceSnippet?: string | null;
  }>;
};

export type CaptureBatchDraft = {
  sourceType: CaptureSourceType;
  sourceLabel?: string | null;
  sourceReference?: string | null;
  meta?: Record<string, unknown> | null;
  products: CaptureProductInput[];
};

const MAX_DECODED_FILE_BYTES = 20 * 1024 * 1024;
const MAX_EXTRACTED_TEXT_CHARS = 5_000_000;
const MAX_STRUCTURED_CONTENT_CHARS = 5_000_000;
const MAX_CAPTURE_PRODUCTS = 5_000;
const MAX_SPREADSHEET_ROWS = 25_000;
const MAX_XML_NODES = 100_000;
const MAX_TEXT_LINES = 25_000;
const MAX_LINE_CHARS = 4_000;
const MAX_RAW_PAYLOAD_BYTES = 32 * 1024;
const MAX_ZIP_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 10_000;
const WEBSITE_CONCURRENCY = 6;

const COLUMN_ALIASES: Record<string, keyof CaptureProductInput> = {
  nome: "name",
  produto: "name",
  product: "name",
  name: "name",
  descricao: "description",
  description: "description",
  apresentacao: "presentation",
  presentation: "presentation",
  marca: "brand",
  brand: "brand",
  fabricante: "manufacturer",
  manufacturer: "manufacturer",
  codigo: "sku",
  code: "sku",
  sku: "sku",
  ean: "barcode",
  gtin: "barcode",
  barcode: "barcode",
  codigo_de_barras: "barcode",
  valor: "price",
  preco: "price",
  price: "price",
  unidade: "unit",
  unit: "unit",
  categoria: "category",
  category: "category",
  imagem: "imageUrl",
  image: "imageUrl",
  image_url: "imageUrl",
  url: "productUrl",
  link: "productUrl",
  product_url: "productUrl",
};

interface MappingOptions {
  allowDescriptionAsName?: boolean;
}

interface WebsiteExtractionResult {
  index: number;
  product: Awaited<ReturnType<typeof extractProductData>> | null;
  error: string | null;
}

function sanitizeText(value: unknown, maxLength = 16_000): string {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLength);
}

function normalizeHeader(value: unknown): string {
  return sanitizeText(value, 256)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isPrimitive(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function boundedRawPayload(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  let approximateBytes = 2;

  for (const [keyRaw, item] of Object.entries(input).slice(0, 128)) {
    const key = sanitizeText(keyRaw, 128);
    if (!key) continue;

    let normalized: unknown;
    if (isPrimitive(item)) {
      normalized = typeof item === "string" ? sanitizeText(item, 2_000) : item;
    } else if (Array.isArray(item)) {
      normalized = item
        .filter(isPrimitive)
        .slice(0, 32)
        .map((entry) =>
          typeof entry === "string" ? sanitizeText(entry, 512) : entry,
        );
    } else {
      continue;
    }

    const encoded = JSON.stringify({ [key]: normalized });
    const bytes = Buffer.byteLength(encoded, "utf8");
    if (approximateBytes + bytes > MAX_RAW_PAYLOAD_BYTES) break;

    output[key] = normalized;
    approximateBytes += bytes;
  }

  return Object.keys(output).length > 0 ? output : null;
}

function buildConfidence(
  fieldName: string,
  confidenceScore: number,
  sourceSnippet?: string,
) {
  return {
    fieldName: sanitizeText(fieldName, 128),
    confidenceScore: Math.max(0, Math.min(confidenceScore, 1)).toFixed(2),
    extractionMethod: "heuristic",
    sourceSnippet: sourceSnippet ? sanitizeText(sourceSnippet, 2_000) : null,
  };
}

function normalizeBarcode(value: unknown): string | null {
  const digits = sanitizeText(value, 128).replace(/\D/g, "");
  return /^\d{8,14}$/.test(digits) ? digits : null;
}

function normalizeProduct(product: CaptureProductInput): CaptureProductInput | null {
  const name = sanitizeText(product.name, 256).replace(/\s+/g, " ");
  if (!name) return null;

  const price =
    product.price === null || product.price === undefined || product.price === ""
      ? null
      : parsePrecoBR(product.price);

  return {
    name,
    brand: sanitizeText(product.brand, 128) || null,
    manufacturer: sanitizeText(product.manufacturer, 128) || null,
    description: sanitizeText(product.description, 16_000) || null,
    presentation: sanitizeText(product.presentation, 128) || null,
    barcode: normalizeBarcode(product.barcode),
    sku: sanitizeText(product.sku, 128) || null,
    price: price != null && price >= 0 ? price : null,
    unit: sanitizeText(product.unit, 64) || null,
    category: sanitizeText(product.category, 128) || null,
    imageUrl: sanitizeText(product.imageUrl, 2_048) || null,
    productUrl: sanitizeText(product.productUrl, 2_048) || null,
    regulatoryData: boundedRawPayload(product.regulatoryData),
    rawPayload: boundedRawPayload(product.rawPayload),
    confidence: (product.confidence ?? []).slice(0, 64).map((confidence) => ({
      fieldName: sanitizeText(confidence.fieldName, 128),
      confidenceScore: confidence.confidenceScore,
      extractionMethod: sanitizeText(confidence.extractionMethod, 128) || null,
      sourceSnippet: sanitizeText(confidence.sourceSnippet, 2_000) || null,
    })),
  };
}

function compactProducts(products: CaptureProductInput[]): CaptureProductInput[] {
  const output = new Map<string, CaptureProductInput>();

  for (const raw of products) {
    if (output.size >= MAX_CAPTURE_PRODUCTS) break;
    const product = normalizeProduct(raw);
    if (!product) continue;

    const key = product.barcode
      ? `ean:${product.barcode}`
      : product.sku
        ? `sku:${product.sku.toUpperCase()}`
        : `name:${normalizeProductName(product.name)}|price:${product.price ?? ""}`;

    if (!output.has(key)) output.set(key, product);
  }

  return [...output.values()];
}

function mapPlainObjectToProduct(
  row: Record<string, unknown>,
  index: number,
  options: MappingOptions = {},
): CaptureProductInput | null {
  const mapped: CaptureProductInput = {
    name: "",
    rawPayload: boundedRawPayload(row),
    confidence: [],
  };
  let recognizedFields = 0;

  for (const [rawKey, rawValue] of Object.entries(row)) {
    if (!isPrimitive(rawValue)) continue;
    const key = COLUMN_ALIASES[normalizeHeader(rawKey)];
    if (!key) continue;

    const textValue = sanitizeText(rawValue, key === "description" ? 16_000 : 2_048);
    if (!textValue) continue;
    recognizedFields += 1;

    if (key === "price") {
      const parsed = parsePrecoBR(textValue);
      mapped.price = parsed ?? null;
    } else if (key === "barcode") {
      mapped.barcode = normalizeBarcode(textValue);
    } else {
      (mapped as Record<string, unknown>)[key] = textValue;
    }

    mapped.confidence?.push(
      buildConfidence(
        String(key),
        key === "name" ? 0.95 : 0.80,
        `${rawKey}: ${textValue}`,
      ),
    );
  }

  if (!mapped.name && options.allowDescriptionAsName) {
    const candidates = [
      row.name,
      row.nome,
      row.produto,
      row.product,
      row.descricao,
      row.description,
    ]
      .filter(isPrimitive)
      .map((item) => sanitizeText(item, 256))
      .filter(Boolean);
    mapped.name = candidates[0] ?? "";
  }

  if (!mapped.name || recognizedFields === 0) return null;

  if (!mapped.category) {
    mapped.category =
      detectCategory(mapped.name, mapped.description ?? undefined) ?? null;
  }

  mapped.rawPayload = {
    ...(mapped.rawPayload ?? {}),
    sourceRow: index,
  };
  return normalizeProduct(mapped);
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (character === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }

  cells.push(current.trim());
  return cells;
}

function detectDelimiter(lines: readonly string[]): string | null {
  const sample = lines.slice(0, Math.min(lines.length, 30));
  let best: { delimiter: string; score: number } | null = null;

  for (const delimiter of [";", "\t", "|", ","]) {
    const widths = sample.map((line) => splitDelimitedLine(line, delimiter).length);
    const withColumns = widths.filter((width) => width >= 2);
    if (withColumns.length < Math.min(2, sample.length)) continue;

    const frequency = new Map<number, number>();
    for (const width of withColumns) {
      frequency.set(width, (frequency.get(width) ?? 0) + 1);
    }
    const dominant = [...frequency.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!dominant) continue;

    const consistency = dominant[1] / sample.length;
    const score = consistency * 10 + dominant[0];
    if (!best || score > best.score) best = { delimiter, score };
  }

  return best?.delimiter ?? null;
}

export function extractProductsFromDelimitedText(text: string): CaptureProductInput[] {
  const sanitized = sanitizeText(text, MAX_STRUCTURED_CONTENT_CHARS);
  if (!sanitized) return [];

  const lines = sanitized
    .split("\n")
    .slice(0, MAX_TEXT_LINES)
    .map((line) => sanitizeText(line, MAX_LINE_CHARS))
    .filter(Boolean);
  if (lines.length === 0) return [];

  const delimiter = detectDelimiter(lines);
  if (!delimiter) {
    return compactProducts(
      lines.slice(0, MAX_CAPTURE_PRODUCTS).map((line, index) => ({
        name: line,
        description: line,
        rawPayload: { line, sourceRow: index },
        confidence: [buildConfidence("name", 0.72, line)],
      })),
    );
  }

  const [headerLine, ...dataLines] = lines;
  const headers = splitDelimitedLine(headerLine, delimiter).map((part) =>
    sanitizeText(part, 256),
  );

  return compactProducts(
    dataLines.slice(0, MAX_SPREADSHEET_ROWS).flatMap((line, index) => {
      const values = splitDelimitedLine(line, delimiter);
      const row = headers.reduce<Record<string, unknown>>(
        (accumulator, header, columnIndex) => {
          if (header) accumulator[header] = values[columnIndex] ?? "";
          return accumulator;
        },
        {},
      );
      const product = mapPlainObjectToProduct(row, index, {
        allowDescriptionAsName: true,
      });
      return product ? [product] : [];
    }),
  );
}

export async function extractProductsFromSpreadsheetBuffer(
  buffer: Buffer,
  fileName: string,
): Promise<CaptureProductInput[]> {
  assertFileSize(buffer);
  assertSpreadsheetSignature(buffer, fileName);

  const rows = await readSheetAsObjects(buffer, { defval: "" });
  if (rows.length > MAX_SPREADSHEET_ROWS) {
    throw new Error(
      `Planilha possui ${rows.length} linhas; limite seguro é ${MAX_SPREADSHEET_ROWS}.`,
    );
  }

  return compactProducts(
    rows.flatMap((row, index) => {
      const product = mapPlainObjectToProduct(row, index, {
        allowDescriptionAsName: true,
      });
      if (!product) return [];
      product.rawPayload = {
        ...(product.rawPayload ?? {}),
        sourceFile: sanitizeFileName(fileName),
      };
      return [product];
    }),
  );
}

function sanitizeFileName(fileName: string): string {
  return path.basename(sanitizeText(fileName, 512));
}

function assertFileSize(buffer: Buffer): void {
  if (buffer.length === 0) throw new Error("Arquivo vazio.");
  if (buffer.length > MAX_DECODED_FILE_BYTES) {
    throw new Error(
      `Arquivo excede o limite de ${MAX_DECODED_FILE_BYTES} bytes.`,
    );
  }
}

function decodeBase64Strict(value: string): Buffer {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)
  ) {
    throw new Error("Conteúdo base64 inválido.");
  }

  const buffer = Buffer.from(normalized, "base64");
  assertFileSize(buffer);
  return buffer;
}

function inspectZipSafety(buffer: Buffer): void {
  let entries = 0;
  let totalUncompressed = 0;

  for (let offset = 0; offset <= buffer.length - 46; ) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      offset += 1;
      continue;
    }

    entries += 1;
    totalUncompressed += buffer.readUInt32LE(offset + 24);
    if (entries > MAX_ZIP_ENTRIES) {
      throw new Error(`Arquivo ZIP/DOCX/XLSX excede ${MAX_ZIP_ENTRIES} entradas.`);
    }
    if (totalUncompressed > MAX_ZIP_UNCOMPRESSED_BYTES) {
      throw new Error(
        `Arquivo compactado expande para mais de ${MAX_ZIP_UNCOMPRESSED_BYTES} bytes.`,
      );
    }

    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    offset += 46 + nameLength + extraLength + commentLength;
  }
}

function assertSpreadsheetSignature(buffer: Buffer, fileName: string): void {
  const extension = path.extname(fileName).toLowerCase();
  const zip = buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50;
  const ole =
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));

  if (extension === ".xlsx" || extension === ".xlsm") {
    if (!zip) throw new Error("Planilha XLSX/XLSM inválida: assinatura ZIP ausente.");
    inspectZipSafety(buffer);
    return;
  }
  if (extension === ".xls") {
    if (!ole) throw new Error("Planilha XLS inválida: assinatura OLE ausente.");
    return;
  }
  if ([".csv", ".txt", ".tsv"].includes(extension)) return;

  throw new Error("Formato de planilha não suportado. Use XLSX, XLS, CSV ou TSV.");
}

function assertDocumentSignature(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): "pdf" | "docx" | "image" {
  const lowerName = fileName.toLowerCase();
  const normalizedMime = mimeType.toLowerCase();

  const pdf = buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  if (normalizedMime === "application/pdf" || lowerName.endsWith(".pdf")) {
    if (!pdf) throw new Error("PDF inválido: assinatura %PDF ausente.");
    return "pdf";
  }

  const zip = buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50;
  if (
    normalizedMime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    if (!zip) throw new Error("DOCX inválido: assinatura ZIP ausente.");
    inspectZipSafety(buffer);
    return "docx";
  }

  const isJpeg =
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;
  const isPng =
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  const isWebp =
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP";

  if (isJpeg || isPng || isWebp) return "image";
  throw new Error("Formato binário não reconhecido como PDF, DOCX, PNG, JPG ou WEBP.");
}

function extractPdfText(result: unknown): string {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return "";

  const record = result as Record<string, unknown>;
  if (typeof record.text === "string") return record.text;
  if (Array.isArray(record.pages)) {
    return record.pages
      .map((page) => {
        if (!page || typeof page !== "object") return "";
        const text = (page as Record<string, unknown>).text;
        return typeof text === "string" ? text : "";
      })
      .join("\n");
  }
  return "";
}

function assertExtractedTextSize(text: string): string {
  if (text.length > MAX_EXTRACTED_TEXT_CHARS) {
    throw new Error(
      `Documento gerou ${text.length} caracteres; limite seguro é ${MAX_EXTRACTED_TEXT_CHARS}.`,
    );
  }
  return text;
}

export async function extractTextFromBinaryDocument(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<string> {
  assertFileSize(buffer);
  const kind = assertDocumentSignature(buffer, fileName, mimeType);

  if (kind === "pdf") {
    const { PDFParse } = await import("pdf-parse");
    const Parser = PDFParse as unknown as new (input: { data: Buffer }) => {
      getText(): Promise<unknown>;
    };
    const parser = new Parser({ data: buffer });
    const result = await parser.getText();
    return assertExtractedTextSize(extractPdfText(result));
  }

  if (kind === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return assertExtractedTextSize(result.value ?? "");
  }

  const { isOcrSupportedMime, ocrImagem } = await import("./ocrService");
  if (!isOcrSupportedMime(mimeType, fileName.toLowerCase())) {
    throw new Error("Imagem válida, mas o MIME/extensão não é aceito pelo OCR.");
  }
  const text = await ocrImagem(buffer, mimeType, fileName);
  return assertExtractedTextSize(text);
}

function genericXmlObjectToProducts(node: unknown): CaptureProductInput[] {
  const products: CaptureProductInput[] = [];
  const stack: unknown[] = [node];
  let visited = 0;

  while (stack.length > 0 && products.length < MAX_CAPTURE_PRODUCTS) {
    const current = stack.pop();
    if (current == null) continue;

    if (Array.isArray(current)) {
      for (let index = current.length - 1; index >= 0; index -= 1) {
        stack.push(current[index]);
      }
      continue;
    }
    if (typeof current !== "object") continue;

    visited += 1;
    if (visited > MAX_XML_NODES) {
      throw new Error(`XML excede o limite de ${MAX_XML_NODES} nós processáveis.`);
    }

    const record = current as Record<string, unknown>;
    const product = mapPlainObjectToProduct(record, products.length, {
      allowDescriptionAsName: true,
    });
    if (product && normalizeProductName(product.name).length >= 3) {
      products.push(product);
    }

    for (const value of Object.values(record)) {
      if (value && typeof value === "object") stack.push(value);
    }
  }

  return compactProducts(products);
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<\/tr\s*>/gi, "\n")
    .replace(/<\/li\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export async function buildCaptureDraftFromStructuredSource(input: {
  sourceType: "xml" | "text" | "html";
  content: string;
  sourceLabel?: string;
  sourceReference?: string;
}): Promise<CaptureBatchDraft> {
  if (input.content.length > MAX_STRUCTURED_CONTENT_CHARS) {
    throw new Error(
      `Conteúdo excede ${MAX_STRUCTURED_CONTENT_CHARS} caracteres.`,
    );
  }

  const content = sanitizeText(input.content, MAX_STRUCTURED_CONTENT_CHARS);
  if (!content) throw new Error("Conteúdo vazio para captura.");

  if (input.sourceType === "xml") {
    if (/<nfeProc|<NFe/i.test(content)) {
      const nfeData = await parseNfeXml(content);
      return {
        sourceType: "xml",
        sourceLabel: input.sourceLabel ?? `NF-e ${nfeData.nfeNumber}`,
        sourceReference: input.sourceReference ?? null,
        meta: {
          parser: "nfe",
          nfeNumber: nfeData.nfeNumber,
          supplierName: nfeData.supplierName,
          supplierCnpj: nfeData.supplierCnpj,
          totalValue: nfeData.totalValue,
        },
        products: compactProducts(
          nfeData.products.slice(0, MAX_CAPTURE_PRODUCTS).map((product) => ({
            name: product.productName,
            description: product.description ?? product.productName,
            barcode: product.ean ?? null,
            sku: product.id,
            price: product.unitPrice,
            unit: product.unit ?? null,
            rawPayload: boundedRawPayload(
              product as unknown as Record<string, unknown>,
            ),
            confidence: [
              buildConfidence("name", 0.98, product.productName),
              buildConfidence("price", 0.95, String(product.unitPrice)),
            ],
          })),
        ),
      };
    }

    const parsed = await parseStringPromise(content, {
      explicitArray: true,
      trim: true,
      explicitRoot: true,
    });
    return {
      sourceType: "xml",
      sourceLabel: input.sourceLabel ?? "XML estruturado",
      sourceReference: input.sourceReference ?? null,
      meta: { parser: "generic-xml" },
      products: genericXmlObjectToProducts(parsed),
    };
  }

  const text = input.sourceType === "html" ? stripHtmlToText(content) : content;
  return {
    sourceType: input.sourceType,
    sourceLabel:
      input.sourceLabel ??
      (input.sourceType === "html" ? "HTML estruturado" : "Texto estruturado"),
    sourceReference: input.sourceReference ?? null,
    meta: { parser: input.sourceType === "html" ? "html-text" : "plain-text" },
    products: extractProductsFromDelimitedText(text),
  };
}

export async function buildCaptureDraftFromDocument(input: {
  fileBase64: string;
  fileName: string;
  mimeType: string;
  sourceType: "pdf" | "docx" | "image";
}): Promise<CaptureBatchDraft> {
  const fileName = sanitizeFileName(input.fileName);
  const buffer = decodeBase64Strict(input.fileBase64);
  const text = await extractTextFromBinaryDocument(buffer, fileName, input.mimeType);
  const products = extractProductsFromDelimitedText(text);

  return {
    sourceType: input.sourceType,
    sourceLabel: fileName,
    sourceReference: fileName,
    meta: {
      mimeType: sanitizeText(input.mimeType, 128),
      decodedBytes: buffer.length,
      extractedChars: text.length,
    },
    products,
  };
}

export async function buildCaptureDraftFromSpreadsheet(input: {
  fileBase64: string;
  fileName: string;
  mimeType: string;
}): Promise<CaptureBatchDraft> {
  const fileName = sanitizeFileName(input.fileName);
  const buffer = decodeBase64Strict(input.fileBase64);
  const products = await extractProductsFromSpreadsheetBuffer(buffer, fileName);

  return {
    sourceType: "spreadsheet",
    sourceLabel: fileName,
    sourceReference: fileName,
    meta: {
      mimeType: sanitizeText(input.mimeType, 128),
      decodedBytes: buffer.length,
      rowsCaptured: products.length,
    },
    products,
  };
}

async function extractWebsiteProductsBounded(
  productLinks: string[],
  selectors: Parameters<typeof extractProductData>[1],
): Promise<WebsiteExtractionResult[]> {
  const results = new Array<WebsiteExtractionResult>(productLinks.length);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= productLinks.length) return;

      try {
        results[index] = {
          index,
          product: await extractProductData(productLinks[index], selectors),
          error: null,
        };
      } catch (error) {
        results[index] = {
          index,
          product: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(WEBSITE_CONCURRENCY, productLinks.length) },
      () => worker(),
    ),
  );
  return results;
}

function websiteProductToCapture(
  product: Awaited<ReturnType<typeof extractProductData>>,
  fallbackUrl: string,
): CaptureProductInput | null {
  const name = sanitizeText(product.name, 256);
  if (!name) return null;

  return normalizeProduct({
    name,
    description: product.description ?? null,
    manufacturer: product.manufacturer ?? null,
    sku: product.sku ?? null,
    price: product.price ?? null,
    imageUrl: product.imageUrl ?? null,
    productUrl: product.url ?? fallbackUrl,
    barcode: product.ean ?? null,
    category:
      product.category ??
      detectCategory(product.name, product.description) ??
      null,
    rawPayload:
      boundedRawPayload(product.rawData) ??
      boundedRawPayload(product as unknown as Record<string, unknown>),
    confidence: [
      buildConfidence(
        "name",
        Math.max(0, Math.min((product.confidence ?? 60) / 100, 1)),
        product.name,
      ),
    ],
  });
}

export async function buildCaptureDraftFromWebsite(input: {
  url: string;
  mode?: "product" | "catalog";
  maxItems?: number;
  selectors?: {
    pageSelector?: string;
    nameSelector?: string;
    priceSelector?: string;
    descriptionSelector?: string;
    imageSelector?: string;
    skuSelector?: string;
    manufacturerSelector?: string;
    stockSelector?: string;
    eanSelector?: string;
  };
}): Promise<CaptureBatchDraft> {
  const mode = input.mode ?? "product";
  const maxItems = Math.min(Math.max(Math.trunc(input.maxItems ?? 50), 1), 500);

  if (mode === "product") {
    const product = await extractProductData(input.url, input.selectors);
    const captured = websiteProductToCapture(product, input.url);
    if (!captured) {
      throw new Error("Não foi possível extrair dados suficientes da página de produto.");
    }

    return {
      sourceType: "url",
      sourceLabel: captured.name,
      sourceReference: input.url,
      meta: { mode: "product" },
      products: [captured],
    };
  }

  const pages = await discoverCatalogPages(
    input.url,
    input.url,
    Math.min(maxItems, 50),
    input.selectors?.pageSelector,
  );
  const productLinks = Array.from(
    new Set(pages.flatMap((page) => page.productLinks)),
  ).slice(0, maxItems);

  if (productLinks.length === 0) {
    throw new Error(
      "Descoberta de catálogo não retornou links de produto; a captura foi interrompida para evitar um lote vazio enganoso.",
    );
  }

  const extracted = await extractWebsiteProductsBounded(
    productLinks,
    input.selectors,
  );
  const failures = extracted.filter((item) => item.error);
  const products = compactProducts(
    extracted.flatMap((item) => {
      if (!item.product) return [];
      const captured = websiteProductToCapture(
        item.product,
        productLinks[item.index],
      );
      return captured ? [captured] : [];
    }),
  );

  if (products.length === 0) {
    throw new Error(
      `Nenhum dos ${productLinks.length} links de produto pôde ser extraído com segurança.`,
    );
  }

  return {
    sourceType: "url",
    sourceLabel: input.url,
    sourceReference: input.url,
    meta: {
      mode: "catalog",
      crawledPages: pages.length,
      requestedProducts: productLinks.length,
      capturedProducts: products.length,
      failedProducts: failures.length,
      errors: failures.slice(0, 20).map((item) => item.error),
    },
    products,
  };
}
