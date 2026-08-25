export const CRITICAL_COVERAGE_MODULES = [
  "server/_core/trpc.ts",
  "server/_core/session.ts",
  "server/services/pricingSafety.ts",
  "server/services/precoUnificado.ts",
  "server/services/emailQuotationMatchingService.ts",
  "server/services/quotationAutoPipelineService.ts",
  "server/rag/search.ts",
  "server/utils/encryption.ts",
] as const;

export const CRITICAL_COVERAGE_TARGET = 90;
export const GENERAL_COVERAGE_TARGET = 80;
