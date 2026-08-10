import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { ensureCatalogKnowledgeSchema } from "./catalogKnowledgeSchema";
import type { EquivalenceCandidate, EquivalenceReference } from "./equivalenceCompendiumService";

function normalize(value?: string | null) {
  return (value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function incompatibleCriticalText(a?: string | null, b?: string | null) {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return false;
  return !(left === right || left.includes(right) || right.includes(left));
}

function concentrationUnit(value?: string | null) {
  if (!value) return null;
  const text = normalize(value).replace(",", ".").replace(/μ|µ/g, "u");
  const match = text.match(/([0-9]+(?:\.[0-9]+)?)\s*([a-z%]+(?:\/[a-z%]+)?)/i);
  if (!match) return null;
  return { value: Number(match[1]), unit: match[2].replace(/\s+/g, "") };
}

function incompatibleConcentration(a?: string | null, b?: string | null) {
  const left = concentrationUnit(a);
  const right = concentrationUnit(b);
  if (!left || !right) return incompatibleCriticalText(a, b);
  if (left.unit !== right.unit) return true;
  if (!Number.isFinite(left.value) || !Number.isFinite(right.value)) return true;
  if (left.value === 0) return right.value !== 0;
  return Math.abs(left.value - right.value) / left.value > 0.05;
}

export function enforceCriticalTechnicalGuards(reference: EquivalenceReference, candidates: EquivalenceCandidate[]) {
  return candidates.map((candidate) => {
    const critical: string[] = [];
    if (incompatibleCriticalText(reference.activeIngredient, candidate.activeIngredient)) critical.push("Princípio ativo incompatível");
    if (incompatibleConcentration(reference.concentration, candidate.concentration)) critical.push("Concentração/unidade incompatível");
    if (incompatibleCriticalText(reference.pharmaceuticalForm, candidate.pharmaceuticalForm)) critical.push("Forma farmacêutica incompatível");
    if (incompatibleCriticalText(reference.administrationRoute, candidate.administrationRoute)) critical.push("Via de administração incompatível");
    if (critical.length === 0) return candidate;
    return {
      ...candidate,
      status: "DIVERGENTE" as const,
      aiAssessment: {
        decision: "rejected" as const,
        confidence: 100,
        justification: "Bloqueio determinístico por divergência em requisito técnico crítico.",
        criticalDivergences: Array.from(new Set([...(candidate.aiAssessment?.criticalDivergences ?? []), ...critical])),
      },
    };
  });
}

type MemoryRow = {
  candidateProductId: number;
  decision: "approved" | "rejected" | "needs_review";
  reason: string | null;
  createdAt: string | Date;
};

export async function applyPersistedEquivalenceMemory(input: {
  reference: EquivalenceReference;
  description?: string;
  candidates: EquivalenceCandidate[];
}) {
  const db = await getDb();
  if (!db || input.candidates.length === 0) return input.candidates;
  await ensureCatalogKnowledgeSchema();

  const ids = input.candidates
    .map((candidate) => Number(candidate.id))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) return input.candidates;

  const idCondition = sql.raw(`candidateProductId IN (${ids.join(",")})`);
  const referenceProductId = input.reference.productId && Number.isInteger(input.reference.productId)
    ? Number(input.reference.productId)
    : null;
  const description = input.description?.trim() || null;
  const contextCondition = referenceProductId
    ? sql`referenceProductId = ${referenceProductId}`
    : description
      ? sql`LOWER(TRIM(queryText)) = LOWER(TRIM(${description}))`
      : sql`1 = 0`;

  const [rows] = await db.execute(sql`
    SELECT candidateProductId, decision, reason, createdAt
    FROM equivalence_compendium_feedback
    WHERE ${idCondition} AND ${contextCondition}
    ORDER BY createdAt DESC
  `);

  const latest = new Map<number, MemoryRow>();
  for (const row of (Array.isArray(rows) ? rows : []) as MemoryRow[]) {
    const id = Number(row.candidateProductId);
    if (!latest.has(id)) latest.set(id, row);
  }

  return input.candidates.map((candidate) => {
    const memory = latest.get(candidate.id);
    if (!memory) return candidate;
    if (memory.decision === "rejected") {
      return {
        ...candidate,
        status: "DIVERGENTE" as const,
        aiAssessment: {
          decision: "rejected" as const,
          confidence: 100,
          justification: memory.reason || "Rejeição humana persistida no Compêndio.",
          criticalDivergences: candidate.aiAssessment?.criticalDivergences ?? [],
        },
      };
    }
    if (memory.decision === "approved" && candidate.status !== "DIVERGENTE") {
      return {
        ...candidate,
        status: "APROVADO" as const,
        aiAssessment: {
          decision: "approved" as const,
          confidence: 100,
          justification: memory.reason || "Equivalência confirmada por decisão humana anterior.",
          criticalDivergences: [],
        },
      };
    }
    return {
      ...candidate,
      aiAssessment: {
        decision: "needs_review" as const,
        confidence: 100,
        justification: memory.reason || "Caso marcado anteriormente para revisão humana.",
        criticalDivergences: candidate.aiAssessment?.criticalDivergences ?? [],
      },
    };
  });
}
