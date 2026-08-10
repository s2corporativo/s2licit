import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { products } from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";
import { logger } from "../_core/logger";
import { getDb } from "../db";
import { getProductSupplierPrices } from "../db/supplierPrices";
import { ensureCatalogKnowledgeSchema } from "./catalogKnowledgeSchema";

export type CompendiumDecision = "approved" | "rejected" | "needs_review";

export type EquivalenceReference = {
  productId?: number;
  name: string;
  catalogType?: string | null;
  activeIngredient?: string | null;
  concentration?: string | null;
  pharmaceuticalForm?: string | null;
  presentation?: string | null;
  manufacturer?: string | null;
  therapeuticClass?: string | null;
  targetSpecies?: string | null;
  administrationRoute?: string | null;
  regulatoryType?: string | null;
  regulatoryNumber?: string | null;
  catmatCode?: string | null;
  catmasCode?: string | null;
  ncm?: string | null;
  rawDescription?: string | null;
};

export type EquivalenceCandidate = {
  id: number;
  name: string;
  activeIngredient: string | null;
  concentration: string | null;
  pharmaceuticalForm: string | null;
  presentation: string | null;
  manufacturer: string | null;
  therapeuticClass: string | null;
  targetSpecies: string | null;
  administrationRoute: string | null;
  regulatoryType: string | null;
  regulatoryNumber: string | null;
  catmatCode: string | null;
  catmasCode: string | null;
  ncm: string | null;
  technicalScore: number;
  status: "APROVADO" | "REVISAO" | "DIVERGENTE";
  breakdown: Record<string, { score: number; ref?: string | null; candidate?: string | null; critical?: boolean }>;
  bestOffer: any | null;
  offerCount: number;
  aiAssessment?: {
    decision: CompendiumDecision;
    confidence: number;
    justification: string;
    criticalDivergences: string[];
  };
};

function asRows<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function normalize(value?: string | null): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function comparableText(ref?: string | null, candidate?: string | null): number {
  const a = normalize(ref);
  const b = normalize(candidate);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.82;
  const aTokens = new Set(a.split(/[^a-z0-9%/.-]+/).filter(Boolean));
  const bTokens = new Set(b.split(/[^a-z0-9%/.-]+/).filter(Boolean));
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  return union ? intersection / union : 0;
}

function normalizeUnit(unit: string) {
  return unit.toLowerCase().replace(/μ|µ/g, "u").replace(/\s+/g, "");
}

function parseConcentration(value?: string | null): { amount: number; unit: string } | null {
  if (!value) return null;
  const text = normalize(value).replace(",", ".");
  const match = text.match(/([0-9]+(?:\.[0-9]+)?)\s*([a-z%µμ]+(?:\/[a-z%µμ]+)?)/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  return { amount, unit: normalizeUnit(match[2]) };
}

function concentrationScore(ref?: string | null, candidate?: string | null) {
  const a = parseConcentration(ref);
  const b = parseConcentration(candidate);
  if (!a || !b) return comparableText(ref, candidate);
  if (a.unit !== b.unit) return -1;
  if (a.amount === 0) return b.amount === 0 ? 1 : 0;
  const delta = Math.abs(a.amount - b.amount) / a.amount;
  if (delta <= 0.01) return 1;
  if (delta <= 0.03) return 0.8;
  if (delta <= 0.05) return 0.55;
  return -1;
}

function effectiveOfferPrice(offer: any): number | null {
  const regular = offer?.price != null ? Number(offer.price) : null;
  const promo = offer?.promoPrice != null ? Number(offer.promoPrice) : null;
  if (promo != null && promo > 0 && (regular == null || promo < regular)) return promo;
  return regular != null && regular > 0 ? regular : null;
}

function bestOffer(offers: any[]) {
  return offers
    .map((offer) => ({ ...offer, effectivePrice: effectiveOfferPrice(offer) }))
    .filter((offer) => offer.effectivePrice != null)
    .sort((a, b) => a.effectivePrice - b.effectivePrice)[0] ?? null;
}

async function referenceFromProduct(productId: number): Promise<EquivalenceReference | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!row) return null;
  return {
    productId: row.id,
    name: row.name,
    catalogType: row.tipoCatalogo,
    activeIngredient: row.activeIngredient,
    concentration: row.concentration,
    pharmaceuticalForm: row.pharmaceuticalForm,
    presentation: row.presentation,
    manufacturer: row.manufacturer ?? row.laboratorio,
    therapeuticClass: row.classeTerapeutica,
    targetSpecies: row.especieAnimal,
    administrationRoute: row.viaAdministracao,
    regulatoryType: row.registroRegulatorio,
    regulatoryNumber: row.mapa,
    catmatCode: row.catmatCode,
    catmasCode: row.catmasCode,
    ncm: row.ncm,
    rawDescription: row.description ?? row.informacaoTecnica ?? row.fichaTecnica,
  };
}

