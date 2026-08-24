/**
 * Resolução de fornecedor a partir de nome em texto livre.
 *
 * `proposal_items.supplierName` é digitado ou importado, então a mesma empresa
 * aparece como "Tambasa", " TAMBASA ", "Tambasa Ltda". Para agregação — de
 * quantas licitações este fornecedor participou — isso vira três fornecedores
 * diferentes. Ressalva 4 do Módulo 06.
 *
 * Regra deliberada: este módulo **não cria** fornecedor. Nome que não casa
 * cadastro existente devolve `null` e o item preserva o texto original. Criar
 * fornecedor a partir de campo livre povoaria o cadastro com erros de digitação
 * — exatamente o problema que se quer resolver, não amplificar. A criação
 * continua sendo ato explícito, por `createOrGetSupplier` no fluxo de NF-e ou
 * pelo cadastro manual.
 */

/**
 * Forma canônica de um nome para comparação. Pura e exportada para teste.
 *
 * Faz o mínimo defensável: caixa, espaços e acentuação. NÃO remove sufixo
 * societário (LTDA, S/A, ME, EPP) — "Alfa Ltda" e "Alfa S/A" podem ser pessoas
 * jurídicas distintas, e casar as duas criaria vínculo errado num registro que
 * tem efeito comercial. Preferimos deixar `null` a vincular errado.
 */
export function normalizarNomeFornecedor(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove diacríticos
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export interface FornecedorCadastrado {
  id: number;
  name: string;
}

/**
 * Encontra o fornecedor cadastrado correspondente ao nome informado.
 *
 * Devolve `null` quando não há correspondência **ou quando há mais de uma**:
 * ambiguidade não se resolve por chute num vínculo que alimenta relatório de
 * participação em licitação.
 */
export function resolverFornecedorPorNome(
  nome: string | null | undefined,
  cadastrados: FornecedorCadastrado[],
): number | null {
  if (!nome) return null;
  const alvo = normalizarNomeFornecedor(nome);
  if (!alvo) return null;

  const casados = cadastrados.filter((f) => normalizarNomeFornecedor(f.name) === alvo);
  if (casados.length !== 1) return null;
  return casados[0].id;
}
