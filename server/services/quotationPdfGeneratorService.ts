import PDFDocument from "pdfkit";
import { formatCurrency, formatDate } from "../utils/formatting";
import { fetchRemoteImageBuffer } from "./safeRemoteImageService";

export interface QuotationItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  imageUrl?: string;
  totalPrice?: number;
}

export interface CompanySettings {
  name: string;
  cnpj?: string;
  address?: string;
  phone?: string;
  email?: string;
  logoUrl?: string;
  bankAccount?: string;
}

export interface QuotationPdfData {
  number: string;
  date: Date;
  validUntil: Date;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  items: QuotationItem[];
  subtotal: number;
  discount?: number;
  tax?: number;
  total: number;
  notes?: string;
  company: CompanySettings;
}

const PAGE_LEFT = 40;
const PAGE_RIGHT = 555;
const TABLE_WIDTH = PAGE_RIGHT - PAGE_LEFT;
const FOOTER_RESERVE = 70;
const ROW_MIN_HEIGHT = 25;

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function explicitItemTotal(item: QuotationItem): number {
  const calculated = Number((item.quantity * item.unitPrice).toFixed(2));
  if (!finitePositive(calculated)) throw new Error(`Total inválido para o item "${item.productName}".`);
  if (item.totalPrice == null) return calculated;
  if (!finitePositive(item.totalPrice)) throw new Error(`Total informado inválido para o item "${item.productName}".`);
  const declared = Number(item.totalPrice.toFixed(2));
  if (Math.abs(declared - calculated) > 0.01) {
    throw new Error(`Total divergente no item "${item.productName}".`);
  }
  return declared;
}

async function safeLogo(logoUrl?: string): Promise<Buffer | null> {
  if (!logoUrl?.trim()) return null;
  try {
    return await fetchRemoteImageBuffer(logoUrl);
  } catch {
    return null;
  }
}

function drawHeader(
  doc: PDFKit.PDFDocument,
  company: CompanySettings,
  logo: Buffer | null,
): void {
  const headerY = 40;
  if (logo) {
    try {
      doc.image(logo, 40, headerY, { fit: [60, 60] });
    } catch {
      // Documento continua sem logo; dados textuais permanecem autoritativos.
    }
  }

  doc.fontSize(14).font("Helvetica-Bold").fillColor("black").text(company.name, 110, headerY);
  doc.fontSize(9).font("Helvetica");
  let y = headerY + 20;
  if (company.cnpj) {
    doc.text(`CNPJ: ${company.cnpj}`, 110, y);
    y += 15;
  }
  if (company.address) {
    doc.text(`Endereço: ${company.address}`, 110, y, { width: 440 });
    y += 15;
  }
  if (company.phone) {
    doc.text(`Telefone: ${company.phone}`, 110, y);
    y += 15;
  }
  if (company.email) doc.text(`Email: ${company.email}`, 110, y);
  doc.moveTo(PAGE_LEFT, 120).lineTo(PAGE_RIGHT, 120).stroke();
}

function drawFooter(doc: PDFKit.PDFDocument, company: CompanySettings): void {
  const pageHeight = doc.page.height;
  const footerY = pageHeight - 60;
  doc.fontSize(8).font("Helvetica").fillColor("black");
  doc.moveTo(PAGE_LEFT, footerY).lineTo(PAGE_RIGHT, footerY).stroke();
  if (company.bankAccount) {
    doc.text("Dados Bancários:", PAGE_LEFT, footerY + 8);
    doc.text(company.bankAccount, PAGE_LEFT, footerY + 19, { width: TABLE_WIDTH });
  }
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, PAGE_LEFT, pageHeight - 20, {
    width: TABLE_WIDTH,
    align: "center",
  });
}

function drawTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  const colProduct = PAGE_LEFT;
  const colQty = 300;
  const colUnit = 380;
  const colTotal = 470;
  doc.fillColor("#0066cc").rect(PAGE_LEFT, y, TABLE_WIDTH, ROW_MIN_HEIGHT).fill();
  doc.fontSize(9).font("Helvetica-Bold").fillColor("white");
  doc.text("Produto", colProduct + 5, y + 6, { width: 250 });
  doc.text("Qtd", colQty + 5, y + 6, { width: 70, align: "right" });
  doc.text("Unitário", colUnit + 5, y + 6, { width: 80, align: "right" });
  doc.text("Total", colTotal + 5, y + 6, { width: 80, align: "right" });
  return y + ROW_MIN_HEIGHT;
}

