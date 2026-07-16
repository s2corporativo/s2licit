/**
 * matchClassification.ts
 *
 * Taxonomia canônica de compatibilidade e regra de automação (spec §6).
 *
 * O sistema tinha limiares divergentes por módulo (0.85/0.60 no productMatcher,
 * 50 no equivalenceValidation, 95/70 na deduplicação...) e não implementava a
 * regra da especificação:
 *   - 100%:        produto exato;
 *   - 90% a 99%:   equivalente com diferenças irrelevantes (uso automático ok);
 *   - 75% a 89%:   provável equivalente — EXIGE validação humana;
 *   - abaixo de 75%: NÃO utilizar automaticamente.
 *
 * Este módulo é a fonte única de verdade dessa classificação. Puro e testável.
 */

export type ClasseCompatibilidade =
  | "exata"          // 100%
  | "equivalente"    // 90–99% (diferenças irrelevantes)
  | "provavel"       // 75–89% (exige validação humana)
  | "parcial"        // 60–74%
  | "incompativel"   // < 60%
  | "nao_encontrado" // nenhum candidato
  | "indisponivel";  // encontrado, mas sem estoque/oferta

/** Abaixo deste score (fração 0–1) nada pode ser usado automaticamente. */
export const LIMIAR_AUTO = 0.75;
/** A partir deste score o uso automático dispensa validação humana. */
export const LIMIAR_SEM_VALIDACAO = 0.9;

export type StatusDisponibilidade = "disponivel" | "indisponivel" | "nao_encontrado";

export interface ClassificacaoCompatibilidade {
  classe: ClasseCompatibilidade;
  /** Score normalizado em 0–100 (inteiro). */
  percentual: number;
  /** Uso automático permitido sem validação humana (>= 90%). */
  usoAutomaticoPermitido: boolean;
  /** Está na faixa 75–89%: só com validação humana. */
  exigeValidacaoHumana: boolean;
  /** Abaixo de 75%: proibido usar automaticamente. */
  naoUsarAutomaticamente: boolean;
}

/** Normaliza um score recebido em fração (0–1) ou percentual (0–100) para 0–1. */
export function normalizarScore(score: number): number {
  if (!Number.isFinite(score) || score <= 0) return 0;
  const frac = score > 1 ? score / 100 : score;
  return Math.min(1, Math.max(0, frac));
}

/**
 * Classifica um score de compatibilidade nas classes canônicas e aplica a
 * regra de automação da §6.
 *
 * @param score fração 0–1 ou percentual 0–100.
 * @param status disponibilidade do candidato — força "indisponivel"/
 *   "nao_encontrado" independentemente do score.
 */
export function classificarCompatibilidade(
  score: number,
  status: StatusDisponibilidade = "disponivel",
): ClassificacaoCompatibilidade {
  if (status === "nao_encontrado") {
    return classeSemUso("nao_encontrado", 0);
  }

  const frac = normalizarScore(score);
  const percentual = Math.round(frac * 100);

  if (status === "indisponivel") {
    return classeSemUso("indisponivel", percentual);
  }

  let classe: ClasseCompatibilidade;
  if (percentual >= 100) classe = "exata";
  else if (frac >= LIMIAR_SEM_VALIDACAO) classe = "equivalente";
  else if (frac >= LIMIAR_AUTO) classe = "provavel";
  else if (frac >= 0.6) classe = "parcial";
  else classe = "incompativel";

  const usoAutomaticoPermitido = frac >= LIMIAR_SEM_VALIDACAO;
  const exigeValidacaoHumana = frac >= LIMIAR_AUTO && frac < LIMIAR_SEM_VALIDACAO;
  const naoUsarAutomaticamente = frac < LIMIAR_AUTO;

  return { classe, percentual, usoAutomaticoPermitido, exigeValidacaoHumana, naoUsarAutomaticamente };
}

function classeSemUso(classe: ClasseCompatibilidade, percentual: number): ClassificacaoCompatibilidade {
  return {
    classe,
    percentual,
    usoAutomaticoPermitido: false,
    exigeValidacaoHumana: false,
    naoUsarAutomaticamente: true,
  };
}