async function extractReferenceFromText(description: string): Promise<EquivalenceReference> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `Você é o motor técnico do Compêndio de Equivalências do S2 Licit. Extraia requisitos de identidade e equivalência de qualquer produto (medicamento veterinário/humano, insumo, material, equipamento ou produto comercial). Nunca invente especificações. Preserve unidade, concentração, apresentação, registro e códigos oficiais exatamente quando existirem. Quando um atributo não estiver explícito, retorne null.`,
      },
      {
        role: "user",
        content: `Descrição a estruturar:\n${description}\n\nRetorne JSON com: name, catalogType, activeIngredient, concentration, pharmaceuticalForm, presentation, manufacturer, therapeuticClass, targetSpecies, administrationRoute, regulatoryType, regulatoryNumber, catmatCode, catmasCode, ncm.`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "equivalence_reference",
        strict: true,
        schema: {
          type: "object",
          properties: {
            name: { type: ["string", "null"] },
            catalogType: { type: ["string", "null"] },
            activeIngredient: { type: ["string", "null"] },
            concentration: { type: ["string", "null"] },
            pharmaceuticalForm: { type: ["string", "null"] },
            presentation: { type: ["string", "null"] },
            manufacturer: { type: ["string", "null"] },
            therapeuticClass: { type: ["string", "null"] },
            targetSpecies: { type: ["string", "null"] },
            administrationRoute: { type: ["string", "null"] },
            regulatoryType: { type: ["string", "null"] },
            regulatoryNumber: { type: ["string", "null"] },
            catmatCode: { type: ["string", "null"] },
            catmasCode: { type: ["string", "null"] },
            ncm: { type: ["string", "null"] }
          },
          required: ["name","catalogType","activeIngredient","concentration","pharmaceuticalForm","presentation","manufacturer","therapeuticClass","targetSpecies","administrationRoute","regulatoryType","regulatoryNumber","catmatCode","catmasCode","ncm"],
          additionalProperties: false
        }
      }
    }
  });
  const content = response.choices[0]?.message?.content;
  const parsed = JSON.parse(typeof content === "string" ? content : "{}");
  return { ...parsed, name: parsed.name || description.slice(0, 180), rawDescription: description };
}

function scoreCandidate(reference: EquivalenceReference, candidate: any) {
  const breakdown: EquivalenceCandidate["breakdown"] = {};
  let earned = 0;
  let possible = 0;
  let criticalDivergence = false;

  const add = (key: string, weight: number, score: number, ref?: string | null, cand?: string | null, critical = false) => {
    if (!ref || !cand) return;
    possible += weight;
    const safeScore = Math.max(0, score);
    earned += weight * safeScore;
    if (score < 0 && critical) criticalDivergence = true;
    breakdown[key] = { score: Math.round(safeScore * 100), ref, candidate: cand, critical };
  };

  add("activeIngredient", 35, comparableText(reference.activeIngredient, candidate.activeIngredient), reference.activeIngredient, candidate.activeIngredient, true);
  add("concentration", 25, concentrationScore(reference.concentration, candidate.concentration), reference.concentration, candidate.concentration, true);
  add("pharmaceuticalForm", 12, comparableText(reference.pharmaceuticalForm || reference.presentation, candidate.pharmaceuticalForm || candidate.presentation), reference.pharmaceuticalForm || reference.presentation, candidate.pharmaceuticalForm || candidate.presentation, true);
  add("administrationRoute", 8, comparableText(reference.administrationRoute, candidate.viaAdministracao), reference.administrationRoute, candidate.viaAdministracao, true);
  add("targetSpecies", 5, comparableText(reference.targetSpecies, candidate.especieAnimal), reference.targetSpecies, candidate.especieAnimal, false);
  add("regulatoryNumber", 7, comparableText(reference.regulatoryNumber, candidate.mapa), reference.regulatoryNumber, candidate.mapa, false);
  add("catmatCode", 4, comparableText(reference.catmatCode, candidate.catmatCode), reference.catmatCode, candidate.catmatCode, false);
  add("catmasCode", 4, comparableText(reference.catmasCode, candidate.catmasCode), reference.catmasCode, candidate.catmasCode, false);

  if (possible === 0) {
    add("name", 100, comparableText(reference.name, candidate.name), reference.name, candidate.name, false);
  }

  const technicalScore = possible ? Math.round((earned / possible) * 100) : 0;
  const status = criticalDivergence ? "DIVERGENTE" : technicalScore >= 80 ? "APROVADO" : technicalScore >= 55 ? "REVISAO" : "DIVERGENTE";
  return { technicalScore, status, breakdown } as const;
}

