export const PROPOSAL_QUANTITY_SCALE = 4;
export const MIN_PROPOSAL_QUANTITY = 0.0001;

/**
 * Converte quantidade persistida/recebida para número sem alterar o valor
 * material dentro da precisão contratual de 4 casas decimais.
 *
 * Não arredonda embalagens, não usa fallback para 1 e não aceita zero/negativo.
 * Conversão comercial de unidade/embalagem deve ser uma decisão separada,
 * explícita e auditável.
 */
export function parseProposalQuantity(value: number | string): number {
  const quantity = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(quantity) || quantity < MIN_PROPOSAL_QUANTITY) {
    throw new Error("Quantidade da proposta deve ser um número positivo maior ou igual a 0,0001.");
  }

  const normalized = Number(quantity.toFixed(PROPOSAL_QUANTITY_SCALE));
  if (Math.abs(quantity - normalized) > 1e-9) {
    throw new Error("Quantidade da proposta deve ter no máximo 4 casas decimais.");
  }
  return normalized;
}

/** Schema/helper-friendly predicate for API validation. */
export function isValidProposalQuantity(value: number): boolean {
  try {
    parseProposalQuantity(value);
    return true;
  } catch {
    return false;
  }
}
