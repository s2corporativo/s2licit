import PDFDocument from "pdfkit";

export interface QuotationItemForPdf {
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  supplier?: string;
}

export interface QuotationDataForPdf {
  id: number;
  number: string;
  date: Date;
  validUntil?: Date;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  items: QuotationItemForPdf[];
  subtotal: number;
  discount?: number;
  tax?: number;
  total: number;
  notes?: string;
  companyName?: string;
  companyLogo?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
}

/**
 * Gera PDF de orçamento usando pdfkit
 */
export async function generateQuotationPdf(data: QuotationDataForPdf): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 40,
      });

      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      doc.on("end", () => {
        resolve(Buffer.concat(chunks));
      });

      doc.on("error", reject);

      // Cabeçalho
      drawHeader(doc, data);

      // Informações do cliente
      doc.moveDown(0.5);
      drawClientInfo(doc, data);

      // Tabela de itens
      doc.moveDown(1);
      drawItemsTable(doc, data);

      // Totais
      doc.moveDown(1);
      drawTotals(doc, data);

      // Notas
      if (data.notes) {
        doc.moveDown(1);
        drawNotes(doc, data);
      }

      // Rodapé
      doc.moveDown(1);
      drawFooter(doc, data);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Desenha cabeçalho do PDF
 */
function drawHeader(doc: any, data: QuotationDataForPdf): void {
  // Logo e nome da empresa
  if (data.companyLogo) {
    try {
      doc.image(data.companyLogo, 40, 40, { width: 80 });
    } catch {
      // Se logo falhar, continua sem
    }
  }

  doc.fontSize(18).font("Helvetica-Bold").text(data.companyName || "Orçamento", 130, 50);

  doc.fontSize(10).font("Helvetica").fillColor("#666666");
  if (data.companyAddress) {
    doc.text(data.companyAddress, 130, 75);
  }
  if (data.companyPhone) {
    doc.text(`Tel: ${data.companyPhone}`, 130, 90);
  }
  if (data.companyEmail) {
    doc.text(`Email: ${data.companyEmail}`, 130, 105);
  }

  // Número e data do orçamento
  doc.fontSize(11).font("Helvetica-Bold").fillColor("#000000");
  doc.text(`Orçamento #${data.number}`, 400, 50);

  doc.fontSize(9).font("Helvetica").fillColor("#666666");
  doc.text(`Data: ${formatDate(data.date)}`, 400, 70);
  if (data.validUntil) {
    doc.text(`Válido até: ${formatDate(data.validUntil)}`, 400, 85);
  }

  // Linha separadora
  doc.moveTo(40, 130).lineTo(555, 130).stroke("#cccccc");
}

/**
 * Desenha informações do cliente
 */
function drawClientInfo(doc: any, data: QuotationDataForPdf): void {
  doc.fontSize(11).font("Helvetica-Bold").fillColor("#000000").text("CLIENTE");

  doc.fontSize(9).font("Helvetica").fillColor("#333333");
  if (data.clientName) {
    doc.text(`Nome: ${data.clientName}`);
  }
  if (data.clientEmail) {
    doc.text(`Email: ${data.clientEmail}`);
  }
  if (data.clientPhone) {
    doc.text(`Telefone: ${data.clientPhone}`);
  }
}

/**
 * Desenha tabela de itens
 */
function drawItemsTable(doc: any, data: QuotationDataForPdf): void {
  const tableTop = doc.y;
  const col1X = 40;
  const col2X = 300;
  const col3X = 400;
  const col4X = 480;
  const rowHeight = 25;

  // Cabeçalho da tabela
  doc.fontSize(10).font("Helvetica-Bold").fillColor("#ffffff");
  doc.rect(col1X, tableTop, 555 - col1X, rowHeight).fill("#003366");

  doc.fillColor("#ffffff").text("Produto", col1X + 5, tableTop + 5);
  doc.text("Qtd", col2X + 5, tableTop + 5);
  doc.text("Preço Unit.", col3X + 5, tableTop + 5);
  doc.text("Total", col4X + 5, tableTop + 5);

  // Itens
  let yPosition = tableTop + rowHeight;
  doc.fontSize(9).font("Helvetica").fillColor("#000000");

  data.items.forEach((item, index) => {
    const bgColor = index % 2 === 0 ? "#f9f9f9" : "#ffffff";
    doc.rect(col1X, yPosition, 555 - col1X, rowHeight).fill(bgColor);

    doc.fillColor("#000000");
    doc.text(item.productName, col1X + 5, yPosition + 5, { width: 250 });
    doc.text(item.quantity.toString(), col2X + 5, yPosition + 5);
    doc.text(`R$ ${formatCurrency(item.unitPrice)}`, col3X + 5, yPosition + 5);
    doc.text(`R$ ${formatCurrency(item.totalPrice)}`, col4X + 5, yPosition + 5);

    yPosition += rowHeight;
  });

  // Linha final da tabela
  doc.moveTo(col1X, yPosition).lineTo(555, yPosition).stroke("#cccccc");
}

