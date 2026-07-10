/**
 * Barrel de acesso a dados - Domínio: Auditoria e Histórico de Preços.
 */
export {
  recordPriceHistory,
  getProductPriceHistory,
  getPriceHistory,
  getProductsWithPriceAlert,
  createMatchLog,
  getMatchLogsByAnalysis,
  createMatchFeedbackV2,
} from "../db";
