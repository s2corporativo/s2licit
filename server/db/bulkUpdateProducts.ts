import { inArray } from "drizzle-orm";
import { productSupplierOffers, products } from "../../drizzle/schema";
import { getDb } from "./_client";
import { upsertProductSupplierPrice } from "./supplierPrices";

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

  const { priceAdjustPercent, price, ...fields } = data;
  const updateData = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));

  // Campos de identidade/técnicos continuam set-based; preço é tratado abaixo
  // por oferta para preservar histórico e fonte única.
  if (Object.keys(updateData).length > 0) {
    await db.update(products).set(updateData as any).where(inArray(products.id, uniqueIds));
  }

  const productRows = await db
    .select({ id: products.id, supplierId: products.supplierId, legacyPrice: products.price })
    .from(products)
    .where(inArray(products.id, uniqueIds));

  if (price !== undefined) {
    for (const product of productRows) {
      const targetSupplierId = data.supplierId ?? product.supplierId;
      if (!targetSupplierId) continue;
      await upsertProductSupplierPrice(product.id, Number(targetSupplierId), price, {
        origem: "bulk_update",
        codigoFornecedor: data.codigoFornecedor ?? undefined,
        linkProduto: data.productUrl ?? undefined,
      });
    }
  }

  if (priceAdjustPercent !== undefined && priceAdjustPercent !== 0) {
    if (priceAdjustPercent <= -100) throw new Error("O reajuste percentual deve ser maior que -100%.");
    const factor = 1 + priceAdjustPercent / 100;
    const offers = await db
      .select({
        productId: productSupplierOffers.productId,
        supplierId: productSupplierOffers.supplierId,
        price: productSupplierOffers.price,
        supplierCode: productSupplierOffers.supplierCode,
        link: productSupplierOffers.link,
      })
      .from(productSupplierOffers)
      .where(inArray(productSupplierOffers.productId, uniqueIds));

    const productsWithOffer = new Set<number>();
    for (const offer of offers) {
      productsWithOffer.add(offer.productId);
      const current = offer.price == null ? null : Number(offer.price);
      if (current == null || !Number.isFinite(current) || current <= 0) continue;
      const adjusted = (Math.round(current * factor * 100) / 100).toFixed(2);
      await upsertProductSupplierPrice(offer.productId, offer.supplierId, adjusted, {
        origem: "bulk_percentage_adjustment",
        codigoFornecedor: offer.supplierCode ?? undefined,
        linkProduto: offer.link ?? undefined,
      });
    }

    // Catálogo legado sem oferta: cria a primeira oferta canônica antes de ajustar.
    for (const product of productRows) {
      if (productsWithOffer.has(product.id) || !product.supplierId || product.legacyPrice == null) continue;
      const current = Number(product.legacyPrice);
      if (!Number.isFinite(current) || current <= 0) continue;
      const adjusted = (Math.round(current * factor * 100) / 100).toFixed(2);
      await upsertProductSupplierPrice(product.id, product.supplierId, adjusted, {
        origem: "bulk_percentage_adjustment_legacy_bridge",
      });
    }
  }

  return uniqueIds.length;
}
