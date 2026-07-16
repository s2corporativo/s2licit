/**
 * proposalExcel.ts
 *
 * Exportação da proposta comercial em Excel (spec §11).
 *
 * Mesma máscara do PDF oficial (§11): usa SOMENTE o preço de venda
 * (getExplicitSalePrice → suggestedPrice), nunca o custo, a margem ou o
 * fornecedor de origem. A coluna de fabricante substitui o fornecedor.
 */

import ExcelJS from "exceljs";
import {
  assertProposalPricingReady,
  getExplicitSalePrice,
  type ProposalSaleItem,
} from "./services/pricingSafety";

export interface ProposalExcelItem extends ProposalSaleItem {
  sortOrder?: number;
  productName?: string | null;
  manufacturer?: string | null;
  presentation?: string | null;
  unit?: string | null;
  quantity?: number | null;
  suggestedPrice?: string | number | null;
}

export interface ProposalExcelInput {
  proposal: {
    id: number;
    title?: string | null;
    processNumber?: string | null;
    orgName?: string | null;
    validityDays?: number | null;
    paymentTerms?: string | null;
    deliveryTerms?: string | null;
    notes?: string | null;
    items: ProposalExcelItem[];
  };
  company?: {
    name?: string | null;
    cnpj?: string | null;
    email?: string | null;
    phone?: string | null;
    bankName?: string | null;
    bankAgency?: string | null;
    bankAccount?: string | null;
  } | null;
}

const BRL = 'R$ #,##0.00';

/**
 * Gera o arquivo .xlsx da proposta. Lança PricingValidationError se algum item
 * não tiver preço de venda — nunca exporta com preço faltando.
 */
export async function generateProposalExcel(input: ProposalExcelInput): Promise<Buffer> {
  const { proposal, company } = input;
  const itens = [...proposal.items].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  // Bloqueia a exportação se faltar preço de venda em qualquer item.
  assertProposalPricingReady(itens);

  const wb = new ExcelJS.Workbook();
  wb.creator = company?.name ?? "Sistema S2";
  const ws = wb.addWorksheet("Proposta");

  ws.columns = [
    { key: "n", width: 6 },
    { key: "produto", width: 46 },
    { key: "fabricante", width: 22 },
    { key: "apresentacao", width: 20 },
    { key: "unid", width: 10 },
    { key: "qtd", width: 10 },
    { key: "unit", width: 16 },
    { key: "total", width: 16 },
  ];

  // Cabeçalho da empresa e da proposta.
  const titulo = ws.addRow([company?.name ?? "Proposta Comercial"]);
  titulo.font = { bold: true, size: 14 };
  ws.mergeCells(titulo.number, 1, titulo.number, 8);
  if (company?.cnpj) ws.addRow([`CNPJ: ${company.cnpj}`]);
  const contato = [company?.email, company?.phone].filter(Boolean).join(" · ");
  if (contato) ws.addRow([contato]);
  ws.addRow([]);

  ws.addRow([`Proposta nº ${proposal.id}${proposal.title ? ` — ${proposal.title}` : ""}`]).font = { bold: true };
  if (proposal.orgName) ws.addRow([`Órgão/Cliente: ${proposal.orgName}`]);
  if (proposal.processNumber) ws.addRow([`Processo: ${proposal.processNumber}`]);
  if (proposal.validityDays) ws.addRow([`Validade da proposta: ${proposal.validityDays} dias`]);
  ws.addRow([]);

  // Cabeçalho da tabela.
  const head = ws.addRow(["#", "Produto / Descrição", "Fabricante", "Apresentação", "Unid.", "Qtd.", "Valor Unit.", "Total"]);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
    cell.alignment = { vertical: "middle" };
  });

  let totalGeral = 0;
  itens.forEach((item, i) => {
    const salePrice = getExplicitSalePrice(item);
    const qtd = Number(item.quantity) || 0;
    const total = salePrice * qtd;
    totalGeral += total;
    const row = ws.addRow([
      i + 1,
      item.productName ?? "",
      item.manufacturer ?? "",
      item.presentation ?? "",
      item.unit ?? "UN",
      qtd,
      salePrice,
      total,
    ]);
    row.getCell(7).numFmt = BRL;
    row.getCell(8).numFmt = BRL;
  });

  const totalRow = ws.addRow(["", "", "", "", "", "", "TOTAL GERAL", totalGeral]);
  totalRow.font = { bold: true };
  totalRow.getCell(8).numFmt = BRL;

  ws.addRow([]);
  if (proposal.paymentTerms) ws.addRow([`Condições de pagamento: ${proposal.paymentTerms}`]);
  if (proposal.deliveryTerms) ws.addRow([`Prazo/condições de entrega: ${proposal.deliveryTerms}`]);
  if (proposal.notes) ws.addRow([`Observações: ${proposal.notes}`]);

  const dadosBanco = [company?.bankName, company?.bankAgency, company?.bankAccount].filter(Boolean);
  if (dadosBanco.length) {
    ws.addRow([]);
    ws.addRow([`Dados bancários: ${dadosBanco.join(" · ")}`]);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
