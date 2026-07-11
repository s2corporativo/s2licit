import { and, desc, eq, inArray } from "drizzle-orm";
import {
  duplicateDetectionResults,
  duplicateDetectionRuns,
  duplicateMergeHistory,
  products,
} from "../../drizzle/schema";
import { getDb } from "../db";

export type DuplicateClassification = "confirmed" | "probable" | "review" | "distinct";

export type StructuredTokens = {
  normalizedName: string;
  normalizedManufacturer: string;
  normalizedBrand: string;
  normalizedPresentation: string;
  normalizedUnit: string;
  normalizedConcentration: string;
  ean: string;
  sku: string;
};

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeProductText(value: string | null | undefined) {
  return stripAccents(String(value ?? ""))
    .toUpperCase()
    .replace(/\b(CX|CAIXA)\b/g, "CAIXA")
    .replace(/\bFR\b/g, "FRASCO")
    .replace(/\bCPR?\b/g, "COMPRIMIDO")
    .replace(/[^A-Z0-9\s.,/%-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractStructuredTokens(product: Record<string, unknown>): StructuredTokens {
  return {
    normalizedName: normalizeProductText(String(product.name ?? "")),
    normalizedManufacturer: normalizeProductText(String(product.manufacturer ?? "")),
    normalizedBrand: normalizeProductText(String(product.brand ?? "")),
    normalizedPresentation: normalizeProductText(String(product.presentation ?? "")),
    normalizedUnit: normalizeProductText(String(product.unit ?? "")),
    normalizedConcentration: normalizeProductText(String(product.concentration ?? "")),
    ean: normalizeProductText(String(product.ean ?? product.gtin ?? product.barcode ?? "")),
    sku: normalizeProductText(String(product.supplierCode ?? product.sku ?? product.code ?? "")),
  };
}

function tokenSimilarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const aTokens = new Set(a.split(" ").filter(Boolean));
  const bTokens = new Set(b.split(" ").filter(Boolean));
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

export function computeDuplicateScore(primary: StructuredTokens, secondary: StructuredTokens) {
  if (primary.ean && secondary.ean && primary.ean === secondary.ean) return 100;
  if (primary.sku && secondary.sku && primary.sku === secondary.sku) return 95;

  const nameScore = tokenSimilarity(primary.normalizedName, secondary.normalizedName) * 30;
  const manufacturerScore = tokenSimilarity(primary.normalizedManufacturer, secondary.normalizedManufacturer) * 15;
  const brandScore = tokenSimilarity(primary.normalizedBrand, secondary.normalizedBrand) * 10;
  const concentrationScore = tokenSimilarity(primary.normalizedConcentration, secondary.normalizedConcentration) * 20;
  const presentationScore = tokenSimilarity(primary.normalizedPresentation, secondary.normalizedPresentation) * 15;
  const unitScore = tokenSimilarity(primary.normalizedUnit, secondary.normalizedUnit) * 5;

  return Math.round(nameScore + manufacturerScore + brandScore + concentrationScore + presentationScore + unitScore);
}

export function classifyDuplicate(score: number): DuplicateClassification {
  if (score >= 95) return "confirmed";
  if (score >= 80) return "probable";
  if (score >= 65) return "review";
  return "distinct";
}

function buildRationale(primary: StructuredTokens, secondary: StructuredTokens, score: number) {
  const reasons: string[] = [];
  if (primary.ean && secondary.ean && primary.ean === secondary.ean) reasons.push("EAN idêntico");
  if (primary.sku && secondary.sku && primary.sku === secondary.sku) reasons.push("SKU equivalente");
  if (tokenSimilarity(primary.normalizedName, secondary.normalizedName) >= 0.7) reasons.push("nome comercial muito semelhante");
  if (tokenSimilarity(primary.normalizedConcentration, secondary.normalizedConcentration) >= 0.7) reasons.push("concentração compatível");
  if (tokenSimilarity(primary.normalizedPresentation, secondary.normalizedPresentation) >= 0.7) reasons.push("apresentação compatível");
  if (tokenSimilarity(primary.normalizedManufacturer, secondary.normalizedManufacturer) >= 0.7) reasons.push("fabricante compatível");
  return `${reasons.join(", ") || "sinais parciais de similaridade"} · score ${score}/100`;
}

export async function runFullDuplicateDetection(params?: { triggeredByUserId?: number | null; limit?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const run = await db.insert(duplicateDetectionRuns).values({
    triggeredByUserId: params?.triggeredByUserId ?? null,
    status: "running",
    scope: { limit: params?.limit ?? 400 },
  });

  const runId = Number(run[0].insertId);
  const allProducts = await db
    .select()
    .from(products)
    .where(eq(products.isActive, "yes"))
    .limit(params?.limit ?? 400);

  const resultsToInsert: Array<typeof duplicateDetectionResults.$inferInsert> = [];

  for (let i = 0; i < allProducts.length; i += 1) {
    for (let j = i + 1; j < allProducts.length; j += 1) {
      const primary = allProducts[i];
      const secondary = allProducts[j];
      const primaryTokens = extractStructuredTokens(primary);
      const secondaryTokens = extractStructuredTokens(secondary);
      const score = computeDuplicateScore(primaryTokens, secondaryTokens);
      const classification = classifyDuplicate(score);

      if (classification === "distinct") continue;

      resultsToInsert.push({
        runId,
        primaryProductId: primary.id,
        secondaryProductId: secondary.id,
        score: score.toFixed(2),
        classification,
        rationale: buildRationale(primaryTokens, secondaryTokens, score),
        matchedFields: {
          name: primaryTokens.normalizedName === secondaryTokens.normalizedName,
          manufacturer: primaryTokens.normalizedManufacturer === secondaryTokens.normalizedManufacturer,
          concentration: primaryTokens.normalizedConcentration === secondaryTokens.normalizedConcentration,
          presentation: primaryTokens.normalizedPresentation === secondaryTokens.normalizedPresentation,
          ean: Boolean(primaryTokens.ean && primaryTokens.ean === secondaryTokens.ean),
          sku: Boolean(primaryTokens.sku && primaryTokens.sku === secondaryTokens.sku),
        },
      });
    }
  }

  if (resultsToInsert.length) {
    await db.insert(duplicateDetectionResults).values(resultsToInsert);
  }

  const confirmedCount = resultsToInsert.filter((item) => item.classification === "confirmed").length;
  const probableCount = resultsToInsert.filter((item) => item.classification === "probable").length;
  const reviewCount = resultsToInsert.filter((item) => item.classification === "review").length;

  await db
    .update(duplicateDetectionRuns)
    .set({
      status: "completed",
      totalCandidates: resultsToInsert.length,
      confirmedCount,
      probableCount,
      reviewCount,
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(duplicateDetectionRuns.id, runId));

  return { runId, totalCandidates: resultsToInsert.length, confirmedCount, probableCount, reviewCount };
}

export async function listPotentialDuplicates(filters?: { classification?: DuplicateClassification | "all"; runId?: number; page?: number; pageSize?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 20;
  const conditions = [] as any[];

  if (filters?.runId) conditions.push(eq(duplicateDetectionResults.runId, filters.runId));
  if (filters?.classification && filters.classification !== "all") {
    conditions.push(eq(duplicateDetectionResults.classification, filters.classification));
  } else {
    conditions.push(inArray(duplicateDetectionResults.classification, ["confirmed", "probable", "review"]));
  }

  return db
    .select()
    .from(duplicateDetectionResults)
    .where(conditions.length === 1 ? conditions[0] : and(...conditions))
    .orderBy(desc(duplicateDetectionResults.score), desc(duplicateDetectionResults.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
}

export async function approveMerge(params: { resultId: number; performedByUserId?: number | null }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const [result] = await db.select().from(duplicateDetectionResults).where(eq(duplicateDetectionResults.id, params.resultId)).limit(1);
  if (!result) throw new Error("Resultado de duplicidade não encontrado");

  await db.update(duplicateDetectionResults).set({ classification: "merged", reviewedByUserId: params.performedByUserId ?? null, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(duplicateDetectionResults.id, params.resultId));
  await db.update(products).set({ isActive: "no", updatedAt: new Date() }).where(eq(products.id, result.secondaryProductId));
  await db.insert(duplicateMergeHistory).values({
    resultId: params.resultId,
    primaryProductId: result.primaryProductId,
    secondaryProductId: result.secondaryProductId,
    action: "merge",
    performedByUserId: params.performedByUserId ?? null,
    notes: result.rationale ?? "Mesclagem aprovada manualmente",
    snapshot: result.matchedFields,
  });

  return { success: true, primaryProductId: result.primaryProductId, secondaryProductId: result.secondaryProductId };
}

export async function ignoreResult(params: { resultId: number; performedByUserId?: number | null; markDistinct?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  const [result] = await db.select().from(duplicateDetectionResults).where(eq(duplicateDetectionResults.id, params.resultId)).limit(1);
  if (!result) throw new Error("Resultado de duplicidade não encontrado");

  const classification = params.markDistinct ? "distinct" : "ignored";
  await db.update(duplicateDetectionResults).set({ classification, reviewedByUserId: params.performedByUserId ?? null, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(duplicateDetectionResults.id, params.resultId));
  await db.insert(duplicateMergeHistory).values({
    resultId: params.resultId,
    primaryProductId: result.primaryProductId,
    secondaryProductId: result.secondaryProductId,
    action: params.markDistinct ? "mark_distinct" : "ignore",
    performedByUserId: params.performedByUserId ?? null,
    notes: result.rationale ?? "Resultado ignorado",
    snapshot: result.matchedFields,
  });

  return { success: true, classification };
}

export async function getProductDuplicateProfile(productId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  return db
    .select()
    .from(duplicateDetectionResults)
    .where(
      inArray(duplicateDetectionResults.classification, ["confirmed", "probable", "review", "merged", "ignored", "distinct"]),
    )
    .orderBy(desc(duplicateDetectionResults.score), desc(duplicateDetectionResults.updatedAt));
}
