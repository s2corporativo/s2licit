/**
 * Preserva a quantidade material solicitada no fluxo cotação → proposta.
 *
 * Quantidade é dado de negócio e não pode ser silenciosamente arredondada.
 * Limitamos a quatro casas decimais porque o banco usa DECIMAL(15,4).
 * Qualquer conversão para embalagem/unidade comercial deve ser explícita e
 * auditável em etapa própria do portal, nunca neste handoff.
 */
export function preserveProposalQuantity(quantity: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Quantidade da cotação inválida: informe um valor positivo.");
  }

  return Number(quantity.toFixed(4));
}
