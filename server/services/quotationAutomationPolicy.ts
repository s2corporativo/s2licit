import { methodIsDeterministic } from "./matchingDecisionPolicy";

export function canAutoConfirmQuotationMatch(input: {
  matchMethod: string;
  matchScore?: number | string | null;
  productId?: number | null;
  cost?: number | string | null;
}): boolean {
  if (input.productId == null) return false;
  const cost = Number(input.cost);
  if (!Number.isFinite(cost) || cost <= 0) return false;
  return methodIsDeterministic(input.matchMethod);
}
