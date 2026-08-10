import PDFDocument from "pdfkit";
import { valorPorExtenso } from "./utils/extenso";
import { formatDate, formatCurrency } from "./utils/formatting";
import {
  assertProposalPricingReady,
  getExplicitSalePrice,
} from "./services/pricingSafety";
import { fetchRemoteImageBuffer } from "./services/safeRemoteImageService";

interface CompanySettings {
  name: string | null;
  cnpj: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logoUrl: string | null;
  bankName: string | null;
  bankAgency: string | null;
  bankAccount: string | null;
  bankPixKey: string | null;
  defaultNotes: string | null;
}

interface ProposalItem {
  id: number;
  sortOrder: number;
  productName: string;
  activeIngredient: string | null;
  manufacturer: string | null;
  concentration: string | null;
  presentation: string | null;
  unit: string | null;
  supplierName: string | null;
  unitPrice: string | null;
  suggestedPrice?: string | null;
  quantity: number;
  notes: string | null;
  imageUrl?: string | null;
  productUrl?: string | null;
  registroMapa?: string | null;
}

interface Proposal {
  id: number;
  title: string;
  processNumber: string | null;
  orgName: string | null;
  status: string;
  validityDays: number | null;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  notes: string | null;
  createdAt: Date;
  items: ProposalItem[];
}

export interface DeclarationTemplate {
  id: number;
  title: string;
  content: string;
}

const S2_COMPANY = {
  name: process.env.COMPANY_NAME ?? "Configure em Configurações da Empresa",
  cnpj: process.env.COMPANY_CNPJ ?? "",
  address: process.env.COMPANY_ADDRESS ?? "",
  city: process.env.COMPANY_CITY ?? "",
  state: process.env.COMPANY_STATE ?? "",
  zipCode: process.env.COMPANY_ZIP ?? "",
  phone: process.env.COMPANY_PHONE ?? "",
  email: process.env.COMPANY_EMAIL ?? "",
  bankName: process.env.COMPANY_BANK_NAME ?? "",
  bankAgency: process.env.COMPANY_BANK_AGENCY ?? "",
  bankAccount: process.env.COMPANY_BANK_ACCOUNT ?? "",
};

const S2_LOGO_URL = process.env.COMPANY_LOGO_URL ?? "";

