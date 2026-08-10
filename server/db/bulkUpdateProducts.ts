import { inArray, sql } from "drizzle-orm";
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
    priceAdjustPercent: number;
    fichaTecnica: string | null;
    codigoFornecedor: string | null;
    informacaoTecnica: string | null;
    ean: string | null;
    gtin: string | null;
    subcategoria: string | null;
    registroRegulatorio: "MAPA" | "ANVISA" | "FORN" | null;
    laboratorio: string | null;
    nomeProduto: string | null;
    freightValue: string | null;
    taxValue: string | null;
    catmasCode: string | null;
    catmatCode: string | null;
    ncm: string | null;
    especieAnimal: string | null;
    viaAdministracao: string | null;
    validadeMeses: number | null;
    classeTerapeutica: string | null;
  }>
): Promise<number> {
  const db = await getDb();
  if (!db || ids.length === 0) return 0;

  const uniqueIds = Array.from(new Set(ids)).filter((id) => Number.isInteger(id) && id > 0);
  if (uniqueIds.length === 0) return 0;

  const { priceAdjustPercent, ...fields } = data;
  const updateData = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );

  // Reajuste percentual legado permanece disponível, mas é executado em uma
  // única instrução SQL. Novos fluxos de preço devem usar product_supplier_offers.
  if (priceAdjustPercent !== undefined && priceAdjustPercent !== 0) {
    const factor = 1 + priceAdjustPercent / 100;
    await db
      .update(products)
      .set({ price: sql`ROUND(${products.price} * ${factor}, 2)` })
      .where(inArray(products.id, uniqueIds));
  }

  if (Object.keys(updateData).length > 0) {
    await db.update(products).set(updateData as any).where(inArray(products.id, uniqueIds));
  }

  return uniqueIds.length;
}
