import { and, asc, desc, eq, inArray, isNotNull, like, or, sql } from "drizzle-orm";
import { escapeLike, simplifyDbError, normalize, matches, normalizeName, similarity } from "./db/_helpers";
import { getDb, resetDb } from "./db/_client";
import {
  InsertProduct,
  categories,
  equivalenceGroups,
  equivalenceMembers,
  products,
  suppliers,
  masterProducts,
  type MasterProduct,
} from "../drizzle/schema";

// Conexão/pool compartilhado: getDb/resetDb vivem em ./db/_client e são
// re-exportados aqui para preservar a API pública `from "../db"`.
export { getDb, resetDb };

// ─── Users → ./db/users ───
export * from "./db/users";
// ─── Categories → ./db/categories ───
export * from "./db/categories";
// ─── Suppliers → ./db/suppliers ───
export * from "./db/suppliers";
// ─── Products ────────────────────────────────────────────────────────────────

export async function listProducts(opts: {
  categoryId?: number;
  categoryIds?: number[];
  supplierId?: number;
  search?: string;
  searchField?: "all" | "name" | "code" | "activeIngredient" | "manufacturer" | "barcode" | "concentration" | "presentation";
  manufacturer?: string;
  isActive?: "yes" | "no" | "all";
  priceMin?: number;
  priceMax?: number;
  hasImage?: boolean;
  hasProductUrl?: boolean;
  withoutFichaTecnica?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: "name" | "price" | "mapa" | "supplier" | "category" | "manufacturer" | "createdAt";
  sortDir?: "asc" | "desc";
  // legacy compat
  orderBy?: "price_asc" | "price_desc" | "name_asc" | "name_desc";
}) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };

  // Default: show active only, unless explicitly filtered
  const activeFilter = opts.isActive ?? "yes";
  const conditions: any[] = [];
  if (activeFilter !== "all") conditions.push(eq(products.isActive, activeFilter as "yes" | "no"));

  if (opts.categoryIds && opts.categoryIds.length > 0) {
    conditions.push(inArray(products.categoryId, opts.categoryIds));
  } else if (opts.categoryId) {
    conditions.push(eq(products.categoryId, opts.categoryId));
  }
  if (opts.supplierId) conditions.push(eq(products.supplierId, opts.supplierId));

  // Advanced search by field
  if (opts.search) {
    const term = `%${escapeLike(opts.search)}%`;
    const field = opts.searchField ?? "all";
    if (field === "name") conditions.push(like(products.name, term));
    else if (field === "code") conditions.push(like(products.code, term));
    else if (field === "activeIngredient") conditions.push(like(products.activeIngredient, term));
    else if (field === "manufacturer") conditions.push(like(products.manufacturer, term));
    else if (field === "barcode") conditions.push(like(products.barcode, term));
    else if (field === "concentration") conditions.push(like(products.concentration, term));
    else if (field === "presentation") conditions.push(like(products.presentation, term));
    else {
      // all fields
      conditions.push(
        or(
          like(products.name, term),
          like(products.activeIngredient, term),
          like(products.description, term),
          like(products.code, term),
          like(products.manufacturer, term),
          like(products.barcode, term),
          like(products.concentration, term),
          like(products.presentation, term)
        )!
      );
    }
  }

  // Manufacturer filter (exact partial match)
  if (opts.manufacturer) {
    conditions.push(like(products.manufacturer, `%${opts.manufacturer}%`));
  }

  // Price range
  if (opts.priceMin !== undefined) conditions.push(sql`${products.price} >= ${opts.priceMin}`);
  if (opts.priceMax !== undefined) conditions.push(sql`${products.price} <= ${opts.priceMax}`);

  // Has image / has product URL
  if (opts.hasImage === true) conditions.push(sql`${products.imageUrl} IS NOT NULL AND ${products.imageUrl} != ''`);
  if (opts.hasProductUrl === true) conditions.push(sql`${products.productUrl} IS NOT NULL AND ${products.productUrl} != ''`);
  if (opts.withoutFichaTecnica === true) conditions.push(sql`(${products.fichaTecnica} IS NULL OR ${products.fichaTecnica} = '')`);

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Sorting — support both legacy orderBy and new sortBy/sortDir
  let orderClause: any;
  const dir = opts.sortDir ?? "asc";
  const sortBy = opts.sortBy ?? (opts.orderBy === "price_asc" || opts.orderBy === "price_desc" ? "price" : "name");
  const sortDirFinal = opts.sortDir ?? (opts.orderBy === "price_desc" || opts.orderBy === "name_desc" ? "desc" : "asc");

  switch (sortBy) {
    case "price":
      orderClause = sortDirFinal === "desc" ? desc(products.price) : asc(products.price);
      break;
    case "mapa":
      orderClause = sortDirFinal === "desc" ? desc(products.mapa) : asc(products.mapa);
      break;
    case "manufacturer":
      orderClause = sortDirFinal === "desc" ? desc(products.manufacturer) : asc(products.manufacturer);
      break;
    case "createdAt":
      orderClause = sortDirFinal === "desc" ? desc(products.createdAt) : asc(products.createdAt);
      break;
    default:
      orderClause = sortDirFinal === "desc" ? desc(products.name) : asc(products.name);
  }

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: products.id,
        code: products.code,
        name: products.name,
        description: products.description,
        activeIngredient: products.activeIngredient,
        manufacturer: products.manufacturer,
        unit: products.unit,
        concentration: products.concentration,
        presentation: products.presentation,
        pharmaceuticalForm: products.pharmaceuticalForm,
        price: products.price,
        priceUnit: products.priceUnit,
        stock: products.stock,
        barcode: products.barcode,
        mapa: products.mapa,
        imageUrl: products.imageUrl,
        productUrl: products.productUrl,
        isActive: products.isActive,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
        supplierId: products.supplierId,
        categoryId: products.categoryId,
        importBatchId: products.importBatchId,
        supplierName: suppliers.name,
        categoryName: categories.name,
        categoryColor: categories.color,
        categorySlug: categories.slug,
        // Campos V2
        fichaTecnica: products.fichaTecnica,
        codigoFornecedor: products.codigoFornecedor,
        ean: products.ean,
        gtin: products.gtin,
        subcategoria: products.subcategoria,
        registroRegulatorio: products.registroRegulatorio,
        nomeProduto: products.nomeProduto,
        laboratorio: products.laboratorio,
      })
      .from(products)
      .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(where)
      .orderBy(orderClause)
      .limit(opts.limit ?? 50)
      .offset(opts.offset ?? 0),
    db
      .select({ count: sql<number>`count(*)` })
      .from(products)
      .where(where),
  ]);

  return { items, total: Number(countResult[0]?.count ?? 0) };
}

export async function getProductById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select({
      id: products.id,
      code: products.code,
      name: products.name,
      description: products.description,
      activeIngredient: products.activeIngredient,
      manufacturer: products.manufacturer,
      unit: products.unit,
      concentration: products.concentration,
      presentation: products.presentation,
      price: products.price,
      priceUnit: products.priceUnit,
      stock: products.stock,
      barcode: products.barcode,
      mapa: products.mapa,
      imageUrl: products.imageUrl,
      productUrl: products.productUrl,
      isActive: products.isActive,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      supplierId: products.supplierId,
      categoryId: products.categoryId,
      importBatchId: products.importBatchId,
      supplierName: suppliers.name,
      categoryName: categories.name,
      categoryColor: categories.color,
      // Campos V2
      fichaTecnica: products.fichaTecnica,
      codigoFornecedor: products.codigoFornecedor,
      ean: products.ean,
      gtin: products.gtin,
      subcategoria: products.subcategoria,
      registroRegulatorio: products.registroRegulatorio,
      nomeProduto: products.nomeProduto,
      laboratorio: products.laboratorio,
    })
    .from(products)
    .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.id, id))
    .limit(1);
  return result[0];
}

export async function createProduct(data: InsertProduct) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(products).values(data);
  return result;
}

export async function updateProduct(id: number, data: Partial<InsertProduct>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(products).set(data).where(eq(products.id, id));
}

export async function deleteProduct(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(products).where(eq(products.id, id));
}

export async function bulkInsertProducts(data: InsertProduct[]): Promise<{ inserted: number; skipped: number; errors: { row: number; name: string; reason: string }[] }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (data.length === 0) return { inserted: 0, skipped: 0, errors: [] };

  let inserted = 0;
  let skipped = 0;
  const errors: { row: number; name: string; reason: string }[] = [];

  // Process in chunks of 50 with per-chunk error handling
  for (let i = 0; i < data.length; i += 50) {
    const chunk = data.slice(i, i + 50);
    try {
      // Use onDuplicateKeyUpdate to upsert by supplierId+name when replaceExisting
      const [result] = await db.insert(products).ignore().values(chunk);
      const affectedRows = (result as any).affectedRows ?? chunk.length;
      inserted += affectedRows;
      skipped += chunk.length - affectedRows;
    } catch (chunkErr: any) {
      // Chunk failed — try one by one to salvage as many rows as possible
      for (let j = 0; j < chunk.length; j++) {
        const row = chunk[j];
        try {
          await db.insert(products).ignore().values(row);
          inserted++;
        } catch (rowErr: any) {
          skipped++;
          errors.push({
            row: i + j + 1,
            name: row.name ?? "(sem nome)",
            reason: simplifyDbError(rowErr?.message ?? "Erro desconhecido"),
          });
        }
      }
    }
  }

  return { inserted, skipped, errors };
}


