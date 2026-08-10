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
  orderBy?: "price_asc" | "price_desc" | "name_asc" | "name_desc";
}) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };

  const activeFilter = opts.isActive ?? "yes";
  const conditions: any[] = [];
  if (activeFilter !== "all") conditions.push(eq(products.isActive, activeFilter as "yes" | "no"));

  if (opts.categoryIds && opts.categoryIds.length > 0) {
    conditions.push(inArray(products.categoryId, opts.categoryIds));
  } else if (opts.categoryId) {
    conditions.push(eq(products.categoryId, opts.categoryId));
  }
  if (opts.supplierId) conditions.push(eq(products.supplierId, opts.supplierId));

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
      conditions.push(
        or(
          like(products.name, term),
          like(products.activeIngredient, term),
          like(products.description, term),
          like(products.code, term),
          like(products.manufacturer, term),
          like(products.barcode, term),
          like(products.gtin, term),
          like(products.ean, term),
          like(products.mapa, term),
          like(products.catmatCode, term),
          like(products.catmasCode, term),
          like(products.concentration, term),
          like(products.presentation, term),
        )!,
      );
    }
  }

  if (opts.manufacturer) conditions.push(like(products.manufacturer, `%${opts.manufacturer}%`));
  if (opts.priceMin !== undefined) conditions.push(sql`${products.price} >= ${opts.priceMin}`);
  if (opts.priceMax !== undefined) conditions.push(sql`${products.price} <= ${opts.priceMax}`);
  if (opts.hasImage === true) conditions.push(sql`${products.imageUrl} IS NOT NULL AND ${products.imageUrl} != ''`);
  if (opts.hasProductUrl === true) conditions.push(sql`${products.productUrl} IS NOT NULL AND ${products.productUrl} != ''`);
  if (opts.withoutFichaTecnica === true) conditions.push(sql`(${products.fichaTecnica} IS NULL OR ${products.fichaTecnica} = '')`);

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const sortBy = opts.sortBy ?? (opts.orderBy === "price_asc" || opts.orderBy === "price_desc" ? "price" : "name");
  const sortDirFinal = opts.sortDir ?? (opts.orderBy === "price_desc" || opts.orderBy === "name_desc" ? "desc" : "asc");

  let orderClause: any;
  switch (sortBy) {
    case "price": orderClause = sortDirFinal === "desc" ? desc(products.price) : asc(products.price); break;
    case "mapa": orderClause = sortDirFinal === "desc" ? desc(products.mapa) : asc(products.mapa); break;
    case "manufacturer": orderClause = sortDirFinal === "desc" ? desc(products.manufacturer) : asc(products.manufacturer); break;
    case "createdAt": orderClause = sortDirFinal === "desc" ? desc(products.createdAt) : asc(products.createdAt); break;
    default: orderClause = sortDirFinal === "desc" ? desc(products.name) : asc(products.name);
  }

  const productProjection = {
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
    gtin: products.gtin,
    ean: products.ean,
    mapa: products.mapa,
    registroRegulatorio: products.registroRegulatorio,
    catmasCode: products.catmasCode,
    catmatCode: products.catmatCode,
    codigoFornecedor: products.codigoFornecedor,
    informacaoTecnica: products.informacaoTecnica,
    fichaTecnica: products.fichaTecnica,
    subcategoria: products.subcategoria,
    ncm: products.ncm,
    laboratorio: products.laboratorio,
    especieAnimal: products.especieAnimal,
    viaAdministracao: products.viaAdministracao,
    validadeMeses: products.validadeMeses,
    classeTerapeutica: products.classeTerapeutica,
    nomeProduto: products.nomeProduto,
    tipoCatalogo: products.tipoCatalogo,
    statusConfiabilidade: products.statusConfiabilidade,
    freightValue: products.freightValue,
    taxValue: products.taxValue,
    imageUrl: products.imageUrl,
    productUrl: products.productUrl,
    isActive: products.isActive,
    deletedAt: products.deletedAt,
    mergedIntoId: products.mergedIntoId,
    createdAt: products.createdAt,
    updatedAt: products.updatedAt,
    supplierId: products.supplierId,
    categoryId: products.categoryId,
    importBatchId: products.importBatchId,
    supplierName: suppliers.name,
    categoryName: categories.name,
    categoryColor: categories.color,
    categorySlug: categories.slug,
  };

  const [items, countResult] = await Promise.all([
    db.select(productProjection)
      .from(products)
      .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(where)
      .orderBy(orderClause)
      .limit(opts.limit ?? 50)
      .offset(opts.offset ?? 0),
    db.select({ count: sql<number>`count(*)` }).from(products).where(where),
  ]);

  return { items, total: Number(countResult[0]?.count ?? 0) };
}

