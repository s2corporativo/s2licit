import { and, count, desc, eq, or } from "drizzle-orm";
import {
  capturedProducts,
  diligenciaWorkflows,
  documentosHabilitacao,
  equivalenceMembers,
  executiveDecisionFactors,
  executiveDecisions,
  orgHistoryEvents,
  proposalItems,
  proposals,
  requestingOrgs,
} from "../../drizzle/schema";
import { getDb } from "../db";

type DecisionLabel = "vale_entrar" | "entrar_com_cautela" | "nao_vale_entrar";
type FactorKind = "catalogo" | "margem" | "documental" | "tecnico" | "operacional" | "historico_orgao" | "completude";

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const toNumber = (value: unknown) => Number(value ?? 0);

export async function calculateCatalogAdherence(proposalId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const items = await db.select().from(proposalItems).where(eq(proposalItems.proposalId, proposalId));
  const total = items.length || 1;
  const covered = items.filter((item) => Boolean(item.productId)).length;
  const equivalent = items.filter((item) => Boolean(item.activeIngredient) && !item.productId).length;
  const score = clamp(Math.round(((covered + equivalent * 0.6) / total) * 100));

  return {
    total,
    covered,
    equivalent,
    uncovered: Math.max(0, total - covered - equivalent),
    score,
  };
}

export async function calculateMarginScore(proposalId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const items = await db.select().from(proposalItems).where(eq(proposalItems.proposalId, proposalId));
  if (!items.length) return { score: 20, averageMargin: 0, riskyItems: 0 };

  let sum = 0;
  let riskyItems = 0;
  for (const item of items) {
    const cost = toNumber(item.costPrice ?? item.unitPrice);
    const sale = toNumber(item.suggestedPrice ?? item.totalPrice ?? item.unitPrice);
    const margin = cost > 0 && sale > 0 ? ((sale - cost) / cost) * 100 : 0;
    sum += margin;
    if (margin < 8) riskyItems += 1;
  }

  const averageMargin = sum / items.length;
  const score = clamp(Math.round(averageMargin * 2 - riskyItems * 6), 0, 100);
  return { score, averageMargin: Number(averageMargin.toFixed(2)), riskyItems };
}

export async function calculateDocumentalRisk() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const docs = await db
    .select()
    .from(documentosHabilitacao)
    .where(or(eq(documentosHabilitacao.statusValidade, "expirando"), eq(documentosHabilitacao.statusValidade, "vencido")));

  const score = clamp(100 - docs.length * 8, 0, 100);
  return { score, flaggedDocuments: docs.length };
}

export async function calculateTechnicalRisk(proposalId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const items = await db.select().from(proposalItems).where(eq(proposalItems.proposalId, proposalId));
  const itemsWithoutRegistro = items.filter((item) => !item.registroMapa).length;
  const itemsWithoutCatalog = items.filter((item) => !item.productId && !item.activeIngredient).length;
  const weakEquivalence = items.filter((item) => Boolean(item.activeIngredient) && !item.productId).length;
  const score = clamp(100 - itemsWithoutRegistro * 12 - itemsWithoutCatalog * 15 - weakEquivalence * 6, 0, 100);

  return {
    score,
    itemsWithoutRegistro,
    itemsWithoutCatalog,
    weakEquivalence,
  };
}

export async function calculateOperationalRisk(proposalId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
  const items = await db.select().from(proposalItems).where(eq(proposalItems.proposalId, proposalId));
  if (!proposal) return { score: 0, prazoCritico: true, volumeCritico: false };

  const prazoCritico = /urgente|imediat|24h|48h|72h/i.test(`${proposal.title ?? ""} ${proposal.notes ?? ""}`);
  const volumeCritico = items.length >= 80;
  const score = clamp(100 - (prazoCritico ? 25 : 0) - (volumeCritico ? 15 : 0), 0, 100);

  return { score, prazoCritico, volumeCritico };
}

export async function calculateOrganHistoryScore(orgId: number | null | undefined) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  if (!orgId) return { score: 55, recurringIssues: 0, totalEvents: 0 };

  const events = await db.select().from(orgHistoryEvents).where(eq(orgHistoryEvents.orgId, orgId)).orderBy(desc(orgHistoryEvents.createdAt)).limit(30);
  const recurringIssues = events.filter((event) => (event.score ?? 0) < 0 || /glosa|dilig|restrit/i.test(event.title || "")).length;
  const score = clamp(100 - recurringIssues * 8, 20, 100);

  return { score, recurringIssues, totalEvents: events.length };
}