export async function deactivateProductsByBatch(supplierId: number, batchId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(products)
    .set({ isActive: "no" })
    .where(and(eq(products.supplierId, supplierId), sql`${products.importBatchId} != ${batchId}`));
}

// ─── Smart Search ─────────────────────────────────────────────────────────────

export async function smartSearch(query: string, categoryId?: number) {
  const db = await getDb();
  if (!db) return [];
  const term = `%${escapeLike(query)}%`;
  const conditions = [
    eq(products.isActive, "yes"),
    or(
      like(products.name, term),
      like(products.activeIngredient, term),
      like(products.description, term),
      like(products.code, term)
    )!,
  ];
  if (categoryId) conditions.push(eq(products.categoryId, categoryId));

  return db
    .select({
      id: products.id,
      code: products.code,
      name: products.name,
      activeIngredient: products.activeIngredient,
      manufacturer: products.manufacturer,
      concentration: products.concentration,
      presentation: products.presentation,
      price: products.price,
      priceUnit: products.priceUnit,
      unit: products.unit,
      supplierId: products.supplierId,
      categoryId: products.categoryId,
      supplierName: suppliers.name,
      categoryName: categories.name,
      categoryColor: categories.color,
      categorySlug: categories.slug,
      imageUrl: products.imageUrl,
      productUrl: products.productUrl,
    })
    .from(products)
    .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(asc(products.price))
    .limit(100);
}

// ─── Autocomplete ───────────────────────────────────────────────────────────

export async function autocompleteSearch(query: string, limit = 10) {
  const db = await getDb();
  if (!db) return [];
  const term = `%${escapeLike(query)}%`;

  // Busca em múltiplos campos e agrupa por tipo de sugestão
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      code: products.code,
      activeIngredient: products.activeIngredient,
      manufacturer: products.manufacturer,
      concentration: products.concentration,
      presentation: products.presentation,
      price: products.price,
      priceUnit: products.priceUnit,
      imageUrl: products.imageUrl,
      supplierName: suppliers.name,
      categoryName: categories.name,
      categoryColor: categories.color,
    })
    .from(products)
    .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(
      and(
        eq(products.isActive, "yes"),
        or(
          like(products.name, term),
          like(products.activeIngredient, term),
          like(products.manufacturer, term),
          like(products.code, term),
          like(products.barcode, term),
          like(products.concentration, term),
          like(products.presentation, term),
          like(products.description, term)
        )!
      )
    )
    .orderBy(asc(products.name))
    .limit(limit * 3); // fetch more to allow deduplication

  // Build suggestion list: deduplicate by name+supplier
  const seen = new Set<string>();
  const suggestions: {
    id: number;
    label: string;
    sublabel: string;
    type: "product" | "activeIngredient" | "manufacturer";
    imageUrl: string | null;
    price: string | null;
    priceUnit: string | null;
    supplierName: string | null;
    categoryName: string | null;
    categoryColor: string | null;
  }[] = [];

  for (const row of rows) {
    const key = `${row.name}|${row.supplierName}`;
    if (!seen.has(key)) {
      seen.add(key);
      const parts = [row.concentration, row.presentation].filter(Boolean).join(" · ");
      suggestions.push({
        id: row.id,
        label: row.name,
        sublabel: [row.supplierName, parts].filter(Boolean).join(" — "),
        type: "product",
        imageUrl: row.imageUrl,
        price: row.price,
        priceUnit: row.priceUnit,
        supplierName: row.supplierName,
        categoryName: row.categoryName,
        categoryColor: row.categoryColor,
      });
    }
    if (suggestions.length >= limit) break;
  }

  // Also add unique activeIngredient suggestions
  const aiSeen = new Set<string>();
  for (const row of rows) {
    if (row.activeIngredient) {
      const ai = row.activeIngredient.trim();
      if (!aiSeen.has(ai) && ai.toLowerCase().includes(query.toLowerCase())) {
        aiSeen.add(ai);
        suggestions.push({
          id: -1,
          label: ai,
          sublabel: "Princípio ativo",
          type: "activeIngredient",
          imageUrl: null,
          price: null,
          priceUnit: null,
          supplierName: null,
          categoryName: row.categoryName,
          categoryColor: row.categoryColor,
        });
      }
    }
  }

  return suggestions.slice(0, limit + 5);
}

export async function compareByActiveIngredient(activeIngredient: string, categoryId?: number) {
  const db = await getDb();
  if (!db) return [];
  const term = `%${escapeLike(activeIngredient)}%`;
  const conditions = [
    eq(products.isActive, "yes"),
    like(products.activeIngredient, term),
  ];
  if (categoryId) conditions.push(eq(products.categoryId, categoryId));

  return db
    .select({
      id: products.id,
      code: products.code,
      name: products.name,
      activeIngredient: products.activeIngredient,
      manufacturer: products.manufacturer,
      concentration: products.concentration,
      presentation: products.presentation,
      price: products.price,
      priceUnit: products.priceUnit,
      unit: products.unit,
      description: products.description,
      supplierId: products.supplierId,
      categoryId: products.categoryId,
      supplierName: suppliers.name,
      categoryName: categories.name,
      categoryColor: categories.color,
      imageUrl: products.imageUrl,
      productUrl: products.productUrl,
    })
    .from(products)
    .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(asc(products.price));
}

// ─── Equivalence Groups → ./db/equivalenceGroups ───
export * from "./db/equivalenceGroups";
// ─── Import Logs → ./db/importLogs ───────────────────────────────────────────
export * from "./db/importLogs";

// ─── Dashboard Stats → ./db/dashboard ───
export * from "./db/dashboard";
// ─── Quotations → ./db/quotations ───
export * from "./db/quotations";
// ─── Bulk Update Products ─────────────────────────────────────────────────────

export async function bulkUpdateProducts(
  ids: number[],
  data: Partial<{
    supplierId: number;
    categoryId: number;
    name: string;
    code: string;
    activeIngredient: string;
    manufacturer: string;
    concentration: string;
    presentation: string;
    pharmaceuticalForm: string;
    unit: string;
    price: string;
    priceUnit: string;
    mapa: string;
    barcode: string;
    description: string;
    imageUrl: string;
    productUrl: string;
    stock: string;
    isActive: "yes" | "no";
    priceAdjustPercent: number; // positive = increase, negative = decrease
  }>
): Promise<number> {
  const db = await getDb();
  if (!db || ids.length === 0) return 0;

  // If priceAdjustPercent is set, we need to update each product individually
  if (data.priceAdjustPercent !== undefined && data.priceAdjustPercent !== 0) {
    const factor = 1 + data.priceAdjustPercent / 100;
    for (const id of ids) {
      await db
        .update(products)
        .set({ price: sql`ROUND(${products.price} * ${factor}, 2)` })
        .where(eq(products.id, id));
    }
    // Also apply any other non-price fields
    const { priceAdjustPercent, ...rest } = data;
    const otherFields = Object.fromEntries(
      Object.entries(rest).filter(([, v]) => v !== undefined)
    );
    if (Object.keys(otherFields).length > 0) {
      for (const id of ids) {
        await db.update(products).set(otherFields as any).where(eq(products.id, id));
      }
    }
    return ids.length;
  }

  const { priceAdjustPercent, ...fields } = data;
  const updateData = Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined)
  );
  if (Object.keys(updateData).length === 0) return 0;

  // Batch update using inArray
  const { inArray } = await import("drizzle-orm");
  await db.update(products).set(updateData as any).where(inArray(products.id, ids));
  return ids.length;
}

// ─── Company Settings → ./db/companySettings ───
export * from "./db/companySettings";
// ─── Requesting Orgs → ./db/requestingOrgs ──────────────────────────────────
export * from "./db/requestingOrgs";

// ─── Proposals → ./db/proposals ───
export * from "./db/proposals";
// ─── Financial + Freight → ./db/financial ───
export * from "./db/financial";
// (getExpiringProposals → ./db/proposals)
// ─── Base Mestre de Produtos ─────────────────────────────────────────────────

/**
 * Normaliza uma string para comparação: maiúsculas, sem acentos, sem espaços extras.
 */


export type MatchResult = {
  matched: boolean;
  masterProduct: MasterProduct | null;
  matchedBy: "ean" | "codigoMapa" | "concentration" | "presentation" | null;
};

