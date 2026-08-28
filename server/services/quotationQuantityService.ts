/**
 * Normaliza a quantidade para fluxos/portais que aceitam somente unidades
 * inteiras. A regra é conservadora: nunca reduz a quantidade solicitada.
 */
export function normalizeProposalQuantity(quantity: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 1;
  return Math.max(1, Math.ceil(quantity));
}
