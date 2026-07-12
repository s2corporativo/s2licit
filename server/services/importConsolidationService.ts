/**
 * Serviço de Consolidação para Importação
 * 
 * Responsável por:
 * - Detectar duplicatas dentro de um lote de importação
 * - Agrupar preços por fornecedor
 * - Gerar relatório de consolidação
 * - Preparar dados consolidados para salvamento
 */

import {
  generateProductSignature,
  groupProductsBySignature,
} from "./productConsolidationService";

export interface ImportProduct {
  name: string;
  activeIngredient?: string | null;
  concentration?: string | null;
  presentation?: string | null;
  manufacturer?: string | null;
  supplierId?: number;
  supplierName?: string;
  price?: string | null;
  code?: string;
  imageUrl?: string | null;
  productUrl?: string | null;
  categoryId?: number;
  fichaTecnica?: string | null;
  tipoCatalogo?: string;
  ean?: string;
}

export interface ConsolidationReport {
  totalProductsInImport: number;
  uniqueProducts: number;
  duplicatesFound: number;
  consolidatedGroups: Array<{
    signature: string;
    masterName: string;
    count: number;
    suppliers: Array<{
      id?: number;
      name?: string;
      price?: string;
    }>;
  }>;
  newSuppliers: Array<{
    id?: number;
    name?: string;
  }>;
}

/**
 * Detecta duplicatas dentro de um lote de importação
 */
export function detectDuplicatesInBatch(products: ImportProduct[]): ConsolidationReport {
  const consolidated = groupProductsBySignature(
    products.map((p, idx) => ({
      id: idx, // Usar índice como ID temporário
      name: p.name,
      activeIngredient: p.activeIngredient,
      concentration: p.concentration,
      presentation: p.presentation,
      manufacturer: p.manufacturer,
      category: null,
      description: null,
      imageUrl: p.imageUrl,
      productUrl: p.productUrl,
      barcode: null,
      mapa: null,
      supplierId: p.supplierId || 0,
      supplierName: p.supplierName || "Desconhecido",
      price: p.price || null,
    }))
  );

  const consolidatedArray = Array.from(consolidated.values());
  const uniqueSignatures = consolidated.size;
  const duplicatesFound = products.length - uniqueSignatures;

  // Extrair fornecedores únicos
  const suppliersSet = new Map<number, string>();
  consolidatedArray.forEach((group) => {
    group.pricesBySupplier.forEach(({ supplierName }, supplierId) => {
      if (supplierId > 0 && !suppliersSet.has(supplierId)) {
        suppliersSet.set(supplierId, supplierName);
      }
    });
  });

  const suppliers = Array.from(suppliersSet.entries()).map(([id, name]) => ({
    id,
    name,
  }));

  // Montar relatório de grupos consolidados
  const consolidatedGroups = consolidatedArray.map((group) => ({
    signature: generateProductSignature({
      name: group.name,
      activeIngredient: group.activeIngredient,
      concentration: group.concentration,
      presentation: group.presentation,
      manufacturer: group.manufacturer,
    }),
    masterName: group.name,
    count: group.sourceProductIds.length,
    suppliers: Array.from(group.pricesBySupplier.entries()).map(([supplierId, { supplierName, price }]) => ({
      id: supplierId,
      name: supplierName,
      price,
    })),
  }));

  return {
    totalProductsInImport: products.length,
    uniqueProducts: uniqueSignatures,
    duplicatesFound,
    consolidatedGroups,
    newSuppliers: suppliers,
  };
}

/**
 * Agrupa produtos por fornecedor dentro de um lote
 * Retorna mapa de assinatura → lista de produtos por fornecedor
 */
export function groupProductsBySupplierInBatch(
  products: ImportProduct[]
): Map<string, Map<number, ImportProduct[]>> {
  const grouped = new Map<string, Map<number, ImportProduct[]>>();

  products.forEach((product) => {
    const signature = generateProductSignature({
      name: product.name,
      activeIngredient: product.activeIngredient,
      concentration: product.concentration,
      presentation: product.presentation,
      manufacturer: product.manufacturer,
    });

    if (!grouped.has(signature)) {
      grouped.set(signature, new Map());
    }

    const supplierId = product.supplierId || 0;
    const supplierGroup = grouped.get(signature)!;

    if (!supplierGroup.has(supplierId)) {
      supplierGroup.set(supplierId, []);
    }

    supplierGroup.get(supplierId)!.push(product);
  });

  return grouped;
}

/**
 * Prepara dados consolidados para importação
 * Retorna lista de produtos únicos com preços agrupados por fornecedor
 */
export function prepareConsolidatedForImport(
  products: ImportProduct[]
): Array<ImportProduct & { consolidatedPrices: Map<number, string> }> {
  const consolidated = groupProductsBySignature(
    products.map((p, idx) => ({
      id: idx,
      name: p.name,
      activeIngredient: p.activeIngredient,
      concentration: p.concentration,
      presentation: p.presentation,
      manufacturer: p.manufacturer,
      category: null,
      description: null,
      imageUrl: p.imageUrl,
      productUrl: p.productUrl,
      barcode: null,
      mapa: null,
      supplierId: p.supplierId || 0,
      supplierName: p.supplierName || "Desconhecido",
      price: p.price || null,
    }))
  );

  const result: Array<ImportProduct & { consolidatedPrices: Map<number, string> }> = [];

  consolidated.forEach((group) => {
    const firstProduct = products.find((p) => {
      const sig = generateProductSignature({
        name: p.name,
        activeIngredient: p.activeIngredient,
        concentration: p.concentration,
        presentation: p.presentation,
        manufacturer: p.manufacturer,
      });
      return sig === generateProductSignature({
        name: group.name,
        activeIngredient: group.activeIngredient,
        concentration: group.concentration,
        presentation: group.presentation,
        manufacturer: group.manufacturer,
      });
    });

    if (firstProduct) {
      const consolidatedPrices = new Map<number, string>();
      group.pricesBySupplier.forEach(({ price }, supplierId) => {
        if (price) {
          consolidatedPrices.set(supplierId, price);
        }
      });

      result.push({
        ...firstProduct,
        consolidatedPrices,
      });
    }
  });

  return result;
}

/**
 * Calcula estatísticas de consolidação
 */
export function calculateConsolidationStats(report: ConsolidationReport) {
  const consolidationRate = report.totalProductsInImport > 0
    ? ((report.duplicatesFound / report.totalProductsInImport) * 100).toFixed(2)
    : "0.00";

  const avgSuppliersPerProduct =
    report.consolidatedGroups.length > 0
      ? (
          report.consolidatedGroups.reduce((sum, group) => sum + group.suppliers.length, 0) /
          report.consolidatedGroups.length
        ).toFixed(2)
      : "0.00";

  return {
    consolidationRate: parseFloat(consolidationRate),
    avgSuppliersPerProduct: parseFloat(avgSuppliersPerProduct),
    totalUniqueSuppliers: report.newSuppliers.length,
    productsWithMultipleSuppliers: report.consolidatedGroups.filter((g) => g.suppliers.length > 1)
      .length,
  };
}