/**
 * Reconhecimento inteligente: dado um nome + pelo menos uma característica,
 * localiza o produto correspondente na base mestre.
 * Retorna o produto encontrado e o campo que gerou o match.
 */
export async function matchProductInMaster(input: {
  name: string;
  ean?: string | null;
  codigoMapa?: string | null;
  concentration?: string | null;
  presentation?: string | null;
}): Promise<MatchResult> {
  const db = await getDb();
  if (!db) return { matched: false, masterProduct: null, matchedBy: null };

  const normName = normalize(input.name);
  if (!normName) return { matched: false, masterProduct: null, matchedBy: null };

  // Busca candidatos pelo nome (LIKE case-insensitive)
  const candidates = await db
    .select()
    .from(masterProducts)
    .where(like(masterProducts.name, `%${input.name.trim()}%`))
    .limit(20);

  // Filtra por nome normalizado exato
  const nameMatches = candidates.filter((c) => normalize(c.name) === normName);

  if (nameMatches.length === 0) return { matched: false, masterProduct: null, matchedBy: null };

  // Tenta match por EAN
  if (input.ean) {
    const m = nameMatches.find((c) => matches(c.ean, input.ean));
    if (m) return { matched: true, masterProduct: m, matchedBy: "ean" };
  }
  // Tenta match por Código MAPA
  if (input.codigoMapa) {
    const m = nameMatches.find((c) => matches(c.codigoMapa, input.codigoMapa));
    if (m) return { matched: true, masterProduct: m, matchedBy: "codigoMapa" };
  }
  // Tenta match por Concentração
  if (input.concentration) {
    const m = nameMatches.find((c) => matches(c.concentration, input.concentration));
    if (m) return { matched: true, masterProduct: m, matchedBy: "concentration" };
  }
  // Tenta match por Apresentação
  if (input.presentation) {
    const m = nameMatches.find((c) => matches(c.presentation, input.presentation));
    if (m) return { matched: true, masterProduct: m, matchedBy: "presentation" };
  }

  // Se só há um candidato com nome exato e nenhuma característica foi fornecida, retorna ele
  if (nameMatches.length === 1 && !input.ean && !input.codigoMapa && !input.concentration && !input.presentation) {
    return { matched: true, masterProduct: nameMatches[0], matchedBy: null };
  }

  return { matched: false, masterProduct: null, matchedBy: null };
}

/**
 * Pré-visualização de importação: recebe as linhas brutas e retorna
 * para cada linha se é um produto existente (match) ou novo cadastro,
 * além dos dados enriquecidos da base mestre.
 */
export type ImportPreviewRow = {
  rowIndex: number;
  inputName: string;
  status: "match" | "new";
  matchedBy: string | null;
  masterProduct: MasterProduct | null;
  // Dados finais que serão usados (mesclados com base mestre)
  enriched: {
    name: string;
    activeIngredient: string | null;
    manufacturer: string | null;
    concentration: string | null;
    presentation: string | null;
    categoryName: string | null;
    ean: string | null;
    codigoMapa: string | null;
  };
};

export async function previewImportRows(
  rows: Array<Record<string, string>>
): Promise<ImportPreviewRow[]> {
  const results: ImportPreviewRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = (row["name"] || row["nome"] || row["nome_produto"] || "").trim();
    if (!name) continue;

    const inputEan = (row["ean"] || row["barcode"] || row["codigo_barras"] || "").trim() || null;
    const inputMapa = (row["codigoMapa"] || row["registro_mapa"] || row["mapa"] || "").trim() || null;
    const inputConc = (row["concentration"] || row["concentracao"] || row["forma_concentracao"] || "").trim() || null;
    const inputPres = (row["presentation"] || row["apresentacao"] || "").trim() || null;
    const inputIngredient = (row["activeIngredient"] || row["composicao"] || row["principio_ativo"] || "").trim() || null;
    const inputManufacturer = (row["manufacturer"] || row["marca"] || row["fabricante"] || "").trim() || null;
    const inputCategory = (row["categoryName"] || row["categoria"] || "").trim() || null;

    const { matched, masterProduct, matchedBy } = await matchProductInMaster({
      name,
      ean: inputEan,
      codigoMapa: inputMapa,
      concentration: inputConc,
      presentation: inputPres,
    });

    // Mescla: dados da base mestre têm prioridade para campos técnicos;
    // preço e fornecedor sempre vêm da planilha nova.
    const enriched = {
      name: masterProduct?.name ?? name,
      activeIngredient: inputIngredient || masterProduct?.activeIngredient || null,
      manufacturer: inputManufacturer || masterProduct?.manufacturer || null,
      concentration: inputConc || masterProduct?.concentration || null,
      presentation: inputPres || masterProduct?.presentation || null,
      categoryName: inputCategory || masterProduct?.categoryName || null,
      ean: inputEan || masterProduct?.ean || null,
      codigoMapa: inputMapa || masterProduct?.codigoMapa || null,
    };

    results.push({
      rowIndex: i,
      inputName: name,
      status: matched ? "match" : "new",
      matchedBy: matchedBy,
      masterProduct: masterProduct ?? null,
      enriched,
    });
  }

  return results;
}

/**
 * Lista produtos da base mestre com busca opcional.
 */
export async function listMasterProducts(search?: string, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  const q = db.select().from(masterProducts);
  if (search) {
    return q
      .where(
        or(
          like(masterProducts.name, `%${search}%`),
          like(masterProducts.activeIngredient, `%${search}%`)
        )
      )
      .orderBy(asc(masterProducts.name))
      .limit(limit);
  }
  return q.orderBy(asc(masterProducts.name)).limit(limit);
}

/**
 * Busca produto por nome exato na base mestre.
 */
export async function getMasterProductByName(name: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(masterProducts)
    .where(like(masterProducts.name, name.trim()))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Busca produtos da base mestre por parte do nome — para autocomplete.
 */
export async function searchMasterProducts(query: string, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(masterProducts)
    .where(like(masterProducts.name, `%${query}%`))
    .orderBy(asc(masterProducts.name))
    .limit(limit);
}

/**
 * Busca todos os produtos cadastrados (de todos os fornecedores) que correspondem
 * a um produto da base mestre, retornando o menor preço primeiro.
 */
export async function getProductPricesByMasterName(masterName: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: products.id,
      name: products.name,
      price: products.price,
      priceUnit: products.priceUnit,
      supplierId: products.supplierId,
      supplierName: suppliers.name,
      concentration: products.concentration,
      presentation: products.presentation,
      manufacturer: products.manufacturer,
      barcode: products.barcode,
      imageUrl: products.imageUrl,
      productUrl: products.productUrl,
    })
    .from(products)
    .innerJoin(suppliers, eq(products.supplierId, suppliers.id))
    .where(
      and(
        eq(products.isActive, "yes"),
        like(products.name, `%${masterName.trim()}%`)
      )
    )
    .orderBy(asc(products.price))
    .limit(50);
}

// ─── Fuzzy Matching com Base Mestre ──────────────────────────────────────────

import { isSameProduct } from "./fuzzy";

/**
 * Reconhecimento inteligente com fuzzy matching (Jaro-Winkler ≥ 85%).
 * Busca candidatos na base mestre pelo nome e aplica matching combinado.
 */
export async function fuzzyMatchProductInMaster(input: {
  name: string;
  ean?: string | null;
  codigoMapa?: string | null;
  concentration?: string | null;
  presentation?: string | null;
}): Promise<{
  matched: boolean;
  masterProduct: MasterProduct | null;
  matchedBy: string | null;
  similarity: number;
}> {
  const db = await getDb();
  if (!db || !input.name?.trim()) {
    return { matched: false, masterProduct: null, matchedBy: null, similarity: 0 };
  }

  // Busca candidatos com LIKE no início do nome (primeiras 4 letras)
  const prefix = input.name.trim().slice(0, 4);
  const candidates = await db
    .select()
    .from(masterProducts)
    .where(like(masterProducts.name, `${prefix}%`))
    .limit(100);

  // Também busca por EAN se disponível
  if (input.ean?.trim()) {
    const byEan = await db
      .select()
      .from(masterProducts)
      .where(like(masterProducts.ean, input.ean.trim()))
      .limit(5);
    for (const p of byEan) {
      if (!candidates.find((c) => c.id === p.id)) candidates.push(p);
    }
  }

  let bestMatch: MasterProduct | null = null;
  let bestSimilarity = 0;
  let bestMatchedBy: string | null = null;

  for (const candidate of candidates) {
    const result = isSameProduct(
      {
        name: input.name,
        ean: input.ean,
        codigoMapa: input.codigoMapa,
        concentration: input.concentration,
        presentation: input.presentation,
      },
      {
        name: candidate.name,
        ean: candidate.ean,
        codigoMapa: candidate.codigoMapa,
        concentration: candidate.concentration,
        presentation: candidate.presentation,
      }
    );

    if (result.matched && result.similarity > bestSimilarity) {
      bestSimilarity = result.similarity;
      bestMatch = candidate;
      bestMatchedBy = result.matchedBy;
    }
  }

  return {
    matched: bestMatch !== null,
    masterProduct: bestMatch,
    matchedBy: bestMatchedBy,
    similarity: bestSimilarity,
  };
}

