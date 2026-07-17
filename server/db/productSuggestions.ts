import { and, asc, eq, like, or, sql } from "drizzle-orm";
import { categories, products, suppliers } from "../../drizzle/schema";
import { escapeLike } from "./_helpers";
import { getDb } from "./_client";

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