export function generateExecutiveJustification(input: {
  decision: DecisionLabel;
  adherence: { score: number; covered: number; equivalent: number; uncovered: number };
  margin: { score: number; averageMargin: number; riskyItems: number };
  documental: { score: number; flaggedDocuments: number };
  technical: { score: number; itemsWithoutRegistro: number; itemsWithoutCatalog: number; weakEquivalence: number };
  operational: { score: number; prazoCritico: boolean; volumeCritico: boolean };
  organ: { score: number; recurringIssues: number; totalEvents: number };
}) {
  const recommendationMap: Record<DecisionLabel, string> = {
    vale_entrar: "vale entrar",
    entrar_com_cautela: "entrar com cautela",
    nao_vale_entrar: "não vale entrar",
  };

  return [
    `Recomendação executiva: ${recommendationMap[input.decision]}.`,
    `Aderência ao catálogo: ${input.adherence.score}/100 (${input.adherence.covered} cobertos, ${input.adherence.equivalent} por equivalência, ${input.adherence.uncovered} sem cobertura).`,
    `Margem estimada: ${input.margin.averageMargin}% com ${input.margin.riskyItems} item(ns) em faixa de risco.`,
    `Risco documental: ${input.documental.flaggedDocuments} documento(s) em alerta.`,
    `Risco técnico: ${input.technical.itemsWithoutRegistro} item(ns) sem registro e ${input.technical.itemsWithoutCatalog} sem cobertura direta.`,
    `Risco operacional: prazo crítico=${input.operational.prazoCritico ? "sim" : "não"}, volume crítico=${input.operational.volumeCritico ? "sim" : "não"}.`,
    `Histórico do órgão: ${input.organ.totalEvents} evento(s) relevantes, ${input.organ.recurringIssues} sinal(is) negativo(s).`,
  ].join(" ");
}

function classifyDecision(score: number): DecisionLabel {
  if (score >= 80) return "vale_entrar";
  if (score >= 55) return "entrar_com_cautela";
  return "nao_vale_entrar";
}

export async function evaluateOpportunity(proposalId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
  if (!proposal) throw new Error("Proposta/oportunidade não encontrada");

  const adherence = await calculateCatalogAdherence(proposalId);
  const margin = await calculateMarginScore(proposalId);
  const documental = await calculateDocumentalRisk();
  const technical = await calculateTechnicalRisk(proposalId);
  const operational = await calculateOperationalRisk(proposalId);
  const organ = await calculateOrganHistoryScore(proposal.orgId ?? null);

  const score = clamp(
    Math.round(
      adherence.score * 0.25 +
        margin.score * 0.2 +
        documental.score * 0.15 +
        technical.score * 0.2 +
        operational.score * 0.1 +
        organ.score * 0.1,
    ),
  );

  const decision = classifyDecision(score);
  const justification = generateExecutiveJustification({ decision, adherence, margin, documental, technical, operational, organ });

  const result = await db.insert(executiveDecisions).values({
    proposalId,
    orgId: proposal.orgId ?? null,
    recommendation: decision,
    totalScore: score,
    adherenceScore: adherence.score,
    marginScore: margin.score,
    documentalRiskScore: documental.score,
    technicalRiskScore: technical.score,
    operationalRiskScore: operational.score,
    historyScore: organ.score,
    marginEstimate: String(margin.averageMargin.toFixed(2)),
    justification,
    nextStep: decision === "vale_entrar" ? "Prosseguir para estratégia de proposta e documentação." : decision === "entrar_com_cautela" ? "Revisar riscos documental/técnico antes da submissão." : "Arquivar ou reavaliar somente com novos dados.",
    riskSummary: JSON.stringify({
      proposalTitle: proposal.title,
      proposalStatus: proposal.status,
      orgName: proposal.orgName,
      adherence,
      margin,
      documental,
      technical,
      operational,
      organ,
    }),
  });

  const decisionId = Number(result[0].insertId);
  const factors: Array<{ factorKey: FactorKind; factorLabel: string; score: number; weight: number; impact: "positive" | "neutral" | "negative"; details: Record<string, unknown> }> = [
    { factorKey: "catalogo", factorLabel: "Aderência ao catálogo", score: adherence.score, weight: 25, impact: adherence.score >= 70 ? "positive" : "negative", details: adherence },
    { factorKey: "margem", factorLabel: "Viabilidade econômica", score: margin.score, weight: 20, impact: margin.score >= 70 ? "positive" : margin.score >= 50 ? "neutral" : "negative", details: margin },
    { factorKey: "documental", factorLabel: "Risco documental", score: documental.score, weight: 15, impact: documental.score >= 70 ? "positive" : "negative", details: documental },
    { factorKey: "tecnico", factorLabel: "Risco técnico", score: technical.score, weight: 20, impact: technical.score >= 70 ? "positive" : "negative", details: technical },
    { factorKey: "operacional", factorLabel: "Risco operacional", score: operational.score, weight: 10, impact: operational.score >= 70 ? "positive" : operational.score >= 50 ? "neutral" : "negative", details: operational },
    { factorKey: "historico_orgao", factorLabel: "Histórico do órgão", score: organ.score, weight: 10, impact: organ.score >= 70 ? "positive" : organ.score >= 50 ? "neutral" : "negative", details: organ },
  ];

  await db.insert(executiveDecisionFactors).values(
    factors.map((factor) => ({
      decisionId,
      factorKey: factor.factorKey,
      factorLabel: factor.factorLabel,
      score: factor.score,
      weight: factor.weight,
      impact: factor.impact,
      details: JSON.stringify(factor.details),
    })),
  );

  return { decisionId, proposal, decision, score, justification, factors };
}

export async function getDecision(decisionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const [decision] = await db.select().from(executiveDecisions).where(eq(executiveDecisions.id, decisionId)).limit(1);
  const factors = await db.select().from(executiveDecisionFactors).where(eq(executiveDecisionFactors.decisionId, decisionId));
  return { decision: decision ?? null, factors };
}

export async function listRecentDecisions(limit = 20) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  return db.select().from(executiveDecisions).orderBy(desc(executiveDecisions.createdAt)).limit(limit);
}

export async function recalculateDecision(proposalId: number) {
  return evaluateOpportunity(proposalId);
}
