import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { extractItemsFromSpreadsheet } from "./emailQuotationExtractor";

async function makeSheet(rows: (string | number)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Cotacao");
  rows.forEach((r) => ws.addRow(r));
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

describe("extractItemsFromSpreadsheet", () => {
  it("extrai itens com cabeçalho padrão (item/descrição/quantidade/unidade)", async () => {
    const buffer = await makeSheet([
      ["Pedido de Cotação - Prefeitura X"],
      ["Item", "Descrição", "Quantidade", "Unidade"],
      [1, "Amoxicilina 500mg comprimido", 100, "CX"],
      [2, "Seringa descartável 10ml", 500, "UN"],
    ]);

    const items = await extractItemsFromSpreadsheet(buffer);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      numeroItem: 1,
      descricao: "Amoxicilina 500mg comprimido",
      quantidade: 100,
      unidade: "CX",
    });
    expect(items[1].descricao).toBe("Seringa descartável 10ml");
  });

  it("reconhece coluna de código de catálogo (CATMAS)", async () => {
    const buffer = await makeSheet([
      ["Descrição", "CATMAS", "Qtd"],
      ["Dipirona 500mg", "001234567", 200],
    ]);

    const items = await extractItemsFromSpreadsheet(buffer);
    expect(items).toHaveLength(1);
    expect(items[0].codigoCatalogo).toBe("001234567");
    expect(items[0].quantidade).toBe(200);
  });

  it("normaliza cabeçalhos com acento e maiúsculas", async () => {
    const buffer = await makeSheet([
      ["DESCRIÇÃO", "QTDE"],
      ["Álcool 70%", 30],
    ]);

    const items = await extractItemsFromSpreadsheet(buffer);
    expect(items).toHaveLength(1);
    expect(items[0].descricao).toBe("Álcool 70%");
    expect(items[0].quantidade).toBe(30);
  });

  it("interpreta quantidade no formato brasileiro (1.000,50)", async () => {
    const buffer = await makeSheet([
      ["Descrição", "Quantidade"],
      ["Luva cirúrgica", "1.000,50"],
    ]);

    const items = await extractItemsFromSpreadsheet(buffer);
    expect(items[0].quantidade).toBeCloseTo(1000.5);
  });

  it("ignora planilha sem coluna de descrição reconhecível", async () => {
    const buffer = await makeSheet([
      ["Coluna A", "Coluna B"],
      ["x", "y"],
    ]);
    expect(await extractItemsFromSpreadsheet(buffer)).toHaveLength(0);
  });

  it("descarta linhas sem descrição significativa", async () => {
    const buffer = await makeSheet([
      ["Item", "Descrição", "Qtd"],
      [1, "Gaze estéril", 50],
      [2, "", 10],
      [3, "  ", 5],
    ]);
    const items = await extractItemsFromSpreadsheet(buffer);
    expect(items).toHaveLength(1);
    expect(items[0].descricao).toBe("Gaze estéril");
  });
});
