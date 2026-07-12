/**
 * Importa o "Compêndio Organizado Por Lab" (XLSX) para a tabela `products`.
 *
 * Layout do arquivo (aba BASE_MESTRE_COMPLETA e abas por laboratório):
 *   ID_PRODUTO | NOME_COMERCIAL | COMPOSICAO | APRESENTACAO | LABORATORIO |
 *   EAN | NCM | MELHOR_CUSTO_XML | LANCE_MINIMO_VIAVEL_R$ |
 *   PROPOSTA_TECNICA_CONSOLIDADA | IMG_URL
 *
 * Decisões (baseadas na auditoria do arquivo):
 *  - Escopo padrão: só produtos IDENTIFICADOS (LABORATORIO != "NÃO IDENTIFICADO").
 *    Os ~4.721 "NÃO IDENTIFICADO" ficam de fora por padrão (esparsos, baixa
 *    qualidade). Use --incluir-nao-identificados para trazê-los marcados como
 *    'pendente_revisao'.
 *  - Preço NÃO é importado: MELHOR_CUSTO_XML é majoritariamente placeholder
 *    (R$ 29,07 em milhares de linhas) e envenenaria a precificação. O preço
 *    real vem das NF-e/XML. Use --com-preco para importar mesmo assim (ainda
 *    descartando o placeholder 29.07 e valores <= 0).
 *  - Deduplica por nome normalizado (mantém a 1ª ocorrência) e por
 *    (supplierId, name) via INSERT IGNORE no banco.
 *
 * Uso:
 *   node scripts/import-compendio-xlsx.mjs /caminho/Compendio.xlsx \
 *     [--supplier "Catálogo de Referência"] [--sheet BASE_MESTRE_COMPLETA] \
 *     [--incluir-nao-identificados] [--com-preco] [--dry-run]
 *
 * --dry-run NÃO acessa o banco: só lê, mapeia e mostra o resumo (para conferir
 * o arquivo antes de importar de verdade).
 */

import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import ExcelJS from "exceljs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const xlsxPath = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const incluirNaoIdent = args.includes("--incluir-nao-identificados");
const comPreco = args.includes("--com-preco");
const getArg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : fallback;
};
const supplierName = getArg("--supplier", "Catálogo de Referência");
const sheetName = getArg("--sheet", "BASE_MESTRE_COMPLETA");

const NAO_IDENT = "NÃO IDENTIFICADO";
const PRICE_PLACEHOLDER = 29.07; // valor placeholder dominante no arquivo

if (!xlsxPath) {
  console.error(
    "Uso: node scripts/import-compendio-xlsx.mjs /caminho/arquivo.xlsx [--supplier NOME] [--sheet NOME] [--incluir-nao-identificados] [--com-preco] [--dry-run]",
  );
  process.exit(1);
}

function cellVal(v) {
  if (v == null) return null;
  if (typeof v === "object") {
    if (v.result !== undefined) return v.result;
    if (v.text !== undefined) return v.text;
    if (v.richText) return v.richText.map((t) => t.text).join("");
    if (v.hyperlink) return v.hyperlink;
    if (v instanceof Date) return v;
    return String(v);
  }
  return v;
}

function str(v, max) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return max ? s.slice(0, max) : s;
}

