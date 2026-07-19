export interface SupplierOfferForRanking {
  offerId: number;
  supplierId: number;
  supplierName: string;
  regularPrice: number | null;
  promoPrice?: number | null;
  stock?: number | null;
  availability?: string | null;
  updatedAt?: Date | string | null;
  scraperStatus?: "success" | "failed" | "pending" | null;
  productsScrapedCount?: number | null;
  productsMatchedCount?: number | null;
}

export interface RankedSupplierOffer extends SupplierOfferForRanking {
  effectivePrice: number | null;
  score: number;
  rank: number;
  warnings: string[];
  breakdown: {
    price: number;
    availability: number;
    freshness: number;
    reliability: number;
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function effectivePrice(offer: SupplierOfferForRanking): number | null {
  const promo = Number(offer.promoPrice);
  if (Number.isFinite(promo) && promo > 0) return promo;
  const regular = Number(offer.regularPrice);
  return Number.isFinite(regular) && regular > 0 ? regular : null;
}

function freshnessScore(updatedAt?: Date | string | null, now = new Date()): number {
  if (!updatedAt) return 15;
  const date = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  const ageHours = (now.getTime() - date.getTime()) / 3_600_000;
  if (!Number.isFinite(ageHours) || ageHours < 0) return 20;
  if (ageHours <= 24) return 100;
  if (ageHours <= 72) return 80;
  if (ageHours <= 168) return 55;
  if (ageHours <= 720) return 30;
  return 10;
}

function availabilityScore(offer: SupplierOfferForRanking): number {
  const normalized = (offer.availability || "").toLocaleLowerCase("pt-BR");
  if (normalized.includes("indispon") || normalized.includes("esgot") || normalized.includes("sem estoque")) return 0;
  if (normalized.includes("sob consulta") || normalized.includes("consultar")) return 35;
  if (normalized.includes("dispon") || normalized.includes("estoque") || normalized.includes("imediat")) return 100;
  if (offer.stock != null) {
    if (offer.stock <= 0) return 0;
    if (offer.stock < 5) return 55;
    return 95;
  }
  return 50;
}

function reliabilityScore(offer: SupplierOfferForRanking): number {
  let score = offer.scraperStatus === "success" ? 85 : offer.scraperStatus === "failed" ? 25 : 55;
  const scraped = Number(offer.productsScrapedCount ?? 0);
  const matched = Number(offer.productsMatchedCount ?? 0);
  if (scraped > 0) {
    const matchRate = matched / scraped;
    score = score * 0.7 + clamp(matchRate * 100) * 0.3;
  }
  return clamp(score);
}

/**
 * Ranqueia ofertas sem esconder o critério. Preço tem maior peso, mas oferta
 * velha, indisponível ou proveniente de captura falha perde posição.
 */
export function rankSupplierOffers(
  offers: SupplierOfferForRanking[],
  now = new Date(),
): RankedSupplierOffer[] {
  const withEffectivePrice = offers.map((offer) => ({
    offer,
    effectivePrice: effectivePrice(offer),
  }));
  const validPrices = withEffectivePrice
    .map((entry) => entry.effectivePrice)
    .filter((value): value is number => value != null && value > 0);
  const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : null;

  const ranked = withEffectivePrice.map(({ offer, effectivePrice: price }) => {
    const priceScore = minPrice && price ? clamp((minPrice / price) * 100) : 0;
    const availability = availabilityScore(offer);
    const freshness = freshnessScore(offer.updatedAt, now);
    const reliability = reliabilityScore(offer);
    const warnings: string[] = [];

    if (price == null) warnings.push("Preço válido não informado.");
    if (availability === 0) warnings.push("Oferta indisponível ou sem estoque.");
    if (freshness < 50) warnings.push("Preço desatualizado; confirme antes de usar.");
    if (reliability < 50) warnings.push("Última captura falhou ou tem baixa confiabilidade.");

    const score = Math.round(
      (priceScore * 0.5 + availability * 0.2 + freshness * 0.15 + reliability * 0.15) * 100,
    ) / 100;

    return {
      ...offer,
      effectivePrice: price,
      score,
      rank: 0,
      warnings,
      breakdown: {
        price: Math.round(priceScore * 100) / 100,
        availability: Math.round(availability * 100) / 100,
        freshness: Math.round(freshness * 100) / 100,
        reliability: Math.round(reliability * 100) / 100,
      },
    };
  });

  return ranked
    .sort((a, b) => b.score - a.score || (a.effectivePrice ?? Infinity) - (b.effectivePrice ?? Infinity))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}
