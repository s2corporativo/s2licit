/**
 * Barrel de acesso a dados - Domínio: Contratos pós-licitação e Financeiro.
 * Reexporta queries financeiras e de contrato do server/db.ts.
 */
export {
  listFinancialEntries,
  createFinancialEntry,
  updateFinancialEntry,
  deleteFinancialEntry,
  getFinancialSummary,
  getProposalFinancialStats,
  getFreightReport,
  getDashboardStats,
  getProductsPerCategory,
  getCompanySettings,
  upsertCompanySettings,
} from "../db";
