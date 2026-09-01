import { parseProposalQuantity } from "./proposalQuantity";

/**
 * Preserva a quantidade material solicitada no fluxo cotação → proposta.
 *
 * Quantidade é dado de negócio e não pode ser silenciosamente arredondada.
 * O contrato canônico aceita valor positivo com até quatro casas decimais.
 * Qualquer conversão para embalagem/unidade comercial deve ser explícita e
 * auditável em etapa própria, nunca neste handoff.
 */
export function preserveProposalQuantity(quantity: number): number {
  return parseProposalQuantity(quantity);
}
