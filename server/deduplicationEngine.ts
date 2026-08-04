import { getDb } from "./db";
import { levenshteinSimilarity } from "./matching/productMatcher";

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
 * Campos usados para buscar candidatos a duplicata.
 * Apenas campos realmente presentes entram na busca — campos vazios nunca
 * podem casar registros entre si (bug antigo: `eq(campo, valor || "")`).
 */
export function buildMatchFields(
  importedProduct: { name?: string; principioAtivo?: string; ean?: string },
  tipoCatalogo: string
): Array<{ column: "activeIngredient" | "ean" | "name"; value: string }> {
  const fields: Array<{ column: "activeIngredient" | "ean" | "name"; value: string }> = [];
  if (tipoCatalogo === "medicamento_veterinario" || tipoCatalogo === "medicamento_humano") {
    // Para medicamentos: buscar por princípio ativo + EAN
    if (importedProduct.principioAtivo) fields.push({ column: "activeIngredient", value: importedProduct.principioAtivo });
    if (importedProduct.ean) fields.push({ column: "ean", value: importedProduct.ean });
  } else {
    // Para não medicamentos: buscar por nome + EAN
    if (importedProduct.name) fields.push({ column: "name", value: importedProduct.name });
    if (importedProduct.ean) fields.push({ column: "ean", value: importedProduct.ean });
  }
  return fields;
}

/**
 * Motor de deduplicação inteligente por tipo de catálogo
 *
 * @param options.supplierId - quando informado, restringe os candidatos aos
 *   produtos do mesmo fornecedor (usado pelos fluxos de atualização, para
 *   nunca casar/alterar o cadastro de produto de outro fornecedor).
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
  },
  options?: { supplierId?: number }
): Promise<DuplicateAnalysis> {
  const db = await getDb();
  if (!db) return { action: "criar_novo", confidence: 0, reason: "DB unavailable" };

  const { products } = await import("../drizzle/schema");
  const { eq, or, and } = await import("drizzle-orm");

  // Normalizar entrada
  const tipoCatalogo = importedProduct.tipoCatalogo || "produto_nao_medicamentoso";

  // Montar condições apenas com campos realmente presentes
  const matchFields = buildMatchFields(importedProduct, tipoCatalogo);
  if (matchFields.length === 0) {
    return {
      action: "criar_novo",
      confidence: 100,
      reason: "Sem campos identificadores para busca de duplicatas",
    };
  }

  const matchConditions = matchFields.map((f) => eq((products as any)[f.column], f.value));
  const conditions: any[] = [
    eq(products.tipoCatalogo, tipoCatalogo as any),
    matchConditions.length === 1 ? matchConditions[0] : or(...matchConditions),
  ];
  if (options?.supplierId) {
    conditions.push(eq(products.supplierId, options.supplierId));
  }

  const rows = await db
    .select()
    .from(products)
    .where(and(...conditions))
    .limit(10);

  // Mapear colunas do banco para o formato de comparação
  const candidates: ProductCandidate[] = rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    principioAtivo: r.activeIngredient ?? undefined,
    concentracao: r.concentration ?? undefined,
    formaFarmaceutica: r.pharmaceuticalForm ?? undefined,
    fabricante: r.manufacturer ?? undefined,
    fichaTecnica: r.fichaTecnica ?? undefined,
    tipoCatalogo: r.tipoCatalogo ?? undefined,
    ean: r.ean ?? r.gtin ?? undefined,
  }));

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
 * Calcular similaridade entre duas strings (Levenshtein).
 * Delega para matching/productMatcher.ts#levenshteinSimilarity — este
 * arquivo tinha sua própria cópia do mesmo algoritmo (terceira encontrada
 * no sistema, além de fuzzy.ts e services/productMatchingService.ts, já
 * consolidadas). Chamadores já normalizam via normalizeText antes de
 * comparar, então a matemática (distância de edição via matriz DP,
 * normalizada por 1 - distância/tamanho) é idêntica para os mesmos
 * argumentos — verificado à mão para os 3 casos de borda (ambas vazias,
 * uma vazia, caso geral) antes de aplicar.
 */
const stringSimilarity = levenshteinSimilarity;
