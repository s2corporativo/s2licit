import PDFDocument from "pdfkit";
import { asc, eq } from "drizzle-orm";
import { proposalDeclarations } from "../../drizzle/schema";
import { getCompanySettings, getDb, getProposalWithItems } from "../db";
import { generateProposalPdf } from "../proposalPdf";
import { buildQuotationResponse } from "./emailQuotationResponseService";

export type ComposedDocument = {
  filename: string;
  mimeType: "application/pdf";
  base64: string;
  sourceType: "proposal" | "quotation" | "declarations";
  sourceId: number;
};

async function pdfToBase64(build: (doc: PDFKit.PDFDocument) => void): Promise<string> {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  build(doc);
  doc.end();
  return (await completed).toString("base64");
}

/**
 * Fonte canônica de geração documental. Rotas antigas podem continuar chamando
 * seus serviços durante a migração, mas novos fluxos devem entrar por aqui.
 */
export async function composeProposalDocument(proposalId: number): Promise<ComposedDocument> {
  const proposal = await getProposalWithItems(proposalId);
  if (!proposal) throw new Error("Proposta não encontrada.");
  const company = await getCompanySettings();
  const buffer = await generateProposalPdf(proposal as any, company as any);
  return { filename: `proposta-${proposalId}.pdf`, mimeType: "application/pdf", base64: buffer.toString("base64"), sourceType: "proposal", sourceId: proposalId };
}

export async function composeQuotationDocument(quotationId: number, options?: { marginPercent?: number; validDays?: number }): Promise<ComposedDocument> {
  const result = await buildQuotationResponse(quotationId, options);
  return { filename: `cotacao-${quotationId}.pdf`, mimeType: "application/pdf", base64: result.pdfBase64, sourceType: "quotation", sourceId: quotationId };
}

export async function composeDeclarationsDocument(proposalId: number): Promise<ComposedDocument> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível.");
  const proposal = await getProposalWithItems(proposalId);
  if (!proposal) throw new Error("Proposta não encontrada.");
  const company = await getCompanySettings();
  const declarations = await db.select().from(proposalDeclarations).where(eq(proposalDeclarations.proposalId, proposalId)).orderBy(asc(proposalDeclarations.sortOrder));
  if (!declarations.length) throw new Error("A proposta não possui declarações salvas.");

  const base64 = await pdfToBase64((doc) => {
    doc.fontSize(14).font("Helvetica-Bold").text(company?.name || "Empresa", { align: "center" });
    if (company?.cnpj) doc.fontSize(9).font("Helvetica").text(`CNPJ ${company.cnpj}`, { align: "center" });
    doc.moveDown(1.5);
    doc.fontSize(11).font("Helvetica-Bold").text(`Processo: ${proposal.processNumber || "não informado"}`);
    doc.fontSize(10).font("Helvetica").text(`Órgão: ${proposal.orgName || "não informado"}`);
    doc.moveDown();
    declarations.forEach((declaration, index) => {
      if (index > 0) doc.addPage();
      doc.fontSize(13).font("Helvetica-Bold").text(declaration.title, { align: "center" });
      doc.moveDown();
      doc.fontSize(10).font("Helvetica").text(declaration.content, { align: "justify", lineGap: 3 });
    });
  });

  return { filename: `declaracoes-proposta-${proposalId}.pdf`, mimeType: "application/pdf", base64, sourceType: "declarations", sourceId: proposalId };
}
