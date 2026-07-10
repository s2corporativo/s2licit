/**
 * Serviço de Integração de Matching na Importação
 * Detecta produtos existentes via Master Products e atualiza preços por fornecedor
 */

import { matchProductToMaster, type MasterProductMatch } from "./productMatchingService";

export interface ImportedProduct {
  name: string;
  ean?: string | null;
  codigoMapa?: string | null;
  concentration?: string | null;
  presentation?: string | null;
  manufacturer?: string | null;
  price?: number | null;
  supplierId?: number | null;
  supplierName?: string | null;
  [key: string]: any;
}

export interface MatchingResult {
  importedProduct: ImportedProduct;
  masterProductId?: number;
  masterProductName?: string;
  matchType?: "ean" | "mapa" | "name_concentration_presentation" | "name_similarity" | "no_match";
  similarity?: number;
  action: "create" | "update" | "skip";
  reason?: string;
}

export interface ImportMatchingStats {
  totalImported: number;
  newProducts: number;
  updatedProducts: number;
  skippedProducts: number;
  matchedByEan: number;
  matchedByMapa: number;
  matchedByName: number;
  matchedBySimilarity: number;
  noMatches: number;
  averageSimilarity: number;
}

/**
 * Processa produtos importados e encontra matches com Master Products
 */
export async function processImportedProductsWithMatching(
  importedProducts: ImportedProduct[],
  masterProducts: MasterProductMatch[],
  existingProducts: Map<number, any>,
  minSimilarity: number = 0.7
): Promise<MatchingResult[]> {
  const results: MatchingResult[] = [];

  for (const product of importedProducts) {
    const match = await matchProductToMaster(product, masterProducts, minSimilarity);

    if (match) {
      // Produto encontrado no Master Products
      const existingProduct = existingProducts.get(match.masterProduct.id);

      if (existingProduct) {
        // Produto já existe - atualizar preço
        results.push({
          importedProduct: product,
          masterProductId: match.masterProduct.id,
          masterProductName: match.masterProduct.name,
          matchType: match.matchType,
          similarity: match.similarity,
          action: "update",
          reason: `Produto encontrado com ${(match.similarity * 100).toFixed(1)}% de similaridade. Preço será atualizado.`,
        });
      } else {
        // Novo produto baseado em Master Product
        results.push({
          importedProduct: product,
          masterProductId: match.masterProduct.id,
          masterProductName: match.masterProduct.name,
          matchType: match.matchType,
          similarity: match.similarity,
          action: "create",
          reason: `Novo produto criado a partir de Master Product com ${(match.similarity * 100).toFixed(1)}% de similaridade.`,
        });
      }
    } else {
      // Nenhum match encontrado - criar novo produto
      results.push({
        importedProduct: product,
        matchType: "no_match",
        similarity: 0,
        action: "create",
        reason: "Nenhuma correspondência encontrada. Novo produto será criado.",
      });
    }
  }

  return results;
}

/**
 * Calcula estatísticas de matching para importação
 */
export async function calculateImportMatchingStats(results: MatchingResult[]): Promise<ImportMatchingStats> {
  const stats: ImportMatchingStats = {
    totalImported: results.length,
    newProducts: 0,
    updatedProducts: 0,
    skippedProducts: 0,
    matchedByEan: 0,
    matchedByMapa: 0,
    matchedByName: 0,
    matchedBySimilarity: 0,
    noMatches: 0,
    averageSimilarity: 0,
  };

  let totalSimilarity = 0;
  let similarityCount = 0;

  for (const result of results) {
    // Contar por ação
    if (result.action === "create") {
      stats.newProducts++;
    } else if (result.action === "update") {
      stats.updatedProducts++;
    } else if (result.action === "skip") {
      stats.skippedProducts++;
    }

    // Contar por tipo de match
    if (result.matchType === "ean") {
      stats.matchedByEan++;
    } else if (result.matchType === "mapa") {
      stats.matchedByMapa++;
    } else if (result.matchType === "name_concentration_presentation") {
      stats.matchedByName++;
    } else if (result.matchType === "name_similarity") {
      stats.matchedBySimilarity++;
    } else if (result.matchType === "no_match") {
      stats.noMatches++;
    }

    // Calcular média de similaridade
    if (result.similarity !== undefined && result.similarity > 0) {
      totalSimilarity += result.similarity;
      similarityCount++;
    }
  }

  stats.averageSimilarity = similarityCount > 0 ? totalSimilarity / similarityCount : 0;

  return stats;
}

/**
 * Agrupa resultados de matching por ação
 */
export function groupMatchingResultsByAction(results: MatchingResult[]): {
  create: MatchingResult[];
  update: MatchingResult[];
  skip: MatchingResult[];
} {
  return {
    create: results.filter(r => r.action === "create"),
    update: results.filter(r => r.action === "update"),
    skip: results.filter(r => r.action === "skip"),
  };
}

