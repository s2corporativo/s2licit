import ExcelJS from "exceljs";

/**
 * Leitura de planilhas via ExcelJS (substitui a lib `xlsx`, que tinha
 * CVE de prototype pollution no parsing de arquivos não confiáveis — o
 * caso mais crítico são os anexos de e-mail de cotação).
 *
 * Fornece duas formas equivalentes às usadas anteriormente com
 * `XLSX.utils.sheet_to_json`:
 *  - readSheetAsRows: matriz de linhas (equivale a { header: 1 }).
 *  - readSheetAsObjects: objetos por linha usando a 1ª linha como cabeçalho.
 */

function cellToValue(v: ExcelJS.CellValue): unknown {
  if (v == null) return null;
  if (typeof v === "object") {
    // Fórmulas, rich text, hyperlinks, datas
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

async function loadFirstSheet(buffer: Buffer): Promise<ExcelJS.Worksheet | null> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  return wb.worksheets[0] ?? null;
}

/**
 * Lê a primeira aba como matriz de linhas (array de arrays).
 * Equivalente a XLSX.utils.sheet_to_json(sheet, { header: 1 }).
 * `blankRows: false` remove linhas totalmente vazias.
 */
export async function readSheetAsRows(
  buffer: Buffer,
  opts: { blankRows?: boolean } = {},
): Promise<unknown[][]> {
  const ws = await loadFirstSheet(buffer);
  if (!ws) return [];
  const out: unknown[][] = [];
  const maxCol = ws.columnCount;
  ws.eachRow({ includeEmpty: opts.blankRows ?? false }, (row) => {
    const arr: unknown[] = [];
    for (let c = 1; c <= maxCol; c++) {
      arr.push(cellToValue(row.getCell(c).value));
    }
    // Remove linhas totalmente vazias quando blankRows !== true
    if (opts.blankRows || arr.some((v) => v != null && String(v).trim() !== "")) {
      out.push(arr);
    }
  });
  return out;
}

/**
 * Lê TODAS as abas como matrizes de linhas (uma matriz por aba).
 */
export async function readAllSheetsAsRows(buffer: Buffer): Promise<unknown[][][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  return wb.worksheets.map((ws) => {
    const rows: unknown[][] = [];
    const maxCol = ws.columnCount;
    ws.eachRow({ includeEmpty: false }, (row) => {
      const arr: unknown[] = [];
      for (let c = 1; c <= maxCol; c++) arr.push(cellToValue(row.getCell(c).value));
      if (arr.some((v) => v != null && String(v).trim() !== "")) rows.push(arr);
    });
    return rows;
  });
}

/**
 * Lê a primeira aba como objetos, usando a primeira linha como cabeçalho.
 * Equivalente a XLSX.utils.sheet_to_json(sheet) / { defval }.
 */
export async function readSheetAsObjects(
  buffer: Buffer,
  opts: { defval?: unknown } = {},
): Promise<Record<string, unknown>[]> {
  const rows = await readSheetAsRows(buffer, { blankRows: false });
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => (h == null ? "" : String(h).trim()));
  const defval = "defval" in opts ? opts.defval : null;
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
 * Gera um .xlsx (Buffer) a partir de abas de matrizes de linhas.
 * Substitui XLSX.utils.aoa_to_sheet + book_append_sheet + XLSX.write.
 */
export async function writeSheetsToBuffer(
  sheets: Array<{ name: string; rows: (string | number | null)[][] }>,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name);
    sheet.rows.forEach((r) => ws.addRow(r));
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