function rowHeightFor(doc: PDFKit.PDFDocument, name: string): number {
  doc.fontSize(8).font("Helvetica");
  const textHeight = doc.heightOfString(name, { width: 250 });
  return Math.max(ROW_MIN_HEIGHT, Math.ceil(textHeight) + 10);
}

function drawItemRow(
  doc: PDFKit.PDFDocument,
  item: QuotationItem,
  index: number,
  y: number,
): number {
  const height = rowHeightFor(doc, item.productName);
  if (index % 2 === 0) doc.fillColor("#f5f5f5").rect(PAGE_LEFT, y, TABLE_WIDTH, height).fill();
  doc.fontSize(8).font("Helvetica").fillColor("black");
  doc.text(item.productName, PAGE_LEFT + 5, y + 5, { width: 250 });
  doc.text(String(item.quantity), 305, y + 5, { width: 65, align: "right" });
  doc.text(formatCurrency(item.unitPrice), 385, y + 5, { width: 75, align: "right" });
  doc.text(formatCurrency(explicitItemTotal(item)), 475, y + 5, { width: 75, align: "right" });
  doc.moveTo(PAGE_LEFT, y + height).lineTo(PAGE_RIGHT, y + height).strokeColor("#dddddd").stroke();
  return y + height;
}

function drawTotals(doc: PDFKit.PDFDocument, data: QuotationPdfData, startY: number): number {
  let y = startY;
  const labelX = 380;
  const valueX = 465;
  doc.fontSize(10).font("Helvetica").fillColor("black");
  doc.text("Subtotal:", labelX, y);
  doc.text(formatCurrency(data.subtotal), valueX, y, { width: 85, align: "right" });
  y += 20;
  if (data.discount && data.discount > 0) {
    doc.text("Desconto:", labelX, y);
    doc.text(`-${formatCurrency(data.discount)}`, valueX, y, { width: 85, align: "right" });
    y += 20;
  }
  if (data.tax && data.tax > 0) {
    doc.text("Imposto:", labelX, y);
    doc.text(`+${formatCurrency(data.tax)}`, valueX, y, { width: 85, align: "right" });
    y += 20;
  }
  doc.moveTo(labelX, y).lineTo(PAGE_RIGHT, y).stroke();
  y += 8;
  doc.fontSize(12).font("Helvetica-Bold").text("TOTAL:", labelX, y);
  doc.text(formatCurrency(data.total), valueX, y, { width: 85, align: "right" });
  return y + 22;
}

