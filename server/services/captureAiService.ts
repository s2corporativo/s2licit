import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { activeProvider, invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import { captureAiFeedback } from "../../drizzle/captureCoreSchema";
import { normalizeText } from "../matching/productMatcher";

export interface CaptureMatchCandidate {
  id: number;
  name: string;
  ean?: string | null;
  code?: string | null;
  manufacturer?: string | null;
  presentation?: string | null;
  unit?: string | null;
  score: number;
}

export interface CaptureAiDecision {
  selectedProductId: number | null;
  confidence: number;
  compatiblePresentation: boolean;
  normalizedName?: string;
  reason: string;
}

type CaptureFeedbackDecision =
  | "correct_match"
  | "wrong_match"
  | "approve_update"
  | "reject_update"
  | "correct_normalization"
  | "false_anomaly"
  | "true_anomaly";

type CaptureAiExample = {
  decision: CaptureFeedbackDecision;
  observedName: string | null;
  expectedProductId: number | null;
  expectedNormalizedName: string | null;
};

export interface CaptureAiContext {
  supplierId: number;
  loadedAt: Date;
  learnedByNormalizedName: ReadonlyMap<string, number | null>;
  examples: readonly CaptureAiExample[];
}

const AI_MAX_CALLS_PER_MINUTE = clampInteger(
  Number(process.env.CAPTURE_AI_MAX_CALLS_PER_MINUTE || 20),
  1,
  120,
);
const AI_MEMORY_LIMIT = clampInteger(
  Number(process.env.CAPTURE_AI_MEMORY_LIMIT || 2000),
  100,
  10_000,
);
const AI_EXAMPLE_LIMIT = clampInteger(
  Number(process.env.CAPTURE_AI_EXAMPLE_LIMIT || 12),
  1,
  40,
);
const MAX_PROMPT_CANDIDATES = 5;
const MAX_FIELD_LENGTH = 512;
const MAX_REASON_LENGTH = 1000;

const identityPositiveDecisions = new Set<CaptureFeedbackDecision>([
  "correct_match",
  "approve_update",
]);
const identityNegativeDecisions = new Set<CaptureFeedbackDecision>([
  "wrong_match",
  "reject_update",
]);

let aiWindowStartedAt = Date.now();
let aiCallsInWindow = 0;

const aiDecisionSchema = z.object({
  selectedProductId: z.number().int().positive().nullable(),
  confidence: z.number().finite().min(0).max(1),
  compatiblePresentation: z.boolean(),
  normalizedName: z.string().max(MAX_FIELD_LENGTH).optional(),
  reason: z.string().min(1).max(MAX_REASON_LENGTH),
});

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(Math.trunc(value), max));
}

function resetBudgetWindowIfNeeded(now = Date.now()): void {
  if (now - aiWindowStartedAt < 60_000) return;
  aiWindowStartedAt = now;
  aiCallsInWindow = 0;
}

function takeAiBudget(): boolean {
  resetBudgetWindowIfNeeded();
  if (aiCallsInWindow >= AI_MAX_CALLS_PER_MINUTE) return false;
  aiCallsInWindow += 1;
  return true;
}

function compactText(value: string | null | undefined, maxLength = MAX_FIELD_LENGTH): string | null {
  if (!value) return null;
  const compact = value.trim().replace(/\s+/g, " ");
  return compact ? compact.slice(0, maxLength) : null;
}

function extractText(result: Awaited<ReturnType<typeof invokeLLM>>): string {
  const content = result.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n");
}

function extractJsonCandidate(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const candidates = [
    trimmed,
    trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim(),
  ];
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Continua para a próxima representação possível.
    }
  }
  return null;
}

function toAiDecision(text: string, allowedProductIds: ReadonlySet<number>): CaptureAiDecision | null {
  const parsed = aiDecisionSchema.safeParse(extractJsonCandidate(text));
  if (!parsed.success) return null;

  const selectedProductId = parsed.data.selectedProductId;
  if (selectedProductId !== null && !allowedProductIds.has(selectedProductId)) return null;

  return {
    selectedProductId,
    confidence: parsed.data.confidence,
    compatiblePresentation: parsed.data.compatiblePresentation,
    normalizedName: compactText(parsed.data.normalizedName) ?? undefined,
    reason: parsed.data.reason.trim().slice(0, MAX_REASON_LENGTH),
  };
}

