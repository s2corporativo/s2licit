import * as XLSX from "xlsx";
import { parseStringPromise } from "xml2js";
import { parseNfeXml } from "./nfeParserService";
import { detectCategory, discoverCatalogPages, extractProductData, normalizeProductName } from "./catalogDiscoveryService";

export type CaptureSourceType = "url" | "html" | "pdf" | "spreadsheet" | "xml" | "docx" | "text";

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

const COLUMN_ALIASES: Record<string, keyof CaptureProductInput> = {
  nome: "name",
  produto: "name",
  descricao: "description",
  descrição: "description",
  apresentacao: "presentation",
  apresentação: "presentation",
  marca: "brand",
  fabricante: "manufacturer",
  codigo: "sku",
  código: "sku",
  sku: "sku",
  ean: "barcode",
  gtin: "barcode",
  codigo_de_barras: "barcode",
  valor: "price",
  preco: "price",
  preço: "price",
  price: "price",
  unidade: "unit",
  unit: "unit",
  categoria: "category",
  imagem: "imageUrl",
  image: "imageUrl",
  url: "productUrl",
  link: "productUrl",
};

function sanitizeText(value: string): string {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .trim();
}

function normalizeHeader(value: unknown): string {
  return sanitizeText(String(value ?? ""))
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function maybeNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const normalized = String(value).replace(/\./g, "").replace(",", ".");
  const numeric = Number.parseFloat(normalized);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function compactProducts(products: CaptureProductInput[]): CaptureProductInput[] {
  return products.filter((product) => sanitizeText(product.name).length > 0);
}

function buildConfidence(fieldName: string, confidenceScore: number, sourceSnippet?: string) {
  return {
    fieldName,
    confidenceScore: confidenceScore.toFixed(2),
    extractionMethod: "heuristic",
    sourceSnippet: sourceSnippet ?? null,
  };
}

function mapPlainObjectToProduct(row: Record<string, unknown>, index: number): CaptureProductInput | null {
  const mapped: CaptureProductInput = {
    name: "",
    rawPayload: row,
    confidence: [],
  };

  for (const [rawKey, rawValue] of Object.entries(row)) {
    const key = COLUMN_ALIASES[normalizeHeader(rawKey)];
    if (!key) continue;
    const textValue = sanitizeText(String(rawValue ?? ""));
    if (!textValue) continue;
    (mapped as Record<string, unknown>)[key] = key === "price" ? maybeNumber(textValue) ?? textValue : textValue;
    mapped.confidence?.push(buildConfidence(String(key), key === "name" ? 0.95 : 0.8, `${rawKey}: ${textValue}`));
  }

  if (!mapped.name) {
    const candidates = [row.name, row.nome, row.produto, row.product, row.descricao, row.descrição]
      .map((item) => sanitizeText(String(item ?? "")))
      .filter(Boolean);
    mapped.name = candidates[0] ?? `Item ${index + 1}`;
  }

  if (!mapped.category) {
    mapped.category = detectCategory(mapped.name, mapped.description ?? undefined) ?? null;
  }

  return sanitizeText(mapped.name) ? mapped : null;
}

export function extractProductsFromDelimitedText(text: string): CaptureProductInput[] {
  const sanitized = sanitizeText(text);
  if (!sanitized) return [];

  const lines = sanitized.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const delimiter = [";", "\t", "|", ","].find((candidate) => lines.some((line) => line.includes(candidate)));

  if (!delimiter) {
    return lines.map((line, index) => ({
      name: line,
      description: line,
      rawPayload: { line, index },
      confidence: [buildConfidence("name", 0.72, line)],
    }));
  }

  const [headerLine, ...dataLines] = lines;
  const headers = headerLine.split(delimiter).map((part) => part.trim());

  return compactProducts(
    dataLines.map((line, index) => {
      const values = line.split(delimiter);
      const row = headers.reduce<Record<string, unknown>>((acc, header, columnIndex) => {
        acc[header] = values[columnIndex] ?? "";
        return acc;
      }, {});
      return mapPlainObjectToProduct(row, index);
    }).filter((item): item is CaptureProductInput => Boolean(item)),
  );
}

export async function extractProductsFromSpreadsheetBuffer(buffer: Buffer, fileName: string): Promise<CaptureProductInput[]> {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });

  return compactProducts(
    rows.map((row, index) => {
      const product = mapPlainObjectToProduct(row, index);
      if (product && !product.rawPayload) {
        product.rawPayload = { row, fileName };
      }
      return product;
    }).filter((item): item is CaptureProductInput => Boolean(item)),
  );
}

export async function extractTextFromBinaryDocument(buffer: Buffer, fileName: string, mimeType: string): Promise<string> {
  const lowerName = fileName.toLowerCase();

  if (mimeType === "application/pdf" || lowerName.endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new (PDFParse as any)({ data: buffer });
    const result = await parser.getText();
    return typeof result === "string" ? result : (result?.text ?? result?.pages?.map((page: any) => page.text).join("\n") ?? "");
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? "";
  }

  throw new Error("Formato de documento não suportado. Use PDF ou DOCX.");
}

function genericXmlObjectToProducts(node: unknown, products: CaptureProductInput[] = []): CaptureProductInput[] {
  if (Array.isArray(node)) {
    node.forEach((item) => genericXmlObjectToProducts(item, products));
    return products;
  }

  if (!node || typeof node !== "object") return products;

  const record = node as Record<string, any>;
  const product = mapPlainObjectToProduct(record, products.length);
  if (product && normalizeProductName(product.name).length >= 3) {
    products.push(product);
  }

  Object.values(record).forEach((value) => genericXmlObjectToProducts(value, products));
  return products;
}

