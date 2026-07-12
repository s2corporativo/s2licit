/**
 * exportExcel.ts
 * Geração de planilha Excel para exportação e template de atualização em massa.
 */
import { readSheetAsObjects, writeSheetsToBuffer } from "./utils/spreadsheet";
import { getDb } from "./db";
import { products, categories, suppliers } from "../drizzle/schema";
import { eq, and, like, or, isNull, asc } from "drizzle-orm";

// ─── Cabeçalhos da planilha ────────────────────────────────────────────────────
export const PRODUCT_EXCEL_HEADERS = [
  { key: "id",                  label: "ID (não editar)",          width: 14 },
  { key: "code",                label: "Código",                   width: 18 },
  { key: "name",                label: "Nome do Produto",          width: 50 },
  { key: "activeIngredient",    label: "Princípio Ativo",          width: 35 },
  { key: "concentration",       label: "Concentração",             width: 20 },
  { key: "presentation",        label: "Apresentação",             width: 25 },
  { key: "pharmaceuticalForm",  label: "Forma Farmacêutica",       width: 22 },
  { key: "manufacturer",        label: "Fabricante/Laboratório",   width: 30 },
  { key: "laboratorio",         label: "Laboratório",              width: 30 },
  { key: "unit",                label: "Unidade",                  width: 12 },
  { key: "price",               label: "Preço (R$)",               width: 14 },
  { key: "barcode",             label: "Código de Barras",         width: 20 },
  { key: "gtin",                label: "GTIN/EAN",                 width: 18 },
  { key: "ean",                 label: "EAN",                      width: 18 },
  { key: "mapa",                label: "Registro MAPA/ANVISA",     width: 24 },
  { key: "ncm",                 label: "NCM",                      width: 14 },
  { key: "categoryName",        label: "Categoria",                width: 30 },
  { key: "subcategoria",        label: "Subcategoria",             width: 30 },
  { key: "classeTerapeutica",   label: "Classe Terapêutica",       width: 28 },
  { key: "especieAnimal",       label: "Espécie Animal",           width: 22 },
  { key: "registroRegulatorio", label: "Registro Regulatório",     width: 22 },
  { key: "supplierName",        label: "Fornecedor",               width: 30 },
  { key: "codigoFornecedor",    label: "Código Fornecedor",        width: 20 },
  { key: "imageUrl",            label: "URL Imagem",               width: 50 },
  { key: "productUrl",          label: "URL Produto",              width: 50 },
  { key: "description",         label: "Descrição",                width: 60 },
  { key: "stock",               label: "Estoque",                  width: 14 },
  { key: "isActive",            label: "Ativo (yes/no)",           width: 14 },
];

// ─── Filtros de exportação ─────────────────────────────────────────────────────
export interface ExportFilters {
  supplierId?: number;
  categoryId?: number;
  isActive?: "yes" | "no" | "all";
  withoutFichaTecnica?: boolean;
  withoutCategory?: boolean;
  search?: string;
  limit?: number; // máximo de linhas (padrão: sem limite)
}