export async function generateQuotationPdf(data: QuotationPdfData): Promise<Buffer> {
  const validation = validateQuotationData(data);
  if (!validation.valid) {
    throw new Error(`Orçamento inválido: ${validation.errors.join("; ")}`);
  }
  const logo = await safeLogo(data.company.logoUrl);
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const chunks: Buffer[] = [];
  const completion = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  try {
    drawHeader(doc, data.company, logo);
    doc.fontSize(12).font("Helvetica-Bold").fillColor("black").text("ORÇAMENTO", PAGE_LEFT, 132);
    doc.fontSize(9).font("Helvetica");
    doc.text(`Número: ${data.number}`, PAGE_LEFT, 151);
    doc.text(`Data: ${formatDate(data.date)}`, PAGE_LEFT, 166);
    doc.text(`Válido até: ${formatDate(data.validUntil)}`, PAGE_LEFT, 181);

    let y = 204;
    if (data.clientName || data.clientEmail || data.clientPhone) {
      doc.fontSize(9).font("Helvetica-Bold").text("CLIENTE", PAGE_LEFT, y);
      y += 14;
      doc.fontSize(8).font("Helvetica");
      if (data.clientName) {
        doc.text(`Nome: ${data.clientName}`, PAGE_LEFT, y, { width: TABLE_WIDTH });
        y += 12;
      }
      if (data.clientEmail) {
        doc.text(`Email: ${data.clientEmail}`, PAGE_LEFT, y, { width: TABLE_WIDTH });
        y += 12;
      }
      if (data.clientPhone) {
        doc.text(`Telefone: ${data.clientPhone}`, PAGE_LEFT, y, { width: TABLE_WIDTH });
        y += 12;
      }
      y += 8;
    }

    y = drawTableHeader(doc, y);
    for (let index = 0; index < data.items.length; index += 1) {
      const item = data.items[index];
      const needed = rowHeightFor(doc, item.productName);
      if (y + needed > doc.page.height - FOOTER_RESERVE) {
        drawFooter(doc, data.company);
        doc.addPage();
        drawHeader(doc, data.company, logo);
        y = drawTableHeader(doc, 135);
      }
      y = drawItemRow(doc, item, index, y);
    }

    if (y + 120 > doc.page.height - FOOTER_RESERVE) {
      drawFooter(doc, data.company);
      doc.addPage();
      drawHeader(doc, data.company, logo);
      y = 140;
    }
    y = drawTotals(doc, data, y + 15);

    if (data.notes) {
      if (y + 60 > doc.page.height - FOOTER_RESERVE) {
        drawFooter(doc, data.company);
        doc.addPage();
        drawHeader(doc, data.company, logo);
        y = 140;
      }
      doc.fontSize(9).font("Helvetica-Bold").text("OBSERVAÇÕES", PAGE_LEFT, y + 10);
      doc.fontSize(8).font("Helvetica").text(data.notes, PAGE_LEFT, y + 25, {
        width: TABLE_WIDTH,
        align: "left",
      });
    }

    drawFooter(doc, data.company);
    doc.end();
  } catch (error) {
    void completion.catch(() => undefined);
    doc.end();
    throw error;
  }

  return completion;
}

export function validateQuotationData(data: QuotationPdfData): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (!data.number?.trim()) errors.push("Número do orçamento é obrigatório");
  if (!(data.date instanceof Date) || Number.isNaN(data.date.getTime())) errors.push("Data do orçamento inválida");
  if (!(data.validUntil instanceof Date) || Number.isNaN(data.validUntil.getTime())) errors.push("Validade do orçamento inválida");
  if (!Array.isArray(data.items) || data.items.length === 0) errors.push("Orçamento deve ter pelo menos um item");
  if (data.items?.length > 1000) errors.push("Orçamento excede 1.000 itens");
  if (!finitePositive(data.subtotal)) errors.push("Subtotal deve ser maior que zero");
  if (!finitePositive(data.total)) errors.push("Total deve ser maior que zero");
  if (!data.company?.name?.trim()) errors.push("Dados da empresa são obrigatórios");

  for (let index = 0; index < (data.items?.length ?? 0); index += 1) {
    const item = data.items[index];
    if (!item.productName?.trim()) errors.push(`Item ${index + 1} sem descrição`);
    if (!finitePositive(item.quantity)) errors.push(`Item ${index + 1} com quantidade inválida`);
    if (!finitePositive(item.unitPrice)) errors.push(`Item ${index + 1} com preço unitário inválido`);
    try {
      explicitItemTotal(item);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Item ${index + 1} com total inválido`);
    }
    if (errors.length >= 20) break;
  }

  const expectedSubtotal = data.items?.reduce((sum, item) => {
    try {
      return sum + explicitItemTotal(item);
    } catch {
      return sum;
    }
  }, 0) ?? 0;
  if (finitePositive(expectedSubtotal) && Math.abs(expectedSubtotal - data.subtotal) > 0.01) {
    errors.push("Subtotal diverge da soma dos itens");
  }
  const expectedTotal = Number((data.subtotal - (data.discount ?? 0) + (data.tax ?? 0)).toFixed(2));
  if (finitePositive(data.total) && Math.abs(expectedTotal - data.total) > 0.01) {
    errors.push("Total diverge de subtotal, desconto e impostos");
  }

  return { valid: errors.length === 0, errors };
}

export function calculateQuotationTotals(items: QuotationItem[]): {
  subtotal: number;
  itemCount: number;
} {
  const subtotal = items.reduce((sum, item) => sum + explicitItemTotal(item), 0);
  return {
    subtotal: Number(subtotal.toFixed(2)),
    itemCount: items.length,
  };
}
