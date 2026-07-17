import { and, asc, eq, sql } from "drizzle-orm";
import { categories, equivalenceGroups, products, suppliers } from "../../drizzle/schema";
import { getDb } from "./_client";

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
