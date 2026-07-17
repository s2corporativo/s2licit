import { eq, sql } from "drizzle-orm";
import { products } from "../../drizzle/schema";
import { getDb } from "./_client";

export async function bulkUpdateProducts(
  ids: number[],
  data: Partial<{
    supplierId: number;
    categoryId: number;
    name: string;
    code: string;
    activeIngredient: string;
    manufacturer: string;
    concentration: string;
    presentation: string;
    pharmaceuticalForm: string;
    unit: string;
    price: string;
    priceUnit: string;
    mapa: string;
    barcode: string;
    description: string;
    imageUrl: string;
    productUrl: string;
    stock: string;
    isActive: "yes" | "no";
    priceAdjustPercent: number; // positive = increase, negative = decrease
  }>
): Promise<number> {
  const db = await getDb();
  if (!db || ids.length === 0) return 0;

  // If priceAdjustPercent is set, we need to update each product individually
  if (data.priceAdjustPercent !== undefined && data.priceAdjustPercent !== 0) {
    const factor = 1 + data.priceAdjustPercent / 100;
    for (const id of ids) {
      await db
        .update(products)
        .set({ price: sql`ROUND(${products.price} * ${factor}, 2)` })
        .where(eq(products.id, id));
    }
    // Also apply any other non-price fields
    const { priceAdjustPercent, ...rest } = data;
    const otherFields = Object.fromEntries(
      Object.entries(rest).filter(([, v]) => v !== undefined)
    );
    if (Object.keys(otherFields).length > 0) {
      for (const id of ids) {
        await db.update(products).set(otherFields as any).where(eq(products.id, id));
      }
    }
    return ids.length;
  }

  const { priceAdjustPercent, ...fields } = data;
  const updateData = Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined)
  );
  if (Object.keys(updateData).length === 0) return 0;

  // Batch update using inArray
  const { inArray } = await import("drizzle-orm");
  await db.update(products).set(updateData as any).where(inArray(products.id, ids));
  return ids.length;
}
