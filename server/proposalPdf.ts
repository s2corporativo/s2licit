import PDFDocument from "pdfkit";
import https from "https";
import http from "http";
import { valorPorExtenso } from "./utils/extenso";
import {
  assertProposalPricingReady,
  getExplicitSalePrice,
} from "./services/pricingSafety";

// ─── Types ────────────────────────────────────────────────────────────────────
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

// ─── Company Data Defaults ────────────────────────────────────────────────────
// ATENÇÃO: dados sensíveis (CNPJ, conta bancária) devem ser configurados em
// company_settings no banco, não hardcoded aqui.
// Este objeto serve APENAS como fallback de desenvolvimento/demo.
// Em produção, todos os campos são lidos do banco via getCompanySettings().
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Valida se uma URL é segura para busca pelo servidor (previne SSRF).
 * Bloqueia: IPs privados, localhost, file://, protocolos não-http(s).
 */
function isUrlSafe(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    const hostname = parsed.hostname.toLowerCase();
    // Bloquear localhost e faixas de IP privado (RFC 1918 + link-local)
    if (
      hostname === "localhost" ||
      /^127\./.test(hostname) ||
      /^10\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|31)\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^169\.254\./.test(hostname) ||
      /^::1$/.test(hostname) ||
      /^fd[0-9a-f]{2}:/i.test(hostname)
    ) return false;
    return true;
  } catch {
    return false;
  }
}

