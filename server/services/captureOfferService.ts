import { and, eq } from "drizzle-orm";
import { getDb, recordPriceHistory } from "../db";
import { productSupplierOffers, products } from "../../drizzle/schema";
import { logger } from "../_core/logger";
import type { ScrapedProduct } from "./scraperEngine";
import type { NormalizedAvailability } from "./captureCoreService";
import type {
  CaptureOfferMatchRecord,
  CaptureProductMatchRecord,
} from "./captureMatchingService";

export interface ApplyCapturedOfferInput {
  product: Pick<CaptureProductMatchRecord, "id" | "supplierId" | "imageUrl">;
  supplierId: number;
  supplierName: string;
  scraped: ScrapedProduct;
  availability: NormalizedAvailability;
  existingOffer?: CaptureOfferMatchRecord | null;
  origin?: string;
}

export interface ApplyCapturedOfferResult {
  productId: number;
  supplierId: number;
  previousPrice: number | null;
  nextPrice: number;
  priceChanged: boolean;
}

function toFiniteNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function toLegacyAvailability(value: NormalizedAvailability): string {
  if (value === "in_stock" || value === "limited") return "disponivel";
  if (value === "out_of_stock") return "indisponivel";
  if (value === "backorder") return "sob_encomenda";
  return "desconhecido";
}

function resolveAvailability(
  availability: NormalizedAvailability,
  existing?: CaptureOfferMatchRecord | null,
): string {
  if (availability === "unknown" && existing?.availability) return existing.availability;
  return toLegacyAvailability(availability);
}

function resolveOptionalString(
  next: string | null | undefined,
  current: string | null | undefined,
): string | null {
  const normalized = next?.trim();
  if (normalized) return normalized;
  return current ?? null;
}

function resolvePromoPrice(
  scraped: ScrapedProduct,
  existing?: CaptureOfferMatchRecord | null,
): string | null {
  if (scraped.pricePromo !== undefined && scraped.pricePromo !== null) {
    return String(scraped.pricePromo);
  }
  return existing?.promoPrice ?? null;
}

/**
 * Persiste a oferta do fornecedor como fonte operacional de preço.
 *
 * - upsert é protegido pela UNIQUE(productId, supplierId);
 * - campos ausentes na captura não apagam informações conhecidas;
 * - o preço legado de `products` só é mantido para o fornecedor proprietário;
 * - histórico só é criado quando o preço efetivamente muda.
 */
export async function applyCapturedOffer(
  input: ApplyCapturedOfferInput,
): Promise<ApplyCapturedOfferResult> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");

  const nextPrice = Number(input.scraped.price);
  if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
    throw new Error("Preço inválido para persistência da oferta.");
  }

  const previousPrice = toFiniteNumber(input.existingOffer?.price);
  const now = new Date();
  const offerValues = {
    price: String(nextPrice),
    supplierCode: resolveOptionalString(input.scraped.code, input.existingOffer?.supplierCode),
    supplierName: input.supplierName,
    link: resolveOptionalString(input.scraped.productUrl, input.existingOffer?.link),
    image: resolveOptionalString(input.scraped.imageUrl, input.existingOffer?.image),
    availability: resolveAvailability(input.availability, input.existingOffer),
    promoPrice: resolvePromoPrice(input.scraped, input.existingOffer),
    stock: input.scraped.stock ?? input.existingOffer?.stock ?? null,
    updatedAt: now,
  };

  await db.transaction(async (tx) => {
    await tx
      .insert(productSupplierOffers)
      .values({
        productId: input.product.id,
        supplierId: input.supplierId,
        ...offerValues,
        createdAt: now,
      })
      .onDuplicateKeyUpdate({ set: offerValues });

    if (input.product.supplierId === input.supplierId) {
      const productUpdates: Record<string, unknown> = {
        price: String(nextPrice),
        updatedAt: now,
      };
      if (input.scraped.imageUrl && !input.product.imageUrl) {
        productUpdates.imageUrl = input.scraped.imageUrl;
      }
      if (input.scraped.productUrl) {
        productUpdates.productUrl = input.scraped.productUrl;
      }
      await tx.update(products).set(productUpdates).where(eq(products.id, input.product.id));
    }
  });

  const priceChanged = previousPrice === null || previousPrice !== nextPrice;
  if (priceChanged) {
    try {
      await recordPriceHistory({
        productId: input.product.id,
        supplierId: input.supplierId,
        price: String(nextPrice),
        origem: input.origin ?? "capture_core",
      });
    } catch (error) {
      logger.warn(
        `[CaptureOffer] Oferta aplicada, mas histórico falhou para produto #${input.product.id}/fornecedor #${input.supplierId}:`,
        (error as Error).message,
      );
    }
  }

  return {
    productId: input.product.id,
    supplierId: input.supplierId,
    previousPrice,
    nextPrice,
    priceChanged,
  };
}

/** Leitura pontual usada pela revisão humana para evitar decisões sobre snapshot antigo. */
export async function getCurrentSupplierOffer(
  productId: number,
  supplierId: number,
): Promise<CaptureOfferMatchRecord | null> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");

  const [offer] = await db.select({
    id: productSupplierOffers.id,
    productId: productSupplierOffers.productId,
    supplierCode: productSupplierOffers.supplierCode,
    price: productSupplierOffers.price,
    promoPrice: productSupplierOffers.promoPrice,
    stock: productSupplierOffers.stock,
    availability: productSupplierOffers.availability,
    link: productSupplierOffers.link,
    image: productSupplierOffers.image,
  }).from(productSupplierOffers).where(and(
    eq(productSupplierOffers.productId, productId),
    eq(productSupplierOffers.supplierId, supplierId),
  )).limit(1);

  return offer ?? null;
}
