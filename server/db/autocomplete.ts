import { and, asc, eq, like, or } from "drizzle-orm";
import { categories, products, suppliers } from "../../drizzle/schema";
import { escapeLike } from "./_helpers";
import { getDb } from "./_client";

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
