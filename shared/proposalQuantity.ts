export const PROPOSAL_QUANTITY_SCALE = 4;
export const MIN_PROPOSAL_QUANTITY = 0.0001;

/**
 * Fonte única do contrato material de quantidade de propostas.
 * Aceita número ou texto com separador decimal ponto/vírgula, preserva até
 * quatro casas decimais e rejeita qualquer coerção/arredondamento silencioso.
 * Conversão para embalagem/unidade comercial é uma decisão separada.
 */
export function parseProposalQuantity(value: number | string): number {
  const normalizedInput =
    typeof value === "string" ? value.trim().replace(",", ".") : value;
  const quantity = typeof normalizedInput === "number" ? normalizedInput : Number(normalizedInput);

  if (!Number.isFinite(quantity) || quantity < MIN_PROPOSAL_QUANTITY) {
    throw new Error("Quantidade da proposta deve ser um número positivo maior ou igual a 0,0001.");
  }

  const normalized = Number(quantity.toFixed(PROPOSAL_QUANTITY_SCALE));
  if (Math.abs(quantity - normalized) > 1e-9) {
    throw new Error("Quantidade da proposta deve ter no máximo 4 casas decimais.");
  }
  return normalized;
}

export function isValidProposalQuantity(value: number | string): boolean {
  try {
    parseProposalQuantity(value);
    return true;
  } catch {
    return false;
  }
}