/**
 * Enriquece uma linha de importação com dados da base mestre.
 * Preenche campos vazios automaticamente (composição, categoria, marca).
 */
export async function enrichImportRow(row: Record<string, string>): Promise<{
  status: "match" | "new";
  matchedBy: string | null;
  similarity: number;
  enriched: Record<string, string | null>;
  masterProduct: MasterProduct | null;
}> {
  const name = (row["name"] || row["nome"] || row["nome_produto"] || "").trim();
  if (!name) {
    return { status: "new", matchedBy: null, similarity: 0, enriched: {}, masterProduct: null };
  }

  const inputEan = (row["ean"] || row["barcode"] || row["codigo_barras"] || "").trim() || null;
  const inputMapa = (row["codigoMapa"] || row["registro_mapa"] || row["mapa"] || "").trim() || null;
  const inputConc = (row["concentration"] || row["concentracao"] || row["forma_concentracao"] || "").trim() || null;
  const inputPres = (row["presentation"] || row["apresentacao"] || "").trim() || null;
  const inputIngredient = (row["activeIngredient"] || row["composicao"] || row["principio_ativo"] || "").trim() || null;
  const inputManufacturer = (row["manufacturer"] || row["marca"] || row["fabricante"] || "").trim() || null;
  const inputCategory = (row["categoryName"] || row["categoria"] || "").trim() || null;

  const { matched, masterProduct, matchedBy, similarity } = await fuzzyMatchProductInMaster({
    name,
    ean: inputEan,
    codigoMapa: inputMapa,
    concentration: inputConc,
    presentation: inputPres,
  });

  // Mescla: campos técnicos da base mestre preenchem lacunas da planilha
  const enriched: Record<string, string | null> = {
    name: masterProduct?.name ?? name,
    activeIngredient: inputIngredient || masterProduct?.activeIngredient || null,
    manufacturer: inputManufacturer || masterProduct?.manufacturer || null,
    concentration: inputConc || masterProduct?.concentration || null,
    presentation: inputPres || masterProduct?.presentation || null,
    categoryName: inputCategory || masterProduct?.categoryName || null,
    ean: inputEan || masterProduct?.ean || null,
    codigoMapa: inputMapa || masterProduct?.codigoMapa || null,
  };

  return {
    status: matched ? "match" : "new",
    matchedBy,
    similarity,
    enriched,
    masterProduct: masterProduct ?? null,
  };
}

/**
 * Pré-visualização de importação em lote com fuzzy matching.
 * Busca na base mestre E no catálogo de produtos do fornecedor (se supplierId fornecido).
 */
export async function previewImportRowsFuzzy(
  rows: Array<Record<string, string>>,
  supplierId?: number
): Promise<Array<{
  rowIndex: number;
  inputName: string;
  status: "match" | "new";
  matchedBy: string | null;
  similarity: number;
  masterProduct: MasterProduct | null;
  enriched: Record<string, string | null>;
  suggestedCategory?: string | null;
}>> {
  // Pré-carrega produtos do catálogo para matching em memória (evita N+1 queries)
  const db = await getDb();
  let catalogProducts: Array<{
    id: number; name: string; activeIngredient: string | null;
    concentration: string | null; presentation: string | null;
    manufacturer: string | null; barcode: string | null;
    categoryName: string | null;
  }> = [];
  if (db) {
    const whereClause = supplierId
      ? and(eq(products.isActive, "yes"), eq(products.supplierId, supplierId))
      : eq(products.isActive, "yes");
    catalogProducts = await db
      .select({
        id: products.id,
        name: products.name,
        activeIngredient: products.activeIngredient,
        concentration: products.concentration,
        presentation: products.presentation,
        manufacturer: products.manufacturer,
        barcode: products.barcode,
        categoryName: categories.name,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(whereClause)
      .limit(5000) as any;
  }
  const { jaroWinkler, normalizeStr } = await import("./fuzzy");
  const results = [];
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i];
    const name = (row["name"] || row["nome"] || row["nome_produto"] || "").trim();
    if (!name) continue;
    // 1. Tenta base mestre primeiro
    const masterResult = await enrichImportRow(row);
    if (masterResult.status === "match") {
      results.push({ rowIndex: i, inputName: name, ...masterResult });
      continue;
    }
    // 2. Tenta catálogo de produtos com Jaro-Winkler
    const normInput = normalizeStr(name);
    let bestCatalogMatch: typeof catalogProducts[0] | null = null;
    let bestSim = 0;
    for (const p of catalogProducts) {
      const sim = jaroWinkler(normInput, normalizeStr(p.name));
      if (sim > bestSim) { bestSim = sim; bestCatalogMatch = p; }
    }
    if (bestSim >= 0.82 && bestCatalogMatch) {
      const inputConc = (row["concentration"] || row["concentracao"] || "").trim() || null;
      const inputPres = (row["presentation"] || row["apresentacao"] || "").trim() || null;
      // Verifica se concentração/apresentação são compatíveis (produtos distintos = manter)
      const concMatch = !inputConc || !bestCatalogMatch.concentration ||
        normalizeStr(inputConc) === normalizeStr(bestCatalogMatch.concentration);
      const presMatch = !inputPres || !bestCatalogMatch.presentation ||
        normalizeStr(inputPres) === normalizeStr(bestCatalogMatch.presentation);
      if (concMatch && presMatch) {
        results.push({
          rowIndex: i,
          inputName: name,
          status: "match" as const,
          matchedBy: "catalog_fuzzy",
          similarity: bestSim,
          masterProduct: null,
          enriched: {
            name: bestCatalogMatch.name,
            activeIngredient: (row["activeIngredient"] || row["composicao"] || "") || bestCatalogMatch.activeIngredient,
            manufacturer: (row["manufacturer"] || row["fabricante"] || "") || bestCatalogMatch.manufacturer,
            concentration: inputConc || bestCatalogMatch.concentration,
            presentation: inputPres || bestCatalogMatch.presentation,
            categoryName: bestCatalogMatch.categoryName,
            ean: (row["ean"] || row["barcode"] || "") || bestCatalogMatch.barcode,
          },
          suggestedCategory: bestCatalogMatch.categoryName,
        });
        continue;
      }
    }
    // 3. Produto novo — retorna dados brutos sem enriquecimento
    results.push({
      rowIndex: i,
      inputName: name,
      status: "new" as const,
      matchedBy: null,
      similarity: bestSim,
      masterProduct: null,
      enriched: masterResult.enriched,
      suggestedCategory: null,
    });
  }
  return results;
}

// ─── Similares por Composição (Princípio Ativo) ───────────────────────────────

export type SimilarProduct = {
  id: number;
  name: string;
  activeIngredient: string | null;
  manufacturer: string | null;
  concentration: string | null;
  presentation: string | null;
  price: string | null;
  priceUnit: string | null;
  supplierId: number;
  supplierName: string;
  imageUrl: string | null;
  productUrl: string | null;
  savingsPercent: number | null;
};

/**
 * Busca produtos similares com a mesma composição (princípio ativo),
 * ordenados por preço crescente. Retorna apenas produtos mais baratos que o referência.
 */
export async function getSimilarProductsByIngredient(
  productId: number,
  referencePrice: number | null
): Promise<SimilarProduct[]> {
  const db = await getDb();
  if (!db) return [];

  // Busca o produto de referência
  const [ref] = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!ref || !ref.activeIngredient?.trim()) return [];

  // Busca todos os produtos com o mesmo princípio ativo
  const similar = await db
    .select({
      id: products.id,
      name: products.name,
      activeIngredient: products.activeIngredient,
      manufacturer: products.manufacturer,
      concentration: products.concentration,
      presentation: products.presentation,
      price: products.price,
      priceUnit: products.priceUnit,
      supplierId: products.supplierId,
      supplierName: suppliers.name,
      imageUrl: products.imageUrl,
      productUrl: products.productUrl,
    })
    .from(products)
    .innerJoin(suppliers, eq(products.supplierId, suppliers.id))
    .where(
      and(
        eq(products.isActive, "yes"),
        like(products.activeIngredient, `%${ref.activeIngredient.trim()}%`),
        // Exclui o próprio produto
        sql`${products.id} != ${productId}`
      )
    )
    .orderBy(asc(products.price))
    .limit(20);

  const refPrice = referencePrice ?? (ref.price ? parseFloat(ref.price) : null);

  return similar.map((p) => {
    const pPrice = p.price ? parseFloat(p.price) : null;
    const savingsPercent =
      refPrice && pPrice && refPrice > 0 && pPrice < refPrice
        ? Math.round(((refPrice - pPrice) / refPrice) * 100)
        : null;
    return { ...p, savingsPercent };
  });
}

