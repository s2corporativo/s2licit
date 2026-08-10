import { and, asc, eq, like, sql } from "drizzle-orm";
import { products } from "../../drizzle/schema";
import {
  bestOfferPriceSql,
  bestOfferSupplierIdSql,
  bestOfferSupplierNameSql,
} from "./catalogOfferExpressions";
import { escapeLike } from "./_helpers";
import { getDb } from "./_client";

export type SimilarProduct = {
  id: number;
  name: string;
  activeIngredient: string | null;
  manufacturer: string | null;
  concentration: string | null;
  presentation: string | null;
  price: string | null;
  priceUnit: string | null;
  supplierId: number | null;
  supplierName: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  savingsPercent: number | null;
};

/**
 * Compatibilidade legada por princípio ativo. Novas decisões de equivalência
 * devem usar o Compêndio; aqui o resumo comercial já é derivado da melhor
 * oferta canônica.
 */
export async function getSimilarProductsByIngredient(
  productId: number,
  referencePrice: number | null,
): Promise<SimilarProduct[]> {
  const db = await getDb();
  if (!db) return [];

  const [ref] = await db
    .select({
      id: products.id,
      activeIngredient: products.activeIngredient,
      bestPrice: bestOfferPriceSql,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!ref?.activeIngredient?.trim()) return [];
  const term = `%${escapeLike(ref.activeIngredient.trim())}%`;

  const similar = await db
    .select({
      id: products.id,
      name: products.name,
      activeIngredient: products.activeIngredient,
      manufacturer: products.manufacturer,
      concentration: products.concentration,
      presentation: products.presentation,
      price: bestOfferPriceSql,
      priceUnit: products.priceUnit,
      supplierId: bestOfferSupplierIdSql,
      supplierName: bestOfferSupplierNameSql,
      imageUrl: products.imageUrl,
      productUrl: products.productUrl,
    })
    .from(products)
    .where(
      and(
        eq(products.isActive, "yes"),
        like(products.activeIngredient, term),
        sql`${products.id} <> ${productId}`,
      ),
    )
    .orderBy(asc(bestOfferPriceSql), asc(products.name))
    .limit(20);

  const canonicalReferencePrice = ref.bestPrice == null ? null : Number(ref.bestPrice);
  const refPrice =
    referencePrice != null && Number.isFinite(referencePrice) && referencePrice > 0
      ? referencePrice
      : canonicalReferencePrice != null && Number.isFinite(canonicalReferencePrice) && canonicalReferencePrice > 0
        ? canonicalReferencePrice
        : null;

  return similar.map((product) => {
    const price = product.price == null ? null : Number(product.price);
    const savingsPercent =
      refPrice != null && price != null && Number.isFinite(price) && price > 0 && price < refPrice
        ? Math.round(((refPrice - price) / refPrice) * 100)
        : null;
    return { ...product, savingsPercent };
  });
}

export async function getCheaperAlternatives(
  productId: number,
  referencePrice: number | null,
): Promise<SimilarProduct[]> {
  const all = await getSimilarProductsByIngredient(productId, referencePrice);
  if (referencePrice == null || !Number.isFinite(referencePrice) || referencePrice <= 0) {
    return all.slice(0, 5);
  }
  return all
    .filter((product) => {
      const price = product.price == null ? null : Number(product.price);
      return price != null && Number.isFinite(price) && price > 0 && price < referencePrice;
    })
    .slice(0, 5);
}