function fetchImageBuffer(url: string): Promise<Buffer> {
  if (!isUrlSafe(url)) {
    return Promise.reject(new Error(`URL bloqueada por política de segurança: ${url}`));
  }
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    const req = protocol
      .get(url, { timeout: 10000 }, (res) => {
        // Limitar tamanho da imagem a 5MB para evitar memory exhaustion
        const MAX_SIZE = 5 * 1024 * 1024;
        let totalSize = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          totalSize += chunk.length;
          if (totalSize > MAX_SIZE) {
            req.destroy();
            reject(new Error("Imagem excede o limite de 5MB"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout ao buscar imagem")); });
  });
}

function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : parseFloat(value as string);
  if (isNaN(n)) return String(value);
  return `R$ ${n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// ─── PDF Generator ────────────────────────────────────────────────────────────
export async function generateProposalPdf(
  proposal: Proposal,
  company: CompanySettings | null,
  declarations: DeclarationTemplate[] = []
): Promise<Buffer> {
  // O PDF é uma peça comercial vinculante. Nunca converte custo em venda e
  // nunca usa unitPrice como fallback: cada item precisa de suggestedPrice.
  assertProposalPricingReady(proposal.items);

  return new Promise(async (resolve, reject) => {
    // Identificação da empresa: o banco (company_settings) vence o fallback de
    // env. Antes só o cabeçalho usava o banco; rodapé, assinatura e declarações
    // usavam env (CNPJ vazio), gerando peças vinculantes com dados divergentes.
    const co = { ...S2_COMPANY };
    if (company) {
      for (const k of ["name", "cnpj", "address", "city", "state", "zipCode", "phone", "email", "bankName", "bankAgency", "bankAccount"] as const) {
        const v = (company as any)[k];
        if (typeof v === "string" && v.trim()) (co as any)[k] = v;
      }
    }
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 50, bottom: 70, left: 50, right: 50 },
      info: {
        Title: `Proposta Comercial — ${proposal.title}`,
        Author: co.name,
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - 100; // margins 50+50
    const BLUE = "#1A3F8F";
    const BLACK = "#111827";
    const GRAY = "#6B7280";
    const LIGHT = "#F3F4F6";
    const BORDER = "#E5E7EB";
    const WHITE = "#FFFFFF";

    // ── Helper: draw page footer ─────────────────────────────────────────────
    function drawFooter() {
      const footerY = doc.page.height - 60;
      doc.rect(0, footerY, doc.page.width, 60).fill(BLUE);

      // Left: company name + CNPJ + address
      doc
        .font("Helvetica-Bold")
        .fontSize(7)
        .fillColor(WHITE)
        .text(co.name, 50, footerY + 8, { width: pageWidth / 2 });

      doc
        .font("Helvetica")
        .fontSize(6.5)
        .fillColor("#BFD0F0")
        .text(`CNPJ ${co.cnpj}`, 50, footerY + 18, {
          width: pageWidth / 2,
        });

      doc
        .font("Helvetica")
        .fontSize(6.5)
        .fillColor("#BFD0F0")
        .text(
          `${co.address}, ${co.city} ${co.state} — ${co.zipCode}`,
          50,
          footerY + 28,
          { width: pageWidth / 2 }
        );

      // Right: phone + email + bank
      const rightX = 50 + pageWidth / 2 + 10;
      const rightW = pageWidth / 2 - 10;

      doc
        .font("Helvetica")
        .fontSize(6.5)
        .fillColor(WHITE)
        .text(`Tel/WhatsApp: ${co.phone}`, rightX, footerY + 8, {
          width: rightW,
        });

      doc
        .font("Helvetica")
        .fontSize(6.5)
        .fillColor("#BFD0F0")
        .text(`E-mail: ${co.email}`, rightX, footerY + 18, {
          width: rightW,
        });

      doc
        .font("Helvetica")
        .fontSize(6.5)
        .fillColor("#BFD0F0")
        .text(
          `${co.bankName}  Ag ${co.bankAgency}  CC ${co.bankAccount}`,
          rightX,
          footerY + 28,
          { width: rightW }
        );

      // Bottom center: generation date
      doc
        .font("Helvetica")
        .fontSize(6)
        .fillColor("#BFD0F0")
        .text(`Gerado em ${formatDate(new Date())}`, 50, footerY + 46, {
          width: pageWidth,
          align: "center",
        });
    }

    // ── HEADER ───────────────────────────────────────────────────────────────
    doc.rect(50, 50, 4, 70).fill(BLUE);

    // S2 logo on the right
    let s2LogoLoaded = false;
    try {
      const s2LogoBuffer = await fetchImageBuffer(S2_LOGO_URL);
      doc.image(s2LogoBuffer, 50 + pageWidth - 130, 48, {
        height: 50,
        fit: [130, 50],
      });
      s2LogoLoaded = true;
    } catch {
      // ignore
    }

    // Company logo on the left (if configured)
    let companyLogoLoaded = false;
    if (company?.logoUrl) {
      try {
        const logoBuffer = await fetchImageBuffer(company.logoUrl);
        doc.image(logoBuffer, 60, 50, { height: 50, fit: [110, 50] });
        companyLogoLoaded = true;
      } catch {
        // ignore
      }
    }

    const textStartX = companyLogoLoaded ? 180 : 60;
    const textEndX = s2LogoLoaded ? 50 + pageWidth - 140 : 50 + pageWidth;
    const textWidth = textEndX - textStartX;

    const displayName = company?.name ?? co.name;
    doc
      .font("Helvetica-Bold")
      .fontSize(13)
      .fillColor(BLACK)
      .text(displayName, textStartX, 52, { width: textWidth });

    const cnpj = company?.cnpj ?? co.cnpj;
    const addr = company?.address ?? co.address;
    const city = company?.city ?? co.city;
    const state = company?.state ?? co.state;
    const phone = company?.phone ?? co.phone;
    const email = company?.email ?? co.email;

    const companyDetails: string[] = [];
    if (cnpj) companyDetails.push(`CNPJ: ${cnpj}`);
    if (addr) companyDetails.push(addr);
    if (city || state) companyDetails.push([city, state].filter(Boolean).join(" — "));
    if (phone) companyDetails.push(`Tel: ${phone}`);
    if (email) companyDetails.push(email);

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

    // ── PROPOSAL TITLE BLOCK ─────────────────────────────────────────────────
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

    // ── META INFO ────────────────────────────────────────────────────────────
    let metaY = 184;
    const metaItems: Array<{ label: string; value: string }> = [];

    if (proposal.processNumber)
      metaItems.push({ label: "No do Processo", value: proposal.processNumber });
    if (proposal.orgName)
      metaItems.push({ label: "Orgao Requisitante", value: proposal.orgName });
    metaItems.push({ label: "Data", value: formatDate(proposal.createdAt) });
    if (proposal.validityDays)
      metaItems.push({
        label: "Validade",
        value: `${proposal.validityDays} dias`,
      });

    const colW = pageWidth / Math.min(metaItems.length, 4);
    metaItems.forEach((item, i) => {
      const x = 50 + (i % 4) * colW;
      const y = metaY + Math.floor(i / 4) * 36;
      doc
        .font("Helvetica-Bold")
        .fontSize(7)
        .fillColor(BLUE)
        .text(item.label.toUpperCase(), x, y, { width: colW - 10 });
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(BLACK)
        .text(item.value, x, y + 10, { width: colW - 10 });
    });

    const afterMeta = metaY + Math.ceil(metaItems.length / 4) * 36 + 10;

    // ── ITEMS TABLE ──────────────────────────────────────────────────────────
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor(BLUE)
      .text("ITENS DA PROPOSTA", 50, afterMeta);

    doc
      .moveTo(50, afterMeta + 12)
      .lineTo(50 + pageWidth, afterMeta + 12)
      .strokeColor(BLUE)
      .lineWidth(1)
      .stroke();

    // Column layout (PDF usa somente o preço de venda persistido):
    // [IMG 40] [# 20] [PRODUTO 175] [FABRICANTE 70] [REG.MAPA 55] [QTD 25] [PRECO 55] [TOTAL 80]
    const COL = {
      img:       { x: 50,  w: 40 },
      item:      { x: 94,  w: 20 },
      name:      { x: 118, w: 175 },
      manuf:     { x: 297, w: 70 },
      mapa:      { x: 371, w: 55 },
      qty:       { x: 430, w: 25 },
      price:     { x: 459, w: 55 },
      salePrice: null as { x: number; w: number } | null,
      total:     { x: 518, w: 82 },
    };

    const tableHeaderY = afterMeta + 16;
    doc.rect(50, tableHeaderY, pageWidth, 16).fill(LIGHT);

    doc.font("Helvetica-Bold").fontSize(7).fillColor(GRAY);
    doc.text("#", COL.item.x, tableHeaderY + 5, {
      width: COL.item.w,
      align: "center",
    });
    doc.text("PRODUTO / ESPECIFICACAO", COL.name.x, tableHeaderY + 5, {
      width: COL.name.w,
    });
    doc.text("FABRICANTE", COL.manuf.x, tableHeaderY + 5, {
      width: COL.manuf.w,
    });
    doc.text("REG. MAPA/ANVISA", COL.mapa.x, tableHeaderY + 5, {
      width: COL.mapa.w,
    });
    doc.text("QTD", COL.qty.x, tableHeaderY + 5, {
      width: COL.qty.w,
      align: "center",
    });
    doc.text("PRECO UNIT.", COL.price.x, tableHeaderY + 5, {
      width: COL.price.w,
      align: "right",
    });
    doc.text("TOTAL", COL.total.x, tableHeaderY + 5, {
      width: COL.total.w,
      align: "right",
    });

    let rowY = tableHeaderY + 20;
    let grandTotal = 0;

    const sortedItems = [...proposal.items].sort(
      (a, b) => a.sortOrder - b.sortOrder
    );

    for (let i = 0; i < sortedItems.length; i++) {
      const item = sortedItems[i];
      const salePriceUnit = getExplicitSalePrice(item);
      const rowTotal = salePriceUnit * item.quantity;
      grandTotal += rowTotal;

      const specParts: string[] = [];
      if (item.activeIngredient) specParts.push(item.activeIngredient);
      if (item.concentration) specParts.push(item.concentration);
      if (item.presentation) specParts.push(item.presentation);
      const specText = specParts.join(" - ");

      const hasImage = !!item.imageUrl;
      const hasLink = !!(item as any).productUrl;
      const IMG_SIZE = 44;

      const nameLines = Math.ceil(item.productName.length / 28);
      const specLines = specText ? Math.ceil(specText.length / 28) : 0;
      const notesLines = item.notes ? Math.ceil(item.notes.length / 28) : 0;
      const linkLines = hasLink ? 1 : 0;
      const textHeight = (nameLines + specLines + notesLines + linkLines) * 10 + 12;
      const rowHeight = Math.max(hasImage ? IMG_SIZE + 8 : 0, textHeight);

      // Page break check (leave room for footer 70px)
      if (rowY + rowHeight > doc.page.height - 80) {
        drawFooter();
        doc.addPage();
        rowY = 50;
      }

      // Alternating row background
      if (i % 2 === 0) {
        doc.rect(50, rowY, pageWidth, rowHeight).fill("#FAFAFA");
      }

      // Bottom border
      doc
        .moveTo(50, rowY + rowHeight)
        .lineTo(50 + pageWidth, rowY + rowHeight)
        .strokeColor(BORDER)
        .lineWidth(0.5)
        .stroke();

      // Product image
      if (hasImage && item.imageUrl) {
        try {
          const imgBuf = await fetchImageBuffer(item.imageUrl);
          const imgSize = Math.min(IMG_SIZE, rowHeight - 8);
          doc.image(imgBuf, COL.img.x + 2, rowY + 4, {
            fit: [imgSize, imgSize],
            align: "center",
            valign: "center",
          });
        } catch {
          // draw placeholder box on error
          doc
            .rect(COL.img.x + 2, rowY + 4, 36, 36)
            .strokeColor(BORDER)
            .lineWidth(0.5)
            .stroke();
        }
      }

      const textY = rowY + 6;

      // Item number
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor(GRAY)
        .text(`${i + 1}`, COL.item.x, textY, {
          width: COL.item.w,
          align: "center",
        });

      // Product name
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor(BLACK)
        .text(item.productName, COL.name.x, textY, {
          width: COL.name.w,
          lineBreak: true,
        });

      // Spec line
      if (specText) {
        const specY = textY + nameLines * 10;
        doc
          .font("Helvetica")
          .fontSize(7)
          .fillColor(GRAY)
          .text(specText, COL.name.x, specY, { width: COL.name.w });
      }

      // Notes
      if (item.notes) {
        const notesY = textY + (nameLines + specLines) * 10;
        doc
          .font("Helvetica-Oblique")
          .fontSize(7)
          .fillColor(GRAY)
          .text(item.notes, COL.name.x, notesY, { width: COL.name.w });
      }

      // Product URL (buy link)
      if (hasLink) {
        const linkY = textY + (nameLines + specLines + notesLines) * 10;
        const productUrl = (item as any).productUrl as string;
        doc
          .font("Helvetica")
          .fontSize(6.5)
          .fillColor("#1A3F8F")
          .text(`Comprar: ${productUrl}`, COL.name.x, linkY, {
            width: COL.name.w,
            link: productUrl,
            underline: true,
          });
      }

      // Manufacturer (replaces Supplier)
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(item.manufacturer ? BLACK : GRAY)
        .text(item.manufacturer ?? "—", COL.manuf.x, textY, {
          width: COL.manuf.w,
        });

      // Registro MAPA/ANVISA
      doc
        .font("Helvetica")
        .fontSize(7)
        .fillColor(item.registroMapa ? BLACK : GRAY)
        .text(item.registroMapa ?? "—", COL.mapa.x, textY, {
          width: COL.mapa.w,
        });

      // Quantity
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(BLACK)
        .text(String(item.quantity), COL.qty.x, textY, {
          width: COL.qty.w,
          align: "center",
        });

      // Preço unitário: somente preço de venda explicitamente persistido
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor(BLACK)
        .text(
          formatCurrency(salePriceUnit.toFixed(2)),
          COL.price.x,
          textY,
          { width: COL.price.w, align: "right" }
        );

      // Row total
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor(BLACK)
        .text(
          formatCurrency(rowTotal.toFixed(2)),
          COL.total.x,
          textY,
          { width: COL.total.w, align: "right" }
        );

      rowY += rowHeight;
    }

    // ── TOTALS ────────────────────────────────────────────────────────────────
    rowY += 8;
    if (rowY + 40 > doc.page.height - 80) {
      drawFooter();
      doc.addPage();
      rowY = 50;
    }

    doc.rect(50 + pageWidth - 200, rowY, 200, 28).fill(BLACK);
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(WHITE)
      .text("VALOR TOTAL", 50 + pageWidth - 195, rowY + 6, { width: 90 });
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor(BLUE)
      .text(formatCurrency(grandTotal.toFixed(2)), 50 + pageWidth - 105, rowY + 4, {
        width: 100,
        align: "right",
      });

    // Valor total por extenso — exigido por muitos editais/minutas.
    doc
      .font("Helvetica-Oblique")
      .fontSize(8)
      .fillColor(GRAY)
      .text(`(${valorPorExtenso(grandTotal)})`, 50, rowY + 30, {
        width: pageWidth,
        align: "right",
      });

    rowY += 52;

    // ── CONDITIONS ────────────────────────────────────────────────────────────
    const conditions: Array<{ label: string; value: string }> = [];
    if (proposal.paymentTerms)
      conditions.push({
        label: "Condicoes de Pagamento",
        value: proposal.paymentTerms,
      });
    if (proposal.deliveryTerms)
      conditions.push({ label: "Prazo de Entrega", value: proposal.deliveryTerms });
    if (proposal.validityDays)
      conditions.push({
        label: "Validade da Proposta",
        value: `${proposal.validityDays} dias`,
      });

    if (conditions.length > 0) {
      if (rowY + 20 > doc.page.height - 80) {
        drawFooter();
        doc.addPage();
        rowY = 50;
      }
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor(BLUE)
        .text("CONDICOES COMERCIAIS", 50, rowY);
      rowY += 14;

      conditions.forEach((c) => {
        doc
          .font("Helvetica-Bold")
          .fontSize(8)
          .fillColor(BLACK)
          .text(`${c.label}: `, 50, rowY, { continued: true });
        doc.font("Helvetica").fillColor(GRAY).text(c.value);
        rowY += 12;
      });
      rowY += 6;
    }

    // ── NOTES ─────────────────────────────────────────────────────────────────
    const notesText = proposal.notes ?? company?.defaultNotes;
    if (notesText) {
      if (rowY + 30 > doc.page.height - 80) {
        drawFooter();
        doc.addPage();
        rowY = 50;
      }
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor(BLUE)
        .text("OBSERVACOES", 50, rowY);
      rowY += 12;
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(GRAY)
        .text(notesText, 50, rowY, { width: pageWidth });
      rowY += doc.heightOfString(notesText, { width: pageWidth }) + 10;
    }

    // ── BANK INFO ─────────────────────────────────────────────────────────────
    {
      const bankName = company?.bankName ?? co.bankName;
      const bankAgency = company?.bankAgency ?? co.bankAgency;
      const bankAccount = company?.bankAccount ?? co.bankAccount;
      const pixKey = company?.bankPixKey;

      if (rowY + 30 > doc.page.height - 80) {
        drawFooter();
        doc.addPage();
        rowY = 50;
      }
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor(BLUE)
        .text("DADOS BANCARIOS", 50, rowY);
      rowY += 12;

      const bankParts: string[] = [];
      if (bankName) bankParts.push(`Banco: ${bankName}`);
      if (bankAgency) bankParts.push(`Agencia: ${bankAgency}`);
      if (bankAccount) bankParts.push(`Conta: ${bankAccount}`);
      if (pixKey) bankParts.push(`PIX: ${pixKey}`);

      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(GRAY)
        .text(bankParts.join("   |   "), 50, rowY, { width: pageWidth });
      rowY += 20;
    }

    // ── SIGNATURE LINE ────────────────────────────────────────────────────────
    {
      const sigY = Math.max(rowY + 20, doc.page.height - 150);
      const needsNewPage = sigY + 60 > doc.page.height - 70;
      if (needsNewPage) {
        drawFooter();
        doc.addPage();
        rowY = 50;
      }
      const finalSigY = needsNewPage ? 50 : sigY;

      doc
        .moveTo(50, finalSigY)
        .lineTo(50 + pageWidth / 2 - 20, finalSigY)
        .strokeColor(BORDER)
        .lineWidth(0.5)
        .stroke();

      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(GRAY)
        .text(co.name, 50, finalSigY + 6, {
          width: pageWidth / 2 - 20,
          align: "center",
        });

      doc
        .font("Helvetica")
        .fontSize(7)
        .fillColor(GRAY)
        .text(`CNPJ ${co.cnpj}`, 50, finalSigY + 18, {
          width: pageWidth / 2 - 20,
          align: "center",
        });
    }

    // ── DECLARATIONS ──────────────────────────────────────────────────────────
    if (declarations && declarations.length > 0) {
      for (const decl of declarations) {
        drawFooter();
        doc.addPage();

        // Declaration header bar
        doc.rect(50, 50, pageWidth, 28).fill(BLUE);
        doc
          .font("Helvetica-Bold")
          .fontSize(10)
          .fillColor(WHITE)
          .text("DECLARACAO", 60, 56, { width: pageWidth - 20 });

        // Declaration title
        doc
          .font("Helvetica-Bold")
          .fontSize(12)
          .fillColor(BLACK)
          .text(decl.title, 50, 92, { width: pageWidth });

        // Horizontal rule
        doc
          .moveTo(50, 110)
          .lineTo(50 + pageWidth, 110)
          .strokeColor(BLUE)
          .lineWidth(1)
          .stroke();

        // Declaration content
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor(BLACK)
          .text(decl.content, 50, 122, {
            width: pageWidth,
            lineGap: 4,
            align: "justify",
          });

        // Signature area at bottom of declaration
        const declSigY = doc.page.height - 160;
        doc
          .moveTo(50, declSigY)
          .lineTo(50 + pageWidth / 2 - 20, declSigY)
          .strokeColor(BORDER)
          .lineWidth(0.5)
          .stroke();

        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor(GRAY)
          .text(co.name, 50, declSigY + 6, {
            width: pageWidth / 2 - 20,
            align: "center",
          });
        doc
          .font("Helvetica")
          .fontSize(7)
          .fillColor(GRAY)
          .text(`CNPJ ${co.cnpj}`, 50, declSigY + 18, {
            width: pageWidth / 2 - 20,
            align: "center",
          });

        // City + date on the right
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor(GRAY)
          .text(
            `${co.city}, ${formatDate(new Date())}`,
            50 + pageWidth / 2 + 10,
            declSigY + 6,
            { width: pageWidth / 2 - 10, align: "center" }
          );
      }
    }

    // Draw footer on the last page
    drawFooter();

    doc.end();
  });
}