export async function buildCaptureDraftFromStructuredSource(input: {
  sourceType: "xml" | "text" | "html";
  content: string;
  sourceLabel?: string;
  sourceReference?: string;
}): Promise<CaptureBatchDraft> {
  const content = sanitizeText(input.content);
  if (!content) throw new Error("Conteúdo vazio para captura");

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
        products: nfeData.products.map((product) => ({
          name: product.productName,
          description: product.description ?? product.productName,
          barcode: product.ean ?? null,
          sku: product.id,
          price: product.unitPrice,
          unit: product.unit ?? null,
          rawPayload: product as unknown as Record<string, unknown>,
          confidence: [
            buildConfidence("name", 0.98, product.productName),
            buildConfidence("price", 0.95, String(product.unitPrice)),
          ],
        })),
      };
    }

    const parsed = await parseStringPromise(content, { explicitArray: true, trim: true });
    const products = compactProducts(genericXmlObjectToProducts(parsed));
    return {
      sourceType: "xml",
      sourceLabel: input.sourceLabel ?? "XML estruturado",
      sourceReference: input.sourceReference ?? null,
      meta: { parser: "generic-xml" },
      products,
    };
  }

  const extracted = extractProductsFromDelimitedText(content);
  return {
    sourceType: input.sourceType,
    sourceLabel: input.sourceLabel ?? (input.sourceType === "html" ? "HTML estruturado" : "Texto estruturado"),
    sourceReference: input.sourceReference ?? null,
    meta: { parser: input.sourceType === "html" ? "html-text" : "plain-text" },
    products: extracted,
  };
}

export async function buildCaptureDraftFromDocument(input: {
  fileBase64: string;
  fileName: string;
  mimeType: string;
  sourceType: "pdf" | "docx";
}): Promise<CaptureBatchDraft> {
  const buffer = Buffer.from(input.fileBase64, "base64");
  const text = await extractTextFromBinaryDocument(buffer, input.fileName, input.mimeType);
  const products = extractProductsFromDelimitedText(text);

  return {
    sourceType: input.sourceType,
    sourceLabel: input.fileName,
    sourceReference: input.fileName,
    meta: { mimeType: input.mimeType, extractedChars: text.length },
    products,
  };
}

export async function buildCaptureDraftFromSpreadsheet(input: {
  fileBase64: string;
  fileName: string;
  mimeType: string;
}): Promise<CaptureBatchDraft> {
  const buffer = Buffer.from(input.fileBase64, "base64");
  const products = await extractProductsFromSpreadsheetBuffer(buffer, input.fileName);

  return {
    sourceType: "spreadsheet",
    sourceLabel: input.fileName,
    sourceReference: input.fileName,
    meta: { mimeType: input.mimeType, rowsCaptured: products.length },
    products,
  };
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
  const maxItems = Math.min(Math.max(input.maxItems ?? 10, 1), 30);

  if (mode === "product") {
    const product = await extractProductData(input.url, input.selectors);
    const name = sanitizeText(product.name ?? "");
    if (!name) throw new Error("Não foi possível extrair dados suficientes da página de produto");

    return {
      sourceType: "url",
      sourceLabel: name,
      sourceReference: input.url,
      meta: { mode: "product" },
      products: [{
        name,
        description: product.description ?? null,
        manufacturer: product.manufacturer ?? null,
        sku: product.sku ?? null,
        price: product.price ?? null,
        imageUrl: product.imageUrl ?? null,
        productUrl: product.url ?? input.url,
        barcode: product.ean ?? null,
        category: product.category ?? detectCategory(product.name, product.description) ?? null,
        rawPayload: (product.rawData as Record<string, unknown> | undefined) ?? (product as unknown as Record<string, unknown>),
        confidence: [buildConfidence("name", (product.confidence ?? 60) / 100, product.name)],
      }],
    };
  }

  const pages = await discoverCatalogPages(input.url, input.url, Math.min(maxItems, 10), input.selectors?.pageSelector);
  const productLinks = Array.from(new Set(pages.flatMap((page) => page.productLinks))).slice(0, maxItems);
  const extracted = await Promise.all(productLinks.map((link) => extractProductData(link, input.selectors)));
  const products = compactProducts(
    extracted
      .map((product, index): CaptureProductInput | null => {
        const name = sanitizeText(product.name ?? "");
        if (!name) return null;
        return {
          name,
          description: product.description ?? null,
          manufacturer: product.manufacturer ?? null,
          sku: product.sku ?? null,
          price: product.price ?? null,
          imageUrl: product.imageUrl ?? null,
          productUrl: product.url ?? productLinks[index] ?? null,
          barcode: product.ean ?? null,
          category: product.category ?? detectCategory(product.name, product.description) ?? null,
          rawPayload: (product.rawData as Record<string, unknown> | undefined) ?? (product as unknown as Record<string, unknown>),
          confidence: [buildConfidence("name", (product.confidence ?? 60) / 100, product.name)],
        };
      })
      .filter((item): item is CaptureProductInput => Boolean(item)),
  );

  return {
    sourceType: "url",
    sourceLabel: input.url,
    sourceReference: input.url,
    meta: { mode: "catalog", crawledPages: pages.length, crawledProducts: productLinks.length },
    products,
  };
}
