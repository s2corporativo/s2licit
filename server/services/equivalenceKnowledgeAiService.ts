import { sql } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import { logger } from "../_core/logger";
import { getDb } from "../db";
import { ensureCatalogKnowledgeSchema } from "./catalogKnowledgeSchema";
import type { EquivalenceCandidate, EquivalenceReference } from "./equivalenceCompendiumService";

function asRows<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function safeLike(value?: string | null) {
  return value?.trim() ? `%${value.trim()}%` : "__NO_MATCH__";
}

export async function loadValidatedCompendiumKnowledge(reference: EquivalenceReference) {
  const db = await getDb();
  if (!db) return [];
  await ensureCatalogKnowledgeSchema();

  const activeIngredient = reference.activeIngredient?.trim() || null;
  const name = reference.name?.trim() || "";
  const firstUsefulToken = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .find((token) => token.length >= 4) ?? "__NO_MATCH__";

  const [rows] = await db.execute(sql`
    SELECT
      e.id,
      e.canonicalName,
      e.catalogType,
      e.activeIngredient,
      e.concentration,
      e.pharmaceuticalForm,
      e.presentation,
      e.manufacturer,
      e.therapeuticClass,
      e.targetSpecies,
      e.administrationRoute,
      e.regulatoryType,
      e.regulatoryNumber,
      e.catmatCode,
      e.catmasCode,
      e.ncm,
      e.aliases,
      e.technicalProfile,
      e.equivalenceCriteria,
      e.sourceSummary,
      e.confidence,
      e.validationStatus,
      (SELECT COUNT(*) FROM equivalence_compendium_members m WHERE m.entryId = e.id AND m.relationType IN ('reference','equivalent','alternative')) AS positiveMembers,
      (SELECT COUNT(*) FROM equivalence_compendium_members m WHERE m.entryId = e.id AND m.relationType = 'incompatible') AS incompatibleMembers
    FROM equivalence_compendium_entries e
    WHERE e.validationStatus IN ('human_validated','ai_review')
      AND (
        (${activeIngredient} IS NOT NULL AND e.activeIngredient LIKE ${safeLike(activeIngredient)})
        OR e.canonicalName LIKE ${`%${firstUsefulToken}%`}
        OR (${reference.regulatoryNumber ?? null} IS NOT NULL AND e.regulatoryNumber = ${reference.regulatoryNumber ?? null})
        OR (${reference.catmatCode ?? null} IS NOT NULL AND e.catmatCode = ${reference.catmatCode ?? null})
        OR (${reference.catmasCode ?? null} IS NOT NULL AND e.catmasCode = ${reference.catmasCode ?? null})
      )
    ORDER BY
      CASE e.validationStatus WHEN 'human_validated' THEN 0 ELSE 1 END,
      e.confidence DESC,
      e.updatedAt DESC
    LIMIT 25
  `);

  return asRows<any>(rows).map((row) => ({
    ...row,
    aliases: typeof row.aliases === "string" ? safeJson(row.aliases) : row.aliases,
    technicalProfile: typeof row.technicalProfile === "string" ? safeJson(row.technicalProfile) : row.technicalProfile,
    equivalenceCriteria: typeof row.equivalenceCriteria === "string" ? safeJson(row.equivalenceCriteria) : row.equivalenceCriteria,
  }));
}

function safeJson(value: string) {
  try { return JSON.parse(value); } catch { return value; }
}

export async function loadHumanEquivalencePrecedents(reference: EquivalenceReference, candidateIds: number[]) {
  const db = await getDb();
  if (!db || candidateIds.length === 0) return [];
  await ensureCatalogKnowledgeSchema();
  const candidateCsv = candidateIds.filter(Number.isInteger).join(",");
  if (!candidateCsv) return [];

  const [rows] = await db.execute(sql.raw(`
    SELECT f.id, f.referenceProductId, f.candidateProductId, f.decision, f.reason, f.scoreSnapshot, f.createdAt,
           p.name AS candidateName, p.activeIngredient, p.concentration, p.pharmaceuticalForm, p.presentation, p.manufacturer
    FROM equivalence_compendium_feedback f
    LEFT JOIN products p ON p.id = f.candidateProductId
    WHERE f.candidateProductId IN (${candidateCsv})
      AND (${reference.productId ? `f.referenceProductId = ${Number(reference.productId)}` : "1=0"})
    ORDER BY f.createdAt DESC
    LIMIT 50
  `));
  return asRows<any>(rows);
}

