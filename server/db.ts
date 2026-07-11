import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, like, ne, notInArray, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql2 from "mysql2/promise";
import { escapeLike, simplifyDbError, normalize, matches, normalizeName, levenshtein, similarity } from "./db/_helpers";
import {
  Category,
  InsertCategory,
  InsertCompanySettings,
  InsertImportLog,
  InsertProduct,
  InsertProposal,
  InsertProposalItem,
  InsertProposalStatusHistory,
  InsertFinancialEntry,
  InsertQuotation,
  InsertQuotationItem,
  InsertRequestingOrg,
  InsertSupplier,
  categories,
  companySettings,
  equivalenceGroups,
  equivalenceMembers,
  financialEntries,
  importLogs,
  products,
  proposalItems,
  proposalStatusHistory,
  proposals,
  quotationItems,
  quotations,
  requestingOrgs,
  suppliers,
  users,
  masterProducts,
  type InsertUser,
  type MasterProduct,
  type InsertMasterProduct,
  synonyms,
  type Synonym,
  type InsertSynonym,
  proposalTemplates,
  type ProposalTemplate,
  type InsertProposalTemplate,
  matchFeedback,
  type MatchFeedback,
  type InsertMatchFeedback,
  type LicitacaoDescoberta,
  type InsertLicitacaoDescoberta,
  type DocumentoHabilitacao,
  type InsertDocumentoHabilitacao,
  editalAnalyses,
  type EditalAnalysis,
  type InsertEditalAnalysis,
  matchLogs,
  type MatchLog,
  type InsertMatchLog,
  matchFeedbackV2,
  type MatchFeedbackV2,
  type InsertMatchFeedbackV2,
  productSupplierPrices,
  type ProductSupplierPrice,
  type InsertProductSupplierPrice,
  radarOpportunities,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

/**
 * Escapa caracteres especiais do operador LIKE no MySQL.
 * Previne LIKE injection via wildcards % e _.
 */

let _db: ReturnType<typeof drizzle> | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Retorna instância do banco com pool de conexões MySQL2.
 * Pool evita ECONNRESET em produção com carga concorrente.
 */
export async function getDb() {
  if (_db) return _db;
  if (!process.env.DATABASE_URL) return null;
  try {
    const pool = mysql2.createPool({
      uri: process.env.DATABASE_URL,
      connectionLimit: 10,
      waitForConnections: true,
      queueLimit: 0,
      connectTimeout: 10000,
    });
    _db = drizzle(pool) as any;
    console.log("[Database] Pool de conexões iniciado (limit=10)");
  } catch (error) {
    console.warn("[Database] Falha ao criar pool:", error);
    _db = null;
  }
  return _db;
}

/** @deprecated Pool gerencia reconexões automaticamente — mantido por compatibilidade */
export function resetDb() {
  _db = null;
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  textFields.forEach((field) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  });
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Categories ──────────────────────────────────────────────────────────────

export async function listCategories() {
  const db = await getDb();
  if (!db) return [];
  const all = await db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name));
  return all;
}

export async function listCategoriesHierarchy() {
  const db = await getDb();
  if (!db) return [];
  const all = await db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name));
  type CatWithChildren = (typeof all)[0] & { children: (typeof all)[0][] };
  const parents = all.filter((c) => !c.parentId) as CatWithChildren[];
  for (const p of parents) {
    p.children = all.filter((c) => c.parentId === p.id);
  }
  return parents;
}

export async function getCategoryById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  return result[0];
}

export async function createCategory(data: InsertCategory) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(categories).values(data);
  return result;
}

export async function updateCategory(id: number, data: Partial<InsertCategory>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(categories).set(data).where(eq(categories.id, id));
}

export async function deleteCategory(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(categories).where(eq(categories.id, id));
}

// ─── Suppliers ───────────────────────────────────────────────────────────────

export async function listSuppliers(activeOnly = false) {
  const db = await getDb();
  if (!db) return [];
  const query = db.select().from(suppliers).orderBy(asc(suppliers.name));
  if (activeOnly) {
    return db.select().from(suppliers).where(eq(suppliers.isActive, "yes")).orderBy(asc(suppliers.name));
  }
  return query;
}

export async function getSupplierById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1);
  return result[0];
}

export async function createSupplier(data: InsertSupplier) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(suppliers).values(data);
  return result;
}

export async function updateSupplier(id: number, data: Partial<InsertSupplier>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(suppliers).set(data).where(eq(suppliers.id, id));
}

export async function deleteSupplier(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(suppliers).where(eq(suppliers.id, id));
}

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

// ─── Equivalence Groups ──────────────────────────────────────────────────────

export async function listEquivalenceGroups(categoryId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = categoryId ? [eq(equivalenceGroups.categoryId, categoryId)] : [];
  return db
    .select()
    .from(equivalenceGroups)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(equivalenceGroups.activeIngredient));
}

export async function getEquivalenceGroupWithMembers(groupId: number) {
  const db = await getDb();
  if (!db) return null;
  const group = await db
    .select()
    .from(equivalenceGroups)
    .where(eq(equivalenceGroups.id, groupId))
    .limit(1);
  if (!group[0]) return null;

  const members = await db
    .select({
      memberId: equivalenceMembers.id,
      productId: products.id,
      productName: products.name,
      activeIngredient: products.activeIngredient,
      price: products.price,
      priceUnit: products.priceUnit,
      manufacturer: products.manufacturer,
      concentration: products.concentration,
      presentation: products.presentation,
      unit: products.unit,
      supplierName: suppliers.name,
      supplierId: products.supplierId,
      categoryName: categories.name,
    })
    .from(equivalenceMembers)
    .leftJoin(products, eq(equivalenceMembers.productId, products.id))
    .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(equivalenceMembers.groupId, groupId))
    .orderBy(asc(products.price));

  return { ...group[0], members };
}

