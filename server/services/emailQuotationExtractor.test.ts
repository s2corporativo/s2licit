import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { extractItemsFromSpreadsheet } from "./emailQuotationExtractor";

function makeSheet(rows: (string | number)[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Cotacao");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

describe("extractItemsFromSpreadsheet", () => {
  it("extrai itens com cabeçalho padrão (item/descrição/quantidade/unidade)", () => {
    const buffer = makeSheet([
      ["Pedido de Cotação - Prefeitura X"],
      ["Item", "Descrição", "Quantidade", "Unidade"],
      [1, "Amoxicilina 500mg comprimido", 100, "CX"],
      [2, "Seringa descartável 10ml", 500, "UN"],
    ]);

    const items = extractItemsFromSpreadsheet(buffer);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      numeroItem: 1,
      descricao: "Amoxicilina 500mg comprimido",
      quantidade: 100,
      unidade: "CX",
    });
    expect(items[1].descricao).toBe("Seringa descartável 10ml");
  });

  it("reconhece coluna de código de catálogo (CATMAS)", () => {
    const buffer = makeSheet([
      ["Descrição", "CATMAS", "Qtd"],
      ["Dipirona 500mg", "001234567", 200],
    ]);

    const items = extractItemsFromSpreadsheet(buffer);
    expect(items).toHaveLength(1);
    expect(items[0].codigoCatalogo).toBe("001234567");
    expect(items[0].quantidade).toBe(200);
  });

  it("normaliza cabeçalhos com acento e maiúsculas", () => {
    const buffer = makeSheet([
      ["DESCRIÇÃO", "QTDE"],
      ["Álcool 70%", 30],
    ]);

    const items = extractItemsFromSpreadsheet(buffer);
    expect(items).toHaveLength(1);
    expect(items[0].descricao).toBe("Álcool 70%");
    expect(items[0].quantidade).toBe(30);
  });

  it("interpreta quantidade no formato brasileiro (1.000,50)", () => {
    const buffer = makeSheet([
      ["Descrição", "Quantidade"],
      ["Luva cirúrgica", "1.000,50"],
    ]);

    const items = extractItemsFromSpreadsheet(buffer);
    expect(items[0].quantidade).toBeCloseTo(1000.5);
  });

  it("ignora planilha sem coluna de descrição reconhecível", () => {
    const buffer = makeSheet([
      ["Coluna A", "Coluna B"],
      ["x", "y"],
    ]);
    expect(extractItemsFromSpreadsheet(buffer)).toHaveLength(0);
  });

  it("descarta linhas sem descrição significativa", () => {
    const buffer = makeSheet([
      ["Item", "Descrição", "Qtd"],
      [1, "Gaze estéril", 50],
      [2, "", 10],
      [3, "  ", 5],
    ]);
    const items = extractItemsFromSpreadsheet(buffer);
    expect(items).toHaveLength(1);
    expect(items[0].descricao).toBe("Gaze estéril");
  });
});