// ─── Exportar catálogo em Excel ────────────────────────────────────────────────
export async function exportProductsToExcel(filters: ExportFilters = {}): Promise<Buffer> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");

  // Construir condições de filtro
  const conditions: ReturnType<typeof eq>[] = [];

  if (filters.isActive && filters.isActive !== "all") {
    conditions.push(eq(products.isActive, filters.isActive));
  } else if (!filters.isActive) {
    // Padrão: apenas ativos
    conditions.push(eq(products.isActive, "yes"));
  }

  if (filters.supplierId) {
    conditions.push(eq(products.supplierId, filters.supplierId));
  }

  if (filters.categoryId) {
    conditions.push(eq(products.categoryId, filters.categoryId));
  }

  if (filters.withoutCategory) {
    conditions.push(isNull(products.categoryId));
  }

  if (filters.withoutFichaTecnica) {
    conditions.push(isNull(products.fichaTecnica));
  }

  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(
      or(
        like(products.name, term),
        like(products.activeIngredient, term),
        like(products.manufacturer, term),
        like(products.code, term),
        like(products.barcode, term),
        like(products.gtin, term)
      ) as any
    );
  }

  // Buscar produtos com join em categorias e fornecedores
  let query = db
    .select({
      id: products.id,
      code: products.code,
      name: products.name,
      activeIngredient: products.activeIngredient,
      concentration: products.concentration,
      presentation: products.presentation,
      pharmaceuticalForm: products.pharmaceuticalForm,
      manufacturer: products.manufacturer,
      laboratorio: products.laboratorio,
      unit: products.unit,
      price: products.price,
      barcode: products.barcode,
      gtin: products.gtin,
      ean: products.ean,
      mapa: products.mapa,
      ncm: products.ncm,
      categoryId: products.categoryId,
      categoryName: categories.name,
      subcategoria: products.subcategoria,
      classeTerapeutica: products.classeTerapeutica,
      especieAnimal: products.especieAnimal,
      registroRegulatorio: products.registroRegulatorio,
      supplierId: products.supplierId,
      supplierName: suppliers.name,
      codigoFornecedor: products.codigoFornecedor,
      imageUrl: products.imageUrl,
      productUrl: products.productUrl,
      description: products.description,
      stock: products.stock,
      isActive: products.isActive,
    })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(suppliers, eq(suppliers.id, products.supplierId))
    .orderBy(asc(products.name)) as any;

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  if (filters.limit && filters.limit > 0) {
    query = query.limit(filters.limit);
  }

  const rows = await query;

  // Montar dados da planilha
  const headers = PRODUCT_EXCEL_HEADERS.map(h => h.label);
  const data: (string | number | null)[][] = [headers];

  for (const row of rows) {
    data.push(
      PRODUCT_EXCEL_HEADERS.map(h => {
        const val = (row as any)[h.key];
        if (val === null || val === undefined) return "";
        return val;
      })
    );
  }

  // Aba de instruções
  const instrucoes = [
    ["INSTRUÇÕES DE USO - ATUALIZAÇÃO EM MASSA DE PRODUTOS"],
    [""],
    ["1. NÃO altere a coluna 'ID (não editar)' - ela é usada para identificar o produto"],
    ["2. Preencha ou altere os campos desejados nas linhas dos produtos"],
    ["3. Deixe em branco os campos que não deseja alterar (eles serão mantidos como estão)"],
    ["4. Para desativar um produto, coloque 'no' na coluna 'Ativo (yes/no)'"],
    ["5. Para reativar, coloque 'yes'"],
    ["6. O campo 'Categoria' deve conter o NOME EXATO da categoria existente no sistema"],
    ["7. O campo 'Fornecedor' deve conter o NOME EXATO do fornecedor existente no sistema"],
    ["8. Salve o arquivo como .xlsx e importe na página Produtos > Atualizar por Excel"],
    [""],
    ["CAMPOS OBRIGATÓRIOS: ID (não editar), Nome do Produto"],
    [""],
    ["CAMPOS DE IDENTIFICAÇÃO PARA CORRESPONDÊNCIA:"],
    ["  - ID: identificador único interno (preferencial)"],
    ["  - Código: código interno do produto"],
    ["  - GTIN/EAN ou EAN: código de barras internacional"],
    [""],
    ["DICA: Para exportar apenas produtos sem ficha técnica ou sem categoria,"],
    ["use os filtros na página Produtos antes de exportar."],
  ];

  return writeSheetsToBuffer([
    { name: "Produtos", rows: data },
    { name: "Instruções", rows: instrucoes },
  ]);
}

// ─── Processar importação Excel para atualização em massa ──────────────────────
export interface UpdateResult {
  updated: number;
  skipped: number;
  errors: number;
  notFound: number;
  details: Array<{ row: number; id?: number; name?: string; status: "updated" | "skipped" | "error" | "not_found"; message?: string }>;
}

