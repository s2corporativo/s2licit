import { and, asc, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { InsertProduct, categories, products, suppliers } from "../../drizzle/schema";
import { escapeLike, simplifyDbError } from "./_helpers";
import { getDb } from "./_client";

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