function isIdentityDecision(decision: CaptureFeedbackDecision): boolean {
  return identityPositiveDecisions.has(decision) || identityNegativeDecisions.has(decision);
}

/**
 * Carrega a memória supervisionada uma única vez para o fornecedor.
 *
 * Complexidade: O(F) para construir o índice, onde F é o número de feedbacks
 * carregados. Depois disso, cada consulta de memória é O(1) sem round-trip ao
 * banco. A decisão mais recente de identidade para cada nome normalizado vence.
 */
export async function loadCaptureAiContext(
  supplierId: number,
  limit = AI_MEMORY_LIMIT,
): Promise<CaptureAiContext> {
  const db = await getDb();
  if (!db) {
    return {
      supplierId,
      loadedAt: new Date(),
      learnedByNormalizedName: new Map(),
      examples: [],
    };
  }

  const rows = await db
    .select({
      decision: captureAiFeedback.decision,
      observedName: captureAiFeedback.observedName,
      expectedProductId: captureAiFeedback.expectedProductId,
      expectedNormalizedName: captureAiFeedback.expectedNormalizedName,
    })
    .from(captureAiFeedback)
    .where(and(
      eq(captureAiFeedback.supplierId, supplierId),
      eq(captureAiFeedback.reusable, true),
    ))
    .orderBy(desc(captureAiFeedback.createdAt))
    .limit(clampInteger(limit, 1, 10_000));

  const learnedByNormalizedName = new Map<string, number | null>();
  const examples: CaptureAiExample[] = [];

  for (const row of rows) {
    const decision = row.decision as CaptureFeedbackDecision;
    const observedName = compactText(row.observedName);
    if (!observedName) continue;

    if (isIdentityDecision(decision)) {
      const normalizedName = normalizeText(observedName);
      if (normalizedName && !learnedByNormalizedName.has(normalizedName)) {
        learnedByNormalizedName.set(
          normalizedName,
          identityPositiveDecisions.has(decision) ? row.expectedProductId ?? null : null,
        );
      }
    }

    if (examples.length < AI_EXAMPLE_LIMIT && isIdentityDecision(decision)) {
      examples.push({
        decision,
        observedName,
        expectedProductId: row.expectedProductId ?? null,
        expectedNormalizedName: compactText(row.expectedNormalizedName),
      });
    }
  }

  return {
    supplierId,
    loadedAt: new Date(),
    learnedByNormalizedName,
    examples,
  };
}

/** Consulta O(1) da memória já carregada para o job. */
export function resolveLearnedCaptureMatchFromContext(
  context: CaptureAiContext,
  observedName: string,
): number | null {
  const normalizedName = normalizeText(observedName);
  if (!normalizedName) return null;
  return context.learnedByNormalizedName.get(normalizedName) ?? null;
}

/**
 * Compatibilidade para consumidores antigos. Novos fluxos devem carregar o
 * contexto uma vez por job e usar resolveLearnedCaptureMatchFromContext().
 */
export async function resolveLearnedCaptureMatch(
  supplierId: number,
  observedName: string,
): Promise<number | null> {
  const context = await loadCaptureAiContext(supplierId);
  return resolveLearnedCaptureMatchFromContext(context, observedName);
}

function buildCandidatesForPrompt(candidates: CaptureMatchCandidate[]) {
  return candidates.slice(0, MAX_PROMPT_CANDIDATES).map((candidate) => ({
    id: candidate.id,
    name: compactText(candidate.name),
    ean: compactText(candidate.ean, 32),
    code: compactText(candidate.code, 128),
    manufacturer: compactText(candidate.manufacturer, 256),
    presentation: compactText(candidate.presentation, 256),
    unit: compactText(candidate.unit, 64),
    score: Math.max(0, Math.min(Number(candidate.score) || 0, 1)),
  }));
}

/**
 * Especialista de matching para casos ambíguos.
 *
 * A IA somente sugere um candidato entre IDs fornecidos pelo backend. O retorno
 * passa por validação estrutural e nunca cria identidade de produto sozinho.
 */
