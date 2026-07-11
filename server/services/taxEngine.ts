import type { TaxRule } from "../../drizzle/schema";

/**
 * Motor Tributário (Tax Engine).
 *
 * Calcula a carga tributária ESTIMADA de uma venda a partir das regras
 * cadastradas (versionadas, com vigência e recorte por UF). Funções puras,
 * sem acesso a banco — testáveis e auditáveis.
 *
 * Regras de honestidade (spec §15):
 *  - nunca afirmar enquadramento tributário; o resultado é estimativa;
 *  - cada linha indica a regra de origem (id + descrição);
 *  - divergências devem ser validadas com o contador.
 */

export interface LinhaImposto {
  regraId: number;
  descricao: string;
  tipo: string;
  percentual: number;
  valor: number;
}

export interface ResultadoImpostos {
  linhas: LinhaImposto[];
  totalPercentual: number;
  totalValor: number;
  valorLiquido: number;
  /** Margem líquida sobre a venda, quando o custo é informado. */
  margemLiquidaPercentual: number | null;
  lucroLiquido: number | null;
  alertas: string[];
}

/** Filtra regras ativas e vigentes na data de referência. */
export function regrasVigentes(regras: TaxRule[], data: Date = new Date()): TaxRule[] {
  return regras.filter((r) => {
    if (!r.ativo) return false;
    const inicio = new Date(r.vigenciaInicio);
    if (data < inicio) return false;
    if (r.vigenciaFim && data > new Date(r.vigenciaFim)) return false;
    return true;
  });
}

/** Uma regra se aplica quando a UF bate (ou a regra não restringe UF). */
function regraAplicavel(r: TaxRule, ufOrigem?: string, ufDestino?: string): boolean {
  const origemOk = !r.ufOrigem || !ufOrigem || r.ufOrigem.toUpperCase() === ufOrigem.toUpperCase();
  const destinoOk = !r.ufDestino || !ufDestino || r.ufDestino.toUpperCase() === ufDestino.toUpperCase();
  // DIFAL só existe em operação interestadual — se origem e destino são
  // iguais e conhecidos, a regra de DIFAL não se aplica.
  if (r.tipo === "difal" && ufOrigem && ufDestino && ufOrigem.toUpperCase() === ufDestino.toUpperCase()) {
    return false;
  }
  return origemOk && destinoOk;
}

export function calcularImpostos(params: {
  valorVenda: number;
  custo?: number;
  ufOrigem?: string;
  ufDestino?: string;
  data?: Date;
  regras: TaxRule[];
}): ResultadoImpostos {
  const { valorVenda, custo, ufOrigem, ufDestino } = params;
  const alertas: string[] = [];
  const vigentes = regrasVigentes(params.regras, params.data ?? new Date());
  const aplicaveis = vigentes.filter((r) => regraAplicavel(r, ufOrigem, ufDestino));

  const linhas: LinhaImposto[] = aplicaveis.map((r) => {
    const pct = Number(r.percentual);
    return {
      regraId: r.id,
      descricao: r.descricao,
      tipo: r.tipo,
      percentual: pct,
      valor: Math.round(valorVenda * pct) / 100, // pct é %, arredonda a centavo
    };
  });

  const totalPercentual = linhas.reduce((s, l) => s + l.percentual, 0);
  const totalValor = Math.round(linhas.reduce((s, l) => s + l.valor * 100, 0)) / 100;
  const valorLiquido = Math.round((valorVenda - totalValor) * 100) / 100;

  if (aplicaveis.length === 0) {
    alertas.push("Nenhuma regra tributária vigente para esta operação — cadastre as regras no Motor Tributário.");
  }
  if (totalPercentual >= 40) {
    alertas.push(`Carga estimada muito alta (${totalPercentual.toFixed(1)}%) — confira se não há regras duplicadas.`);
  }

  let margemLiquidaPercentual: number | null = null;
  let lucroLiquido: number | null = null;
  if (custo != null && custo >= 0 && valorVenda > 0) {
    lucroLiquido = Math.round((valorLiquido - custo) * 100) / 100;
    margemLiquidaPercentual = Math.round((lucroLiquido / valorVenda) * 1000) / 10;
    if (lucroLiquido < 0) {
      alertas.push("PREJUÍZO: o valor líquido após impostos não cobre o custo.");
    }
  }

  return { linhas, totalPercentual, totalValor, valorLiquido, margemLiquidaPercentual, lucroLiquido, alertas };
}

/**
 * Alíquota total estimada (%) para uma operação — atalho usado pela
 * precificação (o piso precisa cobrir custo + impostos + margem mínima).
 */
export function aliquotaTotal(params: {
  ufOrigem?: string;
  ufDestino?: string;
  data?: Date;
  regras: TaxRule[];
}): number {
  const res = calcularImpostos({ valorVenda: 100, ...params });
  return res.totalPercentual;
}