export async function getProductById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
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
      gtin: products.gtin,
      ean: products.ean,
      mapa: products.mapa,
      registroRegulatorio: products.registroRegulatorio,
      catmasCode: products.catmasCode,
      catmatCode: products.catmatCode,
      codigoFornecedor: products.codigoFornecedor,
      informacaoTecnica: products.informacaoTecnica,
      fichaTecnica: products.fichaTecnica,
      subcategoria: products.subcategoria,
      ncm: products.ncm,
      laboratorio: products.laboratorio,
      especieAnimal: products.especieAnimal,
      viaAdministracao: products.viaAdministracao,
      validadeMeses: products.validadeMeses,
      classeTerapeutica: products.classeTerapeutica,
      nomeProduto: products.nomeProduto,
      tipoCatalogo: products.tipoCatalogo,
      statusConfiabilidade: products.statusConfiabilidade,
      freightValue: products.freightValue,
      taxValue: products.taxValue,
      imageUrl: products.imageUrl,
      productUrl: products.productUrl,
      isActive: products.isActive,
      deletedAt: products.deletedAt,
      mergedIntoId: products.mergedIntoId,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      supplierId: products.supplierId,
      categoryId: products.categoryId,
      importBatchId: products.importBatchId,
      supplierName: suppliers.name,
      categoryName: categories.name,
      categoryColor: categories.color,
      categorySlug: categories.slug,
    })
    .from(products)
    .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.id, id))
    .limit(1);
  return rows[0];
}

export async function createProduct(data: InsertProduct) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(products).values(data);
  const productId = Number((result as any)?.insertId ?? 0);
  if (productId > 0 && data.supplierId && data.price !== undefined) {
    const { upsertProductSupplierPrice } = await import("./supplierPrices");
    await upsertProductSupplierPrice(productId, Number(data.supplierId), data.price == null ? null : String(data.price), {
      codigoFornecedor: data.codigoFornecedor ?? undefined,
      linkProduto: data.productUrl ?? undefined,
      origem: "product_create_legacy_bridge",
    });
  }
  return result;
}

export async function updateProduct(id: number, data: Partial<InsertProduct>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const [existing] = await db
    .select({ supplierId: products.supplierId })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!existing) throw new Error("Produto não encontrado");

  const { price, ...productFields } = data as Partial<InsertProduct> & { price?: string | null };
  const cleanFields = Object.fromEntries(Object.entries(productFields).filter(([, value]) => value !== undefined));
  if (Object.keys(cleanFields).length > 0) {
    await db.update(products).set(cleanFields as Partial<InsertProduct>).where(eq(products.id, id));
  }

  if (price !== undefined) {
    const supplierId = Number((data as any).supplierId ?? existing.supplierId ?? 0);
    if (supplierId > 0) {
      const { upsertProductSupplierPrice } = await import("./supplierPrices");
      await upsertProductSupplierPrice(id, supplierId, price == null ? null : String(price), {
        codigoFornecedor: (data as any).codigoFornecedor ?? undefined,
        linkProduto: (data as any).productUrl ?? undefined,
        origem: "product_update_legacy_bridge",
      });
    } else {
      // Produto canônico sem fornecedor não deve perder a edição; mantém preço
      // legado apenas quando ainda não existe uma oferta associável.
      await db.update(products).set({ price: price as any }).where(eq(products.id, id));
    }
  }
}

/**
 * Exclusão lógica por padrão. O catálogo participa de propostas, equivalências,
 * histórico e ofertas; apagar fisicamente quebrava rastreabilidade e impedia
 * restauração. Purga física, quando necessária, deve ser uma operação administrativa
 * separada e explicitamente auditada.
 */
export async function deleteProduct(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(products).set({ isActive: "no", deletedAt: new Date() }).where(eq(products.id, id));
}

export async function bulkInsertProducts(data: InsertProduct[]): Promise<{ inserted: number; skipped: number; errors: { row: number; name: string; reason: string }[] }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (data.length === 0) return { inserted: 0, skipped: 0, errors: [] };

  let inserted = 0;
  let skipped = 0;
  const errors: { row: number; name: string; reason: string }[] = [];

  for (let i = 0; i < data.length; i += 50) {
    const chunk = data.slice(i, i + 50);
    try {
      const [result] = await db.insert(products).ignore().values(chunk);
      const affectedRows = (result as any).affectedRows ?? chunk.length;
      inserted += affectedRows;
      skipped += chunk.length - affectedRows;
    } catch {
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

  // Importadores legados podem inserir preço diretamente em products; fecha a
  // lacuna criando as ofertas canônicas faltantes após o lote.
  try {
    const { backfillMissingCanonicalOffers } = await import("../services/catalogReconciliationService");
    await backfillMissingCanonicalOffers();
  } catch {
    // A importação do produto não falha por uma reconciliação auxiliar; o boot
    // do catálogo executará a mesma rotina novamente.
  }

  return { inserted, skipped, errors };
}
