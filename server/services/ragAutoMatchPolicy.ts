import { validateTechnicalMatch, type TechnicalMatchCandidate, type TechnicalMatchRequest } from "./technicalMatchGuard";

export interface RagAutoMatchInput {
  semanticScore: number;
  threshold: number;
  request: TechnicalMatchRequest;
  candidate: TechnicalMatchCandidate;
}

/** Similaridade semântica é necessária, nunca suficiente, para auto-match. */
export function mayAutoMatchRag(input: RagAutoMatchInput): { autoMatch: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!Number.isFinite(input.semanticScore) || input.semanticScore < input.threshold) {
    reasons.push(`Score semântico abaixo do limiar (${input.semanticScore.toFixed(3)} < ${input.threshold.toFixed(3)}).`);
  }
  const technical = validateTechnicalMatch(input.request, input.candidate);
  reasons.push(...technical.reasons);
  return { autoMatch: reasons.length === 0, reasons };
}
