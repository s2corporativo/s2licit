import type ExcelJS from "exceljs";
import { cellToText } from "@shared/cellText";

/**
 * Leitura de planilhas no cliente via ExcelJS (substitui a lib `xlsx`,
 * que tinha CVE de prototype pollution).
 *
 * O ExcelJS é carregado sob demanda (dynamic import) para não pesar no
 * bundle inicial — só é baixado quando o usuário importa uma planilha.
 */

function cellToValue(v: ExcelJS.CellValue): unknown {
  if (v == null) return null;
  if (typeof v === "object") {
    const anyV = v as any;
    if (anyV.result !== undefined) return anyV.result;
    if (anyV.text !== undefined) return anyV.text;
    if (anyV.hyperlink !== undefined) return anyV.hyperlink ?? anyV.text ?? null;
    if (anyV.richText) return anyV.richText.map((t: any) => t.text).join("");
    if (v instanceof Date) return v;
    return String(v);
  }
  return v;
}

async function firstSheet(buffer: ArrayBuffer): Promise<ExcelJS.Worksheet | null> {
  const { default: ExcelJSlib } = await import("exceljs");
  const wb = new ExcelJSlib.Workbook();
  await wb.xlsx.load(buffer);
  return wb.worksheets[0] ?? null;
}

/** Lê a primeira aba como matriz de linhas (equivale a { header: 1 }). */
export async function readRows(buffer: ArrayBuffer): Promise<unknown[][]> {
  const ws = await firstSheet(buffer);
  if (!ws) return [];
  const out: unknown[][] = [];
  const maxCol = ws.columnCount;
  ws.eachRow({ includeEmpty: false }, (row) => {
    const arr: unknown[] = [];
    for (let c = 1; c <= maxCol; c++) arr.push(cellToValue(row.getCell(c).value));
    if (arr.some((v) => v != null && String(v).trim() !== "")) out.push(arr);
  });
  return out;
}

/** Lê a primeira aba como objetos, usando a 1ª linha como cabeçalho. */
export async function readObjects(
  buffer: ArrayBuffer,
  opts: { defval?: unknown } = {},
): Promise<Record<string, unknown>[]> {
  const rows = await readRows(buffer);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => (h == null ? "" : String(h).trim()));
  const defval = "defval" in opts ? opts.defval : "";
  const out: Record<string, unknown>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      if (!h) return;
      const v = rows[i][idx];
      obj[h] = v == null || v === "" ? defval : v;
    });
    out.push(obj);
  }
  return out;
}

/**
 * Lê a primeira aba como objetos com todos os valores em texto.
 *
 * Os fluxos de importação enviam as colunas como texto; sem esta conversão,
 * células numéricas (preço, EAN) e de data chegariam ao servidor com o tipo
 * original e seriam rejeitadas na validação.
 */
export async function readTextObjects(buffer: ArrayBuffer): Promise<Record<string, string>[]> {
  const rows = await readObjects(buffer, { defval: "" });
  return rows.map((row) => {
    const texto: Record<string, string> = {};
    for (const [header, value] of Object.entries(row)) texto[header] = cellToText(value);
    return texto;
  });
}
