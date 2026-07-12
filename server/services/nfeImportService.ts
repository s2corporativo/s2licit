import { NfeData, ParsedNfeProduct } from "./nfeParserService";
import { calculateStringSimilarity } from "./productMatchingService";

export interface NfeImportResult {
  nfeNumber: string;
  supplierName: string;
  supplierCnpj: string;
  products: ParsedNfeProduct[];
  stats: {
    total: number;
    new: number;
    update: number;
    duplicate: number;
    unknown: number;
  };
}

export interface NfeProductToImport extends ParsedNfeProduct {
  selected: boolean;
  notes?: string;
}

/**
 * Process NFe data and match products with Master Products
 */
export function processNfeForImport(
  nfeData: NfeData,
  masterProducts: Array<{ id: string; name: string; ean?: string; mapa?: string }>
): NfeImportResult {
  const processedProducts: ParsedNfeProduct[] = [];

  for (const product of nfeData.products) {
    // Try to match by EAN first
    let matchResult: any = null;
    let confidence = 0;

    if (product.ean) {
      matchResult = masterProducts.find(mp => mp.ean === product.ean);
      if (matchResult) confidence = 0.95; // High confidence for EAN match
    }

    // Try to match by name similarity if EAN didn't work
    if (!matchResult) {
      let bestMatch = null;
      let bestSimilarity = 0;

      for (const mp of masterProducts) {
        const similarity = calculateStringSimilarity(product.productName, mp.name);
        if (similarity > bestSimilarity && similarity > 0.6) {
          bestSimilarity = similarity;
          bestMatch = mp;
          confidence = similarity;
        }
      }

      matchResult = bestMatch;
    }

    const matchStatus = matchResult
      ? confidence > 0.8
        ? "update"
        : confidence > 0.5
          ? "duplicate"
          : "new"
      : "unknown";

    processedProducts.push({
      ...product,
      matchStatus,
      masterId: matchResult?.id,
      masterName: matchResult?.name,
      confidence,
    });
  }

  // Calculate statistics
  const stats = {
    total: processedProducts.length,
    new: processedProducts.filter(p => p.matchStatus === "new").length,
    update: processedProducts.filter(p => p.matchStatus === "update").length,
    duplicate: processedProducts.filter(p => p.matchStatus === "duplicate").length,
    unknown: processedProducts.filter(p => p.matchStatus === "unknown").length,
  };

  return {
    nfeNumber: nfeData.nfeNumber,
    supplierName: nfeData.supplierName,
    supplierCnpj: nfeData.supplierCnpj,
    products: processedProducts,
    stats,
  };
}

/**
 * Validate products before import
 */
export function validateProductsForImport(
  products: ParsedNfeProduct[]
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const product of products) {
    // Validate required fields
    if (!product.productName || product.productName.trim().length === 0) {
      errors.push(`Produto ${product.id}: nome obrigatório`);
    }

    if (product.quantity <= 0) {
      errors.push(`Produto ${product.productName}: quantidade deve ser maior que zero`);
    }

    if (product.unitPrice < 0) {
      errors.push(`Produto ${product.productName}: preço não pode ser negativo`);
    }

    // Warnings
    if (!product.ean) {
      warnings.push(`Produto ${product.productName}: EAN não informado`);
    }

    if (product.matchStatus === "unknown") {
      warnings.push(`Produto ${product.productName}: não foi possível identificar no sistema`);
    }

    if (product.matchStatus === "duplicate" && product.confidence && product.confidence < 0.7) {
      warnings.push(`Produto ${product.productName}: possível duplicata com baixa confiança`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Filter products for import based on selection
 */
export function filterProductsForImport(
  products: NfeProductToImport[],
  includeUnknown: boolean = false
): NfeProductToImport[] {
  return products.filter(p => {
    if (!p.selected) return false;
    if (!includeUnknown && p.matchStatus === "unknown") return false;
    return true;
  });
}

/**
 * Prepare products for database insertion/update
 */
export function prepareProductsForDatabase(
  products: NfeProductToImport[],
  supplierId: string,
  categoryId?: string
): Array<{
  productName: string;
  description?: string;
  ean?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  unit?: string;
  ncm?: string;
  supplierId: string;
  categoryId?: string;
  masterId?: string;
  notes?: string;
}> {
  return products.map(p => ({
    productName: p.productName,
    description: p.description,
    ean: p.ean,
    quantity: p.quantity,
    unitPrice: p.unitPrice,
    totalPrice: p.totalPrice,
    unit: p.unit,
    ncm: p.ncm,
    supplierId,
    categoryId,
    masterId: p.masterId,
    notes: p.notes,
  }));
}

/**
 * Generate import summary report
 */
export function generateImportSummary(result: NfeImportResult): string {
  const { stats } = result;
  const summary = [
    `NFe #${result.nfeNumber}`,
    `Fornecedor: ${result.supplierName}`,
    `Total de produtos: ${stats.total}`,
    `  - Novos: ${stats.new}`,
    `  - Para atualizar: ${stats.update}`,
    `  - Possíveis duplicatas: ${stats.duplicate}`,
    `  - Não identificados: ${stats.unknown}`,
  ];

  return summary.join("\n");
}

/**
 * Calculate import statistics
 */
export function calculateImportStats(result: NfeImportResult): {
  recognitionRate: number;
  newProductsPercentage: number;
  updateProductsPercentage: number;
} {
  const { stats } = result;
  const recognized = stats.total - stats.unknown;
  const recognitionRate = stats.total > 0 ? (recognized / stats.total) * 100 : 0;
  const newProductsPercentage = stats.total > 0 ? (stats.new / stats.total) * 100 : 0;
  const updateProductsPercentage = stats.total > 0 ? (stats.update / stats.total) * 100 : 0;

  return {
    recognitionRate,
    newProductsPercentage,
    updateProductsPercentage,
  };
}