async function feedbackMemory(reference: EquivalenceReference) {
  const db = await getDb();
  if (!db) return [];
  await ensureCatalogKnowledgeSchema();
  const [rows] = await db.execute(sql`
    SELECT f.decision, f.reason, f.candidateProductId, f.scoreSnapshot, f.createdAt,
           p.name AS candidateName, p.activeIngredient, p.concentration, p.presentation, p.manufacturer
    FROM equivalence_compendium_feedback f
    LEFT JOIN products p ON p.id = f.candidateProductId
    WHERE (${reference.productId ?? null} IS NULL OR f.referenceProductId = ${reference.productId ?? null})
       OR (${reference.activeIngredient ?? null} IS NOT NULL AND p.activeIngredient LIKE ${`%${reference.activeIngredient ?? ""}%`})
    ORDER BY f.createdAt DESC
    LIMIT 60
  `);
  return asRows<any>(rows);
}

async function loadCandidatePool(reference: EquivalenceReference, limit = 120) {
  const db = await getDb();
  if (!db) return [];
  const term = reference.activeIngredient?.trim() || reference.name.trim();
  const wildcard = `%${term}%`;
  return db.select().from(products).where(and(
    eq(products.isActive, "yes"),
    reference.productId ? sql`${products.id} <> ${reference.productId}` : sql`1 = 1`,
    or(
      like(products.activeIngredient, wildcard),
      like(products.name, wildcard),
      reference.catmatCode ? eq(products.catmatCode, reference.catmatCode) : sql`0 = 1`,
      reference.catmasCode ? eq(products.catmasCode, reference.catmasCode) : sql`0 = 1`,
      reference.regulatoryNumber ? eq(products.mapa, reference.regulatoryNumber) : sql`0 = 1`,
    ),
  )).orderBy(asc(products.name)).limit(Math.min(Math.max(limit, 20), 300));
}

