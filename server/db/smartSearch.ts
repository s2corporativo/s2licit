import { and, asc, eq, like, or } from "drizzle-orm";
import { categories, products, suppliers } from "../../drizzle/schema";
import { escapeLike } from "./_helpers";
import { getDb } from "./_client";

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
