import { levenshteinSimilarity } from "../matching/productMatcher";

/**
 * Calcula similaridade entre duas strings (0-1), case-insensitive.
 * Usa Levenshtein distance normalizada — delega para
 * matching/productMatcher.ts#levenshteinSimilarity, antes uma cópia
 * paralela do mesmo algoritmo (achado do inventário: "4 implementações
 * divergentes de fuzzy matching"). Mantido só o pré-processamento
 * (lowercase/trim) e o guard de string vazia que este chamador precisa,
 * verificado sem mudança de comportamento pelos testes existentes.
 */
export function calculateStringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  return levenshteinSimilarity(str1.toLowerCase().trim(), str2.toLowerCase().trim());
}

export interface MasterProductMatch {
  id: number;
  name: string;
  ean?: string | null;
  codigoMapa?: string | null;
  concentration?: string | null;
  presentation?: string | null;
  manufacturer?: string | null;
}

export interface ProductMatchResult {
  masterProductId: number;
  matchType: "ean" | "mapa" | "name_concentration_presentation" | "name_similarity";
  similarity: number;
  masterProduct: MasterProductMatch;
}

/**
 * Encontra Master Product correspondente para um produto importado
 * Prioridade: EAN > MAPA > Nome + Concentração + Apresentação > Similaridade de Nome
 */
export async function matchProductToMaster(
  productData: {
    name: string;
    ean?: string | null;
    codigoMapa?: string | null;
    concentration?: string | null;
    presentation?: string | null;
    manufacturer?: string | null;
  },
  masterProductsList: MasterProductMatch[],
  minSimilarity: number = 0.7
): Promise<ProductMatchResult | null> {
  if (!productData.name || masterProductsList.length === 0) return null;

  // 1. Tentar match por EAN (mais preciso)
  if (productData.ean) {
    const masterByEan = masterProductsList.find(m => m.ean === productData.ean);
    if (masterByEan) {
      return {
        masterProductId: masterByEan.id,
        matchType: "ean",
        similarity: 1,
        masterProduct: masterByEan,
      };
    }
  }

  // 2. Tentar match por MAPA (código regulatório)
  if (productData.codigoMapa) {
    const masterByMapa = masterProductsList.find(m => m.codigoMapa === productData.codigoMapa);
    if (masterByMapa) {
      return {
        masterProductId: masterByMapa.id,
        matchType: "mapa",
        similarity: 1,
        masterProduct: masterByMapa,
      };
    }
  }

  // 3. Tentar match por Nome + Concentração + Apresentação
  if (productData.concentration && productData.presentation) {
    const masterByNameConcentrationPresentation = masterProductsList.find(
      m =>
        m.name.toLowerCase().includes(productData.name.toLowerCase()) &&
        m.concentration === productData.concentration &&
        m.presentation === productData.presentation
    );

    if (masterByNameConcentrationPresentation) {
      return {
        masterProductId: masterByNameConcentrationPresentation.id,
        matchType: "name_concentration_presentation",
        similarity: 1,
        masterProduct: masterByNameConcentrationPresentation,
      };
    }
  }

  // 4. Tentar match por similaridade de nome (fuzzy match)
  let bestMatch: ProductMatchResult | null = null;
  let bestSimilarity = minSimilarity;

  for (const master of masterProductsList) {
    const similarity = calculateStringSimilarity(productData.name, master.name);

    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = {
        masterProductId: master.id,
        matchType: "name_similarity",
        similarity,
        masterProduct: master,
      };
    }
  }

  return bestMatch;
}

/**
 * Encontra todos os Master Products similares a um produto
 */
export async function findSimilarMasterProducts(
  productData: {
    name: string;
    concentration?: string | null;
    presentation?: string | null;
  },
  masterProductsList: MasterProductMatch[],
  minSimilarity: number = 0.6,
  limit: number = 5
): Promise<ProductMatchResult[]> {
  const matches: ProductMatchResult[] = [];

  for (const master of masterProductsList) {
    const similarity = calculateStringSimilarity(productData.name, master.name);

    if (similarity >= minSimilarity) {
      matches.push({
        masterProductId: master.id,
        matchType: "name_similarity",
        similarity,
        masterProduct: master,
      });
    }
  }

  // Ordenar por similaridade (descending)
  matches.sort((a, b) => b.similarity - a.similarity);

  return matches.slice(0, limit);
}

/**
 * Estatísticas de matching
 */
export interface MatchingStats {
  totalProducts: number;
  matchedByEan: number;
  matchedByMapa: number;
  matchedByNameConcentrationPresentation: number;
  matchedByNameSimilarity: number;
  unmatched: number;
  averageSimilarity: number;
}

/**
 * Calcula estatísticas de matching para um lote de produtos
 */
export async function calculateMatchingStats(
  productsList: Array<{
    name: string;
    ean?: string | null;
    codigoMapa?: string | null;
    concentration?: string | null;
    presentation?: string | null;
  }>,
  masterProductsList: MasterProductMatch[]
): Promise<MatchingStats> {
  const stats: MatchingStats = {
    totalProducts: productsList.length,
    matchedByEan: 0,
    matchedByMapa: 0,
    matchedByNameConcentrationPresentation: 0,
    matchedByNameSimilarity: 0,
    unmatched: 0,
    averageSimilarity: 0,
  };

  let totalSimilarity = 0;
  let matchCount = 0;

  for (const product of productsList) {
    const match = await matchProductToMaster(product, masterProductsList);

    if (match) {
      matchCount++;
      totalSimilarity += match.similarity;

      switch (match.matchType) {
        case "ean":
          stats.matchedByEan++;
          break;
        case "mapa":
          stats.matchedByMapa++;
          break;
        case "name_concentration_presentation":
          stats.matchedByNameConcentrationPresentation++;
          break;
        case "name_similarity":
          stats.matchedByNameSimilarity++;
          break;
      }
    } else {
      stats.unmatched++;
    }
  }

  if (matchCount > 0) {
    stats.averageSimilarity = totalSimilarity / matchCount;
  }

  return stats;
}

/**
 * Agrupa produtos por Master Product
 */
export interface ProductGrouping {
  masterProductId: number;
  masterProduct: MasterProductMatch;
  products: Array<{
    name: string;
    ean?: string | null;
    codigoMapa?: string | null;
    concentration?: string | null;
    presentation?: string | null;
    manufacturer?: string | null;
    matchType: string;
    similarity: number;
  }>;
}

/**
 * Agrupa um lote de produtos por Master Product correspondente
 */
export async function groupProductsByMaster(
  productsList: Array<{
    name: string;
    ean?: string | null;
    codigoMapa?: string | null;
    concentration?: string | null;
    presentation?: string | null;
    manufacturer?: string | null;
  }>,
  masterProductsList: MasterProductMatch[]
): Promise<ProductGrouping[]> {
  const groupings: Map<number, ProductGrouping> = new Map();

  for (const product of productsList) {
    const match = await matchProductToMaster(product, masterProductsList);

    if (match) {
      if (!groupings.has(match.masterProductId)) {
        groupings.set(match.masterProductId, {
          masterProductId: match.masterProductId,
          masterProduct: match.masterProduct,
          products: [],
        });
      }

      groupings.get(match.masterProductId)!.products.push({
        ...product,
        matchType: match.matchType,
        similarity: match.similarity,
      });
    }
  }

  return Array.from(groupings.values());
}
