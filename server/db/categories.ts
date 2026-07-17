import { asc, eq } from "drizzle-orm";
import { categories, type InsertCategory } from "../../drizzle/schema";
import { getDb } from "./_client";

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
