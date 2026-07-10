/**
 * Serviço de Consolidação de Produtos
 * 
 * Responsável por:
 * - Identificar produtos duplicados (mesmo produto, fornecedores diferentes)
 * - Consolidar variantes do mesmo produto em uma única entrada
 * - Gerenciar preços por fornecedor
 * - Preencher automaticamente colunas de fornecedores
 */

export interface ProductSignature {
  name: string;
  activeIngredient?: string | null;
  concentration?: string | null;
  presentation?: string | null;
  manufacturer?: string | null;
}

export interface ConsolidatedProduct {
  masterProductId: string;
  name: string;
  activeIngredient?: string | null;
  concentration?: string | null;
  presentation?: string | null;
  manufacturer?: string | null;
  category?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  productUrl?: string | null;
  barcode?: string | null;
  mapa?: string | null;
  pricesBySupplier: Map<number, { supplierName: string; price: string }>;
  sourceProductIds: number[];
}

/**
 * Gera uma assinatura única para um produto baseado em características principais
 * Usada para identificar duplicatas
 */
export function generateProductSignature(product: ProductSignature): string {
  const normalize = (str: string | null | undefined): string => {
    if (!str) return "";
    return str
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[^\w\s]/g, "");
  };

  const name = normalize(product.name);
  const active = normalize(product.activeIngredient);
  const conc = normalize(product.concentration);
  const pres = normalize(product.presentation);

  // Assinatura: nome + princípio ativo + concentração + apresentação
  return `${name}|${active}|${conc}|${pres}`;
}

/**
 * Calcula similaridade entre dois produtos usando Levenshtein distance
 * Retorna score de 0 a 1 (1 = idêntico)
 */
export function calculateProductSimilarity(sig1: string, sig2: string): number {
  if (sig1 === sig2) return 1;

  const s1 = sig1.split("|");
  const s2 = sig2.split("|");

  let matchCount = 0;
  for (let i = 0; i < Math.min(s1.length, s2.length); i++) {
    if (s1[i] === s2[i] && s1[i].length > 0) {
      matchCount++;
    }
  }

  const maxFields = Math.max(s1.length, s2.length);
  return maxFields > 0 ? matchCount / maxFields : 0;
}

/**
 * Agrupa produtos por assinatura, consolidando variantes
 */
export function groupProductsBySignature(
  products: Array<{
    id: number;
    name: string;
    activeIngredient?: string | null;
    concentration?: string | null;
    presentation?: string | null;
    manufacturer?: string | null;
    category?: string | null;
    description?: string | null;
    imageUrl?: string | null;
    productUrl?: string | null;
    barcode?: string | null;
    mapa?: string | null;
    supplierId: number;
    supplierName: string;
    price: string | null;
  }>
): Map<string, ConsolidatedProduct> {
  const consolidated = new Map<string, ConsolidatedProduct>();

  products.forEach((product) => {
    const signature = generateProductSignature({
      name: product.name,
      activeIngredient: product.activeIngredient,
      concentration: product.concentration,
      presentation: product.presentation,
      manufacturer: product.manufacturer,
    });

    if (!consolidated.has(signature)) {
      consolidated.set(signature, {
        masterProductId: `master-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: product.name,
        activeIngredient: product.activeIngredient,
        concentration: product.concentration,
        presentation: product.presentation,
        manufacturer: product.manufacturer,
        category: product.category,
        description: product.description,
        imageUrl: product.imageUrl,
        productUrl: product.productUrl,
        barcode: product.barcode,
        mapa: product.mapa,
        pricesBySupplier: new Map(),
        sourceProductIds: [],
      });
    }

    const consolidated_product = consolidated.get(signature)!;
    consolidated_product.sourceProductIds.push(product.id);

    if (product.supplierId && product.supplierName && product.price) {
      consolidated_product.pricesBySupplier.set(product.supplierId, {
        supplierName: product.supplierName,
        price: product.price,
      });
    }
  });

  return consolidated;
}

/**
 * Atualiza ou adiciona preço de um fornecedor para um produto consolidado
 */
export function updateSupplierPrice(
  consolidated: ConsolidatedProduct,
  supplierId: number,
  supplierName: string,
  price: string
): void {
  consolidated.pricesBySupplier.set(supplierId, {
    supplierName,
    price,
  });
}

/**
 * Retorna lista de fornecedores únicos em todos os produtos consolidados
 */
export function extractUniqueSuppliers(
  consolidatedProducts: ConsolidatedProduct[]
): Array<{ id: number; name: string }> {
  const suppliers = new Map<number, string>();

  consolidatedProducts.forEach((product) => {
    product.pricesBySupplier.forEach(({ supplierName }, supplierId) => {
      if (!suppliers.has(supplierId)) {
        suppliers.set(supplierId, supplierName);
      }
    });
  });

  return Array.from(suppliers.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/**
 * Valida se um produto é candidato a consolidação
 * (tem nome, concentração e apresentação similares)
 */
export function isConsolidationCandidate(product1: ProductSignature, product2: ProductSignature): boolean {
  // Ambos devem ter nome
  if (!product1.name || !product2.name) return false;

  const sig1 = generateProductSignature(product1);
  const sig2 = generateProductSignature(product2);

  // Score de similaridade deve ser >= 0.7 (70%)
  const similarity = calculateProductSimilarity(sig1, sig2);
  return similarity >= 0.7;
}

/**
 * Detecta novos fornecedores em uma importação comparada com produtos existentes
 */
export function detectNewSuppliers(
  existingProducts: ConsolidatedProduct[],
  newProducts: Array<{ supplierId: number; supplierName: string }>
): Array<{ id: number; name: string }> {
  const existingSupplierIds = new Set<number>();

  existingProducts.forEach((product) => {
    product.pricesBySupplier.forEach((_, supplierId) => {
      existingSupplierIds.add(supplierId);
    });
  });

  const newSuppliers: Array<{ id: number; name: string }> = [];
  const seenIds = new Set<number>();

  newProducts.forEach(({ supplierId, supplierName }) => {
    if (!existingSupplierIds.has(supplierId) && !seenIds.has(supplierId)) {
      newSuppliers.push({ id: supplierId, name: supplierName });
      seenIds.add(supplierId);
    }
  });

  return newSuppliers;
}
