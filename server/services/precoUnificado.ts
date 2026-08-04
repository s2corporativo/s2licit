/**
 * precoUnificado.ts — fórmula única de formação de preço para todo o sistema.
 *
 * Antes existiam DOIS métodos conflitantes: markup `custo·(1+margem)` nas telas
 * de catálogo/lote e o divisor `custo/(1−margem)` na disputa — o mesmo item saía
 * com preços diferentes, subprecificando ~9% no catálogo. Este módulo consolida
 * a fórmula correta (a mesma do custoTotalService):
 *
 *   preço = (custo + frete) / (1 − (impostos% + margem%)/100)
 *
 * Convenções (idênticas ao custoTotalService, "por dentro"):
 *  - impostos e margem são % SOBRE O PREÇO DE VENDA (divisor);
 *  - frete entra no numerador (recebe margem, como custo de aquisição);
 *  - margem/impostos que somem ≥ 100% da venda tornam a operação inviável (null).
 */

export interface EntradaPreco {
  custo: number;        // custo unitário do produto
  margemPct: number;    // margem líquida desejada (%)
  impostosPct?: number; // % de impostos sobre a venda
  freteUnit?: number;   // frete unitário em R$ (custo de aquisição)
}

export const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Núcleo aritmético único do divisor de preço — usado por TODOS os pontos
 * de precificação do sistema (precoUnificado, pricingSafety, custoTotalService,
 * PricingService). Sem validação e sem arredondamento: cada chamador aplica
 * suas próprias regras de validação/erro e de casas decimais sobre este
 * resultado, preservando o contrato observável que já tinham antes da
 * consolidação (alguns lançam exceção e retornam valor cheio, outros
 * retornam null e arredondam).
 *
 * preço = (custo + frete) / (1 − (impostos% + margem%)/100)
 *
 * Retorna null quando impostos + margem ≥ 100% da venda (inviável).
 */
export function calcularPrecoDivisor(input: {
  custo: number;
  margemPct: number;
  impostosPct?: number;
  freteUnit?: number;
}): number | null {
  const custoComFrete = input.custo + (input.freteUnit ?? 0);
  const divisor = 1 - ((input.impostosPct ?? 0) + input.margemPct) / 100;
  if (divisor <= 0) return null;
  return custoComFrete / divisor;
}

/**
 * Preço final unitário pela fórmula do divisor (imposto por dentro),
 * arredondado a 2 casas decimais.
 * Retorna null quando impostos + margem ≥ 100% da venda (inviável).
 */
export function precoFinalUnificado(e: EntradaPreco): number | null {
  const preco = calcularPrecoDivisor({
    custo: e.custo,
    margemPct: e.margemPct,
    impostosPct: e.impostosPct,
    freteUnit: e.freteUnit,
  });
  return preco === null ? null : r2(preco);
}
