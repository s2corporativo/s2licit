/**
 * supplierRankingService.ts
 *
 * Seleção multi-fornecedor ponderada (spec §10).
 *
 * "A seleção do fornecedor não deverá considerar apenas o menor preço." Este
 * módulo pondera custo total real, correspondência técnica, prazo, histórico/
 * confiabilidade e risco, normalizando cada dimensão entre as opções e somando
 * com pesos configuráveis. Disponibilidade indisponível penaliza fortemente.
 *
 * Módulo puro (sem I/O), aditivo — não altera o comparador por preço existente.
 */

import { normalizarScore } from "./matchClassification";

export interface OpcaoFornecedor {
  fornecedorId?: number;
  fornecedor: string;
  /** Custo total real (landed: produto + frete + tributos). Menor é melhor. */
  custoTotal: number;
  /** Correspondência técnica 0–1 ou 0–100. Maior é melhor. */
  compatibilidade: number;
  /** Prazo de entrega em dias. Menor é melhor. Opcional. */
  prazoDias?: number;
  /** Há estoque/oferta? Indisponível penaliza fortemente. */
  disponivel?: boolean;
  /** Confiabilidade/histórico 0–1. Maior é melhor. Opcional. */
  confiabilidade?: number;
  /** Risco de indisponibilidade 0–1. Menor é melhor. Opcional. */
  risco?: number;
}

export interface PesosRanking {
  custo: number;
  compatibilidade: number;
  prazo: number;
  confiabilidade: number;
  risco: number;
}

export const PESOS_PADRAO: PesosRanking = {
  custo: 0.4,
  compatibilidade: 0.25,
  prazo: 0.15,
  confiabilidade: 0.1,
  risco: 0.1,
};

/** Penalidade multiplicativa aplicada ao score de uma opção indisponível. */
export const PENALIDADE_INDISPONIVEL = 0.1;

export interface OpcaoRanqueada extends OpcaoFornecedor {
  /** Score final 0–1 (maior é melhor). */
  score: number;
  /** Contribuição normalizada por dimensão (0–1). */
  fatores: { custo: number; compatibilidade: number; prazo: number; confiabilidade: number; risco: number };
  posicao: number;
}

export interface ResultadoRanking {
  opcoes: OpcaoRanqueada[];
  melhor: OpcaoRanqueada | null;
}

/**
 * Fator para dimensões "menor é melhor" (custo, prazo): razão do melhor (menor)
 * valor sobre o valor da opção — proporcional à magnitude, não à posição. O
 * mais barato recebe 1; uma opção 10% mais cara recebe ~0,91 (e não 0). Assim,
 * uma diferença pequena de preço não zera a dimensão, evitando que o sistema
 * decida só pelo menor preço (§10). Valor <= 0 (ex.: prazo imediato) = melhor.
 */
function fatorMenorMelhor(valores: number[]): (v: number) => number {
  const positivos = valores.filter((v) => v > 0);
  const min = positivos.length ? Math.min(...positivos) : 0;
  return (v: number) => {
    if (v <= 0) return 1;
    if (min <= 0) return 1;
    return Math.min(1, min / v);
  };
}

/**
 * Ranqueia as opções de fornecedor para um mesmo item. Retorna a lista
 * ordenada (melhor primeiro) e a melhor opção disponível.
 */
export function ranquearFornecedores(
  opcoes: OpcaoFornecedor[],
  pesos: PesosRanking = PESOS_PADRAO,
): ResultadoRanking {
  if (opcoes.length === 0) return { opcoes: [], melhor: null };

  const normCusto = fatorMenorMelhor(opcoes.map((o) => o.custoTotal));
  const normPrazo = fatorMenorMelhor(opcoes.filter((o) => o.prazoDias != null).map((o) => o.prazoDias as number));
  // Confiabilidade e risco ausentes → neutros (0.5 antes da ponderação).
  const somaPesos = pesos.custo + pesos.compatibilidade + pesos.prazo + pesos.confiabilidade + pesos.risco || 1;

  const ranqueadas = opcoes.map((o) => {
    const fCusto = normCusto(o.custoTotal);
    const fComp = normalizarScore(o.compatibilidade);
    const fPrazo = o.prazoDias != null ? normPrazo(o.prazoDias) : 0.5;
    const fConf = o.confiabilidade != null ? normalizarScore(o.confiabilidade) : 0.5;
    const fRisco = o.risco != null ? 1 - normalizarScore(o.risco) : 0.5;

    let score =
      (pesos.custo * fCusto +
        pesos.compatibilidade * fComp +
        pesos.prazo * fPrazo +
        pesos.confiabilidade * fConf +
        pesos.risco * fRisco) /
      somaPesos;

    if (o.disponivel === false) score *= PENALIDADE_INDISPONIVEL;

    return {
      ...o,
      score: Math.round(score * 1000) / 1000,
      fatores: {
        custo: Math.round(fCusto * 1000) / 1000,
        compatibilidade: Math.round(fComp * 1000) / 1000,
        prazo: Math.round(fPrazo * 1000) / 1000,
        confiabilidade: Math.round(fConf * 1000) / 1000,
        risco: Math.round(fRisco * 1000) / 1000,
      },
      posicao: 0,
    };
  });

  // Ordena por score desc; desempata por menor custo total.
  ranqueadas.sort((a, b) => (b.score - a.score) || (a.custoTotal - b.custoTotal));
  ranqueadas.forEach((o, i) => (o.posicao = i + 1));

  const melhor = ranqueadas.find((o) => o.disponivel !== false) ?? ranqueadas[0];
  return { opcoes: ranqueadas, melhor };
}