export async function resolveAmbiguousProductMatch(input: {
  supplierId: number;
  observed: {
    name: string;
    ean?: string | null;
    sku?: string | null;
    unit?: string | null;
    price?: number | null;
  };
  candidates: CaptureMatchCandidate[];
  context?: CaptureAiContext;
}): Promise<CaptureAiDecision | null> {
  if (!activeProvider() || input.candidates.length === 0 || !takeAiBudget()) return null;

  const context = input.context?.supplierId === input.supplierId
    ? input.context
    : await loadCaptureAiContext(input.supplierId);
  const promptCandidates = buildCandidatesForPrompt(input.candidates);
  if (promptCandidates.length === 0) return null;

  const prompt = {
    task: "product_catalog_matching",
    rules: [
      "EAN/GTIN conflitante é bloqueio: não considere os itens equivalentes.",
      "Não confunda apresentações, quantidades ou volumes diferentes do mesmo nome.",
      "SKU do fornecedor só é forte quando já vinculado ao mesmo fornecedor.",
      "Nome semelhante isoladamente não basta para alterar o catálogo mestre.",
      "Escolha somente um selectedProductId presente na lista de candidatos.",
      "Quando houver qualquer dúvida, retorne selectedProductId=null.",
      "Nunca invente EAN, fabricante, apresentação, unidade ou código.",
    ],
    observed: {
      name: compactText(input.observed.name),
      ean: compactText(input.observed.ean, 32),
      sku: compactText(input.observed.sku, 128),
      unit: compactText(input.observed.unit, 64),
      price: Number.isFinite(input.observed.price) ? input.observed.price : null,
    },
    candidates: promptCandidates,
    supervisedExamples: context.examples,
    output: {
      selectedProductId: "number|null",
      confidence: "number 0..1",
      compatiblePresentation: "boolean",
      normalizedName: "string opcional",
      reason: "string curta",
    },
  };

  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "Você é o especialista de identidade de produtos do S2 Licit. Seja conservador, auditável e determinístico. Sua função é apenas desempatar candidatos fornecidos pelo sistema; nunca force equivalência.",
        },
        { role: "user", content: JSON.stringify(prompt) },
      ],
      responseFormat: { type: "json_object" },
      maxTokens: 700,
    });

    return toAiDecision(
      extractText(result),
      new Set(promptCandidates.map((candidate) => candidate.id)),
    );
  } catch {
    return null;
  }
}

export async function explainCaptureAnomaly(input: {
  supplierName: string;
  capturedItems: number;
  baselineItems?: number | null;
  errorItems: number;
  warnings: string[];
}): Promise<string | null> {
  if (!activeProvider() || !takeAiBudget()) return null;

  const payload = {
    supplierName: compactText(input.supplierName, 256),
    capturedItems: Math.max(0, Math.trunc(input.capturedItems)),
    baselineItems: input.baselineItems == null ? null : Math.max(0, Math.trunc(input.baselineItems)),
    errorItems: Math.max(0, Math.trunc(input.errorItems)),
    warnings: input.warnings.slice(0, 20).map((warning) => compactText(warning, 400)).filter(Boolean),
  };

  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "Você diagnostica falhas de captura de catálogo. Não invente causa. Diferencie quebra de seletor, login ou paginação de uma remoção real de produtos. Responda em até 3 frases.",
        },
        { role: "user", content: JSON.stringify(payload) },
      ],
      maxTokens: 250,
    });
    return compactText(extractText(result), 1500);
  } catch {
    return null;
  }
}

export async function recordCaptureAiFeedback(input: {
  supplierId?: number | null;
  observationId?: number | null;
  decision: CaptureFeedbackDecision;
  observedName?: string | null;
  expectedProductId?: number | null;
  expectedNormalizedName?: string | null;
  notes?: string | null;
  createdByUserId?: number | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");

  await db.insert(captureAiFeedback).values({
    supplierId: input.supplierId ?? null,
    observationId: input.observationId ?? null,
    decision: input.decision,
    observedName: compactText(input.observedName),
    expectedProductId: input.expectedProductId ?? null,
    expectedNormalizedName: compactText(input.expectedNormalizedName),
    notes: compactText(input.notes, 2000),
    createdByUserId: input.createdByUserId ?? null,
    reusable: true,
  });
}

export function captureAiBudgetStatus() {
  resetBudgetWindowIfNeeded();
  return {
    used: aiCallsInWindow,
    limit: AI_MAX_CALLS_PER_MINUTE,
    remaining: Math.max(0, AI_MAX_CALLS_PER_MINUTE - aiCallsInWindow),
    windowStartedAt: new Date(aiWindowStartedAt),
  };
}
