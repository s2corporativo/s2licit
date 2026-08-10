import { and, asc, eq, like, or } from "drizzle-orm";
import { categories, products } from "../../drizzle/schema";
import {
  bestOfferPriceSql,
  bestOfferSupplierIdSql,
  bestOfferSupplierNameSql,
} from "./catalogOfferExpressions";
import { escapeLike } from "./_helpers";
import { getDb } from "./_client";

export async function autocompleteSearch(query: string, limit = 10) {
  const db = await getDb();
  if (!db) return [];
  const term = `%${escapeLike(query)}%`;

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      code: products.code,
      activeIngredient: products.activeIngredient,
      manufacturer: products.manufacturer,
      concentration: products.concentration,
      presentation: products.presentation,
      price: bestOfferPriceSql,
      priceUnit: products.priceUnit,
      imageUrl: products.imageUrl,
      supplierName: bestOfferSupplierNameSql,
      categoryName: categories.name,
      categoryColor: categories.color,
    })
    .from(products)
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
          like(products.gtin, term),
          like(products.ean, term),
          like(products.concentration, term),
          like(products.presentation, term),
          like(products.description, term),
        )!,
      ),
    )
    .orderBy(asc(products.name))
    .limit(limit * 3);

  const seen = new Set<number>();
  const suggestions: Array<{
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
  }> = [];

  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
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
    if (suggestions.length >= limit) break;
  }

  const ingredientSeen = new Set<string>();
  for (const row of rows) {
    if (!row.activeIngredient) continue;
    const ingredient = row.activeIngredient.trim();
    if (
      ingredientSeen.has(ingredient) ||
      !ingredient.toLowerCase().includes(query.toLowerCase())
    ) {
      continue;
    }
    ingredientSeen.add(ingredient);
    suggestions.push({
      id: -1,
      label: ingredient,
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

  return suggestions.slice(0, limit + 5);
}

/**
 * Contrato legado de comparação por princípio ativo. Continua disponível para
 * consumidores antigos, mas o resumo comercial já vem da melhor oferta
 * canônica; novos fluxos de equivalência devem usar o Compêndio.
 */
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
      price: bestOfferPriceSql,
      priceUnit: products.priceUnit,
      unit: products.unit,
      description: products.description,
      supplierId: bestOfferSupplierIdSql,
      categoryId: products.categoryId,
      supplierName: bestOfferSupplierNameSql,
      categoryName: categories.name,
      categoryColor: categories.color,
      imageUrl: products.imageUrl,
      productUrl: products.productUrl,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(asc(bestOfferPriceSql), asc(products.name));
}
