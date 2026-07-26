import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { generateProposalExcel, type ProposalExcelInput } from "./proposalExcel";
import { PricingValidationError } from "./services/pricingSafety";

const baseInput: ProposalExcelInput = {
  proposal: {
    id: 7,
    title: "Medicamentos veterinários",
    orgName: "Prefeitura de Exemplo",
    processNumber: "2026/123",
    validityDays: 60,
    paymentTerms: "30 dias",
    deliveryTerms: "10 dias úteis",
    notes: "Entrega parcelada",
    items: [
      // unitPrice (custo interno, valor sentinela) presente de propósito para
      // garantir que NÃO aparece no arquivo exportado.
      { id: 1, sortOrder: 1, productName: "Dipirona 500mg", manufacturer: "LabX", presentation: "CX 10", unit: "CX", quantity: 4, suggestedPrice: 25, unitPrice: 987.65 } as ProposalExcelInput["proposal"]["items"][number] & { unitPrice: number },
      { id: 2, sortOrder: 2, productName: "Soro fisiológico", manufacturer: "LabY", presentation: "500ml", unit: "UN", quantity: 10, suggestedPrice: 3.5 },
    ],
  },
  company: {
    name: "Empresa Exemplo Ltda",
    cnpj: "00.000.000/0001-00",
    email: "comercial@example.com",
    bankName: "Banco X",
    bankAgency: "0001",
    bankAccount: "12345-6",
  },
};

async function loadSheet(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb.getWorksheet("Proposta")!;
}

describe("generateProposalExcel (§11)", () => {
  it("gera um .xlsx com os itens e o total geral pelo preço de venda", async () => {
    const buffer = await generateProposalExcel(baseInput);
    expect(buffer.length).toBeGreaterThan(0);

    const ws = await loadSheet(buffer);
    const textos: string[] = [];
    let totalGeral: number | null = null;
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        if (typeof cell.value === "string") textos.push(cell.value);
      });
      if (row.getCell(7).value === "TOTAL GERAL") totalGeral = Number(row.getCell(8).value);
    });

    // 4 * 25 + 10 * 3,5 = 135
    expect(totalGeral).toBe(135);
    expect(textos.join(" ")).toContain("Dipirona 500mg");
    expect(textos.join(" ")).toContain("Empresa Exemplo Ltda");
  });

  it("nunca expõe custo, margem ou fornecedor de origem", async () => {
    const buffer = await generateProposalExcel(baseInput);
    const ws = await loadSheet(buffer);
    const conteudo: string[] = [];
    ws.eachRow((row) => row.eachCell((cell) => conteudo.push(String(cell.value))));
    const texto = conteudo.join(" ").toLowerCase();
    expect(texto).not.toContain("custo");
    expect(texto).not.toContain("margem");
    expect(texto).not.toContain("fornecedor");
    expect(conteudo.some((c) => c.includes("987.65"))).toBe(false);
  });

  it("bloqueia a exportação quando falta preço de venda", async () => {
    const semPreco: ProposalExcelInput = {
      proposal: { id: 9, items: [{ id: 1, productName: "Sem preço", quantity: 5, suggestedPrice: null }] },
    };
    await expect(generateProposalExcel(semPreco)).rejects.toBeInstanceOf(PricingValidationError);
  });
});