export async function assessCandidatesWithCompendiumKnowledge(input: {
  reference: EquivalenceReference;
  candidates: EquivalenceCandidate[];
}): Promise<{ candidates: EquivalenceCandidate[]; knowledgeCount: number; precedentCount: number; aiUsed: boolean }> {
  if (input.candidates.length === 0) return { candidates: [], knowledgeCount: 0, precedentCount: 0, aiUsed: false };

  const knowledge = await loadValidatedCompendiumKnowledge(input.reference);
  const precedents = await loadHumanEquivalencePrecedents(input.reference, input.candidates.map((candidate) => candidate.id));

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `Você é a IA especialista do Compêndio de Equivalências do S2 Licit. Você NÃO faz matching comercial superficial: valida equivalência técnica para compras públicas e catálogos multiproduto.

REGRAS OBRIGATÓRIAS:
1. Nunca invente composição, concentração, registro, fabricante, espécie, via, medida ou compatibilidade.
2. Nunca transforme produto tecnicamente incompatível em equivalente por ser mais barato.
3. Se princípio ativo/composição, concentração/unidade, forma crítica ou via exigida divergirem, a decisão é rejected.
4. Conhecimento com validationStatus=human_validated tem prioridade sobre inferência do modelo quando aplicável ao mesmo perfil técnico.
5. Feedback humano anterior é precedente, mas só deve ser aplicado ao mesmo contexto técnico.
6. Informações ausentes não equivalem a confirmação; na dúvida use needs_review.
7. Diferencie equivalência, alternativa funcional e mera similaridade. A decisão approved significa que não foi identificada divergência técnica impeditiva com os requisitos disponíveis.
8. Retorne justificativa curta, verificável e baseada nos campos fornecidos.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            reference: input.reference,
            validatedCompendiumKnowledge: knowledge,
            humanPrecedents: precedents,
            candidates: input.candidates.slice(0, 15).map((candidate) => ({
              id: candidate.id,
              name: candidate.name,
              technicalScore: candidate.technicalScore,
              deterministicStatus: candidate.status,
              breakdown: candidate.breakdown,
              activeIngredient: candidate.activeIngredient,
              concentration: candidate.concentration,
              pharmaceuticalForm: candidate.pharmaceuticalForm,
              presentation: candidate.presentation,
              manufacturer: candidate.manufacturer,
              therapeuticClass: candidate.therapeuticClass,
              targetSpecies: candidate.targetSpecies,
              administrationRoute: candidate.administrationRoute,
              regulatoryType: candidate.regulatoryType,
              regulatoryNumber: candidate.regulatoryNumber,
              catmatCode: candidate.catmatCode,
              catmasCode: candidate.catmasCode,
            })),
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "compendium_grounded_equivalence_assessment",
          strict: true,
          schema: {
            type: "object",
            properties: {
              assessments: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    productId: { type: "number" },
                    decision: { type: "string", enum: ["approved", "rejected", "needs_review"] },
                    confidence: { type: "number" },
                    justification: { type: "string" },
                    criticalDivergences: { type: "array", items: { type: "string" } },
                  },
                  required: ["productId", "decision", "confidence", "justification", "criticalDivergences"],
                  additionalProperties: false,
                },
              },
            },
            required: ["assessments"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    const parsed = JSON.parse(typeof content === "string" ? content : "{}");
    const assessments = new Map<number, any>((parsed.assessments ?? []).map((item: any) => [Number(item.productId), item]));

    const candidates = input.candidates.map((candidate) => {
      // Um bloqueio determinístico nunca pode ser elevado pela IA.
      if (candidate.status === "DIVERGENTE" || candidate.aiAssessment?.decision === "rejected") return candidate;
      const assessment = assessments.get(candidate.id);
      if (!assessment) return candidate;
      return { ...candidate, aiAssessment: assessment };
    });

    return { candidates, knowledgeCount: knowledge.length, precedentCount: precedents.length, aiUsed: true };
  } catch (error) {
    logger.warn("[EquivalenceKnowledgeAI] IA indisponível; mantendo avaliação determinística:", (error as Error).message);
    return { candidates: input.candidates, knowledgeCount: knowledge.length, precedentCount: precedents.length, aiUsed: false };
  }
}
