import { and, asc, eq, like, sql } from "drizzle-orm";
import { products, suppliers } from "../../drizzle/schema";
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
  supplierId: number;
  supplierName: string;
  imageUrl: string | null;
  productUrl: string | null;
  savingsPercent: number | null;
};

/**
 * Busca produtos similares com a mesma composição (princípio ativo),
 * ordenados por preço crescente. Retorna apenas produtos mais baratos que o referência.
 */
export async function getSimilarProductsByIngredient(
  productId: number,
  referencePrice: number | null
): Promise<SimilarProduct[]> {
  const db = await getDb();
  if (!db) return [];

  // Busca o produto de referência
  const [ref] = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!ref || !ref.activeIngredient?.trim()) return [];

  // Busca todos os produtos com o mesmo princípio ativo
  const similar = await db
    .select({
      id: products.id,
      name: products.name,
      activeIngredient: products.activeIngredient,
      manufacturer: products.manufacturer,
      concentration: products.concentration,
      presentation: products.presentation,
      price: products.price,
      priceUnit: products.priceUnit,
      supplierId: products.supplierId,
      supplierName: suppliers.name,
      imageUrl: products.imageUrl,
      productUrl: products.productUrl,
    })
    .from(products)
    .innerJoin(suppliers, eq(products.supplierId, suppliers.id))
    .where(
      and(
        eq(products.isActive, "yes"),
        like(products.activeIngredient, `%${ref.activeIngredient.trim()}%`),
        // Exclui o próprio produto
        sql`${products.id} != ${productId}`
      )
    )
    .orderBy(asc(products.price))
    .limit(20);

  const refPrice = referencePrice ?? (ref.price ? parseFloat(ref.price) : null);

  return similar.map((p) => {
    const pPrice = p.price ? parseFloat(p.price) : null;
    const savingsPercent =
      refPrice && pPrice && refPrice > 0 && pPrice < refPrice
        ? Math.round(((refPrice - pPrice) / refPrice) * 100)
        : null;
    return { ...p, savingsPercent };
  });
}

/**
 * Busca produtos similares mais baratos que o produto selecionado.
 * Retorna apenas os que têm preço inferior ao de referência.
 */
export async function getCheaperAlternatives(
  productId: number,
  referencePrice: number | null
): Promise<SimilarProduct[]> {
  const all = await getSimilarProductsByIngredient(productId, referencePrice);
  const refPrice = referencePrice;
  if (!refPrice) return all.slice(0, 5);
  return all.filter((p) => {
    const pPrice = p.price ? parseFloat(p.price) : null;
    return pPrice !== null && pPrice < refPrice;
  }).slice(0, 5);
}
