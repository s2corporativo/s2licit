/**
 * packagingService.ts
 *
 * Normalização de embalagem → unidade (spec §8).
 *
 * Compara corretamente preços de apresentações diferentes quando a quantidade
 * solicitada é em unidades, mas o fornecedor vende em embalagens fechadas
 * (caixa com N, pacote com M...). Calcula quantas embalagens comprar, a
 * quantidade total fornecida, a sobra, o custo por unidade e o custo total —
 * sem fracionar embalagem fechada.
 *
 * Módulo puro (sem I/O) para ser testável e reutilizável na precificação.
 */

/** Arredonda para `casas` decimais evitando ruído de ponto flutuante. */
function arredondar(valor: number, casas: number): number {
  const f = 10 ** casas;
  return Math.round((valor + Number.EPSILON) * f) / f;
}

export interface EmbalagemInput {
  /** Quantidade solicitada, em unidades do produto. */
  quantidadeSolicitada: number;
  /** Unidades do produto por embalagem de venda (>= 1). */
  unidadesPorEmbalagem: number;
  /** Preço de uma embalagem fechada. Informe este OU precoUnitario. */
  precoEmbalagem?: number;
  /** Preço por unidade do produto. Informe este OU precoEmbalagem. */
  precoUnitario?: number;
  /**
   * Permite comprar unidades avulsas (fracionar a embalagem). Padrão false:
   * fornecedores vendem embalagem fechada, então arredonda para cima.
   */
  permitirFracionar?: boolean;
  /** Rótulo opcional da apresentação (ex.: "Caixa com 20 UN"). */
  apresentacao?: string;
}

export interface EmbalagemResult {
  apresentacao?: string;
  unidadesPorEmbalagem: number;
  /** Quantas embalagens comprar (inteiro quando fechada). */
  embalagensNecessarias: number;
  /** Total de unidades efetivamente fornecidas. */
  quantidadeTotalFornecida: number;
  /** Unidades excedentes (fornecida − solicitada). */
  sobra: number;
  /** Custo efetivo por unidade do produto. */
  custoUnitario: number;
  /** Custo total da compra (para a quantidade fornecida). */
  custoTotal: number;
  /** true quando a compra fracionou a embalagem. */
  fracionado: boolean;
}

/**
 * Calcula a compra necessária para atender a quantidade solicitada, dada a
 * apresentação (unidades por embalagem) e o preço.
 *
 * @throws Error para entradas inválidas (quantidade negativa, embalagem < 1,
 *   ou ausência de preço).
 */
export function calcularEmbalagem(input: EmbalagemInput): EmbalagemResult {
  const {
    quantidadeSolicitada,
    unidadesPorEmbalagem,
    precoEmbalagem,
    precoUnitario,
    permitirFracionar = false,
    apresentacao,
  } = input;

  if (!Number.isFinite(quantidadeSolicitada) || quantidadeSolicitada < 0) {
    throw new Error("quantidadeSolicitada deve ser um número >= 0");
  }
  if (!Number.isFinite(unidadesPorEmbalagem) || unidadesPorEmbalagem < 1) {
    throw new Error("unidadesPorEmbalagem deve ser um número >= 1");
  }

  // Deriva preço unitário e por embalagem de forma consistente.
  let unitPrice: number;
  let packPrice: number;
  if (Number.isFinite(precoEmbalagem as number)) {
    packPrice = precoEmbalagem as number;
    unitPrice = packPrice / unidadesPorEmbalagem;
  } else if (Number.isFinite(precoUnitario as number)) {
    unitPrice = precoUnitario as number;
    packPrice = unitPrice * unidadesPorEmbalagem;
  } else {
    throw new Error("Informe precoEmbalagem ou precoUnitario");
  }
  if (unitPrice < 0) throw new Error("Preço não pode ser negativo");

  // Embalagem fechada só faz sentido fracionar se cada embalagem tem 1 unidade.
  const podeFracionar = permitirFracionar || unidadesPorEmbalagem === 1;

  if (podeFracionar) {
    const quantidadeTotalFornecida = quantidadeSolicitada;
    return {
      apresentacao,
      unidadesPorEmbalagem,
      embalagensNecessarias: arredondar(quantidadeSolicitada / unidadesPorEmbalagem, 4),
      quantidadeTotalFornecida,
      sobra: 0,
      custoUnitario: arredondar(unitPrice, 4),
      custoTotal: arredondar(quantidadeSolicitada * unitPrice, 2),
      fracionado: quantidadeSolicitada % unidadesPorEmbalagem !== 0,
    };
  }

  const embalagensNecessarias = Math.ceil(quantidadeSolicitada / unidadesPorEmbalagem);
  const quantidadeTotalFornecida = embalagensNecessarias * unidadesPorEmbalagem;
  return {
    apresentacao,
    unidadesPorEmbalagem,
    embalagensNecessarias,
    quantidadeTotalFornecida,
    sobra: quantidadeTotalFornecida - quantidadeSolicitada,
    custoUnitario: arredondar(unitPrice, 4),
    custoTotal: arredondar(embalagensNecessarias * packPrice, 2),
    fracionado: false,
  };
}

/**
 * Escolhe a melhor apresentação entre várias opções do fornecedor para uma
 * mesma quantidade solicitada (spec §8: caixa com 10 / 20 / pacote com 50...).
 *
 * Critério: menor custo total; empate desempatado por menor sobra e, então,
 * por menor número de embalagens. Retorna null se não houver opções.
 */
export function escolherMelhorEmbalagem(
  quantidadeSolicitada: number,
  opcoes: Array<Omit<EmbalagemInput, "quantidadeSolicitada">>,
): EmbalagemResult | null {
  const resultados: EmbalagemResult[] = [];
  for (const opcao of opcoes) {
    try {
      resultados.push(calcularEmbalagem({ ...opcao, quantidadeSolicitada }));
    } catch {
      // Ignora opções inválidas (ex.: sem preço) na comparação.
    }
  }
  if (resultados.length === 0) return null;

  return resultados.reduce((melhor, atual) => {
    if (atual.custoTotal < melhor.custoTotal) return atual;
    if (atual.custoTotal > melhor.custoTotal) return melhor;
    if (atual.sobra < melhor.sobra) return atual;
    if (atual.sobra > melhor.sobra) return melhor;
    return atual.embalagensNecessarias < melhor.embalagensNecessarias ? atual : melhor;
  });
}