export async function createEquivalenceGroup(data: {
  activeIngredient: string;
  categoryId?: number;
  notes?: string;
  productIds: number[];
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(equivalenceGroups).values({
    activeIngredient: data.activeIngredient,
    categoryId: data.categoryId,
    notes: data.notes,
  });
  const groupId = (result as any).insertId as number;
  if (data.productIds.length > 0) {
    await db.insert(equivalenceMembers).values(
      data.productIds.map((productId) => ({ groupId, productId }))
    );
  }
  return groupId;
}

export async function addEquivalenceMember(groupId: number, productId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .insert(equivalenceMembers)
    .values({ groupId, productId })
    .onDuplicateKeyUpdate({ set: { groupId, productId } });
}

export async function removeEquivalenceMember(groupId: number, productId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .delete(equivalenceMembers)
    .where(and(eq(equivalenceMembers.groupId, groupId), eq(equivalenceMembers.productId, productId)));
}

export async function deleteEquivalenceGroup(groupId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(equivalenceGroups).where(eq(equivalenceGroups.id, groupId));
}

// ─── Import Logs ─────────────────────────────────────────────────────────────

export async function createImportLog(data: InsertImportLog) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Sanitiza categoryId e supplierId: garante null quando vazio ou inválido
  const sanitized = {
    ...data,
    categoryId: data.categoryId && Number(data.categoryId) > 0 ? Number(data.categoryId) : null,
    supplierId: data.supplierId && Number(data.supplierId) > 0 ? Number(data.supplierId) : null,
  };
  const [result] = await db.insert(importLogs).values(sanitized);
  return (result as any).insertId as number;
}

export async function updateImportLog(id: number, data: Partial<InsertImportLog>) {
  const db = await getDb();
  if (!db) return;
  await db.update(importLogs).set(data).where(eq(importLogs.id, id));
}

export async function listImportLogs(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: importLogs.id,
      fileName: importLogs.fileName,
      totalRows: importLogs.totalRows,
      importedRows: importLogs.importedRows,
      errorRows: importLogs.errorRows,
      status: importLogs.status,
      errorMessage: importLogs.errorMessage,
      createdAt: importLogs.createdAt,
      supplierId: importLogs.supplierId,
      categoryId: importLogs.categoryId,
      supplierName: suppliers.name,
      categoryName: categories.name,
    })
    .from(importLogs)
    .leftJoin(suppliers, eq(importLogs.supplierId, suppliers.id))
    .leftJoin(categories, eq(importLogs.categoryId, categories.id))
    .orderBy(desc(importLogs.createdAt))
    .limit(limit);
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export async function getDashboardStats() {
  const db = await getDb();
  if (!db) return null;

  const [totalProducts, totalSuppliers, totalCategories, totalEquivGroups] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(products).where(eq(products.isActive, "yes")),
    db.select({ count: sql<number>`count(*)` }).from(suppliers).where(eq(suppliers.isActive, "yes")),
    db.select({ count: sql<number>`count(*)` }).from(categories),
    db.select({ count: sql<number>`count(*)` }).from(equivalenceGroups),
  ]);

  return {
    totalProducts: Number(totalProducts[0]?.count ?? 0),
    totalSuppliers: Number(totalSuppliers[0]?.count ?? 0),
    totalCategories: Number(totalCategories[0]?.count ?? 0),
    totalEquivGroups: Number(totalEquivGroups[0]?.count ?? 0),
    radarProposals: 0,
    radarWon: 0,
    radarOpportunities: 0,
    radarConversionRate: 0,
  };
}

export async function getProductsPerCategory() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      categoryId: categories.id,
      categoryName: categories.name,
      categoryColor: categories.color,
      count: sql<number>`count(${products.id})`,
    })
    .from(categories)
    .leftJoin(
      products,
      and(eq(products.categoryId, categories.id), eq(products.isActive, "yes"))
    )
    .groupBy(categories.id, categories.name, categories.color)
    .orderBy(asc(categories.sortOrder));
}

// ─── Quotations ──────────────────────────────────────────────────────────────

export async function createQuotation(data: InsertQuotation): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(quotations).values(data);
  return (result[0] as any).insertId as number;
}

export async function listQuotations(): Promise<
  { id: number; title: string; clientName: string | null; status: string; createdAt: Date; updatedAt: Date; itemCount: number }[]
> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: quotations.id,
      title: quotations.title,
      clientName: quotations.clientName,
      status: quotations.status,
      createdAt: quotations.createdAt,
      updatedAt: quotations.updatedAt,
      itemCount: sql<number>`count(${quotationItems.id})`,
    })
    .from(quotations)
    .leftJoin(quotationItems, eq(quotationItems.quotationId, quotations.id))
    .groupBy(quotations.id, quotations.title, quotations.clientName, quotations.status, quotations.createdAt, quotations.updatedAt)
    .orderBy(desc(quotations.createdAt));
  return rows;
}

export async function getQuotationWithItems(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [quotation] = await db.select().from(quotations).where(eq(quotations.id, id)).limit(1);
  if (!quotation) return null;
  const items = await db
    .select()
    .from(quotationItems)
    .where(eq(quotationItems.quotationId, id))
    .orderBy(asc(quotationItems.sortOrder), asc(quotationItems.id));
  return { ...quotation, items };
}

export async function updateQuotation(
  id: number,
  data: Partial<InsertQuotation>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(quotations).set(data).where(eq(quotations.id, id));
}

export async function deleteQuotation(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(quotations).where(eq(quotations.id, id));
}

export async function addQuotationItem(data: InsertQuotationItem): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(quotationItems).values(data);
  return (result[0] as any).insertId as number;
}

export async function updateQuotationItem(
  id: number,
  data: Partial<InsertQuotationItem>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(quotationItems).set(data).where(eq(quotationItems.id, id));
}

export async function removeQuotationItem(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(quotationItems).where(eq(quotationItems.id, id));
}

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

// ─── Company Settings ─────────────────────────────────────────────────────────

export async function getCompanySettings() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(companySettings).limit(1);
  return rows[0] ?? null;
}

export async function upsertCompanySettings(data: Partial<InsertCompanySettings>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await getCompanySettings();
  if (existing) {
    await db.update(companySettings).set(data).where(eq(companySettings.id, existing.id));
    return existing.id;
  } else {
    const [result] = await db.insert(companySettings).values(data as InsertCompanySettings);
    return (result as any).insertId as number;
  }
}

// ─── Requesting Orgs ──────────────────────────────────────────────────────────

export async function listRequestingOrgs(search?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions = search ? [like(requestingOrgs.name, `%${search}%`)] : [];
  return db
    .select()
    .from(requestingOrgs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(requestingOrgs.name));
}

