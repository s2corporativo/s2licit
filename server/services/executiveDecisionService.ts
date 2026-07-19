export type RiskLevel = "low" | "medium" | "high";
export type CompetitionLevel = "low" | "medium" | "high";
export type ExecutiveRecommendation = "go" | "caution" | "no_go";

export interface ExecutiveDecisionInput {
  marginPercent: number;
  supplierCoveragePercent: number;
  documentationReadinessPercent: number;
  deliveryConfidencePercent: number;
  workingCapitalCoveragePercent: number;
  competitionLevel: CompetitionLevel;
  deadlineDays: number;
  legalRisk: RiskLevel;
  taxRisk: RiskLevel;
  operationalRisk: RiskLevel;
}

export interface ExecutiveDecisionResult {
  score: number;
  recommendation: ExecutiveRecommendation;
  blockers: string[];
  reasons: string[];
  actions: string[];
  normalized: Record<string, number>;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function riskScore(level: RiskLevel): number {
  if (level === "low") return 100;
  if (level === "medium") return 55;
  return 10;
}

function competitionScore(level: CompetitionLevel): number {
  if (level === "low") return 100;
  if (level === "medium") return 60;
  return 25;
}

function deadlineScore(days: number): number {
  if (!Number.isFinite(days) || days < 0) return 0;
  if (days === 0) return 5;
  if (days <= 1) return 20;
  if (days <= 3) return 45;
  if (days <= 7) return 75;
  return 100;
}

function marginScore(marginPercent: number): number {
  if (!Number.isFinite(marginPercent) || marginPercent <= 0) return 0;
  if (marginPercent < 5) return 15;
  if (marginPercent < 10) return 40;
  if (marginPercent < 15) return 65;
  if (marginPercent < 25) return 85;
  return 100;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Avaliação determinística de oportunidade. Não substitui a decisão humana:
 * explicita pesos, bloqueios e ações necessárias para que o operador possa
 * auditar por que o sistema recomendou GO, CAUTELA ou NO-GO.
 */
export function evaluateExecutiveDecision(
  input: ExecutiveDecisionInput,
): ExecutiveDecisionResult {
  const normalized = {
    margin: marginScore(input.marginPercent),
    supplierCoverage: clampPercent(input.supplierCoveragePercent),
    documentation: clampPercent(input.documentationReadinessPercent),
    delivery: clampPercent(input.deliveryConfidencePercent),
    workingCapital: clampPercent(input.workingCapitalCoveragePercent),
    competition: competitionScore(input.competitionLevel),
    deadline: deadlineScore(input.deadlineDays),
    legalRisk: riskScore(input.legalRisk),
    taxRisk: riskScore(input.taxRisk),
    operationalRisk: riskScore(input.operationalRisk),
  };

  const score = round(
    normalized.margin * 0.22 +
      normalized.supplierCoverage * 0.14 +
      normalized.documentation * 0.14 +
      normalized.delivery * 0.1 +
      normalized.workingCapital * 0.1 +
      normalized.competition * 0.08 +
      normalized.deadline * 0.06 +
      normalized.legalRisk * 0.06 +
      normalized.taxRisk * 0.05 +
      normalized.operationalRisk * 0.05,
  );

  const blockers: string[] = [];
  const reasons: string[] = [];
  const actions: string[] = [];

  if (input.deadlineDays < 0) blockers.push("O prazo da oportunidade já venceu.");
  if (input.documentationReadinessPercent < 50) {
    blockers.push("Habilitação documental inferior a 50%.");
    actions.push("Concluir certidões e documentos obrigatórios antes de avançar.");
  }
  if (input.supplierCoveragePercent < 40) {
    blockers.push("Cobertura de fornecedores inferior a 40% dos itens.");
    actions.push("Cotizar os itens sem fornecedor e validar disponibilidade real.");
  }
  if (input.workingCapitalCoveragePercent < 40) {
    blockers.push("Capital de giro cobre menos de 40% da necessidade estimada.");
    actions.push("Rever prazo de pagamento, crédito e desembolso antes da participação.");
  }
  if (input.marginPercent <= 0) blockers.push("Margem não positiva.");
  if (input.legalRisk === "high") {
    blockers.push("Risco jurídico alto não mitigado.");
    actions.push("Submeter o edital à análise jurídica e avaliar impugnação/esclarecimento.");
  }

  if (input.marginPercent >= 15) reasons.push(`Margem projetada de ${round(input.marginPercent)}% é adequada.`);
  else reasons.push(`Margem projetada de ${round(input.marginPercent)}% exige cautela.`);

  if (input.supplierCoveragePercent >= 80) reasons.push("Cobertura de fornecedores é ampla.");
  else actions.push("Ampliar cobertura e confirmar estoque/prazo dos fornecedores.");

  if (input.documentationReadinessPercent >= 90) reasons.push("Documentação de habilitação está praticamente pronta.");
  else actions.push("Fechar as pendências documentais antes do envio da proposta.");

  if (input.deliveryConfidencePercent < 70) actions.push("Revalidar logística, frete e prazo de entrega.");
  if (input.taxRisk !== "low") actions.push("Revisar NCM, regime tributário, ICMS/DIFAL/ST e retenções.");
  if (input.operationalRisk !== "low") actions.push("Definir responsável, cronograma e plano de contingência operacional.");
  if (input.deadlineDays <= 3) actions.push("Tratar a oportunidade como prazo crítico e bloquear tarefas não essenciais.");

  let recommendation: ExecutiveRecommendation;
  if (blockers.length > 0 || score < 45) recommendation = "no_go";
  else if (score < 72) recommendation = "caution";
  else recommendation = "go";

  return {
    score,
    recommendation,
    blockers,
    reasons: [...new Set(reasons)],
    actions: [...new Set(actions)],
    normalized,
  };
}
