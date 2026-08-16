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

/** Busca equivalentes por princípio ativo. Similaridade não significa preço menor. */
export async function getSimilarProductsByIngredient(
  productId: number,
  referencePrice: number | null,
): Promise<SimilarProduct[]> {
  const db = await getDb();
  if (!db) return [];

  const [ref] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!ref || !ref.activeIngredient?.trim()) return [];

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
        sql`${products.id} != ${productId}`,
      ),
    )
    // NULL pode aparecer antes de valores em ordenação crescente no MySQL;
    // preço ausente nunca deve ganhar semântica de "menor preço".
    .orderBy(sql`${products.price} IS NULL`, asc(products.price))
    .limit(20);

  const refPrice = referencePrice ?? (ref.price ? parseFloat(ref.price) : null);
  return similar.map((p) => {
    const pPrice = p.price ? parseFloat(p.price) : null;
    const savingsPercent =
      refPrice != null && refPrice > 0 && pPrice != null && Number.isFinite(pPrice) && pPrice > 0 && pPrice < refPrice
        ? Math.round(((refPrice - pPrice) / refPrice) * 100)
        : null;
    return { ...p, savingsPercent };
  });
}

/**
 * Alternativa "mais barata" exige duas evidências numéricas: preço de
 * referência positivo e preço alternativo positivo/inferior. Sem isso, a API
 * retorna lista vazia e a UI não pode afirmar economia inexistente.
 */
export async function getCheaperAlternatives(
  productId: number,
  referencePrice: number | null,
): Promise<SimilarProduct[]> {
  if (referencePrice == null || !Number.isFinite(referencePrice) || referencePrice <= 0) return [];
  const all = await getSimilarProductsByIngredient(productId, referencePrice);
  return all
    .filter((p) => {
      const pPrice = p.price ? parseFloat(p.price) : NaN;
      return Number.isFinite(pPrice) && pPrice > 0 && pPrice < referencePrice;
    })
    .slice(0, 5);
}