export async function getRequestingOrgById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(requestingOrgs).where(eq(requestingOrgs.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function upsertRequestingOrg(data: InsertRequestingOrg) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Check if org with same name exists
  const existing = await db
    .select()
    .from(requestingOrgs)
    .where(eq(requestingOrgs.name, data.name))
    .limit(1);
  if (existing[0]) {
    await db.update(requestingOrgs).set(data).where(eq(requestingOrgs.id, existing[0].id));
    return existing[0].id;
  }
  const [result] = await db.insert(requestingOrgs).values(data);
  return (result as any).insertId as number;
}

export async function updateRequestingOrg(id: number, data: Partial<InsertRequestingOrg>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(requestingOrgs).set(data).where(eq(requestingOrgs.id, id));
}

export async function deleteRequestingOrg(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(requestingOrgs).where(eq(requestingOrgs.id, id));
}

// ─── Proposals ────────────────────────────────────────────────────────────────

export async function listProposals() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: proposals.id,
      processNumber: proposals.processNumber,
      orgId: proposals.orgId,
      orgName: proposals.orgName,
      title: proposals.title,
      status: proposals.status,
      validityDays: proposals.validityDays,
      paymentTerms: proposals.paymentTerms,
      deliveryTerms: proposals.deliveryTerms,
      notes: proposals.notes,
      createdAt: proposals.createdAt,
      updatedAt: proposals.updatedAt,
    })
    .from(proposals)
    .orderBy(desc(proposals.createdAt));
}

export async function getProposalWithItems(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, id)).limit(1);
  if (!proposal) return null;
  const items = await db
    .select()
    .from(proposalItems)
    .where(eq(proposalItems.proposalId, id))
    .orderBy(asc(proposalItems.sortOrder), asc(proposalItems.itemNumber));
  return { ...proposal, items };
}

export async function createProposal(data: InsertProposal) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(proposals).values(data);
  return (result as any).insertId as number;
}

export async function updateProposal(id: number, data: Partial<InsertProposal>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(proposals).set(data).where(eq(proposals.id, id));
}

export async function deleteProposal(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(proposals).where(eq(proposals.id, id));
}

export async function addProposalItem(data: InsertProposalItem) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Auto-assign item number
  const existing = await db
    .select({ max: sql<number>`MAX(${proposalItems.itemNumber})` })
    .from(proposalItems)
    .where(eq(proposalItems.proposalId, data.proposalId));
  const nextNum = (existing[0]?.max ?? 0) + 1;
  const total = data.unitPrice && data.quantity
    ? (parseFloat(String(data.unitPrice)) * data.quantity).toFixed(2)
    : null;
  const [result] = await db.insert(proposalItems).values({
    ...data,
    itemNumber: nextNum,
    totalPrice: total as any,
    sortOrder: nextNum,
  });
  return (result as any).insertId as number;
}

export async function updateProposalItem(id: number, data: Partial<InsertProposalItem>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Recalculate total if price or quantity changed
  // Priority: suggestedPrice > unitPrice for totalPrice calculation
  if (data.suggestedPrice !== undefined || data.unitPrice !== undefined || data.quantity !== undefined) {
    const [existing] = await db.select().from(proposalItems).where(eq(proposalItems.id, id)).limit(1);
    if (existing) {
      const suggestedP = data.suggestedPrice !== undefined ? parseFloat(String(data.suggestedPrice)) : (existing.suggestedPrice ? parseFloat(String(existing.suggestedPrice)) : null);
      const unitP = data.unitPrice !== undefined ? parseFloat(String(data.unitPrice)) : parseFloat(String(existing.unitPrice ?? 0));
      const price = suggestedP !== null ? suggestedP : unitP;
      const qty = data.quantity !== undefined ? data.quantity : existing.quantity;
      data.totalPrice = (price * qty).toFixed(2) as any;
    }
  }
  await db.update(proposalItems).set(data).where(eq(proposalItems.id, id));
}

export async function removeProposalItem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(proposalItems).where(eq(proposalItems.id, id));
}

// ─── Proposal Administration ─────────────────────────────────────────────────

export async function listProposalsAdmin(filters?: {
  status?: string;
  orgName?: string;
  dateFrom?: Date;
  dateTo?: Date;
}) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(proposals)
    .orderBy(desc(proposals.createdAt));

  let result = rows;
  if (filters?.status) result = result.filter((r) => r.status === filters.status);
  if (filters?.orgName) result = result.filter((r) => r.orgName?.toLowerCase().includes(filters.orgName!.toLowerCase()));
  if (filters?.dateFrom) result = result.filter((r) => new Date(r.createdAt) >= filters.dateFrom!);
  if (filters?.dateTo) result = result.filter((r) => new Date(r.createdAt) <= filters.dateTo!);
  return result;
}

export async function advanceProposalStatus(
  id: number,
  newStatus: string,
  notes?: string
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [current] = await db.select().from(proposals).where(eq(proposals.id, id)).limit(1);
  if (!current) throw new Error("Proposal not found");

  const now = new Date();
  const dateFields: Record<string, Date | null> = {};
  if (newStatus === "sent") dateFields.sentAt = now;
  if (newStatus === "order") dateFields.orderedAt = now;
  if (newStatus === "in_transit") dateFields.shippedAt = now;
  if (newStatus === "delivered") dateFields.deliveredAt = now;
  if (newStatus === "cancelled") dateFields.cancelledAt = now;

  await db.update(proposals).set({ status: newStatus as any, ...dateFields }).where(eq(proposals.id, id));

  // Record history
  await db.insert(proposalStatusHistory).values({
    proposalId: id,
    fromStatus: current.status,
    toStatus: newStatus,
    notes: notes ?? null,
  });

  return { success: true };
}