/**
 * Busca produtos similares mais baratos que o produto selecionado.
 * Retorna apenas os que têm preço inferior ao de referência.
 */
export async function getCheaperAlternatives(
  productId: number,
  referencePrice: number | null
): Promise<SimilarProduct[]> {
  const all = await getSimilarProductsByIngredient(productId, referencePrice);
  const refPrice = referencePrice;
  if (!refPrice) return all.slice(0, 5);
  return all.filter((p) => {
    const pPrice = p.price ? parseFloat(p.price) : null;
    return pPrice !== null && pPrice < refPrice;
  }).slice(0, 5);
}

// ─── Landed Cost e Histórico de Preços ───────────────────────────────────────

import {
  priceHistory,
  type PriceHistory,
} from "../drizzle/schema";

/**
 * Calcula o Landed Cost (custo real) de um produto:
 * landedCost = price + freightValue + taxValue
 */
export function calcLandedCost(
  price: string | null | undefined,
  freightValue: string | null | undefined,
  taxValue: string | null | undefined
): number | null {
  const p = price ? parseFloat(price) : null;
  if (p === null || isNaN(p)) return null;
  const f = freightValue ? parseFloat(freightValue) : 0;
  const t = taxValue ? parseFloat(taxValue) : 0;
  return p + (isNaN(f) ? 0 : f) + (isNaN(t) ? 0 : t);
}

/**
 * Registra um novo preço no histórico e detecta inflação >5%.
 * Retorna o registro criado com o flag priceAlert.
 */
export async function recordPriceHistory(data: {
  productId: number;
  supplierId: number;
  price: string | null;
  freightValue?: string | null;
  taxValue?: string | null;
  importBatchId?: number | null;
}): Promise<{ priceAlert: boolean; alertPercent: number | null; landedCost: number | null }> {
  const db = await getDb();
  if (!db) return { priceAlert: false, alertPercent: null, landedCost: null };

  const landedCost = calcLandedCost(data.price, data.freightValue, data.taxValue);

  // Busca o registro mais recente para este produto/fornecedor
  const [lastRecord] = await db
    .select()
    .from(priceHistory)
    .where(
      and(
        eq(priceHistory.productId, data.productId),
        eq(priceHistory.supplierId, data.supplierId)
      )
    )
    .orderBy(desc(priceHistory.recordedAt))
    .limit(1);

  let priceAlert = false;
  let alertPercent: number | null = null;

  if (lastRecord && lastRecord.price && data.price) {
    const lastPrice = parseFloat(lastRecord.price);
    const newPrice = parseFloat(data.price);
    if (lastPrice > 0 && newPrice > lastPrice) {
      const pctChange = ((newPrice - lastPrice) / lastPrice) * 100;
      if (pctChange > 5) {
        priceAlert = true;
        alertPercent = Math.round(pctChange * 100) / 100;
      }
    }
  }

  await db.insert(priceHistory).values({
    productId: data.productId,
    supplierId: data.supplierId,
    price: data.price ?? null,
    freightValue: data.freightValue ?? null,
    taxValue: data.taxValue ?? null,
    landedCost: landedCost !== null ? String(landedCost) : null,
    priceAlert: priceAlert ? "yes" : "no",
    alertPercent: alertPercent !== null ? String(alertPercent) : null,
    importBatchId: data.importBatchId ?? null,
  });

  return { priceAlert, alertPercent, landedCost };
}

/**
 * Retorna o histórico de preços de um produto com evolução temporal.
 */
export async function getProductPriceHistory(productId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(priceHistory)
    .where(eq(priceHistory.productId, productId))
    .orderBy(desc(priceHistory.recordedAt))
    .limit(24);
}

/**
 * Retorna todos os produtos com alerta de inflação ativo (>5% desde última cotação).
 */
export async function getProductsWithPriceAlert() {
  const db = await getDb();
  if (!db) return [];

  // Subconsulta: último registro de cada produto com alerta
  return db
    .select({
      productId: priceHistory.productId,
      productName: products.name,
      supplierId: priceHistory.supplierId,
      supplierName: suppliers.name,
      currentPrice: priceHistory.price,
      landedCost: priceHistory.landedCost,
      alertPercent: priceHistory.alertPercent,
      recordedAt: priceHistory.recordedAt,
    })
    .from(priceHistory)
    .innerJoin(products, eq(priceHistory.productId, products.id))
    .innerJoin(suppliers, eq(priceHistory.supplierId, suppliers.id))
    .where(eq(priceHistory.priceAlert, "yes"))
    .orderBy(desc(priceHistory.recordedAt))
    .limit(50);
}

/**
 * Retorna produtos com Landed Cost calculado, ordenados pelo mais barato.
 * Inclui flag de alerta de inflação do último registro.
 */
export async function listProductsWithLandedCost(filters?: {
  categoryId?: number;
  supplierId?: number;
  search?: string;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(products.isActive, "yes")];
  if (filters?.categoryId) conditions.push(eq(products.categoryId, filters.categoryId));
  if (filters?.supplierId) conditions.push(eq(products.supplierId, filters.supplierId));
  if (filters?.search) conditions.push(like(products.name, `%${filters.search}%`));

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      activeIngredient: products.activeIngredient,
      manufacturer: products.manufacturer,
      concentration: products.concentration,
      presentation: products.presentation,
      price: products.price,
      priceUnit: products.priceUnit,
      supplierId: products.supplierId,
      supplierName: suppliers.name,
      categoryId: products.categoryId,
      imageUrl: products.imageUrl,
      productUrl: products.productUrl,
    })
    .from(products)
    .innerJoin(suppliers, eq(products.supplierId, suppliers.id))
    .where(and(...conditions))
    .orderBy(asc(products.price))
    .limit(filters?.limit ?? 100);

  // Busca o último registro de histórico para cada produto (alerta + landedCost)
  const productIds = rows.map((r) => r.id);
  const historyMap = new Map<number, PriceHistory>();

  if (productIds.length > 0) {
    for (const pid of productIds) {
      const [last] = await db
        .select()
        .from(priceHistory)
        .where(eq(priceHistory.productId, pid))
        .orderBy(desc(priceHistory.recordedAt))
        .limit(1);
      if (last) historyMap.set(pid, last);
    }
  }

  return rows.map((r) => {
    const hist = historyMap.get(r.id);
    const landedCost = hist?.landedCost
      ? parseFloat(hist.landedCost)
      : r.price
      ? parseFloat(r.price)
      : null;
    return {
      ...r,
      landedCost,
      freightValue: hist?.freightValue ?? null,
      taxValue: hist?.taxValue ?? null,
      priceAlert: hist?.priceAlert === "yes",
      alertPercent: hist?.alertPercent ? parseFloat(hist.alertPercent) : null,
    };
  });
}

// ─── Image Management → ./db/images ───
export * from "./db/images";
// ─── Auto-Generate Equivalence Groups ────────────────────────────────────────

/**
 * Resultado de um grupo de equivalência gerado automaticamente.
 */
export type AutoEquivGroup = {
  activeIngredient: string;
  /** Produtos agrupados (id, name, supplierId, categoryId, categoryName) */
  members: {
    id: number;
    name: string;
    supplierId: number;
    supplierName: string | null;
    categoryId: number | null;
    categoryName: string | null;
    price: string | null;
    concentration: string | null;
    presentation: string | null;
  }[];
  /** true se o grupo já existe no banco */
  existingGroupId: number | null;
  /** true se o grupo cruza categorias diferentes (ex: vet + humano) */
  crossCategory: boolean;
};

/**
 * Parâmetros de filtro para previewEquivalenceGroups.
 *
 * - batchId: filtra apenas grupos que contêm produtos desse lote de importação.
 * - categoryIdsA / categoryIdsB: modo de cruzamento — só retorna grupos que
 *   possuem pelo menos um produto em cada conjunto de categorias.
 *   Se apenas categoryIdsA for fornecido, filtra produtos dessas categorias.
 *   Se ambos forem fornecidos, exige presença em A E em B (cruzamento).
 */
export type PreviewEquivOptions = {
  batchId?: number;
  categoryIdsA?: number[];
  categoryIdsB?: number[];
};

/**
 * Analisa os produtos ativos e propõe grupos de equivalência baseados no
 * campo activeIngredient, com suporte a filtros de cruzamento de categorias.
 */
