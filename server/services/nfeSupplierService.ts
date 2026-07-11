import { NfeImportResult, NfeProductToImport } from "./nfeImportService";

export interface SupplierAssociation {
  supplierId: string;
  supplierName: string;
  supplierCnpj: string;
  productsCount: number;
  totalValue: number;
  lastImportDate: Date;
}

export interface PriceUpdate {
  productId: string;
  supplierId: string;
  oldPrice: number;
  newPrice: number;
  priceChange: number;
  priceChangePercentage: number;
}

/**
 * Find or create supplier from NFe data
 */
export async function findOrCreateSupplier(
  supplierName: string,
  supplierCnpj: string,
  suppliers: Array<{ id: string; name: string; cnpj: string }>
): Promise<{ id: string; isNew: boolean }> {
  // Try to find by CNPJ first (most reliable)
  let supplier = suppliers.find(s => s.cnpj === supplierCnpj);
  if (supplier) {
    return { id: supplier.id, isNew: false };
  }

  // Try to find by name similarity
  supplier = suppliers.find(s => s.name.toLowerCase() === supplierName.toLowerCase());
  if (supplier) {
    return { id: supplier.id, isNew: false };
  }

  // Create new supplier
  const newSupplierId = `supplier_${Date.now()}`;
  return { id: newSupplierId, isNew: true };
}

/**
 * Associate products from NFe with supplier
 */
export function associateProductsWithSupplier(
  nfeResult: NfeImportResult,
  supplierId: string,
  products: NfeProductToImport[]
): Array<{
  productName: string;
  ean?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  supplierId: string;
  unit?: string;
  ncm?: string;
  masterId?: string;
}> {
  return products
    .filter(p => p.selected)
    .map(p => ({
      productName: p.productName,
      ean: p.ean,
      quantity: p.quantity,
      unitPrice: p.unitPrice,
      totalPrice: p.totalPrice,
      supplierId,
      unit: p.unit,
      ncm: p.ncm,
      masterId: p.masterId,
    }));
}

/**
 * Calculate price updates for existing products
 */
export function calculatePriceUpdates(
  products: Array<{
    productId: string;
    supplierId: string;
    oldPrice: number;
    newPrice: number;
  }>
): PriceUpdate[] {
  return products.map(p => {
    const priceChange = p.newPrice - p.oldPrice;
    const priceChangePercentage = (priceChange / p.oldPrice) * 100;

    return {
      productId: p.productId,
      supplierId: p.supplierId,
      oldPrice: p.oldPrice,
      newPrice: p.newPrice,
      priceChange,
      priceChangePercentage,
    };
  });
}

/**
 * Prepare supplier price updates for database
 */
export function prepareSupplierPriceUpdates(
  priceUpdates: PriceUpdate[]
): Array<{
  productId: string;
  supplierId: string;
  price: number;
  updatedAt: Date;
}> {
  return priceUpdates.map(pu => ({
    productId: pu.productId,
    supplierId: pu.supplierId,
    price: pu.newPrice,
    updatedAt: new Date(),
  }));
}

/**
 * Generate supplier import summary
 */
export function generateSupplierImportSummary(
  nfeResult: NfeImportResult,
  supplierId: string,
  priceUpdates: PriceUpdate[]
): string {
  const newProducts = nfeResult.products.filter(p => p.matchStatus === "new").length;
  const updatedProducts = priceUpdates.length;
  const priceIncreases = priceUpdates.filter(pu => pu.priceChange > 0).length;
  const priceDecreases = priceUpdates.filter(pu => pu.priceChange < 0).length;

  const avgPriceChange =
    priceUpdates.length > 0
      ? priceUpdates.reduce((sum, pu) => sum + pu.priceChangePercentage, 0) / priceUpdates.length
      : 0;

  const summary = [
    `Fornecedor: ${nfeResult.supplierName}`,
    `NFe: #${nfeResult.nfeNumber}`,
    `Produtos novos: ${newProducts}`,
    `Produtos com preço atualizado: ${updatedProducts}`,
    `  - Aumentos: ${priceIncreases}`,
    `  - Reduções: ${priceDecreases}`,
    `Variação média de preço: ${avgPriceChange.toFixed(2)}%`,
  ];

  return summary.join("\n");
}

/**
 * Validate supplier data before import
 */
export function validateSupplierData(
  supplierName: string,
  supplierCnpj: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!supplierName || supplierName.trim().length === 0) {
    errors.push("Nome do fornecedor obrigatório");
  }

  if (!supplierCnpj || supplierCnpj.trim().length === 0) {
    errors.push("CNPJ do fornecedor obrigatório");
  }

  // Basic CNPJ validation (format check)
  if (supplierCnpj && !/^\d{14}$/.test(supplierCnpj.replace(/\D/g, ""))) {
    errors.push("CNPJ inválido (deve ter 14 dígitos)");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check for price anomalies
 */
export function detectPriceAnomalies(
  priceUpdates: PriceUpdate[],
  anomalyThreshold: number = 50 // 50% change threshold
): Array<{
  productId: string;
  type: "spike" | "drop";
  percentage: number;
}> {
  return priceUpdates
    .filter(pu => Math.abs(pu.priceChangePercentage) > anomalyThreshold)
    .map(pu => ({
      productId: pu.productId,
      type: pu.priceChange > 0 ? "spike" : "drop",
      percentage: Math.abs(pu.priceChangePercentage),
    }));
}

/**
 * Generate supplier statistics
 */
export function generateSupplierStats(
  nfeResult: NfeImportResult,
  priceUpdates: PriceUpdate[]
): {
  totalProducts: number;
  newProducts: number;
  updatedProducts: number;
  totalValue: number;
  averagePrice: number;
  priceRangeMin: number;
  priceRangeMax: number;
  priceAnomalies: number;
} {
  const prices = nfeResult.products.map(p => p.unitPrice);
  const priceAnomalies = detectPriceAnomalies(priceUpdates).length;

  return {
    totalProducts: nfeResult.products.length,
    newProducts: nfeResult.products.filter(p => p.matchStatus === "new").length,
    updatedProducts: priceUpdates.length,
    totalValue: nfeResult.products.reduce((sum, p) => sum + p.totalPrice, 0),
    averagePrice: prices.length > 0 ? prices.reduce((a, b) => a + b) / prices.length : 0,
    priceRangeMin: Math.min(...prices),
    priceRangeMax: Math.max(...prices),
    priceAnomalies,
  };
}