export async function updateProposalFreight(
  id: number,
  data: {
    freightValue?: string | null;
    freightCarrier?: string | null;
    freightTrackingCode?: string | null;
    freightPaidAt?: Date | null;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(proposals).set(data as any).where(eq(proposals.id, id));
}

export async function getProposalStatusHistory(proposalId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(proposalStatusHistory)
    .where(eq(proposalStatusHistory.proposalId, proposalId))
    .orderBy(desc(proposalStatusHistory.createdAt));
}

export async function duplicateProposal(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const original = await getProposalWithItems(id);
  if (!original) throw new Error("Proposal not found");
  const { items, ...proposalData } = original;
  const [newResult] = await db.insert(proposals).values({
    title: `Cópia de ${proposalData.title}`,
    processNumber: proposalData.processNumber,
    orgId: proposalData.orgId,
    orgName: proposalData.orgName,
    status: "draft",
    validityDays: proposalData.validityDays,
    paymentTerms: proposalData.paymentTerms,
    deliveryTerms: proposalData.deliveryTerms,
    notes: proposalData.notes,
  });
  const newId = (newResult as any).insertId as number;
  if (items && items.length > 0) {
    for (const item of items) {
      await db.insert(proposalItems).values({
        proposalId: newId,
        productId: item.productId,
        itemNumber: item.itemNumber,
        productName: item.productName,
        activeIngredient: item.activeIngredient,
        manufacturer: item.manufacturer,
        concentration: item.concentration,
        presentation: item.presentation,
        unit: item.unit,
        supplierName: item.supplierName,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        totalPrice: item.totalPrice,
        notes: item.notes,
        imageUrl: item.imageUrl,
        productUrl: item.productUrl,
        sortOrder: item.sortOrder,
      });
    }
  }
  return newId;
}

// ─── Financial Entries ───────────────────────────────────────────────────────

export async function listFinancialEntries(filters?: {
  type?: "income" | "expense";
  isPaid?: "yes" | "no";
  dateFrom?: Date;
  dateTo?: Date;
  proposalId?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(financialEntries)
    .orderBy(desc(financialEntries.createdAt));

  let result = rows;
  if (filters?.type) result = result.filter((r) => r.type === filters.type);
  if (filters?.isPaid) result = result.filter((r) => r.isPaid === filters.isPaid);
  if (filters?.proposalId) result = result.filter((r) => r.proposalId === filters.proposalId);
  if (filters?.dateFrom) result = result.filter((r) => new Date(r.createdAt) >= filters.dateFrom!);
  if (filters?.dateTo) result = result.filter((r) => new Date(r.createdAt) <= filters.dateTo!);
  return result;
}

export async function createFinancialEntry(data: InsertFinancialEntry) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(financialEntries).values(data);
  return (result as any).insertId as number;
}

export async function updateFinancialEntry(id: number, data: Partial<InsertFinancialEntry>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(financialEntries).set(data).where(eq(financialEntries.id, id));
}

export async function deleteFinancialEntry(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(financialEntries).where(eq(financialEntries.id, id));
}

export async function getFinancialSummary(dateFrom?: Date, dateTo?: Date) {
  const db = await getDb();
  if (!db) return { totalIncome: 0, totalExpense: 0, balance: 0, paidIncome: 0, paidExpense: 0, pendingIncome: 0, pendingExpense: 0 };

  const rows = await db.select().from(financialEntries);
  let filtered = rows;
  if (dateFrom) filtered = filtered.filter((r) => new Date(r.createdAt) >= dateFrom);
  if (dateTo) filtered = filtered.filter((r) => new Date(r.createdAt) <= dateTo);

  const totalIncome = filtered.filter((r) => r.type === "income").reduce((s, r) => s + parseFloat(String(r.amount ?? 0)), 0);
  const totalExpense = filtered.filter((r) => r.type === "expense").reduce((s, r) => s + parseFloat(String(r.amount ?? 0)), 0);
  const paidIncome = filtered.filter((r) => r.type === "income" && r.isPaid === "yes").reduce((s, r) => s + parseFloat(String(r.amount ?? 0)), 0);
  const paidExpense = filtered.filter((r) => r.type === "expense" && r.isPaid === "yes").reduce((s, r) => s + parseFloat(String(r.amount ?? 0)), 0);

  return {
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
    paidIncome,
    paidExpense,
    pendingIncome: totalIncome - paidIncome,
    pendingExpense: totalExpense - paidExpense,
  };
}

export async function getProposalFinancialStats() {
  const db = await getDb();
  if (!db) return { byStatus: [] };
  const rows = await db.select().from(proposals);
  const statusGroups: Record<string, { count: number; total: number }> = {};
  for (const row of rows) {
    const s = row.status ?? "draft";
    if (!statusGroups[s]) statusGroups[s] = { count: 0, total: 0 };
    statusGroups[s].count++;
    statusGroups[s].total += parseFloat(String(row.totalValue ?? 0));
  }
  return {
    byStatus: Object.entries(statusGroups).map(([status, data]) => ({ status, ...data })),
  };
}

// ─── Freight Report ───────────────────────────────────────────────────────────
export async function getFreightReport(dateFrom?: Date, dateTo?: Date) {
  const db = await getDb();
  if (!db) return { byCarrier: [], total: 0, totalPaid: 0 };
  const rows = await db
    .select({
      id: proposals.id,
      title: proposals.title,
      freightValue: proposals.freightValue,
      freightCarrier: proposals.freightCarrier,
      freightTrackingCode: proposals.freightTrackingCode,
      freightPaidAt: proposals.freightPaidAt,
      deliveredAt: proposals.deliveredAt,
      status: proposals.status,
    })
    .from(proposals)
    .where(sql`${proposals.freightValue} IS NOT NULL AND CAST(${proposals.freightValue} AS DECIMAL) > 0`);

  let filtered = rows;
  if (dateFrom) filtered = filtered.filter((r) => r.deliveredAt && new Date(r.deliveredAt) >= dateFrom);
  if (dateTo) filtered = filtered.filter((r) => r.deliveredAt && new Date(r.deliveredAt) <= dateTo);

  // Group by carrier
  const byCarrier: Record<string, { carrier: string; count: number; total: number; paid: number; items: typeof filtered }> = {};
  for (const row of filtered) {
    const carrier = row.freightCarrier ?? "Sem transportadora";
    if (!byCarrier[carrier]) byCarrier[carrier] = { carrier, count: 0, total: 0, paid: 0, items: [] };
    const val = parseFloat(String(row.freightValue ?? 0));
    byCarrier[carrier].count++;
    byCarrier[carrier].total += val;
    if (row.freightPaidAt) byCarrier[carrier].paid += val;
    byCarrier[carrier].items.push(row);
  }

  const total = filtered.reduce((s, r) => s + parseFloat(String(r.freightValue ?? 0)), 0);
  const totalPaid = filtered.filter((r) => r.freightPaidAt).reduce((s, r) => s + parseFloat(String(r.freightValue ?? 0)), 0);

  return {
    byCarrier: Object.values(byCarrier).sort((a, b) => b.total - a.total),
    total,
    totalPaid,
    items: filtered,
  };
}

// ─── Expiring Proposals ───────────────────────────────────────────────────────
export async function getExpiringProposals(daysAhead = 7) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: proposals.id,
      title: proposals.title,
      processNumber: proposals.processNumber,
      orgName: proposals.orgName,
      status: proposals.status,
      sentAt: proposals.sentAt,
      validityDays: proposals.validityDays,
      createdAt: proposals.createdAt,
    })
    .from(proposals)
    .where(eq(proposals.status, "sent"));

  const now = new Date();
  const cutoff = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  return rows
    .map((r) => {
      // Expiry = sentAt (or createdAt) + validityDays
      const base = r.sentAt ? new Date(r.sentAt) : new Date(r.createdAt);
      const expiresAt = new Date(base.getTime() + (r.validityDays ?? 30) * 24 * 60 * 60 * 1000);
      const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return { ...r, expiresAt, daysLeft };
    })
    .filter((r) => r.expiresAt <= cutoff)
    .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
}

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

