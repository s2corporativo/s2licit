import * as XLSX from "xlsx";
import { extractTextFromBinaryDocument } from "./intelligentCaptureIngestionService";
import { invokeLLM } from "../_core/llm";

/**
 * Extração de itens de cotação a partir de anexos de e-mail.
 *
 * - Planilhas (XLSX/CSV): extração estruturada e determinística por cabeçalho.
 * - PDF/DOCX/texto do corpo: extração assistida por IA (invokeLLM), com
 *   fallback vazio se a IA não estiver configurada.
 */

export interface ExtractedItem {
  numeroItem?: number;
  descricao: string;
  quantidade?: number;
  unidade?: string;
  codigoCatalogo?: string;
}

// Sinônimos de cabeçalho de coluna (normalizados: minúsculo, sem acento).
const HEADER_ALIASES: Record<keyof ExtractedItem, string[]> = {
  numeroItem: ["item", "no", "num", "numero"],
  descricao: ["descricao", "produto", "especificacao", "material", "objeto", "discriminacao"],
  quantidade: ["quantidade", "qtd", "qtde", "quant"],
  unidade: ["unidade", "und", "un", "unid", "medida"],
  codigoCatalogo: ["catmas", "catmat", "codigo", "cod", "codigocatalogo"],
};

function normalizeHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Classifica um cabeçalho de coluna. Usa correspondência por token (palavra
 * inteira) e escolhe o campo cujo alias correspondente é o mais específico
 * (mais longo) — evita que aliases curtos capturem colunas erradas
 * (ex.: "Código do item" → codigoCatalogo, não numeroItem).
 */
function matchColumn(header: string): keyof ExtractedItem | null {
  const n = normalizeHeader(header);
  const tokens = n.split(/[^a-z0-9]+/).filter(Boolean);
  let best: { field: keyof ExtractedItem; len: number } | null = null;

  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [keyof ExtractedItem, string[]][]) {
    for (const alias of aliases) {
      const hit = n === alias || tokens.includes(alias);
      if (hit && (!best || alias.length > best.len)) {
        best = { field, len: alias.length };
      }
    }
  }
  return best?.field ?? null;
}

function parseNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/\./g, "").replace(",", ".").replace(/[^0-9.]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? undefined : n;
}

/**
 * Extrai itens de uma planilha (XLSX/CSV). Detecta a linha de cabeçalho
 * procurando uma linha que contenha a coluna de descrição.
 */
export function extractItemsFromSpreadsheet(buffer: Buffer): ExtractedItem[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const items: ExtractedItem[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
    if (rows.length === 0) continue;

    // Localiza a linha de cabeçalho: a primeira com uma coluna de "descrição".
    let headerRowIdx = -1;
    let columnMap: Record<number, keyof ExtractedItem> = {};
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const map: Record<number, keyof ExtractedItem> = {};
      rows[i].forEach((cell, colIdx) => {
        if (typeof cell === "string") {
          const field = matchColumn(cell);
          if (field) map[colIdx] = field;
        }
      });
      if (Object.values(map).includes("descricao")) {
        headerRowIdx = i;
        columnMap = map;
        break;
      }
    }
    if (headerRowIdx === -1) continue;

    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      const item: Partial<ExtractedItem> = {};
      for (const [colIdxStr, field] of Object.entries(columnMap)) {
        const colIdx = Number(colIdxStr);
        const raw = row[colIdx];
        if (raw == null || raw === "") continue;
        if (field === "quantidade") item.quantidade = parseNumber(raw);
        else if (field === "numeroItem") item.numeroItem = parseNumber(raw);
        else item[field] = String(raw).trim() as any;
      }
      // Só considera itens com descrição não trivial.
      if (item.descricao && item.descricao.length >= 3) {
        items.push(item as ExtractedItem);
      }
    }
  }

  return items;
}

const LLM_EXTRACTION_SCHEMA = {
  name: "extracao_itens_cotacao",
  schema: {
    type: "object",
    properties: {
      itens: {
        type: "array",
        items: {
          type: "object",
          properties: {
            numeroItem: { type: "number" },
            descricao: { type: "string" },
            quantidade: { type: "number" },
            unidade: { type: "string" },
            codigoCatalogo: { type: "string" },
          },
          required: ["descricao"],
        },
      },
    },
    required: ["itens"],
  },
};

/**
 * Extrai itens de um texto livre (corpo do e-mail ou PDF/DOCX) usando IA.
 * Retorna [] se a IA não estiver configurada — o operador ainda pode
 * cadastrar itens manualmente na revisão.
 */
export async function extractItemsFromText(text: string): Promise<ExtractedItem[]> {
  const trimmed = text.trim();
  if (trimmed.length < 20) return [];

  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "Você extrai itens de pedidos de cotação de órgãos públicos brasileiros. " +
            "Retorne apenas os itens de produtos/materiais solicitados, com descrição, " +
            "quantidade, unidade e código de catálogo (CATMAS/CATMAT) quando houver. " +
            "Ignore cabeçalhos, rodapés, condições e texto administrativo.",
        },
        {
          role: "user",
          content: `Extraia os itens deste pedido de cotação:\n\n${trimmed.slice(0, 12000)}`,
        },
      ],
      outputSchema: LLM_EXTRACTION_SCHEMA,
    });

    const content = result.choices?.[0]?.message?.content;
    const raw = typeof content === "string" ? content : "";
    const parsed = JSON.parse(raw);
    const itens = Array.isArray(parsed?.itens) ? parsed.itens : [];
    return itens
      .filter((i: any) => typeof i?.descricao === "string" && i.descricao.trim().length >= 3)
      .map((i: any) => ({
        numeroItem: typeof i.numeroItem === "number" ? i.numeroItem : undefined,
        descricao: String(i.descricao).trim(),
        quantidade: typeof i.quantidade === "number" ? i.quantidade : undefined,
        unidade: typeof i.unidade === "string" ? i.unidade : undefined,
        codigoCatalogo: typeof i.codigoCatalogo === "string" ? i.codigoCatalogo : undefined,
      }));
  } catch (err) {
    console.warn("[EmailQuotation] Extração por IA indisponível ou falhou:", (err as Error).message);
    return [];
  }
}

/**
 * Extrai itens de um anexo genérico (planilha estruturada, ou PDF/DOCX via IA).
 */
export async function extractItemsFromAttachment(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<{ items: ExtractedItem[]; sourceType: "spreadsheet" | "pdf" | "docx" }> {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".csv") ||
      mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType === "text/csv") {
    return { items: extractItemsFromSpreadsheet(buffer), sourceType: "spreadsheet" };
  }

  const text = await extractTextFromBinaryDocument(buffer, filename, mimeType);
  const items = await extractItemsFromText(text);
  const sourceType = lower.endsWith(".docx") ? "docx" : "pdf";
  return { items, sourceType };
}
