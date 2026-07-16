/**
 * Custo Total de Aquisição (spec §19).
 *
 * Não compare fornecedores pelo preço anunciado: o custo real inclui frete
 * de entrada, frete de saída, impostos sobre a venda, taxas e custo
 * financeiro do prazo de recebimento. Funções puras e testáveis.
 *
 * Convenções:
 *  - custos em R$ POR LOTE (frete) são rateados pela quantidade;
 *  - impostos/taxas/custo financeiro são % SOBRE O PREÇO DE VENDA;
 *  - preço mínimo sustentável: preco = custoUnit / (1 - (imp+taxas+fin+margem)/100).
 */

import { calcularEmbalagem, type EmbalagemResult } from "./packagingService";

export interface EntradaCustoTotal {
  precoProdutoUnit: number;      // preço unitário do fornecedor
  quantidade: number;
  freteEntradaTotal?: number;    // R$ do lote (fornecedor → empresa)
  freteSaidaTotal?: number;      // R$ do lote (→ órgão)
  outrosCustosTotal?: number;    // embalagem, taxas fixas etc. (R$ do lote)
  impostosPct?: number;          // % sobre a venda (vem do Motor Tributário)
  taxasPct?: number;             // % sobre a venda (taxa de portal, comissão)
  custoFinanceiroPct?: number;   // % sobre a venda (prazo de recebimento)
  margemMinimaPct?: number;      // margem líquida mínima aceitável
  margemDesejadaPct?: number;    // margem líquida desejada
  // §8 — apresentação de venda do fornecedor (embalagem fechada). Opcional:
  // quando informada, expõe a quebra de embalagem e o alerta de sobra.
  unidadesPorEmbalagem?: number;
  permitirFracionar?: boolean;
  // Se true, o custo da sobra (embalagem fechada) é amortizado no custo por
  // unidade solicitada — refletindo no preço mínimo. Padrão false (não repassa
  // a sobra ao cliente; apenas a torna visível).
  carregarSobraNaVenda?: boolean;
}

export interface ResultadoCustoTotal {
  custoUnitarioReal: number;     // produto + rateio de fretes/outros
  custoLoteReal: number;
  percentuaisSobreVenda: number; // impostos + taxas + financeiro
  precoMinimoUnit: number | null;      // cobre custo + percentuais + margem mínima
  precoRecomendadoUnit: number | null; // cobre custo + percentuais + margem desejada
  margemLiquidaEm: (precoUnit: number) => number; // % líquida num preço dado
  embalagem?: EmbalagemResult;   // quebra de embalagem quando informada (§8)
  alertas: string[];
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function calcularCustoTotal(e: EntradaCustoTotal): ResultadoCustoTotal {
  const alertas: string[] = [];
  const qtd = e.quantidade > 0 ? e.quantidade : 1;
  if (e.quantidade <= 0) alertas.push("Quantidade inválida — assumindo 1.");

  const extrasLote = (e.freteEntradaTotal ?? 0) + (e.freteSaidaTotal ?? 0) + (e.outrosCustosTotal ?? 0);

  // §8 — embalagem fechada: quando a apresentação é informada, calcula quantas
  // embalagens comprar, a sobra e o custo real da compra.
  let embalagem: EmbalagemResult | undefined;
  let custoUnitarioProduto = e.precoProdutoUnit;
  if (e.unidadesPorEmbalagem != null && e.unidadesPorEmbalagem >= 1) {
    embalagem = calcularEmbalagem({
      quantidadeSolicitada: qtd,
      unidadesPorEmbalagem: e.unidadesPorEmbalagem,
      precoUnitario: e.precoProdutoUnit,
      permitirFracionar: e.permitirFracionar,
    });
    if (embalagem.sobra > 0) {
      alertas.push(
        `Embalagem fechada: ${embalagem.embalagensNecessarias} × ${e.unidadesPorEmbalagem} un = ` +
          `${embalagem.quantidadeTotalFornecida} fornecidas (sobra de ${embalagem.sobra} além das ${qtd} solicitadas).`,
      );
      // Repassa a sobra ao custo por unidade solicitada apenas se pedido.
      if (e.carregarSobraNaVenda) custoUnitarioProduto = r2(embalagem.custoTotal / qtd);
    }
  }

  const custoUnitarioReal = r2(custoUnitarioProduto + extrasLote / qtd);
  const custoLoteReal = r2(custoUnitarioReal * qtd);

  const percentuaisSobreVenda =
    (e.impostosPct ?? 0) + (e.taxasPct ?? 0) + (e.custoFinanceiroPct ?? 0);

  const precoPara = (margemPct: number): number | null => {
    const divisor = 1 - (percentuaisSobreVenda + margemPct) / 100;
    if (divisor <= 0) {
      return null; // impossível: percentuais + margem >= 100% da venda
    }
    return r2(custoUnitarioReal / divisor);
  };

  const precoMinimoUnit = e.margemMinimaPct != null ? precoPara(e.margemMinimaPct) : precoPara(0);
  const precoRecomendadoUnit = e.margemDesejadaPct != null ? precoPara(e.margemDesejadaPct) : null;

  if (precoMinimoUnit == null) {
    alertas.push("Impostos + taxas + margem somam 100% ou mais do preço — operação inviável.");
  }
  if (extrasLote > 0 && extrasLote / qtd > e.precoProdutoUnit * 0.3) {
    alertas.push("Fretes/custos extras passam de 30% do preço do produto — confira a cubagem/lote mínimo.");
  }

  const margemLiquidaEm = (precoUnit: number): number => {
    if (precoUnit <= 0) return 0;
    const liquido = precoUnit * (1 - percentuaisSobreVenda / 100);
    return Math.round(((liquido - custoUnitarioReal) / precoUnit) * 1000) / 10;
  };

  return {
    custoUnitarioReal,
    custoLoteReal,
    percentuaisSobreVenda,
    precoMinimoUnit,
    precoRecomendadoUnit,
    margemLiquidaEm,
    embalagem,
    alertas,
  };
}
