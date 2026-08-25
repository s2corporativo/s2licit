export interface PriceSourceMetadata {
  source?: string | null;
  supplier?: string | null;
  observedAt?: Date | string | null;
}

export function priceSourceIsAuditable(meta: PriceSourceMetadata): boolean {
  return Boolean(meta.source?.trim() && meta.observedAt);
}

export function priceSourceWarning(meta: PriceSourceMetadata): string | null {
  if (!meta.source?.trim()) return "Fonte do custo não informada.";
  if (!meta.observedAt) return "Data de consulta/aquisição do custo não informada.";
  return null;
}
