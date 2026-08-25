export const RAG_AUTO_MATCH_REQUIRES_TECHNICAL_GUARD = true;
export const RAG_DEFAULT_AUTO_MATCH_SCORE = 1;

/**
 * Enquanto a recuperação vetorial não estiver acompanhada da guarda técnica
 * completa, score semântico isolado nunca autoriza auto-match.
 */
export function ragSemanticScoreAloneMayAutoMatch(): boolean {
  return false;
}
