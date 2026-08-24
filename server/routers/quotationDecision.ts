import { z } from "zod";
import { editorProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  calculateMaxPurchasePrice,
  getQuotationDecisionSummary,
  getQuotationMatchMemory,
  rankSuppliersForProduct,
  resolveQuotationIntelligently,
} from "../services/quotationDecisionService";
import {
  getCommercialIntelligence,
  getCommercialProtection,
  getEnhancedSupplierScore,
  recordQuotationFeedback,
  refreshStaleQuotationPrices,
  runQuotationBulkAction,
} from "../services/quotationOptimizationService";
import {
  getQuotationTimeline,
  getSmartMarginSuggestions,
} from "../services/quotationInsightsService";

const feedbackKind = z.enum([
  "match_approved",
  "product_selected",
  "product_rejected",
  "supplier_selected",
  "supplier_rejected",
  "sale_adjusted",
]);

/** Camada de decisão, aprendizado e proteção comercial da cotação. */
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

  supplierScore: protectedProcedure
    .input(z.object({ productId: z.number().int().positive() }))
    .query(({ input }) => getEnhancedSupplierScore(input.productId)),

  maxPurchasePrice: protectedProcedure
    .input(z.object({
      targetSale: z.number().positive(),
      minMarginPercent: z.number().min(0).max(99.99),
      freightValue: z.number().nonnegative().optional(),
      taxValue: z.number().nonnegative().optional(),
    }))
    .query(({ input }) => calculateMaxPurchasePrice(input)),

  protection: protectedProcedure
    .input(z.object({ quotationId: z.number().int().positive() }))
    .query(({ input }) => getCommercialProtection(input.quotationId)),

  commercialIntelligence: protectedProcedure.query(() => getCommercialIntelligence()),

  timeline: protectedProcedure
    .input(z.object({ quotationId: z.number().int().positive() }))
    .query(({ input }) => getQuotationTimeline(input.quotationId)),

  smartMargins: protectedProcedure
    .input(z.object({ quotationId: z.number().int().positive() }))
    .query(({ input }) => getSmartMarginSuggestions(input.quotationId)),

  feedback: editorProcedure
    .input(z.object({
      quotationId: z.number().int().positive(),
      itemId: z.number().int().positive(),
      kind: feedbackKind,
      productId: z.number().int().positive().nullable().optional(),
      supplierId: z.number().int().positive().nullable().optional(),
      previousProductId: z.number().int().positive().nullable().optional(),
      previousSupplierId: z.number().int().positive().nullable().optional(),
      value: z.number().nullable().optional(),
      note: z.string().max(1000).nullable().optional(),
    }))
    .mutation(({ input, ctx }) => recordQuotationFeedback({ ...input, userId: ctx.user?.id ?? null })),

  refreshPrices: editorProcedure
    .input(z.object({ quotationId: z.number().int().positive() }))
    .mutation(({ input, ctx }) => refreshStaleQuotationPrices(input.quotationId, ctx.user?.id ?? null)),

  bulkAction: editorProcedure
    .input(z.object({
      quotationId: z.number().int().positive(),
      itemIds: z.array(z.number().int().positive()).max(500).default([]),
      action: z.enum(["approve_safe", "use_best_supplier", "apply_margin", "refresh_prices"]),
      value: z.number().optional(),
    }))
    .mutation(({ input, ctx }) => runQuotationBulkAction({ ...input, userId: ctx.user?.id ?? null })),

  resolve: editorProcedure
    .input(z.object({ quotationId: z.number().int().positive() }))
    .mutation(({ input, ctx }) => resolveQuotationIntelligently(input.quotationId, ctx.user?.id ?? null)),
});