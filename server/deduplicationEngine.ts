import { getDb } from "./db";

export type DuplicateAction = 
  | "criar_novo"
  | "atualizar_existente"
  | "novo_fornecedor"
  | "atualizar_preco"
  | "revisar_manual";

export interface DuplicateAnalysis {
  action: DuplicateAction;
  matchedProductId?: number;
  confidence: number; // 0-100
  reason: string;
  suggestedMerge?: {
    productId: number;
    name: string;
    similarity: number;
  }[];
}

interface ProductCandidate {
  id: number;
  name: string;
  principioAtivo?: string;
  concentracao?: string;
  formaFarmaceutica?: string;
  fabricante?: string;
  categoria?: string;
  fichaTecnica?: string;
  tipoCatalogo?: string;
  ean?: string;
}

/**
 * Motor de deduplicação inteligente por tipo de catálogo
 */
export async function detectDuplicate(
  importedProduct: {
    name: string;
    principioAtivo?: string;
    concentracao?: string;
    formaFarmaceutica?: string;
    fabricante?: string;
    categoria?: string;
    fichaTecnica?: string;
    tipoCatalogo?: string;
    ean?: string;
    supplierId?: number;
  }
): Promise<DuplicateAnalysis> {
  const db = await getDb();
  if (!db) return { action: "criar_novo", confidence: 0, reason: "DB unavailable" };

  const { products } = await import("../drizzle/schema");
  const { eq, or, and } = await import("drizzle-orm");

  // Normalizar entrada
  const tipoCatalogo = importedProduct.tipoCatalogo || "produto_nao_medicamentoso";
  const normalizedName = normalizeText(importedProduct.name);

  // Buscar candidatos por tipo de catálogo
  let candidates: any[] = [];

  if (tipoCatalogo === "medicamento_veterinario" || tipoCatalogo === "medicamento_humano") {
    // Para medicamentos: buscar por princípio ativo + concentração + forma farmacêutica
    candidates = await db
      .select()
      .from(products)
      .where(
        and(
          eq((products as any).tipoCatalogo, tipoCatalogo as any),
          or(
            eq((products as any).principioAtivo, importedProduct.principioAtivo || ""),
            eq(products.ean, importedProduct.ean || "")
          )
        )
      )
      .limit(10);
  } else {
    // Para não medicamentos: buscar por nome + categoria + fabricante
    candidates = await db
      .select()
      .from(products)
      .where(
        and(
          eq((products as any).tipoCatalogo, tipoCatalogo as any),
          or(
            eq(products.name, importedProduct.name),
            eq(products.ean, importedProduct.ean || "")
          )
        )
      )
      .limit(10);
  }

  // Analisar candidatos
  if (candidates.length === 0) {
    return {
      action: "criar_novo",
      confidence: 100,
      reason: "Nenhum produto similar encontrado no catálogo",
    };
  }

  // Calcular similaridade com cada candidato
  const similarities = candidates.map((candidate) => ({
    product: candidate,
    score: calculateSimilarity(importedProduct, candidate, tipoCatalogo),
  }));

  // Ordenar por similaridade
  similarities.sort((a, b) => b.score - a.score);
  const bestMatch = similarities[0];

  // Decidir ação baseado na similaridade
  if (bestMatch.score >= 95) {
    // Produto praticamente idêntico
    if (importedProduct.supplierId) {
      // Verificar se fornecedor já está vinculado
      const { productSupplierOffers } = await import("../drizzle/schema");
      const existing = await db
        .select()
        .from(productSupplierOffers)
        .where(
          and(
            eq(productSupplierOffers.productId, bestMatch.product.id),
            eq(productSupplierOffers.supplierId, importedProduct.supplierId)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        return {
          action: "atualizar_preco",
          matchedProductId: bestMatch.product.id,
          confidence: 95,
          reason: "Produto e fornecedor já existem. Atualizar preço.",
        };
      } else {
        return {
          action: "novo_fornecedor",
          matchedProductId: bestMatch.product.id,
          confidence: 95,
          reason: "Produto existe. Vincular novo fornecedor.",
        };
      }
    } else {
      return {
        action: "atualizar_existente",
        matchedProductId: bestMatch.product.id,
        confidence: 95,
        reason: "Produto idêntico encontrado. Atualizar dados.",
      };
    }
  } else if (bestMatch.score >= 70) {
    // Possível duplicado, mas exige revisão
    return {
      action: "revisar_manual",
      matchedProductId: bestMatch.product.id,
      confidence: bestMatch.score,
      reason: `Possível duplicado com ${bestMatch.score}% de similaridade. Exige revisão manual.`,
      suggestedMerge: similarities
        .filter((s) => s.score >= 70)
        .map((s) => ({
          productId: s.product.id,
          name: s.product.name,
          similarity: s.score,
        })),
    };
  } else {
    // Nenhuma similaridade significativa
    return {
      action: "criar_novo",
      confidence: 100 - bestMatch.score,
      reason: "Nenhum produto similar significativo encontrado.",
    };
  }
}

/**
 * Calcular similaridade entre dois produtos
 */
function calculateSimilarity(
  imported: any,
  existing: ProductCandidate,
  tipoCatalogo: string
): number {
  let score = 0;
  let maxScore = 0;

  // Comparar nome
  const nameSimilarity = stringSimilarity(
    normalizeText(imported.name),
    normalizeText(existing.name)
  );
  score += nameSimilarity * 30;
  maxScore += 30;

  if (tipoCatalogo === "medicamento_veterinario" || tipoCatalogo === "medicamento_humano") {
    // Medicamentos: comparar princípio ativo
    if (imported.principioAtivo && existing.principioAtivo) {
      score += imported.principioAtivo === existing.principioAtivo ? 40 : 0;
      maxScore += 40;
    }

    // Comparar concentração
    if (imported.concentracao && existing.concentracao) {
      score += imported.concentracao === existing.concentracao ? 20 : 0;
      maxScore += 20;
    }

    // Comparar forma farmacêutica
    if (imported.formaFarmaceutica && existing.formaFarmaceutica) {
      score += imported.formaFarmaceutica === existing.formaFarmaceutica ? 10 : 0;
      maxScore += 10;
    }
  } else {
    // Não medicamentos: comparar categoria e ficha técnica
    if (imported.categoria && existing.categoria) {
      score += imported.categoria === existing.categoria ? 30 : 0;
      maxScore += 30;
    }

    if (imported.fichaTecnica && existing.fichaTecnica) {
      const fichaSimilarity = stringSimilarity(
        normalizeText(imported.fichaTecnica),
        normalizeText(existing.fichaTecnica)
      );
      score += fichaSimilarity * 20;
      maxScore += 20;
    }

    // Comparar fabricante
    if (imported.fabricante && existing.fabricante) {
      score += imported.fabricante === existing.fabricante ? 20 : 0;
      maxScore += 20;
    }
  }

  // Comparar EAN (peso alto)
  if (imported.ean && existing.ean) {
    score += imported.ean === existing.ean ? 50 : 0;
    maxScore += 50;
  }

  return maxScore > 0 ? (score / maxScore) * 100 : 0;
}

/**
 * Normalizar texto para comparação
 */
function normalizeText(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Calcular similaridade entre duas strings (Levenshtein)
 */
function stringSimilarity(a: string, b: string): number {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;

  if (longer.length === 0) return 1.0;

  const editDistance = getEditDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Calcular distância de edição (Levenshtein)
 */
function getEditDistance(s1: string, s2: string): number {
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}