export async function previewEquivalenceGroups(opts: PreviewEquivOptions = {}): Promise<AutoEquivGroup[]> {
  const { batchId, categoryIdsA, categoryIdsB } = opts;
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // Determina quais categorias incluir na busca inicial
  const allCategoryIds = [
    ...(categoryIdsA ?? []),
    ...(categoryIdsB ?? []),
  ];

  // 1. Busca produtos ativos com activeIngredient preenchido
  //    (filtra por categoria se especificado)
  const baseCondition = and(
    eq(products.isActive, "yes"),
    isNotNull(products.activeIngredient),
    allCategoryIds.length > 0
      ? inArray(products.categoryId, allCategoryIds)
      : undefined
  );

  const allProducts = await db
    .select({
      id: products.id,
      name: products.name,
      activeIngredient: products.activeIngredient,
      supplierId: products.supplierId,
      supplierName: suppliers.name,
      categoryId: products.categoryId,
      categoryName: categories.name,
      price: products.price,
      concentration: products.concentration,
      presentation: products.presentation,
      pharmaceuticalForm: products.pharmaceuticalForm,
      especieAnimal: products.especieAnimal,
      viaAdministracao: products.viaAdministracao,
      importBatchId: products.importBatchId,
    })
    .from(products)
    .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(baseCondition);

  // 2. Normaliza e agrupa por (princ\u00edpio ativo + concentra\u00e7\u00e3o + forma + esp\u00e9cie).
  //    Antes agrupava S\u00d3 por princ\u00edpio ativo, tratando como equivalentes
  //    "Amoxicilina 250mg comprimido (c\u00e3o)" e "Amoxicilina 150mg/mL injet\u00e1vel
  //    (bovino)". A chave composta evita esse falso positivo.
  const normalize = (s: string | null | undefined) =>
    (s ?? "").toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const grouped = new Map<string, typeof allProducts>();
  for (const p of allProducts) {
    if (!p.activeIngredient?.trim()) continue;
    // Forma: usa pharmaceuticalForm; cai para presentation quando ausente.
    const forma = normalize(p.pharmaceuticalForm) || normalize(p.presentation);
    const key = [
      normalize(p.activeIngredient),
      normalize(p.concentration),
      forma,
      normalize(p.especieAnimal),
      normalize(p.viaAdministracao),
    ].join("|");
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(p);
  }

  // 3. Busca grupos de equivalência existentes
  const existingGroups = await db
    .select({ id: equivalenceGroups.id, activeIngredient: equivalenceGroups.activeIngredient })
    .from(equivalenceGroups);
  const existingMap = new Map<string, number>(
    existingGroups.map((g) => [normalize(g.activeIngredient), g.id])
  );

  // 4. Filtra e monta resultado
  const result: AutoEquivGroup[] = [];

  for (const entry of Array.from(grouped.entries())) {
    const key = entry[0];
    const members = entry[1];

    // Filtro de batch
    const hasNewBatch = batchId
      ? members.some((m: (typeof allProducts)[0]) => m.importBatchId === batchId)
      : true;
    if (!hasNewBatch) continue;

    // Filtro de cruzamento: se ambos A e B fornecidos, exige presença em cada conjunto
    if (categoryIdsA && categoryIdsA.length > 0 && categoryIdsB && categoryIdsB.length > 0) {
      const hasA = members.some((m: (typeof allProducts)[0]) => m.categoryId != null && categoryIdsA.includes(m.categoryId));
      const hasB = members.some((m: (typeof allProducts)[0]) => m.categoryId != null && categoryIdsB.includes(m.categoryId));
      if (!hasA || !hasB) continue;
    }

    // Precisa de pelo menos 2 produtos
    const uniqueSuppliers = new Set(members.map((m: (typeof allProducts)[0]) => m.supplierId));
    if (uniqueSuppliers.size < 2 && members.length < 2) continue;

    // Detecta cruzamento de categorias
    const uniqueCategories = new Set(members.map((m: (typeof allProducts)[0]) => m.categoryId));
    const crossCategory = uniqueCategories.size > 1;

    // Usa o activeIngredient original (não normalizado) do primeiro produto
    const activeIngredient = members[0].activeIngredient!;

    result.push({
      activeIngredient,
      members: members.map((m: (typeof allProducts)[0]) => ({
        id: m.id,
        name: m.name,
        supplierId: m.supplierId,
        supplierName: m.supplierName,
        categoryId: m.categoryId,
        categoryName: m.categoryName,
        price: m.price,
        concentration: m.concentration,
        presentation: m.presentation,
      })),
      existingGroupId: existingMap.get(key) ?? null,
      crossCategory,
    });
  }

  // Ordena: cross-category primeiro, depois por número de membros desc
  result.sort((a, b) => {
    if (a.crossCategory !== b.crossCategory) return a.crossCategory ? -1 : 1;
    return b.members.length - a.members.length;
  });

  return result;
}

/**
 * Aplica os grupos de equivalência selecionados:
 * - Se o grupo já existe (existingGroupId != null): adiciona os novos membros
 * - Se não existe: cria o grupo e adiciona todos os membros
 *
 * Retorna: { created, updated, skipped }
 */
export async function applyEquivalenceGroups(
  groups: { activeIngredient: string; productIds: number[]; existingGroupId: number | null }[]
): Promise<{ created: number; updated: number; skipped: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const g of groups) {
    if (g.productIds.length === 0) { skipped++; continue; }

    let groupId = g.existingGroupId;

    if (!groupId) {
      // Cria novo grupo
      const [result] = await db.insert(equivalenceGroups).values({
        activeIngredient: g.activeIngredient,
      });
      groupId = (result as any).insertId as number;
      created++;
    } else {
      updated++;
    }

    // Adiciona membros (ignora duplicatas via onDuplicateKeyUpdate)
    for (const productId of g.productIds) {
      await db
        .insert(equivalenceMembers)
        .values({ groupId, productId })
        .onDuplicateKeyUpdate({ set: { groupId, productId } });
    }
  }

  return { created, updated, skipped };
}

/**
 * Retorna estatísticas dos grupos de equivalência:
 * - Total de grupos
 * - Total de membros
 * - Grupos com cruzamento vet/humano
 */
export async function getEquivalenceStats(): Promise<{
  totalGroups: number;
  totalMembers: number;
  crossCategoryGroups: number;
}> {
  const db = await getDb();
  if (!db) return { totalGroups: 0, totalMembers: 0, crossCategoryGroups: 0 };

  const [groupCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(equivalenceGroups);

  const [memberCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(equivalenceMembers);

  // Grupos com membros em mais de uma categoria
  const crossQuery = await db
    .select({
      groupId: equivalenceMembers.groupId,
      categoryCount: sql<number>`count(distinct ${products.categoryId})`,
    })
    .from(equivalenceMembers)
    .leftJoin(products, eq(equivalenceMembers.productId, products.id))
    .groupBy(equivalenceMembers.groupId)
    .having(sql`count(distinct ${products.categoryId}) > 1`);

  return {
    totalGroups: Number(groupCount?.count ?? 0),
    totalMembers: Number(memberCount?.count ?? 0),
    crossCategoryGroups: crossQuery.length,
  };
}

// ─── Sugestão de Produtos a partir de Lista de Texto ─────────────────────────

/**
 * Dado uma lista de nomes de produtos (texto livre), busca no banco o melhor
 * match para cada item, retornando o produto com menor preço e equivalências.
 */
export async function suggestProductsFromList(
  productNames: string[]
): Promise<
  Array<{
    inputName: string;
    matchedProduct: {
      id: number;
      name: string;
      activeIngredient: string | null;
      manufacturer: string | null;
      concentration: string | null;
      presentation: string | null;
      price: string | null;
      priceUnit: string | null;
      unit: string | null;
      supplierId: number | null;
      supplierName: string | null;
      categoryName: string | null;
      imageUrl: string | null;
      productUrl: string | null;
    } | null;
    alternatives: Array<{
      id: number;
      name: string;
      price: string | null;
      supplierName: string | null;
      activeIngredient: string | null;
      concentration: string | null;
      imageUrl: string | null;
    }>;
    similarity: number;
  }>
> {
  const db = await getDb();
  if (!db) return productNames.map((n) => ({ inputName: n, matchedProduct: null, alternatives: [], similarity: 0 }));

  const results = [];

  for (const rawName of productNames) {
    const name = rawName.trim();
    if (!name) continue;

    // Normaliza tokens do input
    const inputTokens = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2);

    // Busca candidatos por LIKE em múltiplos campos
    const term = `%${escapeLike(name)}%`;
    const shortTokenTerm = inputTokens.length > 0 ? `%${inputTokens[0]}%` : term;

    const candidates = await db
      .select({
        id: products.id,
        name: products.name,
        activeIngredient: products.activeIngredient,
        manufacturer: products.manufacturer,
        concentration: products.concentration,
        presentation: products.presentation,
        price: products.price,
        priceUnit: products.priceUnit,
        unit: products.unit,
        supplierId: products.supplierId,
        supplierName: suppliers.name,
        categoryName: categories.name,
        imageUrl: products.imageUrl,
        productUrl: products.productUrl,
      })
      .from(products)
      .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(
        and(
          eq(products.isActive, "yes"),
          or(
            like(products.name, term),
            like(products.name, shortTokenTerm),
            like(products.activeIngredient, term)
          )!
        )
      )
      .orderBy(asc(products.price))
      .limit(30);

    if (candidates.length === 0) {
      results.push({ inputName: name, matchedProduct: null, alternatives: [], similarity: 0 });
      continue;
    }

    // Calcula similaridade Jaccard por tokens
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 1);

    const inputSet = new Set(inputTokens);

    let bestMatch = candidates[0];
    let bestSim = 0;

    for (const c of candidates) {
      const cTokens = normalize(c.name);
      const cSet = new Set(cTokens);
      const intersection = Array.from(inputSet).filter((t) => cSet.has(t)).length;
      const union = new Set(Array.from(inputSet).concat(Array.from(cSet))).size;
      const sim = union > 0 ? intersection / union : 0;
      if (sim > bestSim) {
        bestSim = sim;
        bestMatch = c;
      }
    }

    // Busca alternativas pelo mesmo princípio ativo (se disponível)
    let alternatives: typeof candidates = [];
    if (bestMatch.activeIngredient) {
      const altTerm = `%${bestMatch.activeIngredient}%`;
      alternatives = await db
        .select({
          id: products.id,
          name: products.name,
          activeIngredient: products.activeIngredient,
          manufacturer: products.manufacturer,
          concentration: products.concentration,
          presentation: products.presentation,
          price: products.price,
          priceUnit: products.priceUnit,
          unit: products.unit,
          supplierId: products.supplierId,
          supplierName: suppliers.name,
          categoryName: categories.name,
          imageUrl: products.imageUrl,
          productUrl: products.productUrl,
        })
        .from(products)
        .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(
          and(
            eq(products.isActive, "yes"),
            like(products.activeIngredient, altTerm),
            sql`${products.id} != ${bestMatch.id}`
          )
        )
        .orderBy(asc(products.price))
        .limit(5);
    }

    results.push({
      inputName: name,
      matchedProduct: bestMatch,
      alternatives: alternatives.map((a) => ({
        id: a.id,
        name: a.name,
        price: a.price,
        supplierName: a.supplierName,
        activeIngredient: a.activeIngredient,
        concentration: a.concentration,
        imageUrl: a.imageUrl,
      })),
      similarity: bestSim,
    });
  }

  return results;
}

