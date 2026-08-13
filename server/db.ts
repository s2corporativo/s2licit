import { getDb, resetDb } from "./db/_client";



// Conexão/pool compartilhado: getDb/resetDb vivem em ./db/_client e são
// re-exportados aqui para preservar a API pública `from "../db"`.
export { getDb, resetDb };

// ─── Users → ./db/users ───
export * from "./db/users";
// ─── Categories → ./db/categories ───
export * from "./db/categories";
// ─── Suppliers → ./db/suppliers ───
export * from "./db/suppliers";
// ─── Products → ./db/products ───
export * from "./db/products";
// ─── Smart Search → ./db/smartSearch ───
export * from "./db/smartSearch";
// ─── Autocomplete → ./db/autocomplete ───
export * from "./db/autocomplete";
// ─── Equivalence Groups → ./db/equivalenceGroups ───
export * from "./db/equivalenceGroups";
// ─── Import Logs → ./db/importLogs ───────────────────────────────────────────
export * from "./db/importLogs";

// ─── Dashboard Stats → ./db/dashboard ───
export * from "./db/dashboard";
// ─── Bulk Update Products → ./db/bulkUpdateProducts ───
export * from "./db/bulkUpdateProducts";
// ─── Company Settings → ./db/companySettings ───
export * from "./db/companySettings";
// ─── Requesting Orgs → ./db/requestingOrgs ──────────────────────────────────
export * from "./db/requestingOrgs";

// ─── Proposals → ./db/proposals ───
export * from "./db/proposals";
// ─── Financial + Freight → ./db/financial ───
export * from "./db/financial";
// (getExpiringProposals → ./db/proposals)
// ─── Base Mestre de Produtos → ./db/masterProducts ───
export * from "./db/masterProducts";
// ─── Fuzzy Matching → ./db/fuzzyMatching ───
export * from "./db/fuzzyMatching";
// ─── Similares por Composição → ./db/similarProducts ───
export * from "./db/similarProducts";
// ─── Landed Cost e Histórico → ./db/landedCost ───
export * from "./db/landedCost";
// ─── Image Management → ./db/images ───
export * from "./db/images";
// ─── Auto-Generate Equivalence → ./db/autoEquivalence ───
export * from "./db/autoEquivalence";
// ─── Sugestão de Produtos → ./db/productSuggestions ───
export * from "./db/productSuggestions";
// ─── Detecção de Duplicatas na Importação → ./db/importDuplicates ───
export * from "./db/importDuplicates";
// ─── Sinônimos → ./db/synonyms ───────────────────────────────────────────────
export * from "./db/synonyms";

// ── Templates de Proposta → ./db/proposalTemplates ────────────────────────────
export * from "./db/proposalTemplates";

// ─── Rentabilidade por Categoria → ./db/categoryProfitability ───
export * from "./db/categoryProfitability";
// ─── Match Feedback → ./db/matchFeedback ───
export * from "./db/matchFeedback";
// ─── Detecção e Fusão de Duplicatas → ./db/duplicateMerge ───
export * from "./db/duplicateMerge";
// ─── Preços por Fornecedor → ./db/supplierPrices ───
export * from "./db/supplierPrices";
// ─── Match Logs → ./db/matchLogs ───
export * from "./db/matchLogs";
// ─── Relações entre Produtos → ./db/productRelations ─────────────────────────
export * from "./db/productRelations";