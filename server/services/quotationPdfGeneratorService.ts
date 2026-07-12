import PDFDocument from "pdfkit";

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

/**
 * Gera PDF de orçamento com cabeçalho da empresa, tabela de itens e totais
 */
export async function generateQuotationPdf(data: QuotationPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 40,
    });

    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => {
      chunks.push(chunk);
    });

    doc.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    doc.on("error", reject);

    try {
      // Cabeçalho da empresa
      drawHeader(doc, data.company);

      // Informações do orçamento
      doc.fontSize(12).font("Helvetica-Bold").text("ORÇAMENTO", 40, 120);
      doc.fontSize(10).font("Helvetica");

      const infoY = 140;
      doc.text(`Número: ${data.number}`, 40, infoY);
      doc.text(`Data: ${formatDate(data.date)}`, 40, infoY + 20);
      doc.text(`Válido até: ${formatDate(data.validUntil)}`, 40, infoY + 40);

      // Dados do cliente
      if (data.clientName || data.clientEmail || data.clientPhone) {
        doc.fontSize(10).font("Helvetica-Bold").text("CLIENTE", 40, infoY + 70);
        doc.fontSize(9).font("Helvetica");

        if (data.clientName) {
          doc.text(`Nome: ${data.clientName}`, 40, infoY + 90);
        }
        if (data.clientEmail) {
          doc.text(`Email: ${data.clientEmail}`, 40, infoY + 110);
        }
        if (data.clientPhone) {
          doc.text(`Telefone: ${data.clientPhone}`, 40, infoY + 130);
        }
      }

      // Tabela de itens
      drawItemsTable(doc, data.items, infoY + 160);

      // Totais
      const totalsY = doc.y + 20;
      drawTotals(doc, data, totalsY);

      // Notas
      if (data.notes) {
        doc.fontSize(9).font("Helvetica-Bold").text("OBSERVAÇÕES", 40, doc.y + 20);
        doc.fontSize(8).font("Helvetica").text(data.notes, 40, doc.y + 10, {
          width: 500,
          align: "left",
        });
      }

      // Rodapé
      drawFooter(doc, data.company);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Desenha cabeçalho com logo e dados da empresa
 */
function drawHeader(doc: PDFKit.PDFDocument, company: CompanySettings): void {
  const headerY = 40;

  // Logo (se disponível)
  if (company.logoUrl) {
    try {
      doc.image(company.logoUrl, 40, headerY, { width: 60 });
    } catch (error) {
      // Logo não disponível, continuar sem
    }
  }

  // Dados da empresa
  doc.fontSize(14).font("Helvetica-Bold").text(company.name, 110, headerY);
  doc.fontSize(9).font("Helvetica");

  let y = headerY + 20;
  if (company.cnpj) {
    doc.text(`CNPJ: ${company.cnpj}`, 110, y);
    y += 15;
  }
  if (company.address) {
    doc.text(`Endereço: ${company.address}`, 110, y);
    y += 15;
  }
  if (company.phone) {
    doc.text(`Telefone: ${company.phone}`, 110, y);
    y += 15;
  }
  if (company.email) {
    doc.text(`Email: ${company.email}`, 110, y);
  }

  // Linha separadora
  doc.moveTo(40, headerY + 80).lineTo(555, headerY + 80).stroke();
}

/**
 * Desenha tabela de itens do orçamento
 */
function drawItemsTable(
  doc: PDFKit.PDFDocument,
  items: QuotationItem[],
  startY: number
): void {
  const tableTop = startY;
  const col1X = 40;
  const col2X = 280;
  const col3X = 380;
  const col4X = 450;
  const col5X = 520;

  const rowHeight = 25;
  let currentY = tableTop;

  // Cabeçalho da tabela
  doc.fontSize(10).font("Helvetica-Bold");
  doc.fillColor("#0066cc");
  doc.rect(col1X, currentY, 515, rowHeight).fill();

  doc.fillColor("white");
  doc.text("Produto", col1X + 5, currentY + 5, { width: 235 });
  doc.text("Qtd", col2X + 5, currentY + 5, { width: 90 });
  doc.text("Unitário", col3X + 5, currentY + 5, { width: 60 });
  doc.text("Total", col4X + 5, currentY + 5, { width: 60 });

  currentY += rowHeight;

  // Linhas de itens
  doc.fontSize(9).font("Helvetica");
  doc.fillColor("black");

  items.forEach((item, index) => {
    const isEvenRow = index % 2 === 0;

    if (isEvenRow) {
      doc.fillColor("#f5f5f5");
      doc.rect(col1X, currentY, 515, rowHeight).fill();
    }

    doc.fillColor("black");
    const totalPrice = item.totalPrice || item.quantity * item.unitPrice;

    doc.text(item.productName, col1X + 5, currentY + 5, { width: 235 });
    doc.text(item.quantity.toString(), col2X + 5, currentY + 5, { width: 90 });
    doc.text(formatCurrency(item.unitPrice), col3X + 5, currentY + 5, {
      width: 60,
    });
    doc.text(formatCurrency(totalPrice), col4X + 5, currentY + 5, {
      width: 60,
    });

    currentY += rowHeight;
  });

  // Linha final da tabela
  doc.moveTo(col1X, currentY).lineTo(col1X + 515, currentY).stroke();
}

/**
 * Desenha seção de totais
 */
function drawTotals(
  doc: PDFKit.PDFDocument,
  data: QuotationPdfData,
  startY: number
): void {
  const col1X = 380;
  const col2X = 450;
  const rowHeight = 20;
  let currentY = startY;

  doc.fontSize(10).font("Helvetica");

  // Subtotal
  doc.text("Subtotal:", col1X, currentY);
  doc.text(formatCurrency(data.subtotal), col2X, currentY, { align: "right" });
  currentY += rowHeight;

  // Desconto
  if (data.discount && data.discount > 0) {
    doc.text("Desconto:", col1X, currentY);
    doc.text(`-${formatCurrency(data.discount)}`, col2X, currentY, {
      align: "right",
    });
    currentY += rowHeight;
  }

  // Imposto
  if (data.tax && data.tax > 0) {
    doc.text("Imposto:", col1X, currentY);
    doc.text(`+${formatCurrency(data.tax)}`, col2X, currentY, { align: "right" });
    currentY += rowHeight;
  }

  // Linha separadora
  doc.moveTo(col1X, currentY).lineTo(col2X + 80, currentY).stroke();
  currentY += 10;

  // Total
  doc.fontSize(12).font("Helvetica-Bold");
  doc.text("TOTAL:", col1X, currentY);
  doc.text(formatCurrency(data.total), col2X, currentY, { align: "right" });
}

/**
 * Desenha rodapé com dados bancários
 */
function drawFooter(doc: PDFKit.PDFDocument, company: CompanySettings): void {
  const pageHeight = doc.page.height;
  const footerY = pageHeight - 60;

  doc.fontSize(8).font("Helvetica");
  doc.moveTo(40, footerY).lineTo(555, footerY).stroke();

  if (company.bankAccount) {
    doc.text("Dados Bancários:", 40, footerY + 10);
    doc.text(company.bankAccount, 40, footerY + 20, { width: 515 });
  }

  // Data de geração
  doc.text(
    `Gerado em ${new Date().toLocaleString("pt-BR")}`,
    40,
    pageHeight - 20,
    { align: "center" }
  );
}

/**
 * Formata data para formato brasileiro
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/**
 * Formata número como moeda brasileira
 */
function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

/**
 * Valida dados do orçamento
 */
export function validateQuotationData(data: QuotationPdfData): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!data.number || data.number.trim() === "") {
    errors.push("Número do orçamento é obrigatório");
  }

  if (!data.items || data.items.length === 0) {
    errors.push("Orçamento deve ter pelo menos um item");
  }

  if (data.total <= 0) {
    errors.push("Total do orçamento deve ser maior que zero");
  }

  if (!data.company || !data.company.name) {
    errors.push("Dados da empresa são obrigatórios");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Calcula totais do orçamento
 */
export function calculateQuotationTotals(items: QuotationItem[]): {
  subtotal: number;
  itemCount: number;
} {
  const subtotal = items.reduce((sum, item) => {
    const itemTotal = item.quantity * item.unitPrice;
    return sum + itemTotal;
  }, 0);

  return {
    subtotal,
    itemCount: items.length,
  };
}