export async function importProductsFromExcel(buffer: Buffer): Promise<UpdateResult> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");

  // A aba "Produtos" é a primeira do template exportado.
  const rawData = (await readSheetAsObjects(buffer, { defval: null })) as Record<
    string,
    string | number | null
  >[];

  if (rawData.length === 0) throw new Error("Planilha vazia ou sem dados");

  // Mapear cabeçalhos da planilha para chaves internas
  const headerMap: Record<string, string> = {};
  for (const h of PRODUCT_EXCEL_HEADERS) {
    headerMap[h.label] = h.key;
  }

  // Carregar categorias e fornecedores para resolução de nomes
  const [allCategories, allSuppliers] = await Promise.all([
    db.select({ id: categories.id, name: categories.name }).from(categories),
    db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers),
  ]);

  const catByName = new Map(allCategories.map(c => [c.name.trim().toLowerCase(), c.id]));
  const supByName = new Map(allSuppliers.map(s => [s.name.trim().toLowerCase(), s.id]));

  const result: UpdateResult = { updated: 0, skipped: 0, errors: 0, notFound: 0, details: [] };

  // Processar em lotes de 100 para não sobrecarregar o banco
  const BATCH = 100;
  for (let i = 0; i < rawData.length; i += BATCH) {
    const batch = rawData.slice(i, i + BATCH);

    for (let j = 0; j < batch.length; j++) {
      const rowNum = i + j + 2; // +2 porque linha 1 é cabeçalho
      const rawRow = batch[j];

      // Normalizar chaves: converter labels para keys internas
      const row: Record<string, string | number | null> = {};
      for (const [label, value] of Object.entries(rawRow)) {
        const key = headerMap[label.trim()];
        if (key) row[key] = value;
      }

      // Identificar o produto pelo ID (preferencial) ou código/EAN
      const idRaw = row["id"];
      const productId = idRaw ? parseInt(String(idRaw), 10) : NaN;

      if (!productId || isNaN(productId)) {
        result.skipped++;
        result.details.push({ row: rowNum, status: "skipped", message: "ID ausente ou inválido — linha ignorada" });
        continue;
      }

      // Verificar se o produto existe
      const existing = await db
        .select({ id: products.id, name: products.name })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      if (existing.length === 0) {
        result.notFound++;
        result.details.push({ row: rowNum, id: productId, status: "not_found", message: `Produto ID ${productId} não encontrado` });
        continue;
      }

      // Montar objeto de atualização apenas com campos preenchidos
      const updateData: Record<string, string | number | null> = {};

      const strField = (key: string) => {
        const v = row[key];
        return v !== null && v !== undefined && String(v).trim() !== "" ? String(v).trim() : undefined;
      };

      const numField = (key: string) => {
        const v = row[key];
        if (v === null || v === undefined || String(v).trim() === "") return undefined;
        const n = parseFloat(String(v).replace(",", "."));
        return isNaN(n) ? undefined : n;
      };

      // Campos de texto simples
      for (const key of ["code", "name", "activeIngredient", "concentration", "presentation",
        "pharmaceuticalForm", "manufacturer", "laboratorio", "unit", "barcode", "gtin", "ean",
        "mapa", "ncm", "subcategoria", "classeTerapeutica", "especieAnimal",
        "codigoFornecedor", "imageUrl", "productUrl", "description", "stock"]) {
        const v = strField(key);
        if (v !== undefined) updateData[key] = v;
      }

      // Preço
      const price = numField("price");
      if (price !== undefined) updateData["price"] = String(price);

      // isActive
      const isActiveRaw = strField("isActive");
      if (isActiveRaw === "yes" || isActiveRaw === "no") {
        updateData["isActive"] = isActiveRaw;
      }

      // registroRegulatorio
      const regRaw = strField("registroRegulatorio");
      if (regRaw === "MAPA" || regRaw === "ANVISA" || regRaw === "FORN") {
        updateData["registroRegulatorio"] = regRaw;
      }

      // Categoria por nome
      const catName = strField("categoryName");
      if (catName) {
        const catId = catByName.get(catName.toLowerCase());
        if (catId) updateData["categoryId"] = catId;
        else {
          result.details.push({ row: rowNum, id: productId, status: "updated", message: `Aviso: categoria "${catName}" não encontrada — campo ignorado` });
        }
      }

      // Fornecedor por nome
      const supName = strField("supplierName");
      if (supName) {
        const supId = supByName.get(supName.toLowerCase());
        if (supId) updateData["supplierId"] = supId;
      }

      if (Object.keys(updateData).length === 0) {
        result.skipped++;
        result.details.push({ row: rowNum, id: productId, name: existing[0].name, status: "skipped", message: "Nenhum campo para atualizar" });
        continue;
      }

      try {
        await db.update(products).set(updateData as any).where(eq(products.id, productId));
        result.updated++;
        result.details.push({ row: rowNum, id: productId, name: existing[0].name, status: "updated" });
      } catch (err: any) {
        result.errors++;
        result.details.push({ row: rowNum, id: productId, name: existing[0].name, status: "error", message: err?.message ?? "Erro desconhecido" });
      }
    }
  }

  return result;
}
