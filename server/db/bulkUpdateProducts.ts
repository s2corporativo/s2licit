import { inArray } from "drizzle-orm";
import { productSupplierOffers, products } from "../../drizzle/schema";
import { getDb } from "./_client";
import { batchUpsertSupplierPrices, type SupplierPriceWrite } from "./supplierPrices";

export type BulkProductPatch = Partial<{
  supplierId: number;
  categoryId: number | null;
  name: string;
  code: string | null;
  activeIngredient: string | null;
  manufacturer: string | null;
  concentration: string | null;
  presentation: string | null;
  pharmaceuticalForm: string | null;
  unit: string | null;
  price: string | null;
  priceUnit: string | null;
  mapa: string | null;
  barcode: string | null;
  description: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  stock: string | null;
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
}>;

function validProductIds(ids: number[]): number[] {
  return [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0);
}

function adjustedPrice(price: string | null, factor: number): string | null {
  if (price == null) return null;
  const numeric = Number(price);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return (Math.round(numeric * factor * 100) / 100).toFixed(2);
}

export async function bulkUpdateProducts(ids: number[], data: BulkProductPatch): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível para atualização em lote");

  const uniqueIds = validProductIds(ids);
  if (uniqueIds.length === 0) return 0;

  const { priceAdjustPercent, price, ...fields } = data;
  const updateData = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );

  // Identidade e ficha técnica são set-based: um único UPDATE para todo o lote.
  if (Object.keys(updateData).length > 0) {
    await db.update(products).set(updateData).where(inArray(products.id, uniqueIds));
  }

  const productRows = await db
    .select({
      id: products.id,
      supplierId: products.supplierId,
      legacyPrice: products.price,
      codigoFornecedor: products.codigoFornecedor,
      productUrl: products.productUrl,
    })
    .from(products)
    .where(inArray(products.id, uniqueIds));

  if (price !== undefined) {
    const directWrites: SupplierPriceWrite[] = [];
    for (const product of productRows) {
      const targetSupplierId = data.supplierId ?? product.supplierId;
      if (!targetSupplierId) continue;
      directWrites.push({
        productId: product.id,
        supplierId: Number(targetSupplierId),
        price,
        codigoFornecedor: data.codigoFornecedor ?? product.codigoFornecedor ?? undefined,
        linkProduto: data.productUrl ?? product.productUrl ?? undefined,
        origem: "bulk_update",
      });
    }
    if (directWrites.length > 0) await batchUpsertSupplierPrices(directWrites);
  }

  if (priceAdjustPercent !== undefined && priceAdjustPercent !== 0) {
    if (!Number.isFinite(priceAdjustPercent) || priceAdjustPercent <= -100) {
      throw new Error("O reajuste percentual deve ser um número maior que -100%.");
    }
    const factor = 1 + priceAdjustPercent / 100;

    // Lê o estado após eventual preço direto para preservar a semântica atual:
    // quando os dois parâmetros são enviados, o percentual incide no preço novo.
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

    const percentageWrites: SupplierPriceWrite[] = [];
    const productsWithOffer = new Set<number>();
    for (const offer of offers) {
      productsWithOffer.add(offer.productId);
      const nextPrice = adjustedPrice(offer.price, factor);
      if (nextPrice == null) continue;
      percentageWrites.push({
        productId: offer.productId,
        supplierId: offer.supplierId,
        price: nextPrice,
        codigoFornecedor: offer.supplierCode ?? undefined,
        linkProduto: offer.link ?? undefined,
        origem: "bulk_percentage_adjustment",
      });
    }

    // Ponte apenas para registros legados sem qualquer oferta canônica.
    for (const product of productRows) {
      if (productsWithOffer.has(product.id) || !product.supplierId) continue;
      const nextPrice = adjustedPrice(product.legacyPrice, factor);
      if (nextPrice == null) continue;
      percentageWrites.push({
        productId: product.id,
        supplierId: product.supplierId,
        price: nextPrice,
        codigoFornecedor: product.codigoFornecedor ?? undefined,
        linkProduto: product.productUrl ?? undefined,
        origem: "bulk_percentage_adjustment_legacy_bridge",
      });
    }

    if (percentageWrites.length > 0) await batchUpsertSupplierPrices(percentageWrites);
  }

  return uniqueIds.length;
}