async function aiRerank(reference: EquivalenceReference, candidates: EquivalenceCandidate[], memory: any[]) {
  if (!candidates.length) return candidates;
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `Você é a IA especialista do Compêndio de Equivalências do S2 Licit. Sua função é validar equivalência técnica, não recomendar por semelhança superficial. Regras: (1) divergência de princípio ativo, concentração/unidade, forma crítica ou via de administração deve impedir aprovação quando esses requisitos forem exigidos; (2) nunca invente registro, espécie, composição ou compatibilidade; (3) use o histórico humano fornecido como memória de precedentes, mas não replique decisão humana se o caso técnico for diferente; (4) preço nunca transforma produto tecnicamente incompatível em equivalente; (5) quando houver incerteza, marque needs_review.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            reference,
            candidates: candidates.slice(0, 10).map((candidate) => ({
              id: candidate.id,
              name: candidate.name,
              technicalScore: candidate.technicalScore,
              status: candidate.status,
              breakdown: candidate.breakdown,
              activeIngredient: candidate.activeIngredient,
              concentration: candidate.concentration,
              pharmaceuticalForm: candidate.pharmaceuticalForm,
              presentation: candidate.presentation,
              manufacturer: candidate.manufacturer,
              targetSpecies: candidate.targetSpecies,
              administrationRoute: candidate.administrationRoute,
              regulatoryNumber: candidate.regulatoryNumber,
            })),
            priorHumanFeedback: memory.slice(0, 20),
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "equivalence_assessment",
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
                    criticalDivergences: { type: "array", items: { type: "string" } }
                  },
                  required: ["productId", "decision", "confidence", "justification", "criticalDivergences"],
                  additionalProperties: false
                }
              }
            },
            required: ["assessments"],
            additionalProperties: false
          }
        }
      }
    });
    const content = response.choices[0]?.message?.content;
    const parsed = JSON.parse(typeof content === "string" ? content : "{}");
    const assessments = new Map<number, any>((parsed.assessments ?? []).map((item: any) => [Number(item.productId), item]));
    return candidates.map((candidate) => {
      const assessment = assessments.get(candidate.id);
      return assessment ? { ...candidate, aiAssessment: assessment } : candidate;
    }).sort((a, b) => {
      const rank = (candidate: EquivalenceCandidate) => candidate.aiAssessment?.decision === "approved" ? 0 : candidate.aiAssessment?.decision === "needs_review" ? 1 : 2;
      const diff = rank(a) - rank(b);
      if (diff) return diff;
      if (b.technicalScore !== a.technicalScore) return b.technicalScore - a.technicalScore;
      const aPrice = a.bestOffer?.effectivePrice ?? Number.POSITIVE_INFINITY;
      const bPrice = b.bestOffer?.effectivePrice ?? Number.POSITIVE_INFINITY;
      return aPrice - bPrice;
    });
  } catch (error) {
    logger.warn("[EquivalenceCompendium] IA indisponível; mantendo ranking determinístico:", (error as Error).message);
    return candidates;
  }
}

export async function analyzeEquivalences(input: { productId?: number; description?: string; limit?: number; useAI?: boolean }) {
  const reference = input.productId
    ? await referenceFromProduct(input.productId)
    : input.description?.trim()
      ? await extractReferenceFromText(input.description.trim())
      : null;
  if (!reference) throw new Error("Informe um produto ou descrição de referência.");

  const pool = await loadCandidatePool(reference, 160);
  const scored = await Promise.all(pool.map(async (candidate) => {
    const score = scoreCandidate(reference, candidate);
    const offers = await getProductSupplierPrices(candidate.id);
    const offer = bestOffer(offers);
    return {
      id: candidate.id,
      name: candidate.name,
      activeIngredient: candidate.activeIngredient,
      concentration: candidate.concentration,
      pharmaceuticalForm: candidate.pharmaceuticalForm,
      presentation: candidate.presentation,
      manufacturer: candidate.manufacturer ?? candidate.laboratorio,
      therapeuticClass: candidate.classeTerapeutica,
      targetSpecies: candidate.especieAnimal,
      administrationRoute: candidate.viaAdministracao,
      regulatoryType: candidate.registroRegulatorio,
      regulatoryNumber: candidate.mapa,
      catmatCode: candidate.catmatCode,
      catmasCode: candidate.catmasCode,
      ncm: candidate.ncm,
      technicalScore: score.technicalScore,
      status: score.status,
      breakdown: score.breakdown,
      bestOffer: offer,
      offerCount: offers.length,
    } satisfies EquivalenceCandidate;
  }));

  scored.sort((a, b) => {
    const statusRank = { APROVADO: 0, REVISAO: 1, DIVERGENTE: 2 } as const;
    const diff = statusRank[a.status] - statusRank[b.status];
    if (diff) return diff;
    if (b.technicalScore !== a.technicalScore) return b.technicalScore - a.technicalScore;
    const aPrice = a.bestOffer?.effectivePrice ?? Number.POSITIVE_INFINITY;
    const bPrice = b.bestOffer?.effectivePrice ?? Number.POSITIVE_INFINITY;
    return aPrice - bPrice;
  });

  const top = scored.slice(0, Math.min(Math.max(input.limit ?? 20, 1), 50));
  const memory = await feedbackMemory(reference);
  const candidates = input.useAI === false ? top : await aiRerank(reference, top, memory);
  return { reference, candidates, feedbackMemoryCount: memory.length, engine: input.useAI === false ? "deterministic" : "hybrid_ai_memory" };
}

export async function listCompendium(input: { search?: string; status?: string; limit?: number; offset?: number }) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  await ensureCatalogKnowledgeSchema();
  const search = input.search?.trim() || null;
  const status = input.status?.trim() || null;
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);
  const [rows] = await db.execute(sql`
    SELECT e.*,
      (SELECT COUNT(*) FROM equivalence_compendium_members m WHERE m.entryId = e.id) AS memberCount,
      (SELECT COUNT(*) FROM equivalence_compendium_feedback f WHERE f.entryId = e.id) AS feedbackCount
    FROM equivalence_compendium_entries e
    WHERE (${search} IS NULL OR e.canonicalName LIKE ${search ? `%${search}%` : "%"} OR e.activeIngredient LIKE ${search ? `%${search}%` : "%"})
      AND (${status} IS NULL OR e.validationStatus = ${status})
    ORDER BY e.updatedAt DESC, e.canonicalName ASC
    LIMIT ${limit} OFFSET ${offset}
  `);
  const [countRows] = await db.execute(sql`
    SELECT COUNT(*) AS total
    FROM equivalence_compendium_entries e
    WHERE (${search} IS NULL OR e.canonicalName LIKE ${search ? `%${search}%` : "%"} OR e.activeIngredient LIKE ${search ? `%${search}%` : "%"})
      AND (${status} IS NULL OR e.validationStatus = ${status})
  `);
  return { items: asRows<any>(rows), total: Number(asRows<any>(countRows)[0]?.total ?? 0) };
}

export async function getCompendiumEntry(entryId: number) {
  const db = await getDb();
  if (!db) return null;
  await ensureCatalogKnowledgeSchema();
  const [entryRows] = await db.execute(sql`SELECT * FROM equivalence_compendium_entries WHERE id = ${entryId} LIMIT 1`);
  const entry = asRows<any>(entryRows)[0];
  if (!entry) return null;
  const [memberRows] = await db.execute(sql`
    SELECT m.*, p.name, p.activeIngredient, p.concentration, p.presentation, p.manufacturer, p.mapa, p.catmatCode, p.catmasCode
    FROM equivalence_compendium_members m
    JOIN products p ON p.id = m.productId
    WHERE m.entryId = ${entryId}
    ORDER BY m.relationType, m.technicalScore DESC, p.name
  `);
  const members = await Promise.all(asRows<any>(memberRows).map(async (member) => {
    const offers = await getProductSupplierPrices(Number(member.productId));
    return { ...member, bestOffer: bestOffer(offers), offerCount: offers.length };
  }));
  const [feedbackRows] = await db.execute(sql`
    SELECT f.*, p.name AS candidateName
    FROM equivalence_compendium_feedback f
    LEFT JOIN products p ON p.id = f.candidateProductId
    WHERE f.entryId = ${entryId}
    ORDER BY f.createdAt DESC LIMIT 100
  `);
  return { entry, members, feedback: asRows<any>(feedbackRows) };
}

export async function bootstrapCompendiumFromCatalog(limit = 500) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  await ensureCatalogKnowledgeSchema();
  const [groups] = await db.execute(sql`
    SELECT activeIngredient, concentration, pharmaceuticalForm, MIN(name) AS canonicalName, COUNT(*) AS productCount
    FROM products
    WHERE isActive = 'yes' AND activeIngredient IS NOT NULL AND activeIngredient <> ''
    GROUP BY activeIngredient, concentration, pharmaceuticalForm
    HAVING COUNT(*) >= 2
    ORDER BY COUNT(*) DESC
    LIMIT ${Math.min(Math.max(limit, 1), 2000)}
  `);
  let created = 0;
  let linked = 0;
  for (const group of asRows<any>(groups)) {
    const [existingRows] = await db.execute(sql`
      SELECT id FROM equivalence_compendium_entries
      WHERE activeIngredient = ${group.activeIngredient}
        AND (concentration <=> ${group.concentration})
        AND (pharmaceuticalForm <=> ${group.pharmaceuticalForm})
      LIMIT 1
    `);
    let entryId = Number(asRows<any>(existingRows)[0]?.id ?? 0);
    if (!entryId) {
      const [insertResult] = await db.execute(sql`
        INSERT INTO equivalence_compendium_entries
          (canonicalName, catalogType, activeIngredient, concentration, pharmaceuticalForm, confidence, validationStatus, sourceSummary)
        VALUES
          (${group.canonicalName}, 'medicamento', ${group.activeIngredient}, ${group.concentration}, ${group.pharmaceuticalForm}, 70, 'ai_review', 'Agrupamento inicial gerado deterministicamente a partir do catálogo interno')
      `);
      entryId = Number((insertResult as any)?.insertId ?? 0);
      if (entryId) created++;
    }
    if (!entryId) continue;
    const [productRows] = await db.execute(sql`
      SELECT id FROM products
      WHERE isActive = 'yes'
        AND activeIngredient = ${group.activeIngredient}
        AND (concentration <=> ${group.concentration})
        AND (pharmaceuticalForm <=> ${group.pharmaceuticalForm})
    `);
    for (const row of asRows<any>(productRows)) {
      await db.execute(sql`
        INSERT INTO equivalence_compendium_members (entryId, productId, relationType, technicalScore, evidence)
        VALUES (${entryId}, ${Number(row.id)}, 'equivalent', 100, ${JSON.stringify({ source: "bootstrap_exact_group" })})
        ON DUPLICATE KEY UPDATE technicalScore = GREATEST(COALESCE(technicalScore,0), 100)
      `);
      linked++;
    }
  }
  return { groupsAnalyzed: asRows<any>(groups).length, entriesCreated: created, membersLinked: linked };
}

export async function recordEquivalenceFeedback(input: {
  queryText?: string;
  referenceProductId?: number;
  candidateProductId: number;
  entryId?: number;
  decision: CompendiumDecision;
  reason?: string;
  scoreSnapshot?: unknown;
  userId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  await ensureCatalogKnowledgeSchema();
  await db.execute(sql`
    INSERT INTO equivalence_compendium_feedback
      (queryText, referenceProductId, candidateProductId, entryId, decision, reason, scoreSnapshot, createdByUserId)
    VALUES
      (${input.queryText ?? null}, ${input.referenceProductId ?? null}, ${input.candidateProductId}, ${input.entryId ?? null}, ${input.decision}, ${input.reason ?? null}, ${JSON.stringify(input.scoreSnapshot ?? {})}, ${input.userId ?? null})
  `);
  if (input.entryId) {
    const relation = input.decision === "approved" ? "equivalent" : input.decision === "rejected" ? "incompatible" : "similar";
    await db.execute(sql`
      INSERT INTO equivalence_compendium_members (entryId, productId, relationType, evidence)
      VALUES (${input.entryId}, ${input.candidateProductId}, ${relation}, ${JSON.stringify({ source: "human_feedback", reason: input.reason ?? null })})
      ON DUPLICATE KEY UPDATE relationType = VALUES(relationType), evidence = VALUES(evidence), updatedAt = CURRENT_TIMESTAMP
    `);
  }
  return { saved: true };
}

export async function compendiumStats() {
  const db = await getDb();
  if (!db) return { entries: 0, validatedEntries: 0, members: 0, approvedFeedback: 0, rejectedFeedback: 0 };
  await ensureCatalogKnowledgeSchema();
  const [rows] = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM equivalence_compendium_entries) AS entries,
      (SELECT COUNT(*) FROM equivalence_compendium_entries WHERE validationStatus = 'human_validated') AS validatedEntries,
      (SELECT COUNT(*) FROM equivalence_compendium_members) AS members,
      (SELECT COUNT(*) FROM equivalence_compendium_feedback WHERE decision = 'approved') AS approvedFeedback,
      (SELECT COUNT(*) FROM equivalence_compendium_feedback WHERE decision = 'rejected') AS rejectedFeedback
  `);
  const row = asRows<any>(rows)[0] ?? {};
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value ?? 0)]));
}

export async function validateCompendiumEntry(entryId: number, userId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  await ensureCatalogKnowledgeSchema();
  await db.execute(sql`
    UPDATE equivalence_compendium_entries
    SET validationStatus = 'human_validated', validatedByUserId = ${userId ?? null}, validatedAt = NOW()
    WHERE id = ${entryId}
  `);
  return { validated: true };
}
