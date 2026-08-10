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

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type CaptureDbExecutor = Pick<Database, "insert" | "update">;

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

function validatePrice(scraped: ScrapedProduct): number {
  const price = Number(scraped.price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Preço inválido para persistência da oferta.");
  }
  return price;
}

/**
 * Persistência reutilizável dentro de uma transação já aberta.
 * Não registra histórico aqui: histórico é um efeito derivado e deve acontecer
 * apenas depois do commit da alteração operacional.
 */
export async function persistCapturedOffer(
  executor: CaptureDbExecutor,
  input: ApplyCapturedOfferInput,
): Promise<ApplyCapturedOfferResult> {
  const nextPrice = validatePrice(input.scraped);
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

  await executor
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
    await executor.update(products).set(productUpdates).where(eq(products.id, input.product.id));
  }

  return {
    productId: input.product.id,
    supplierId: input.supplierId,
    previousPrice,
    nextPrice,
    priceChanged: previousPrice === null || previousPrice !== nextPrice,
  };
}

export async function recordCapturedOfferHistory(
  result: ApplyCapturedOfferResult,
  origin = "capture_core",
): Promise<void> {
  if (!result.priceChanged) return;
  try {
    await recordPriceHistory({
      productId: result.productId,
      supplierId: result.supplierId,
      price: String(result.nextPrice),
      origem: origin,
    });
  } catch (error) {
    logger.warn(
      `[CaptureOffer] Oferta aplicada, mas histórico falhou para produto #${result.productId}/fornecedor #${result.supplierId}:`,
      (error as Error).message,
    );
  }
}

/**
 * Persiste oferta em transação própria e registra histórico apenas após commit.
 */
export async function applyCapturedOffer(
  input: ApplyCapturedOfferInput,
): Promise<ApplyCapturedOfferResult> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");

  let result: ApplyCapturedOfferResult | null = null;
  await db.transaction(async (tx) => {
    result = await persistCapturedOffer(tx, input);
  });

  if (!result) throw new Error("A persistência da oferta não produziu resultado.");
  await recordCapturedOfferHistory(result, input.origin ?? "capture_core");
  return result;
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
