import { z } from "zod";
import { editorProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  calculateMaxPurchasePrice,
  getQuotationDecisionSummary,
  getQuotationMatchMemory,
  rankSuppliersForProduct,
  resolveQuotationIntelligently,
} from "../services/quotationDecisionService";

/**
 * Camada de decisão da cotação: memória operacional, ranking de fornecedores,
 * risco, limite máximo de compra e resolução assistida em lote.
 */
export const quotationDecisionRouter = router({
  summary: protectedProcedure
    .input(z.object({ quotationId: z.number().int().positive() }))
    .query(({ input }) => getQuotationDecisionSummary(input.quotationId)),

  matchMemory: protectedProcedure
    .input(z.object({ quotationId: z.number().int().positive() }))
    .query(({ input }) => getQuotationMatchMemory(input.quotationId)),

  supplierRanking: protectedProcedure
    .input(z.object({ productId: z.number().int().positive() }))
    .query(({ input }) => rankSuppliersForProduct(input.productId)),

  maxPurchasePrice: protectedProcedure
    .input(z.object({
      targetSale: z.number().positive(),
      minMarginPercent: z.number().min(0).max(99.99),
      freightValue: z.number().nonnegative().optional(),
      taxValue: z.number().nonnegative().optional(),
    }))
    .query(({ input }) => calculateMaxPurchasePrice(input)),

  resolve: editorProcedure
    .input(z.object({ quotationId: z.number().int().positive() }))
    .mutation(({ input, ctx }) => resolveQuotationIntelligently(input.quotationId, ctx.user?.id ?? null)),
});