function toNumber(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const cleaned = String(v)
    .replace(/[^0-9.,-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/** Normaliza nome para deduplicação (sem acento, minúsculo, espaços colapsados). */
function normName(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function lerLinhas(ws) {
  const matrix = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const arr = [];
    for (let c = 1; c <= ws.columnCount; c++) arr.push(cellVal(row.getCell(c).value));
    matrix.push(arr);
  });
  const headers = (matrix[0] ?? []).map((h) => (h == null ? "" : String(h).trim()));
  return matrix.slice(1).map((r) => {
    const o = {};
    headers.forEach((h, i) => {
      if (h) o[h] = r[i] ?? null;
    });
    return o;
  });
}

/** Converte uma linha do arquivo num objeto de produto (ou null se descartada). */
function mapearProduto(r, supplierId) {
  const name = str(r["NOME_COMERCIAL"], 512);
  if (!name) return null;

  const laboratorio = str(r["LABORATORIO"], 256);
  const identificado = laboratorio && laboratorio.toUpperCase() !== NAO_IDENT;

  if (!identificado && !incluirNaoIdent) return null;

  // Preço: só se --com-preco, e ainda descartando placeholder e <= 0.
  let price = null;
  if (comPreco) {
    const custo = toNumber(r["MELHOR_CUSTO_XML"]);
    if (custo != null && custo > 0 && Math.abs(custo - PRICE_PLACEHOLDER) > 0.001) {
      price = String(custo);
    }
  }

  const proposta = str(r["PROPOSTA_TECNICA_CONSOLIDADA"]);

  return {
    supplierId,
    name,
    code: str(r["ID_PRODUTO"], 128),
    activeIngredient: str(r["COMPOSICAO"], 512),
    presentation: str(r["APRESENTACAO"], 256),
    manufacturer: identificado ? laboratorio : null,
    laboratorio: identificado ? laboratorio : null,
    ncm: str(r["NCM"], 16),
    ean: str(r["EAN"], 64),
    informacaoTecnica: proposta,
    fichaTecnica: proposta,
    imageUrl: str(r["IMG_URL"]),
    price,
    tipoCatalogo: "medicamento_veterinario",
    statusConfiabilidade: identificado ? "parcial" : "pendente_revisao",
  };
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readFileSync(xlsxPath));
  const ws = wb.getWorksheet(sheetName) ?? wb.worksheets[0];
  if (!ws) {
    console.error(`Aba "${sheetName}" não encontrada.`);
    process.exit(1);
  }
  const rows = lerLinhas(ws);
  console.log(`Lidas ${rows.length} linhas da aba "${ws.name}".`);

  // Mapeia + deduplica por nome normalizado (mantém a 1ª ocorrência).
  const vistos = new Set();
  const produtos = [];
  let semNome = 0,
    descartados = 0,
    dupNoArquivo = 0;
  for (const r of rows) {
    const p = mapearProduto(r, 0); // supplierId real é definido depois
    if (!str(r["NOME_COMERCIAL"], 512)) {
      semNome++;
      continue;
    }
    if (!p) {
      descartados++;
      continue;
    }
    const chave = normName(p.name);
    if (vistos.has(chave)) {
      dupNoArquivo++;
      continue;
    }
    vistos.add(chave);
    produtos.push(p);
  }

  console.log("─".repeat(52));
  console.log(`Escopo: ${incluirNaoIdent ? "identificados + não-identificados" : "somente identificados"}`);
  console.log(`Preço: ${comPreco ? "importado (sem placeholder 29,07)" : "NÃO importado"}`);
  console.log(`Produtos a inserir (deduplicados): ${produtos.length}`);
  console.log(`  Sem nome (pulados): ${semNome}`);
  console.log(`  Fora do escopo (não-identificados): ${descartados}`);
  console.log(`  Duplicados no arquivo (colapsados): ${dupNoArquivo}`);
  const comImg = produtos.filter((p) => p.imageUrl).length;
  const comNcm = produtos.filter((p) => p.ncm).length;
  const comPrecoN = produtos.filter((p) => p.price).length;
  console.log(`  Com imagem: ${comImg} · com NCM: ${comNcm} · com preço: ${comPrecoN}`);
  console.log("─".repeat(52));

  if (dryRun) {
    console.log("[dry-run] Nenhuma escrita no banco. Amostra dos 3 primeiros:");
    produtos.slice(0, 3).forEach((p, i) =>
      console.log(`  ${i + 1}. ${p.name} | ${p.laboratorio ?? "—"} | NCM ${p.ncm ?? "—"}`),
    );
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não definido no .env — necessário para importar (ou use --dry-run).");
    process.exit(1);
  }

  const { createConnection } = await import("mysql2/promise");
  const { config } = await import("dotenv");
  config({ path: resolve(__dirname, "../.env") });

  const conn = await createConnection(process.env.DATABASE_URL);
  try {
    let supplierId;
    const [existing] = await conn.execute("SELECT id FROM suppliers WHERE name = ? LIMIT 1", [supplierName]);
    if (existing.length > 0) {
      supplierId = existing[0].id;
    } else {
      const [res] = await conn.execute("INSERT INTO suppliers (name) VALUES (?)", [supplierName]);
      supplierId = res.insertId;
      console.log(`Fornecedor "${supplierName}" criado (id ${supplierId}).`);
    }

    let inserted = 0,
      skipped = 0;
    for (const p of produtos) {
      const [res] = await conn.execute(
        `INSERT IGNORE INTO products
           (supplierId, name, code, activeIngredient, presentation, manufacturer, laboratorio,
            ncm, ean, informacaoTecnica, fichaTecnica, imageUrl, price, tipoCatalogo, statusConfiabilidade)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          supplierId,
          p.name,
          p.code,
          p.activeIngredient,
          p.presentation,
          p.manufacturer,
          p.laboratorio,
          p.ncm,
          p.ean,
          p.informacaoTecnica,
          p.fichaTecnica,
          p.imageUrl,
          p.price,
          p.tipoCatalogo,
          p.statusConfiabilidade,
        ],
      );
      if (res.affectedRows > 0) inserted++;
      else skipped++;
    }

    console.log("─".repeat(52));
    console.log(`Inseridos: ${inserted}`);
    console.log(`Ignorados (já existiam por nome): ${skipped}`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("Falha na importação:", err.message);
  process.exit(1);
});
