import { and, desc, eq } from "drizzle-orm";
import { activeProvider, invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import { captureAiFeedback } from "../../drizzle/captureCoreSchema";

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

function extractText(result: Awaited<ReturnType<typeof invokeLLM>>): string {
  const content = result.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => (part.type === "text" ? part.text : "")).join("\n");
  }
  return "";
}

function parseJsonObject<T>(text: string): T | null {
  const trimmed = text.trim();
  const candidates = [
    trimmed,
    trimmed.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim(),
  ];
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(trimmed.slice(first, last + 1));
  for (const candidate of candidates) {
    try { return JSON.parse(candidate) as T; } catch { /* tenta próximo */ }
  }
  return null;
}

async function loadExamples(supplierId: number, limit = 12) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      decision: captureAiFeedback.decision,
      observedName: captureAiFeedback.observedName,
      expectedProductId: captureAiFeedback.expectedProductId,
      expectedNormalizedName: captureAiFeedback.expectedNormalizedName,
      notes: captureAiFeedback.notes,
    })
    .from(captureAiFeedback)
    .where(and(eq(captureAiFeedback.supplierId, supplierId), eq(captureAiFeedback.reusable, true)))
    .orderBy(desc(captureAiFeedback.createdAt))
    .limit(limit);
}

/**
 * Especialista de matching para casos realmente ambíguos.
 *
 * A IA nunca cria identidade de produto sozinha e nunca pode superar conflito
 * explícito de EAN/apresentação. A memória vem de feedback humano salvo no
 * próprio banco, funcionando como treinamento few-shot incremental local.
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
}): Promise<CaptureAiDecision | null> {
  if (!activeProvider() || input.candidates.length === 0) return null;

  const examples = await loadExamples(input.supplierId);
  const prompt = {
    task: "product_catalog_matching",
    rules: [
      "EAN/GTIN conflitante é bloqueio: não considere os itens equivalentes.",
      "Não confunda apresentações/quantidades/volumes diferentes do mesmo nome.",
      "SKU do fornecedor é forte somente quando já vinculado ao mesmo fornecedor.",
      "Nome semelhante isoladamente não basta para alterar o catálogo mestre.",
      "Quando houver dúvida, retorne selectedProductId=null.",
      "Nunca invente EAN, fabricante, apresentação, unidade ou código.",
    ],
    observed: input.observed,
    candidates: input.candidates,
    supervisedExamples: examples,
    output: {
      selectedProductId: "number|null",
      confidence: "0..1",
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
            "Você é o especialista de identidade de produtos do S2 Licit. Trabalhe de forma conservadora, auditável e determinística. Sua função é desempatar matching; nunca force equivalência.",
        },
        { role: "user", content: JSON.stringify(prompt) },
      ],
      responseFormat: { type: "json_object" },
      maxTokens: 700,
    });
    const parsed = parseJsonObject<CaptureAiDecision>(extractText(result));
    if (!parsed) return null;
    const candidateIds = new Set(input.candidates.map((candidate) => candidate.id));
    if (parsed.selectedProductId != null && !candidateIds.has(parsed.selectedProductId)) return null;
    return {
      selectedProductId: parsed.selectedProductId ?? null,
      confidence: Math.max(0, Math.min(Number(parsed.confidence) || 0, 1)),
      compatiblePresentation: Boolean(parsed.compatiblePresentation),
      normalizedName: parsed.normalizedName?.trim() || undefined,
      reason: String(parsed.reason || "Decisão da IA sem justificativa").slice(0, 1000),
    };
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
  if (!activeProvider()) return null;
  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "Você diagnostica falhas de captura de catálogo. Não invente causa. Diferencie quebra de seletor/login/paginação de remoção real de produtos. Responda em até 3 frases.",
        },
        { role: "user", content: JSON.stringify(input) },
      ],
      maxTokens: 250,
    });
    return extractText(result).trim().slice(0, 1500) || null;
  } catch {
    return null;
  }
}

export async function recordCaptureAiFeedback(input: {
  supplierId?: number | null;
  observationId?: number | null;
  decision:
    | "correct_match"
    | "wrong_match"
    | "approve_update"
    | "reject_update"
    | "correct_normalization"
    | "false_anomaly"
    | "true_anomaly";
  observedName?: string | null;
  expectedProductId?: number | null;
  expectedNormalizedName?: string | null;
  notes?: string | null;
  createdByUserId?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  await db.insert(captureAiFeedback).values({
    supplierId: input.supplierId ?? null,
    observationId: input.observationId ?? null,
    decision: input.decision,
    observedName: input.observedName ?? null,
    expectedProductId: input.expectedProductId ?? null,
    expectedNormalizedName: input.expectedNormalizedName ?? null,
    notes: input.notes ?? null,
    createdByUserId: input.createdByUserId ?? null,
    reusable: true,
  });
}
