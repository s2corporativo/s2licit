/**
 * Barrel de acesso a dados - Domínio: Enriquecimento e Fuzzy Match.
 */
export {
  fuzzyMatchProductInMaster,
  enrichImportRow,
  previewImportRowsFuzzy,
  getSimilarProductsByIngredient,
  getCheaperAlternatives,
  calcLandedCost,
  listProductsWithLandedCost,
  searchProductsByName,
  previewEquivalenceGroups,
  applyEquivalenceGroups,
  getEquivalenceStats,
  suggestProductsFromList,
  checkDuplicatesInRows,
  mergeProductFromRow,
  findDuplicateGroups,
  mergeProductGroup,
} from "../db";
