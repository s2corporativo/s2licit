export interface ScraperPriceGuardInput {
  previousPrice?: number | null;
  capturedPrice: number;
  minPrice?: number;
  maxPrice?: number;
  maxDropPercent?: number;
  maxRisePercent?: number;
}

export interface ScraperPriceGuardResult {
  accepted: boolean;
  reason: string | null;
  variationPercent: number | null;
}

/**
 * Impede que mudança de seletor/markup transforme um número qualquer em custo.
 * Valores fora da faixa ou com variação extrema devem ir para revisão humana.
 */
export function validateScrapedPrice(input: ScraperPriceGuardInput): ScraperPriceGuardResult {
  const captured = Number(input.capturedPrice);
  const minPrice = input.minPrice ?? 0.01;
  const maxPrice = input.maxPrice ?? 10_000_000;
  const maxDrop = input.maxDropPercent ?? 70;
  const maxRise = input.maxRisePercent ?? 300;

  if (!Number.isFinite(captured) || captured < minPrice || captured > maxPrice) {
    return { accepted: false, reason: "Preço capturado fora da faixa de plausibilidade.", variationPercent: null };
  }

  const previous = Number(input.previousPrice);
  if (!Number.isFinite(previous) || previous <= 0) {
    return { accepted: true, reason: null, variationPercent: null };
  }

  const variationPercent = ((captured - previous) / previous) * 100;
  if (variationPercent < -maxDrop) {
    return {
      accepted: false,
      reason: `Queda de ${Math.abs(variationPercent).toFixed(1)}% excede o limite automático de ${maxDrop}%.`,
      variationPercent,
    };
  }
  if (variationPercent > maxRise) {
    return {
      accepted: false,
      reason: `Alta de ${variationPercent.toFixed(1)}% excede o limite automático de ${maxRise}%.`,
      variationPercent,
    };
  }
  return { accepted: true, reason: null, variationPercent };
}
