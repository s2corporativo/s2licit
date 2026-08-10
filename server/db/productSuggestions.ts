import { and, asc, eq, like, or, sql } from "drizzle-orm";
import { categories, products } from "../../drizzle/schema";
import {
  bestOfferPriceSql,
  bestOfferSupplierIdSql,
  bestOfferSupplierNameSql,
} from "./catalogOfferExpressions";
import { escapeLike } from "./_helpers";
import { getDb } from "./_client";

type SuggestedProduct = {
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
};

const projection = {
  id: products.id,
  name: products.name,
  activeIngredient: products.activeIngredient,
  manufacturer: products.manufacturer,
  concentration: products.concentration,
  presentation: products.presentation,
  price: bestOfferPriceSql,
  priceUnit: products.priceUnit,
  unit: products.unit,
  supplierId: bestOfferSupplierIdSql,
  supplierName: bestOfferSupplierNameSql,
  categoryName: categories.name,
  imageUrl: products.imageUrl,
  productUrl: products.productUrl,
};

function tokenize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function jaccard(inputTokens: string[], candidateName: string) {
  const inputSet = new Set(inputTokens);
  const candidateSet = new Set(tokenize(candidateName));
  const intersection = [...inputSet].filter((token) => candidateSet.has(token)).length;
  const union = new Set([...inputSet, ...candidateSet]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Sugestão legada usada por propostas. A identidade permanece no produto e o
 * resumo comercial vem sempre da melhor oferta canônica.
 */
export async function suggestProductsFromList(productNames: string[]): Promise<
  Array<{
    inputName: string;
    matchedProduct: SuggestedProduct | null;
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
  if (!db) {
    return productNames.map((name) => ({
      inputName: name,
      matchedProduct: null,
      alternatives: [],
      similarity: 0,
    }));
  }

  const results = [];
  for (const rawName of productNames.slice(0, 200)) {
    const name = rawName.trim();
    if (!name) continue;

    const inputTokens = tokenize(name).filter((token) => token.length > 2);
    const term = `%${escapeLike(name)}%`;
    const shortTokenTerm = inputTokens.length > 0 ? `%${escapeLike(inputTokens[0])}%` : term;

    const candidates = await db
      .select(projection)
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(
        and(
          eq(products.isActive, "yes"),
          or(
            like(products.name, term),
            like(products.name, shortTokenTerm),
            like(products.activeIngredient, term),
          )!,
        ),
      )
      .orderBy(asc(bestOfferPriceSql), asc(products.name))
      .limit(30);

    if (!candidates.length) {
      results.push({ inputName: name, matchedProduct: null, alternatives: [], similarity: 0 });
      continue;
    }

    let bestMatch = candidates[0] as SuggestedProduct;
    let bestSimilarity = 0;
    for (const candidate of candidates) {
      const similarity = jaccard(inputTokens, candidate.name);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = candidate as SuggestedProduct;
      }
    }

    let alternatives: SuggestedProduct[] = [];
    if (bestMatch.activeIngredient) {
      const alternativeTerm = `%${escapeLike(bestMatch.activeIngredient)}%`;
      alternatives = (await db
        .select(projection)
        .from(products)
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(
          and(
            eq(products.isActive, "yes"),
            like(products.activeIngredient, alternativeTerm),
            sql`${products.id} <> ${bestMatch.id}`,
          ),
        )
        .orderBy(asc(bestOfferPriceSql), asc(products.name))
        .limit(5)) as SuggestedProduct[];
    }

    results.push({
      inputName: name,
      matchedProduct: bestMatch,
      alternatives: alternatives.map((alternative) => ({
        id: alternative.id,
        name: alternative.name,
        price: alternative.price,
        supplierName: alternative.supplierName,
        activeIngredient: alternative.activeIngredient,
        concentration: alternative.concentration,
        imageUrl: alternative.imageUrl,
      })),
      similarity: bestSimilarity,
    });
  }

  return results;
}