import { isSameProduct, stringSimilarity, normalizeStr } from "./fuzzy";

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
  type InsertPriceHistory,
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

// ─── Image Management ─────────────────────────────────────────────────────────

/** Search products by partial name (case-insensitive), returning id, name, manufacturer, imageUrl */
export async function searchProductsByName(nameTerm: string, limit = 50) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      manufacturer: products.manufacturer,
      supplierId: products.supplierId,
      imageUrl: products.imageUrl,
    })
    .from(products)
    .where(like(products.name, `%${nameTerm}%`))
    .orderBy(asc(products.name))
    .limit(limit);
  return rows;
}

/** Busca um produto ativo pelo código CATMAS (Compras MG). */
export async function findProductByCatmas(code: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ id: products.id, name: products.name, price: products.price })
    .from(products)
    .where(eq(products.catmasCode, code))
    .limit(1);
  return rows[0] ?? null;
}

/** Busca um produto ativo pelo código CATMAT (federal). */
export async function findProductByCatmat(code: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ id: products.id, name: products.name, price: products.price })
    .from(products)
    .where(eq(products.catmatCode, code))
    .limit(1);
  return rows[0] ?? null;
}

/** Retorna id/nome/preço de todos os produtos ativos (para matching por nome). */
export async function listProductsForMatching(limit = 20000) {
  const db = await getDb();
  if (!db) return [] as Array<{ id: number; name: string; price: string | null }>;
  const rows = await db
    .select({ id: products.id, name: products.name, price: products.price })
    .from(products)
    .where(eq(products.isActive, "yes"))
    .limit(limit);
  return rows;
}

/** Apply an imageUrl to all products whose name contains nameTerm */
export async function applyImageByName(nameTerm: string, imageUrl: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db
    .update(products)
    .set({ imageUrl })
    .where(like(products.name, `%${nameTerm}%`));
  return { updated: (result as any)[0]?.affectedRows ?? 0 };
}

// ─── Image URL Auto-Linking ────────────────────────────────────────────────────

/**
 * Extrai tokens de nome de uma URL de imagem.
 * Ex: "https://cdn.site.com/produtos/ivermectina-1-pour-on-5l.jpg"
 *   → ["ivermectina", "1", "pour", "on", "5l"]
 */
export function extractTokensFromUrl(url: string): string[] {
  try {
    const parsed = new URL(url);
    // Pega o último segmento do pathname (nome do arquivo)
    const segments = parsed.pathname.split("/").filter(Boolean);
    const filename = segments[segments.length - 1] ?? "";
    // Remove extensão
    const base = filename.replace(/\.[a-z0-9]+$/i, "");
    // Divide por separadores comuns: -, _, ., +, %20, espaço
    const tokens = base
      .replace(/%20/g, " ")
      .replace(/[_\-+.]/g, " ")
      .split(/\s+/)
      .map((t) => t.toLowerCase().trim())
      .filter((t) => t.length >= 2);
    return tokens;
  } catch {
    return [];
  }
}

/**
 * Dado um array de URLs de imagem (sem nome de produto associado),
 * tenta vincular cada URL a um produto pelo fuzzy match entre os tokens
 * extraídos da URL e os nomes dos produtos no banco.
 *
 * Retorna: { imageUrl, matchedProductId, matchedProductName, similarity, tokens }[]
 */
export async function autoLinkImageUrls(imageUrls: string[]): Promise<
  {
    imageUrl: string;
    tokens: string[];
    matchedProductId: number | null;
    matchedProductName: string | null;
    similarity: number;
  }[]
> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // Busca todos os produtos ativos (id, name)
  const allProducts = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(eq(products.isActive, "yes"))
    .limit(10000);

  const { stringSimilarity } = await import("./fuzzy.js");

  const results = imageUrls.map((url) => {
    const tokens = extractTokensFromUrl(url);
    if (tokens.length === 0) {
      return { imageUrl: url, tokens, matchedProductId: null, matchedProductName: null, similarity: 0 };
    }

    // Monta uma string de busca com os tokens
    const searchStr = tokens.join(" ");

    let bestMatch: { id: number; name: string; similarity: number } | null = null;

    for (const p of allProducts) {
      const sim = stringSimilarity(searchStr, p.name);
      if (!bestMatch || sim > bestMatch.similarity) {
        bestMatch = { id: p.id, name: p.name, similarity: sim };
      }
    }

    if (bestMatch && bestMatch.similarity >= 0.7) {
      return {
        imageUrl: url,
        tokens,
        matchedProductId: bestMatch.id,
        matchedProductName: bestMatch.name,
        similarity: bestMatch.similarity,
      };
    }
    return { imageUrl: url, tokens, matchedProductId: null, matchedProductName: null, similarity: bestMatch?.similarity ?? 0 };
  });

  return results;
}

/**
 * Aplica as URLs de imagem nos produtos correspondentes (em lote).
 * Recebe array de { productId, imageUrl }.
 */
