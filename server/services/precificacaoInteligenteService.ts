import { PricingService, type PricingConfiguration } from "./pricingService";

/**
 * Precificação inteligente para licitação: combina custo + impostos + frete +
 * margem (via PricingService) com o histórico de preços homologados (PNCP)
 * para sugerir um preço competitivo, sempre respeitando o preço-piso.
 *
 * Três números que importam ao operador:
 *  - PISO: menor preço sem prejuízo (custo + impostos + frete + margem mínima).
 *    NUNCA vender abaixo disso — é a linha vermelha no pregão.
 *  - ALVO: preço com a margem desejada (o ideal, se não houver concorrência).
 *  - SUGERIDO: preço para ter chance de ganhar, calibrado pelo histórico do
 *    órgão/mercado, mas travado entre PISO e ALVO.
 */

export interface EstatisticasHomologado {
  amostras: number;
  media: number | null;
  minimo: number | null;
  maximo: number | null;
  mediana: number | null;
}

export interface SugestaoPreco {
  piso: number;        // não descer abaixo disto
  alvo: number;        // preço com margem desejada
  sugerido: number;    // recomendado para ganhar
  margemMinima: number;
  margemDesejada: number;
  margemNoSugerido: number; // margem real (%) resultante do preço sugerido
  baseHistorica: number | null; // mediana homologada usada, se houver
  alerta: string | null;
  recomendacao: string;
}

/**
 * Fator de agressividade sobre a mediana histórica (0-1]. 0.98 = mira 2%
 * abaixo da mediana homologada para ser competitivo.
 */
const FATOR_COMPETITIVO = 0.98;

export function sugerirPreco(params: {
  custo: number;
  config: Omit<PricingConfiguration, "marginPercentage">;
  margemMinima: number;   // % — piso
  margemDesejada: number; // % — alvo
  estatisticasHomologado?: EstatisticasHomologado | null;
}): SugestaoPreco {
  const { custo, config, margemMinima, margemDesejada } = params;

  const piso = round2(
    PricingService.calculatePrice(custo, { ...config, marginPercentage: margemMinima }).finalPrice,
  );
  const alvo = round2(
    PricingService.calculatePrice(custo, { ...config, marginPercentage: margemDesejada }).finalPrice,
  );

  const stats = params.estatisticasHomologado;
  const base = stats?.mediana ?? stats?.media ?? null;

  let sugerido = alvo;
  let alerta: string | null = null;
  let recomendacao = "";

  if (base != null && base > 0) {
    const competitivo = round2(base * FATOR_COMPETITIVO);
    // Trava entre piso e alvo.
    sugerido = Math.min(alvo, Math.max(piso, competitivo));

    if (base < piso) {
      alerta =
        `Histórico homologado (R$ ${base.toFixed(2)}) está ABAIXO do seu preço-piso ` +
        `(R$ ${piso.toFixed(2)}). Provavelmente sairia no prejuízo — reavalie custo/fornecedor ou não entre.`;
      recomendacao = `Sem margem viável ao preço de mercado. Piso R$ ${piso.toFixed(2)}.`;
    } else if (competitivo < piso) {
      sugerido = piso;
      alerta = `Para ser competitivo seria preciso ir abaixo do piso; sugerido travado no piso.`;
      recomendacao = `Margem apertada: use o piso R$ ${piso.toFixed(2)} e avalie se vale entrar.`;
    } else {
      recomendacao =
        `Mire ~R$ ${sugerido.toFixed(2)} (2% abaixo da mediana homologada de R$ ${base.toFixed(2)}). ` +
        `No pregão, não desça abaixo de R$ ${piso.toFixed(2)}.`;
    }
  } else {
    recomendacao =
      `Sem histórico homologado para calibrar. Use o alvo R$ ${alvo.toFixed(2)} ` +
      `(margem ${margemDesejada}%) e, no pregão, o piso é R$ ${piso.toFixed(2)}.`;
  }

  return {
    piso,
    alvo,
    sugerido: round2(sugerido),
    margemMinima,
    margemDesejada,
    margemNoSugerido: round2(margemSobreVenda(custo, config, sugerido)),
    baseHistorica: base,
    alerta,
    recomendacao,
  };
}

/**
 * Margem real (%) sobre a venda resultante de um preço final, dado o custo e a
 * config de impostos/frete. Deriva do custo-antes-da-margem do PricingService.
 */
function margemSobreVenda(
  custo: number,
  config: Omit<PricingConfiguration, "marginPercentage">,
  precoFinal: number,
): number {
  // priceBeforeMargin não depende da margem — pegamos com margem 0.
  const semMargem = PricingService.calculatePrice(custo, { ...config, marginPercentage: 0 });
  const custoTotal = semMargem.priceBeforeMargin;
  if (precoFinal <= 0) return 0;
  return ((precoFinal - custoTotal) / precoFinal) * 100;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