/**
 * Desenha totais
 */
function drawTotals(doc: any, data: QuotationDataForPdf): void {
  const rightX = 480;
  const labelX = 400;

  doc.fontSize(10).font("Helvetica");

  // Subtotal
  doc.fillColor("#666666").text("Subtotal:", labelX, doc.y);
  doc.fillColor("#000000").text(`R$ ${formatCurrency(data.subtotal)}`, rightX, doc.y - 15);

  // Desconto
  if (data.discount && data.discount > 0) {
    doc.moveDown(0.3);
    doc.fillColor("#666666").text("Desconto:", labelX, doc.y);
    doc.fillColor("#d9534f").text(`-R$ ${formatCurrency(data.discount)}`, rightX, doc.y - 15);
  }

  // Imposto
  if (data.tax && data.tax > 0) {
    doc.moveDown(0.3);
    doc.fillColor("#666666").text("Impostos:", labelX, doc.y);
    doc.fillColor("#000000").text(`R$ ${formatCurrency(data.tax)}`, rightX, doc.y - 15);
  }

  // Total
  doc.moveDown(0.5);
  doc.rect(labelX - 10, doc.y - 5, 165, 25).fill("#003366");
  doc.fontSize(12).font("Helvetica-Bold").fillColor("#ffffff");
  doc.text("TOTAL:", labelX, doc.y);
  doc.text(`R$ ${formatCurrency(data.total)}`, rightX, doc.y - 15);
}

/**
 * Desenha notas
 */
function drawNotes(doc: any, data: QuotationDataForPdf): void {
  doc.fontSize(10).font("Helvetica-Bold").fillColor("#000000").text("Observações:");
  doc.fontSize(9).font("Helvetica").fillColor("#333333");
  doc.text(data.notes || "", { width: 515 });
}

/**
 * Desenha rodapé
 */
function drawFooter(doc: any, data: QuotationDataForPdf): void {
  const pageHeight = doc.page.height;
  const footerY = pageHeight - 50;

  doc.moveTo(40, footerY).lineTo(555, footerY).stroke("#cccccc");

  doc.fontSize(8).font("Helvetica").fillColor("#999999");
  doc.text(
    `Orçamento gerado em ${new Date().toLocaleString("pt-BR")}`,
    40,
    footerY + 10,
    { align: "center", width: 515 }
  );
  doc.text(`${data.companyName || "Sistema de Orçamentos"}`, 40, footerY + 20, {
    align: "center",
    width: 515,
  });
}

/**
 * Formata data para string
 */
function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("pt-BR");
}

/**
 * Formata número como moeda
 */
function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Calcula totais do orçamento
 */
export function calculateQuotationTotals(items: QuotationItemForPdf[]): {
  subtotal: number;
  total: number;
} {
  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  return {
    subtotal,
    total: subtotal,
  };
}

/**
 * Valida dados do orçamento
 */
export function validateQuotationData(data: QuotationDataForPdf): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!data.number) {
    errors.push("Número do orçamento é obrigatório");
  }

  if (!data.items || data.items.length === 0) {
    errors.push("Orçamento deve conter pelo menos um item");
  }

  if (data.total <= 0) {
    errors.push("Total do orçamento deve ser maior que zero");
  }

  data.items.forEach((item, index) => {
    if (!item.productName) {
      errors.push(`Item ${index + 1}: Nome do produto é obrigatório`);
    }
    if (item.quantity <= 0) {
      errors.push(`Item ${index + 1}: Quantidade deve ser maior que zero`);
    }
    if (item.unitPrice < 0) {
      errors.push(`Item ${index + 1}: Preço unitário não pode ser negativo`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}