export async function bulkApplyImageUrls(
  items: { productId: number; imageUrl: string }[]
): Promise<{ updated: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  let updated = 0;
  for (const item of items) {
    await db.update(products).set({ imageUrl: item.imageUrl }).where(eq(products.id, item.productId));
    updated++;
  }
  return { updated };
}

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
      importBatchId: products.importBatchId,
    })
    .from(products)
    .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(baseCondition);

  // 2. Normaliza e agrupa por activeIngredient
  const normalize = (s: string) =>
    s.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const grouped = new Map<string, typeof allProducts>();
  for (const p of allProducts) {
    if (!p.activeIngredient?.trim()) continue;
    const key = normalize(p.activeIngredient);
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

// ─── Sinônimos ────────────────────────────────────────────────────────────────

export async function listSynonyms(opts?: {
  category?: string;
  search?: string;
  activeOnly?: boolean;
}): Promise<Synonym[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const conditions = [];
    if (opts?.activeOnly !== false) conditions.push(eq(synonyms.isActive, "yes"));
    if (opts?.category && opts.category !== "all") conditions.push(eq(synonyms.category as any, opts.category));
    if (opts?.search) {
      conditions.push(
        or(
          like(synonyms.term, `%${opts.search}%`),
          like(synonyms.canonical, `%${opts.search}%`)
        )!
      );
    }
    const rows = await db
      .select()
      .from(synonyms)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(synonyms.canonical), asc(synonyms.term));
    return rows as Synonym[];
  } catch (error) {
    console.error("[listSynonyms] Error:", error);
    return [];
  }
}

export async function createSynonym(data: InsertSynonym): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(synonyms).values(data);
  return (result as any).insertId as number;
}

export async function updateSynonym(id: number, data: Partial<InsertSynonym>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(synonyms).set(data as any).where(eq(synonyms.id, id));
}

export async function deleteSynonym(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(synonyms).where(eq(synonyms.id, id));
}

export async function bulkCreateSynonyms(data: InsertSynonym[]): Promise<number> {
  const db = await getDb();
  if (!db || data.length === 0) return 0;
  // Insert in batches of 100
  let count = 0;
  for (let i = 0; i < data.length; i += 100) {
    const batch = data.slice(i, i + 100);
    await db.insert(synonyms).values(batch).onDuplicateKeyUpdate({ set: { updatedAt: sql`now()` } });
    count += batch.length;
  }
  return count;
}

/**
 * Carrega todos os sinônimos ativos e retorna um Map: term_normalizado → [canonical_normalizado, ...]
 * Usado pelo algoritmo de matching para expandir termos de busca.
 */
export async function loadSynonymMap(): Promise<Map<string, string[]>> {
  const db = await getDb();
  if (!db) return new Map();
  try {
    const rows = await db
      .select({ term: synonyms.term, canonical: synonyms.canonical })
      .from(synonyms)
      .where(eq(synonyms.isActive, "yes"));
    const map = new Map<string, string[]>();
    const norm = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "").trim();
    for (const row of rows) {
      const t = norm(row.term);
      const c = norm(row.canonical);
      if (!t || !c) continue;
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(c);
      // Também mapeia o canônico para si mesmo (para busca direta)
      if (!map.has(c)) map.set(c, []);
      if (!map.get(c)!.includes(c)) map.get(c)!.push(c);
    }
    return map;
  } catch (error) {
    console.error("[loadSynonymMap] Error:", error);
    return new Map();
  }
}

// ── Bulk toggle sinônimos (ativar/desativar em lote) ──────────────────────────
export async function bulkToggleSynonyms(ids: number[], isActive: "yes" | "no"): Promise<number> {
  const db = await getDb();
  if (!db || ids.length === 0) return 0;
  await db
    .update(synonyms)
    .set({ isActive, updatedAt: new Date() } as any)
    .where(inArray(synonyms.id, ids));
  return ids.length;
}

// ── Bulk delete sinônimos ─────────────────────────────────────────────────────
export async function bulkDeleteSynonyms(ids: number[]): Promise<number> {
  const db = await getDb();
  if (!db || ids.length === 0) return 0;
  await db.delete(synonyms).where(inArray(synonyms.id, ids));
  return ids.length;
}

// ── Templates de Proposta ─────────────────────────────────────────────────────
export async function listProposalTemplates(): Promise<ProposalTemplate[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(proposalTemplates).orderBy(asc(proposalTemplates.name));
  } catch (error) {
    console.error("[listProposalTemplates] Error:", error);
    return [];
  }
}

export async function getProposalTemplate(id: number): Promise<ProposalTemplate | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const rows = await db.select().from(proposalTemplates).where(eq(proposalTemplates.id, id)).limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error("[getProposalTemplate] Error:", error);
    return null;
  }
}

export async function createProposalTemplate(data: InsertProposalTemplate): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Se isDefault=yes, desmarcar os outros
  if (data.isDefault === "yes") {
    await db.update(proposalTemplates).set({ isDefault: "no" } as any).where(eq(proposalTemplates.isDefault, "yes"));
  }
  const [result] = await db.insert(proposalTemplates).values(data);
  return (result as any).insertId as number;
}

export async function updateProposalTemplate(id: number, data: Partial<InsertProposalTemplate>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  if (data.isDefault === "yes") {
    await db.update(proposalTemplates).set({ isDefault: "no" } as any).where(ne(proposalTemplates.id, id));
  }
  await db.update(proposalTemplates).set({ ...data, updatedAt: new Date() } as any).where(eq(proposalTemplates.id, id));
}

export async function deleteProposalTemplate(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(proposalTemplates).where(eq(proposalTemplates.id, id));
}

export async function getDefaultProposalTemplate(): Promise<ProposalTemplate | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const rows = await db.select().from(proposalTemplates).where(eq(proposalTemplates.isDefault, "yes")).limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error("[getDefaultProposalTemplate] Error:", error);
    return null;
  }
}