// ─── Detecção de Duplicatas na Importação ────────────────────────────────────

export type DuplicateCheckResult = {
  rowIndex: number;
  name: string;
  fichaTecnica: string | null;
  presentation: string | null;
  status: "duplicate" | "new";
  existingId: number | null;
  existingName: string | null;
  existingFichaTecnica: string | null;
  existingPresentation: string | null;
  existingPrice: string | null;
  existingSupplierName: string | null;
};

/**
 * Verifica cada linha da planilha contra a base de produtos pelo tripé
 * Nome (normalizado) + FichaTécnica + Apresentação.
 * Produtos com FichaTécnica ou Apresentação diferentes são considerados DISTINTOS.
 */
export async function checkDuplicatesInRows(
  rows: Array<{ name?: string; fichaTecnica?: string; presentation?: string; ean?: string }>,
  supplierId: number
): Promise<DuplicateCheckResult[]> {
  const db = await getDb();
  if (!db) return rows.map((r, i) => ({
    rowIndex: i,
    name: r.name ?? "",
    fichaTecnica: r.fichaTecnica ?? null,
    presentation: r.presentation ?? null,
    status: "new" as const,
    existingId: null,
    existingName: null,
    existingFichaTecnica: null,
    existingPresentation: null,
    existingPrice: null,
    existingSupplierName: null,
  }));

  // Busca todos os produtos ativos do fornecedor para comparação em memória
  const existingProducts = await db
    .select({
      id: products.id,
      name: products.name,
      fichaTecnica: products.fichaTecnica,
      presentation: products.presentation,
      price: products.price,
      supplierName: suppliers.name,
      ean: products.ean,
      gtin: products.gtin,
      barcode: products.barcode,
    })
    .from(products)
    .innerJoin(suppliers, eq(products.supplierId, suppliers.id))
    .where(and(eq(products.supplierId, supplierId), eq(products.isActive, "yes")));

  // Normaliza string para comparação (lowercase, sem acentos, sem espaços extras)
  const normalize = (s: string | null | undefined): string => {
    if (!s) return "";
    return s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  // Normaliza EAN (apenas dígitos)
  const normalizeEan = (s: string | null | undefined): string => {
    if (!s) return "";
    return s.replace(/\D/g, "");
  };

  // Índice 1: por EAN (mais preciso)
  const eanIndex = new Map<string, typeof existingProducts[0]>();
  for (const p of existingProducts) {
    const ean = normalizeEan(p.ean ?? p.gtin ?? p.barcode);
    if (ean.length >= 8) eanIndex.set(ean, p);
  }

  // Índice 2: por tripé Nome|FichaTécnica|Apresentação (exato)
  // REGRA: produtos com FichaTécnica OU Apresentação diferentes são DISTINTOS
  const tripleIndex = new Map<string, typeof existingProducts[0]>();
  for (const p of existingProducts) {
    const key = `${normalize(p.name)}|${normalize(p.fichaTecnica)}|${normalize(p.presentation)}`;
    tripleIndex.set(key, p);
  }

  // Índice 3: por Nome normalizado (para fuzzy)
  const nameIndex = existingProducts.map(p => ({ ...p, normName: normalize(p.name) }));

  // Jaro-Winkler simplificado para fuzzy por nome
  function jaroWinkler(s1: string, s2: string): number {
    if (s1 === s2) return 1.0;
    const len1 = s1.length, len2 = s2.length;
    if (len1 === 0 || len2 === 0) return 0.0;
    const matchDist = Math.floor(Math.max(len1, len2) / 2) - 1;
    const s1Matches = new Array(len1).fill(false);
    const s2Matches = new Array(len2).fill(false);
    let matches = 0, transpositions = 0;
    for (let i = 0; i < len1; i++) {
      const start = Math.max(0, i - matchDist);
      const end = Math.min(i + matchDist + 1, len2);
      for (let j = start; j < end; j++) {
        if (s2Matches[j] || s1[i] !== s2[j]) continue;
        s1Matches[i] = true; s2Matches[j] = true; matches++; break;
      }
    }
    if (matches === 0) return 0.0;
    let k = 0;
    for (let i = 0; i < len1; i++) {
      if (!s1Matches[i]) continue;
      while (!s2Matches[k]) k++;
      if (s1[i] !== s2[k]) transpositions++;
      k++;
    }
    const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;
    let prefix = 0;
    for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
      if (s1[i] === s2[i]) prefix++; else break;
    }
    return jaro + prefix * 0.1 * (1 - jaro);
  }

  return rows.map((r, i) => {
    const name = r.name?.trim() ?? "";
    const fichaTecnica = r.fichaTecnica?.trim() ?? null;
    const presentation = r.presentation?.trim() ?? null;
    const eanNorm = normalizeEan(r.ean);

    // Prioridade 1: EAN exato
    if (eanNorm.length >= 8) {
      const match = eanIndex.get(eanNorm);
      if (match) {
        return {
          rowIndex: i, name, fichaTecnica, presentation,
          status: "duplicate" as const,
          existingId: match.id, existingName: match.name,
          existingFichaTecnica: match.fichaTecnica, existingPresentation: match.presentation,
          existingPrice: match.price, existingSupplierName: match.supplierName,
        };
      }
    }

    // Prioridade 2: Tripé exato Nome|FichaTécnica|Apresentação
    // Produtos com FichaTécnica ou Apresentação diferentes são DISTINTOS
    const key = `${normalize(name)}|${normalize(fichaTecnica)}|${normalize(presentation)}`;
    const tripleMatch = tripleIndex.get(key);
    if (tripleMatch) {
      return {
        rowIndex: i, name, fichaTecnica, presentation,
        status: "duplicate" as const,
        existingId: tripleMatch.id, existingName: tripleMatch.name,
        existingFichaTecnica: tripleMatch.fichaTecnica, existingPresentation: tripleMatch.presentation,
        existingPrice: tripleMatch.price, existingSupplierName: tripleMatch.supplierName,
      };
    }

    // Prioridade 3: Fuzzy por nome (Jaro-Winkler >= 0.92) + mesma FichaTécnica + mesma Apresentação
    // REGRA: se FichaTécnica OU Apresentação forem diferentes (e ambas preenchidas), são DISTINTOS
    if (name.length >= 4) {
      const normName = normalize(name);
      const normFicha = normalize(fichaTecnica);
      const normPres = normalize(presentation);
      let bestMatch: typeof existingProducts[0] | null = null;
      let bestScore = 0;
      for (const p of nameIndex) {
        const score = jaroWinkler(normName, p.normName);
        if (score > bestScore) { bestScore = score; bestMatch = p; }
      }
      if (bestScore >= 0.92 && bestMatch) {
        const existingFicha = normalize(bestMatch.fichaTecnica);
        const existingPres = normalize(bestMatch.presentation);
        // FichaTécnica: se ambas preenchidas, devem ser iguais; se uma vazia, não bloqueia
        const fichaMatch = !normFicha || !existingFicha || normFicha === existingFicha;
        // Apresentação: se ambas preenchidas, devem ser iguais; se uma vazia, não bloqueia
        const presMatch = !normPres || !existingPres || existingPres === normPres;
        // Só é duplicata se AMBOS os campos coincidirem (ou estiverem vazios)
        if (fichaMatch && presMatch) {
          return {
            rowIndex: i, name, fichaTecnica, presentation,
            status: "duplicate" as const,
            existingId: bestMatch.id, existingName: bestMatch.name,
            existingFichaTecnica: bestMatch.fichaTecnica, existingPresentation: bestMatch.presentation,
            existingPrice: bestMatch.price, existingSupplierName: bestMatch.supplierName,
          };
        }
      }
    }

    return {
      rowIndex: i, name, fichaTecnica, presentation,
      status: "new" as const,
      existingId: null, existingName: null,
      existingFichaTecnica: null, existingPresentation: null,
      existingPrice: null, existingSupplierName: null,
    };
  });
}

