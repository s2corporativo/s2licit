import { and, asc, eq } from "drizzle-orm";
import { categories, equivalenceGroups, equivalenceMembers, products, suppliers } from "../../drizzle/schema";
import { getDb } from "./_client";

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