/**
 * Prepara dados para atualização de preços por fornecedor
 */
export interface SupplierPriceUpdate {
  productId: number;
  supplierId: number;
  supplierName: string;
  price: number;
  ean?: string | null;
  codigoMapa?: string | null;
}

export async function prepareSupplierPriceUpdates(
  updateResults: MatchingResult[],
  productIdMap: Map<number, number> // masterProductId -> productId
): Promise<SupplierPriceUpdate[]> {
  const updates: SupplierPriceUpdate[] = [];

  for (const result of updateResults) {
    if (result.masterProductId && result.importedProduct.price && result.importedProduct.supplierId) {
      const productId = productIdMap.get(result.masterProductId);

      if (productId) {
        updates.push({
          productId,
          supplierId: result.importedProduct.supplierId,
          supplierName: result.importedProduct.supplierName || "Unknown",
          price: result.importedProduct.price,
          ean: result.importedProduct.ean,
          codigoMapa: result.importedProduct.codigoMapa,
        });
      }
    }
  }

  return updates;
}

/**
 * Valida se produtos importados têm dados suficientes para matching
 */
export function validateImportedProductsForMatching(products: ImportedProduct[]): {
  valid: ImportedProduct[];
  invalid: { product: ImportedProduct; reason: string }[];
} {
  const valid: ImportedProduct[] = [];
  const invalid: { product: ImportedProduct; reason: string }[] = [];

  for (const product of products) {
    if (!product.name || product.name.trim().length === 0) {
      invalid.push({ product, reason: "Nome do produto vazio" });
    } else if (!product.ean && !product.codigoMapa && !product.concentration) {
      invalid.push({ product, reason: "Produto sem EAN, MAPA ou concentração para matching" });
    } else {
      valid.push(product);
    }
  }

  return { valid, invalid };
}

/**
 * Detecta duplicatas dentro do lote importado
 */
export function detectDuplicatesInImportBatch(products: ImportedProduct[]): {
  unique: ImportedProduct[];
  duplicates: { product: ImportedProduct; duplicateOf: string }[];
} {
  const unique: ImportedProduct[] = [];
  const seen = new Map<string, ImportedProduct>();
  const duplicates: { product: ImportedProduct; duplicateOf: string }[] = [];

  for (const product of products) {
    // Gerar assinatura do produto
    const signature = `${product.name?.toLowerCase().trim()}|${product.concentration?.toLowerCase().trim()}|${product.presentation?.toLowerCase().trim()}`;

    if (seen.has(signature)) {
      const original = seen.get(signature)!;
      duplicates.push({
        product,
        duplicateOf: original.name || "Unknown",
      });
    } else {
      unique.push(product);
      seen.set(signature, product);
    }
  }

  return { unique, duplicates };
}

/**
 * Consolida preços de fornecedores para produtos duplicados
 */
export function consolidateSupplierPricesForDuplicates(
  products: ImportedProduct[],
  duplicates: { product: ImportedProduct; duplicateOf: string }[]
): Map<string, SupplierPriceUpdate[]> {
  const consolidatedPrices = new Map<string, SupplierPriceUpdate[]>();

  // Agrupar preços por produto único
  for (const product of products) {
    const signature = `${product.name?.toLowerCase().trim()}|${product.concentration?.toLowerCase().trim()}|${product.presentation?.toLowerCase().trim()}`;

    if (!consolidatedPrices.has(signature)) {
      consolidatedPrices.set(signature, []);
    }

    if (product.price && product.supplierId) {
      consolidatedPrices.get(signature)!.push({
        productId: 0, // Será preenchido depois
        supplierId: product.supplierId,
        supplierName: product.supplierName || "Unknown",
        price: product.price,
        ean: product.ean,
        codigoMapa: product.codigoMapa,
      });
    }
  }

  return consolidatedPrices;
}

/**
 * Gera relatório de importação com matching
 */
export interface ImportMatchingReport {
  timestamp: string;
  totalProcessed: number;
  stats: ImportMatchingStats;
  groupedResults: {
    create: MatchingResult[];
    update: MatchingResult[];
    skip: MatchingResult[];
  };
  duplicatesDetected: number;
  warnings: string[];
  errors: string[];
}

export async function generateImportMatchingReport(
  results: MatchingResult[],
  stats: ImportMatchingStats,
  duplicatesCount: number,
  warnings: string[] = [],
  errors: string[] = []
): Promise<ImportMatchingReport> {
  return {
    timestamp: new Date().toISOString(),
    totalProcessed: stats.totalImported,
    stats,
    groupedResults: groupMatchingResultsByAction(results),
    duplicatesDetected: duplicatesCount,
    warnings,
    errors,
  };
}