export async function mergeProductFromRow(
  existingId: number,
  data: Partial<InsertProduct>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Remove campos undefined/null para não sobrescrever com vazio
  const updateData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== null && value !== undefined && value !== "") {
      updateData[key] = value;
    }
  }
  if (Object.keys(updateData).length === 0) return;
  await db.update(products).set(updateData as any).where(eq(products.id, existingId));
}

// ─── Sinônimos → ./db/synonyms ───────────────────────────────────────────────
export * from "./db/synonyms";

// ── Templates de Proposta → ./db/proposalTemplates ────────────────────────────
export * from "./db/proposalTemplates";

// ─── Rentabilidade por Categoria → ./db/categoryProfitability ───
export * from "./db/categoryProfitability";
// ─── Match Feedback → ./db/matchFeedback ───
export * from "./db/matchFeedback";
// ─── Detecção e Fusão de Duplicatas ──────────────────────────────────────────

/** Normaliza string para comparação fuzzy */


export type DuplicateGroup = {
  groupId: number;
  reason: "name_similar" | "same_active_ingredient_and_name";
  similarity: number;
  products: Array<{
    id: number;
    name: string;
    activeIngredient: string | null;
    concentration: string | null;
    presentation: string | null;
    price: string | null;
    supplierId: number;
    supplierName: string;
    categoryId: number | null;
    categoryName: string | null;
    isActive: "yes" | "no";
    imageUrl: string | null;
  }>;
};

/**
 * Analisa todos os produtos ativos e retorna grupos de possíveis duplicatas.
 * Critérios:
 *  1. Nomes com similaridade >= threshold (padrão 0.82)
 *  2. Mesmo princípio ativo + nome com similaridade >= 0.65
 * Limita a 200 grupos para não sobrecarregar.
 */
export async function findDuplicateGroups(opts?: {
  threshold?: number;
  supplierId?: number;
  categoryId?: number;
  limit?: number;
}): Promise<DuplicateGroup[]> {
  const db = await getDb();
  if (!db) return [];

  const threshold = opts?.threshold ?? 0.82;
  const limit = opts?.limit ?? 200;

  const conditions: ReturnType<typeof eq>[] = [eq(products.isActive, "yes") as any];
  if (opts?.supplierId) conditions.push(eq(products.supplierId, opts.supplierId) as any);
  if (opts?.categoryId) conditions.push(eq(products.categoryId, opts.categoryId) as any);

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      activeIngredient: products.activeIngredient,
      concentration: products.concentration,
      presentation: products.presentation,
      price: products.price,
      supplierId: products.supplierId,
      supplierName: suppliers.name,
      categoryId: products.categoryId,
      categoryName: categories.name,
      isActive: products.isActive,
      imageUrl: products.imageUrl,
    })
    .from(products)
    .innerJoin(suppliers, eq(products.supplierId, suppliers.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(conditions.length > 0 ? and(...(conditions as any[])) : undefined)
    .orderBy(asc(products.name))
    .limit(5000); // máximo 5000 produtos para análise

  // Indexar por nome normalizado
  const normalized = rows.map(r => ({ ...r, norm: normalizeName(r.name) }));

  const groups: DuplicateGroup[] = [];
  const usedIds = new Set<number>();
  let groupId = 1;

  for (let i = 0; i < normalized.length && groups.length < limit; i++) {
    if (usedIds.has(normalized[i].id)) continue;
    const a = normalized[i];
    const groupMembers = [a];

    for (let j = i + 1; j < normalized.length; j++) {
      if (usedIds.has(normalized[j].id)) continue;
      const b = normalized[j];

      // Critério 1: alta similaridade de nome
      const nameSim = similarity(a.norm, b.norm);
      if (nameSim >= threshold) {
        groupMembers.push(b);
        continue;
      }

      // Critério 2: mesmo princípio ativo + nome similar
      if (
        a.activeIngredient &&
        b.activeIngredient &&
        normalizeName(a.activeIngredient) === normalizeName(b.activeIngredient) &&
        nameSim >= 0.65
      ) {
        groupMembers.push(b);
      }
    }

    if (groupMembers.length >= 2) {
      // Calcular similaridade média do grupo
      let totalSim = 0, count = 0;
      for (let x = 0; x < groupMembers.length; x++) {
        for (let y = x + 1; y < groupMembers.length; y++) {
          totalSim += similarity(groupMembers[x].norm, groupMembers[y].norm);
          count++;
        }
      }
      const avgSim = count > 0 ? totalSim / count : 1;

      const hasCommonAI = groupMembers.every(m =>
        m.activeIngredient &&
        normalizeName(m.activeIngredient) === normalizeName(groupMembers[0].activeIngredient ?? "")
      );

      groups.push({
        groupId: groupId++,
        reason: hasCommonAI ? "same_active_ingredient_and_name" : "name_similar",
        similarity: Math.round(avgSim * 100) / 100,
        products: groupMembers.map(({ norm: _norm, ...p }) => p as any),
      });

      groupMembers.slice(1).forEach(m => usedIds.add(m.id));
      usedIds.add(a.id);
    }
  }

  return groups;
}

/**
 * Funde um grupo de duplicatas: mantém o produto mestre (masterId),
 * redireciona todas as referências de proposal_items para o mestre,
 * e desativa (soft delete) os demais.
 */
export async function mergeProductGroup(
  masterId: number,
  duplicateIds: number[]
): Promise<{ merged: number; redirected: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  if (duplicateIds.length === 0) return { merged: 0, redirected: 0 };

  // Buscar dados do mestre para enriquecer campos vazios com dados dos duplicados
  const [master] = await db.select().from(products).where(eq(products.id, masterId)).limit(1);
  if (!master) throw new Error("Produto mestre não encontrado");

  // Buscar duplicatas para enriquecer campos vazios do mestre
  const dupes = await db.select().from(products).where(inArray(products.id, duplicateIds));

  // Enriquecer mestre com campos dos duplicados (preencher campos vazios)
  const enriched: Partial<typeof master> = {};
  const fillFields = [
    "activeIngredient", "concentration", "presentation", "pharmaceuticalForm",
    "manufacturer", "barcode", "gtin", "mapa", "imageUrl", "productUrl",
    "informacaoTecnica", "description"
  ] as const;

  for (const field of fillFields) {
    if (!master[field]) {
      const donor = dupes.find(d => d[field]);
      if (donor) (enriched as any)[field] = donor[field];
    }
  }

  // Atualizar mestre com campos enriquecidos
  if (Object.keys(enriched).length > 0) {
    await db.update(products).set(enriched as any).where(eq(products.id, masterId));
  }

  // Redirecionar proposal_items para o mestre
  const { proposalItems } = await import("../drizzle/schema");
  const redirectResult = await db
    .update(proposalItems)
    .set({ productId: masterId })
    .where(inArray(proposalItems.productId, duplicateIds));
  const redirected = (redirectResult as any)[0]?.affectedRows ?? 0;

  // Desativar duplicatas (soft delete)
  await db
    .update(products)
    .set({ isActive: "no" })
    .where(inArray(products.id, duplicateIds));

  return { merged: duplicateIds.length, redirected };
}


// ─── Preços por Fornecedor → ./db/supplierPrices ───
export * from "./db/supplierPrices";
// ─── Edital Analyzer → ./db/editalAnalyses ───
export * from "./db/editalAnalyses";
// ─── Match Logs → ./db/matchLogs ───
export * from "./db/matchLogs";