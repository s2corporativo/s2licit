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

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Preço final unitário pela fórmula do divisor (imposto por dentro).
 * Retorna null quando impostos + margem ≥ 100% da venda (inviável).
 */
export function precoFinalUnificado(e: EntradaPreco): number | null {
  const custo = e.custo + (e.freteUnit ?? 0);
  const divisor = 1 - ((e.impostosPct ?? 0) + e.margemPct) / 100;
  if (divisor <= 0) return null;
  return r2(custo / divisor);
}
