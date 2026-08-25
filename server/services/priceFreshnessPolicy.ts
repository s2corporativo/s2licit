export type CostOrigin = "live_query" | "supplier_offer" | "nfe" | "spreadsheet" | "manual" | "unknown";

export interface CostFreshnessInput {
  origin: CostOrigin;
  consultedAt?: Date | string | number | null;
  maxAgeHours: number;
}

export interface CostFreshnessDecision {
  fresh: boolean;
  requiresHumanConfirmation: boolean;
  reason: string | null;
}

/**
 * Custos sem data nunca são considerados frescos para AUTOMAÇÃO. NF-e,
 * planilha e cadastro manual continuam utilizáveis após confirmação humana,
 * mas não podem alimentar envio/geração automática silenciosamente.
 */
export function evaluateCostFreshness(input: CostFreshnessInput): CostFreshnessDecision {
  if (!input.consultedAt) {
    return {
      fresh: false,
      requiresHumanConfirmation: true,
      reason: "Custo sem data de consulta/aquisição — confirme manualmente antes de automatizar a proposta.",
    };
  }
  const ts = new Date(input.consultedAt).getTime();
  if (!Number.isFinite(ts)) {
    return { fresh: false, requiresHumanConfirmation: true, reason: "Data do custo inválida." };
  }
  const ageHours = (Date.now() - ts) / 3_600_000;
  if (ageHours < 0) {
    return { fresh: false, requiresHumanConfirmation: true, reason: "Data do custo está no futuro." };
  }
  if (ageHours > input.maxAgeHours) {
    return {
      fresh: false,
      requiresHumanConfirmation: true,
      reason: `Custo vencido (${Math.floor(ageHours)}h; validade ${input.maxAgeHours}h).`,
    };
  }
  return { fresh: true, requiresHumanConfirmation: false, reason: null };
}