// ─── Rentabilidade por Categoria ─────────────────────────────────────────────
export async function getMarginByCategory() {
  const db = await getDb();
  if (!db) return [];
  // Buscar proposal_items com categoria (via products), custo e preço sugerido
  const rows = await db
    .select({
      categoryName: categories.name,
      unitPrice: proposalItems.unitPrice,
      costPrice: proposalItems.costPrice,
      suggestedPrice: proposalItems.suggestedPrice,
      quantity: proposalItems.quantity,
      proposalStatus: proposals.status,
    })
    .from(proposalItems)
    .leftJoin(proposals, eq(proposalItems.proposalId, proposals.id))
    .leftJoin(products, eq(proposalItems.productId, products.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(
      and(
        sql`${proposalItems.suggestedPrice} IS NOT NULL`,
        sql`CAST(${proposalItems.suggestedPrice} AS DECIMAL) > 0`
      )
    );

  // Agrupar por categoria
  const grouped: Record<string, {
    categoryName: string;
    totalRevenue: number;
    totalCost: number;
    itemCount: number;
    deliveredCount: number;
  }> = {};

  for (const row of rows) {
    const key = row.categoryName ?? "Sem Categoria";
    if (!grouped[key]) grouped[key] = { categoryName: key, totalRevenue: 0, totalCost: 0, itemCount: 0, deliveredCount: 0 };
    const qty = parseFloat(String(row.quantity ?? 1));
    const sale = parseFloat(String(row.suggestedPrice ?? 0));
    const cost = parseFloat(String(row.costPrice ?? row.unitPrice ?? 0));
    grouped[key].totalRevenue += sale * qty;
    grouped[key].totalCost += cost * qty;
    grouped[key].itemCount++;
    if (row.proposalStatus === "delivered") grouped[key].deliveredCount++;
  }

  return Object.values(grouped)
    .map((g) => ({
      categoryName: g.categoryName,
      totalRevenue: g.totalRevenue,
      totalCost: g.totalCost,
      itemCount: g.itemCount,
      deliveredCount: g.deliveredCount,
      marginPercent: g.totalRevenue > 0
        ? ((g.totalRevenue - g.totalCost) / g.totalRevenue) * 100
        : 0,
    }))
    .sort((a, b) => b.marginPercent - a.marginPercent);
}

// ─── Match Feedback (Aprendizado de Matching) ────────────────────────────────

/** Normaliza um termo do edital para uso como chave de lookup */
export function normalizeEditalTerm(term: string): string {
  return term
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9\s]/g, " ")    // remove pontuação
    .replace(/\s+/g, " ")
    .trim();
}

/** Carrega o mapa de feedback: editalTerm → { productId, productName, useCount } */
export async function loadFeedbackMap(): Promise<Map<string, { productId: number; productName: string; useCount: number }>> {
  const db = await getDb();
  if (!db) return new Map();
  const rows = await db
    .select({
      editalTerm: matchFeedback.editalTerm,
      productId: matchFeedback.productId,
      productName: matchFeedback.productName,
      useCount: matchFeedback.useCount,
    })
    .from(matchFeedback)
    .orderBy(desc(matchFeedback.useCount));
  const map = new Map<string, { productId: number; productName: string; useCount: number }>();
  for (const row of rows) {
    // Mantém apenas o par com maior useCount por termo
    if (!map.has(row.editalTerm)) {
      map.set(row.editalTerm, {
        productId: row.productId,
        productName: row.productName,
        useCount: row.useCount,
      });
    }
  }
  return map;
}

/** Registra ou incrementa um par aprendido (editalTerm → productId) */
export async function recordFeedback(editalTerm: string, productId: number, productName: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const normalizedTerm = normalizeEditalTerm(editalTerm);
  if (!normalizedTerm) return;
  // Verificar se já existe
  const existing = await db
    .select({ id: matchFeedback.id, useCount: matchFeedback.useCount })
    .from(matchFeedback)
    .where(and(eq(matchFeedback.editalTerm, normalizedTerm), eq(matchFeedback.productId, productId)))
    .limit(1);
  if (existing.length > 0) {
    // Incrementar useCount e atualizar lastUsedAt
    await db
      .update(matchFeedback)
      .set({
        useCount: (existing[0].useCount ?? 1) + 1,
        lastUsedAt: new Date(),
        productName, // atualiza o nome caso tenha mudado
      })
      .where(eq(matchFeedback.id, existing[0].id));
  } else {
    // Inserir novo par
    await db.insert(matchFeedback).values({
      editalTerm: normalizedTerm,
      productId,
      productName,
      useCount: 1,
      confirmedAt: new Date(),
      lastUsedAt: new Date(),
    });
  }
}

