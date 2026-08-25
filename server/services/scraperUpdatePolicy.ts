import { validateScrapedPrice } from "./scraperPriceGuard";

export function scraperMayUpdateCost(params: {
  previousPrice?: number | null;
  capturedPrice: number;
  sourceUrl?: string | null;
  observedAt?: Date | null;
}) {
  const price = validateScrapedPrice({
    previousPrice: params.previousPrice,
    capturedPrice: params.capturedPrice,
    maxDropPercent: Number(process.env.SCRAPER_MAX_PRICE_DROP_PERCENT ?? 70),
    maxRisePercent: Number(process.env.SCRAPER_MAX_PRICE_RISE_PERCENT ?? 300),
  });
  const reasons: string[] = [];
  if (!price.accepted && price.reason) reasons.push(price.reason);
  if (!params.sourceUrl) reasons.push("URL de origem do preço ausente.");
  if (!params.observedAt) reasons.push("Timestamp da captura ausente.");
  return { accepted: reasons.length === 0, reasons, variationPercent: price.variationPercent };
}