function configured(value: string | null | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

export async function generateProposalPdf(
  proposal: Proposal,
  company: CompanySettings | null,
  declarations: DeclarationTemplate[] = [],
): Promise<Buffer> {
  assertProposalPricingReady(proposal.items);

  const co = {
    name: configured(company?.name, S2_COMPANY.name),
    cnpj: configured(company?.cnpj, S2_COMPANY.cnpj),
    address: configured(company?.address, S2_COMPANY.address),
    city: configured(company?.city, S2_COMPANY.city),
    state: configured(company?.state, S2_COMPANY.state),
    zipCode: configured(company?.zipCode, S2_COMPANY.zipCode),
    phone: configured(company?.phone, S2_COMPANY.phone),
    email: configured(company?.email, S2_COMPANY.email),
    bankName: configured(company?.bankName, S2_COMPANY.bankName),
    bankAgency: configured(company?.bankAgency, S2_COMPANY.bankAgency),
    bankAccount: configured(company?.bankAccount, S2_COMPANY.bankAccount),
  };

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 50, bottom: 70, left: 50, right: 50 },
    info: {
      Title: `Proposta Comercial — ${proposal.title}`,
      Author: co.name,
    },
  });

  const chunks: Buffer[] = [];
  const completion = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  try {
    const pageWidth = doc.page.width - 100;
    const BLUE = "#1A3F8F";
    const BLACK = "#111827";
    const GRAY = "#6B7280";
    const LIGHT = "#F3F4F6";
    const BORDER = "#E5E7EB";
    const WHITE = "#FFFFFF";

    function drawFooter() {
      const footerY = doc.page.height - 60;
      doc.rect(0, footerY, doc.page.width, 60).fill(BLUE);

      doc
        .font("Helvetica-Bold")
        .fontSize(7)
        .fillColor(WHITE)
        .text(co.name, 50, footerY + 8, { width: pageWidth / 2 });

      doc
        .font("Helvetica")
        .fontSize(6.5)
        .fillColor("#BFD0F0")
        .text(`CNPJ ${co.cnpj}`, 50, footerY + 18, { width: pageWidth / 2 });

      doc
        .font("Helvetica")
        .fontSize(6.5)
        .fillColor("#BFD0F0")
        .text(`${co.address}, ${co.city} ${co.state} — ${co.zipCode}`, 50, footerY + 28, {
          width: pageWidth / 2,
        });

      const rightX = 50 + pageWidth / 2 + 10;
      const rightW = pageWidth / 2 - 10;

      doc
        .font("Helvetica")
        .fontSize(6.5)
        .fillColor(WHITE)
        .text(`Tel/WhatsApp: ${co.phone}`, rightX, footerY + 8, { width: rightW });

      doc
        .font("Helvetica")
        .fontSize(6.5)
        .fillColor("#BFD0F0")
        .text(`E-mail: ${co.email}`, rightX, footerY + 18, { width: rightW });

      doc
        .font("Helvetica")
        .fontSize(6.5)
        .fillColor("#BFD0F0")
        .text(`${co.bankName}  Ag ${co.bankAgency}  CC ${co.bankAccount}`, rightX, footerY + 28, {
          width: rightW,
        });

      doc
        .font("Helvetica")
        .fontSize(6)
        .fillColor("#BFD0F0")
        .text(`Gerado em ${formatDate(new Date())}`, 50, footerY + 46, {
          width: pageWidth,
          align: "center",
        });
    }

    doc.rect(50, 50, 4, 70).fill(BLUE);

    let s2LogoLoaded = false;
    if (S2_LOGO_URL) {
      try {
        const s2LogoBuffer = await fetchRemoteImageBuffer(S2_LOGO_URL);
        doc.image(s2LogoBuffer, 50 + pageWidth - 130, 48, {
          height: 50,
          fit: [130, 50],
        });
        s2LogoLoaded = true;
      } catch {
        s2LogoLoaded = false;
      }
    }

    let companyLogoLoaded = false;
    if (company?.logoUrl) {
      try {
        const logoBuffer = await fetchRemoteImageBuffer(company.logoUrl);
        doc.image(logoBuffer, 60, 50, { height: 50, fit: [110, 50] });
        companyLogoLoaded = true;
      } catch {
        companyLogoLoaded = false;
      }
    }

    const textStartX = companyLogoLoaded ? 180 : 60;
    const textEndX = s2LogoLoaded ? 50 + pageWidth - 140 : 50 + pageWidth;
    const textWidth = textEndX - textStartX;

    doc
      .font("Helvetica-Bold")
      .fontSize(13)
      .fillColor(BLACK)
      .text(co.name, textStartX, 52, { width: textWidth });

    const companyDetails: string[] = [];
    if (co.cnpj) companyDetails.push(`CNPJ: ${co.cnpj}`);
    if (co.address) companyDetails.push(co.address);
    if (co.city || co.state) companyDetails.push([co.city, co.state].filter(Boolean).join(" — "));
    if (co.phone) companyDetails.push(`Tel: ${co.phone}`);
    if (co.email) companyDetails.push(co.email);

    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(GRAY)
      .text(companyDetails.join("  |  "), textStartX, 70, { width: textWidth });

    doc
      .moveTo(50, 126)
      .lineTo(50 + pageWidth, 126)
      .strokeColor(BLUE)
      .lineWidth(1.5)
      .stroke();

    doc.rect(50, 126, pageWidth, 46).fill(BLACK);
    doc
      .font("Helvetica-Bold")
      .fontSize(13)
      .fillColor(WHITE)
      .text("PROPOSTA COMERCIAL", 60, 132, { width: pageWidth - 20 });
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#D1D5DB")
      .text(proposal.title, 60, 149, { width: pageWidth - 20 });

    const metaY = 184;
    const metaItems: Array<{ label: string; value: string }> = [];
    if (proposal.processNumber) metaItems.push({ label: "No do Processo", value: proposal.processNumber });
    if (proposal.orgName) metaItems.push({ label: "Orgao Requisitante", value: proposal.orgName });
    metaItems.push({ label: "Data", value: formatDate(proposal.createdAt) });
    if (proposal.validityDays) metaItems.push({ label: "Validade", value: `${proposal.validityDays} dias` });

    const colW = pageWidth / Math.min(metaItems.length, 4);
    metaItems.forEach((item, index) => {
      const x = 50 + (index % 4) * colW;
      const y = metaY + Math.floor(index / 4) * 36;
      doc.font("Helvetica-Bold").fontSize(7).fillColor(BLUE).text(item.label.toUpperCase(), x, y, {
        width: colW - 10,
      });
      doc.font("Helvetica").fontSize(9).fillColor(BLACK).text(item.value, x, y + 10, {
        width: colW - 10,
      });
    });

    const afterMeta = metaY + Math.ceil(metaItems.length / 4) * 36 + 10;
    doc.font("Helvetica-Bold").fontSize(8).fillColor(BLUE).text("ITENS DA PROPOSTA", 50, afterMeta);
    doc
      .moveTo(50, afterMeta + 12)
      .lineTo(50 + pageWidth, afterMeta + 12)
      .strokeColor(BLUE)
      .lineWidth(1)
      .stroke();

    const COL = {
      img: { x: 50, w: 40 },
      item: { x: 94, w: 20 },
      name: { x: 118, w: 175 },
      manuf: { x: 297, w: 70 },
      mapa: { x: 371, w: 55 },
      qty: { x: 430, w: 25 },
      price: { x: 459, w: 55 },
      total: { x: 518, w: 82 },
    };

    const tableHeaderY = afterMeta + 16;
    doc.rect(50, tableHeaderY, pageWidth, 16).fill(LIGHT);
    doc.font("Helvetica-Bold").fontSize(7).fillColor(GRAY);
    doc.text("#", COL.item.x, tableHeaderY + 5, { width: COL.item.w, align: "center" });
    doc.text("PRODUTO / ESPECIFICACAO", COL.name.x, tableHeaderY + 5, { width: COL.name.w });
    doc.text("FABRICANTE", COL.manuf.x, tableHeaderY + 5, { width: COL.manuf.w });
    doc.text("REG. MAPA/ANVISA", COL.mapa.x, tableHeaderY + 5, { width: COL.mapa.w });
    doc.text("QTD", COL.qty.x, tableHeaderY + 5, { width: COL.qty.w, align: "center" });
    doc.text("PRECO UNIT.", COL.price.x, tableHeaderY + 5, { width: COL.price.w, align: "right" });
    doc.text("TOTAL", COL.total.x, tableHeaderY + 5, { width: COL.total.w, align: "right" });

    let rowY = tableHeaderY + 20;
    let grandTotal = 0;
    const sortedItems = [...proposal.items].sort((a, b) => a.sortOrder - b.sortOrder);

    for (let index = 0; index < sortedItems.length; index += 1) {
      const item = sortedItems[index];
      const salePriceUnit = getExplicitSalePrice(item);
      const rowTotal = salePriceUnit * item.quantity;
      grandTotal += rowTotal;

      const specParts: string[] = [];
      if (item.activeIngredient) specParts.push(item.activeIngredient);
      if (item.concentration) specParts.push(item.concentration);
      if (item.presentation) specParts.push(item.presentation);
      const specText = specParts.join(" - ");

      const hasImage = Boolean(item.imageUrl);
      const hasLink = Boolean(item.productUrl);
      const imageSize = 44;
      const nameLines = Math.ceil(item.productName.length / 28);
      const specLines = specText ? Math.ceil(specText.length / 28) : 0;
      const notesLines = item.notes ? Math.ceil(item.notes.length / 28) : 0;
      const linkLines = hasLink ? 1 : 0;
      const textHeight = (nameLines + specLines + notesLines + linkLines) * 10 + 12;
      const rowHeight = Math.max(hasImage ? imageSize + 8 : 0, textHeight);

      if (rowY + rowHeight > doc.page.height - 80) {
        drawFooter();
        doc.addPage();
        rowY = 50;
      }

      if (index % 2 === 0) doc.rect(50, rowY, pageWidth, rowHeight).fill("#FAFAFA");
      doc
        .moveTo(50, rowY + rowHeight)
        .lineTo(50 + pageWidth, rowY + rowHeight)
        .strokeColor(BORDER)
        .lineWidth(0.5)
        .stroke();

      if (item.imageUrl) {
        try {
          const imageBuffer = await fetchRemoteImageBuffer(item.imageUrl);
          const size = Math.min(imageSize, rowHeight - 8);
          doc.image(imageBuffer, COL.img.x + 2, rowY + 4, {
            fit: [size, size],
            align: "center",
            valign: "center",
          });
        } catch {
          doc.rect(COL.img.x + 2, rowY + 4, 36, 36).strokeColor(BORDER).lineWidth(0.5).stroke();
        }
      }

      const textY = rowY + 6;
      doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY).text(`${index + 1}`, COL.item.x, textY, {
        width: COL.item.w,
        align: "center",
      });
      doc.font("Helvetica-Bold").fontSize(8).fillColor(BLACK).text(item.productName, COL.name.x, textY, {
        width: COL.name.w,
        lineBreak: true,
      });

      if (specText) {
        const specY = textY + nameLines * 10;
        doc.font("Helvetica").fontSize(7).fillColor(GRAY).text(specText, COL.name.x, specY, {
          width: COL.name.w,
        });
      }

      if (item.notes) {
        const notesY = textY + (nameLines + specLines) * 10;
        doc.font("Helvetica-Oblique").fontSize(7).fillColor(GRAY).text(item.notes, COL.name.x, notesY, {
          width: COL.name.w,
        });
      }

      if (item.productUrl) {
        const linkY = textY + (nameLines + specLines + notesLines) * 10;
        doc.font("Helvetica").fontSize(6.5).fillColor(BLUE).text(`Comprar: ${item.productUrl}`, COL.name.x, linkY, {
          width: COL.name.w,
          link: item.productUrl,
          underline: true,
        });
      }

      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(item.manufacturer ? BLACK : GRAY)
        .text(item.manufacturer ?? "—", COL.manuf.x, textY, { width: COL.manuf.w });
      doc
        .font("Helvetica")
        .fontSize(7)
        .fillColor(item.registroMapa ? BLACK : GRAY)
        .text(item.registroMapa ?? "—", COL.mapa.x, textY, { width: COL.mapa.w });
      doc.font("Helvetica").fontSize(8).fillColor(BLACK).text(String(item.quantity), COL.qty.x, textY, {
        width: COL.qty.w,
        align: "center",
      });
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor(BLACK)
        .text(formatCurrency(salePriceUnit.toFixed(2)), COL.price.x, textY, {
          width: COL.price.w,
          align: "right",
        });
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor(BLACK)
        .text(formatCurrency(rowTotal.toFixed(2)), COL.total.x, textY, {
          width: COL.total.w,
          align: "right",
        });

      rowY += rowHeight;
    }

    rowY += 8;
    if (rowY + 40 > doc.page.height - 80) {
      drawFooter();
      doc.addPage();
      rowY = 50;
    }

    doc.rect(50 + pageWidth - 200, rowY, 200, 28).fill(BLACK);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(WHITE).text("VALOR TOTAL", 50 + pageWidth - 195, rowY + 6, {
      width: 90,
    });
    doc.font("Helvetica-Bold").fontSize(12).fillColor(BLUE).text(
      formatCurrency(grandTotal.toFixed(2)),
      50 + pageWidth - 105,
      rowY + 4,
      { width: 100, align: "right" },
    );
    doc.font("Helvetica-Oblique").fontSize(8).fillColor(GRAY).text(`(${valorPorExtenso(grandTotal)})`, 50, rowY + 30, {
      width: pageWidth,
      align: "right",
    });

    rowY += 52;
    const conditions: Array<{ label: string; value: string }> = [];
    if (proposal.paymentTerms) conditions.push({ label: "Condicoes de Pagamento", value: proposal.paymentTerms });
    if (proposal.deliveryTerms) conditions.push({ label: "Prazo de Entrega", value: proposal.deliveryTerms });
    if (proposal.validityDays) conditions.push({ label: "Validade da Proposta", value: `${proposal.validityDays} dias` });

    if (conditions.length > 0) {
      if (rowY + 20 > doc.page.height - 80) {
        drawFooter();
        doc.addPage();
        rowY = 50;
      }
      doc.font("Helvetica-Bold").fontSize(8).fillColor(BLUE).text("CONDICOES COMERCIAIS", 50, rowY);
      rowY += 14;
      conditions.forEach((condition) => {
        doc.font("Helvetica-Bold").fontSize(8).fillColor(BLACK).text(`${condition.label}: `, 50, rowY, {
          continued: true,
        });
        doc.font("Helvetica").fillColor(GRAY).text(condition.value);
        rowY += 12;
      });
      rowY += 6;
    }

    const notesText = proposal.notes ?? company?.defaultNotes;
    if (notesText) {
      if (rowY + 30 > doc.page.height - 80) {
        drawFooter();
        doc.addPage();
        rowY = 50;
      }
      doc.font("Helvetica-Bold").fontSize(8).fillColor(BLUE).text("OBSERVACOES", 50, rowY);
      rowY += 12;
      doc.font("Helvetica").fontSize(8).fillColor(GRAY).text(notesText, 50, rowY, { width: pageWidth });
      rowY += doc.heightOfString(notesText, { width: pageWidth }) + 10;
    }

    {
      const pixKey = company?.bankPixKey;
      if (rowY + 30 > doc.page.height - 80) {
        drawFooter();
        doc.addPage();
        rowY = 50;
      }
      doc.font("Helvetica-Bold").fontSize(8).fillColor(BLUE).text("DADOS BANCARIOS", 50, rowY);
      rowY += 12;

      const bankParts: string[] = [];
      if (co.bankName) bankParts.push(`Banco: ${co.bankName}`);
      if (co.bankAgency) bankParts.push(`Agencia: ${co.bankAgency}`);
      if (co.bankAccount) bankParts.push(`Conta: ${co.bankAccount}`);
      if (pixKey) bankParts.push(`PIX: ${pixKey}`);
      doc.font("Helvetica").fontSize(8).fillColor(GRAY).text(bankParts.join("   |   "), 50, rowY, {
        width: pageWidth,
      });
      rowY += 20;
    }

    {
      const signatureY = Math.max(rowY + 20, doc.page.height - 150);
      const needsNewPage = signatureY + 60 > doc.page.height - 70;
      if (needsNewPage) {
        drawFooter();
        doc.addPage();
        rowY = 50;
      }
      const finalSignatureY = needsNewPage ? 50 : signatureY;
      doc
        .moveTo(50, finalSignatureY)
        .lineTo(50 + pageWidth / 2 - 20, finalSignatureY)
        .strokeColor(BORDER)
        .lineWidth(0.5)
        .stroke();
      doc.font("Helvetica").fontSize(8).fillColor(GRAY).text(co.name, 50, finalSignatureY + 6, {
        width: pageWidth / 2 - 20,
        align: "center",
      });
      doc.font("Helvetica").fontSize(7).fillColor(GRAY).text(`CNPJ ${co.cnpj}`, 50, finalSignatureY + 18, {
        width: pageWidth / 2 - 20,
        align: "center",
      });
    }

    for (const declaration of declarations) {
      drawFooter();
      doc.addPage();
      doc.rect(50, 50, pageWidth, 28).fill(BLUE);
      doc.font("Helvetica-Bold").fontSize(10).fillColor(WHITE).text("DECLARACAO", 60, 56, {
        width: pageWidth - 20,
      });
      doc.font("Helvetica-Bold").fontSize(12).fillColor(BLACK).text(declaration.title, 50, 92, {
        width: pageWidth,
      });
      doc.moveTo(50, 110).lineTo(50 + pageWidth, 110).strokeColor(BLUE).lineWidth(1).stroke();
      doc.font("Helvetica").fontSize(9).fillColor(BLACK).text(declaration.content, 50, 122, {
        width: pageWidth,
        lineGap: 4,
        align: "justify",
      });

      const declarationSignatureY = doc.page.height - 160;
      doc
        .moveTo(50, declarationSignatureY)
        .lineTo(50 + pageWidth / 2 - 20, declarationSignatureY)
        .strokeColor(BORDER)
        .lineWidth(0.5)
        .stroke();
      doc.font("Helvetica").fontSize(8).fillColor(GRAY).text(co.name, 50, declarationSignatureY + 6, {
        width: pageWidth / 2 - 20,
        align: "center",
      });
      doc.font("Helvetica").fontSize(7).fillColor(GRAY).text(`CNPJ ${co.cnpj}`, 50, declarationSignatureY + 18, {
        width: pageWidth / 2 - 20,
        align: "center",
      });
      doc.font("Helvetica").fontSize(8).fillColor(GRAY).text(
        `${co.city}, ${formatDate(new Date())}`,
        50 + pageWidth / 2 + 10,
        declarationSignatureY + 6,
        { width: pageWidth / 2 - 10, align: "center" },
      );
    }

    drawFooter();
    doc.end();
  } catch (error) {
    // O executor async não fica escondido dentro de new Promise: qualquer
    // falha inesperada chega ao caller e nunca deixa a requisição pendurada.
    doc.end();
    throw error;
  }

  return completion;
}