/** Lista feedbacks com paginação e busca */
export async function listFeedbacks(opts: {
  page?: number;
  pageSize?: number;
  search?: string;
}): Promise<{ items: MatchFeedback[]; total: number }> {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const { page = 1, pageSize = 50, search } = opts;
  const offset = (page - 1) * pageSize;

  const whereClause = search
    ? or(
        like(matchFeedback.editalTerm, `%${search}%`),
        like(matchFeedback.productName, `%${search}%`)
      )
    : undefined;

  const [items, countRows] = await Promise.all([
    db
      .select()
      .from(matchFeedback)
      .where(whereClause)
      .orderBy(desc(matchFeedback.useCount), desc(matchFeedback.lastUsedAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(matchFeedback)
      .where(whereClause),
  ]);

  return { items, total: Number(countRows[0]?.count ?? 0) };
}

/** Remove um feedback pelo ID */
export async function deleteFeedback(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(matchFeedback).where(eq(matchFeedback.id, id));
}

/** Remove múltiplos feedbacks por IDs */
export async function bulkDeleteFeedback(ids: number[]): Promise<void> {
  const db = await getDb();
  if (!db || ids.length === 0) return;
  await db.delete(matchFeedback).where(inArray(matchFeedback.id, ids));
}

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


// ─── Preços por Fornecedor ────────────────────────────────────────────────────

export async function getProductSupplierPrices(productId: number) {
  const db = await getDb();
  if (!db) return [];
  const { productSupplierPrices, suppliers } = await import("../drizzle/schema");
  const { eq, asc } = await import("drizzle-orm");
  return db.select({
    id: productSupplierPrices.id,
    productId: productSupplierPrices.productId,
    supplierId: productSupplierPrices.supplierId,
    price: productSupplierPrices.price,
    codigoFornecedor: productSupplierPrices.codigoFornecedor,
    linkProduto: productSupplierPrices.linkProduto,
    updatedAt: productSupplierPrices.updatedAt,
    supplierName: suppliers.name,
  })
    .from(productSupplierPrices)
    .leftJoin(suppliers, eq(productSupplierPrices.supplierId, suppliers.id))
    .where(eq(productSupplierPrices.productId, productId))
    .orderBy(asc(productSupplierPrices.supplierId));
}

export async function upsertProductSupplierPrice(
  productId: number,
  supplierId: number,
  price: string | null,
  extra?: { codigoFornecedor?: string; linkProduto?: string; origem?: string }
) {
  const db = await getDb();
  if (!db) return;
  const { productSupplierPrices } = await import("../drizzle/schema");
  const { and, eq } = await import("drizzle-orm");
  const existing = await db.select({ id: productSupplierPrices.id })
    .from(productSupplierPrices)
    .where(and(eq(productSupplierPrices.productId, productId), eq(productSupplierPrices.supplierId, supplierId)))
    .limit(1);
  const now = new Date();
  if (existing.length > 0) {
    await db.update(productSupplierPrices)
      .set({ price, codigoFornecedor: extra?.codigoFornecedor ?? null, linkProduto: extra?.linkProduto ?? null, updatedAt: now })
      .where(and(eq(productSupplierPrices.productId, productId), eq(productSupplierPrices.supplierId, supplierId)));
  } else {
    await db.insert(productSupplierPrices).values({ productId, supplierId, price, codigoFornecedor: extra?.codigoFornecedor ?? null, linkProduto: extra?.linkProduto ?? null, updatedAt: now });
  }
}

export async function getPriceHistory(productId: number, supplierId?: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  const { productSupplierPrices } = await import("../drizzle/schema");
  const { and, eq, desc } = await import("drizzle-orm");
  const conditions = supplierId
    ? and(eq(productSupplierPrices.productId, productId), eq(productSupplierPrices.supplierId, supplierId))
    : eq(productSupplierPrices.productId, productId);
  return db.select().from(productSupplierPrices).where(conditions).orderBy(desc(productSupplierPrices.updatedAt)).limit(limit);
}

export async function findProductByEan(ean: string) {
  const db = await getDb();
  if (!db) return null;
  const { products } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const rows = await db.select().from(products).where(eq((products as any).ean, ean)).limit(1);
  return rows[0] ?? null;
}

export async function deleteProductSupplierPrice(productId: number, supplierId: number) {
  const db = await getDb();
  if (!db) return;
  const { productSupplierPrices } = await import("../drizzle/schema");
  const { and, eq } = await import("drizzle-orm");
  await db.delete(productSupplierPrices).where(and(eq(productSupplierPrices.productId, productId), eq(productSupplierPrices.supplierId, supplierId)));
}

export async function batchUpsertSupplierPrices(entries: Array<{ productId: number; supplierId: number; price: string | null; codigoFornecedor?: string; linkProduto?: string; origem?: string }>) {
  for (const entry of entries) {
    await upsertProductSupplierPrice(entry.productId, entry.supplierId, entry.price, {
      codigoFornecedor: entry.codigoFornecedor,
      linkProduto: entry.linkProduto,
      origem: entry.origem ?? "import",
    });
  }
}

// ─── Edital Analyzer ─────────────────────────────────────────────────────────

export async function listEditalAnalyses() {
  const db = await getDb();
  if (!db) return [];
  const { editalAnalyses } = await import("../drizzle/schema");
  const { desc } = await import("drizzle-orm");
  return db.select().from(editalAnalyses).orderBy(desc(editalAnalyses.createdAt));
}

export async function createEditalAnalysis(data: {
  fileName: string; fileUrl: string; fileKey?: string | null; licitacaoId?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const { editalAnalyses } = await import("../drizzle/schema");
  const [res] = await db.insert(editalAnalyses).values({ ...data, status: "pendente", createdAt: new Date() } as any);
  return (res as any).insertId as number;
}

export async function getEditalAnalysis(id: number) {
  const db = await getDb();
  if (!db) return null;
  const { editalAnalyses } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const rows = await db.select().from(editalAnalyses).where(eq(editalAnalyses.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateEditalAnalysis(id: number, data: Partial<{ status: string; errorMessage: string | null; itensExtraidos: any; proposalId: number | null; prazosEntrega: string | null; condicoesPagamento: string | null; documentosExigidos: any; orgaoComprador: string | null; numeroEdital: string | null; processedAt: Date | null }>) {
  const db = await getDb();
  if (!db) return;
  const { editalAnalyses } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  await db.update(editalAnalyses).set(data as any).where(eq(editalAnalyses.id, id));
}

// ─── Match Logs ───────────────────────────────────────────────────────────────

export async function createMatchLog(data: {
  editalItem: string; editalAnalysisId?: number | null;
  produtoSugeridoId?: number | null; produtoSugeridoNome?: string | null;
  score?: number | null; decisao?: string | null; tempoExecucaoMs?: number | null;
}) {
  const db = await getDb();
  if (!db) return;
  const { matchLogs } = await import("../drizzle/schema");
  await db.insert(matchLogs).values({ ...data, createdAt: new Date() } as any);
}

export async function getMatchLogsByAnalysis(analysisId: number) {
  const db = await getDb();
  if (!db) return [];
  const { matchLogs } = await import("../drizzle/schema");
  const { eq, desc } = await import("drizzle-orm");
  return db.select().from(matchLogs).where(eq(matchLogs.editalAnalysisId, analysisId)).orderBy(desc(matchLogs.createdAt));
}

export async function createMatchFeedbackV2(data: {
  analysisId: number; itemDescription: string; matchedProductId: number;
  feedback: string; userId?: number | null;
}) {
  return createMatchLog({ editalItem: data.itemDescription, editalAnalysisId: data.analysisId, produtoSugeridoId: data.matchedProductId, decisao: data.feedback });
}

export async function listAllProductsForMatching() {
  const db = await getDb();
  if (!db) return [];
  const { products } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  return db.select({
    id: products.id,
    name: products.name,
    fichaTecnica: products.fichaTecnica,
    principioAtivo: (products as any).principioAtivo,
    categoryId: products.categoryId,
  }).from(products).where(eq(products.isActive, "yes")).limit(5000);
}
