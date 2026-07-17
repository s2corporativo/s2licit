import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { categories, equivalenceGroups, equivalenceMembers, products, suppliers } from "../../drizzle/schema";
import { getDb } from "./_client";

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
